/**
 * Fish Audio voice specialist — narration and voiceover for the media pipeline.
 *
 * The DAG had music (`elevenlabs-music`) but no dedicated voice node, so spoken
 * narration fell back to whatever the renderer could reach locally (macOS `say`).
 * This is the real voiceover leg, and it also supports voice cloning, which the
 * other audio providers in the roster do not.
 *
 * Contract from the official docs (docs.fish.audio, /api-reference/endpoint/
 * openapi-v1/text-to-speech):
 *
 *   POST https://api.fish.audio/v1/tts
 *   header  Authorization: Bearer <token>
 *   header  model: s1 | s2-pro | s2.1-pro | s2.1-pro-free
 *   body    { text, reference_id?, format, mp3_bitrate, latency, prosody }
 *
 * TWO CONTRACT DETAILS THAT ARE EASY TO GET WRONG:
 *
 *   1. `model` is an HTTP HEADER, not a body field. Putting it in the body
 *      silently yields the default engine instead of the one you asked for.
 *   2. `reference_id` selects the VOICE, `model` selects the ENGINE. On
 *      self-hosted Fish Speech servers `--reference_id` also means voice, which
 *      is a common source of confusion when porting code between the two.
 *
 * Do not point this at fishaudio.org — that is a separate, unofficial service
 * with a different path (`/api/open/v1/speech/tts`) and different parameter
 * names (`voiceId`, `modelId`). The official host is api.fish.audio.
 *
 * Honesty contract (CLAUDE.md): with no API key this specialist DECLINES to bid
 * and `execute` throws. It never emits a placeholder audio URL, and provenance
 * claims `live_tools_called: true` only after real audio bytes were written.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  BidPayload,
  DeclineDecision,
  ProbeResult,
  SpecialistConfig,
  SpecialistExecuteResult,
  SpecialistOutput,
  SpecialistProvenance,
  SpecialistRunner,
} from "../types";
import { toPublicTier } from "./tiers";

const FISH_BASE_URL = "https://api.fish.audio";
const TTS_ENDPOINT = "v1/tts";
/** Authenticated, non-generating route used only to validate the credential. */
const MODEL_LIST_ENDPOINT = "model";

export const FISH_MODELS = ["s1", "s2-pro", "s2.1-pro", "s2.1-pro-free"] as const;
export type FishModel = (typeof FISH_MODELS)[number];
/** The API's own default tier. */
const DEFAULT_FISH_MODEL: FishModel = "s2.1-pro-free";

const REQUEST_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 10_000;

/** Billing is per character ($15/M at time of writing), so cap runaway input. */
export const MAX_NARRATION_CHARS = 8_000;

