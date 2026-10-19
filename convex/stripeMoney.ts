"use node";

// Real-money side of settlement: authorize-then-capture Stripe PaymentIntents.
// Arbor is merchant of record unless the seller finished Connect onboarding, in
// which case the same intent carries a destination transfer. Every call is a
// no-op outside ARBOR_PAYMENTS_MODE=stripe_checkout.

import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { publicDemoMode } from "../lib/public-demo";

export function stripeCheckoutMode(): boolean {
  // The public preview must never enter a real-money settlement path, even
  // if a deployment accidentally retains Stripe checkout configuration.
  return !publicDemoMode() && process.env.ARBOR_PAYMENTS_MODE === "stripe_checkout";
}

export function stripeCurrency(): string {
  return (process.env.STRIPE_CURRENCY ?? "usd").toLowerCase();
}

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is required for Stripe settlement");
  return key;
}

function latestChargeId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

async function stripePost(
  path: string,
  params: URLSearchParams,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeSecretKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: params,
  });
  const body = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok) {
    const message =
      body &&
      typeof body.error === "object" &&
      body.error &&
      "message" in body.error
        ? String((body.error as { message?: unknown }).message)
        : `Stripe API error ${response.status}`;
    throw new Error(message);
  }
  return body ?? {};
}

export async function captureStripePaymentForTask(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
) {
  if (!stripeCheckoutMode()) return;
  const escrow = (await ctx.runQuery(api.escrow.forTask, { task_id })) as
    | {
        payment_processor?: string;
        payment_status?: string;
        stripe_payment_intent_id?: string;
        stripe_charge_id?: string;
      }
    | null;
  if (!escrow || escrow.payment_processor !== "stripe") return;
  if (escrow.payment_status === "captured") return;
  if (!escrow.stripe_payment_intent_id) {
    throw new Error("Stripe payment intent missing for real-money settlement");
  }
  if (escrow.payment_status !== "authorized") {
    throw new Error(
      `Stripe payment must be authorized before capture; got ${escrow.payment_status ?? "unknown"}`,
    );
  }
  const intent = await stripePost(
    `payment_intents/${escrow.stripe_payment_intent_id}/capture`,
    new URLSearchParams(),
    `arbor_capture_${task_id}_${escrow.stripe_payment_intent_id}`,
  );
  const chargeId = latestChargeId(intent.latest_charge) ?? escrow.stripe_charge_id;
  await ctx.runMutation(internal.escrow._markStripeCaptured, {
    task_id,
    stripe_payment_intent_id: escrow.stripe_payment_intent_id,
    stripe_charge_id: chargeId,
  });
  await ctx.runMutation(internal.tasks._setPaymentStatus, {
    task_id,
    payment_status: "captured",
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "stripe_payment_captured",
    payload: {
      stripe_payment_intent_id: escrow.stripe_payment_intent_id,
      stripe_charge_id: chargeId,
    },
  });
}

export async function cancelStripePaymentForTask(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
  reason: string,
) {
  if (!stripeCheckoutMode()) return;
  const escrow = (await ctx.runQuery(api.escrow.forTask, { task_id })) as
    | {
        payment_processor?: string;
        payment_status?: string;
        stripe_payment_intent_id?: string;
      }
    | null;
  if (!escrow || escrow.payment_processor !== "stripe") return;
  if (escrow.payment_status === "canceled" || escrow.payment_status === "captured") {
    return;
  }
  if (!escrow.stripe_payment_intent_id) return;
  if (escrow.payment_status === "authorized") {
    const params = new URLSearchParams();
    params.set("cancellation_reason", "requested_by_customer");
    await stripePost(
      `payment_intents/${escrow.stripe_payment_intent_id}/cancel`,
      params,
      `arbor_cancel_${task_id}_${escrow.stripe_payment_intent_id}`,
    );
  }
  await ctx.runMutation(internal.escrow._markStripeCanceled, {
    task_id,
    stripe_payment_intent_id: escrow.stripe_payment_intent_id,
    reason,
  });
  await ctx.runMutation(internal.tasks._setPaymentStatus, {
    task_id,
    payment_status: "canceled",
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "stripe_payment_canceled",
    payload: {
      stripe_payment_intent_id: escrow.stripe_payment_intent_id,
      reason,
    },
  });
}


/**
 * Returns a captured payment to the buyer (a human override rejected work the
 * judge had accepted). Uncaptured authorizations are voided instead.
 */
export async function refundStripePaymentForTask(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
  reason: string,
) {
  if (!stripeCheckoutMode()) return;
  const escrow = (await ctx.runQuery(api.escrow.forTask, { task_id })) as
    | {
        payment_processor?: string;
        payment_status?: string;
        stripe_payment_intent_id?: string;
      }
    | null;
  if (!escrow || escrow.payment_processor !== "stripe") return;
  if (escrow.payment_status !== "captured") {
    await cancelStripePaymentForTask(ctx, task_id, reason);
    return;
  }
  if (!escrow.stripe_payment_intent_id) {
    throw new Error("Stripe payment intent missing for refund");
  }
  const params = new URLSearchParams();
  params.set("payment_intent", escrow.stripe_payment_intent_id);
  params.set("reason", "requested_by_customer");
  params.set("metadata[arbor_task_id]", task_id);
  const refund = await stripePost(
    "refunds",
    params,
    `arbor_refund_${task_id}_${escrow.stripe_payment_intent_id}`,
  );
  await ctx.runMutation(internal.escrow._markStripeRefunded, {
    task_id,
    stripe_refund_id: typeof refund.id === "string" ? refund.id : undefined,
    reason,
  });
  await ctx.runMutation(internal.tasks._setPaymentStatus, {
    task_id,
    payment_status: "refunded",
  });
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type: "stripe_payment_refunded",
    payload: {
      stripe_payment_intent_id: escrow.stripe_payment_intent_id,
      stripe_refund_id: refund.id,
      reason,
    },
  });
}

/**
 * Money side of a human override. Accept captures a still-held authorization
 * (an earlier judge rejection already voided it, so there is nothing to take);
 * reject returns the buyer's money whether it was held or captured.
 */
export async function settleStripeForOverride(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
  verdict: "accept" | "reject",
) {
  if (!stripeCheckoutMode()) return;
  if (verdict === "reject") {
    await refundStripePaymentForTask(ctx, task_id, "buyer_override_reject");
    return;
  }
  const escrow = (await ctx.runQuery(api.escrow.forTask, { task_id })) as
    | { payment_processor?: string; payment_status?: string }
    | null;
  if (escrow?.payment_processor === "stripe" && escrow.payment_status === "authorized") {
    await captureStripePaymentForTask(ctx, task_id);
  }
}
