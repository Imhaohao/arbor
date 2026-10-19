// Public read model for the operator dashboard's summary cards. Every field
// here is computed directly from the `tasks` + `lifecycle_events` tables —
// there is no stored "last period" snapshot anywhere in the schema, so this
// intentionally never returns a week-over-week delta. Inventing one would be
// worse than omitting it.
//
// Population is taskList.scanVisibleTasks: the caller's own top-level tasks
// (all of them for admins or unauthenticated deployments), newest first,
// excluding planner sub-steps and golden-task audit runs.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { scanVisibleTasks } from "./taskList";

const TERMINAL_STATUSES = new Set([
  "complete",
  "disputed",
  "failed",
  "cancelled",
]);

// Bounded scan, matching taskList.ts's "recent activity, not full archive"
// convention. Comfortably covers the current table size with headroom.
const TASK_SCAN_LIMIT = 2000;

// Turnaround (settled_at - posted_at) requires walking each candidate task's
// full lifecycle_events trail, and the auction fan-out logs one
// bid_declined/bid_received row per bidder — often 40-80+ events for a single
// task. Averaging over every completed task would blow a single query's read
// budget, so this is a bounded sample of the most-recently-created completed
// tasks, not an all-time figure. Many rows (seed/demo data) carry no
// lifecycle_events at all, so we scan more candidates than we need matches
// for and stop early once enough are found.
const TURNAROUND_CANDIDATE_LIMIT = 150;
const TURNAROUND_SAMPLE_TARGET = 25;

export const overview = query({
  args: {},
  returns: v.object({
    total_tasks: v.number(),
    active_tasks: v.number(),
    completed_tasks: v.number(),
    terminal_tasks: v.number(),
    completion_rate: v.union(v.number(), v.null()),
    avg_turnaround_ms: v.union(v.number(), v.null()),
    turnaround_sample_size: v.number(),
  }),
  handler: async (ctx) => {
    const tasks = await scanVisibleTasks(ctx, TASK_SCAN_LIMIT);

    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "complete").length;
    const terminalCount = tasks.filter((t) =>
      TERMINAL_STATUSES.has(t.status),
    ).length;
    const active = total - terminalCount;
    const completionRate = terminalCount > 0 ? completed / terminalCount : null;

    // Turnaround sample: most-recently-created completed tasks that actually
    // carry a "settled" lifecycle event (i.e. ran through the live auction
    // path rather than being seeded directly).
    const completedCandidates = tasks
      .filter((t) => t.status === "complete")
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, TURNAROUND_CANDIDATE_LIMIT);

    let turnaroundSum = 0;
    let turnaroundCount = 0;
    for (const t of completedCandidates) {
      if (turnaroundCount >= TURNAROUND_SAMPLE_TARGET) break;
      const events = await ctx.db
        .query("lifecycle_events")
        .withIndex("by_task", (q) => q.eq("task_id", t._id))
        .collect();
      let latestSettled: number | undefined;
      for (const e of events) {
        if (
          e.event_type === "settled" &&
          (latestSettled === undefined || e.timestamp > latestSettled)
        ) {
          latestSettled = e.timestamp;
        }
      }
      if (latestSettled !== undefined) {
        turnaroundSum += latestSettled - t._creationTime;
        turnaroundCount += 1;
      }
    }

    return {
      total_tasks: total,
      active_tasks: active,
      completed_tasks: completed,
      terminal_tasks: terminalCount,
      completion_rate: completionRate,
      avg_turnaround_ms:
        turnaroundCount > 0 ? turnaroundSum / turnaroundCount : null,
      turnaround_sample_size: turnaroundCount,
    };
  },
});
