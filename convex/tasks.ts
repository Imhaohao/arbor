import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { buildOrchestrationContext } from "../lib/orchestration-context";
import { isConversionDropPrompt } from "../lib/conversion-drop-demo";

// 90s. Was 30s on the reasoning that the slowest single leg (~12s A2A bid +
// ~6s plan screen) fit with headroom once the probe and bid request ran
// concurrently per agent. That per-agent math is right but the window is not
// per-agent: solicitation now fans out across a 1000+ agent roster, and an
// agent's bid is only counted if it lands before the window closes.
//
// Measured on the dev deployment 2026-08-05 (task js7bzyqaedfmjkr9xrza0z33tx8bx2ne):
// arbor-hive-backstop — the floor agent whose entire purpose is to guarantee
// every task gets a bid — returned 44.3s AFTER the window shut, so the auction
// had already failed with "no valid bids under budget" despite the backstop
// later landing a valid $0.40 bid on a $2 budget. That failure mode is
// intermittent and load-dependent, which makes it worse than a consistent one:
// it silently drops tasks based on how busy the roster is.
//
// The deeper fix is to solicit the guaranteed floor agent first (or
// synchronously) rather than letting it queue behind 1000 external probes, so
// the terminating bid never depends on fan-out latency. This constant is the
// safe interim: it costs every auction ~60s of extra wall clock, which is
// strictly better than losing the auction outright.
export const BID_WINDOW_SECONDS = 90;

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

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanList(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

/**
 * Post a new task. Creates the row in `bidding`, schedules bid solicitation
 * immediately and the auction resolution at window close.
 */
export const post = mutation({
  args: {
    posted_by: v.string(),
    task_type: v.optional(v.string()),
    prompt: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
    workflow_mode: v.optional(v.string()),
    model_gateway: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const closesAt = now + BID_WINDOW_SECONDS * 1000;
    const profile = await ctx.db
      .query("product_context_profiles")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.posted_by))
      .order("desc")
      .first();

    const profileBusiness = profile
      ? [
          `Company/product: ${profile.company_name}`,
          profile.product_url ? `Product URL: ${profile.product_url}` : undefined,
          profile.business_context,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
      : undefined;
    const profileRepo = profile
      ? [
          profile.github_repo_url ? `GitHub repo: ${profile.github_repo_url}` : undefined,
          profile.repo_context,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
      : undefined;
    const sourceHints = cleanList([
      profile?.github_repo_url,
      profile?.product_url,
      ...(profile?.source_hints ?? []),
      ...(args.source_hints ?? []),
    ]);
    const businessContext = cleanOptional(args.business_context) ?? profileBusiness;
    const repoContext = cleanOptional(args.repo_context) ?? profileRepo;
    const hive =
      args.workflow_mode === "hive" ||
      (process.env.ARBOR_HIVE_DEFAULT === "true" &&
        args.workflow_mode !== "legacy");

    const task_id = await ctx.db.insert("tasks", {
      posted_by: args.posted_by,
      task_type: args.task_type ?? "general",
      prompt: args.prompt,
      max_budget: args.max_budget,
      output_schema: args.output_schema,
      status: "planning",
      bid_window_seconds: BID_WINDOW_SECONDS,
      bid_window_closes_at: closesAt,
      product_context_profile_id: profile?._id,
      workflow_mode: hive ? "hive" : undefined,
      model_gateway: cleanOptional(args.model_gateway),
    });

    const orchestrationContext = buildOrchestrationContext({
      prompt: args.prompt,
      taskType: args.task_type ?? "general",
      businessContext,
      repoContext,
      sourceHints,
    });

    await ctx.db.insert("task_contexts", {
      task_id,
      version: orchestrationContext.version,
      business: orchestrationContext.business,
      repo: orchestrationContext.repo,
      routing: orchestrationContext.routing,
      prompt_addendum: orchestrationContext.prompt_addendum,
      created_at: now,
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id,
      event_type: "task_posted",
      payload: {
        posted_by: args.posted_by,
        prompt: args.prompt,
        max_budget: args.max_budget,
      },
    });

    await ctx.runMutation(internal.lifecycle.log, {
      task_id,
      event_type: "context_enriched",
      payload: orchestrationContext,
    });

    if (profile) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id,
        event_type: "product_context_attached",
        payload: {
          profile_id: profile._id,
          company_name: profile.company_name,
          has_product_url: Boolean(profile.product_url),
          has_github_repo: Boolean(profile.github_repo_url),
          source_hint_count: sourceHints.length,
          hyperspell_status: profile.hyperspell_status,
        },
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.taskAgentDiscovery.discoverForPostedTask,
      { task_id },
    );

    // Prompts mentioning "conversion drop" route to the dedicated
    // diagnose-then-PR investigation flow instead of the generic auction.
    if (isConversionDropPrompt(args.prompt)) {
      await ctx.scheduler.runAfter(0, internal.demos.runConversionDropDemo, { task_id });
    } else if (hive) {
      await ctx.scheduler.runAfter(0, internal.hivePlanner.planDag, { task_id });
    } else {
      // Planner: atomic → enrichment + auction on this task; compound → multi-
      // step children (each routed through enrichment; children without a stub
      // skip quickly to solicitBids inside enrichAndStartAuction).
      await ctx.scheduler.runAfter(0, internal.planning.decompose, { task_id });
    }

    return {
      task_id,
      status: "planning" as const,
      bid_window_closes_at: closesAt,
    };
  },
});

