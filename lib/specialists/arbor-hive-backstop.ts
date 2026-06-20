// Specialist: arbor-hive-backstop (OpenRouter hivemind — Phase 1).
//
// The UNIVERSAL floor for the hive. Where arbor-baseline guarantees PR
// code-review nodes never end empty, arbor-hive-backstop does the same for
// EVERY task class, so no DAG node can fail for lack of a plausible bidder —
// the root cause of the broken hive loop (auctions declining every bid as
// implausible_plan with no live supply to fall back on).
//
// Like arbor-baseline it is:
//   - Arbor-owned and model-backed (no external tools); honestly labeled on
//     the bid claim, the delivered text, and the provenance (AGENTS.md rule).
//   - Last-resort economics: low reputation + near-budget price, so its Vickrey
//     score (reputation / price) stays below any genuinely live specialist. It
//     only wins when nothing live qualifies.
//   - Screen-exempt at the auctioneer (registry.ts ARBOR_FLOOR_AGENT_IDS): its
//     plan is generic by design, so the plausibility screen must never be able
//     to empty the auction by rejecting the floor.
//   - Always invited (hiveRouter appends the floor to every node shortlist) so
//     the guarantee holds on the first auction, not only the open-retry.
//   - Gateway-following: it calls Arbor's model layer (callOpenAI), so the
//     OpenRouter switch (ARBOR_OPENROUTER_ENABLED) governs whether it runs on
//     OpenRouter or a native provider — no special-casing here.

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
import { lastResortBidPrice } from "./pr-review-detect";

/** Visible marker stamped on every arbor-hive-backstop deliverable + bid plan. */
export const ARBOR_HIVE_BACKSTOP_LABEL = "[Arbor hive backstop]";

function modelLayerDisabled(): boolean {
  try {
    return describeModelRuntime("agent").provider === "disabled";
  } catch {
    // Config hiccup (e.g. an unset Azure deployment): let execute() be the real
    // test rather than silently disabling the floor.
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

export const ARBOR_HIVE_BACKSTOP_CONFIG: SpecialistConfig = {
  agent_id: "arbor-hive-backstop",
  tier: "real",
  display_name: "Arbor Hive Backstop",
  sponsor: "Arbor",
  capabilities: [
    "reasoning",
    "classification",
    "extraction",
    "generation",
    "arbor-owned-fallback",
  ],
  // Last-resort economics: the real bid price is derived from the budget ceiling
  // at bid time (lastResortBidPrice). cost_baseline is only the floor.
  cost_baseline: 0.4,
  // Deliberately low so reputation/price keeps it under any live specialist.
  starting_reputation: 0.05,
  one_liner:
    "Arbor-owned model floor that guarantees every hive node returns a judged, honestly-labeled answer — never a hang or an empty failure.",
  system_prompt:
    "You are Arbor Hive Backstop, Arbor's own last-resort generalist. You are NOT an external tool and never claim to be one. You take on any task no live specialist covered and return the most useful, concrete answer the prompt allows.",
};

const BACKSTOP_SYSTEM_PROMPT = `You are Arbor Hive Backstop, Arbor's own last-resort generalist agent. You are powered by Arbor's model layer only — you have NO external tools, browser, repo, or APIs. You are dispatched when no live specialist took a task, so produce the most useful, concrete deliverable the prompt allows.

Rules:
- Engage directly with the task's actual subject matter; do not give a meta-description of how you would do it.
- Be specific and actionable. Honor the task's success criteria if provided.
- Ground every claim in the prompt and any shared-scratchpad context supplied. Do not invent facts, sources, or tool results.
- If the task genuinely cannot be completed from the prompt alone (it needs a live tool you lack), say so plainly and still deliver the best partial result.
- Output clean markdown.`;

export const arborHiveBackstop: SpecialistRunner = {
  config: ARBOR_HIVE_BACKSTOP_CONFIG,

  async probe(): Promise<ProbeResult> {
    if (modelLayerDisabled()) {
      return {
        status: "fail",
        duration_ms: 0,
        error_message:
          "arbor-hive-backstop model layer is disabled (ARBOR_MODEL_SPEND_DISABLED / provider off)",
      };
    }
    return {
      status: "pass",
      duration_ms: 0,
      response_excerpt:
        "arbor-hive-backstop ready (Arbor-owned model floor — no external tools)",
    };
  },

  async bid(prompt): Promise<SpecialistDecision> {
    const price = lastResortBidPrice(
      prompt,
      ARBOR_HIVE_BACKSTOP_CONFIG.cost_baseline,
    );
    // Anchor the claim on the task's first non-empty line so it engages with the
    // actual subject (the screen is exempt for the floor, but the claim must
    // still read honestly — never a generic capability pitch).
    const subject = (prompt.split("\n").find((line) => line.trim()) ?? prompt)
      .trim()
      .slice(0, 160);
    const capability_claim =
      `${ARBOR_HIVE_BACKSTOP_LABEL} Arbor-owned model floor, no external tools. ` +
      `Take on: "${subject}". ` +
      `1. Parse the task with its success criteria and any shared-scratchpad context. ` +
      `2. Produce the most useful concrete deliverable the prompt supports, grounded only in what is given. ` +
      `3. Flag explicitly anything that would need a live tool I do not have.`;

    return {
      bid_price: price,
      capability_claim,
      estimated_seconds: 40,
      plan_source: "baseline",
    };
  },

  async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
    const userPrompt = buildTaskContext(prompt, taskType);
    const recorder = context?.toolRecorder;
    const sessionId = `arbor-hive-backstop:${context?.task_id ?? "local"}`;

    const callModel = () =>
      callOpenAI({
        systemPrompt: BACKSTOP_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 1600,
        timeoutMs: 90_000,
        retries: 1,
        purpose: "agent",
      });

    const answer = recorder
      ? await recorder.record(
          {
            agent_id: context?.agent_id ?? ARBOR_HIVE_BACKSTOP_CONFIG.agent_id,
            phase: "execute",
            transport: "api",
            provider: "arbor-hive-backstop",
            endpoint: runtimeEndpoint(),
            method: "model.generate",
            tool_name: "arbor_hive_backstop",
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
      `${ARBOR_HIVE_BACKSTOP_LABEL} Arbor-owned model floor — no external tools, browser, or repo were used.\n\n` +
      answer.trim();

    const provenance: SpecialistProvenance = {
      // Honest execution badge: an internal model call, not an external tool.
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
