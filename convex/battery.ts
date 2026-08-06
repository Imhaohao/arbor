import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  costCoverageCurve,
  summarizeMarginalGain,
  type MarginalGainObservation,
} from "../lib/hive/pareto-core";

/**
 * Storage and read-back for the task battery (scripts/run-task-battery.ts).
 *
 * The battery exists because the golden AUDIT lane structurally cannot produce
 * a query x agent crossing: it posts one task through the auction and only the
 * winner is graded. Every trilemma metric needs the crossing, so the battery
 * fans one task out to many agents and grades all of them.
 *
 * Internal-only: battery rows link an agent to its performance on a task whose
 * reference answer is known, and exposing that publicly would let a bidder
 * recognize audit prompts and game them.
 */

const runValidator = v.object({
  battery_id: v.string(),
  golden_task_id: v.id("golden_tasks"),
  golden_id: v.string(),
  agent_id: v.string(),
  status: v.union(
    v.literal("complete"),
    v.literal("declined"),
    v.literal("error"),
  ),
  arm: v.string(),
  members: v.optional(v.array(v.string())),
  bid_price: v.optional(v.number()),
  confidence: v.optional(v.number()),
  estimated_seconds: v.optional(v.number()),
  output_text: v.optional(v.string()),
  error_message: v.optional(v.string()),
  latency_ms: v.optional(v.number()),
  accuracy_score: v.optional(v.number()),
  audit_passed: v.optional(v.boolean()),
  substring_misses: v.optional(v.array(v.string())),
  grader_used: v.optional(v.boolean()),
  cost_usd: v.optional(v.number()),
  input_tokens: v.optional(v.number()),
  output_tokens: v.optional(v.number()),
  total_tokens: v.optional(v.number()),
  models_used: v.optional(v.array(v.string())),
});

/** Append one batch of battery runs. The harness checkpoints after every task
 * so an interrupted sweep keeps the runs it already paid for. */
export const _record = internalMutation({
  args: { runs: v.array(runValidator) },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const run of args.runs) {
      if (
        run.accuracy_score !== undefined &&
        (!Number.isFinite(run.accuracy_score) ||
          run.accuracy_score < 0 ||
          run.accuracy_score > 1)
      ) {
        throw new Error(
          `${run.agent_id}/${run.golden_id}: accuracy_score ${run.accuracy_score} outside [0,1]`,
        );
      }
      if (
        run.cost_usd !== undefined &&
        (!Number.isFinite(run.cost_usd) || run.cost_usd < 0)
      ) {
        throw new Error(`${run.agent_id}/${run.golden_id}: negative or non-finite cost`);
      }
      await ctx.db.insert("battery_runs", { ...run, created_at: Date.now() });
      inserted += 1;
    }
    return { inserted };
  },
});

/** Golden tasks the battery should sweep. */
export const _enabledGoldenTasks = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const tasks = await ctx.db.query("golden_tasks").take(500);
    return tasks
      .filter((t) => t.enabled)
      .map((t) => ({
        _id: t._id,
        golden_id: t.golden_id,
        title: t.title,
        prompt: t.prompt,
        task_type: t.task_type,
        max_budget: t.max_budget,
        reference_answer: t.reference_answer,
        success_criteria: t.success_criteria,
        required_substrings: t.required_substrings ?? [],
      }));
  },
});

/**
 * Metric-ready view of a battery.
 *
 * Marginal-gain pairs are ordered by REAL measured cost, so "small" is genuinely
 * the cheaper agent. That ordering is what `hive_evaluations` cannot supply — it
 * records no per-agent cost, so its signed gains cancel by construction and only
 * the unsigned gap means anything.
 */
export const _batterySummary = internalQuery({
  args: { battery_id: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = args.battery_id
      ? await ctx.db
          .query("battery_runs")
          .withIndex("by_battery", (q) => q.eq("battery_id", args.battery_id!))
          .take(20000)
      : await ctx.db.query("battery_runs").take(20000);

    const complete = rows.filter(
      (r) => r.status === "complete" && r.accuracy_score !== undefined,
    );

    const byTask = new Map<string, typeof complete>();
    for (const r of complete) {
      const list = byTask.get(r.golden_id) ?? [];
      list.push(r);
      byTask.set(r.golden_id, list);
    }

    const gainObservations: MarginalGainObservation[] = [];
    for (const [goldenId, runs] of byTask) {
      if (runs.length < 2) continue;
      // Sort by real cost so the cheap/expensive assignment is meaningful.
      const sorted = [...runs].sort((a, b) => (a.cost_usd ?? 0) - (b.cost_usd ?? 0));
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          gainObservations.push({
            query_id: `${goldenId}:${sorted[i].agent_id}->${sorted[j].agent_id}`,
            small_quality: sorted[i].accuracy_score ?? 0,
            large_quality: sorted[j].accuracy_score ?? 0,
            small_cost: sorted[i].cost_usd ?? 0,
            large_cost: sorted[j].cost_usd ?? 0,
          });
        }
      }
    }

    const costAccuracy = complete
      .filter((r) => (r.cost_usd ?? 0) > 0)
      .map((r) => ({ cost: r.cost_usd!, accuracy: r.accuracy_score! }));

    const labelledBids = rows.filter(
      (r) => r.confidence !== undefined && r.accuracy_score !== undefined,
    ).length;

    const tokenRuns = complete.filter((r) => (r.total_tokens ?? 0) > 0);

    return {
      battery_ids: [...new Set(rows.map((r) => r.battery_id))],
      total_runs: rows.length,
      complete: complete.length,
      declined: rows.filter((r) => r.status === "declined").length,
      errored: rows.filter((r) => r.status === "error").length,
      distinct_tasks: byTask.size,
      distinct_agents: new Set(rows.map((r) => r.agent_id)).size,
      tasks_with_2plus_agents: [...byTask.values()].filter((v2) => v2.length >= 2)
        .length,
      comparable_pairs: gainObservations.length,
      gain_summary:
        gainObservations.length > 0
          ? summarizeMarginalGain(gainObservations)
          : undefined,
      cost_accuracy: costAccuracy,
      curve_steps: costCoverageCurve(costAccuracy).length,
      labelled_bids: labelledBids,
      token_runs: tokenRuns.length,
      total_cost_usd: Number(
        rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(6),
      ),
      arms: [...new Set(rows.map((r) => r.arm))],
    };
  },
});
