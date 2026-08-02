import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { BID_WINDOW_SECONDS } from "./tasks";
import {
  GOLDEN_RUN_EXPIRY_MS,
  goldenBudgetCap,
  goldenMinIntervalMs,
} from "../lib/golden-audit";

/**
 * Golden-task audit lane (see lib/golden-audit.ts for the why). This module
 * owns the curated golden definitions, the frequency/spend caps, and the
 * posting path. Everything here is internal-only: exposing golden linkage
 * through a public function would let a bidder distinguish audit tasks from
 * organic ones and defeat the mechanism.
 *
 * Manual trigger:  npx convex run goldenTasks:postNow '{}'
 * Seed defaults:   npx convex run goldenTasks:seedDefaults '{}'
 * Cron: crons.ts posts via maybePostGolden, gated on
 * ARBOR_GOLDEN_AUDIT_ENABLED=true and the min-interval cap.
 */

// Golden posts use the same buyer id as organic default posts so the task row
// is indistinguishable from a normal post (see auctions.ts BUYER_ID).
const GOLDEN_BUYER_ID = "buyer:default";

// Curated defaults: self-contained prompts (bidders only ever see the prompt)
// with objectively checkable outcomes. Numeric/extraction tasks carry
// required_substrings so the audit stays meaningful even if the reference
// grader model is unreachable.
const DEFAULT_GOLDEN_TASKS: Array<{
  golden_id: string;
  title: string;
  prompt: string;
  task_type: string;
  max_budget: number;
  reference_answer: string;
  success_criteria: string;
  required_substrings?: string[];
}> = [
  {
    golden_id: "golden-escrow-math",
    title: "Escrow net payout arithmetic",
    prompt:
      "A marketplace escrow holds $120.00 for a completed task. The platform charges a 7.5% fee on the held amount before paying the worker. Compute the worker's net payout in dollars: show the fee calculation and state the final amount rounded to two decimal places.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Fee = 120.00 x 0.075 = $9.00; net payout = 120.00 - 9.00 = $111.00.",
    success_criteria:
      "The delivery must compute the 7.5% fee on $120.00 ($9.00), subtract it, and state $111.00 as the final net payout.",
    required_substrings: ["111"],
  },
  {
    golden_id: "golden-unit-conversion",
    title: "Speed unit conversion",
    prompt:
      "Convert 45 miles per hour to meters per second. Use exactly 1 mile = 1609.344 meters. Show your work and give the result rounded to one decimal place.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer: "45 x 1609.344 / 3600 = 20.1168, so 20.1 m/s.",
    success_criteria:
      "The delivery must use the given conversion factor and arrive at approximately 20.1 m/s (20.12 acceptable before rounding).",
    required_substrings: ["20.1"],
  },
  {
    golden_id: "golden-invoice-extraction",
    title: "Invoice field extraction",
    prompt:
      'Extract the invoice number, the total amount due, and the due date from the following invoice text. Return them as three labeled lines and nothing else.\n\n"Bluefin Analytics LLC — Tax Invoice INV-88041. Services rendered: data pipeline maintenance, June 2026. Subtotal $2,180.00, VAT $160.50. Total due: $2,340.50 by 2026-08-15. Remit to accounts@bluefin.example."',
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Invoice number: INV-88041. Total due: $2,340.50. Due date: 2026-08-15.",
    success_criteria:
      "All three fields must be extracted exactly as they appear: invoice number INV-88041, total due $2,340.50, due date 2026-08-15. No invented or altered fields.",
    required_substrings: ["88041", "2,340.50", "2026-08-15"],
  },
  {
    golden_id: "golden-policy-summary",
    title: "Policy passage summary",
    prompt:
      'Summarize the following policy paragraph in at most three sentences, preserving every number and date exactly.\n\n"Starting 2026-09-01, the marketplace holds 14% of each settled payment in a dispute reserve for 30 days. If no dispute is filed within that window, the reserve is released automatically. Workers with more than 50 settled tasks and zero lost disputes qualify for a reduced 7% reserve."',
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "From 2026-09-01, 14% of each settled payment is held in a dispute reserve for 30 days and released automatically if no dispute is filed; workers with more than 50 settled tasks and zero lost disputes get a reduced 7% reserve.",
    success_criteria:
      "The summary must preserve all figures: the 2026-09-01 start date, the 14% reserve rate, the 30-day window, the automatic release condition, and the reduced 7% rate for workers with more than 50 settled tasks and zero lost disputes. At most three sentences.",
    required_substrings: ["14%", "30", "7%"],
  },
  // ── Battery expansion (2026-07-30) ──────────────────────────────────────
  // The audit lane only needs a handful of tasks: it posts one at a time and
  // grades the auction winner. The BATTERY needs breadth, because comparable
  // pairs scale as tasks x C(agents, 2) and the trilemma metrics are
  // underpowered below ~500 pairs. Every task below is self-contained (bidders
  // see only the prompt), objectively checkable, and carries
  // required_substrings so grading survives a reference-grader outage.
  {
    golden_id: "golden-compound-interest",
    title: "Compound interest over three years",
    prompt:
      "An escrow balance of $2,000.00 earns 5% interest compounded annually for 3 years, with no deposits or withdrawals. State the final balance rounded to two decimal places, and show each year's balance.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Year 1: 2000 x 1.05 = $2,100.00; Year 2: $2,205.00; Year 3: $2,315.25.",
    success_criteria:
      "The delivery must compound annually (not simple interest) and state $2,315.25 as the final balance.",
    required_substrings: ["2315.25"],
  },
  {
    golden_id: "golden-percentage-change",
    title: "Percentage change direction",
    prompt:
      "A specialist's judge-accept rate fell from 55% in June to 12% in July. Compute the absolute change in percentage points and the relative decline as a percentage of the June figure, rounded to one decimal place.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Absolute change: 43 percentage points. Relative decline: 43/55 = 78.2%.",
    success_criteria:
      "The delivery must distinguish percentage points from percent, giving 43 percentage points and a 78.2% relative decline.",
    required_substrings: ["43", "78.2"],
  },
  {
    golden_id: "golden-unit-rate",
    title: "Cost per thousand tokens",
    prompt:
      "A model call consumed 18,400 input tokens and 2,600 output tokens. Input is billed at $3.00 per million tokens and output at $15.00 per million. State the total cost in dollars to four decimal places.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Input: 18,400/1,000,000 x 3.00 = $0.0552. Output: 2,600/1,000,000 x 15.00 = $0.0390. Total = $0.0942.",
    success_criteria:
      "The delivery must price input and output separately at their different rates and total $0.0942.",
    required_substrings: ["0.0942"],
  },
  {
    golden_id: "golden-date-arithmetic",
    title: "Deadline across a month boundary",
    prompt:
      "A dispute window opens on 2026-01-20 and lasts 45 days. State the exact calendar date the window closes, counting the opening day as day 0. 2026 is not a leap year.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "2026-01-20 + 45 days = 2026-03-06 (11 days remaining in January, 28 in February, 6 in March).",
    success_criteria:
      "The delivery must state 2026-03-06 and correctly use 28 days for February 2026.",
    required_substrings: ["2026-03-06"],
  },
  {
    golden_id: "golden-json-extraction",
    title: "Structured field extraction",
    prompt:
      'Extract the order id, total, and currency from this receipt text and return ONLY a JSON object with keys order_id, total, currency:\n\n"Thank you! Your order ORD-77213 shipped on Tuesday. Subtotal 84.50 EUR, shipping 6.00 EUR, total due 90.50 EUR. Questions? Reply to this email."',
    task_type: "general",
    max_budget: 0.3,
    reference_answer: '{"order_id": "ORD-77213", "total": 90.50, "currency": "EUR"}',
    success_criteria:
      "The delivery must return the TOTAL (90.50), not the subtotal (84.50), with order id ORD-77213 and currency EUR.",
    required_substrings: ["ORD-77213", "90.5", "EUR"],
  },
  {
    golden_id: "golden-table-lookup",
    title: "Conditional table lookup",
    prompt:
      "Tier pricing: 0-100 calls $0.010 each; 101-1,000 calls $0.006 each; 1,001+ calls $0.003 each. Tiers are marginal, so each band is charged at its own rate. Compute the total cost for 1,500 calls.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "100 x 0.010 = $1.00; 900 x 0.006 = $5.40; 500 x 0.003 = $1.50; total $7.90.",
    success_criteria:
      "The delivery must apply the bands marginally (not charge all 1,500 at the lowest rate) and total $7.90.",
    required_substrings: ["7.90"],
  },
  {
    golden_id: "golden-contradiction-detect",
    title: "Detect the contradicted claim",
    prompt:
      'Exactly one of these statements contradicts the others. Identify it by number and explain why.\n1. All settled tasks in the sample were judged.\n2. Some judged tasks were rejected.\n3. No settled task in the sample was rejected.\n4. Every rejected task in the sample was settled.',
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Statement 3 contradicts the others: by 2 and 4, some rejected task was settled, which 3 denies.",
    success_criteria:
      "The delivery must identify statement 3 and reference the chain through statements 2 and 4.",
    required_substrings: ["3"],
  },
  {
    golden_id: "golden-sql-reasoning",
    title: "Query result reasoning",
    prompt:
      "A table `runs` has columns agent_id and passed (boolean). Write a single SQL query returning each agent_id with its pass rate, including agents whose runs all failed, ordered by pass rate descending. Use standard SQL.",
    task_type: "code",
    max_budget: 0.3,
    reference_answer:
      "SELECT agent_id, AVG(CASE WHEN passed THEN 1.0 ELSE 0.0 END) AS pass_rate FROM runs GROUP BY agent_id ORDER BY pass_rate DESC;",
    success_criteria:
      "The query must GROUP BY agent_id, compute a rate that yields 0 (not NULL or a dropped row) for all-failed agents, and ORDER BY the rate descending.",
    required_substrings: ["GROUP BY", "agent_id"],
  },
  {
    golden_id: "golden-code-bugfix",
    title: "Identify the off-by-one",
    prompt:
      "This function should return the last n elements of a list, but returns the wrong slice when n is 0. Give the corrected function.\n\ndef last_n(xs, n):\n    return xs[-n:]",
    task_type: "code",
    max_budget: 0.3,
    reference_answer:
      "When n is 0, xs[-0:] is xs[0:], which returns the whole list instead of an empty one. Fix: `return xs[len(xs)-n:]` or an explicit `if n <= 0: return []`.",
    success_criteria:
      "The delivery must identify that -0 equals 0 so the slice returns the entire list, and give a fix that returns an empty list for n=0.",
    required_substrings: ["0"],
  },
  {
    golden_id: "golden-regex-spec",
    title: "Regex from a specification",
    prompt:
      "Write a regular expression matching a version string of exactly three dot-separated non-negative integers with no leading zeros (so 1.0.3 and 10.2.0 match; 01.2.3 and 1.2 do not). Anchor it to the whole string. Return only the regex.",
    task_type: "code",
    max_budget: 0.3,
    reference_answer: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
    success_criteria:
      "The regex must be anchored at both ends, require exactly three components, allow a bare 0, and reject leading zeros.",
    required_substrings: ["^"],
  },
  {
    golden_id: "golden-probability",
    title: "Conditional probability",
    prompt:
      "Of 1,000 agents, 5% are live. A liveness probe flags 90% of live agents and also flags 8% of dead agents. If an agent is flagged, what is the probability it is actually live? Give the answer as a percentage to one decimal place.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Live flagged: 50 x 0.90 = 45. Dead flagged: 950 x 0.08 = 76. P(live | flagged) = 45/121 = 37.2%.",
    success_criteria:
      "The delivery must apply Bayes' rule against the base rate and state 37.2%.",
    required_substrings: ["37.2"],
  },
  {
    golden_id: "golden-weighted-average",
    title: "Weighted average with a trap",
    prompt:
      "Agent A handled 300 tasks at a 40% accept rate; agent B handled 20 tasks at a 90% accept rate. Compute the combined accept rate across all tasks, to one decimal place.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "(300 x 0.40 + 20 x 0.90) / 320 = (120 + 18) / 320 = 138/320 = 43.1%.",
    success_criteria:
      "The delivery must weight by task count (43.1%), not average the two rates naively (which would give 65%).",
    required_substrings: ["43.1"],
  },
  {
    golden_id: "golden-ordering-constraints",
    title: "Schedule under dependencies",
    prompt:
      "Tasks and their prerequisites: C requires A and B; D requires C; B requires A; E requires B. Give a valid execution order for all five, and state the length of the longest dependency chain.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Order: A, B, C, D, E (or A, B, E, C, D). Longest chain: A -> B -> C -> D, length 4.",
    success_criteria:
      "The order must place A before B, B and A before C, C before D, and B before E. The longest chain is 4 nodes.",
    required_substrings: ["4"],
  },
  {
    golden_id: "golden-currency-rounding",
    title: "Split a payment without losing a cent",
    prompt:
      "Split $100.00 equally among 3 workers using cent-precision amounts so the parts sum to exactly $100.00. State each worker's amount.",
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "$33.34, $33.33, $33.33 — two workers get $33.33 and one gets $33.34 so the total is exactly $100.00.",
    success_criteria:
      "The three amounts must sum to exactly 100.00, which requires one part to differ by a cent; 33.33 x 3 = 99.99 is wrong.",
    required_substrings: ["33.34", "33.33"],
  },
  {
    golden_id: "golden-negation-extraction",
    title: "Extraction under negation",
    prompt:
      'From this note, list ONLY the services that are currently enabled:\n\n"We have Stripe connected and Clerk auth is live. Convex is deployed but the cron jobs are disabled. We have not enabled Sentry yet, and the Slack integration was turned off last week."',
    task_type: "general",
    max_budget: 0.3,
    reference_answer: "Stripe, Clerk, and Convex are enabled.",
    success_criteria:
      "The list must include Stripe, Clerk, and Convex, and must EXCLUDE Sentry, Slack, and the cron jobs.",
    required_substrings: ["Stripe", "Clerk", "Convex"],
  },
  {
    golden_id: "golden-summary-fidelity",
    title: "Summary preserving a qualifier",
    prompt:
      'Summarize in one sentence, preserving the conditional exactly:\n\n"Payouts settle within two business days, except for accounts flagged for review, which settle within ten business days once the review clears."',
    task_type: "general",
    max_budget: 0.3,
    reference_answer:
      "Payouts settle in two business days unless the account is flagged for review, in which case they settle within ten business days after the review clears.",
    success_criteria:
      "The summary must keep both figures (two and ten business days) AND the condition that the ten-day path applies only to flagged accounts after review clears.",
    required_substrings: ["two", "ten"],
  },
];

