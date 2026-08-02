import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  calibrationScore,
  clampConfidence,
  normalizeTaskClass,
} from "../lib/bid-calibration";

const WEIGHT = {
  quality: 0.45,
  speed: 0.2,
  estimate: 0.15,
  value: 0.2,
};

/** Weights when the winning bid carried a self-reported confidence: the
 * calibration dimension takes 0.12 and the rest shrink proportionally. */
const WEIGHT_WITH_CALIBRATION = {
  quality: 0.4,
  speed: 0.18,
  estimate: 0.12,
  value: 0.18,
  calibration: 0.12,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Speed: 1.0 if actual ≤ estimated; degrades linearly toward 0 as actual
 * grows to 3× estimated. Beyond that, 0.
 */
function computeSpeedScore(actual: number, estimated: number): number {
  if (estimated <= 0) return 0.5;
  if (actual <= estimated) return 1;
  const overrun = (actual - estimated) / estimated;
  return clamp01(1 - overrun / 2);
}

/**
 * Estimate accuracy: penalizes both over- and under-prediction symmetrically.
 * 1.0 when actual === estimated, falls toward 0 as the ratio diverges.
 */
function computeEstimateAccuracy(actual: number, estimated: number): number {
  if (estimated <= 0) return 0;
  const ratio = actual / estimated;
  // log-symmetric distance — ratio of 1 → 0; ratio of 2 or 0.5 → ~0.7 distance.
  const logDistance = Math.abs(Math.log2(Math.max(0.01, ratio)));
  return clamp01(1 - logDistance / 2);
}

/**
 * Value: quality / price, scaled so that quality 1.0 at $0.50 maps to ~0.8,
 * and quality 1.0 at $0.10 saturates at 1.0. Cheap, high-quality work wins.
 */
function computeValueScore(quality: number, pricePaid: number): number {
  if (pricePaid <= 0) return quality;
  // 0.40 / pricePaid because at $0.40 you get quality * 1.0; at $0.80 you
  // get quality * 0.5; at $0.20 you get quality * 2.0 (clamped to 1).
  const efficiency = 0.4 / pricePaid;
  return clamp01(quality * efficiency);
}

interface DimensionInput {
  actual_seconds: number;
  estimated_seconds: number;
  quality_score: number;
  accepted: boolean;
  bid_price: number;
  price_paid: number;
  confidence?: number;
  task_class?: string;
}

function dimensionValues(args: DimensionInput) {
  const speed = computeSpeedScore(args.actual_seconds, args.estimated_seconds);
  const estimate = computeEstimateAccuracy(
    args.actual_seconds,
    args.estimated_seconds,
  );
  const quality = clamp01(args.quality_score);
  const value = computeValueScore(quality, args.price_paid);
  const confidence = clampConfidence(args.confidence);
  const calibration =
    confidence !== undefined
      ? calibrationScore(confidence, args.accepted)
      : undefined;
  const overall =
    calibration !== undefined
      ? clamp01(
          WEIGHT_WITH_CALIBRATION.quality * quality +
            WEIGHT_WITH_CALIBRATION.speed * speed +
            WEIGHT_WITH_CALIBRATION.estimate * estimate +
            WEIGHT_WITH_CALIBRATION.value * value +
            WEIGHT_WITH_CALIBRATION.calibration * calibration,
        )
      : clamp01(
          WEIGHT.quality * quality +
            WEIGHT.speed * speed +
            WEIGHT.estimate * estimate +
            WEIGHT.value * value,
        );
  return {
    actual_seconds: args.actual_seconds,
    estimated_seconds: args.estimated_seconds,
    speed_score: speed,
    estimate_accuracy: estimate,
    quality_score: quality,
    value_score: value,
    confidence,
    calibration_score: calibration,
    task_class: normalizeTaskClass(args.task_class),
    overall,
    accepted: args.accepted,
    bid_price: args.bid_price,
    price_paid: args.price_paid,
  };
}

export const _record = internalMutation({
  args: {
    agent_id: v.string(),
    task_id: v.id("tasks"),
    actual_seconds: v.number(),
    estimated_seconds: v.number(),
    quality_score: v.number(),
    accepted: v.boolean(),
    bid_price: v.number(),
    price_paid: v.number(),
    /** Self-reported P(accept) from the winning bid; absent on legacy paths. */
    confidence: v.optional(v.number()),
    /** Capability cluster of the settled task (hive task-class taxonomy);
     * absent on legacy paths — the row then only feeds global stats. */
    task_class: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const values = dimensionValues(args);

    await ctx.db.insert("reputation_dimensions", {
      agent_id: args.agent_id,
      task_id: args.task_id,
      ...values,
      created_at: Date.now(),
    });

    return {
      speed: values.speed_score,
      estimate: values.estimate_accuracy,
      quality: values.quality_score,
      value: values.value_score,
      calibration: values.calibration_score,
      overall: values.overall,
    };
  },
});

/**
 * Atomically replace the ordinary judge dimension row with a golden audit's
 * ground-truth outcome and mark the audit run complete. One transaction
 * avoids both double-counting the task and the claim-then-write crash window.
 */
export const _recordGoldenAudit = internalMutation({
  args: {
    run_id: v.id("golden_task_runs"),
    agent_id: v.string(),
    task_id: v.id("tasks"),
    actual_seconds: v.number(),
    estimated_seconds: v.number(),
    quality_score: v.number(),
    accepted: v.boolean(),
    bid_price: v.number(),
    price_paid: v.number(),
    confidence: v.optional(v.number()),
    task_class: v.optional(v.string()),
    judge_accepted: v.boolean(),
    audit_reasoning: v.string(),
    substring_misses: v.array(v.string()),
    grader_used: v.boolean(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status !== "posted") return { claimed: false };
    if (run.task_id !== args.task_id) {
      throw new Error("golden audit run does not belong to task");
    }

    const existing = await ctx.db
      .query("reputation_dimensions")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .unique();
    if (existing && existing.agent_id !== args.agent_id) {
      throw new Error("golden audit winner does not match reputation row");
    }

    const values = dimensionValues(args);
    const row = {
      agent_id: args.agent_id,
      task_id: args.task_id,
      ...values,
      created_at: Date.now(),
    };
    if (existing) {
      await ctx.db.replace(existing._id, row);
    } else {
      await ctx.db.insert("reputation_dimensions", row);
    }
    await ctx.db.patch(run._id, {
      status: "audited",
      agent_id: args.agent_id,
      judge_accepted: args.judge_accepted,
      audit_passed: args.accepted,
      audit_quality: values.quality_score,
      audit_reasoning: args.audit_reasoning,
      substring_misses: args.substring_misses,
      grader_used: args.grader_used,
      audited_at: Date.now(),
    });
    return { claimed: true, replaced: existing !== null };
  },
});

function summarizeIncentiveRows(rows: Array<Doc<"reputation_dimensions">>): {
  settled_tasks: number;
  accept_rate: number;
  mean_calibration: number;
} {
  if (rows.length === 0) {
    return { settled_tasks: 0, accept_rate: 0.5, mean_calibration: 0.5 };
  }
  let accepted = 0;
  let calibrationSum = 0;
  for (const r of rows) {
    accepted += r.accepted ? 1 : 0;
    calibrationSum += r.calibration_score ?? 0.5;
  }
  return {
    settled_tasks: rows.length,
    accept_rate: clamp01(accepted / rows.length),
    mean_calibration: clamp01(calibrationSum / rows.length),
  };
}

/**
 * Per-agent stats the auctioneer needs to price a bid's self-reported
 * confidence: settled-task count, judge-accept rate, and mean Brier
 * calibration over the most recent settled tasks. Legacy rows without a
 * stored calibration count as a neutral 0.5 so they neither vouch for nor
 * condemn the agent's self-assessment.
 *
 * Task-conditional: when a task_class is supplied, same-class rows are
 * preferred (ability is task-relative — an OCR agent's accept rate must not
 * vouch for its legal-drafting bids). Only when the cluster has zero history
 * do the agent's global stats stand in, flagged scope: "global" so the
 * solicitation prompt and any accept-rate floor can tell the difference.
 */
export const _incentiveStatsForAgent = internalQuery({
  args: {
    agent_id: v.string(),
    task_class: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const taskClass = normalizeTaskClass(args.task_class);
    if (taskClass !== undefined) {
      const clusterRows = await ctx.db
        .query("reputation_dimensions")
        .withIndex("by_agent_and_task_class", (q) =>
          q.eq("agent_id", args.agent_id).eq("task_class", taskClass),
        )
        .order("desc")
        .take(50);
      if (clusterRows.length > 0) {
        return {
          ...summarizeIncentiveRows(clusterRows),
          task_class: taskClass,
          scope: "cluster" as const,
        };
      }
    }
    const rows = await ctx.db
      .query("reputation_dimensions")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .order("desc")
      .take(50);
    return {
      ...summarizeIncentiveRows(rows),
      ...(taskClass !== undefined
        ? { task_class: taskClass, scope: "global" as const }
        : {}),
    };
  },
});

export const forAgent = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reputation_dimensions")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .collect();
    return rows.sort((a, b) => b.created_at - a.created_at);
  },
});

