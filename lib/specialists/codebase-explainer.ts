// Specialist: codebase-explainer (Arbor-owned "NotebookLM-style" lesson maker).
//
// Slice 1 of the codebase-explainer pipeline. NotebookLM has no public API and
// its Enterprise form only lives in Google Cloud / Vertex Agentspace (a second
// cloud + control plane we deliberately avoid — see azure-hive-control-plane
// notes), so we do NOT connect to NotebookLM. Instead this specialist builds the
// capability natively: repo/path context in -> a grounded, two-host lesson
// SCRIPT out, structured so later slices can render audio (Azure AI Speech) and
// video (Remotion) from the same turns.
//
// Honesty (AGENTS.md rule): this is Arbor's own model layer, not an external
// tool. It never claims live tools. Audio/video are gated behind
// ARBOR_EXPLAINER_AUDIO_ENABLED / ARBOR_EXPLAINER_VIDEO_ENABLED and, until those
// slices land + a Speech resource is configured, the deliverable states plainly
// that only the script was produced. It grounds strictly on the code context in
// the task prompt (upstream discovery/indexing is a separate concern).

import { callOpenAI, callOpenAIJSON, describeModelRuntime } from "../openai";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  SpecialistExecuteResult,
  SpecialistOutput,
  SpecialistProvenance,
  ProbeResult,
} from "../types";
import { buildTaskContext } from "../campaign-context";

/** Visible marker stamped on every codebase-explainer deliverable + bid plan. */
export const CODEBASE_EXPLAINER_LABEL = "[Arbor codebase-explainer]";

/** The two hosts of the generated lesson. Kept stable so audio voice mapping
 *  (slice 2) can bind one Azure Speech voice per speaker. */
export const EXPLAINER_HOSTS = ["Nova", "Kit"] as const;
export type ExplainerHost = (typeof EXPLAINER_HOSTS)[number];

/** One turn of the two-host dialogue. `ref` optionally cites a file/symbol from
 *  the supplied code context — the seam TTS/video slices read. */
export interface LessonTurn {
  speaker: ExplainerHost;
  line: string;
  ref?: string;
}

/** Structured lesson the model returns and every renderer (markdown now, audio
 *  + video later) consumes. */
export interface LessonScript {
  title: string;
  premise: string;
  modules: string[];
  script: LessonTurn[];
  sources: string[];
}

function flagOn(name: string): boolean {
  const v = (process.env[name] ?? "").toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(v);
}

const AUDIO_ENABLED = () => flagOn("ARBOR_EXPLAINER_AUDIO_ENABLED");
const VIDEO_ENABLED = () => flagOn("ARBOR_EXPLAINER_VIDEO_ENABLED");

/** Does this task want a codebase explainer / walkthrough / lesson / podcast?
 *  Pure + tested so the bid gate is verifiable without a model call. */
export function isCodebaseExplainerTask(
  prompt: string,
  taskType?: string,
): boolean {
  const hay = `${taskType ?? ""} ${prompt ?? ""}`.toLowerCase();

  // Must be about code/a repo/a system...
  const codeSubject =
    /\b(codebase|code base|repo|repository|module|package|library|service|api|function|architecture|system|source code|file|directory|folder)\b/.test(
      hay,
    );
  // ...and about explaining/teaching/walking through it (NotebookLM-style).
  const teachIntent =
    /\b(explain|explainer|walk ?through|walk me through|teach|tutorial|onboard|onboarding|understand|understanding|lesson|overview|introduce|introduction|educational|learn|documentation walkthrough|podcast|audio overview|video overview|narrat)\w*/.test(
      hay,
    );

  if (codeSubject && teachIntent) return true;

  // Also accept an explicit, unambiguous ask even if the subject word is missing.
  return /\b(codebase (explainer|walkthrough|overview)|explain (this|the|my|our) (codebase|repo|repository|code))\b/.test(
    hay,
  );
}

export const CODEBASE_EXPLAINER_CONFIG: SpecialistConfig = {
  agent_id: "codebase-explainer",
  tier: "real",
  display_name: "Arbor Codebase Explainer",
  sponsor: "Arbor",
  capabilities: [
    "codebase-explanation",
    "onboarding-lesson",
    "two-host-audio-script",
    "educational-content",
    "documentation-walkthrough",
  ],
  cost_baseline: 0.35,
  starting_reputation: 0.7,
  one_liner:
    "Turns a repo or code path into a NotebookLM-style two-host lesson script (audio/video rendering behind flags) — Arbor-owned, no external tools.",
  system_prompt:
    "You are Arbor Codebase Explainer, Arbor's own educational content agent. You are NOT an external tool and never claim to be one. You turn supplied code context into a clear, engaging two-host lesson that helps a developer understand a codebase. You ground every claim in the code the task actually provides.",
};

