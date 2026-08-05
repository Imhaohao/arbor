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
import { callLocalJSON, localLlmAvailable, localLlmEnabled } from "../lib/local-llm";
import {
  GOLDEN_AUDIT_SYSTEM_PROMPT,
  checkRequiredSubstrings,
  combineAuditVerdict,
  goldenAuditUserPrompt,
  type GoldenGraderVerdict,
} from "../lib/golden-audit";
import { assessDelivery } from "../lib/hive/delivery-validity-core";
import { collectUsage } from "../lib/llm-usage";
import { callOpenAIJSON } from "../lib/openai";
import { getRunner } from "../lib/specialists/registry";
import {
  DEFAULT_EPSILON,
  assessFittability,
  buildCharter,
  composeHive,
  type HiveMemberCandidate,
  type HiveOutcomeRow,
} from "../lib/hive/hivemind-core";
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
  /** Hive arm only: the full team, in execution order. */
  members?: string[];
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
/** Which grader produced the most recent label. Recorded per run so a weak
 * local grader is never silently mixed with frontier labels. */
let GRADER_MODEL = "none";

// Aligned to goldenAuditUserPrompt's 6000-char delivery window. At 4000 this
// truncated deliveries BEFORE grading (line ~260), so verbose-but-valid
// answers lost their final section and were failed for "missing" content the
// model actually wrote — found in E5b, where it differentially punished
// terra's table-heavy style and produced E3's mean-accuracy inversion.
const MAX_OUTPUT_CHARS = 6000;

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
  const userPrompt = goldenAuditUserPrompt({
    taskPrompt: task.prompt,
    referenceAnswer: task.reference_answer,
    successCriteria: task.success_criteria,
    deliveryText: delivery,
  });
  try {
    grader = await callOpenAIJSON<GoldenGraderVerdict>({
      systemPrompt: GOLDEN_AUDIT_SYSTEM_PROMPT,
      userPrompt,
    });
    GRADER_MODEL = "openai";
  } catch (paidError) {
    // Every paid provider was out of credit on 2026-07-30, which would collapse
    // grading to substring checks and produce no quality differential at all.
    // A local model still yields a graded label — but a WEAKER one, so the
    // grader identity is recorded rather than silently mixed in.
    if (localLlmEnabled() && (await localLlmAvailable())) {
      try {
        const local = await callLocalJSON<GoldenGraderVerdict>({
          systemPrompt: GOLDEN_AUDIT_SYSTEM_PROMPT,
          userPrompt,
        });
        grader = local.value;
        GRADER_MODEL = `ollama:${local.model}`;
      } catch {
        grader = null;
        GRADER_MODEL = "none";
      }
    } else {
      void paidError;
      grader = null;
      GRADER_MODEL = "none";
    }
  }
  // When both graders are unavailable, `grader` stays null and
  // combineAuditVerdict falls back to the deterministic substring checks, or
  // returns null so the run is stored as an error rather than scored on a guess.
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
    // A dead endpoint still returns a STRING (a fallback banner, a credential
    // wall, or help text). Grading that as a completed delivery is what made
    // delivery rate read 100% for a roster of endpoints probed as HTTP 410.
    const validity = assessDelivery(delivery);
    if (!validity.isWork) {
      return {
        ...base,
        latency_ms: Date.now() - execStarted,
        cost_usd: Number((totals.cost_usd ?? 0).toFixed(6)),
        output_text: delivery,
        status: "error",
        error_message: `no work delivered (${validity.verdict}): ${validity.reason}`,
      };
    }
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

// ─── hive arm ────────────────────────────────────────────────────────────────
//
// Runs the SAME golden task twice: once as the best solo agent, once as a
// composed team sharing one blackboard. That pairing is the entire point — the
// 16 historical team rows were unusable precisely because almost none had a
// solo baseline on the same objective, so "did teaming help HERE?" was
// unanswerable. Each hive pass emits a HiveOutcomeRow; assessFittability then
// says whether the corpus is finally trainable, instead of anyone eyeballing it.

/** Token-overlap affinity between the task and an agent's declared skills. */
function affinityFor(taskPrompt: string, capabilities: string[]): number {
  const words = new Set(
    taskPrompt.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );
  if (words.size === 0 || capabilities.length === 0) return 0;
  const capWords = capabilities.join(" ").toLowerCase().split(/[^a-z0-9]+/);
  const hits = capWords.filter((w) => words.has(w)).length;
  return Math.min(1, hits / 5);
}