export const summaries = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("reputation_dimensions").collect();
    const byAgent = new Map<
      string,
      {
        agent_id: string;
        tasks: number;
        speed: number;
        estimate: number;
        quality: number;
        value: number;
        calibration: number;
        overall: number;
      }
    >();
    for (const r of rows) {
      const cur = byAgent.get(r.agent_id) ?? {
        agent_id: r.agent_id,
        tasks: 0,
        speed: 0,
        estimate: 0,
        quality: 0,
        value: 0,
        calibration: 0,
        overall: 0,
      };
      cur.tasks += 1;
      cur.speed += r.speed_score;
      cur.estimate += r.estimate_accuracy;
      cur.quality += r.quality_score;
      cur.value += r.value_score;
      cur.calibration += r.calibration_score ?? 0.5;
      cur.overall += r.overall;
      byAgent.set(r.agent_id, cur);
    }
    return Array.from(byAgent.values()).map((s) => ({
      agent_id: s.agent_id,
      tasks: s.tasks,
      speed: s.speed / s.tasks,
      estimate: s.estimate / s.tasks,
      quality: s.quality / s.tasks,
      value: s.value / s.tasks,
      calibration: s.calibration / s.tasks,
      overall: s.overall / s.tasks,
    }));
  },
});

/**
 * Per-agent 4D reputation dimensions for W4 ranked discovery
 * (rankAgents4D in lib/hive/rank-core.ts): reliability = accepted-rate,
 * quality = mean quality_score, speed = mean speed_score. `safety` has no
 * real signal yet — this returns a neutral 1.0 default for every agent until
 * a dedicated safety-eval pipeline lands; treat it as a placeholder, not a
 * verified score.
 */
