// Public read model for the agent network canvas + its delivery terminus.
//
// Returns the raw substrate the canvas draws from — nodes for dependency edges,
// evaluations for verdict edges, scratchpad entries for what each agent actually
// said — plus whatever the run delivered. Graph construction lives in
// lib/hive/network-core.ts; this file only fetches.
//
// Delivery is reported honestly: `configured` reflects whether the deployment
// could publish at all, separately from whether this run produced an artifact.
// A canvas that ends in a green checkmark when nothing shipped is the exact
// failure mode this surface exists to prevent.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/** Scratchpad content is truncated — the canvas renders labels, not documents. */
const CONTENT_PREVIEW_CHARS = 400;

const graphNodeValidator = v.object({
  node_id: v.string(),
  depends_on: v.array(v.string()),
  assigned_agent_id: v.optional(v.string()),
});

const graphEvaluationValidator = v.object({
  node_id: v.optional(v.string()),
  agent_id: v.string(),
  judge_model: v.string(),
  score: v.number(),
  verdict: v.union(v.literal("accept"), v.literal("reject")),
  reasoning: v.string(),
  created_at: v.number(),
});

const graphEntryValidator = v.object({
  agent_id: v.string(),
  node_id: v.optional(v.string()),
  kind: v.string(),
  content: v.string(),
  gist: v.optional(v.string()),
  confidence: v.number(),
  created_at: v.number(),
});

const deliveryValidator = v.object({
  /** Whether this deployment holds credentials to publish to TikTok at all. */
  configured: v.boolean(),
  /**
   * TikTok's inbox endpoint lands a draft the account owner must finish posting.
   * Direct publishing requires an audited TikTok app, so this stays true until
   * that approval exists — the UI must not imply the video went live.
   */
  draftOnly: v.boolean(),
  artifacts: v.array(
    v.object({
      file_name: v.string(),
      media_kind: v.string(),
      status: v.string(),
      byte_size: v.optional(v.number()),
      duration_ms: v.optional(v.number()),
      created_at: v.number(),
    }),
  ),
  jobs: v.array(
    v.object({
      job_id: v.string(),
      provider: v.string(),
      operation: v.string(),
      status: v.string(),
      external_job_id: v.optional(v.string()),
      error_message: v.optional(v.string()),
      created_at: v.number(),
    }),
  ),
});

// PUBLIC: everything the agent network canvas needs for one DAG.
export const network = query({
  args: { dag_id: v.id("hive_dags") },
  returns: v.union(
    v.object({
      goal: v.string(),
      status: v.string(),
      nodes: v.array(graphNodeValidator),
      evaluations: v.array(graphEvaluationValidator),
      entries: v.array(graphEntryValidator),
      delivery: deliveryValidator,
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

    const entries = await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(400);

    const artifacts = await ctx.db
      .query("media_artifacts")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(50);

    const jobs = await ctx.db
      .query("provider_jobs")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(50);

    // Presence only — the token itself never leaves the deployment.
    const configured = Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim());

    return {
      goal: dag.goal,
      status: dag.status,
      nodes: nodes.map((n: Doc<"hive_nodes">) => ({
        node_id: n.node_id,
        depends_on: n.depends_on,
        assigned_agent_id: n.assigned_agent_id,
      })),
      evaluations: evaluations.map((e: Doc<"hive_evaluations">) => ({
        node_id: e.node_id,
        agent_id: e.agent_id,
        judge_model: e.judge_model,
        score: e.score,
        verdict: e.verdict,
        reasoning: e.reasoning,
        created_at: e.created_at,
      })),
      entries: entries.map((s: Doc<"scratchpad_entries">) => ({
        agent_id: s.agent_id,
        node_id: s.node_id,
        kind: s.kind,
        content: s.content.slice(0, CONTENT_PREVIEW_CHARS),
        gist: s.gist,
        confidence: s.confidence,
        created_at: s.created_at,
      })),
      delivery: {
        configured,
        draftOnly: true,
        artifacts: artifacts.map((a: Doc<"media_artifacts">) => ({
          file_name: a.file_name,
          media_kind: a.media_kind,
          status: a.status,
          byte_size: a.byte_size,
          duration_ms: a.duration_ms,
          created_at: a.created_at,
        })),
        jobs: jobs.map((j: Doc<"provider_jobs">) => ({
          job_id: j.job_id,
          provider: j.provider,
          operation: j.operation,
          status: j.status,
          external_job_id: j.external_job_id,
          error_message: j.error_message,
          created_at: j.created_at,
        })),
      },
    };
  },
});
