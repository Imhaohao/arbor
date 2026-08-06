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
  GOLDEN_TEMPLATES,
  createRng,
  deriveGoldenSeed,
  drawGoldenForRun,
  drawGoldenMaxBudget,
  drawGoldenPostedBy,
  goldenMinIntervalMs,
  type GoldenDraw,
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
 *
 * Templating (settlement-audit-protocol.md section 3): each golden_id is a
 * parameterized TEMPLATE (lib/golden-audit.ts GOLDEN_TEMPLATES), not a fixed
 * prompt. `postGolden` draws a fresh prompt/reference_answer/success_criteria
 * /required_substrings from a seed derived from (golden_id, run_count) —
 * deterministic and reproducible, but different every post — so an agent
 * that bids on the same golden_id twice never sees the same prompt twice.
 * The drawn seed and a human-readable params snapshot are recorded on the
 * golden_task_runs row (see convex/schema.ts) for later re-grading; the
 * golden_tasks row's prompt/reference/success_criteria/required_substrings
 * fields are kept in sync with the CURRENT run's draw so the settle-time
 * audit (convex/goldenTaskAudit.ts, which reads them via `_getGolden`)
 * grades against the right values without that file needing to know
 * anything about templating.
 */

// max_budget and posted_by were, until 2026-08-05, hardcoded to a single
// value on every golden post ($2 and "buyer:default" respectively). That
// uniformity was itself a detectability leak: the pre-launch gate
// (scripts/golden-detectability.ts) measured max_budget at 65.8%/80.2%
// (LLM/Bayes) and posted_by at 77.5%/93.0% against a 65% bar, both FAIL,
// while organic traffic has real spread (16 distinct budgets, 33 distinct
// posted_by values in the 212-row dev snapshot). Both fields are now drawn
// stochastically per post from that real organic distribution — see
// lib/golden-audit.ts drawGoldenMaxBudget / drawGoldenPostedBy, called from
// postGolden below — floored at $0.40 (the guaranteed floor agent
// arbor-hive-backstop will not bid under its cost_baseline; anything posted
// under that floor dies with "no valid bids under budget", verified live)
// and capped by the deployment's ARBOR_GOLDEN_MAX_BUDGET.
//
// This is defense-in-depth, NOT a live bidder tell: auctions.ts solicitBids
// deliberately withholds max_budget, posted_by AND bid_window_seconds from a
// bidding specialist's bid(prompt, taskType) call (see the comment at
// auctions.ts:497) — but the stored `tasks` row is visible to anything with
// deployment read access, so uniformity there was still a real, hardenable
// signal.
//
// The axis that also leaked is prompt style: the detectability gate
// (scripts/golden-detectability.ts, run 2026-08-05) measured 72.5% on the
// real prompt+task_type channel against a 65% bar; a subsequent
// prompt-register rewrite fixed that to 60.0% (PASS).
//
// Marketplace payout is internal credit, not provider spend: measured real
// cost is ~$0.001/settled run, so none of this moves actual Azure spend.
//
// The templates themselves (28 golden_ids, each drawing fresh numbers/names
// AND a representative max_budget per post) live in lib/golden-audit.ts so
// they stay unit-testable without a Convex runtime — see GOLDEN_TEMPLATES
// and lib/golden-audit.test.ts.

/**
 * Upsert the curated defaults. Idempotent: existing rows get their
 * definition fields refreshed but keep run_count/last_run_at/enabled.
 *
 * The golden_tasks row's prompt/reference_answer/success_criteria/
 * required_substrings are populated from each template's run-0 draw (a
 * canonical, deterministic rendering — never shown to a bidder, since
 * `postGolden` always overwrites these fields with the actual per-run draw
 * before a task is ever posted; see the templating note at the top of this
 * file). This just keeps the existing schema shape and non-null fields
 * satisfied between seeding and the first real post.
 */