const SCRIPT_SYSTEM_PROMPT = `You are Arbor Codebase Explainer. You produce a NotebookLM-style two-host audio lesson that teaches a developer how a codebase works, grounded STRICTLY in the code context supplied in the task.

The two hosts are Nova (curious, asks the questions a newcomer would) and Kit (the guide, explains clearly with concrete references). Their dialogue should feel natural and build understanding progressively: what the system does, how the main pieces fit, the key files/functions, and one or two gotchas.

Rules:
- Reference only files, functions, and concepts that appear in the supplied context. Never invent files or APIs. If the context is thin, teach what is genuinely there and say what would need to be provided to go deeper.
- Keep each spoken line short enough to be read aloud naturally (roughly 1-3 sentences).
- Aim for 12-24 turns total, alternating speakers, opening with Nova and closing with a short recap.
- Populate "ref" with a specific file path or symbol when a line is about one; omit it otherwise.

Respond with JSON only, in exactly this shape:
{
  "title": "<short lesson title>",
  "premise": "<one-sentence hook describing what the learner will understand>",
  "modules": ["<3-6 outline bullets naming the lesson's sections>"],
  "script": [ { "speaker": "Nova" | "Kit", "line": "<spoken line>", "ref": "<optional file/symbol>" } ],
  "sources": ["<the files/symbols the lesson actually draws on>"]
}`;

function isHost(x: unknown): x is ExplainerHost {
  return x === "Nova" || x === "Kit";
}

/** Validate + normalize the model's JSON into a LessonScript, or return null so
 *  the caller can fall back to a plain-markdown lesson. */
export function coerceLessonScript(raw: unknown): LessonScript | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.script)) return null;

  const script: LessonTurn[] = [];
  for (const t of o.script) {
    if (!t || typeof t !== "object") continue;
    const turn = t as Record<string, unknown>;
    if (!isHost(turn.speaker)) continue;
    if (typeof turn.line !== "string" || turn.line.trim().length === 0) continue;
    script.push({
      speaker: turn.speaker,
      line: turn.line.trim(),
      ref: typeof turn.ref === "string" && turn.ref.trim() ? turn.ref.trim() : undefined,
    });
  }
  if (script.length === 0) return null;

  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()) : [];

  return {
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Codebase Walkthrough",
    premise: typeof o.premise === "string" ? o.premise.trim() : "",
    modules: strList(o.modules),
    script,
    sources: strList(o.sources),
  };
}

/** Pure renderer: LessonScript -> markdown deliverable. No model call, so it is
 *  unit-testable and shared by every future output slice as the text fallback. */
export function buildLessonMarkdown(lesson: LessonScript): string {
  const lines: string[] = [];
  lines.push(`# ${lesson.title}`);
  if (lesson.premise) lines.push(`\n_${lesson.premise}_`);

  if (lesson.modules.length) {
    lines.push(`\n## Lesson outline`);
    for (const m of lesson.modules) lines.push(`- ${m}`);
  }

  lines.push(`\n## Two-host script`);
  lines.push(`_Hosts: **Nova** (asks) and **Kit** (guides)._`);
  for (const turn of lesson.script) {
    const ref = turn.ref ? ` \`${turn.ref}\`` : "";
    lines.push(`\n**${turn.speaker}:**${ref} ${turn.line}`);
  }

  if (lesson.sources.length) {
    lines.push(`\n## Sources referenced`);
    for (const s of lesson.sources) lines.push(`- \`${s}\``);
  }

  return lines.join("\n");
}

/** Honest footer describing which output artifacts were actually produced vs
 *  gated. Keeps the deliverable from implying audio/video exist when they don't. */
export function renderArtifactStatus(): string {
  const audio = AUDIO_ENABLED();
  const video = VIDEO_ENABLED();
  const rows = [
    `- Script (this document): produced`,
    `- Audio narration: ${audio ? "flag on — rendering pipeline not yet wired (slice 2)" : "not requested (set ARBOR_EXPLAINER_AUDIO_ENABLED)"}`,
    `- Video overview: ${video ? "flag on — rendering pipeline not yet wired (slice 3)" : "not requested (set ARBOR_EXPLAINER_VIDEO_ENABLED)"}`,
  ];
  return `## Artifacts\n${rows.join("\n")}`;
}

