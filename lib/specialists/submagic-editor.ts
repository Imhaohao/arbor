/**
 * Submagic specialist — real REST client against api.submagic.co.
 *
 * Single async job: submit a source video with a template, poll the project by
 * id, get back captions + zooms + b-roll + music applied. Contract verified two
 * ways: (1) official docs at docs.submagic.co, and (2) live unauthenticated
 * probes against every path below — GET /v1/languages, POST /v1/projects, and
 * GET /v1/projects/{id} all return HTTP 401 (auth required) against the real
 * host, confirming both the base URL and the polling path pattern are real
 * (the docs describe project creation but never showed the status-check path
 * explicitly; the live probe is what confirms GET /v1/projects/{id} exists).
 *
 * Auth differs from the other three editors: Submagic uses `x-api-key`, not a
 * Bearer Authorization header.
 *
 * Honesty contract (CLAUDE.md): with no API key this specialist declines to bid
 * and `execute` throws. It never emits a placeholder video URL. The completed-
 * project response shape (status values, output URL field) is not documented
 * anywhere found, so both are parsed defensively across plausible names; if
 * none match, execute fails loudly instead of guessing a completion.
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

const SUBMAGIC_BASE_URL = "https://api.submagic.co/v1";
const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 4_000;
const MAX_POLL_MS = 240_000;
const DEFAULT_TEMPLATE = "Hormozi 2";

export const SUBMAGIC_EDITOR_CONFIG: SpecialistConfig = {
  agent_id: "submagic-editor",
  display_name: "Submagic",
  sponsor: "Submagic",
  capabilities: [
    "animated word-by-word captions",
    "magic zooms and b-roll",
    "background music for short video",
    "hook clip generation",
    "short form video polish",
  ],
  system_prompt:
    "You take an already-generated short vertical video and apply Submagic's " +
    "animated captions, zoom effects, b-roll, and background music.",
  cost_baseline: 0.65,
  starting_reputation: 0.55,
  one_liner:
    "Applies animated captions, zooms, b-roll, and music to a short video via the Submagic API.",
  tier: "real",
  homepage_url: "https://www.submagic.co",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function submagicApiKey(): string | undefined {
  return env("SUBMAGIC_API_KEY");
}

function headers(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
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

interface CreateProjectResponse {
  id?: string;
  projectId?: string;
}

interface ProjectStatusResponse {
  id?: string;
  status?: string;
  state?: string;
  videoUrl?: string;
  outputUrl?: string;
  downloadUrl?: string;
  exportUrl?: string;
  error?: string;
}

const TERMINAL_OK = new Set(["completed", "done", "ready", "success", "finished"]);
const TERMINAL_BAD = new Set(["failed", "error", "canceled", "cancelled"]);

export function isTerminalStatus(status: string | undefined): "ok" | "bad" | "pending" {
  const s = (status ?? "").toLowerCase();
  if (TERMINAL_OK.has(s)) return "ok";
  if (TERMINAL_BAD.has(s)) return "bad";
  return "pending";
}

/** The output-URL field name is unconfirmed by any source; accept whichever of
 * the plausible keys is present rather than guessing one. */
export function extractOutputUrl(body: ProjectStatusResponse): string | undefined {
  const url = body.outputUrl ?? body.videoUrl ?? body.downloadUrl ?? body.exportUrl;
  return typeof url === "string" && url.startsWith("http") ? url : undefined;
}