export const FISH_AUDIO_VOICE_CONFIG: SpecialistConfig = {
  agent_id: "fish-audio-voice",
  display_name: "Fish Audio Voice",
  sponsor: "Fish Audio",
  // Concrete and voice-specific. The routing audit found the catalog full of
  // boilerplate capability text shared byte-identically across dozens of agents,
  // which matches every query and therefore discriminates on none.
  capabilities: [
    "text to speech narration",
    "voiceover for video",
    "clone a voice from a reference sample",
    "multi speaker dialogue audio",
    "spoken script audio track",
    "narrate a creative brief",
  ],
  system_prompt:
    "You produce spoken narration with Fish Audio. Given a script or a creative " +
    "brief, write natural spoken lines and render them to audio. Keep sentences " +
    "short enough to breathe. Never impersonate a real, identifiable person.",
  cost_baseline: 0.3,
  starting_reputation: 0.55,
  one_liner:
    "Renders narration and voiceover audio via the Fish Audio TTS API, including cloned voices.",
  tier: "real",
  homepage_url: "https://fish.audio",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Accepts the provider's common env names plus an Arbor-prefixed alias. */
export function fishAudioApiKey(): string | undefined {
  return (
    env("FISH_AUDIO_API_KEY") ??
    env("FISH_API_KEY") ??
    env("ARBOR_FISH_AUDIO_API_KEY")
  );
}

export function fishAudioMissingEnv(): string[] {
  return fishAudioApiKey() ? [] : ["FISH_AUDIO_API_KEY"];
}

/** Engine selection, validated against the documented enum. */
export function fishAudioModel(): FishModel {
  const requested = env("ARBOR_FISH_AUDIO_MODEL");
  return (FISH_MODELS as readonly string[]).includes(requested ?? "")
    ? (requested as FishModel)
    : DEFAULT_FISH_MODEL;
}

/** Optional voice model id. Absent means the API's default voice. */
export function fishAudioReferenceId(): string | undefined {
  return env("ARBOR_FISH_AUDIO_REFERENCE_ID");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const VOICE_INTENT_RE =
  /\b(narrat\w*|voice\s*over|voiceover|voice|speech|speak|spoken|tts|text[-\s]to[-\s]speech|read\s+(this|it|aloud)|dub|dialogue|audiobook)\b/i;

/** True when the brief plausibly asks for spoken audio. */
export function isVoiceBrief(prompt: string, taskType?: string): boolean {
  return VOICE_INTENT_RE.test(`${taskType ?? ""} ${prompt}`);
}

/**
 * Reduce a brief to the text that should actually be spoken.
 *
 * Strips the instruction wrapper ("narrate the following:", "read this aloud")
 * so the voice does not literally say the request. Clamped to
 * MAX_NARRATION_CHARS because billing is per character.
 */
export function buildNarrationText(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  const INSTRUCTION_HEAD =
    /^(please\s+)?(narrate|voice|read|say|speak|dub|record)\b/i;

  let cleaned = normalized;
  if (INSTRUCTION_HEAD.test(normalized)) {
    // An instruction verb followed by a colon means everything after the colon
    // is the payload. Matching the colon rather than each qualifier avoids
    // leaving fragments behind ("Read this aloud:" -> "aloud: ...").
    const colon = normalized.indexOf(":");
    if (colon >= 0 && colon <= 80) {
      cleaned = normalized.slice(colon + 1).trim();
    } else {
      cleaned = normalized
        .replace(
          /^(please\s+)?(narrate|voice|read|say|speak|dub|record)\s+(me\s+)?(the\s+)?(following|this|it|that)?\s*(out\s+loud|aloud)?\s*/i,
          "",
        )
        .trim();
    }
  } else {
    cleaned = normalized
      .replace(
        /^(write|create|make|generate|produce)\s+(me\s+)?(a\s+)?(voice\s*over|narration|script)\s+(for|about|of)\s*/i,
        "",
      )
      .trim();
  }

  // Never return empty: an empty body is a 422 from the API.
  const text = cleaned || normalized;
  return text.slice(0, MAX_NARRATION_CHARS);
}

/** Raised when Fish Audio rejects the request for billing reasons. */
export class FishAudioPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FishAudioPaymentError";
  }
}

/**
 * Render one narration take. Returns the encoded audio bytes.
 *
 * `model` goes in the header per the API contract; sending it in the body is
 * accepted but silently ignored, which would leave you on the default engine.
 */
export async function synthesizeSpeech(args: {
  text: string;
  apiKey: string;
  model?: FishModel;
  referenceId?: string;
}): Promise<{ bytes: Uint8Array; contentType: string; model: FishModel }> {
  const model = args.model ?? fishAudioModel();
  const body: Record<string, unknown> = {
    text: args.text,
    format: "mp3",
    mp3_bitrate: 192,
    normalize: true,
    latency: "normal",
  };
  const referenceId = args.referenceId ?? fishAudioReferenceId();
  if (referenceId) body.reference_id = referenceId;

  const response = await fetchWithTimeout(
    `${FISH_BASE_URL}/${TTS_ENDPOINT}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        // Header, not body — see the file header note.
        model,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const raw = (await response.text().catch(() => "")).slice(0, 300);
    if (response.status === 402) {
      throw new FishAudioPaymentError(
        `Fish Audio returned 402 (payment required): ${raw}`,
      );
    }
    throw new Error(`Fish Audio TTS failed ${response.status}: ${raw}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("Fish Audio returned an empty audio body");
  }
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
    model,
  };
}

/** Where rendered narration lands. Mirrors the explainer/music convention. */
export function voiceOutputDir(): string {
  return resolve(
    env("ARBOR_VOICE_OUTPUT_DIR") ?? join(process.cwd(), "public", "voice"),
  );
}

/** Public URL for a rendered file, or undefined when written outside `public/`. */
export function voicePublicUrl(id: string, filename: string): string | undefined {
  return env("ARBOR_VOICE_OUTPUT_DIR") ? undefined : `/voice/${id}/${filename}`;
}

