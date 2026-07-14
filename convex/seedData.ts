import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const _upsertAgent = internalMutation({
  args: {
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    capabilities: v.array(v.string()),
    system_prompt: v.string(),
    cost_per_task_estimate: v.number(),
    reputation_score: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return null;
    }
    await ctx.db.insert("agents", {
      ...args,
      total_tasks_completed: 0,
      total_disputes_lost: 0,
    });
    return null;
  },
});