function modelDisabled(): boolean {
  try {
    return describeModelRuntime("agent").provider === "disabled";
  } catch {
    return false;
  }
}

function runtimeEndpoint(): string | undefined {
  try {
    return describeModelRuntime("agent").endpoint;
  } catch {
    return undefined;
  }
}

export const codebaseExplainer: SpecialistRunner = {
  config: CODEBASE_EXPLAINER_CONFIG,

  async probe(): Promise<ProbeResult> {
    if (modelDisabled()) {
      return {
        status: "fail",
        duration_ms: 0,
        error_message:
          "codebase-explainer model layer is disabled (ARBOR_MODEL_SPEND_DISABLED / provider off)",
      };
    }
    return {
      status: "pass",
      duration_ms: 0,
      response_excerpt:
        "codebase-explainer ready (Arbor-owned lesson maker — no external tools)",
    };
  },

  async bid(prompt, taskType): Promise<SpecialistDecision> {
    if (!isCodebaseExplainerTask(prompt, taskType)) {
      return {
        decline: true,
        reason:
          "codebase-explainer only bids on tasks that ask to explain/teach/walk through a codebase or repo",
      };
    }

    const capability_claim =
      `${CODEBASE_EXPLAINER_LABEL} Arbor-owned lesson maker, no external tools. ` +
      `1. Read the supplied code context and identify what the system does and its main pieces. ` +
      `2. Structure a lesson outline and a NotebookLM-style two-host (Nova/Kit) dialogue grounded in the actual files and functions. ` +
      `3. Return a script-ready deliverable; audio (Azure Speech) and video (Remotion) render behind their flags.`;

    return {
      bid_price: CODEBASE_EXPLAINER_CONFIG.cost_baseline,
      capability_claim,
      estimated_seconds: 40,
      plan_source: "baseline",
    };
  },

  async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
    const userPrompt = buildTaskContext(prompt, taskType);
    const recorder = context?.toolRecorder;
    const sessionId = `codebase-explainer:${context?.task_id ?? "local"}`;

    const callModel = () =>
      callOpenAIJSON<Record<string, unknown>>({
        systemPrompt: SCRIPT_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 2200,
        timeoutMs: 90_000,
        retries: 1,
        purpose: "agent",
      });

    const rawJson = recorder
      ? await recorder.record(
          {
            agent_id: context?.agent_id ?? CODEBASE_EXPLAINER_CONFIG.agent_id,
            phase: "execute",
            transport: "api",
            provider: "codebase-explainer",
            endpoint: runtimeEndpoint(),
            method: "model.lesson",
            tool_name: "codebase_explainer_lesson",
          },
          callModel,
          (result) => ({
            ok: coerceLessonScript(result) !== null,
            result_preview: JSON.stringify(result).slice(0, 300),
            external_session_id: sessionId,
          }),
        )
      : await callModel();

    let lesson = coerceLessonScript(rawJson);

    // Resilient fallback: if the structured call came back malformed, produce a
    // plain-markdown lesson directly rather than failing the task.
    let body: string;
    if (lesson) {
      body = buildLessonMarkdown(lesson);
    } else {
      const md = await callOpenAI({
        systemPrompt:
          "You are Arbor Codebase Explainer. Produce a clear two-host (Nova asks, Kit guides) lesson in markdown that teaches this codebase, grounded strictly in the supplied context. Do not invent files.",
        userPrompt,
        maxTokens: 1800,
        timeoutMs: 90_000,
        retries: 0,
        purpose: "agent",
      });
      body = md.trim();
    }

    const output: SpecialistOutput =
      `${CODEBASE_EXPLAINER_LABEL} Arbor-owned educational lesson — no external tools, repo checkout, or NotebookLM were used.\n\n` +
      `${body}\n\n${renderArtifactStatus()}`;

    const provenance: SpecialistProvenance = {
      tier: "not-a2a-yet",
      live_tools_called: false,
      transport: "api",
      proof_level: "api_call",
      successful_tool_call_count: recorder ? 1 : 0,
      external_session_id: sessionId,
    };

    return { output, provenance };
  },
};
