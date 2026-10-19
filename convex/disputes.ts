"use node";

import { action, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { JudgeVerdict } from "../lib/types";
import { publicDemoMode } from "../lib/public-demo";
import { assertCanActOn } from "./viewer";
import { settleStripeForOverride } from "./stripeMoney";

/**
 * Re-runs the judge with the dispute reason injected. Reputation and escrow
 * effects then flow through the standard settle action.
 */
export const raise = action({
  args: { task_id: v.id("tasks"), reason: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    await assertCanActOn(ctx, task.posted_by);
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "judge_verdict",
      payload: { dispute_opened: true, reason: args.reason },
    });
    await ctx.scheduler.runAfter(0, internal.auctions.judge, {
      task_id: args.task_id,
      dispute_reason: args.reason,
    });
    return { ok: true };
  },
});

type OverrideVerdict = "accept" | "reject";

interface OverrideArgs {
  task_id: Id<"tasks">;
  verdict: OverrideVerdict;
  reason: string;
  actor: string;
}

const OVERRIDE_OUTCOMES = {
  accept: { escrow: "released", status: "complete" },
  reject: { escrow: "refunded", status: "disputed" },
} as const;

function overrideQualityScore(verdict: OverrideVerdict, task: Doc<"tasks">): number {
  const judged = task.judge_verdict?.quality_score;
  return verdict === "accept" ? Math.max(0.7, judged ?? 0.8) : Math.min(0.3, judged ?? 0.2);
}

async function recordOverrideVerdict(
  ctx: ActionCtx,
  args: OverrideArgs,
  task: Doc<"tasks">,
): Promise<JudgeVerdict> {
  const overrideVerdict: JudgeVerdict = {
    verdict: args.verdict,
    reasoning: `Human override by ${args.actor}: ${args.reason}`,
    quality_score: overrideQualityScore(args.verdict, task),
  };

  await ctx.runMutation(internal.tasks._setVerdict, {
    task_id: args.task_id,
    verdict: {
      ...overrideVerdict,
      override: true,
      original_verdict: task.judge_verdict ?? null,
      override_actor: args.actor,
      override_reason: args.reason,
    },
  });

  await ctx.runMutation(internal.lifecycle.log, {
    task_id: args.task_id,
    event_type: "judge_override",
    payload: {
      actor: args.actor,
      verdict: args.verdict,
      reason: args.reason,
      original_verdict: task.judge_verdict ?? null,
    },
  });
  return overrideVerdict;
}

/** No winning bid (synthesized result): only the task status changes. */
async function settleUnawardedOverride(
  ctx: ActionCtx,
  args: OverrideArgs,
  qualityScore: number,
) {
  await ctx.runMutation(internal.tasks._setStatus, {
    task_id: args.task_id,
    status: OVERRIDE_OUTCOMES[args.verdict].status,
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id: args.task_id,
    event_type: "settled",
    payload: {
      override: true,
      verdict: args.verdict,
      synthesized: true,
      quality_score: qualityScore,
      reason: args.reason,
    },
  });
}

async function settleAwardedOverride(
  ctx: ActionCtx,
  args: OverrideArgs,
  task: Doc<"tasks">,
  winningBidId: Id<"bids">,
) {
  const winner = await ctx.runQuery(internal.bids._get, {
    bid_id: winningBidId,
  });
  const agent = await ctx.runQuery(internal.agents._getByAgentId, {
    agent_id: winner.agent_id,
  });

  await settleStripeForOverride(ctx, args.task_id, args.verdict);

  const outcome = OVERRIDE_OUTCOMES[args.verdict];
  await ctx.runMutation(internal.escrow._settle, {
    task_id: args.task_id,
    status: outcome.escrow,
  });
  await ctx.runMutation(internal.tasks._setStatus, {
    task_id: args.task_id,
    status: outcome.status,
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id: args.task_id,
    event_type: "settled",
    payload: {
      override: true,
      verdict: args.verdict,
      escrow: outcome.escrow,
      seller_id: winner.agent_id,
      delta: 0,
      new_score: agent?.reputation_score ?? 0,
      price_paid: task.price_paid,
      reason: args.reason,
    },
  });
}

/**
 * Human override: unlike `raise`, this does not ask the model judge again.
 * It records an auditable buyer/operator decision and updates escrow/status.
 */
export const override = action({
  args: {
    task_id: v.id("tasks"),
    verdict: v.union(v.literal("accept"), v.literal("reject")),
    reason: v.string(),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (publicDemoMode()) {
      throw new Error("Dispute overrides are disabled in public demo mode");
    }
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    await assertCanActOn(ctx, task.posted_by);
    if (!task.result) throw new Error("cannot override before execution result");

    const overrideArgs: OverrideArgs = { ...args, actor: args.actor ?? "buyer" };
    const overrideVerdict = await recordOverrideVerdict(ctx, overrideArgs, task);

    if (task.winning_bid_id) {
      await settleAwardedOverride(ctx, overrideArgs, task, task.winning_bid_id);
    } else {
      await settleUnawardedOverride(ctx, overrideArgs, overrideVerdict.quality_score);
    }
    return { ok: true, verdict: args.verdict };
  },
});
