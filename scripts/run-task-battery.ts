// Usage:
//   npm run battery -- --dry-run                     # plan + cost estimate, no LLM calls
//   npm run battery -- --agents 5 --tasks 4          # small pilot
//   npm run battery -- --agents 8 --max-spend 5.00   # real sweep with a hard cap
//   npm run battery -- --report                      # read back what exists
//
// Builds the query x agent crossing that every Agent System Trilemma metric
// needs (lib/hive/pareto-core.ts). Each (golden task, agent) pair produces one
// battery_runs row carrying the bid, the graded outcome, and the real token /
// cost / latency telemetry, so one harness feeds all four metrics.
//
// WHY THIS AND NOT THE GOLDEN AUDIT LANE. The audit lane posts a golden task
// through the normal auction so exactly one WINNER is graded — deliberately,
// to keep calibration honest. That structurally cannot cross agents on a query,
// so it can never produce a quality differential. The battery fans one task out
// to many agents and grades all of them.
//
// SPEND. This makes real, paid model calls: agents x tasks executions plus one
// grader call each. --max-spend is a hard abort checked after every run, and
// --dry-run prints the plan and an estimate without calling anything.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync as readEnvFile } from "node:fs";
import { resolve } from "node:path";
import {
  GOLDEN_AUDIT_SYSTEM_PROMPT,
  checkRequiredSubstrings,
  combineAuditVerdict,
  goldenAuditUserPrompt,
  type GoldenGraderVerdict,
} from "../lib/golden-audit";
import { collectUsage } from "../lib/llm-usage";
import { callOpenAIJSON } from "../lib/openai";
import { getRunner } from "../lib/specialists/registry";
import { clampConfidence } from "../lib/bid-calibration";

interface GoldenTask {
  _id: string;
  golden_id: string;
  title: string;
  prompt: string;
  task_type: string;
  max_budget: number;
  reference_answer: string;
  success_criteria: string;
  required_substrings: string[];
}

interface BatteryRun {
  battery_id: string;
  golden_task_id: string;
  golden_id: string;
  agent_id: string;
  status: "complete" | "declined" | "error";
  arm: string;
  bid_price?: number;
  confidence?: number;
  estimated_seconds?: number;
  output_text?: string;
  error_message?: string;
  latency_ms?: number;
  accuracy_score?: number;
  audit_passed?: boolean;
  substring_misses?: string[];
  grader_used?: boolean;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  models_used?: string[];
}

/** Load .env.local without adding a dotenv dependency. The specialists read
 * provider keys straight off process.env, and tsx does not populate it. */