/** Upsert the curated defaults. Idempotent: existing rows get their
 * definition fields refreshed but keep run_count/last_run_at/enabled. */
export const seedDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const def of DEFAULT_GOLDEN_TASKS) {
      const existing = await ctx.db
        .query("golden_tasks")
        .withIndex("by_golden_id", (q) => q.eq("golden_id", def.golden_id))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          title: def.title,
          prompt: def.prompt,
          task_type: def.task_type,
          max_budget: def.max_budget,
          reference_answer: def.reference_answer,
          success_criteria: def.success_criteria,
          required_substrings: def.required_substrings,
          updated_at: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("golden_tasks", {
          ...def,
          enabled: true,
          run_count: 0,
          created_at: now,
          updated_at: now,
        });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

async function postGolden(ctx: MutationCtx, golden: Doc<"golden_tasks">) {
  const now = Date.now();
  const closesAt = now + BID_WINDOW_SECONDS * 1000;
  // Spend bound: the per-definition budget is further clamped by the
  // deployment-wide ARBOR_GOLDEN_MAX_BUDGET cap.
  const max_budget = Math.min(
    golden.max_budget,
    goldenBudgetCap(process.env.ARBOR_GOLDEN_MAX_BUDGET),
  );

  // The task row is a plain atomic task — no golden marker, no planner/hive
  // detour. It goes straight to the standard solicit → resolve → execute →
  // judge → settle pipeline; settle finds the golden_task_runs row and
  // schedules the reference audit.
  const task_id = await ctx.db.insert("tasks", {
    posted_by: GOLDEN_BUYER_ID,
    task_type: golden.task_type,
    prompt: golden.prompt,
    max_budget,
    status: "bidding",
    bid_window_seconds: BID_WINDOW_SECONDS,
    bid_window_closes_at: closesAt,
  });
  await ctx.db.insert("golden_task_runs", {
    golden_task_id: golden._id,
    task_id,
    status: "posted",
    posted_at: now,
  });
  await ctx.db.patch(golden._id, {
    run_count: golden.run_count + 1,
    last_run_at: now,
    updated_at: now,
  });
  // Standard task_posted event with the standard payload shape — the audit
  // linkage stays out of the lifecycle stream until the audit itself settles.
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "task_posted",
    payload: {
      posted_by: GOLDEN_BUYER_ID,
      prompt: golden.prompt,
      max_budget,
    },
  });
  await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, { task_id });
  await ctx.scheduler.runAfter(
    BID_WINDOW_SECONDS * 1000,
    internal.auctions.resolve,
    { task_id },
  );
  return { task_id, golden_id: golden.golden_id, max_budget };
}

