/**
 * Higgsfield video specialist — real REST client against platform.higgsfield.ai.
 *
 * Higgsfield's DoP family is IMAGE-to-video, not text-to-video, so a bare text
 * brief needs two stages:
 *
 *   1. text -> image   `flux-pro/kontext/max/text-to-image`
 *   2. image -> video  `/v1/image2video/dop`
 *
 * Both are asynchronous: the POST returns a request_id and the job is polled at
 * `/requests/{request_id}/status` until it terminates. Contract taken from the
 * official SDK (github.com/higgsfield-ai/higgsfield-js, v2 client) rather than
 * guessed: `Authorization: Key KEY_ID:KEY_SECRET`, results at
 * `jobs[0].results.raw.url`.
 *
 * No new npm dependency — the SDK is a thin wrapper over these two calls and the
 * repo's other API specialists all use plain fetch.
 *
 * Honesty contract (CLAUDE.md): with no credentials this specialist DECLINES to
 * bid and `execute` throws. It never emits a placeholder video URL, and
 * provenance only claims `live_tools_called: true` when both stages returned a
 * real asset URL.
 */
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

const HIGGSFIELD_BASE_URL = "https://platform.higgsfield.ai";
const TEXT_TO_IMAGE_ENDPOINT = "flux-pro/kontext/max/text-to-image";
const IMAGE_TO_VIDEO_ENDPOINT = "v1/image2video/dop";
/** dop-lite | dop-turbo | dop-preview. Turbo is the cost/quality middle. */
const DEFAULT_DOP_MODEL = "dop-turbo";
const DEFAULT_ASPECT_RATIO = "9:16";
const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 240_000;

