/**
 * PR-review reliability eval harness for the Arbor hive-mind.
 *
 * Live mode:   npx tsx eval/pr-review-reliability/run.ts
 * Dry-run:     npx tsx eval/pr-review-reliability/run.ts --dry-run
 *              or set PR_REVIEW_DRY_RUN=1
 *
 * The harness posts N hive tasks (default 20; override PR_REVIEW_RUNS),
 * polls each to terminal, evaluates the 9 standard hive assertions, checks
 * whether the planted bug was caught, and writes report.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PR_REVIEW_FIXTURES } from "./fixtures";

// ─── env helpers (verbatim from scripts/hive-e2e.ts) ─────────────────────────

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

function convexUrl(): string | null {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── constants ────────────────────────────────────────────────────────────────

const POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000;
const TERMINAL = new Set(["complete", "disputed", "failed"]);
const ASSERTION_COUNT = 9;

// ─── types ────────────────────────────────────────────────────────────────────

interface RunResult {
  run_index: number;
  task_id: string | null;
  latency_ms: number;
  terminal_status: string;
  assertions_passed: number;
  all_assertions_passed: boolean;
  assertion_detail: boolean[];
  agent_id: string | null;
  live: boolean;
  seeded_bug_caught: boolean;
  result_text: string;
  error: string | null;
}

interface Report {
  dry_run: boolean;
  runs: number;
  pass_rate: number;
  assertions_pass_rate: number;
  live_count: number;
  fallback_count: number;
  live_fraction: number;
  seeded_bug_catch_rate: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  run_results: RunResult[];
}

// ─── pure assertion evaluator (shared by live and dry-run paths) ──────────────

interface AssertionInputs {
  task: {
    status: string;
    result?: unknown;
  } | null;
  lifecycleEvents: string[];
  dagExists: boolean;
  nodeCount: number;
  scratchpadLength: number;
}

function evaluateAssertions(inputs: AssertionInputs): boolean[] {
  const { task, lifecycleEvents, dagExists, nodeCount, scratchpadLength } = inputs;
  const events = lifecycleEvents;

  return [
    // (1) root reached terminal status
    Boolean(task && TERMINAL.has(task.status)),
    // (2) root status !== "failed"
    task?.status !== "failed",
    // (3) dag exists with >= 1 node
    Boolean(dagExists && nodeCount >= 1),
    // (4) lifecycle includes hive_plan_decided
    events.includes("hive_plan_decided"),
    // (5) >= 1 hive_node_routed
    events.filter((e) => e === "hive_node_routed").length >= 1,
    // (6) >= 1 hive_node_settled
    events.filter((e) => e === "hive_node_settled").length >= 1,
    // (7) lifecycle includes hive_evaluated
    events.includes("hive_evaluated"),
    // (8) scratchpad has >= 1 entry
    scratchpadLength >= 1,
    // (9) root result.text non-empty
    typeof task?.result === "object" &&
      task.result !== null &&
      "text" in (task.result as object) &&
      typeof (task.result as Record<string, unknown>)["text"] === "string" &&
      ((task.result as Record<string, unknown>)["text"] as string).trim().length > 0,
  ];
}

// ─── pure report computation ──────────────────────────────────────────────────

function computeReport(results: RunResult[], dryRun: boolean): Report {
  const n = results.length;
  const passCount = results.filter((r) => r.all_assertions_passed).length;
  const totalAssertions = results.reduce((sum, r) => sum + r.assertions_passed, 0);
  const liveCount = results.filter((r) => r.live).length;
  const fallbackCount = results.filter((r) => !r.live).length;
  const bugCaughtCount = results.filter((r) => r.seeded_bug_caught).length;

  const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(n * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(n * 0.95)] ?? 0;

  return {
    dry_run: dryRun,
    runs: n,
    pass_rate: n > 0 ? passCount / n : 0,
    assertions_pass_rate: n > 0 ? totalAssertions / (n * ASSERTION_COUNT) : 0,
    live_count: liveCount,
    fallback_count: fallbackCount,
    live_fraction: n > 0 ? liveCount / n : 0,
    seeded_bug_catch_rate: n > 0 ? bugCaughtCount / n : 0,
    p50_latency_ms: p50,
    p95_latency_ms: p95,
    run_results: results,
  };
}

// ─── seeded-bug catch check ───────────────────────────────────────────────────

function checkBugCaught(resultText: string, mustMention: string[]): boolean {
  const lower = resultText.toLowerCase();
  return mustMention.every((token) => lower.includes(token.toLowerCase()));
}

// ─── live run ─────────────────────────────────────────────────────────────────

async function runLive(url: string, totalRuns: number, timeoutMs: number): Promise<RunResult[]> {
  const client = new ConvexHttpClient(url);
  const fixture = PR_REVIEW_FIXTURES[0];
  const results: RunResult[] = [];

  for (let i = 0; i < totalRuns; i++) {
    console.log(`\n[run ${i + 1}/${totalRuns}] posting task...`);
    const startMs = Date.now();
    let result: RunResult = {
      run_index: i,
      task_id: null,
      latency_ms: 0,
      terminal_status: "unknown",
      assertions_passed: 0,
      all_assertions_passed: false,
      assertion_detail: [],
      agent_id: null,
      live: false,
      seeded_bug_caught: false,
      result_text: "",
      error: null,
    };

    try {
      const posted = await client.mutation(api.tasks.post, {
        posted_by: "pr-review-eval",
        prompt: fixture.prompt,
        max_budget: 4,
        workflow_mode: "hive",
        task_type: "pr-review",
      });
      const task_id = posted.task_id as Id<"tasks">;
      result.task_id = task_id;
      console.log(`  posted ${task_id}`);

      const deadline = startMs + timeoutMs;
      let task = await client.query(api.tasks.get, { task_id });
      while (task && !TERMINAL.has(task.status) && Date.now() < deadline) {
        await sleep(POLL_MS);
        task = await client.query(api.tasks.get, { task_id });
        console.log(`  status=${task?.status ?? "missing"}`);
      }

      const latencyMs = Date.now() - startMs;
      result.latency_ms = latencyMs;
      result.terminal_status = task?.status ?? "timeout";

      // Fetch assertion data
      const lifecycle = await client.query(api.lifecycle.forTask, { task_id });
      const dag = await client.query(api.hiveData.dagForRootTask, { task_id });
      const nodeCount = dag
        ? await client.query(api.hiveData.nodeCountForDag, { dag_id: dag._id })
        : 0;
      const scratchpad = dag
        ? await client.query(api.scratchpad.forDag, { dag_id: dag._id })
        : [];

      const events = lifecycle.map((e: { event_type: string }) => e.event_type);

      const taskForAssertions = task
        ? { status: task.status, result: task.result }
        : null;

      const assertionDetail = evaluateAssertions({
        task: taskForAssertions,
        lifecycleEvents: events,
        dagExists: Boolean(dag),
        nodeCount,
        scratchpadLength: scratchpad.length,
      });

      const assertionsPassed = assertionDetail.filter(Boolean).length;
      result.assertion_detail = assertionDetail;
      result.assertions_passed = assertionsPassed;
      result.all_assertions_passed = assertionsPassed === ASSERTION_COUNT;

      // Extract agent_id and provenance from result
      const taskResult = task?.result as Record<string, unknown> | undefined;
      const provenance = taskResult?.provenance as Record<string, unknown> | undefined;
      const agentId = (taskResult?.agent_id ?? provenance?.agent_id ?? null) as string | null;
      result.agent_id = agentId;
      result.live =
        (provenance?.["live_tools_called"] === true) ||
        (agentId !== null && agentId !== "arbor-baseline");
      result.result_text = (typeof taskResult?.text === "string") ? taskResult.text : "";
      result.seeded_bug_caught = checkBugCaught(result.result_text, fixture.planted_bug.must_mention);

      const statusIcon = result.all_assertions_passed ? "PASS" : "FAIL";
      console.log(
        `  [${statusIcon}] ${assertionsPassed}/${ASSERTION_COUNT} assertions | ` +
        `agent=${agentId ?? "unknown"} live=${result.live} bug_caught=${result.seeded_bug_caught} ` +
        `latency=${latencyMs}ms`,
      );
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      result.latency_ms = Date.now() - startMs;
      console.log(`  [ERROR] ${result.error}`);
    }

    results.push(result);
  }

  return results;
}

// ─── dry-run: synthetic in-memory transcript ──────────────────────────────────

function runDry(): RunResult[] {
  const fixture = PR_REVIEW_FIXTURES[0];

  // Synthetic run 1: live specialist, 9/9, bug caught
  const liveAssertions = evaluateAssertions({
    task: {
      status: "complete",
      result: {
        text:
          "The `getOrFetch` method has a critical bug: the `await` keyword is " +
          "missing before the `fetch()` call. This means the stored value is a " +
          "Promise<T> rather than the resolved T, breaking all callers.",
        agent_id: "github-pr-review",
        provenance: { live_tools_called: true },
      },
    },
    lifecycleEvents: [
      "task_posted",
      "context_enriched",
      "hive_plan_decided",
      "hive_node_routed",
      "hive_node_settled",
      "hive_evaluated",
    ],
    dagExists: true,
    nodeCount: 3,
    scratchpadLength: 2,
  });
  const liveResultText =
    "The `getOrFetch` method has a critical bug: the `await` keyword is " +
    "missing before the `fetch()` call. This means the stored value is a " +
    "Promise<T> rather than the resolved T, breaking all callers.";
  const liveRun: RunResult = {
    run_index: 0,
    task_id: "synthetic-live-001",
    latency_ms: 14200,
    terminal_status: "complete",
    assertions_passed: liveAssertions.filter(Boolean).length,
    all_assertions_passed: liveAssertions.every(Boolean),
    assertion_detail: liveAssertions,
    agent_id: "github-pr-review",
    live: true,
    seeded_bug_caught: checkBugCaught(liveResultText, fixture.planted_bug.must_mention),
    result_text: liveResultText,
    error: null,
  };

  // Synthetic run 2: arbor-baseline fallback, 9/9, bug caught
  const fallbackAssertions = evaluateAssertions({
    task: {
      status: "complete",
      result: {
        text:
          "[Arbor baseline] Code review of lib/cache/ttlCache.ts: " +
          "Line 27 in getOrFetch is missing an await before fetch(). " +
          "Without await the Promise object is stored as the cache value and " +
          "returned directly to callers, causing subtle type errors at runtime.",
        agent_id: "arbor-baseline",
        provenance: { live_tools_called: false },
      },
    },
    lifecycleEvents: [
      "task_posted",
      "context_enriched",
      "hive_plan_decided",
      "hive_node_routed",
      "hive_node_settled",
      "hive_evaluated",
    ],
    dagExists: true,
    nodeCount: 2,
    scratchpadLength: 1,
  });
  const fallbackResultText =
    "[Arbor baseline] Code review of lib/cache/ttlCache.ts: " +
    "Line 27 in getOrFetch is missing an await before fetch(). " +
    "Without await the Promise object is stored as the cache value and " +
    "returned directly to callers, causing subtle type errors at runtime.";
  const fallbackRun: RunResult = {
    run_index: 1,
    task_id: "synthetic-fallback-002",
    latency_ms: 8900,
    terminal_status: "complete",
    assertions_passed: fallbackAssertions.filter(Boolean).length,
    all_assertions_passed: fallbackAssertions.every(Boolean),
    assertion_detail: fallbackAssertions,
    agent_id: "arbor-baseline",
    live: false,
    seeded_bug_caught: checkBugCaught(fallbackResultText, fixture.planted_bug.must_mention),
    result_text: fallbackResultText,
    error: null,
  };

  return [liveRun, fallbackRun];
}

// ─── percentile helper ────────────────────────────────────────────────────────

// (inlined into computeReport above; kept here only for documentation)

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun =
    process.argv.includes("--dry-run") ||
    Boolean(process.env["PR_REVIEW_DRY_RUN"]);

  const url = convexUrl();
  const effectiveDryRun = isDryRun || !url;

  if (effectiveDryRun) {
    console.log("=== DRY RUN — no Convex calls will be made ===\n");
  }

  const totalRuns = effectiveDryRun
    ? 2
    : Math.max(1, Number(process.env["PR_REVIEW_RUNS"] ?? 20));

  const timeoutMs = Number(process.env["PR_REVIEW_TIMEOUT_MS"] ?? DEFAULT_TIMEOUT_MS);

  let results: RunResult[];
  if (effectiveDryRun) {
    results = runDry();
  } else {
    results = await runLive(url!, totalRuns, timeoutMs);
  }

  const report = computeReport(results, effectiveDryRun);

  console.log("\n========= PR-Review Reliability Report =========");
  if (report.dry_run) console.log("MODE: DRY RUN (synthetic transcript)");
  console.log(`runs:                 ${report.runs}`);
  console.log(`pass_rate:            ${(report.pass_rate * 100).toFixed(1)}% (${results.filter((r) => r.all_assertions_passed).length}/${report.runs} runs 9/9)`);
  console.log(`assertions_pass_rate: ${(report.assertions_pass_rate * 100).toFixed(1)}%`);
  console.log(`live_count:           ${report.live_count}`);
  console.log(`fallback_count:       ${report.fallback_count}`);
  console.log(`live_fraction:        ${(report.live_fraction * 100).toFixed(1)}%`);
  console.log(`seeded_bug_catch_rate:${(report.seeded_bug_catch_rate * 100).toFixed(1)}%`);
  console.log(`p50_latency_ms:       ${report.p50_latency_ms}`);
  console.log(`p95_latency_ms:       ${report.p95_latency_ms}`);
  console.log("=================================================\n");

  const reportPath = resolve(__dirname, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);

  const anyFailed = results.some((r) => !r.all_assertions_passed);
  if (effectiveDryRun) {
    if (anyFailed) {
      console.error("\nDRY RUN: synthetic runs failed assertion checks — harness logic is broken.");
      process.exit(1);
    } else {
      console.log("DRY RUN: all synthetic runs passed 9/9 — harness logic validated offline.");
      process.exit(0);
    }
  } else {
    if (anyFailed) {
      console.error("\nOne or more live runs failed assertions. See report.json for details.");
      process.exit(1);
    } else {
      console.log("All runs passed 9/9 assertions.");
      process.exit(0);
    }
  }
}

main().catch((err) => {
  console.error("pr-review-eval failed:", err);
  process.exit(1);
});
