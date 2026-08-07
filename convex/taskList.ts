// Public read model for the "/tasks" index — a plain list of top-level tasks
// posted to the marketplace, most recent first. Sub-steps created by the
// planner (`_createChild`) carry `parent_task_id` and are intentionally
// excluded here: they're implementation detail of a parent task's plan, not
// separate asks a buyer posted, and showing them would double the row count
// for every decomposed task.
//
// Default Convex runtime only. Bounded, non-paginated: this is a recent-
// activity view, not a full task archive. Status-bucket filtering, search,
// and the bucket counts all read from the same bounded scan window
// (FILTER_SCAN_CAP) — there is no status index on `tasks` (schema changes
// are out of scope for this file), so as the table grows well past that
// window this trades "sees every task ever" for "sees every task in the
// recent window."

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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
// How many rows to scan before filtering out sub-tasks, on the plain
// (no bucket/search) path. Padded above the requested limit so a run of
// child-heavy tasks doesn't starve the page.
const SCAN_MULTIPLIER = 3;
// Wider bounded scan used whenever a status bucket or search term narrows
// the result set: matches can be sparse (e.g. one keyword across hundreds of
// tasks), so the plain SCAN_MULTIPLIER window isn't enough. Still a single
// bounded `.take()`, never `.collect()`. Also the scan window backing the
// bucket counts shown in the filter chips.
const FILTER_SCAN_CAP = 2000;

// Plain-language groupings over the raw status union, shown as the /tasks
// filter chips. Defined here (not just in the client) so the bucket
// boundaries and their real-data counts come from one source of truth.
// The underlying `status` values on `tasks` rows are never changed — this is
// presentation-only grouping.
export const STATUS_BUCKETS = {
  active: [
    "open",
    "planning",
    "plan_review",
    "bidding",
    "awarded",
    "requires_payment",
    "executing",
    "judging",
    "synthesizing",
  ],
  complete: ["complete"],
  rejected: ["disputed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
} as const satisfies Record<string, readonly string[]>;

export type StatusBucket = keyof typeof STATUS_BUCKETS;

const STATUS_TO_BUCKET = Object.fromEntries(
  (Object.entries(STATUS_BUCKETS) as Array<[StatusBucket, readonly string[]]>).flatMap(
    ([bucket, statuses]) => statuses.map((status) => [status, bucket] as const),
  ),
) as Record<string, StatusBucket>;

const statusBucketValidator = v.union(
  v.literal("active"),
  v.literal("complete"),
  v.literal("rejected"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const taskRowValidator = v.object({
  task_id: v.id("tasks"),
  prompt: v.string(),
  task_type: v.string(),
  status: taskStatusValidator,
  max_budget: v.number(),
  price_paid: v.optional(v.number()),
  posted_by: v.string(),
  created_at: v.number(),
});

/**
 * Shared scan: top-level (no parent_task_id), non-golden-audit tasks, newest
 * first, bounded to `scanCount` rows read.
 *
 * Golden-task audit runs post through the normal auction as ordinary tasks
 * so bidders cannot distinguish them. They are Arbor's own instrumentation,
 * not marketplace activity, and the audit lane posts up to 24/day — left in
 * they swamp this list with arithmetic and extraction drills. Filtering is
 * UI-only and cannot leak: bidders see the auction, never this page.
 */
async function scanVisibleTasks(
  ctx: QueryCtx,
  scanCount: number,
): Promise<Doc<"tasks">[]> {
  const scanned = await ctx.db.query("tasks").order("desc").take(scanCount);
  const topLevel = scanned.filter((t) => !t.parent_task_id);

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

  return topLevel.filter((t) => !goldenTaskIds.has(t._id));
}

function matchesBucket(task: Doc<"tasks">, bucket: StatusBucket | undefined): boolean {
  if (!bucket) return true;
  return STATUS_TO_BUCKET[task.status] === bucket;
}

function matchesSearch(task: Doc<"tasks">, search: string | undefined): boolean {
  if (!search) return true;
  return task.prompt.toLowerCase().includes(search);
}

// PUBLIC: recent top-level tasks, newest first. Optional `bucket` restricts
// to one of the plain-language status groupings (see STATUS_BUCKETS);
// optional `search` matches case-insensitively as a substring of the task
// prompt.
export const recentTasks = query({
  args: {
    limit: v.optional(v.number()),
    bucket: v.optional(statusBucketValidator),
    search: v.optional(v.string()),
  },
  returns: v.array(taskRowValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const search = args.search?.trim().toLowerCase() || undefined;
    const filtering = args.bucket !== undefined || search !== undefined;
    const scanCount = filtering ? FILTER_SCAN_CAP : limit * SCAN_MULTIPLIER;

    const visible = await scanVisibleTasks(ctx, scanCount);

    return visible
      .filter((t) => matchesBucket(t, args.bucket) && matchesSearch(t, search))
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

// PUBLIC: counts of visible (top-level, non-golden-audit) tasks per status
// bucket, for the /tasks filter chips. This is a snapshot over a bounded
// scan window (FILTER_SCAN_CAP), not a live denormalized counter — acceptable
// at this table's current size, and consistent with the rest of this file's
// "recent activity view, not a full archive" contract.
export const taskStatusCounts = query({
  args: {},
  returns: v.object({
    total: v.number(),
    buckets: v.object({
      active: v.number(),
      complete: v.number(),
      rejected: v.number(),
      failed: v.number(),
      cancelled: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const visible = await scanVisibleTasks(ctx, FILTER_SCAN_CAP);
    const buckets: Record<StatusBucket, number> = {
      active: 0,
      complete: 0,
      rejected: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const t of visible) {
      const bucket = STATUS_TO_BUCKET[t.status];
      if (bucket) buckets[bucket] += 1;
    }
    return { total: visible.length, buckets };
  },
});