export const HIGGSFIELD_VIDEO_CONFIG: SpecialistConfig = {
  agent_id: "higgsfield-video",
  display_name: "Higgsfield Video",
  sponsor: "Higgsfield AI",
  // Kept concrete and video-specific: these strings are what semantic routing
  // matches a brief against, and the existing catalog is full of boilerplate
  // ("edit photos / organize images") that matches everything and means nothing.
  capabilities: [
    "generate video from text prompt",
    "text to video",
    "image to video animation",
    "cinematic camera motion",
    "short form vertical video",
    "b-roll and social clips",
  ],
  system_prompt:
    "You generate short cinematic videos with Higgsfield. Given a creative " +
    "brief, produce a vivid single-frame image prompt, then animate it with a " +
    "camera-motion prompt. Return the rendered asset URLs.",
  cost_baseline: 1.4,
  starting_reputation: 0.55,
  one_liner:
    "Turns a text brief into a short cinematic video via Higgsfield Soul/flux plus the DoP motion model.",
  tier: "real",
  homepage_url: "https://higgsfield.ai",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Credentials in the SDK's `KEY_ID:KEY_SECRET` form. Accepts the SDK's own env
 * names so an existing Higgsfield setup works unchanged, plus an Arbor-prefixed
 * alias for consistency with the other providers.
 */
export function higgsfieldCredentials(): string | undefined {
  const combined =
    env("HIGGSFIELD_CREDENTIALS") ?? env("HF_CREDENTIALS");
  if (combined && combined.includes(":")) return combined;
  const key = env("HIGGSFIELD_API_KEY") ?? env("HF_API_KEY");
  const secret = env("HIGGSFIELD_API_SECRET") ?? env("HF_API_SECRET");
  if (key && secret) return `${key}:${secret}`;
  return undefined;
}

export function higgsfieldMissingEnv(): string[] {
  return higgsfieldCredentials()
    ? []
    : ["HIGGSFIELD_CREDENTIALS (or HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET)"];
}

function headers(credentials: string): Record<string, string> {
  return {
    authorization: `Key ${credentials}`,
    "content-type": "application/json",
    accept: "application/json",
  };
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

interface SubmitResponse {
  request_id?: string;
  id?: string;
}

interface JobResults {
  raw?: { url?: string };
  min?: { url?: string };
}

interface StatusResponse {
  status?: string;
  request_id?: string;
  jobs?: Array<{ status?: string; results?: JobResults }>;
  error?: string;
  detail?: string;
}

const TERMINAL_OK = new Set(["completed", "succeeded", "success"]);
const TERMINAL_BAD = new Set(["failed", "error", "canceled", "cancelled", "nsfw"]);

/** First asset URL on a finished job set, if the payload carries one. */
export function extractAssetUrl(body: StatusResponse): string | undefined {
  for (const job of body.jobs ?? []) {
    const url = job.results?.raw?.url ?? job.results?.min?.url;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return undefined;
}

export function isTerminalStatus(status: string | undefined): "ok" | "bad" | "pending" {
  const s = (status ?? "").toLowerCase();
  if (TERMINAL_OK.has(s)) return "ok";
  if (TERMINAL_BAD.has(s)) return "bad";
  return "pending";
}

async function submit(
  endpoint: string,
  input: Record<string, unknown>,
  credentials: string,
): Promise<string> {
  const url = `${HIGGSFIELD_BASE_URL}/${endpoint.replace(/^\/+/, "")}`;
  const response = await fetchWithTimeout(
    url,
    { method: "POST", headers: headers(credentials), body: JSON.stringify({ input }) },
    SUBMIT_TIMEOUT_MS,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Higgsfield ${endpoint} returned ${response.status}: ${text.slice(0, 240)}`,
    );
  }
  const body = (await response.json()) as SubmitResponse;
  const id = body.request_id ?? body.id;
  if (!id) {
    throw new Error(`Higgsfield ${endpoint} returned no request_id`);
  }
  return id;
}

async function poll(
  requestId: string,
  credentials: string,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string> {
  const deadline = now() + MAX_POLL_MS;
  const url = `${HIGGSFIELD_BASE_URL}/requests/${requestId}/status`;
  let last = "unknown";
  while (now() < deadline) {
    const response = await fetchWithTimeout(
      url,
      { method: "GET", headers: headers(credentials) },
      POLL_TIMEOUT_MS,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Higgsfield status ${response.status} for ${requestId}: ${text.slice(0, 200)}`,
      );
    }
    const body = (await response.json()) as StatusResponse;
    last = body.status ?? body.jobs?.[0]?.status ?? "unknown";
    const state = isTerminalStatus(last);
    if (state === "bad") {
      throw new Error(
        `Higgsfield job ${requestId} ended as "${last}": ${
          body.error ?? body.detail ?? "no reason given"
        }`,
      );
    }
    if (state === "ok") {
      const asset = extractAssetUrl(body);
      if (!asset) {
        throw new Error(
          `Higgsfield job ${requestId} completed without an asset URL`,
        );
      }
      return asset;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Higgsfield job ${requestId} did not finish within ${MAX_POLL_MS}ms (last status "${last}")`,
  );
}

const VIDEO_INTENT = [
  "video",
  "animate",
  "animation",
  "clip",
  "reel",
  "b-roll",
  "broll",
  "footage",
  "cinematic",
  "montage",
  "trailer",
  "short",
];

/** Only bid when the brief actually asks for moving image. */
export function isVideoBrief(prompt: string, taskType: string): boolean {
  const haystack = `${prompt} ${taskType}`.toLowerCase();
  return VIDEO_INTENT.some((token) => haystack.includes(token));
}

/**
 * Split one brief into a still-frame prompt and a camera-motion prompt. Purely
 * lexical — no model call, so bidding stays free and deterministic.
 */
export function buildStagePrompts(prompt: string): {
  imagePrompt: string;
  motionPrompt: string;
} {
  const brief = prompt.trim().replace(/\s+/g, " ").slice(0, 600);
  const stripped = brief
    .replace(/^\s*(make|create|generate|produce|render)\s+(me\s+)?(a|an)\s+/i, "")
    .replace(/^\s*video\s+(about|of|showing)\s+/i, "");
  return {
    imagePrompt:
      `${stripped}. Photorealistic cinematic still, shallow depth of field, ` +
      `natural lighting, expressive subject, high detail.`,
    motionPrompt:
      `Cinematic camera move that brings this moment to life: ${stripped}. ` +
      `Smooth parallax, subject stays in frame.`,
  };
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

export const higgsfieldVideo: SpecialistRunner = {
  config: HIGGSFIELD_VIDEO_CONFIG,

  /**
   * Liveness probe. Credentials are required to reach any authenticated route,
   * so with none configured this reports `demo_lane` rather than `fail` — the
   * service is not known to be broken, Arbor simply cannot reach it.
   */
  async probe(): Promise<ProbeResult> {
    const credentials = higgsfieldCredentials();
    const startedAt = Date.now();
    if (!credentials) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: `Higgsfield credentials are not configured (${higgsfieldMissingEnv().join(", ")}); no live call attempted.`,
      };
    }
    try {
      // Any authenticated GET is enough to prove the credential pair works; a
      // bogus request id must come back 401/403 when auth fails and 404 when it
      // succeeds, which distinguishes the two without spending a generation.
      const response = await fetchWithTimeout(
        `${HIGGSFIELD_BASE_URL}/requests/00000000-0000-0000-0000-000000000000/status`,
        { method: "GET", headers: headers(credentials) },
        POLL_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Higgsfield rejected the credential pair (${response.status})`,
        };
      }
      if (response.status >= 500) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Higgsfield server error ${response.status}`,
        };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `authenticated status probe returned ${response.status}`,
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
    if (!higgsfieldCredentials()) {
      return decline(
        `Higgsfield credentials are not configured (${higgsfieldMissingEnv().join(", ")}) — real video generation is unavailable.`,
      );
    }
    if (!isVideoBrief(prompt, taskType)) {
      return decline(
        "higgsfield-video generates moving image; this brief does not ask for a video, animation, or clip.",
      );
    }
    return {
      bid_price: HIGGSFIELD_VIDEO_CONFIG.cost_baseline,
      capability_claim:
        "I will call the live Higgsfield API: flux-pro text-to-image for the key " +
        "frame, then the DoP motion model to animate it, and return the rendered " +
        "video URL.",
      // Two chained async generations; DoP turbo dominates the wall clock.
      estimated_seconds: 150,
    };
  },

  async execute(prompt): Promise<SpecialistExecuteResult> {
    const credentials = higgsfieldCredentials();
    if (!credentials) {
      throw new Error(
        `Higgsfield credentials are not set (${higgsfieldMissingEnv().join(", ")}); higgsfield-video cannot execute.`,
      );
    }
    const { imagePrompt, motionPrompt } = buildStagePrompts(prompt);

    // Stage 1: text -> key frame.
    const imageRequestId = await submit(
      TEXT_TO_IMAGE_ENDPOINT,
      {
        prompt: imagePrompt,
        aspect_ratio: DEFAULT_ASPECT_RATIO,
        safety_tolerance: 2,
      },
      credentials,
    );
    const imageUrl = await poll(imageRequestId, credentials);

    // Stage 2: key frame -> video.
    const videoRequestId = await submit(
      IMAGE_TO_VIDEO_ENDPOINT,
      {
        model: env("HIGGSFIELD_DOP_MODEL") ?? DEFAULT_DOP_MODEL,
        prompt: motionPrompt,
        input_images: [{ type: "image_url", image_url: imageUrl }],
      },
      credentials,
    );
    const videoUrl = await poll(videoRequestId, credentials);

    const output: SpecialistOutput = [
      "# Higgsfield Video",
      "",
      `**Video:** ${videoUrl}`,
      `**Key frame:** ${imageUrl}`,
      "",
      "## Pipeline",
      "",
      `1. \`${TEXT_TO_IMAGE_ENDPOINT}\` — request \`${imageRequestId}\``,
      `   - prompt: ${imagePrompt}`,
      `2. \`${IMAGE_TO_VIDEO_ENDPOINT}\` (${env("HIGGSFIELD_DOP_MODEL") ?? DEFAULT_DOP_MODEL}) — request \`${videoRequestId}\``,
      `   - motion: ${motionPrompt}`,
      "",
      `Aspect ratio ${DEFAULT_ASPECT_RATIO}. Both stages were live Higgsfield API calls.`,
    ].join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(HIGGSFIELD_VIDEO_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${HIGGSFIELD_BASE_URL}/${IMAGE_TO_VIDEO_ENDPOINT}`,
      external_task_id: videoRequestId,
      successful_tool_call_count: 2,
      tool_call_ids: [imageRequestId, videoRequestId],
    };

    return { output, provenance };
  },
};

/** Exposed for tests: poll with injected clock/sleep so no test waits on wall time. */
export const __testing = { poll, submit };
