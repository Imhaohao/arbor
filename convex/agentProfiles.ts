// FlyRoute data flywheel (W3): durable capability profiles per (agent,
// task-class), updated on every settled hive node and read back by the router
// to weight its shortlist. The EWMA/uncertainty math lives in
// lib/hive/profile-core.ts (pure, unit-tested); this module is only the
// Convex persistence + query surface.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  emptyProfile,
  updateProfile,
  type AgentProfile,
} from "../lib/hive/profile-core";

const profileValidator = v.object({
  agent_id: v.string(),
  task_class: v.string(),
  tasks: v.number(),
  successful_tasks: v.number(),
  success_trials: v.number(),
  success_rate: v.number(),
  avg_quality: v.number(),
  avg_latency_seconds: v.number(),
  avg_price: v.number(),
  uncertainty: v.number(),
  updated_at: v.number(),
});

function toProfile(row: Doc<"agent_profiles">): AgentProfile {
  return {
    agent_id: row.agent_id,
    task_class: row.task_class,
    tasks: row.tasks,
    successful_tasks: row.successful_tasks ?? 0,
    success_trials: row.success_trials ?? 0,
    success_rate: row.success_rate,
    avg_quality: row.avg_quality,
    avg_latency_seconds: row.avg_latency_seconds,
    avg_price: row.avg_price,
    uncertainty: row.uncertainty,
    updated_at: row.updated_at,
  };
}

/**
 * Fold one settled-node outcome into the agent's profile for that task class.
 * Upsert: first outcome for an (agent, class) pair creates the row from the
 * neutral prior. Callers fire-and-forget this from the orchestrator settle
 * path — it must never throw on odd inputs, so inputs are normalized here.
 */
export const _recordOutcome = internalMutation({
  args: {
    agent_id: v.string(),
    task_class: v.optional(v.string()),
    success: v.boolean(),
    quality_score: v.optional(v.number()),
    latency_seconds: v.optional(v.number()),
    price_paid: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const agentId = args.agent_id.trim();
    if (!agentId || agentId === "unknown") return null;
    const taskClass = (args.task_class ?? "general").trim() || "general";
    const now = Date.now();

    const existing = await ctx.db
      .query("agent_profiles")
      .withIndex("by_agent_and_class", (q) =>
        q.eq("agent_id", agentId).eq("task_class", taskClass),
      )
      .first();

    const prev = existing ? toProfile(existing) : emptyProfile(agentId, taskClass, now);
    const next = updateProfile(prev, {
      agent_id: agentId,
      task_class: taskClass,
      success: args.success,
      quality_score: args.quality_score,
      latency_seconds: args.latency_seconds,
      price_paid: args.price_paid,
      settled_at: now,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        tasks: next.tasks,
        successful_tasks: next.successful_tasks,
        success_trials: next.success_trials,
        success_rate: next.success_rate,
        avg_quality: next.avg_quality,
        avg_latency_seconds: next.avg_latency_seconds,
        avg_price: next.avg_price,
        uncertainty: next.uncertainty,
        updated_at: next.updated_at,
      });
    } else {
      await ctx.db.insert("agent_profiles", {
        agent_id: next.agent_id,
        task_class: next.task_class,
        tasks: next.tasks,
        successful_tasks: next.successful_tasks,
        success_trials: next.success_trials,
        success_rate: next.success_rate,
        avg_quality: next.avg_quality,
        avg_latency_seconds: next.avg_latency_seconds,
        avg_price: next.avg_price,
        uncertainty: next.uncertainty,
        updated_at: next.updated_at,
      });
    }
    return null;
  },
});

/**
 * Profiles for a set of agents in one task class, with per-agent fallback to
 * the "general" class when no class-specific profile exists yet. Returns only
 * agents that have SOME profile — the router treats absent agents as the
 * neutral prior.
 */
export const _profilesFor = internalQuery({
  args: {
    agent_ids: v.array(v.string()),
    task_class: v.optional(v.string()),
  },
  returns: v.array(profileValidator),
  handler: async (ctx, args): Promise<AgentProfile[]> => {
    const taskClass = (args.task_class ?? "general").trim() || "general";
    const out: AgentProfile[] = [];
    for (const rawId of args.agent_ids.slice(0, 64)) {
      const agentId = rawId.trim();
      if (!agentId) continue;
      const exact = await ctx.db
        .query("agent_profiles")
        .withIndex("by_agent_and_class", (q) =>
          q.eq("agent_id", agentId).eq("task_class", taskClass),
        )
        .first();
      if (exact) {
        out.push(toProfile(exact));
        continue;
      }
      if (taskClass !== "general") {
        const general = await ctx.db
          .query("agent_profiles")
          .withIndex("by_agent_and_class", (q) =>
            q.eq("agent_id", agentId).eq("task_class", "general"),
          )
          .first();
        if (general) out.push(toProfile(general));
      }
    }
    return out;
  },
});
