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

// PUBLIC: index of recent DAGs, ranked so the contested ones surface first.
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
      spend: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 25, 50);
    const dags = await ctx.db.query("hive_dags").order("desc").take(limit);

    const rows = [];
    for (const dag of dags) {
      const nodes = await ctx.db
        .query("hive_nodes")
        .withIndex("by_dag", (q) => q.eq("dag_id", dag._id))
        .take(100);
      const evaluations = await ctx.db
        .query("hive_evaluations")
        .withIndex("by_dag", (q) => q.eq("dag_id", dag._id))
        .take(300);
      const scored = evaluations.filter((e) => e.node_id);

      rows.push({
        dag_id: dag._id,
        goal: dag.goal,
        status: dag.status,
        created_at: dag.created_at,
        nodeCount: nodes.length,
        accepts: scored.filter((e) => e.verdict === "accept").length,
        rejects: scored.filter((e) => e.verdict === "reject").length,
        spend: nodes.reduce((sum, n) => sum + (n.cost_paid ?? 0), 0),
      });
    }

    // Most-contested first: a replay index sorted by recency buries the evidence.
    return rows.sort((a, b) => b.rejects - a.rejects || b.created_at - a.created_at);
  },
});
