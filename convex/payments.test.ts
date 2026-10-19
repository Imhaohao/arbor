/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function insertTask(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("tasks", {
      posted_by: "buyer:test",
      task_type: "general",
      prompt: "Test Stripe safety guard.",
      max_budget: 1,
      status: "open",
      bid_window_seconds: 30,
      bid_window_closes_at: Date.now() + 30_000,
    }),
  );
}

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

describe("Stripe bridge safety guards", () => {
  test("rejects every public Stripe mutation outside checkout mode", async () => {
    const previousMode = process.env.ARBOR_PAYMENTS_MODE;
    process.env.ARBOR_PAYMENTS_MODE = "mock";
    try {
      const t = convexTest(schema, modules);
      const task_id = await insertTask(t);
      const unavailable = /requires ARBOR_PAYMENTS_MODE=stripe_checkout/;

      await expect(
        t.mutation(api.payments.upsertStripeAccount, {
          agent_id: "agent:test",
          stripe_account_id: "acct_test",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements_currently_due: [],
        }),
      ).rejects.toThrow(unavailable);
      await expect(
        t.mutation(api.payments.attachStripeCheckout, {
          task_id,
          stripe_checkout_session_id: "cs_test",
          stripe_connected_account_id: "acct_test",
          stripe_application_fee_amount: 10,
          stripe_currency: "usd",
        }),
      ).rejects.toThrow(unavailable);
      await expect(
        t.mutation(api.payments.markStripeAuthorized, {
          task_id,
          stripe_payment_intent_id: "pi_test",
        }),
      ).rejects.toThrow(unavailable);
      await expect(
        t.mutation(api.payments.markStripeCaptured, {
          task_id,
          stripe_payment_intent_id: "pi_test",
        }),
      ).rejects.toThrow(unavailable);
      await expect(
        t.mutation(api.payments.markStripeCanceled, { task_id }),
      ).rejects.toThrow(unavailable);
      await expect(
        t.action(api.stripePayouts.approveCapture, {
          admin_secret: "test",
          task_id,
          decision: "capture",
        }),
      ).rejects.toThrow(/Stripe payouts require ARBOR_PAYMENTS_MODE=stripe_checkout/);
    } finally {
      restoreEnv("ARBOR_PAYMENTS_MODE", previousMode);
    }
  });

  test("rejects Stripe bridge mutations in public demo even with checkout enabled", async () => {
    const previousMode = process.env.ARBOR_PAYMENTS_MODE;
    const previousDemo = process.env.ARBOR_PUBLIC_DEMO_MODE;
    process.env.ARBOR_PAYMENTS_MODE = "stripe_checkout";
    process.env.ARBOR_PUBLIC_DEMO_MODE = "true";
    try {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.payments.upsertStripeAccount, {
          agent_id: "agent:test",
          stripe_account_id: "acct_test",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements_currently_due: [],
        }),
      ).rejects.toThrow(/Stripe bridge is disabled in public demo mode/);
    } finally {
      restoreEnv("ARBOR_PAYMENTS_MODE", previousMode);
      restoreEnv("ARBOR_PUBLIC_DEMO_MODE", previousDemo);
    }
  });

  test("requires a configured bridge secret even in checkout mode", async () => {
    const previousMode = process.env.ARBOR_PAYMENTS_MODE;
    const previousSecret = process.env.ARBOR_STRIPE_CONVEX_BRIDGE_SECRET;
    process.env.ARBOR_PAYMENTS_MODE = "stripe_checkout";
    delete process.env.ARBOR_STRIPE_CONVEX_BRIDGE_SECRET;
    try {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.payments.upsertStripeAccount, {
          agent_id: "agent:test",
          stripe_account_id: "acct_test",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements_currently_due: [],
        }),
      ).rejects.toThrow(/invalid Stripe bridge secret/);
    } finally {
      restoreEnv("ARBOR_PAYMENTS_MODE", previousMode);
      restoreEnv("ARBOR_STRIPE_CONVEX_BRIDGE_SECRET", previousSecret);
    }
  });
});
