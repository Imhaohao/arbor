// Specialist: arbor-baseline (Agent Task 23).
//
// Arbor's own real-tier internal executor. It exists so that NO node in the
// target task class (automated PR code review) can ever terminate without a
// judged, honestly-labeled deliverable. It is the FLOOR, not a feature:
//
//   - It is gated to PR code-review tasks (or the ARBOR_BASELINE_FALLBACK
//     escape hatch). On any other task it declines immediately, before any
//     model spend, so it never widens the rollout.
//   - It bids last-resort: deliberately low reputation + a near-budget price,
//     so its Vickrey score (reputation / price) is below any genuinely live
//     specialist. It only wins when nothing live qualifies.
//   - It is Arbor-owned and powered by Arbor's own model layer — NOT an
//     external specialist tool. Every surface says so: the bid claim, the
//     delivered text ("[Arbor baseline]"), and the execution provenance
//     (live_tools_called: false, tier "not-a2a-yet", proof_level "api_call").
//     A high fallback rate is a signal to fix live supply, never something to
//     dress up as a live tool (AGENTS.md honesty rule).
//
// Registered in SPECIALISTS (registry.ts) so it joins every auction roster at
// auctions.ts without any edit to that file.

import { callOpenAI, describeModelRuntime } from "../openai";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  SpecialistExecuteResult,
  SpecialistProvenance,
  ProbeResult,
} from "../types";
import { buildTaskContext } from "../campaign-context";
import {
  isPrReviewTask,
  extractPullRequestRef,
  extractInlineDiff,
  lastResortBidPrice,
} from "./pr-review-detect";

/** Visible marker stamped on every arbor-baseline deliverable + bid plan. */
export const ARBOR_BASELINE_LABEL = "[Arbor baseline]";

function fallbackWidened(): boolean {
  const v = (process.env.ARBOR_BASELINE_FALLBACK ?? "").toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(v);
}

