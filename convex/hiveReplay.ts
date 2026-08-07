// Public read model for the DAG replay view — the "discard pile".
//
// Everything here is already-settled history: what each node cost, what every
// judge said about it, and whether the DAG shipped or escalated. The point of
// exposing it is that Arbor's claim is verification, and a verification claim
// that can't be inspected is just marketing. Rejections and split verdicts are
// returned with the same fidelity as accepts — filtering the unflattering rows
// out here would defeat the entire purpose of the surface.
//
// Default Convex runtime only. Reads are index-based and bounded; a replay is a
// single page, never a live feed.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const dagStatusValidator = v.union(
  v.literal("planning"),
  v.literal("running"),
  v.literal("evaluating"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("escalated"),
);

const replayNodeValidator = v.object({
  node_id: v.string(),
  description: v.string(),
  depends_on: v.array(v.string()),
  status: v.string(),
  assigned_agent_id: v.optional(v.string()),
  eval_score: v.optional(v.number()),
  revision_count: v.optional(v.number()),
  cost_paid: v.optional(v.number()),
  bid_price: v.optional(v.number()),
  success_criteria: v.optional(v.string()),
  output_text: v.optional(v.string()),
});

const replayEvaluationValidator = v.object({
  node_id: v.optional(v.string()),
  agent_id: v.string(),
  score: v.number(),
  verdict: v.union(v.literal("accept"), v.literal("reject")),
  reasoning: v.string(),
  judge_model: v.string(),
  conflicts_with: v.optional(v.array(v.string())),
  created_at: v.number(),
});

const replayEscalationValidator = v.object({
  kind: v.union(v.literal("low_confidence"), v.literal("conflict_tie")),
  reason: v.string(),
  status: v.union(v.literal("open"), v.literal("resolved")),
  resolution: v.optional(v.string()),
  created_at: v.number(),
});

/** Node output text is truncated — the replay shows verdicts, not deliverables. */
const OUTPUT_PREVIEW_CHARS = 1200;

