/**
 * Descript video-editing specialist — real REST client against descriptapi.com.
 *
 * Three chained async jobs: import the source video into a project, trigger an
 * Underlord AI edit ("remove filler words, add captions"), then publish/export
 * to get a downloadable file. Contract verified two ways: (1) official docs at
 * docs.descriptapi.com and help.descript.com, and (2) live unauthenticated
 * probes — POST /v1/jobs/import/project_media, POST /v1/jobs/agent,
 * GET /v1/jobs/{id} all return HTTP 401 against the real host, confirming the
 * paths exist (a wrong path, e.g. /v1/users/me, returned 404 in the same probe).
 *
 * Auth: personal API token, self-service via Descript Settings > API tokens,
 * scoped to one Drive. Sent as a Bearer token.
 *
 * Honesty contract (CLAUDE.md): with no token this specialist declines to bid
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

const DESCRIPT_BASE_URL = "https://descriptapi.com/v1";
const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 300_000;
const DEFAULT_EDIT_PROMPT =
  "Remove filler words, apply Studio Sound, and add burned-in captions.";

export const DESCRIPT_EDITOR_CONFIG: SpecialistConfig = {
  agent_id: "descript-editor",
  display_name: "Descript Editor",
  sponsor: "Descript",
  capabilities: [
    "remove filler words from video",
    "studio sound audio cleanup",
    "transcript-driven video editing",
    "auto captions",
    "podcast and talking-head editing",
  ],
  system_prompt:
    "You import a source video, run Descript's Underlord AI agent to clean up " +
    "audio and remove filler words, then export the finished file.",
  cost_baseline: 0.7,
  starting_reputation: 0.55,
  one_liner:
    "Imports a video, runs Descript's Underlord AI edit, and exports the finished file.",
  tier: "real",
  homepage_url: "https://www.descript.com",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function descriptApiToken(): string | undefined {
  return env("DESCRIPT_API_TOKEN");
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
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

interface JobSubmitResponse {
  job_id?: string;
  project_id?: string;
}

interface JobStatusResponse {
  job_id?: string;
  job_state?: string;
  project_id?: string;
  result?: {
    status?: string;
    download_url?: string;
    share_url?: string;
    agent_response?: string;
  };
}

async function submitJob(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<JobSubmitResponse> {
  const response = await fetchWithTimeout(
    `${DESCRIPT_BASE_URL}${path}`,
    { method: "POST", headers: headers(token), body: JSON.stringify(body) },
    SUBMIT_TIMEOUT_MS,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Descript ${path} returned ${response.status}: ${text.slice(0, 240)}`);
  }
  return (await response.json()) as JobSubmitResponse;
}

/** Poll one job to completion, returning its `result` payload. Throws on a
 * failed result rather than returning a partial/undefined success. */
async function pollJob(
  jobId: string,
  token: string,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<NonNullable<JobStatusResponse["result"]>> {
  const deadline = now() + MAX_POLL_MS;
  let last = "unknown";
  while (now() < deadline) {
    const response = await fetchWithTimeout(
      `${DESCRIPT_BASE_URL}/jobs/${encodeURIComponent(jobId)}`,
      { method: "GET", headers: headers(token) },
      POLL_TIMEOUT_MS,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Descript status ${response.status} for job ${jobId}: ${text.slice(0, 200)}`);
    }
    const body = (await response.json()) as JobStatusResponse;
    last = body.job_state ?? "unknown";
    if (last === "stopped") {
      if (body.result?.status && body.result.status !== "success") {
        throw new Error(
          `Descript job ${jobId} finished with status "${body.result.status}"`,
        );
      }
      if (!body.result) throw new Error(`Descript job ${jobId} stopped with no result`);
      return body.result;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Descript job ${jobId} did not finish within ${MAX_POLL_MS}ms (last state "${last}")`);
}

const EDIT_INTENT = [
  "filler word",
  "studio sound",
  "transcript",
  "podcast",
  "edit",
  "polish",
  "caption",
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

export const descriptEditor: SpecialistRunner = {
  config: DESCRIPT_EDITOR_CONFIG,

  async probe(): Promise<ProbeResult> {
    const token = descriptApiToken();
    const startedAt = Date.now();
    if (!token) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: "DESCRIPT_API_TOKEN is not configured; no live call attempted.",
      };
    }
    try {
      const response = await fetchWithTimeout(
        `${DESCRIPT_BASE_URL}/jobs/00000000-0000-0000-0000-000000000000`,
        { method: "GET", headers: headers(token) },
        POLL_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Descript rejected the API token (${response.status})`,
        };
      }
      if (response.status >= 500) {
        return { status: "fail", duration_ms, error_message: `Descript server error ${response.status}` };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `authenticated job-status probe returned ${response.status}`,
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
    if (!descriptApiToken()) {
      return decline("DESCRIPT_API_TOKEN is not configured — real editing is unavailable.");
    }
    if (!isEditBrief(prompt, taskType)) {
      return decline(
        "descript-editor cleans up audio and removes filler words on an existing video; this brief is not a video-editing task.",
      );
    }
    return {
      bid_price: DESCRIPT_EDITOR_CONFIG.cost_baseline,
      capability_claim:
        "I will import the source video, run Descript's Underlord AI edit " +
        "(filler-word removal, Studio Sound, captions), and export the finished file.",
      estimated_seconds: 180,
    };
  },

  async execute(prompt): Promise<SpecialistExecuteResult> {
    const token = descriptApiToken();
    if (!token) {
      throw new Error("DESCRIPT_API_TOKEN is not set; descript-editor cannot execute without credentials.");
    }
    const sourceUrl = extractSourceUrl(prompt);
    if (!sourceUrl) {
      throw new Error(
        "descript-editor requires a source video URL in the prompt; none was found.",
      );
    }

    const importJob = await submitJob(
      "/jobs/import/project_media",
      { media_url: sourceUrl },
      token,
    );
    if (!importJob.job_id) throw new Error("Descript import returned no job_id");
    const importResult = await pollJob(importJob.job_id, token);
    const projectId = importJob.project_id;
    if (!projectId) throw new Error("Descript import completed without a project_id");

    const agentJob = await submitJob(
      "/jobs/agent",
      { project_id: projectId, prompt: DEFAULT_EDIT_PROMPT },
      token,
    );
    if (!agentJob.job_id) throw new Error("Descript agent edit returned no job_id");
    const agentResult = await pollJob(agentJob.job_id, token);

    const publishJob = await submitJob(
      "/jobs/publish",
      { project_id: projectId, resolution: "1080p", access_level: "unlisted" },
      token,
    );
    if (!publishJob.job_id) throw new Error("Descript publish returned no job_id");
    const publishResult = await pollJob(publishJob.job_id, token);
    if (!publishResult.download_url) {
      throw new Error(`Descript project ${projectId} published without a download_url`);
    }

    const output: SpecialistOutput = [
      "# Descript Editor",
      "",
      `**Edited video:** ${publishResult.download_url}`,
      `**Source:** ${sourceUrl}`,
      `**Descript project:** ${projectId}`,
      "",
      `## Underlord edit applied`,
      "",
      agentResult.agent_response ?? DEFAULT_EDIT_PROMPT,
      "",
      importResult.share_url ? `Project preview: ${importResult.share_url}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(DESCRIPT_EDITOR_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${DESCRIPT_BASE_URL}/jobs/agent`,
      external_task_id: projectId,
      successful_tool_call_count: 3,
      tool_call_ids: [importJob.job_id, agentJob.job_id, publishJob.job_id],
    };

    return { output, provenance };
  },
};

export const __testing = { submitJob, pollJob };
