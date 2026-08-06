"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { deliveryTextForEvaluation } from "../lib/delivery-text";
import {
  callOpenAIJSON,
  describeModelRuntime,
  type ModelGateway,
} from "../lib/openai";
import {
  GOLDEN_AUDIT_SYSTEM_PROMPT,
  checkRequiredSubstrings,
  combineAuditVerdict,
  goldenAuditUserPrompt,
  type GoldenGraderVerdict,
} from "../lib/golden-audit";
import { clampConfidence, normalizeTaskClass } from "../lib/bid-calibration";
import type { JudgeVerdict } from "../lib/types";

// Shared with the settlement judge so both evaluators read the same text: the
// agent's answer, without Arbor's own provenance banner.
const deliveryTextFromResult = deliveryTextForEvaluation;

/**
 * Settle-time golden audit. Scheduled by auctions.settle when the settled
 * task has a golden_task_runs row: grades the delivery against the stored
 * reference (deterministic substring checks + reference-aware model grader)
 * and replaces the ordinary judge's reputation_dimensions row with the
 * ground-truth outcome — same agent, task, and stated confidence, but
 * accepted/quality come from the reference. This keeps calibration honest
 * for agents that only bid when certain without double-counting the task.
 */
export const audit = internalAction({
  args: { task_id: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.goldenTasks._runForTask, {
      task_id: args.task_id,
    });
    if (!run || run.status !== "posted") return null;

    const golden = await ctx.runQuery(internal.goldenTasks._getGolden, {
      golden_task_id: run.golden_task_id,
    });
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    if (!task.winning_bid_id || !task.result || !task.judge_verdict) {
      await ctx.runMutation(internal.goldenTasks._claimRunWithOutcome, {
        run_id: run._id,
        status: "audit_error",
        audit_reasoning: "settled without a winner, result, or verdict",
      });
      return null;
    }
    const winner = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });
    const judgeVerdict = task.judge_verdict as JudgeVerdict;
    const judgeAccepted = judgeVerdict.verdict === "accept";
    const deliveryText = deliveryTextFromResult(task.result);

    const required = golden.required_substrings ?? [];
    const substring_misses = checkRequiredSubstrings(deliveryText, required);

    // Protocol requires both model ids on every counted run so grader/judge
    // independence is auditable after the fact rather than assumed.
    const graderModel = describeModelRuntime("grader").model;
    const judgeModel = describeModelRuntime("judge").model;

    let grader: GoldenGraderVerdict | null = null;
    try {
      grader = await callOpenAIJSON<GoldenGraderVerdict>({
        systemPrompt: GOLDEN_AUDIT_SYSTEM_PROMPT,
        userPrompt: goldenAuditUserPrompt({
          taskPrompt: golden.prompt,
          referenceAnswer: golden.reference_answer,
          successCriteria: golden.success_criteria,
          deliveryText,
        }),
        maxTokens: 512,
        timeoutMs: 20_000,
        retries: 1,
        // "grader", never "judge": the settlement audit only means anything if
        // the reference grader can fail independently of the settlement judge.
        // Sharing a deployment would correlate their errors and bias FAR/FRR
        // toward agreement.
        purpose: "grader",
        gateway: task.model_gateway as ModelGateway | undefined,
      });
    } catch {
      grader = null;
    }

    const outcome = combineAuditVerdict({
      substring_misses,
      had_required_substrings: required.length > 0,
      grader,
    });

    if (!outcome) {
      // Grader unreachable and no deterministic criteria: record the error,
      // write no reputation row — never punish or reward on a grader outage.
      await ctx.runMutation(internal.goldenTasks._claimRunWithOutcome, {
        run_id: run._id,
        status: "audit_error",
        agent_id: winner.agent_id,
        judge_accepted: judgeAccepted,
        audit_reasoning: "reference grader unavailable and no deterministic criteria",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "golden_audit_error",
        payload: {
          golden_id: golden.golden_id,
          agent_id: winner.agent_id,
          reason: "reference grader unavailable and no deterministic criteria",
        },
      });
      return null;
    }

    // Same wall-clock computation as auctions.settle so the audit row's speed
    // and estimate dimensions match the judge-scored row for this task.
    const lifecycle = (await ctx.runQuery(internal.lifecycle._forTask, {
      task_id: args.task_id,
    })) as Array<Doc<"lifecycle_events">>;
    const startedAt = lifecycle.find(
      (e) => e.event_type === "execution_started",
    )?.timestamp;
    const completedAt = lifecycle.find(
      (e) => e.event_type === "execution_complete",
    )?.timestamp;
    const actualSeconds =
      startedAt && completedAt
        ? Math.max(0.1, (completedAt - startedAt) / 1000)
        : winner.estimated_seconds;

    // Replace the ordinary judge dimension with the ground-truth audit
    // dimension and claim the run in one mutation. This preserves the table's
    // one-row-per-task invariant and makes retries safe.
    const { claimed } = await ctx.runMutation(
      internal.reputationDimensions._recordGoldenAudit,
      {
        run_id: run._id,
        agent_id: winner.agent_id,
        task_id: args.task_id,
        actual_seconds: actualSeconds,
        estimated_seconds: winner.estimated_seconds,
        quality_score: outcome.quality,
        accepted: outcome.passed,
        bid_price: winner.bid_price,
        price_paid: task.price_paid ?? winner.bid_price,
        confidence: clampConfidence(winner.confidence),
        task_class: normalizeTaskClass(winner.task_class),
        judge_accepted: judgeAccepted,
        audit_reasoning: outcome.reasoning,
        substring_misses: outcome.substring_misses,
        grader_used: outcome.grader_used,
      },
    );
    if (!claimed) return null;

    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "golden_audit_settled",
      payload: {
        golden_id: golden.golden_id,
        agent_id: winner.agent_id,
        audit_passed: outcome.passed,
        audit_quality: outcome.quality,
        audit_reasoning: outcome.reasoning,
        substring_misses: outcome.substring_misses,
        grader_used: outcome.grader_used,
        grader_model: graderModel,
        judge_model: judgeModel,
        grader_judge_independent: graderModel !== judgeModel,
        judge_accepted: judgeAccepted,
        judge_agreement: judgeAccepted === outcome.passed,
      },
    });
    return null;
  },
});
