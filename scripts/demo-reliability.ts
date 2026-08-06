/**
 * Demo-reliability measurement harness.
 *
 * Posts a batch of realistic buyer tasks through the exact same public
 * mutation every real entry point converges on — `api.tasks.post`
 * (convex/tasks.ts). That is the same mutation convex/intake.ts's
 * `approveAndPost` calls after the web form's (components/PostTaskForm.tsx)
 * LLM clarification step, and the same one lib/mcp-tools.ts calls for
 * MCP-driven buyers. This script skips ONLY the intake prompt-shaping layer
 * (which just rewrites prompt text — it has no auction/bid/execution/judge
 * logic of its own); every mechanic this task cares about (bid window,
 * bidding, Vickrey resolution, execution, judging, settlement, the Stripe
 * gate) runs exactly as it would for a real buyer submission. Nothing here
 * calls an internal/admin mutation to fast-forward or spoof any state.
 *
 * Read-only against everything except: posting new rows via the public
 * `tasks.post` mutation — i.e. exactly what submitting the real form does.
 *
 * IMPORTANT FINDING BAKED INTO THIS SCRIPT'S DESIGN: as of 2026-08-05 the
 * dev deployment has ARBOR_PAYMENTS_MODE=stripe_checkout (verified via the
 * Convex env, NOT "internal" as briefed). convex/auctions.ts `resolve()`
 * puts every non-golden task into `requires_payment` immediately after
 * auction resolution and does NOT schedule execution until a real Stripe
 * Checkout session is completed (app/api/stripe/webhook/route.ts). This
 * script will NEVER attempt to complete that checkout — entering payment
 * card data into any form is out of policy regardless of Stripe test mode —
 * so `requires_payment` is treated as an effectively-terminal, clearly
 * labeled outcome ("blocked_on_payment_gate"), not a bug in this script.
 *
 * Usage:
 *   npx tsx scripts/demo-reliability.ts [--stagger-ms 8000] [--timeout-ms 300000]
 *     [--poll-ms 5000] [--out scripts/data/demo-reliability-<ts>.json]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const ROOT = resolve(__dirname, "..");

// Synthetic buyer id for this run. Deliberately NOT "buyer:web" (the real
// web form's id): convex/tasks.ts `post` looks up product_context_profiles
// by posted_by, so reusing "buyer:web" would silently attach a real buyer's
// saved company profile to synthetic test tasks. A distinct id also makes
// this batch trivially greppable/excludable later.
const POSTED_BY = "demo-reliability:web";

// convex/tasks.ts BID_WINDOW_SECONDS = 90 today. Not imported directly:
// that module pulls in Convex server-runtime deps not meant to load outside
// the Convex bundler (see scripts/golden-detectability.ts for the same note).
const BID_WINDOW_SECONDS = 90;

// lib/specialists/registry.ts ARBOR_FLOOR_AGENT_IDS. Hardcoded rather than
// imported: that module has module-scope side effects (registering runners,
// A2A/MCP client setup) intended for the Convex runtime, and the three ids
// are stable, documented constants (see convex/auctions.ts comments and
// lib/public-demo.ts PUBLIC_DEMO_AGENT_ID).
const FLOOR_AGENT_IDS = new Set([
  "arbor-hive-backstop",
  "arbor-baseline",
  "arbor-public-demo",
]);

const TRUE_TERMINAL = new Set(["complete", "disputed", "cancelled", "failed"]);

interface TaskSpec {
  label: string;
  task_type: string;
  max_budget: number;
  prompt: string;
}

// 22 tasks across 11 task_types and budgets $2-$5 (all above the ~$0.40
// floor-agent minimum). The first four are verbatim copies of the four
// "Try" quick-start examples on components/PostTaskForm.tsx — literally
// what a live-demo presenter would click — at the form's default $2.00
// budget. The rest are adapted from real historical prompts in
// scripts/data/organic-tasks-snapshot.json (register: casual phrasing,
// some short/vague, some detailed) but re-budgeted to >= $2.
const TASKS: TaskSpec[] = [
  {
    label: "quickstart-stripe-connect",
    task_type: "general",
    max_budget: 2,
    prompt:
      "I need help setting up payments in my new AI agent marketplace. Not sure which payment platform to use or how to handle marketplace payouts. Recommend a stack and walk me through the integration steps.",
  },
  {
    label: "quickstart-landing-page",
    task_type: "general",
    max_budget: 2,
    prompt:
      "Design a clean landing page for a developer tool that explains the product in 10 seconds, has a clear CTA, and follows a modern, minimal aesthetic.",
  },
  {
    label: "quickstart-backlog-triage",
    task_type: "general",
    max_budget: 2,
    prompt:
      "Look at the open issues in our project tracker and propose a priority order based on impact, urgency, and effort. Group them into next sprint vs. later.",
  },
  {
    label: "quickstart-tiktok-shop",
    task_type: "general",
    max_budget: 2,
    prompt:
      "Plan a TikTok Shop creator campaign for a clean-label electrolyte drink. Find high-fit creators, draft outreach, and flag risk.",
  },
  {
    label: "organic-stripe-codebase",
    task_type: "general",
    max_budget: 2,
    prompt: "need to get stripe set up in our codebase, I don't know how",
  },
  {
    label: "organic-youtube-short",
    task_type: "general",
    max_budget: 3,
    prompt:
      "can you make me a video that creates a youtube short of ai fruit stories",
  },
  {
    label: "organic-trip-planning",
    task_type: "general",
    max_budget: 2,
    prompt: "plan and book a trip to los vagas for me",
  },
  {
    label: "organic-rubric-compare",
    task_type: "general",
    max_budget: 2,
    prompt: "can you compare ideas using a rubric for me?",
  },
  {
    label: "organic-pr-review",
    task_type: "general",
    max_budget: 3,
    prompt:
      "Can you review the open pull requests on our GitHub repo and tell me which ones are safe to merge?",
  },
  {
    label: "organic-voice-narration",
    task_type: "general",
    max_budget: 3,
    prompt:
      "Write a 30-second voiceover script and generate the narration audio for a product demo video.",
  },
  {
    label: "campaign-electrolyte-full",
    task_type: "end-to-end-campaign",
    max_budget: 3,
    prompt:
      "Launch a TikTok Shop creator campaign for a clean-label electrolyte drink targeting wellness creators, college athletes, and busy professionals. Find creators with credible GMV signals, strong audience fit, and low brand-safety risk. Produce a shortlist, outreach drafts, sample-request notes, and risk rationale.",
  },
  {
    label: "campaign-electrolyte-reacher",
    task_type: "end-to-end-campaign",
    max_budget: 2.5,
    prompt:
      "We are a seed-stage startup launching a clean-label electrolyte drink on TikTok Shop. Find high-fit creators, cite Reacher evidence, draft outreach, request samples, flag campaign risk, and produce a first 7-day launch plan.",
  },
  {
    label: "docs-convex-scheduled-fn",
    task_type: "code-context-retrieval",
    max_budget: 2.5,
    prompt:
      "Index the Convex docs at https://docs.convex.dev and tell me how to define a scheduled action that fires after a delay. Cite the specific docs you found.",
  },
  {
    label: "docs-nextjs-streaming",
    task_type: "code-context-retrieval",
    max_budget: 3,
    prompt:
      "How does Next.js App Router streaming and partial prerendering work? Give me the mental model and a short code example. Cite documentation.",
  },
  {
    label: "creator-scouting-reacher",
    task_type: "creator-scouting",
    max_budget: 3,
    prompt:
      "Use Reacher to list the shops this API key can access, then for the first shop return the top 5 affiliate creators by lifetime GMV with their handles, GMV, and follower counts. Cite the actual Reacher tool calls you made.",
  },
  {
    label: "fx-rate-usd-eur",
    task_type: "currency-conversion",
    max_budget: 5,
    prompt:
      "Convert currencies for an invoice: what is the live USD to EUR exchange rate, and how much is 100 USD in EUR?",
  },
  {
    label: "fx-rate-usd-eur-plaintext",
    task_type: "currency-conversion",
    max_budget: 5,
    prompt:
      "What is the live USD to EUR exchange rate right now, and how much is 100 USD in EUR? Query a live FX rates source and answer in plain text with the numbers. No UI, no code, no design work, no React or web components — a plain numeric answer only.",
  },
  {
    label: "copy-water-bottle",
    task_type: "copywriting",
    max_budget: 2,
    prompt:
      "Write a three-sentence product description for a reusable stainless steel water bottle aimed at hikers. Plain text copywriting only.",
  },
  {
    label: "market-discovery-summary",
    task_type: "market discovery",
    max_budget: 2,
    prompt:
      "Post this brief into the Arbor market and confirm routing: summarize what the Arbor marketplace does in two sentences.",
  },
  {
    label: "research-nextjs-brief",
    task_type: "research",
    max_budget: 4,
    prompt:
      "Produce a concise engineering brief on how Next.js App Router streaming and partial prerendering work, grounded in current documentation, with the 5 most important gotchas for a dashboard that live-updates from a Convex backend.",
  },
  {
    label: "startup-launch-plan-electrolyte",
    task_type: "startup-launch-plan",
    max_budget: 3,
    prompt:
      "We are a seed-stage startup launching a clean-label electrolyte drink on TikTok Shop with a tiny growth team and a $3 simulated agent budget. Target wellness creators, college athletes, and busy professionals who can drive credible first-week GMV. Build a creator shortlist, outreach drafts, sample-request notes, launch risk rationale, and a first 7-day action plan.",
  },
  {
    label: "multistep-debate-curriculum",
    task_type: "multi-step-engineering",
    max_budget: 4,
    prompt:
      "can you build me a speech and debate webapp curriculum that helps me improve my speaking?",
  },
];

// ─── env + CLI ──────────────────────────────────────────────────────────────

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

function convexUrl(): string {
  loadEnvFile(resolve(ROOT, ".env.local"));
  loadEnvFile(resolve(ROOT, ".env"));
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── run bookkeeping ────────────────────────────────────────────────────────

interface ChildDiagnosis {
  step_index?: number;
  status: string;
  winner_agent_id?: string;
  reason?: string;
}

interface RunRecord {
  label: string;
  task_type: string;
  max_budget: number;
  prompt_len: number;
  task_id: Id<"tasks">;
  posted_at: number;
  deadline: number;
  blocked_seen_at?: number;
  done: boolean;
  timed_out?: boolean;
  terminal_at?: number;
  elapsed_ms?: number;
  final_status?: string;
  category?: string;
  reason?: string;
  bids_received?: number;
  bids_declined?: number;
  winner_agent_id?: string;
  winner_is_floor_agent?: boolean;
  price_paid?: number;
  judge_verdict?: string;
  judge_quality_score?: number;
  children?: ChildDiagnosis[];
}

async function finalize(
  client: ConvexHttpClient,
  r: RunRecord,
  task: NonNullable<Awaited<ReturnType<typeof client.query<typeof api.tasks.get>>>>,
  now: number,
  timedOut: boolean,
): Promise<void> {
  const lifecycle = await client.query(api.lifecycle.forTask, {
    task_id: r.task_id,
  });
  const bidReceivedCount = lifecycle.filter(
    (e) => e.event_type === "bid_received",
  ).length;
  const bidDeclinedCount = lifecycle.filter(
    (e) => e.event_type === "bid_declined",
  ).length;
  const auctionResolved = lifecycle.find(
    (e) => e.event_type === "auction_resolved",
  );
  const auctionFailed = lifecycle.find((e) => e.event_type === "auction_failed");
  const executionFailedEvents = lifecycle.filter(
    (e) => e.event_type === "execution_failed",
  );
  const contextRequestNeeded = lifecycle.find(
    (e) => e.event_type === "context_request_needed",
  );

  const winnerPayload = auctionResolved?.payload as
    | { winner?: { agent_id?: string } }
    | undefined;
  const winner_agent_id = winnerPayload?.winner?.agent_id;

  let category: string;
  let reason: string | undefined;

  if (task.status === "complete") {
    category = "delivered_accepted";
  } else if (task.status === "disputed") {
    category = "delivered_rejected";
  } else if (task.status === "cancelled") {
    category = "cancelled";
  } else if (task.status === "failed") {
    category = "failed";
    if (auctionFailed) {
      const payload = auctionFailed.payload as { reason?: string } | undefined;
      reason = `auction_failed: ${payload?.reason ?? "no valid bids under budget"}`;
    } else if (executionFailedEvents.length > 0) {
      const last = executionFailedEvents[executionFailedEvents.length - 1];
      const payload = last.payload as { reason?: string } | undefined;
      reason = `execution_failed (after ${executionFailedEvents.length} attempt(s)): ${payload?.reason ?? "unknown"}`;
    } else {
      reason = "failed (no auction_failed/execution_failed event found in lifecycle)";
    }
  } else if (task.status === "requires_payment") {
    category = "blocked_on_payment_gate";
    reason =
      "ARBOR_PAYMENTS_MODE=stripe_checkout: task won its auction but cannot reach execution without a completed Stripe checkout. Not attempted by this script (no payment-form entry, per policy).";
  } else if (contextRequestNeeded) {
    category = "blocked_on_missing_context";
    reason =
      "Hyperspell + Nia both returned empty; pipeline paused waiting for userContext.provide and never reached the auction.";
  } else {
    category = timedOut ? "timeout_incomplete" : "unknown";
    reason = `stuck at status=${task.status} after ${Math.round((now - r.posted_at) / 1000)}s`;
  }

  // Compound (multi-step) tasks: the parent's own `status` field never
  // leaves "planning" until every child settles, so a stuck compound task
  // looks like an unexplained hang unless we look at its children directly.
  let children: ChildDiagnosis[] | undefined;
  if (Array.isArray(task.task_plan) && task.task_plan.length > 0) {
    const kids = await client.query(api.tasks.childrenOf, {
      parent_task_id: r.task_id,
    });
    children = [];
    for (const kid of kids) {
      const kidLifecycle = await client.query(api.lifecycle.forTask, {
        task_id: kid._id,
      });
      const kidAuctionFailed = kidLifecycle.find(
        (e) => e.event_type === "auction_failed",
      );
      const kidResolved = kidLifecycle.find(
        (e) => e.event_type === "auction_resolved",
      );
      const kidWinnerPayload = kidResolved?.payload as
        | { winner?: { agent_id?: string } }
        | undefined;
      children.push({
        step_index: kid.step_index,
        status: kid.status,
        winner_agent_id: kidWinnerPayload?.winner?.agent_id,
        reason:
          kid.status === "requires_payment"
            ? "blocked_on_payment_gate"
            : kid.status === "failed" && kidAuctionFailed
              ? "auction_failed: no valid bids under budget"
              : undefined,
      });
    }
    if (category === "timeout_incomplete" || category === "unknown") {
      const blockedChild = children.find(
        (c) => c.status === "requires_payment",
      );
      if (blockedChild) {
        category = "blocked_on_payment_gate";
        reason = `parent stuck at "${task.status}" because child step ${blockedChild.step_index} is requires_payment; a compound task cannot advance until every step settles.`;
      } else {
        const failedChild = children.find((c) => c.status === "failed");
        if (failedChild) {
          category = "blocked_on_failed_child";
          reason = `parent stuck at "${task.status}"; child step ${failedChild.step_index} failed (${failedChild.reason ?? "reason not captured"})`;
        }
      }
    }
  }

  r.done = true;
  r.timed_out = timedOut;
  r.terminal_at = now;
  r.elapsed_ms = now - r.posted_at;
  r.final_status = task.status;
  r.category = category;
  r.reason = reason;
  r.bids_received = bidReceivedCount;
  r.bids_declined = bidDeclinedCount;
  r.winner_agent_id = winner_agent_id;
  r.winner_is_floor_agent = winner_agent_id
    ? FLOOR_AGENT_IDS.has(winner_agent_id)
    : undefined;
  r.price_paid = task.price_paid;
  const verdict = task.judge_verdict as
    | { verdict?: string; quality_score?: number }
    | undefined;
  r.judge_verdict = verdict?.verdict;
  r.judge_quality_score = verdict?.quality_score;
  r.children = children;

  console.log(
    `[${category}] ${r.label} (${r.task_id}) status=${task.status} elapsed=${(
      (r.elapsed_ms ?? 0) / 1000
    ).toFixed(1)}s bids=${bidReceivedCount} winner=${winner_agent_id ?? "-"}${
      r.winner_is_floor_agent ? " (FLOOR AGENT)" : ""
    }${reason ? ` — ${reason}` : ""}`,
  );
}

// ─── stats helpers ──────────────────────────────────────────────────────────

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function p90(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[idx];
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const client = new ConvexHttpClient(convexUrl());
  const staggerMs = Number(flag("stagger-ms") ?? 8000);
  // 15 min, not 5: a live run of this script (2026-08-06, 22 tasks, 8s
  // stagger) showed a hard stall past ~8 concurrent in-flight auctions —
  // the first 8 tasks resolved in 131-179s, but the remaining 14 sat with
  // zero forward progress (no auction_resolved/auction_failed event at all,
  // regardless of how many bids had already landed) for 8-13 minutes before
  // ALL resolving within about a 1-second window of each other. A 5-minute
  // per-task timeout mislabels most of a batch this size as "timeout" when
  // they in fact go on to resolve — see the run report for 2026-08-06.
  const perTaskTimeoutMs = Number(flag("timeout-ms") ?? 15 * 60 * 1000);
  const pollMs = Number(flag("poll-ms") ?? 5000);

  console.log(
    `Arbor demo-reliability run. ${TASKS.length} tasks, stagger=${staggerMs}ms, per-task timeout=${perTaskTimeoutMs}ms, poll=${pollMs}ms.`,
  );
  console.log(
    `Posting via api.tasks.post as posted_by="${POSTED_BY}" (BID_WINDOW_SECONDS=${BID_WINDOW_SECONDS} at time of writing).`,
  );
  console.log(
    "Excludes golden-audit tasks by construction: this script only ever tracks the exact task_ids it itself posted, never a broader query over the tasks table.\n",
  );

  const runs: RunRecord[] = [];
  for (const spec of TASKS) {
    const posted_at = Date.now();
    let task_id: Id<"tasks">;
    try {
      const result = await client.mutation(api.tasks.post, {
        posted_by: POSTED_BY,
        task_type: spec.task_type,
        prompt: spec.prompt,
        max_budget: spec.max_budget,
      });
      task_id = result.task_id as Id<"tasks">;
    } catch (err) {
      console.error(
        `POST FAILED for "${spec.label}": ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    console.log(
      `posted ${task_id} [${spec.label}] type=${spec.task_type} budget=$${spec.max_budget.toFixed(2)}`,
    );
    runs.push({
      label: spec.label,
      task_type: spec.task_type,
      max_budget: spec.max_budget,
      prompt_len: spec.prompt.length,
      task_id,
      posted_at,
      deadline: posted_at + perTaskTimeoutMs,
      done: false,
    });
    await sleep(staggerMs);
  }

  console.log(
    `\nPosted ${runs.length}/${TASKS.length} tasks. Polling until terminal or timeout...\n`,
  );

  while (runs.some((r) => !r.done)) {
    for (const r of runs) {
      if (r.done) continue;
      const now = Date.now();
      const task = await client.query(api.tasks.get, { task_id: r.task_id });
      if (!task) continue;

      if (TRUE_TERMINAL.has(task.status)) {
        await finalize(client, r, task, now, false);
        continue;
      }
      if (task.status === "requires_payment") {
        // Grace period in case something DOES advance it — we measure
        // rather than assume, even though nothing in the code should.
        if (r.blocked_seen_at === undefined) r.blocked_seen_at = now;
        if (now - r.blocked_seen_at >= 30_000) {
          await finalize(client, r, task, now, false);
          continue;
        }
      }
      if (now >= r.deadline) {
        await finalize(client, r, task, now, true);
      }
    }
    if (runs.some((r) => !r.done)) await sleep(pollMs);
  }

  // ─── aggregate report ─────────────────────────────────────────────────
  const total = runs.length;
  const byCategory = new Map<string, RunRecord[]>();
  for (const r of runs) {
    const key = r.category ?? "unknown";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(r);
  }

  const deliveredAccepted = byCategory.get("delivered_accepted")?.length ?? 0;
  const deliveredRejected = byCategory.get("delivered_rejected")?.length ?? 0;
  const judgedTotal = deliveredAccepted + deliveredRejected;

  const withWinner = runs.filter((r) => r.winner_agent_id);
  const floorWinners = withWinner.filter((r) => r.winner_is_floor_agent);

  const auctionFailedNoBids = runs.filter(
    (r) => r.category === "failed" && r.reason?.startsWith("auction_failed"),
  );
  const paymentBlocked = runs.filter(
    (r) => r.category === "blocked_on_payment_gate",
  );

  // "Time to auction outcome": elapsed from post to the first point the
  // auction machinery produced a definite result (won or no-valid-bids).
  // This is the closest measurable proxy to "time to delivery" available
  // under the current payment gate — NOT the same thing, and reported
  // separately from any true delivered_* timing.
  const auctionOutcomeElapsed = runs
    .filter(
      (r) =>
        r.category === "blocked_on_payment_gate" ||
        r.category === "delivered_accepted" ||
        r.category === "delivered_rejected" ||
        (r.category === "failed" && r.reason?.startsWith("auction_failed")),
    )
    .map((r) => r.elapsed_ms!)
    .filter((v): v is number => typeof v === "number");

  const deliveredElapsed = runs
    .filter(
      (r) => r.category === "delivered_accepted" || r.category === "delivered_rejected",
    )
    .map((r) => r.elapsed_ms!)
    .filter((v): v is number => typeof v === "number");

  console.log("\n=== Demo-reliability aggregate report ===\n");
  console.log(`Total tasks posted/tracked: ${total}`);
  console.log(
    `Reached a real judged delivery (complete or disputed): ${judgedTotal}/${total} (${pct(judgedTotal, total)})`,
  );
  console.log(
    `  - complete (judge accepted):  ${deliveredAccepted}/${total} (${pct(deliveredAccepted, total)})`,
  );
  console.log(
    `  - disputed (judge rejected):  ${deliveredRejected}/${total} (${pct(deliveredRejected, total)})`,
  );
  console.log(
    `Blocked on Stripe checkout gate (won auction, never reached execution): ${paymentBlocked.length}/${total} (${pct(paymentBlocked.length, total)})`,
  );
  console.log(
    `Auction failed outright (no valid bids under budget): ${auctionFailedNoBids.length}/${total} (${pct(auctionFailedNoBids.length, total)})`,
  );
  console.log(
    `\nOf tasks that got a winning bid at all (${withWinner.length}/${total}):`,
  );
  console.log(
    `  - won by an Arbor floor/backstop agent: ${floorWinners.length}/${withWinner.length} (${pct(floorWinners.length, withWinner.length)})`,
  );
  console.log(
    `  - won by a genuine specialist:          ${withWinner.length - floorWinners.length}/${withWinner.length} (${pct(withWinner.length - floorWinners.length, withWinner.length)})`,
  );

  console.log("\n-- Timing --");
  if (auctionOutcomeElapsed.length > 0) {
    console.log(
      `Time to auction outcome (won-or-failed-outright), n=${auctionOutcomeElapsed.length}: median=${(median(auctionOutcomeElapsed)! / 1000).toFixed(1)}s, p90=${(p90(auctionOutcomeElapsed)! / 1000).toFixed(1)}s`,
    );
  } else {
    console.log("Time to auction outcome: could not be measured (no qualifying tasks).");
  }
  if (deliveredElapsed.length > 0) {
    console.log(
      `Time to judged delivery, n=${deliveredElapsed.length}: median=${(median(deliveredElapsed)! / 1000).toFixed(1)}s, p90=${(p90(deliveredElapsed)! / 1000).toFixed(1)}s`,
    );
  } else {
    console.log(
      "Time to judged delivery: NOT MEASURED — zero tasks reached a judged delivery in this run (see payment-gate finding above).",
    );
  }

  console.log("\n-- Outcome breakdown (by category) --");
  for (const [cat, list] of [...byCategory.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`  ${cat}: ${list.length}/${total} (${pct(list.length, total)})`);
    const reasons = new Map<string, number>();
    for (const r of list) {
      const key = r.reason ?? "(no reason recorded)";
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    for (const [reason, count] of [...reasons.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`      x${count}: ${reason}`);
    }
  }

  console.log("\n-- Per-task detail --");
  for (const r of runs) {
    console.log(
      `  ${r.label} [${r.task_type}, $${r.max_budget.toFixed(2)}] -> ${r.category} (status=${r.final_status}, ${((r.elapsed_ms ?? 0) / 1000).toFixed(1)}s, bids=${r.bids_received}, winner=${r.winner_agent_id ?? "-"}, price_paid=${r.price_paid ?? "-"})`,
    );
    if (r.children && r.children.length > 0) {
      for (const c of r.children) {
        console.log(
          `      step ${c.step_index}: status=${c.status} winner=${c.winner_agent_id ?? "-"} ${c.reason ? `(${c.reason})` : ""}`,
        );
      }
    }
  }

  // An explicit --out is resolved against the repo root, not scripts/data.
  // Resolving it against outDir turned a repo-relative path the caller had
  // already qualified ("scripts/data/foo.json") into
  // "scripts/data/scripts/data/foo.json", whose parent does not exist — the
  // whole run's JSON was lost to ENOENT after the console summary printed.
  const outFlag = flag("out");
  const outPath = outFlag
    ? resolve(ROOT, outFlag)
    : resolve(
        ROOT,
        "scripts/data",
        `demo-reliability-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        run_at: new Date().toISOString(),
        posted_by: POSTED_BY,
        bid_window_seconds_assumed: BID_WINDOW_SECONDS,
        total,
        judged_total: judgedTotal,
        delivered_accepted: deliveredAccepted,
        delivered_rejected: deliveredRejected,
        payment_blocked: paymentBlocked.length,
        auction_failed_no_bids: auctionFailedNoBids.length,
        winners_total: withWinner.length,
        winners_floor_agent: floorWinners.length,
        auction_outcome_elapsed_ms: auctionOutcomeElapsed,
        delivered_elapsed_ms: deliveredElapsed,
        runs,
      },
      null,
      2,
    ),
  );
  console.log(`\nFull results written to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