// PUBLIC: the full settled record for one DAG.
export const replay = query({
  args: { dag_id: v.id("hive_dags") },
  returns: v.union(
    v.object({
      dag: v.object({
        _id: v.id("hive_dags"),
        goal: v.string(),
        status: dagStatusValidator,
        planner_model: v.string(),
        max_budget: v.number(),
        created_at: v.number(),
        updated_at: v.number(),
      }),
      nodes: v.array(replayNodeValidator),
      evaluations: v.array(replayEvaluationValidator),
      escalations: v.array(replayEscalationValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const dag = await ctx.db.get(args.dag_id);
    if (!dag) return null;

    const nodes = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(100);

    const evaluations = await ctx.db
      .query("hive_evaluations")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(300);

    // escalations has no by_dag index; the root task is the available handle and
    // a DAG's escalation count is small enough that this stays a bounded read.
    const escalations = (
      await ctx.db
        .query("escalations")
        .withIndex("by_task", (q) => q.eq("task_id", dag.root_task_id))
        .take(50)
    ).filter((e) => e.dag_id === args.dag_id);

    return {
      dag: {
        _id: dag._id,
        goal: dag.goal,
        status: dag.status,
        planner_model: dag.planner_model,
        max_budget: dag.max_budget,
        created_at: dag.created_at,
        updated_at: dag.updated_at,
      },
      nodes: nodes.map((n: Doc<"hive_nodes">) => ({
        node_id: n.node_id,
        description: n.description,
        depends_on: n.depends_on,
        status: n.status,
        assigned_agent_id: n.assigned_agent_id,
        eval_score: n.eval_score,
        revision_count: n.revision_count,
        cost_paid: n.cost_paid,
        bid_price: n.bid_price,
        success_criteria: n.success_criteria,
        output_text: n.output_text?.slice(0, OUTPUT_PREVIEW_CHARS),
      })),
      evaluations: evaluations.map((e: Doc<"hive_evaluations">) => ({
        node_id: e.node_id,
        agent_id: e.agent_id,
        score: e.score,
        verdict: e.verdict,
        reasoning: e.reasoning,
        judge_model: e.judge_model,
        conflicts_with: e.conflicts_with,
        created_at: e.created_at,
      })),
      escalations: escalations.map((e: Doc<"escalations">) => ({
        kind: e.kind,
        reason: e.reason,
        status: e.status,
        resolution: e.resolution,
        created_at: e.created_at,
      })),
    };
  },
});

// How far back this index looks when ranking by contention. Bounded reads are
// the point of this file, so this stays a fixed window rather than a full
// table scan; at today's data scale (a few hundred DAGs, ~100 evaluations)
// this window covers the entire history, but if the tables outgrow it a
// denormalized reject count on hive_dags would be the next step rather than
// widening these numbers indefinitely.
const DAG_SCAN_WINDOW = 400;
const EVAL_SCAN_WINDOW = 4000;

// A replay is a record of a finished run. A DAG still planning/running/
// evaluating has nothing settled yet to play back.
const TERMINAL_STATUSES = new Set(["complete", "failed", "escalated"]);

// PUBLIC: index of recorded DAGs, ranked so the most-contested ones surface
// first.
//
// Two things broke that promise before this rewrite. First, the query took
// only the most recent `limit` DAGs and sorted *that window* by rejects — in
// this deployment the most recent DAGs are ~200 near-identical zero-reject
// roundtable smoke runs, so the sort had nothing to work with and the result
// was plain recency order wearing a contention-sort trenchcoat. Second, the
// same goal text repeats hundreds of times, so a page of "recent" rows was
// one row copy-pasted. This version ranks across a bounded window of actual
// history and collapses duplicate-goal rows to one (carrying a repeat count)
// so distinct runs make it onto the page instead of getting buried.
export const recentReplays = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      dag_id: v.id("hive_dags"),
      goal: v.string(),
      status: dagStatusValidator,
      created_at: v.number(),
      nodeCount: v.number(),
      accepts: v.number(),
      rejects: v.number(),
      // null means no node on this DAG ever recorded a cost — unknown, not
      // free. Summing missing costs as 0 would report "$0.00" for work that
      // was simply never metered, which is a false zero-cost claim.
      spend: v.union(v.number(), v.null()),
      // How many DAGs in the scanned window share this exact goal text.
      // >1 means this row stands in for a cluster of collapsed duplicates.
      goalRepeatCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 25, 50);

    const dags = (
      await ctx.db.query("hive_dags").order("desc").take(DAG_SCAN_WINDOW)
    ).filter((d) => TERMINAL_STATUSES.has(d.status));

    // hive_evaluations has no index on verdict or a dag-agnostic scope, so one
    // bounded scan grouped in memory beats issuing an indexed by_dag query per
    // candidate DAG — the table is small (under a thousand rows today) and
    // this reads it once instead of once per DAG.
    const evaluations = await ctx.db
      .query("hive_evaluations")
      .order("desc")
      .take(EVAL_SCAN_WINDOW);
    const verdictsByDag = new Map<
      string,
      { accepts: number; rejects: number }
    >();
    for (const e of evaluations) {
      if (!e.node_id) continue;
      const bucket = verdictsByDag.get(e.dag_id) ?? { accepts: 0, rejects: 0 };
      if (e.verdict === "accept") bucket.accepts += 1;
      else bucket.rejects += 1;
      verdictsByDag.set(e.dag_id, bucket);
    }

    const goalRepeatCounts = new Map<string, number>();
    for (const dag of dags) {
      goalRepeatCounts.set(dag.goal, (goalRepeatCounts.get(dag.goal) ?? 0) + 1);
    }

    const ranked = dags
      .map((dag) => {
        const verdicts = verdictsByDag.get(dag._id) ?? {
          accepts: 0,
          rejects: 0,
        };
        return { dag, ...verdicts };
      })
      // Most-contested first, by raw reject count rather than a ratio: a DAG
      // with 11 rejects out of 12 verdicts is more contested than one with 1
      // reject out of 1, even though the latter has the higher rate.
      .sort(
        (a, b) => b.rejects - a.rejects || b.dag.created_at - a.dag.created_at,
      );

    const seenGoals = new Set<string>();
    const picked: typeof ranked = [];
    for (const candidate of ranked) {
      if (seenGoals.has(candidate.dag.goal)) continue;
      seenGoals.add(candidate.dag.goal);
      picked.push(candidate);
      if (picked.length >= limit) break;
    }

    const rows = [];
    for (const { dag, accepts, rejects } of picked) {
      const nodes = await ctx.db
        .query("hive_nodes")
        .withIndex("by_dag", (q) => q.eq("dag_id", dag._id))
        .take(100);
      const knownCosts = nodes
        .map((n) => n.cost_paid)
        .filter((c): c is number => c !== undefined);

      rows.push({
        dag_id: dag._id,
        goal: dag.goal,
        status: dag.status,
        created_at: dag.created_at,
        nodeCount: nodes.length,
        accepts,
        rejects,
        spend:
          knownCosts.length > 0
            ? knownCosts.reduce((sum, c) => sum + c, 0)
            : null,
        goalRepeatCount: goalRepeatCounts.get(dag.goal) ?? 1,
      });
    }

    return rows;
  },
});
