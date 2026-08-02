/**
 * OpusClip specialist — real REST client against api.opus.pro.
 *
 * OpusClip is built for a different job than Reap/Descript: it repurposes a
 * LONGER source video into multiple short vertical clips (AI-selected
 * highlights), not for polishing a single already-short video. It is included
 * because the user asked for every editing tool in the list to be wired, but
 * its bid() scope check reflects that real difference — it does not claim to
 * do captioning/pacing polish, only long-to-short repurposing.
 *
 * Contract verified two ways: (1) official docs at help.opus.pro, and (2) live
 * unauthenticated probes — POST /api/clip-projects and GET /api/exportable-clips
 * both return real status codes (401 / 400) against api.opus.pro, while the
 * `POST /api/projects` and `GET /api/clips` paths from a stale doc index both
 * 404'd, confirming clip-projects/exportable-clips are the real, current paths.
 *
 * Honesty contract (CLAUDE.md): with no API key this specialist declines to bid
 * and `execute` throws. It never emits a placeholder video URL. The response's
 * project-id field name is not confirmed by any source, so the id is parsed
 * defensively across the plausible names OpusClip's docs used elsewhere
 * (id / projectId / project_id); if none is present execute fails loudly
 * instead of guessing.
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

const OPUS_BASE_URL = "https://api.opus.pro/api";
const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 300_000;

export const OPUSCLIP_EDITOR_CONFIG: SpecialistConfig = {
  agent_id: "opusclip-editor",
  display_name: "OpusClip",
  sponsor: "OpusClip",
  capabilities: [
    "repurpose long video into short clips",
    "AI highlight detection",
    "long-to-short video clipping",
    "vertical reframe",
    "viral clip curation",
  ],
  system_prompt:
    "You take a long-form source video and repurpose it into short, curated, " +
    "vertically-reframed highlight clips.",
  cost_baseline: 0.8,
  starting_reputation: 0.5,
  one_liner:
    "Repurposes a long-form source video into AI-curated short vertical clips via OpusClip.",
  tier: "real",
  homepage_url: "https://www.opus.pro",
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function opusApiKey(): string | undefined {
  return env("OPUSCLIP_API_KEY");
}

function headers(apiKey: string): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
  };
  const orgId = env("OPUSCLIP_ORG_ID");
  if (orgId) h["x-opus-org-id"] = orgId;
  return h;
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
  project_id?: string;
}

/** The project-id field name is unconfirmed by any source; accept whichever
 * of the plausible keys is present rather than guessing one. */
export function extractProjectId(body: CreateProjectResponse): string | undefined {
  return body.id ?? body.projectId ?? body.project_id;
}

interface ExportableClip {
  id?: string;
  title?: string;
  durationMs?: number;
  uriForExport?: string;
  uriForPreview?: string;
}

interface ExportableClipsResponse {
  clips?: ExportableClip[];
  data?: ExportableClip[];
}

export function extractClips(body: ExportableClipsResponse): ExportableClip[] {
  return body.clips ?? body.data ?? [];
}

async function submitClipProject(videoUrl: string, apiKey: string): Promise<string> {
  const response = await fetchWithTimeout(
    `${OPUS_BASE_URL}/clip-projects`,
    {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        videoUrl,
        curationPref: { model: "ClipBasic" },
        renderPref: { layoutAspectRatio: "portrait" },
      }),
    },
    SUBMIT_TIMEOUT_MS,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpusClip create returned ${response.status}: ${text.slice(0, 240)}`);
  }
  const body = (await response.json()) as CreateProjectResponse;
  const projectId = extractProjectId(body);
  if (!projectId) throw new Error("OpusClip create returned no recognizable project id");
  return projectId;
}

/** OpusClip's exportable-clips endpoint returns clips once they exist — an
 * empty array means "still processing", so this polls until the array is
 * non-empty or the deadline passes. */
async function pollForClips(
  projectId: string,
  apiKey: string,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ExportableClip[]> {
  const deadline = now() + MAX_POLL_MS;
  while (now() < deadline) {
    const response = await fetchWithTimeout(
      `${OPUS_BASE_URL}/exportable-clips?q=findByProjectId&projectId=${encodeURIComponent(projectId)}`,
      { method: "GET", headers: headers(apiKey) },
      POLL_TIMEOUT_MS,
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpusClip exportable-clips ${response.status} for ${projectId}: ${text.slice(0, 200)}`,
      );
    }
    const body = (await response.json()) as ExportableClipsResponse;
    const clips = extractClips(body);
    if (clips.length > 0) return clips;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`OpusClip project ${projectId} produced no clips within ${MAX_POLL_MS}ms`);
}

