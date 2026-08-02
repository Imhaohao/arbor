/**
 * Reap video-editing specialist — real REST client against public.reap.video.
 *
 * Reap's caption/edit pipeline is a single async job: submit a source video URL,
 * poll project status, then fetch the rendered clip URL. Contract verified two
 * ways: (1) the official docs at docs.reap.video/api-reference/*.md, and (2)
 * live unauthenticated probes against every path below — each returns HTTP 401
 * (auth required), confirming the base URL and paths are real, not paraphrased.
 * `create-clips` (Reap's OTHER endpoint) is for repurposing long-form video into
 * multiple clips; `create-captions` is the one that matches this node's actual
 * job — captioning and polishing a single already-short video — so that is the
 * endpoint this specialist calls.
 *
 * Honesty contract (CLAUDE.md): with no API key this specialist declines to bid
 * and `execute` throws. It never emits a placeholder video URL.
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

const REAP_BASE_URL = "https://public.reap.video/api/v1/automation";
const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 240_000;

export const REAP_EDITOR_CONFIG: SpecialistConfig = {
  agent_id: "reap-editor",
  display_name: "Reap Editor",
  sponsor: "Reap",
  capabilities: [
    "add captions to video",
    "animated word-by-word captions",
    "caption styling and presets",
    "video subtitle generation",
    "short form video polish",
  ],
  system_prompt:
    "You take an already-generated short vertical video and add TikTok-style " +
    "animated captions, emoji highlights, and keyword emphasis. Return the " +
    "rendered video URL.",
  cost_baseline: 0.6,
  starting_reputation: 0.55,
  one_liner:
    "Adds animated captions and polish to a short video via the Reap automation API.",
  tier: "real",
  homepage_url: "https://reap.video",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function reapApiKey(): string | undefined {
  return env("REAP_API_KEY");
}

function headers(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
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

interface CreateCaptionsResponse {
  id?: string;
}

interface StatusResponse {
  status?: string;
  projectId?: string;
}

interface ClipsResponse {
  clips?: Array<{ clipUrl?: string; clipWithCaptionsUrl?: string }>;
}

const TERMINAL_OK = new Set(["completed"]);
const TERMINAL_BAD = new Set(["invalid", "expired", "failed", "error"]);

export function isTerminalStatus(status: string | undefined): "ok" | "bad" | "pending" {
  const s = (status ?? "").toLowerCase();
  if (TERMINAL_OK.has(s)) return "ok";
  if (TERMINAL_BAD.has(s)) return "bad";
  return "pending";
}

export function extractClipUrl(body: ClipsResponse): string | undefined {
  for (const clip of body.clips ?? []) {
    const url = clip.clipUrl ?? clip.clipWithCaptionsUrl;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return undefined;
}

async function submitCaptions(sourceUrl: string, apiKey: string): Promise<string> {
  const response = await fetchWithTimeout(
    `${REAP_BASE_URL}/create-captions`,
    {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        sourceUrl,
        enableEmojis: true,
        enableHighlights: true,
      }),
    },
    SUBMIT_TIMEOUT_MS,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Reap create-captions returned ${response.status}: ${text.slice(0, 240)}`);
  }
  const body = (await response.json()) as CreateCaptionsResponse;
  if (!body.id) throw new Error("Reap create-captions returned no project id");
  return body.id;
}

async function poll(
  projectId: string,
  apiKey: string,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string> {
  const deadline = now() + MAX_POLL_MS;
  let last = "unknown";
  while (now() < deadline) {
    const statusResponse = await fetchWithTimeout(
      `${REAP_BASE_URL}/get-project-status?projectId=${encodeURIComponent(projectId)}`,
      { method: "GET", headers: headers(apiKey) },
      POLL_TIMEOUT_MS,
    );
    if (!statusResponse.ok) {
      const text = await statusResponse.text().catch(() => "");
      throw new Error(
        `Reap status ${statusResponse.status} for ${projectId}: ${text.slice(0, 200)}`,
      );
    }
    const statusBody = (await statusResponse.json()) as StatusResponse;
    last = statusBody.status ?? "unknown";
    const state = isTerminalStatus(last);
    if (state === "bad") {
      throw new Error(`Reap project ${projectId} ended as "${last}"`);
    }
    if (state === "ok") {
      const clipsResponse = await fetchWithTimeout(
        `${REAP_BASE_URL}/get-project-clips?projectId=${encodeURIComponent(projectId)}`,
        { method: "GET", headers: headers(apiKey) },
        POLL_TIMEOUT_MS,
      );
      if (!clipsResponse.ok) {
        const text = await clipsResponse.text().catch(() => "");
        throw new Error(
          `Reap get-project-clips ${clipsResponse.status} for ${projectId}: ${text.slice(0, 200)}`,
        );
      }
      const clipsBody = (await clipsResponse.json()) as ClipsResponse;
      const url = extractClipUrl(clipsBody);
      if (!url) throw new Error(`Reap project ${projectId} completed without a clip URL`);
      return url;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Reap project ${projectId} did not finish within ${MAX_POLL_MS}ms (last status "${last}")`,
  );
}

const EDIT_INTENT = [
  "caption",
  "subtitle",
  "edit",
  "polish",
  "pacing",
  "cut",
  "trim",
  "video",
];

export function isEditBrief(prompt: string, taskType: string): boolean {
  const haystack = `${prompt} ${taskType}`.toLowerCase();
  return EDIT_INTENT.some((token) => haystack.includes(token));
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

export const reapEditor: SpecialistRunner = {
  config: REAP_EDITOR_CONFIG,

  async probe(): Promise<ProbeResult> {
    const apiKey = reapApiKey();
    const startedAt = Date.now();
    if (!apiKey) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: "REAP_API_KEY is not configured; no live call attempted.",
      };
    }
    try {
      const response = await fetchWithTimeout(
        `${REAP_BASE_URL}/get-all-presets`,
        { method: "GET", headers: headers(apiKey) },
        POLL_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Reap rejected the API key (${response.status})`,
        };
      }
      if (response.status >= 500) {
        return { status: "fail", duration_ms, error_message: `Reap server error ${response.status}` };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `get-all-presets returned ${response.status}`,
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
    if (!reapApiKey()) {
      return decline("REAP_API_KEY is not configured — real caption editing is unavailable.");
    }
    if (!isEditBrief(prompt, taskType)) {
      return decline(
        "reap-editor adds captions and polish to an existing video; this brief is not a video-editing task.",
      );
    }
    return {
      bid_price: REAP_EDITOR_CONFIG.cost_baseline,
      capability_claim:
        "I will call the live Reap create-captions API to add animated captions " +
        "and highlights to the source video and return the rendered URL.",
      estimated_seconds: 90,
    };
  },

  async execute(prompt): Promise<SpecialistExecuteResult> {
    const apiKey = reapApiKey();
    if (!apiKey) {
      throw new Error("REAP_API_KEY is not set; reap-editor cannot execute without credentials.");
    }
    const sourceUrl = extractSourceUrl(prompt);
    if (!sourceUrl) {
      throw new Error(
        "reap-editor requires a source video URL in the prompt or execution context; none was found.",
      );
    }
    const projectId = await submitCaptions(sourceUrl, apiKey);
    const clipUrl = await poll(projectId, apiKey);

    const output: SpecialistOutput = [
      "# Reap Editor",
      "",
      `**Edited video:** ${clipUrl}`,
      `**Source:** ${sourceUrl}`,
      `**Reap project:** ${projectId}`,
      "",
      "Animated captions and keyword highlights were applied via a live Reap API call.",
    ].join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(REAP_EDITOR_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${REAP_BASE_URL}/create-captions`,
      external_task_id: projectId,
      successful_tool_call_count: 1,
      tool_call_ids: [projectId],
    };

    return { output, provenance };
  },
};

/**
 * A source video URL parsed from the brief text. Hand-written specialists have
 * no tool-use loop, so — unlike the LLM-driven mcp-forwarding tier, which can
 * call media_resolve via arborWorkspace — the only channel available for a
 * predecessor artifact URL is the prompt string itself. If the DAG builder
 * wants this node to consume Higgsfield's output, it must embed that URL in
 * the node's prompt text; nothing here invents one.
 */
export function extractSourceUrl(prompt: string): string | undefined {
  const match = prompt.match(/https?:\/\/\S+\.(mp4|mov|webm|m3u8)\b/i);
  return match?.[0];
}

export const __testing = { submitCaptions, poll };