async function submitProject(
  videoUrl: string,
  apiKey: string,
): Promise<string> {
  const response = await fetchWithTimeout(
    `${SUBMAGIC_BASE_URL}/projects`,
    {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        title: "arbor-short-form-edit",
        language: "en",
        videoUrl,
        templateName: env("SUBMAGIC_TEMPLATE") ?? DEFAULT_TEMPLATE,
        magicZooms: true,
        magicBrolls: true,
      }),
    },
    SUBMIT_TIMEOUT_MS,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Submagic create returned ${response.status}: ${text.slice(0, 240)}`);
  }
  const body = (await response.json()) as CreateProjectResponse;
  const id = body.id ?? body.projectId;
  if (!id) throw new Error("Submagic create returned no recognizable project id");
  return id;
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
    const response = await fetchWithTimeout(
      `${SUBMAGIC_BASE_URL}/projects/${encodeURIComponent(projectId)}`,
      { method: "GET", headers: headers(apiKey) },
      POLL_TIMEOUT_MS,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Submagic status ${response.status} for ${projectId}: ${text.slice(0, 200)}`);
    }
    const body = (await response.json()) as ProjectStatusResponse;
    last = body.status ?? body.state ?? "unknown";
    const state = isTerminalStatus(last);
    if (state === "bad") {
      throw new Error(`Submagic project ${projectId} ended as "${last}": ${body.error ?? "no reason given"}`);
    }
    if (state === "ok") {
      const url = extractOutputUrl(body);
      if (!url) throw new Error(`Submagic project ${projectId} completed without a recognizable output URL`);
      return url;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Submagic project ${projectId} did not finish within ${MAX_POLL_MS}ms (last status "${last}")`);
}

const EDIT_INTENT = [
  "caption",
  "subtitle",
  "b-roll",
  "broll",
  "zoom",
  "hook",
  "edit",
  "polish",
  "video",
];

export function isEditBrief(prompt: string, taskType: string): boolean {
  const haystack = `${prompt} ${taskType}`.toLowerCase();
  return EDIT_INTENT.some((token) => haystack.includes(token));
}

export function extractSourceUrl(prompt: string): string | undefined {
  const match = prompt.match(/https?:\/\/\S+\.(mp4|mov|webm|m3u8)\b/i);
  return match?.[0];
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

export const submagicEditor: SpecialistRunner = {
  config: SUBMAGIC_EDITOR_CONFIG,

  async probe(): Promise<ProbeResult> {
    const apiKey = submagicApiKey();
    const startedAt = Date.now();
    if (!apiKey) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: "SUBMAGIC_API_KEY is not configured; no live call attempted.",
      };
    }
    try {
      const response = await fetchWithTimeout(
        `${SUBMAGIC_BASE_URL}/languages`,
        { method: "GET", headers: headers(apiKey) },
        POLL_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Submagic rejected the API key (${response.status})`,
        };
      }
      if (response.status >= 500) {
        return { status: "fail", duration_ms, error_message: `Submagic server error ${response.status}` };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `languages endpoint returned ${response.status}`,
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
    if (!submagicApiKey()) {
      return decline("SUBMAGIC_API_KEY is not configured — real editing is unavailable.");
    }
    if (!isEditBrief(prompt, taskType)) {
      return decline(
        "submagic-editor adds captions, zooms, b-roll, and music to an existing video; this brief is not a video-editing task.",
      );
    }
    return {
      bid_price: SUBMAGIC_EDITOR_CONFIG.cost_baseline,
      capability_claim:
        "I will call the live Submagic API to apply animated captions, zoom " +
        "effects, b-roll, and music, and return the rendered video URL.",
      estimated_seconds: 90,
    };
  },

  async execute(prompt): Promise<SpecialistExecuteResult> {
    const apiKey = submagicApiKey();
    if (!apiKey) {
      throw new Error("SUBMAGIC_API_KEY is not set; submagic-editor cannot execute without credentials.");
    }
    const sourceUrl = extractSourceUrl(prompt);
    if (!sourceUrl) {
      throw new Error(
        "submagic-editor requires a source video URL in the prompt; none was found.",
      );
    }
    const projectId = await submitProject(sourceUrl, apiKey);
    const outputUrl = await poll(projectId, apiKey);

    const output: SpecialistOutput = [
      "# Submagic",
      "",
      `**Edited video:** ${outputUrl}`,
      `**Source:** ${sourceUrl}`,
      `**Submagic project:** ${projectId}`,
      `**Template:** ${env("SUBMAGIC_TEMPLATE") ?? DEFAULT_TEMPLATE}`,
      "",
      "Animated captions, zooms, and b-roll were applied via a live Submagic API call.",
    ].join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(SUBMAGIC_EDITOR_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${SUBMAGIC_BASE_URL}/projects`,
      external_task_id: projectId,
      successful_tool_call_count: 1,
      tool_call_ids: [projectId],
    };

    return { output, provenance };
  },
};

export const __testing = { submitProject, poll };