function modelLayerDisabled(): boolean {
  try {
    return describeModelRuntime("agent").provider === "disabled";
  } catch {
    // Config resolution hiccup (e.g. an Azure deployment name not set yet):
    // let execute() be the real test rather than silently disabling the floor.
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

export const ARBOR_BASELINE_CONFIG: SpecialistConfig = {
  agent_id: "arbor-baseline",
  tier: "real",
  display_name: "Arbor Baseline",
  sponsor: "Arbor",
  capabilities: [
    "pull-request-review",
    "code-review",
    "diff-analysis",
    "arbor-owned-fallback",
  ],
  // Last-resort economics: the actual bid price is derived from the budget
  // ceiling at bid time (lastResortBidPrice). cost_baseline is only the floor.
  cost_baseline: 0.4,
  // Deliberately low so reputation/price keeps it under any live specialist.
  starting_reputation: 0.05,
  one_liner:
    "Arbor-owned model fallback that guarantees every PR-review task returns a judged, honestly-labeled review — never a hang or an empty failure.",
  system_prompt:
    "You are Arbor Baseline, Arbor's own last-resort reviewer. You are NOT an external tool and you never claim to be one. You bid only on pull-request code-review tasks. You produce a concrete, judgeable code review grounded in the actual changed files and lines.",
};

const REVIEW_SYSTEM_PROMPT = `You are Arbor Baseline, Arbor's own pull-request code reviewer. You are powered by Arbor's model layer only — you have NO external code tools, NO repo checkout, and NO CI. Review strictly the diff or pull request the user supplies.

Produce a structured, actionable review in markdown:
1. **Summary** — what the change does, in 1-2 sentences, naming the actual changed files.
2. **Blocking issues** — correctness bugs, security problems, and regressions. For each, cite the specific file and line/hunk from the diff and explain the concrete failure. If you find a logic error, off-by-one, wrong operator, swapped argument, missing await, unhandled null, or similar planted-looking defect, call it out explicitly as blocking.
3. **Non-blocking nits** — style, naming, tests, docs.
4. **Verdict** — exactly one of: "Approve", "Approve with nits", or "Request changes", with a one-line justification.

Rules: reference only what is literally in the supplied diff/PR — never invent files or lines. If the diff is empty or unreadable, say so plainly. Be specific; a reviewer the author can act on, not vague praise.`;

export const arborBaseline: SpecialistRunner = {
  config: ARBOR_BASELINE_CONFIG,

  async probe(): Promise<ProbeResult> {
    if (modelLayerDisabled()) {
      return {
        status: "fail",
        duration_ms: 0,
        error_message:
          "arbor-baseline model layer is disabled (ARBOR_MODEL_SPEND_DISABLED / provider off)",
      };
    }
    return {
      status: "pass",
      duration_ms: 0,
      response_excerpt:
        "arbor-baseline ready (Arbor-owned model fallback — no external tools)",
    };
  },

  async bid(prompt, taskType): Promise<SpecialistDecision> {
    if (!isPrReviewTask(prompt, taskType) && !fallbackWidened()) {
      return {
        decline: true,
        reason:
          "arbor-baseline only bids on PR code-review tasks for this rollout (set ARBOR_BASELINE_FALLBACK=true to widen)",
      };
    }

    const price = lastResortBidPrice(prompt, ARBOR_BASELINE_CONFIG.cost_baseline);
    const pr = extractPullRequestRef(prompt);
    const hasDiff = Boolean(extractInlineDiff(prompt));
    const target = pr
      ? `${pr.owner}/${pr.repo}#${pr.number}`
      : hasDiff
        ? "the supplied diff"
        : "the supplied changes";

    const capability_claim =
      `${ARBOR_BASELINE_LABEL} Arbor-owned model fallback, no external code tools. ` +
      `1. Read ${target} and enumerate the changed files and hunks. ` +
      `2. Check each hunk for correctness, security, and regression risk, flagging specific file:line issues including any planted defect. ` +
      `3. Return a structured review — blocking issues, nits, and an Approve/Request-changes verdict — the author can act on.`;

    return {
      bid_price: price,
      capability_claim,
      estimated_seconds: 45,
      plan_source: "baseline",
    };
  },

  async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
    const pr = extractPullRequestRef(prompt);
    const diff = extractInlineDiff(prompt);
    const sourceNote = pr
      ? `Pull request under review: ${pr.url} (${pr.owner}/${pr.repo}#${pr.number}). Review the diff content included in the task prompt.`
      : diff
        ? "A unified diff is included in the task prompt below. Review it directly."
        : "Review the code changes described in the task prompt.";

    const userPrompt = `${buildTaskContext(prompt, taskType)}\n\n---\n${sourceNote}`;
    const recorder = context?.toolRecorder;
    const sessionId = `arbor-baseline:${context?.task_id ?? "local"}`;

    const callModel = () =>
      callOpenAI({
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 1600,
        timeoutMs: 90_000,
        retries: 1,
        purpose: "agent",
      });

    const review = recorder
      ? await recorder.record(
          {
            agent_id: context?.agent_id ?? ARBOR_BASELINE_CONFIG.agent_id,
            phase: "execute",
            transport: "api",
            provider: "arbor-baseline",
            endpoint: runtimeEndpoint(),
            method: "model.review",
            tool_name: "arbor_baseline_review",
          },
          callModel,
          (result) => ({
            ok: typeof result === "string" && result.trim().length > 0,
            result_preview:
              typeof result === "string" ? result.slice(0, 300) : undefined,
            external_session_id: sessionId,
          }),
        )
      : await callModel();

    const output =
      `${ARBOR_BASELINE_LABEL} Arbor-owned model fallback review — no external code tools, repo checkout, or CI were used.\n\n` +
      review.trim();

    const provenance: SpecialistProvenance = {
      // Honest execution-time badge: this is an internal model call, not an
      // A2A / external specialist tool. (The auction's tier weight is computed
      // separately from spec.tier in solicitBids; this provenance is what the
      // delivered result actually claims.)
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
