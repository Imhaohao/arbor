/**
 * ElevenLabs Music specialist — the missing middle of the media pipeline.
 *
 * The short-form DAG went creative_brief -> generate_video -> edit_video, so a
 * generated clip arrived at the editor with no soundtrack and the editor had to
 * either ship it silent or fake sound design. This node supplies real audio.
 *
 * Contract from the official docs (elevenlabs.io/docs/api-reference/music/compose):
 *   POST /v1/music
 *   header  xi-api-key: <key>
 *   body    { prompt, music_length_ms, model_id, force_instrumental, output_format }
 *
 * Two differences from the other media specialists that shape this file:
 *
 *   1. It is SYNCHRONOUS. Unlike Higgsfield's submit/poll job model, /v1/music
 *      returns the encoded audio in the response body, so there is no request_id
 *      to poll and no job table to reconcile.
 *   2. It returns BYTES, not a hosted URL. They are written to the same
 *      public-directory convention the explainer renderer uses, and the returned
 *      reference is a real path on disk — never a fabricated CDN link.
 *
 * Copyright guard: the API rejects prompts naming an artist, band, or copyrighted
 * lyrics with a `bad_prompt` error carrying a suggested rewrite. That suggestion is
 * surfaced verbatim rather than swallowed, because silently retrying with a
 * mangled prompt would hand back music the user did not ask for.
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

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
const MUSIC_ENDPOINT = "v1/music";
/** Cheapest authenticated GET that proves the key without spending credits. */
const USER_ENDPOINT = "v1/user";
/** music_v1 | music_v2. v2 is the better model; v1 is still the API default. */
const DEFAULT_MODEL_ID = "music_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

/** API-enforced bounds on music_length_ms. */
export const MIN_MUSIC_MS = 3_000;
export const MAX_MUSIC_MS = 600_000;
/** Default bed length when the brief names no duration. */
export const DEFAULT_MUSIC_MS = 30_000;

const REQUEST_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 10_000;