/** Failure-domain key: agents behind one host fail together. */
function providerOf(agentId: string): string {
  try {
    const cfg = getRunner(agentId).config;
    const url = cfg.a2a_endpoint ?? cfg.homepage_url;
    if (url && url.includes("://")) return new URL(url).host;
  } catch {
    // fall through
  }
  return agentId;
}

function hiveCandidates(
  roster: string[],
  task: GoldenTask,
): HiveMemberCandidate[] {
  const out: HiveMemberCandidate[] = [];
  for (const agentId of roster) {
    try {
      const cfg = getRunner(agentId).config;
      out.push({
        agent_id: agentId,
        capabilities: cfg.capabilities.map((c) => c.toLowerCase()),
        // Honest ignorance: no per-agent quality evidence exists yet, so every
        // agent gets the same prior and composition is driven by affinity,
        // cost, and failure-domain diversity. Replace with a measured rate once
        // this corpus produces one.
        reliability: 0.5,
        cost: cfg.cost_baseline,
        provider: providerOf(agentId),
        affinity: affinityFor(task.prompt, cfg.capabilities),
      });
    } catch {
      // No runner -> not a candidate.
    }
  }
  return out;
}

const BOARD_ENTRY_CHARS = 1200;

/** The shared-context prompt one member sees: charter + board so far. */
function memberPrompt(args: {
  objective: string;
  member: string;
  index: number;
  members: string[];
  board: Array<{ agent: string; text: string }>;
  primeDirective: string;
}): string {
  const boardText =
    args.board.length === 0
      ? "(empty — you are the first contributor)"
      : args.board
          .map((e) => `[${e.agent}] ${e.text.slice(0, BOARD_ENTRY_CHARS)}`)
          .join("\n\n");
  const isLast = args.index === args.members.length - 1;
  return [
    "=== HIVE CHARTER ===",
    `Objective (the ONLY graded outcome): ${args.objective}`,
    `You are ${args.member}, member ${args.index + 1} of ${args.members.length}: ${args.members.join(", ")}.`,
    args.primeDirective,
    "",
    "=== SHARED BLACKBOARD (read before answering) ===",
    boardText,
    "",
    "=== YOUR TURN ===",
    isLast
      ? "You are the FINAL member. Synthesize the board into the single best, complete answer to the objective. Your reply IS the team's delivery."
      : "Contribute your strongest partial answer or correction. Be concrete and brief; the final member will synthesize.",
  ].join("\n");
}

/**
 * Execute one hive: members run in sequence over a shared blackboard, the last
 * member's reply is the team delivery, graded exactly like a solo run.
 *
 * Sequential is deliberate: parallel members cannot read each other, which
 * would make the blackboard decoration instead of collaboration.
 */