// Deliberately NOT the bare word "clip" -- "this short clip" (an already-short
// asset that needs polish, not repurposing) contains "clip" and must decline.
const REPURPOSE_INTENT = [
  "repurpose",
  "highlight",
  "clip from",
  "clip out",
  "long video",
  "long-form",
  "podcast",
  "webinar",
  "shorts from",
];

export function isRepurposeBrief(prompt: string, taskType: string): boolean {
  const haystack = `${prompt} ${taskType}`.toLowerCase();
  return REPURPOSE_INTENT.some((token) => haystack.includes(token));
}

export function extractSourceUrl(prompt: string): string | undefined {
  const match = prompt.match(/https?:\/\/\S+\.(mp4|mov|webm|m3u8)\b/i);
  return match?.[0];
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

export const opusclipEditor: SpecialistRunner = {
  config: OPUSCLIP_EDITOR_CONFIG,

  async probe(): Promise<ProbeResult> {
    const apiKey = opusApiKey();
    const startedAt = Date.now();
    if (!apiKey) {
      return {
        status: "demo_lane",
        duration_ms: 0,
        error_message: "OPUSCLIP_API_KEY is not configured; no live call attempted.",
      };
    }
    try {
      const response = await fetchWithTimeout(
        `${OPUS_BASE_URL}/exportable-clips?q=findByProjectId&projectId=00000000`,
        { method: "GET", headers: headers(apiKey) },
        POLL_TIMEOUT_MS,
      );
      const duration_ms = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          status: "fail",
          duration_ms,
          error_message: `OpusClip rejected the API key (${response.status})`,
        };
      }
      if (response.status >= 500) {
        return { status: "fail", duration_ms, error_message: `OpusClip server error ${response.status}` };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `authenticated exportable-clips probe returned ${response.status}`,
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
    if (!opusApiKey()) {
      return decline("OPUSCLIP_API_KEY is not configured — real repurposing is unavailable.");
    }
    if (!isRepurposeBrief(prompt, taskType)) {
      return decline(
        "opusclip-editor repurposes a LONG source video into short curated clips; " +
          "it does not caption or polish an already-short video. This brief does not " +
          "describe a long-to-short repurposing task.",
      );
    }
    return {
      bid_price: OPUSCLIP_EDITOR_CONFIG.cost_baseline,
      capability_claim:
        "I will call the live OpusClip API to curate and vertically reframe " +
        "highlight clips from the source video and return the exported clip URLs.",
      estimated_seconds: 180,
    };
  },

  async execute(prompt): Promise<SpecialistExecuteResult> {
    const apiKey = opusApiKey();
    if (!apiKey) {
      throw new Error("OPUSCLIP_API_KEY is not set; opusclip-editor cannot execute without credentials.");
    }
    const sourceUrl = extractSourceUrl(prompt);
    if (!sourceUrl) {
      throw new Error(
        "opusclip-editor requires a source video URL in the prompt; none was found.",
      );
    }
    const projectId = await submitClipProject(sourceUrl, apiKey);
    const clips = await pollForClips(projectId, apiKey);
    const withUrls = clips.filter((c) => c.uriForExport);
    if (withUrls.length === 0) {
      throw new Error(`OpusClip project ${projectId} returned clips with no export URL`);
    }

    const output: SpecialistOutput = [
      "# OpusClip",
      "",
      `**Source:** ${sourceUrl}`,
      `**OpusClip project:** ${projectId}`,
      `**Clips produced:** ${withUrls.length}`,
      "",
      "## Clips",
      "",
      ...withUrls.map(
        (c, i) => `${i + 1}. ${c.title ?? "Untitled clip"} — ${c.uriForExport}`,
      ),
    ].join("\n");

    const provenance: SpecialistProvenance = {
      tier: toPublicTier(OPUSCLIP_EDITOR_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      endpoint: `${OPUS_BASE_URL}/clip-projects`,
      external_task_id: projectId,
      successful_tool_call_count: 1,
      tool_call_ids: [projectId],
    };

    return { output, provenance };
  },
};

export const __testing = { submitClipProject, pollForClips };