export const _dimensionsForAgents = internalQuery({
  args: { agent_ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result = new Map<
      string,
      {
        agent_id: string;
        tasks: number;
        accepted: number;
        speed: number;
        quality: number;
      }
    >();
    for (const agent_id of args.agent_ids) {
      const rows = await ctx.db
        .query("reputation_dimensions")
        .withIndex("by_agent", (q) => q.eq("agent_id", agent_id))
        .collect();
      const acc = { agent_id, tasks: 0, accepted: 0, speed: 0, quality: 0 };
      for (const r of rows) {
        acc.tasks += 1;
        acc.accepted += r.accepted ? 1 : 0;
        acc.speed += r.speed_score;
        acc.quality += r.quality_score;
      }
      result.set(agent_id, acc);
    }
    return args.agent_ids.map((agent_id) => {
      const acc = result.get(agent_id);
      if (!acc || acc.tasks === 0) {
        // No settled history: neutral 0.5 reliability/quality/speed rather
        // than penalizing unseen agents, matching profile-core's empty-prior
        // convention. Safety stays 1.0 (see doc comment above).
        return {
          agent_id,
          reliability: 0.5,
          quality: 0.5,
          safety: 1.0,
          speed: 0.5,
        };
      }
      return {
        agent_id,
        reliability: clamp01(acc.accepted / acc.tasks),
        quality: clamp01(acc.quality / acc.tasks),
        // Safety: no dedicated safety-eval signal exists yet. Default to a
        // neutral 1.0 (no known safety issues) until one is built.
        safety: 1.0,
        speed: clamp01(acc.speed / acc.tasks),
      };
    });
  },
});
