import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { canTransitionTask, type AcpTaskState } from "../lib/acp";

async function rowByRunId(
  ctx: MutationCtx,
  runId: string,
) {
  return await ctx.db
    .query("a2a_task_runs")
    .withIndex("by_run_id", (q) => q.eq("run_id", runId))
    .unique();
}

export const start = mutation({
  args: {
    run_id: v.string(),
    agent_id: v.string(),
    intent: v.string(),
    tool: v.string(),
    prompt: v.string(),
    requester_agent_id: v.optional(v.string()),
    requester_did: v.optional(v.string()),
    protocol_version: v.optional(v.string()),
    sla: v.optional(v.any()),
    negotiated_format: v.optional(v.union(v.literal("json"), v.literal("toon"))),
  },
  handler: async (ctx, args) => {
    const existing = await rowByRunId(ctx, args.run_id);
    if (existing) return { run_id: args.run_id, idempotent: true };
    const now = Date.now();
    await ctx.db.insert("a2a_task_runs", {
      ...args,
      state: "submitted",
      created_at: now,
      updated_at: now,
    });
    return { run_id: args.run_id, idempotent: false };
  },
});

async function transition(
  ctx: MutationCtx,
  runId: string,
  state: AcpTaskState,
  patch: Record<string, unknown> = {},
) {
  const row = await rowByRunId(ctx, runId);
  if (!row) return { ok: false as const, missing: true as const };
  if (!canTransitionTask(row.state as AcpTaskState, state)) {
    return { ok: false as const, terminal: true as const, state: row.state };
  }
  await ctx.db.patch(row._id, {
    ...patch,
    state,
    updated_at: Date.now(),
  });
  return { ok: true as const, state };
}

export const setWorking = mutation({
  args: { run_id: v.string() },
  handler: async (ctx, args) => transition(ctx, args.run_id, "working"),
});

export const setInputRequired = mutation({
  args: { run_id: v.string(), message: v.string() },
  handler: async (ctx, args) =>
    transition(ctx, args.run_id, "input-required", {
      error_message: args.message,
    }),
});

export const complete = mutation({
  args: { run_id: v.string(), artifact: v.any() },
  handler: async (ctx, args) =>
    transition(ctx, args.run_id, "completed", { artifact: args.artifact }),
});

export const fail = mutation({
  args: { run_id: v.string(), error_message: v.string() },
  handler: async (ctx, args) =>
    transition(ctx, args.run_id, "failed", {
      error_message: args.error_message,
    }),
});

export const reject = mutation({
  args: { run_id: v.string(), error_message: v.string() },
  handler: async (ctx, args) =>
    transition(ctx, args.run_id, "rejected", {
      error_message: args.error_message,
    }),
});

export const cancel = mutation({
  args: { run_id: v.string() },
  handler: async (ctx, args) =>
    transition(ctx, args.run_id, "canceled", { cancel_requested: true }),
});

export const getByRunId = query({
  args: { run_id: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("a2a_task_runs")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .unique();
  },
});