/** Filesystem-safe id for the output folder. */
export function voiceRunId(prompt: string, nowMs: number): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${nowMs}-${slug || "narration"}`;
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

export const fishAudioVoice: SpecialistRunner = {
  config: FISH_AUDIO_VOICE_CONFIG,

  /**
   * Liveness probe against the authenticated model-list route, which does not
   * synthesize and therefore costs nothing. With no key this reports
   * `demo_lane` rather than `fail`: the service is not known to be broken,
   * Arbor simply cannot reach it.
   */
  async probe(): Promise<ProbeResult> {
    const apiKey = fishAudioApiKey();
    const startedAt = Date.now();
    if (!apiKey) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: `Fish Audio credentials are not configured (${fishAudioMissingEnv().join(", ")}); no live call attempted.`,
      };
    }
    try {
      const response = await fetchWithTimeout(
        `${FISH_BASE_URL}/${MODEL_LIST_ENDPOINT}?page_size=1`,
        { method: "GET", headers: { authorization: `Bearer ${apiKey}` } },
        PROBE_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Fish Audio rejected the API key (${response.status})`,
        };
      }
      if (response.status === 402) {
        return {
          status: "fail",
          duration_ms,
          error_message: "Fish Audio account has no credit (402 payment required)",
        };
      }
      if (response.status >= 500) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Fish Audio server error ${response.status}`,
        };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `authenticated /${MODEL_LIST_ENDPOINT} returned ${response.status}`,
      };
    } catch (error) {
      return {
        status: "fail",
        duration_ms: Date.now() - startedAt,
        error_message: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async bid(prompt, taskType): Promise<BidPayload | DeclineDecision> {
    if (!fishAudioApiKey()) {
      return decline(
        `Fish Audio credentials are not configured (${fishAudioMissingEnv().join(", ")}) — real speech synthesis is unavailable.`,
      );
    }
    if (!isVoiceBrief(prompt, taskType)) {
      return decline(
        "fish-audio-voice renders spoken audio; this brief does not ask for narration, voiceover, or speech.",
      );
    }
    const chars = buildNarrationText(prompt).length;
    return {
      bid_price: FISH_AUDIO_VOICE_CONFIG.cost_baseline,
      capability_claim:
        `I will call the live Fish Audio API (POST /${TTS_ENDPOINT}, engine ` +
        `${fishAudioModel()}) to render roughly ${chars} characters of narration ` +
        `and return the audio file.`,
      // Streamed synthesis; roughly proportional to script length.
      estimated_seconds: Math.max(10, Math.round(chars / 120) + 8),
    };
  },

  async execute(prompt, taskType): Promise<SpecialistExecuteResult> {
    const apiKey = fishAudioApiKey();
    if (!apiKey) {
      throw new Error(
        `Fish Audio credentials are not set (${fishAudioMissingEnv().join(", ")}); fish-audio-voice cannot execute.`,
      );
    }
    const text = buildNarrationText(prompt);
    if (!text) throw new Error("fish-audio-voice received no text to speak");

    const rendered = await synthesizeSpeech({ text, apiKey });

    const id = voiceRunId(prompt, Date.now());
    const filename = "narration.mp3";
    const dir = join(voiceOutputDir(), id);
    await mkdir(dir, { recursive: true });
    const path = join(dir, filename);
    await writeFile(path, rendered.bytes);
    const publicUrl = voicePublicUrl(id, filename);
    const referenceId = fishAudioReferenceId();

    const output: SpecialistOutput = [
      "# Fish Audio Narration",
      "",
      `**Audio:** ${publicUrl ?? path}`,
      `**Engine:** \`${rendered.model}\`${referenceId ? ` · voice \`${referenceId}\`` : " · default voice"}`,
      `**Format:** ${rendered.contentType} (${rendered.bytes.byteLength} bytes, ${text.length} characters)`,
      "",
      "## Spoken text",
      "",
      text,
      "",
      "Rendered by a live Fish Audio API call.",
      publicUrl
        ? ""
        : "\nWritten outside `public/`, so the path above is a filesystem path, not a served URL.",
    ]
      .filter(Boolean)
      .join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(FISH_AUDIO_VOICE_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${FISH_BASE_URL}/${TTS_ENDPOINT}`,
      successful_tool_call_count: 1,
    };

    void taskType;
    return { output, provenance };
  },
};