/** Runs with status "posted" that never reached settle (auction failed,
 * execution failed) are marked expired so the run log stays honest. */
async function expireStaleRuns(ctx: MutationCtx, now: number) {
  const stale = await ctx.db
    .query("golden_task_runs")
    .withIndex("by_status", (q) => q.eq("status", "posted"))
    .take(50);
  for (const run of stale) {
    if (now - run.posted_at > GOLDEN_RUN_EXPIRY_MS) {
      await ctx.db.patch(run._id, { status: "expired" });
    }
  }
}

/**
 * Cron entrypoint. No-op unless ARBOR_GOLDEN_AUDIT_ENABLED=true; posts at
 * most one golden task per ARBOR_GOLDEN_MIN_INTERVAL_HOURS (default 24h),
 * rotating through enabled definitions least-recently-run first.
 */
export const maybePostGolden = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ARBOR_GOLDEN_AUDIT_ENABLED !== "true") {
      return { posted: false, reason: "ARBOR_GOLDEN_AUDIT_ENABLED is not true" };
    }
    const now = Date.now();
    await expireStaleRuns(ctx, now);

    const minInterval = goldenMinIntervalMs(
      process.env.ARBOR_GOLDEN_MIN_INTERVAL_HOURS,
    );
    const latest = await ctx.db
      .query("golden_task_runs")
      .withIndex("by_posted_at")
      .order("desc")
      .first();
    if (latest && now - latest.posted_at < minInterval) {
      return { posted: false, reason: "frequency cap" };
    }

    // Curated set is small by design; 100 is a safety bound, not a page size.
    const goldens = await ctx.db.query("golden_tasks").take(100);
    const candidates = goldens
      .filter((g) => g.enabled)
      .sort((a, b) => (a.last_run_at ?? 0) - (b.last_run_at ?? 0));
    if (candidates.length === 0) {
      return { posted: false, reason: "no enabled golden tasks (run seedDefaults)" };
    }
    const result = await postGolden(ctx, candidates[0]);
    return { posted: true, ...result };
  },
});

