import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Corpus counts behind the Agent System Trilemma report (eval/trilemma/run.ts).
 *
 * Read-only and aggregate-only — it returns counts and one auction's bid field,
 * never task content. The point of the endpoint is to make the data gap
 * measurable: three of the four trilemma metrics need a query x agent matrix of
 * graded outcomes, and this is what says how far off that is.
 */
export const corpusCounts = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const evals = await ctx.db.query("hive_evaluations").take(20000);

    // Crossing: nodes graded on 2+ agents are the only place a per-query
    // quality DIFFERENTIAL can be observed at all.
    const byNode = new Map<string, Map<string, number>>();
    for (const e of evals) {
      // node_id is optional on the row; an evaluation not tied to a node has
      // no query to cross agents on, so it cannot contribute a pair.
      if (!e.node_id) continue;
      if (!byNode.has(e.node_id)) byNode.set(e.node_id, new Map());
      byNode.get(e.node_id)!.set(e.agent_id, e.score);
    }

    let comparablePairs = 0;
    let nodesWith2Plus = 0;
    const gainObservations: Array<{
      query_id: string;
      small_quality: number;
      large_quality: number;
      small_cost: number;
      large_cost: number;
    }> = [];

    for (const [nodeId, scores] of byNode) {
      if (scores.size < 2) continue;
      nodesWith2Plus += 1;
      const entries = [...scores.entries()];
      comparablePairs += (entries.length * (entries.length - 1)) / 2;

      // Cost per agent is not recorded per evaluation, so the cheap/expensive
      // split cannot be made on price. Ordering by agent reputation is the
      // closest available stand-in and is NOT the same thing — recorded here so
      // the caller can see the gain arithmetic, not so it can be trusted.
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          gainObservations.push({
            query_id: nodeId,
            small_quality: entries[i][1],
            large_quality: entries[j][1],
            small_cost: 0,
            large_cost: 0,
          });
        }
      }
    }

    // There is no llm_usage table. lib/llm-usage.ts computes real token spend
    // per call but nothing persists it, so accuracy-per-thinking-token has no
    // sink to read from — a harder blocker than an empty table, because the
    // fix is a schema plus a write path, not just a backfill.
    const goldenRuns = await ctx.db.query("golden_task_runs").take(1000);
    const repDims = await ctx.db.query("reputation_dimensions").take(20000);
    const labelledBids = repDims.filter((r) => r.confidence !== undefined).length;

    // Cost/accuracy operating points: a settled row carries both a price paid
    // and a judged quality, which is exactly one point on the curve.
    const costAccuracy = repDims
      .filter((r) => r.price_paid > 0 && Number.isFinite(r.quality_score))
      .map((r) => ({ cost: r.price_paid, accuracy: r.quality_score }));
    const costAccuracyPoints = costAccuracy.length;

    // Most recent auction with a contested field, for the beta sweep. Beta is a
    // policy knob, so this needs no historical labels — it demonstrates the
    // trade-off on live bids.
    const recentTasks = await ctx.db.query("tasks").order("desc").take(120);
    let recentBids: Array<{
      agent_id: string;
      confidence: number;
      cost: number;
      latency_seconds: number;
    }> = [];
    let recentBidBudget = 1;
    for (const task of recentTasks) {
      const bids = await ctx.db
        .query("bids")
        .withIndex("by_task", (q) => q.eq("task_id", task._id))
        .collect();
      if (bids.length < 3) continue;
      recentBidBudget = task.max_budget > 0 ? task.max_budget : 1;
      recentBids = bids.map((b) => ({
        agent_id: b.agent_id,
        // p_accept is the calibrated figure; fall back to the raw self-report
        // and then to the neutral prior on legacy rows.
        confidence: b.p_accept ?? b.confidence ?? 0.5,
        cost: b.bid_price,
        latency_seconds: b.estimated_seconds,
      }));
      break;
    }

    return {
      eval_rows: evals.length,
      distinct_nodes: byNode.size,
      distinct_agents: new Set(evals.map((e) => e.agent_id)).size,
      nodes_with_2plus_agents: nodesWith2Plus,
      comparable_pairs: comparablePairs,
      gain_observations: gainObservations,
      llm_usage_rows: 0,
      llm_usage_table_exists: false,
      golden_task_runs: goldenRuns.length,
      // A matched-budget run needs a MAS arm and a single-agent arm on the same
      // task with recorded token counts. No harness produces this yet.
      matched_budget_runs: 0,
      cost_accuracy_points: costAccuracyPoints,
      cost_accuracy: costAccuracy,
      labelled_bids: labelledBids,
      recent_bids: recentBids,
      recent_bid_budget: recentBidBudget,
    };
  },
});
