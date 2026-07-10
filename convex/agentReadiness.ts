import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const stageStatusValidator = v.union(
  v.literal("pass"),
  v.literal("fail"),
  v.literal("declined"),
  v.literal("skipped"),
  v.literal("not_applicable"),
);

const smokeResultFields = {
  run_id: v.string(),
  agent_id: v.string(),
  owner: v.string(),
  source: v.string(),
  transport: v.string(),
  endpoint: v.optional(v.string()),
  required_key_env: v.optional(v.string()),
  task_class: v.string(),
  task_prompt: v.string(),
  transport_status: v.string(),
  readiness_status: v.string(),
  probe_status: stageStatusValidator,
  bid_status: stageStatusValidator,
  execution_status: stageStatusValidator,
  judge_status: stageStatusValidator,
  eval_status: stageStatusValidator,
  scratchpad_status: stageStatusValidator,
  settlement_eligible: v.boolean(),
  dashboard_status: v.string(),
  failure_bucket: v.string(),
  evidence: v.optional(v.string()),
  error_message: v.optional(v.string()),
  duration_ms: v.number(),
};

function redactStored(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/([?&](?:config|key|token|secret|credential)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|hs)[-_][A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/\b[A-Za-z0-9_-]{64,}\b/g, "[REDACTED_TOKEN]");
}

export const _redactStoredEvidence = internalMutation({
  args: {},
  returns: v.object({ results: v.number(), matrix: v.number() }),
  handler: async (ctx) => {
    const results = await ctx.db.query("agent_smoke_results").take(1000);
    for (const row of results) {
      await ctx.db.patch(row._id, {
        endpoint: redactStored(row.endpoint),
        evidence: redactStored(row.evidence),
        error_message: redactStored(row.error_message),
      });
    }
    const matrix = await ctx.db.query("agent_readiness").take(1000);
    for (const row of matrix) {
      await ctx.db.patch(row._id, {
        endpoint: redactStored(row.endpoint),
        note: redactStored(row.note),
      });
    }
    return { results: results.length, matrix: matrix.length };
  },
});