async function runHive(
  batteryId: string,
  task: GoldenTask,
  members: string[],
): Promise<BatteryRun> {
  const base: BatteryRun = {
    battery_id: batteryId,
    golden_task_id: task._id,
    golden_id: task.golden_id,
    agent_id: `hive:${members.join("+")}`,
    status: "error",
    arm: "hive",
    members,
  };
  const charter = buildCharter({
    objective: task.prompt,
    members,
    dagId: batteryId,
    nodeId: task.golden_id,
  });
  const board: Array<{ agent: string; text: string }> = [];
  const started = Date.now();
  let cost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const modelsUsed = new Set<string>();
  let lastDelivery = "";

  for (const [index, member] of members.entries()) {
    try {
      const runner = getRunner(member);
      const prompt = memberPrompt({
        objective: task.prompt,
        member,
        index,
        members,
        board,
        primeDirective: charter.prime_directive,
      });
      const { result, records, totals } = await collectUsage(() =>
        runner.execute(prompt, task.task_type, { agent_id: member }),
      );
      cost += totals.cost_usd ?? 0;
      inputTokens += totals.input_tokens ?? 0;
      outputTokens += totals.output_tokens ?? 0;
      for (const r of records) modelsUsed.add(r.model);
      const text = deliveryText(result?.output).slice(0, MAX_OUTPUT_CHARS);
      const memberValidity = assessDelivery(text);
      // The board records the attempt either way — a later member seeing "this
      // teammate is down" is real information — but only genuine work becomes
      // the team's delivery. Otherwise a hive of dead endpoints would "deliver"
      // its last fallback banner and score as a success.
      board.push({
        agent: member,
        text: memberValidity.isWork
          ? text
          : `(no work: ${memberValidity.verdict})`,
      });
      if (memberValidity.isWork) lastDelivery = text;
    } catch (err) {
      // A failed member is recorded ON THE BOARD so later members know, exactly
      // as a real hive would see a silent teammate.
      board.push({
        agent: member,
        text: `(failed: ${String(err instanceof Error ? err.message : err).slice(0, 160)})`,
      });
    }
  }

  const latency = Date.now() - started;
  if (!lastDelivery) {
    return {
      ...base,
      latency_ms: latency,
      error_message: "every hive member failed; no delivery to grade",
    };
  }
  const graded = await gradeDelivery(task, lastDelivery);
  const telemetry = {
    latency_ms: latency,
    cost_usd: Number(cost.toFixed(6)),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    models_used: [...modelsUsed],
    output_text: lastDelivery,
  };
  if (!graded) {
    return {
      ...base,
      ...telemetry,
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
  // --golden-ids g1,g2 restricts the sweep to named tasks (exact golden_id
  // match, "golden-" prefix optional); unknown ids fail loudly rather than
  // silently shrinking the sweep. Composes with --tasks (filter, then slice).
  const goldenIdsRaw = option("golden-ids") as string | undefined;
  let pool = tasks;
  if (goldenIdsRaw) {
    const wanted = goldenIdsRaw.split(",").map((s) => {
      const id = s.trim();
      return id.startsWith("golden-") ? id : `golden-${id}`;
    });
    const known = new Set(tasks.map((t) => t.golden_id));
    const missing = wanted.filter((w) => !known.has(w));
    if (missing.length > 0) {
      console.error(`--golden-ids not found: ${missing.join(", ")}`);
      process.exit(1);
    }
    pool = tasks.filter((t) => wanted.includes(t.golden_id));
  }
  const selectedTasks = taskLimit > 0 ? pool.slice(0, taskLimit) : pool;

  // Roster: explicit list, or the agents that can actually execute locally.
  // A battery run only means something if the agent really answers, so this
  // deliberately uses the static roster rather than the 1,100 discovered
  // specialists, most of which need keys or are endpoint-down.
  const explicit = option("agent-ids");
  const {
    getSpecialists,
    registerDiscoveredSpecialist,
    specialistConfigFromPersisted,
  } = await import("../lib/specialists/registry");

  // Hydrate the discovered-specialist cache. `getRunner` resolves unknown ids
  // from this per-process Map, which is empty in a standalone script — without
  // this every external A2A agent fails with "No specialist runner registered".
  // These agents matter because they execute on THEIR infrastructure, so they
  // are the only roster that can produce graded runs while every paid LLM
  // provider is out of credit.
  let hydrated = 0;
  try {
    const rows = runConvex("discoveredSpecialists:list", {}) as unknown[];
    for (const row of rows ?? []) {
      try {
        const cfg = specialistConfigFromPersisted(
          row as Parameters<typeof specialistConfigFromPersisted>[0],
        );
        registerDiscoveredSpecialist({ ...cfg, discovered: true });
        hydrated += 1;
      } catch {
        // A malformed row must not abort the whole battery.
      }
    }
  } catch (error) {
    console.warn(
      `[battery] could not hydrate discovered specialists: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (hydrated > 0) console.log(`hydrated ${hydrated} discovered specialists`);
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
  const hiveOutcomes: HiveOutcomeRow[] = [];
  // Exploration state, carried ACROSS tasks: the usage counts are what stop one
  // agent appearing in every team, which is the condition assessFittability
  // rejects. Per-task state would not see the imbalance at all.
  const explore = flag("explore");
  const epsilon = Number(option("epsilon", String(DEFAULT_EPSILON)));
  const baseSeed = Number(option("seed", "1"));
  const agentUsage: Record<string, number> = {};
  let teamsComposed = 0;
  if (explore) {
    console.log(
      `exploration ON (epsilon ${epsilon}, seed ${baseSeed}) — teams are SAMPLED ` +
        "for dataset coverage, not chosen by policy.",
    );
  }
  for (const task of selectedTasks) {
    const runs: BatteryRun[] = [];

    if (arm === "hive") {
      // Paired design: the same objective runs once as the best solo agent and
      // once as a composed team on a shared blackboard. Without the pair, "did
      // teaming help HERE?" is unanswerable — which is exactly what made the 16
      // historical team rows unusable.
      const composition = composeHive({
        candidates: hiveCandidates(roster, task),
        required: [],
        maxSize: 3,
        // Seed varies per task, so two tasks in one sweep do not draw the
        // identical team while a single task stays reproducible.
        explore: explore
          ? {
              epsilon,
              seed: baseSeed + teamsComposed * 7919,
              usage: agentUsage,
              teamsSoFar: teamsComposed,
            }
          : undefined,
      });
      if (!composition) {
        console.log(`  [skip] ${task.golden_id}: no runnable candidates`);
        continue;
      }
      const soloId = composition.members[0].agent_id;
      const team =
        composition.members.length >= 2
          ? composition.members.map((m) => m.agent_id)
          : null;
      teamsComposed += 1;
      for (const m of composition.members) {
        agentUsage[m.agent_id] = (agentUsage[m.agent_id] ?? 0) + 1;
      }

      const solo = await runOne(batteryId, task, soloId, "solo-baseline");
      runs.push(solo);
      spent += solo.cost_usd ?? 0;
      done += 1;
      console.log(
        `  [${done}] ${task.golden_id} / solo ${soloId}: ` +
          (solo.status === "complete"
            ? `acc=${(solo.accuracy_score ?? 0).toFixed(2)}`
            : solo.status),
      );

      if (team) {
        const hive = await runHive(batteryId, task, team);
        runs.push(hive);
        spent += hive.cost_usd ?? 0;
        done += 1;
        console.log(
          `  [${done}] ${task.golden_id} / hive [${team.join("+")}]: ` +
            (hive.status === "complete"
              ? `acc=${(hive.accuracy_score ?? 0).toFixed(2)} (solo ${(solo.accuracy_score ?? 0).toFixed(2)})`
              : `${hive.status}: ${(hive.error_message ?? "").slice(0, 50)}`),
        );
        if (hive.status === "complete") {
          hiveOutcomes.push({
            objective: task.prompt,
            goal_family: task.task_type,
            members: team,
            team_size: team.length,
            coverage: composition.scored.coverage,
            reliability: composition.scored.reliability,
            diversity: composition.scored.diversity,
            cost: composition.scored.cost,
            outcome_quality: hive.accuracy_score ?? 0,
            solo_baseline_quality:
              solo.status === "complete" ? solo.accuracy_score : undefined,
            explored: composition.explored,
          });
        }
      } else {
        console.log(
          `  [${done}] ${task.golden_id}: composer chose SOLO (${composition.rationale.slice(0, 70)})`,
        );
      }
    } else {
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
    }
    // Checkpoint per task so an interrupted sweep keeps what it paid for.
    if (runs.length > 0) {
      runConvex("battery:_record", { runs });
    }
    if (spent >= maxSpend) break;
  }

  if (arm === "hive" && hiveOutcomes.length > 0) {
    console.log("\n=========== hive vs solo (paired) ===========");
    let hiveWins = 0;
    for (const row of hiveOutcomes) {
      const solo = row.solo_baseline_quality;
      const delta = solo === undefined ? null : row.outcome_quality - solo;
      if (delta !== null && delta > 0) hiveWins += 1;
      console.log(
        `  ${row.goal_family.padEnd(14)} team=${row.team_size} ` +
          `hive=${row.outcome_quality.toFixed(2)} solo=${solo?.toFixed(2) ?? "  — "} ` +
          `delta=${delta === null ? "n/a" : (delta >= 0 ? "+" : "") + delta.toFixed(2)}`,
      );
    }
    console.log(
      `  hive beat solo on ${hiveWins}/${hiveOutcomes.length} paired tasks`,
    );
    if (explore) {
      const shares = Object.entries(agentUsage)
        .map(([a, n]) => `${a} ${(n / Math.max(1, teamsComposed) * 100).toFixed(0)}%`)
        .sort();
      console.log(`  agent usage across ${teamsComposed} teams: ${shares.join(", ")}`);
    }
    const verdict = assessFittability(hiveOutcomes);
    console.log(
      `\n  fittable for a learned team scorer: ${verdict.fittable ? "YES" : "NOT YET"}`,
    );
    for (const reason of verdict.reasons) console.log(`    - ${reason}`);
    console.log("=============================================");
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