/**
 * Manual trigger (internal — run via `npx convex run goldenTasks:postNow`).
 * Naming a golden_id posts that definition even if disabled; otherwise the
 * least-recently-run enabled definition is picked. `force` bypasses the
 * frequency cap, never the budget cap.
 */
export const postNow = internalMutation({
  args: {
    golden_id: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!args.force) {
      const minInterval = goldenMinIntervalMs(
        process.env.ARBOR_GOLDEN_MIN_INTERVAL_HOURS,
      );
      const latest = await ctx.db
        .query("golden_task_runs")
        .withIndex("by_posted_at")
        .order("desc")
        .first();
      if (latest && now - latest.posted_at < minInterval) {
        return {
          posted: false,
          reason: "frequency cap (pass force:true to override)",
        };
      }
    }
    let golden: Doc<"golden_tasks"> | null;
    if (args.golden_id) {
      golden = await ctx.db
        .query("golden_tasks")
        .withIndex("by_golden_id", (q) => q.eq("golden_id", args.golden_id!))
        .unique();
      if (!golden) {
        return { posted: false, reason: `unknown golden_id ${args.golden_id}` };
      }
    } else {
      const goldens = await ctx.db.query("golden_tasks").take(100);
      golden =
        goldens
          .filter((g) => g.enabled)
          .sort((a, b) => (a.last_run_at ?? 0) - (b.last_run_at ?? 0))[0] ??
        null;
      if (!golden) {
        return {
          posted: false,
          reason: "no enabled golden tasks (run seedDefaults)",
        };
      }
    }
    const result = await postGolden(ctx, golden);
    return { posted: true, ...result };
  },
});

// ─── internal helpers used by the settle hook and the audit action ─────────

export const _runForTask = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("golden_task_runs")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .unique();
  },
});

export const _getGolden = internalQuery({
  args: { golden_task_id: v.id("golden_tasks") },
  handler: async (ctx, args) => {
    const golden = await ctx.db.get(args.golden_task_id);
    if (!golden) throw new Error(`golden task ${args.golden_task_id} not found`);
    return golden;
  },
});

/** Mark a posted run as an audit error. Successful audits use
 * reputationDimensions._recordGoldenAudit so the run claim and ground-truth
 * dimension replacement commit atomically. */
export const _claimRunWithOutcome = internalMutation({
  args: {
    run_id: v.id("golden_task_runs"),
    status: v.literal("audit_error"),
    agent_id: v.optional(v.string()),
    judge_accepted: v.optional(v.boolean()),
    audit_reasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status !== "posted") return { claimed: false };
    const { run_id, ...outcome } = args;
    await ctx.db.patch(run_id, {
      ...outcome,
      audited_at: Date.now(),
    });
    return { claimed: true };
  },
});