function loadEnv(): void {
  try {
    const raw = readEnvFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, name, rawValue] = match;
      // CONVEX_* is the CLI's own business — it parses .env.local itself, and
      // injecting a half-parsed value here breaks `npx convex run`.
      if (name.startsWith("CONVEX_")) continue;
      if (process.env[name]) continue;
      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        // Trailing ` # comment` is common in this file and is not part of the value.
        value = value.replace(/\s+#.*$/, "");
      }
      process.env[name] = value.trim();
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

function runConvex(fn: string, args: unknown): unknown {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = out.search(/[[{]/);
  if (start < 0) return undefined;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return undefined;
  }
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Truncate stored deliveries — the metrics need the grade, not the prose, and
 * full outputs would bloat every row for no analytic gain. */
const MAX_OUTPUT_CHARS = 4000;

function deliveryText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const text = (result as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) return text;
    return JSON.stringify(result, null, 2);
  }
  return String(result);
}

async function gradeDelivery(
  task: GoldenTask,
  delivery: string,
): Promise<{
  accuracy: number;
  passed: boolean;
  misses: string[];
  graderUsed: boolean;
} | null> {
  const misses = checkRequiredSubstrings(delivery, task.required_substrings);
  let grader: GoldenGraderVerdict | null = null;
  try {
    grader = await callOpenAIJSON<GoldenGraderVerdict>({
      systemPrompt: GOLDEN_AUDIT_SYSTEM_PROMPT,
      userPrompt: goldenAuditUserPrompt({
        taskPrompt: task.prompt,
        referenceAnswer: task.reference_answer,
        successCriteria: task.success_criteria,
        deliveryText: delivery,
      }),
    });
  } catch {
    // Grader outage is not the agent's fault: combineAuditVerdict falls back to
    // the deterministic substring checks, or returns null so the run is stored
    // as an error rather than being scored on a guess.
    grader = null;
  }
  const outcome = combineAuditVerdict({
    substring_misses: misses,
    had_required_substrings: task.required_substrings.length > 0,
    grader,
  });
  if (!outcome) return null;
  return {
    accuracy: outcome.quality,
    passed: outcome.passed,
    misses: outcome.substring_misses,
    graderUsed: outcome.grader_used,
  };
}

async function runOne(
  batteryId: string,
  task: GoldenTask,
  agentId: string,
  arm: string,
): Promise<BatteryRun> {
  const base: BatteryRun = {
    battery_id: batteryId,
    golden_task_id: task._id,
    golden_id: task.golden_id,
    agent_id: agentId,
    status: "error",
    arm,
  };

  let runner;
  try {
    runner = getRunner(agentId);
  } catch (err) {
    return { ...base, error_message: `no runner: ${String(err).slice(0, 200)}` };
  }

  const started = Date.now();
  try {
    // Bid leg. The stated confidence is the label beta tuning needs and that
    // reputation_dimensions never receives in the organic flow.
    const decision = await runner.bid(task.prompt, task.task_type);
    if (!decision || "decline_reason" in decision) {
      // Declining is a rational outcome under the incentive design, so it is
      // recorded rather than dropped — discarding it would bias the corpus
      // toward agents that answer everything.
      return { ...base, status: "declined", latency_ms: Date.now() - started };
    }

    const confidence = clampConfidence(
      (decision as { confidence?: number }).confidence,
    );
    const bidPrice = (decision as { bid_price?: number }).bid_price;
    const estimatedSeconds = (decision as { estimated_seconds?: number })
      .estimated_seconds;

    // Execution leg, wrapped so every model call inside the specialist is
    // priced. This is the token/cost telemetry that has no persistence path
    // anywhere else in Arbor.
    const execStarted = Date.now();
    const { result, records, totals } = await collectUsage(() =>
      runner.execute(task.prompt, task.task_type, { agent_id: agentId }),
    );
    const latency = Date.now() - execStarted;

    const delivery = deliveryText(result?.output).slice(0, MAX_OUTPUT_CHARS);
    const graded = await gradeDelivery(task, delivery);

    const telemetry = {
      latency_ms: latency,
      cost_usd: Number((totals.cost_usd ?? 0).toFixed(6)),
      input_tokens: totals.input_tokens,
      output_tokens: totals.output_tokens,
      total_tokens: (totals.input_tokens ?? 0) + (totals.output_tokens ?? 0),
      models_used: [...new Set(records.map((r) => r.model))],
      bid_price: bidPrice,
      confidence,
      estimated_seconds: estimatedSeconds,
      output_text: delivery,
    };

    if (!graded) {
      return {
        ...base,
        ...telemetry,
        status: "error",
        error_message:
          "grader unreachable and task has no deterministic substring criteria",
      };
    }

    return {
      ...base,
      ...telemetry,
      status: "complete",
      accuracy_score: graded.accuracy,
      audit_passed: graded.passed,
      substring_misses: graded.misses,
      grader_used: graded.graderUsed,
    };
  } catch (err) {
    return {
      ...base,
      latency_ms: Date.now() - started,
      error_message: String(err instanceof Error ? err.message : err).slice(0, 400),
    };
  }
}

function printSummary(summary: Record<string, unknown>): void {
  console.log("\n=========== battery corpus ===========");
  console.log(`runs                  ${summary.total_runs}`);
  console.log(
    `  complete            ${summary.complete}` +
      `   declined ${summary.declined}   errored ${summary.errored}`,
  );
  console.log(`distinct tasks        ${summary.distinct_tasks}`);
  console.log(`distinct agents       ${summary.distinct_agents}`);
  console.log(`tasks w/ 2+ agents    ${summary.tasks_with_2plus_agents}`);
  console.log(`comparable pairs      ${summary.comparable_pairs}`);
  console.log(`cost-curve steps      ${summary.curve_steps}`);
  console.log(`labelled bids         ${summary.labelled_bids}`);
  console.log(`runs w/ token counts  ${summary.token_runs}`);
  console.log(`total spend           $${summary.total_cost_usd}`);
  const gain = summary.gain_summary as
    | { mean_gain: number; positive_gain_share: number; hopeless_share: number; cost_per_gain: number }
    | undefined;
  if (gain) {
    console.log("\n--- marginal gain (cost-ordered, so the sign is real) ---");
    console.log(`  mean gain           ${gain.mean_gain.toFixed(4)}`);
    console.log(`  positive-gain share ${gain.positive_gain_share.toFixed(4)}`);
    console.log(`  hopeless share      ${gain.hopeless_share.toFixed(4)}`);
    console.log(
      `  $ per unit gained   ${Number.isFinite(gain.cost_per_gain) ? "$" + gain.cost_per_gain.toFixed(4) : "infinite (no net gain)"}`,
    );
  }
  console.log("======================================\n");
}

async function main(): Promise<void> {
  loadEnv();
  if (flag("report")) {
    printSummary(
      runConvex("battery:_batterySummary", {}) as Record<string, unknown>,
    );
    return;
  }

  const dryRun = flag("dry-run");
  const maxSpend = Number.parseFloat(option("max-spend", "2.00") as string);
  const agentLimit = Number.parseInt(option("agents", "5") as string, 10);
  const taskLimit = Number.parseInt(option("tasks", "0") as string, 10);
  const arm = option("arm", "single-agent") as string;

  const tasks = (runConvex("battery:_enabledGoldenTasks", {}) ??
    []) as GoldenTask[];
  if (tasks.length === 0) {
    console.error(
      "No enabled golden tasks. Seed them first:\n  npx convex run goldenTasks:seedDefaults '{}'",
    );
    process.exit(1);
  }
  const selectedTasks = taskLimit > 0 ? tasks.slice(0, taskLimit) : tasks;

  // Roster: explicit list, or the agents that can actually execute locally.
  // A battery run only means something if the agent really answers, so this
  // deliberately uses the static roster rather than the 1,100 discovered
  // specialists, most of which need keys or are endpoint-down.
  const explicit = option("agent-ids");
  const { getSpecialists } = await import("../lib/specialists/registry");
  const roster = explicit
    ? explicit.split(",").map((s) => s.trim()).filter(Boolean)
    : getSpecialists()
        .map((s) => s.agent_id)
        .slice(0, agentLimit);

  const planned = selectedTasks.length * roster.length;
  console.log(`battery plan: ${selectedTasks.length} tasks x ${roster.length} agents = ${planned} runs`);
  console.log(`  arm            ${arm}`);
  console.log(`  agents         ${roster.join(", ")}`);
  console.log(`  spend cap      $${maxSpend.toFixed(2)}`);
  console.log(
    `  pairs produced ${selectedTasks.length * ((roster.length * (roster.length - 1)) / 2)}` +
      "  (all agents graded per task, so pairs grow quadratically in roster size)",
  );

  if (dryRun) {
    console.log(
      "\nDRY RUN — no model calls made. Each run costs one agent execution plus\n" +
        "one grader call. Re-run without --dry-run to execute.",
    );
    return;
  }

  const batteryId = `battery-${randomUUID().slice(0, 8)}`;
  console.log(`\nbattery_id: ${batteryId}\n`);

  let spent = 0;
  let done = 0;
  for (const task of selectedTasks) {
    const runs: BatteryRun[] = [];
    for (const agentId of roster) {
      const run = await runOne(batteryId, task, agentId, arm);
      runs.push(run);
      spent += run.cost_usd ?? 0;
      done += 1;
      const mark =
        run.status === "complete"
          ? `acc=${(run.accuracy_score ?? 0).toFixed(2)} $${(run.cost_usd ?? 0).toFixed(4)} ${run.latency_ms}ms`
          : run.status === "declined"
            ? "declined"
            : `error: ${(run.error_message ?? "").slice(0, 60)}`;
      console.log(`  [${done}/${planned}] ${task.golden_id} / ${agentId}: ${mark}`);

      if (spent >= maxSpend) {
        console.log(`\nSPEND CAP REACHED ($${spent.toFixed(4)}) — stopping.`);
        break;
      }
    }
    // Checkpoint per task so an interrupted sweep keeps what it paid for.
    if (runs.length > 0) {
      runConvex("battery:_record", { runs });
    }
    if (spent >= maxSpend) break;
  }

  console.log(`\ncompleted ${done} runs, measured spend $${spent.toFixed(4)}`);
  printSummary(
    runConvex("battery:_batterySummary", { battery_id: batteryId }) as Record<
      string,
      unknown
    >,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
