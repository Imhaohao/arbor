// Public read model for the "/tasks" index — a plain list of top-level tasks
// posted to the marketplace, most recent first. Sub-steps created by the
// planner (`_createChild`) carry `parent_task_id` and are intentionally
// excluded here: they're implementation detail of a parent task's plan, not
// separate asks a buyer posted, and showing them would double the row count
// for every decomposed task.
//
// Default Convex runtime only. Bounded, non-paginated: this is a recent-
// activity list, not a full task archive.

import { v } from "convex/values";
import { query } from "./_generated/server";

const taskStatusValidator = v.union(
  v.literal("open"),
  v.literal("planning"),
  v.literal("plan_review"),
  v.literal("bidding"),
  v.literal("awarded"),
  v.literal("requires_payment"),
  v.literal("executing"),
  v.literal("judging"),
  v.literal("synthesizing"),
  v.literal("complete"),
  v.literal("disputed"),
  v.literal("cancelled"),
  v.literal("failed"),
);

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
// How many rows to scan before filtering out sub-tasks. Padded above the
// requested limit so a run of child-heavy tasks doesn't starve the page.
const SCAN_MULTIPLIER = 3;

// PUBLIC: recent top-level tasks, newest first.
export const recentTasks = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      task_id: v.id("tasks"),
      prompt: v.string(),
      task_type: v.string(),
      status: taskStatusValidator,
      max_budget: v.number(),
      price_paid: v.optional(v.number()),
      posted_by: v.string(),
      created_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const scanned = await ctx.db
      .query("tasks")
      .order("desc")
      .take(limit * SCAN_MULTIPLIER);

    const topLevel = scanned.filter((t) => !t.parent_task_id);

    // Golden-task audit runs post through the normal auction as ordinary tasks
    // so bidders cannot distinguish them. They are Arbor's own instrumentation,
    // not marketplace activity, and the audit lane posts up to 24/day — left in
    // they swamp this list with arithmetic and extraction drills. Filtering is
    // UI-only and cannot leak: bidders see the auction, never this page.
    const goldenRuns = await Promise.all(
      topLevel.map((t) =>
        ctx.db
          .query("golden_task_runs")
          .withIndex("by_task", (q) => q.eq("task_id", t._id))
          .unique(),
      ),
    );
    const goldenTaskIds = new Set(
      goldenRuns.filter((r) => r !== null).map((r) => r!.task_id),
    );

    return topLevel
      .filter((t) => !goldenTaskIds.has(t._id))
      .slice(0, limit)
      .map((t) => ({
        task_id: t._id,
        prompt: t.prompt,
        task_type: t.task_type,
        status: t.status,
        max_budget: t.max_budget,
        price_paid: t.price_paid,
        posted_by: t.posted_by,
        created_at: t._creationTime,
      }));
  },
});
