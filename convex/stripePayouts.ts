"use node";

// Approval-gated Stripe money movement.
//
// The checkout leg authorizes with capture_method "manual" and a destination
// charge, so funds only reach the winning agent's connected account when a
// HUMAN approves the capture. This action is that gate: it is the single
// place in the codebase that moves money, it requires the admin dashboard
// secret on every call, and by default it refuses to capture unless the
// task's judge verdict is an accept (force=true records an override in the
// lifecycle log rather than bypassing it silently).

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { publicDemoMode } from "../lib/public-demo";

const STRIPE_BASE = "https://api.stripe.com/v1";

function assertAdminSecret(secret: string): void {
  const expected = process.env.ADMIN_DASHBOARD_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("invalid admin secret");
  }
}

function assertStripePayoutsEnabled(): void {
  if (publicDemoMode()) {
    throw new Error("Stripe payouts are disabled in public demo mode");
  }
  if (process.env.ARBOR_PAYMENTS_MODE !== "stripe_checkout") {
    throw new Error("Stripe payouts require ARBOR_PAYMENTS_MODE=stripe_checkout");
  }
}

function stripeKey(): string {
  const key =
    process.env.STRIPE_SECRET_KEY?.trim() || process.env.STRIPE_API_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

async function stripePost(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeKey()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new Error(`stripe ${path}: ${message}`);
  }
  return body;
}

export const approveCapture = action({
  args: {
    admin_secret: v.string(),
    task_id: v.id("tasks"),
    decision: v.union(v.literal("capture"), v.literal("cancel")),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    decision: v.string(),
    stripe_status: v.optional(v.string()),
    detail: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    assertStripePayoutsEnabled();
    assertAdminSecret(args.admin_secret);

    const escrow = (await ctx.runQuery(api.escrow.forTask, {
      task_id: args.task_id,
    })) as Doc<"escrow"> | null;
    if (!escrow) throw new Error("no escrow row for task");
    if (escrow.payment_status !== "authorized") {
      throw new Error(
        `escrow payment_status is ${escrow.payment_status ?? "unset"}, expected authorized`,
      );
    }
    const intentId = escrow.stripe_payment_intent_id;
    if (!intentId) throw new Error("escrow carries no payment intent");

    if (args.decision === "capture") {
      const task = (await ctx.runQuery(api.tasks.get, {
        task_id: args.task_id,
      })) as { judge_verdict?: { verdict?: string } } | null;
      const accepted = task?.judge_verdict?.verdict === "accept";
      if (!accepted && !args.force) {
        return {
          ok: false,
          decision: "capture",
          detail:
            "task has no accepting judge verdict; pass force=true to capture anyway (the override is logged)",
        };
      }
      const intent = await stripePost(
        `/payment_intents/${encodeURIComponent(intentId)}/capture`,
      );
      await ctx.runMutation(internal.escrow._markStripeCaptured, {
        task_id: args.task_id,
        stripe_payment_intent_id: intentId,
      });
      await ctx.runMutation(internal.tasks._setPaymentStatus, {
        task_id: args.task_id,
        payment_status: "captured",
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "stripe_payment_captured",
        payload: {
          stripe_payment_intent_id: intentId,
          approved_by: "admin_secret",
          forced: Boolean(args.force && !accepted),
        },
      });
      return {
        ok: true,
        decision: "capture",
        stripe_status: String(intent.status ?? "unknown"),
      };
    }

    const intent = await stripePost(
      `/payment_intents/${encodeURIComponent(intentId)}/cancel`,
    );
    await ctx.runMutation(internal.escrow._markStripeCanceled, {
      task_id: args.task_id,
      stripe_payment_intent_id: intentId,
      reason: "admin_canceled",
    });
    await ctx.runMutation(internal.tasks._setPaymentStatus, {
      task_id: args.task_id,
      payment_status: "canceled",
    });
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "stripe_payment_canceled",
      payload: { stripe_payment_intent_id: intentId, approved_by: "admin_secret" },
    });
    return {
      ok: true,
      decision: "cancel",
      stripe_status: String(intent.status ?? "unknown"),
    };
  },
});