export const ELEVENLABS_MUSIC_CONFIG: SpecialistConfig = {
  agent_id: "elevenlabs-music",
  display_name: "ElevenLabs Music",
  sponsor: "ElevenLabs",
  // Concrete and audio-specific on purpose. The measured routing audit found the
  // catalog full of boilerplate capability text ("edit photos / organize images")
  // shared byte-identically by up to 40 agents, which matches everything and
  // therefore discriminates nothing.
  capabilities: [
    "generate original background music from a text prompt",
    "compose soundtrack for video",
    "instrumental music bed",
    "royalty free music generation",
    "match music to video mood and pacing",
    "sound design audio track",
  ],
  system_prompt:
    "You compose original music with ElevenLabs. Given a creative brief or a " +
    "video description, write a music prompt naming genre, mood, instrumentation " +
    "and energy arc, then render it at the requested duration. Never name a real " +
    "artist or band.",
  cost_baseline: 0.4,
  starting_reputation: 0.55,
  one_liner:
    "Composes an original instrumental soundtrack for a video brief via the ElevenLabs Music API.",
  tier: "real",
  homepage_url: "https://elevenlabs.io/music-api",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Accepts ElevenLabs' own env name plus an Arbor-prefixed alias. */
export function elevenlabsApiKey(): string | undefined {
  return (
    env("ELEVENLABS_API_KEY") ?? env("XI_API_KEY") ?? env("ARBOR_ELEVENLABS_API_KEY")
  );
}

export function elevenlabsMissingEnv(): string[] {
  return elevenlabsApiKey() ? [] : ["ELEVENLABS_API_KEY"];
}

function headers(apiKey: string): Record<string, string> {
  return { "xi-api-key": apiKey, "content-type": "application/json" };
}

/** Where rendered audio lands. Mirrors the explainer renderer's convention. */
export function musicOutputDir(): string {
  return resolve(
    env("ARBOR_MUSIC_OUTPUT_DIR") ?? join(process.cwd(), "public", "music"),
  );
}

/** Public URL for a rendered file, or undefined when written outside `public/`. */
export function musicPublicUrl(id: string, filename: string): string | undefined {
  return env("ARBOR_MUSIC_OUTPUT_DIR") ? undefined : `/music/${id}/${filename}`;
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

// Up to 6 digits so millisecond values ("5000 ms") match; \d{1,3} would backtrack
// into "000 ms" and silently parse as 0.
const DURATION_RE =
  /(\d{1,6})\s*(ms|millisecond|s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b/i;

/**
 * Pull a target duration out of the brief, clamped to the API's accepted range.
 * Lexical only — bidding stays free and deterministic, with no model call.
 */
export function extractMusicLengthMs(prompt: string): number {
  const match = DURATION_RE.exec(prompt);
  if (!match) return DEFAULT_MUSIC_MS;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MUSIC_MS;
  const unit = match[2].toLowerCase();
  const ms = unit.startsWith("ms") || unit.startsWith("milli")
    ? value
    : unit.startsWith("m")
      ? value * 60_000
      : value * 1_000;
  return Math.max(MIN_MUSIC_MS, Math.min(MAX_MUSIC_MS, ms));
}

const MUSIC_INTENT_RE =
  /\b(music|soundtrack|score|audio|song|track|jingle|theme|sound\s*design|background\s*(music|audio)|bgm|instrumental)\b/i;

/** True when the brief plausibly asks for music. */
export function isMusicBrief(prompt: string, taskType?: string): boolean {
  return MUSIC_INTENT_RE.test(`${taskType ?? ""} ${prompt}`);
}

/**
 * Turn a video/creative brief into a music prompt.
 *
 * Deliberately strips any artist or band reference: the API rejects those with a
 * `bad_prompt` error, so removing them up front avoids a wasted round trip.
 */
export function buildMusicPrompt(prompt: string): string {
  const brief = prompt.trim().replace(/\s+/g, " ").slice(0, 600);
  const stripped = brief
    .replace(/^\s*(make|create|generate|produce|compose|write)\s+(me\s+)?(a|an|some)\s+/i, "")
    .replace(/^\s*(music|soundtrack|song|track)\s+(for|about|to\s+match)\s+/i, "")
    .replace(/\b(in\s+the\s+style\s+of|like|sounds?\s+like)\s+[^.,;]+/gi, "")
    .trim();
  return (
    `Original instrumental score for: ${stripped || brief}. ` +
    `Cohesive arrangement with a clear energy arc, mixed to sit under narration. ` +
    `No vocals, no lyrics, no resemblance to any existing artist or recording.`
  );
}

interface BadPromptBody {
  detail?: { status?: string; message?: string; composition_plan_suggestion?: unknown };
  composition_plan_suggestion?: unknown;
  message?: string;
}

/** Raised when ElevenLabs rejects a prompt on copyright grounds. */
export class MusicPromptRejectedError extends Error {
  constructor(
    message: string,
    readonly suggestion?: string,
  ) {
    super(message);
    this.name = "MusicPromptRejectedError";
  }
}

/**
 * Compose one track. Returns the encoded audio bytes plus the prompt actually
 * sent, so the caller can record exactly what produced the asset.
 */
export async function composeMusic(args: {
  prompt: string;
  musicLengthMs: number;
  apiKey: string;
  forceInstrumental?: boolean;
  modelId?: string;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetchWithTimeout(
    `${ELEVENLABS_BASE_URL}/${MUSIC_ENDPOINT}`,
    {
      method: "POST",
      headers: headers(args.apiKey),
      body: JSON.stringify({
        prompt: args.prompt,
        music_length_ms: Math.max(
          MIN_MUSIC_MS,
          Math.min(MAX_MUSIC_MS, args.musicLengthMs),
        ),
        model_id: args.modelId ?? env("ARBOR_MUSIC_MODEL_ID") ?? DEFAULT_MODEL_ID,
        // A soundtrack sits under narration; vocals fight the voiceover.
        force_instrumental: args.forceInstrumental ?? true,
        output_format: DEFAULT_OUTPUT_FORMAT,
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    if (response.status === 400) {
      let parsed: BadPromptBody | undefined;
      try {
        parsed = JSON.parse(raw) as BadPromptBody;
      } catch {
        parsed = undefined;
      }
      const status = parsed?.detail?.status ?? "";
      if (status.includes("bad_prompt") || status.includes("bad_composition_plan")) {
        const suggestion =
          typeof parsed?.detail?.composition_plan_suggestion === "string"
            ? parsed.detail.composition_plan_suggestion
            : typeof parsed?.composition_plan_suggestion === "string"
              ? parsed.composition_plan_suggestion
              : undefined;
        throw new MusicPromptRejectedError(
          parsed?.detail?.message ??
            "ElevenLabs rejected the music prompt (likely a copyrighted artist or lyric reference).",
          suggestion,
        );
      }
    }
    throw new Error(
      `ElevenLabs music request failed ${response.status}: ${raw.slice(0, 240)}`,
    );
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("ElevenLabs returned an empty audio body");
  }
  return {
    bytes: buffer,
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

/** Filesystem-safe id for the output folder. */
export function musicRunId(prompt: string, nowMs: number): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${nowMs}-${slug || "track"}`;
}

export const elevenlabsMusic: SpecialistRunner = {
  config: ELEVENLABS_MUSIC_CONFIG,

  /**
   * Liveness probe against the free `/v1/user` route — proves the key works
   * without spending generation credits. With no key this reports `demo_lane`
   * rather than `fail`: the service is not known to be broken, Arbor simply
   * cannot reach it.
   */
  async probe(): Promise<ProbeResult> {
    const apiKey = elevenlabsApiKey();
    const startedAt = Date.now();
    if (!apiKey) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: `ElevenLabs credentials are not configured (${elevenlabsMissingEnv().join(", ")}); no live call attempted.`,
      };
    }
    try {
      const response = await fetchWithTimeout(
        `${ELEVENLABS_BASE_URL}/${USER_ENDPOINT}`,
        { method: "GET", headers: { "xi-api-key": apiKey } },
        PROBE_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `ElevenLabs rejected the API key (${response.status})`,
        };
      }
      if (response.status >= 500) {
        return {
          status: "fail",
          duration_ms,
          error_message: `ElevenLabs server error ${response.status}`,
        };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `authenticated /${USER_ENDPOINT} returned ${response.status}`,
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
    if (!elevenlabsApiKey()) {
      return decline(
        `ElevenLabs credentials are not configured (${elevenlabsMissingEnv().join(", ")}) — real music generation is unavailable.`,
      );
    }
    if (!isMusicBrief(prompt, taskType)) {
      return decline(
        "elevenlabs-music composes audio; this brief does not ask for music, a soundtrack, or sound design.",
      );
    }
    const lengthMs = extractMusicLengthMs(prompt);
    return {
      bid_price: ELEVENLABS_MUSIC_CONFIG.cost_baseline,
      capability_claim:
        `I will call the live ElevenLabs Music API (POST /${MUSIC_ENDPOINT}) to ` +
        `compose an original instrumental track of about ` +
        `${Math.round(lengthMs / 1000)}s and return the rendered audio file.`,
      // Batch operation, roughly proportional to track length.
      estimated_seconds: Math.max(20, Math.round(lengthMs / 1000) + 20),
    };
  },

  async execute(prompt, taskType): Promise<SpecialistExecuteResult> {
    const apiKey = elevenlabsApiKey();
    if (!apiKey) {
      throw new Error(
        `ElevenLabs credentials are not set (${elevenlabsMissingEnv().join(", ")}); elevenlabs-music cannot execute.`,
      );
    }
    const musicPrompt = buildMusicPrompt(prompt);
    const musicLengthMs = extractMusicLengthMs(prompt);

    let rendered: { bytes: Uint8Array; contentType: string };
    try {
      rendered = await composeMusic({ prompt: musicPrompt, musicLengthMs, apiKey });
    } catch (error) {
      if (error instanceof MusicPromptRejectedError) {
        // Surface the provider's own suggestion instead of silently retrying with
        // a rewritten prompt — that would return music nobody asked for.
        throw new Error(
          `ElevenLabs rejected the music prompt: ${error.message}` +
            (error.suggestion ? ` Suggested alternative: ${error.suggestion}` : ""),
        );
      }
      throw error;
    }

    const id = musicRunId(prompt, Date.now());
    const filename = "soundtrack.mp3";
    const dir = join(musicOutputDir(), id);
    await mkdir(dir, { recursive: true });
    const path = join(dir, filename);
    await writeFile(path, rendered.bytes);
    const publicUrl = musicPublicUrl(id, filename);

    const output: SpecialistOutput = [
      "# ElevenLabs Music",
      "",
      `**Track:** ${publicUrl ?? path}`,
      `**Duration:** ~${Math.round(musicLengthMs / 1000)}s`,
      `**Format:** ${rendered.contentType} (${rendered.bytes.byteLength} bytes)`,
      "",
      "## Prompt sent",
      "",
      musicPrompt,
      "",
      `Model \`${env("ARBOR_MUSIC_MODEL_ID") ?? DEFAULT_MODEL_ID}\`, instrumental, ` +
        `rendered by a live ElevenLabs Music API call.`,
      publicUrl
        ? ""
        : "\nWritten outside `public/`, so the path above is a filesystem path, not a served URL.",
    ]
      .filter(Boolean)
      .join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(ELEVENLABS_MUSIC_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${ELEVENLABS_BASE_URL}/${MUSIC_ENDPOINT}`,
      successful_tool_call_count: 1,
    };

    void taskType;
    return { output, provenance };
  },
};