/**
 * Internal: create a sub-task for a step in a parent task's plan. The child
 * runs the same auction lifecycle as a top-level task, but skips the planner
 * (children don't recursively decompose) and reports back to the parent on
 * settle.
 */
export const _createChild = internalMutation({
  args: {
    parent_task_id: v.id("tasks"),
    step_index: v.number(),
    prompt: v.string(),
    max_budget: v.number(),
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parent_task_id);
    if (!parent) throw new Error(`parent ${args.parent_task_id} not found`);
    const now = Date.now();
    const closesAt = now + BID_WINDOW_SECONDS * 1000;
    const child_task_id = await ctx.db.insert("tasks", {
      posted_by: parent.posted_by,
      task_type: parent.task_type,
      prompt: args.prompt,
      max_budget: args.max_budget,
      status: "bidding",
      bid_window_seconds: BID_WINDOW_SECONDS,
      bid_window_closes_at: closesAt,
      parent_task_id: args.parent_task_id,
      step_index: args.step_index,
      product_context_profile_id: parent.product_context_profile_id,
      model_gateway: parent.model_gateway,
    });
    const parentContext = await ctx.db
      .query("task_contexts")
      .withIndex("by_task", (q) => q.eq("task_id", args.parent_task_id))
      .order("desc")
      .first();
    if (parentContext) {
      await ctx.db.insert("task_contexts", {
        task_id: child_task_id,
        version: parentContext.version,
        business: parentContext.business,
        repo: parentContext.repo,
        routing: parentContext.routing,
        prompt_addendum: `${parentContext.prompt_addendum}\n\nChild task focus:\n${args.prompt}`,
        created_at: now,
      });
    }
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: child_task_id,
      event_type: "task_posted",
      payload: {
        posted_by: parent.posted_by,
        prompt: args.prompt,
        max_budget: args.max_budget,
        parent_task_id: args.parent_task_id,
        step_index: args.step_index,
      },
    });
    if (parentContext) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: child_task_id,
        event_type: "context_inherited",
        payload: {
          parent_task_id: args.parent_task_id,
          product_context_profile_id: parent.product_context_profile_id,
        },
      });
    }
    return { child_task_id, bid_window_closes_at: closesAt };
  },
});

export const _setPlan = internalMutation({
  args: {
    task_id: v.id("tasks"),
    plan: v.array(
      v.object({
        prompt: v.string(),
        rationale: v.string(),
        specialist_hint: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { task_plan: args.plan });
  },
});

export const childrenOf = query({
  args: { parent_task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) =>
        q.eq("parent_task_id", args.parent_task_id),
      )
      .collect();
    return children.sort(
      (a, b) => (a.step_index ?? 0) - (b.step_index ?? 0),
    );
  },
});

/**
 * Public task fetch. Bids are stripped while the auction window is still open
 * (sealed-bid property). Use `bids.forTask` to fetch them after close.
 */
export const get = query({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    return task;
  },
});

// ─── internal helpers used by auction actions ─────────────────────────────

export const _get = internalQuery({
  args: { task_id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) throw new Error(`task ${args.task_id} not found`);
    return task;
  },
});

export const _setStatus = internalMutation({
  args: { task_id: v.id("tasks"), status: taskStatusValidator },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { status: args.status });
  },
});

export const _setPaymentStatus = internalMutation({
  args: {
    task_id: v.id("tasks"),
    payment_status: v.string(),
    status: v.optional(taskStatusValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, {
      payment_status: args.payment_status,
      ...(args.status ? { status: args.status } : {}),
    });
  },
});

export const _setWinner = internalMutation({
  args: {
    task_id: v.id("tasks"),
    winning_bid_id: v.id("bids"),
    price_paid: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, {
      status: "awarded",
      winning_bid_id: args.winning_bid_id,
      price_paid: args.price_paid,
    });
  },
});

export const _setResult = internalMutation({
  args: { task_id: v.id("tasks"), result: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { result: args.result });
  },
});

/** Measured execution spend from the winner's in-process model calls.
 * Internal-only and self-validating: non-finite or negative telemetry is
 * dropped (recorded nothing) rather than corrupting the row — the value
 * panel treats absence as "not measured", which is the honest state. */
export const _recordExecutionUsage = internalMutation({
  args: {
    task_id: v.id("tasks"),
    cost_usd: v.number(),
    input_tokens: v.number(),
    output_tokens: v.number(),
    models: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ok = (n: number) => Number.isFinite(n) && n >= 0;
    if (!ok(args.cost_usd) || !ok(args.input_tokens) || !ok(args.output_tokens)) {
      return;
    }
    await ctx.db.patch(args.task_id, {
      execution_cost_usd: args.cost_usd,
      execution_input_tokens: args.input_tokens,
      execution_output_tokens: args.output_tokens,
      execution_models: args.models.slice(0, 16),
    });
  },
});

export const _setVerdict = internalMutation({
  args: { task_id: v.id("tasks"), verdict: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, { judge_verdict: args.verdict });
  },
});

/**
 * Reset the bid window. Called by the enrichment phase after Hyperspell/Nia
 * context is attached so the visible 15s countdown starts cleanly *after*
 * enrichment, not from the moment the task was posted.
 */
export const _setBidWindow = internalMutation({
  args: { task_id: v.id("tasks"), bid_window_closes_at: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.task_id, {
      bid_window_closes_at: args.bid_window_closes_at,
    });
  },
});