export const seedDefaults = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const def of GOLDEN_TEMPLATES) {
      const canonical = drawGoldenForRun(def.golden_id, 0);
      if (!canonical) {
        throw new Error(`no draw for golden template ${def.golden_id}`);
      }
      const draw = canonical.draw;
      const existing = await ctx.db
        .query("golden_tasks")
        .withIndex("by_golden_id", (q) => q.eq("golden_id", def.golden_id))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          title: def.title,
          prompt: draw.prompt,
          task_type: def.task_type,
          max_budget: def.max_budget,
          reference_answer: draw.reference_answer,
          success_criteria: draw.success_criteria,
          required_substrings: draw.required_substrings,
          updated_at: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("golden_tasks", {
          golden_id: def.golden_id,
          title: def.title,
          prompt: draw.prompt,
          task_type: def.task_type,
          max_budget: def.max_budget,
          reference_answer: draw.reference_answer,
          success_criteria: draw.success_criteria,
          required_substrings: draw.required_substrings,
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

  // Templating: run_count is this golden's 0-based index for THIS post (it
  // has not been incremented yet), so the seed is deterministic and unique
  // per post — same golden_id + same run_count always draws the same task;
  // the next post (run_count + 1) always draws a different one. Falls back
  // to the golden_tasks row's own fields if the golden_id has no registered
  // template (defensive: keeps a hand-inserted custom golden working).
  const rendered = drawGoldenForRun(golden.golden_id, golden.run_count);
  const draw: GoldenDraw | null = rendered?.draw ?? null;
  const prompt = draw?.prompt ?? golden.prompt;
  const reference_answer = draw?.reference_answer ?? golden.reference_answer;
  const success_criteria = draw?.success_criteria ?? golden.success_criteria;
  const required_substrings = draw?.required_substrings ?? golden.required_substrings;

  // max_budget / posted_by: drawn stochastically per post from the real
  // organic distribution (lib/golden-audit.ts drawGoldenMaxBudget /
  // drawGoldenPostedBy) instead of the old hardcoded $2 / "buyer:default" —
  // see the module comment there for why (uniformity on either field is a
  // detectability leak independent of the prompt). Seeded off the SAME
  // per-run seed as the templated prompt (deriveGoldenSeed(golden_id,
  // run_count) — identical to rendered.seed when a template exists) via an
  // independent RNG instance, so this never disturbs a template's own
  // prompt-generation draw sequence, while staying fully deterministic:
  // same (golden_id, run_index) always redraws the same budget/posted_by.
  const auxSeed = deriveGoldenSeed(golden.golden_id, golden.run_count);
  const auxRng = createRng(auxSeed);
  const max_budget = drawGoldenMaxBudget(auxRng, process.env.ARBOR_GOLDEN_MAX_BUDGET);
  const posted_by = drawGoldenPostedBy(auxRng);

  // The task row is a plain atomic task — no golden marker, no planner/hive
  // detour. It goes straight to the standard solicit → resolve → execute →
  // judge → settle pipeline; settle finds the golden_task_runs row and
  // schedules the reference audit.
  const task_id = await ctx.db.insert("tasks", {
    posted_by,
    task_type: golden.task_type,
    prompt,
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
    // Recorded on the immutable per-run row (not just the mutable
    // golden_tasks definition below) so this exact run can be re-graded or
    // reviewed later even after golden_id has been posted again with a
    // different draw. See lib/golden-audit.ts drawGoldenForRun.
    seed: rendered?.seed ?? auxSeed,
    drawn_params_json: JSON.stringify({
      params: draw?.params ?? {},
      prompt: draw?.prompt ?? prompt,
      reference_answer: draw?.reference_answer ?? reference_answer,
      success_criteria: draw?.success_criteria ?? success_criteria,
      required_substrings: draw?.required_substrings ?? required_substrings ?? [],
      max_budget,
      posted_by,
    }),
  });
  // Keep the golden_tasks row's prompt/reference/criteria/substrings in sync
  // with THIS run's draw: convex/goldenTaskAudit.ts reads them live via
  // `_getGolden` at settle time (shortly after this post), and that file is
  // not templating-aware — it just grades against whatever is on the row.
  await ctx.db.patch(golden._id, {
    prompt,
    reference_answer,
    success_criteria,
    required_substrings,
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
      posted_by,
      prompt,
      max_budget,
    },
  });
  await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, { task_id });
  // wait_for_solicitation: resolve on solicitBids actually finishing, with the
  // bid window as the floor rather than the trigger. Without it a golden can be
  // failed for "no valid bids under budget" while its bids — the floor agent's
  // included — are still in flight; measured live at 44s late under a 30s
  // window, and again at 2.6 minutes late under a 90s window when the
  // deployment's 8-concurrent-scheduled-job ceiling backed the pipeline up.
  //
  // That failure mode is worse here than on an organic task: a golden that
  // dies in the auction produces no audit row at all, and it does so more
  // often exactly when the marketplace is busy. That is non-random attrition
  // in the measurement, which biases the study rather than just shrinking it.
  await ctx.scheduler.runAfter(
    BID_WINDOW_SECONDS * 1000,
    internal.auctions.resolve,
    { task_id, wait_for_solicitation: true },
  );
  return { task_id, golden_id: golden.golden_id, max_budget, posted_by };
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
