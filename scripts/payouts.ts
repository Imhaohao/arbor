// Human payout console for the approval-gated Stripe capture leg.
//
// Usage:
//   npx tsx scripts/payouts.ts list
//   npx tsx scripts/payouts.ts approve --task <task_id> [--force]
//   npx tsx scripts/payouts.ts cancel  --task <task_id>
//
// `approve` captures the manually-held PaymentIntent, which is the moment
// funds actually move to the winning agent's connected account (test mode
// with an sk_test key). Requires ADMIN_DASHBOARD_SECRET in .env.local.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const ROOT = resolve(__dirname, "..");

function loadEnvLocal(): void {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].replace(/\s+#.*$/, "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  const client = new ConvexHttpClient(url);
  const command = process.argv[2];

  if (command === "list") {
    const rows = await client.query(api.payments.pendingCapturesMasked, {});
    if (rows.length === 0) {
      console.log("no escrows awaiting capture");
      return;
    }
    for (const r of rows) {
      console.log(
        `${r.task_id}  $${r.locked_amount.toFixed(2)}  seller=${r.seller_id}  ` +
          `pi=${r.payment_intent_tail}  task=${r.task_status ?? "?"}  ` +
          `judge_accepted=${r.judge_accepted}`,
      );
    }
    return;
  }

  if (command === "approve" || command === "cancel") {
    const taskId = flag("task");
    if (!taskId) throw new Error("--task <task_id> is required");
    const secret = process.env.ADMIN_DASHBOARD_SECRET;
    if (!secret) throw new Error("ADMIN_DASHBOARD_SECRET is not set");
    const result = await client.action(api.stripePayouts.approveCapture, {
      admin_secret: secret,
      task_id: taskId as never,
      decision: command === "approve" ? "capture" : "cancel",
      force: process.argv.includes("--force"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  console.log("usage: payouts <list|approve --task <id> [--force]|cancel --task <id>>");
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