export const startSmokeRun = mutation({
  args: {
    run_id: v.string(),
    mode: v.union(v.literal("probe"), v.literal("full")),
  },
  returns: v.object({ run_id: v.string(), total_agents: v.number() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_smoke_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .unique();
    if (existing) {
      return { run_id: existing.run_id, total_agents: existing.total_agents };
    }
    const agents = await ctx.db.query("agents").take(1000);
    const now = Date.now();
    const scratchpad_task_id = await ctx.db.insert("tasks", {
      posted_by: `readiness-smoke:${args.run_id}`,
      task_type: "readiness-smoke",
      prompt: `Per-agent readiness smoke ${args.run_id}`,
      max_budget: 0,
      status: "complete",
      bid_window_seconds: 0,
      bid_window_closes_at: now,
      workflow_mode: "readiness-smoke",
    });
    const scratchpad_dag_id = await ctx.db.insert("hive_dags", {
      root_task_id: scratchpad_task_id,
      goal: `Persist per-agent smoke evidence for ${args.run_id}`,
      status: "complete",
      planner_model: "readiness-smoke",
      max_budget: 0,
      created_at: now,
      updated_at: now,
    });
    await ctx.db.patch(scratchpad_task_id, { hive_dag_id: scratchpad_dag_id });
    await ctx.db.insert("agent_smoke_runs", {
      run_id: args.run_id,
      mode: args.mode,
      status: "running",
      total_agents: agents.length,
      processed_agents: 0,
      ready_agents: 0,
      scratchpad_task_id,
      scratchpad_dag_id,
      started_at: now,
      updated_at: now,
    });
    return { run_id: args.run_id, total_agents: agents.length };
  },
});

export const _getRun = internalQuery({
  args: { run_id: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"agent_smoke_runs"> | null> => {
    return await ctx.db
      .query("agent_smoke_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .unique();
  },
});

export const _recordSmokeResult = internalMutation({
  args: smokeResultFields,
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const existingResult = await ctx.db
      .query("agent_smoke_results")
      .withIndex("by_run_id_and_agent_id", (q) =>
        q.eq("run_id", args.run_id).eq("agent_id", args.agent_id),
      )
      .unique();
    if (existingResult) return { inserted: false };

    const now = Date.now();
    const run = await ctx.db
      .query("agent_smoke_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .unique();
    let scratchpad_entry_id: Id<"scratchpad_entries"> | undefined;
    if (args.scratchpad_status === "pass") {
      if (!run?.scratchpad_dag_id || !run.scratchpad_task_id) {
        throw new Error(`smoke run ${args.run_id} has no scratchpad DAG`);
      }
      scratchpad_entry_id = await ctx.db.insert("scratchpad_entries", {
        dag_id: run.scratchpad_dag_id,
        node_id: `smoke:${args.agent_id}`,
        task_id: run.scratchpad_task_id,
        agent_id: args.agent_id,
        kind: "result",
        namespace: "readiness-smoke",
        content: args.evidence ?? "smoke delivery produced material output",
        content_format: "text",
        content_type: "text/plain",
        verified_writer: false,
        confidence: 1,
        created_at: now,
      });
      const persisted = await ctx.db.get(scratchpad_entry_id);
      if (!persisted || persisted.agent_id !== args.agent_id) {
        throw new Error(`scratchpad round trip failed for ${args.agent_id}`);
      }
    }
    await ctx.db.insert("agent_smoke_results", {
      ...args,
      scratchpad_entry_id,
      created_at: now,
    });

    const existingMatrix = await ctx.db
      .query("agent_readiness")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .unique();
    const matrix: Omit<Doc<"agent_readiness">, "_id" | "_creationTime"> = {
      agent_id: args.agent_id,
      source: args.source,
      transport: args.transport,
      owner: args.owner,
      endpoint: args.endpoint,
      required_key_env: args.required_key_env,
      transport_status: args.transport_status,
      readiness_status: args.readiness_status,
      latest_probe_status: args.probe_status,
      last_bid_status: args.bid_status,
      last_exec_status: args.execution_status,
      latest_judge_status: args.judge_status,
      latest_eval_status: args.eval_status,
      latest_scratchpad_status: args.scratchpad_status,
      settlement_eligible: args.settlement_eligible,
      dashboard_status: "visible",
      failure_bucket: args.failure_bucket,
      latest_smoke_run_id: args.run_id,
      task_class: args.task_class,
      note: args.error_message ?? args.evidence,
      updated_at: now,
    };
    if (existingMatrix) {
      await ctx.db.replace(existingMatrix._id, matrix);
    } else {
      await ctx.db.insert("agent_readiness", matrix);
    }

    if (run) {
      const processed = run.processed_agents + 1;
      await ctx.db.patch(run._id, {
        processed_agents: processed,
        ready_agents:
          run.ready_agents + (args.readiness_status === "ready" ? 1 : 0),
        status: processed >= run.total_agents ? "complete" : "running",
        completed_at: processed >= run.total_agents ? now : undefined,
        updated_at: now,
      });
    }
    return { inserted: true };
  },
});

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx): Promise<Array<Doc<"agent_readiness">>> => {
    const rows = await ctx.db.query("agent_readiness").take(1000);
    return rows.sort((a, b) => b.updated_at - a.updated_at);
  },
});

export const get = query({
  args: { agent_id: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"agent_readiness"> | null> => {
    return await ctx.db
      .query("agent_readiness")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .unique();
  },
});

export const latestRun = query({
  args: {},
  returns: v.union(v.any(), v.null()),
  handler: async (ctx): Promise<Doc<"agent_smoke_runs"> | null> => {
    return await ctx.db
      .query("agent_smoke_runs")
      .withIndex("by_started_at")
      .order("desc")
      .first();
  },
});

export const latestCompleteRun = query({
  args: {},
  returns: v.union(v.any(), v.null()),
  handler: async (ctx): Promise<Doc<"agent_smoke_runs"> | null> => {
    return await ctx.db
      .query("agent_smoke_runs")
      .withIndex("by_started_at")
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "complete"))
      .first();
  },
});

export const runSummary = query({
  args: { run_id: v.string() },
  returns: v.object({
    run: v.union(v.any(), v.null()),
    by_readiness: v.record(v.string(), v.number()),
    by_failure: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agent_smoke_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .unique();
    const results = await ctx.db
      .query("agent_smoke_results")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .take(1000);
    const by_readiness: Record<string, number> = {};
    const by_failure: Record<string, number> = {};
    for (const result of results) {
      by_readiness[result.readiness_status] =
        (by_readiness[result.readiness_status] ?? 0) + 1;
      by_failure[result.failure_bucket] =
        (by_failure[result.failure_bucket] ?? 0) + 1;
    }
    return { run, by_readiness, by_failure };
  },
});

export const resultsForRun = query({
  args: { run_id: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"agent_smoke_results">>> => {
    return await ctx.db
      .query("agent_smoke_results")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .take(1000);
  },
});
