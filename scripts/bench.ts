// Small-team-vs-frontier benchmark CLI.
//
//   npx tsx scripts/bench.ts seal   --staging DIR --bank DIR --key FILE [--dev 12]
//   npx tsx scripts/bench.ts run    --split dev|test --bank DIR --key FILE --out DIR [--limit N] [--tasks 4] [--skip ARM]   (--skip: dev only, frontier arms only)
//   npx tsx scripts/bench.ts screen --bank DIR --key FILE --out DIR --screener LABEL [--tasks 4]   (difficulty screen, before sealing)
//   npx tsx scripts/bench.ts probe  --task STAGED_TASK_DIR --screener LABEL   (one task, throwaway bank; for authoring loops)
//   npx tsx scripts/bench.ts report --out DIR [--split test]
//   npx tsx scripts/bench.ts audit  --out DIR           # leakage / cheating scan
//
// The arm roster below is part of the pre-registration: changing it after
// the test split has run invalidates the comparison.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mulberry32, pairedComparison, wilsonInterval, type RosterEntry } from "../lib/swarm/bench-core";
import {
  appendResult,
  bankTaskIds,
  ensureBenchCodexHome,
  gradeCode,
  hiveAttempt,
  loadTasks,
  newSeed,
  prepareTeamTools,
  readResults,
  routerAttempt,
  soloAttempt,
  type GradingConfig,
  type CallRecord,
  type GradeResult,
  type SoloResult,
} from "../lib/swarm/bench";
import { swarmPaths } from "../lib/swarm/orchestrate";
import { REPAIRER, SMALL_TEAM, TESTERS } from "../lib/swarm/team-roster";
import { parseWorker } from "../lib/swarm/worker-core";

const ROOT = resolve(__dirname, "..");
const GRADER = join(ROOT, "lib/swarm/bench-grader.py");

export { SMALL_TEAM };
export const FRONTIER = ["claude:claude-opus-5-5", "codex:gpt-6-astra"];
const CONDUCTOR = "antigravity:gemini-3.8-flash-high";
const DEFAULT_DEV_TASKS = 12;
const SPLIT_SEED = 20261009;
const CALL_TIMEOUT_MS = 8 * 60 * 1000;

interface Flags {
  command: string;
  values: Map<string, string>;
}

function parseFlags(argv: string[]): Flags {
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) values.set(argv[index].replace(/^--/, ""), argv[index + 1] ?? "");
  return { command: argv[0] ?? "", values };
}

function required(flags: Flags, name: string): string {
  const value = flags.values.get(name);
  if (!value) throw new Error(`missing --${name}`);
  return resolve(value.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
}

const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

// ── seal ────────────────────────────────────────────────────────────────────

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Split {
  seed: number;
  dev: string[];
  test: string[];
}

function freshSplit(bank: string, devTasks: number): Split {
  const order = shuffled(bankTaskIds(bank), SPLIT_SEED);
  return { seed: SPLIT_SEED, dev: order.slice(0, devTasks).sort(), test: order.slice(devTasks).sort() };
}

/** Tasks sealed into an existing bank join the test split; nothing already assigned moves. */
function extendedSplit(bank: string): Split {
  const split = JSON.parse(readFileSync(join(bank, "split.json"), "utf8")) as Split;
  const assigned = new Set([...split.dev, ...split.test]);
  return { ...split, test: [...split.test, ...bankTaskIds(bank).filter((id) => !assigned.has(id))].sort() };
}

function seal(flags: Flags): void {
  const bank = required(flags, "bank");
  const report = execFileSync("python3", [GRADER, "seal", required(flags, "staging"), bank, required(flags, "key")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  console.log(report.trim());
  const split = existsSync(join(bank, "split.json")) ? extendedSplit(bank) : freshSplit(bank, Number(flags.values.get("dev") ?? DEFAULT_DEV_TASKS));
  writeFileSync(join(bank, "split.json"), `${JSON.stringify(split, null, 2)}\n`);
  console.log(`split: ${split.dev.length} dev, ${split.test.length} test`);
}

// ── run ─────────────────────────────────────────────────────────────────────

function sha(text: string | undefined): string | undefined {
  return text === undefined ? undefined : createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function saveCode(outDir: string, taskId: string, arm: string, code: string | undefined): void {
  if (!code) return;
  const dir = join(outDir, "codes", taskId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${arm.replace(/[^a-zA-Z0-9._-]+/g, "_")}.py`), code);
}

interface ArmRecord {
  code_sha?: string;
  examplesPassed?: boolean;
  grade: GradeResult;
  calls: CallRecord[];
  [extra: string]: unknown;
}

function rosterFromDev(outDir: string): RosterEntry[] | undefined {
  const dev = readResults(join(outDir, "results-dev.jsonl"));
  if (dev.length === 0) return undefined;
  return SMALL_TEAM.map((label) => {
    const solved = dev.filter((row) => (row.arms as Record<string, ArmRecord>)[label]?.grade.passed);
    const topics = [...new Set(solved.flatMap((row) => row.topic as string[]))].slice(0, 6);
    return { label, profile: `solved ${solved.length}/${dev.length} calibration tasks${topics.length ? `; solved topics: ${topics.join(", ")}` : ""}` };
  });
}

async function runTask(config: GradingConfig, taskId: string, split: string, roster: RosterEntry[] | undefined, skipped: ReadonlySet<string>): Promise<void> {
  const [task] = loadTasks(config.bank, [taskId]);
  log(`task ${taskId} (${task.title}): solving`);
  const soloSpecs = [...SMALL_TEAM, ...FRONTIER].filter((label) => !skipped.has(label)).map(parseWorker);
  const [solos, tools] = await Promise.all([
    Promise.all(soloSpecs.map((spec) => soloAttempt(config, spec, task))),
    prepareTeamTools(config, task, TESTERS.map(parseWorker)),
  ]);
  const small = solos.filter((solo) => SMALL_TEAM.includes(solo.label));
  log(`task ${taskId}: team selecting (${tools.team.expectations.filter((value) => value !== undefined).length} trusted inputs from ${tools.testers.length} testers)`);
  const hive = await hiveAttempt(config, task, small, tools, parseWorker(REPAIRER));
  const router = roster ? await routerAttempt(config, task, small, parseWorker(CONDUCTOR), roster) : undefined;
  const seed = newSeed();
  const arms: Record<string, ArmRecord> = {};
  for (const solo of solos) arms[solo.label] = await gradedSolo(config, taskId, solo, seed);
  arms.hive = { code_sha: sha(hive.code), grade: await gradeCode(config, taskId, hive.code, seed), calls: hive.calls, chosen: hive.chosen, repaired: hive.repaired, testers: hive.testers, trustedInputs: hive.trustedInputs, ranking: hive.ranking };
  if (router) arms.router = { code_sha: sha(router.code), grade: arms[router.choice ?? ""]?.grade ?? (await gradeCode(config, taskId, router.code, seed)), calls: router.calls, choice: router.choice };
  for (const [arm, code] of [...solos.map((solo) => [solo.label, solo.code] as const), ["hive", hive.code] as const]) saveCode(config.outDir, taskId, arm, code);
  appendResult(join(config.outDir, `results-${split}.jsonl`), { task: taskId, split, title: task.title, topic: task.topic, author: task.author, seed, at: new Date().toISOString(), arms });
  const passed = Object.entries(arms).filter(([, arm]) => arm.grade.passed).map(([name]) => name);
  log(`task ${taskId}: passed by ${passed.join(", ") || "nobody"}`);
}

async function gradedSolo(config: GradingConfig, taskId: string, solo: SoloResult, seed: string): Promise<ArmRecord> {
  return { code_sha: sha(solo.code), examplesPassed: solo.examplesPassed, grade: await gradeCode(config, taskId, solo.code, seed), calls: solo.calls };
}

/**
 * Dev only: a frontier arm whose CLI is out of quota can be skipped, because
 * neither the team nor the router depends on frontier dev results. The test
 * split always runs every pre-registered arm.
 */
function skippedFrontierArms(flags: Flags, split: string): Set<string> {
  const skipped = new Set((flags.values.get("skip") ?? "").split(",").filter(Boolean));
  if (skipped.size > 0 && split !== "dev") throw new Error("--skip is only allowed on the dev split");
  const unknown = [...skipped].filter((label) => !FRONTIER.includes(label));
  if (unknown.length > 0) throw new Error(`--skip accepts only frontier arms, not ${unknown.join(", ")}`);
  return skipped;
}

async function run(flags: Flags): Promise<void> {
  const bank = required(flags, "bank");
  const outDir = required(flags, "out");
  const splitName = flags.values.get("split") ?? "dev";
  const split = JSON.parse(readFileSync(join(bank, "split.json"), "utf8")) as Record<string, string[]>;
  const done = new Set(readResults(join(outDir, `results-${splitName}.jsonl`)).map((row) => row.task as string));
  const limit = Number(flags.values.get("limit") ?? Infinity);
  const queue = split[splitName].filter((id) => !done.has(id)).slice(0, limit);
  const config = gradingConfig(flags, bank, outDir);
  ensureBenchCodexHome(ROOT);
  const roster = splitName === "test" ? rosterFromDev(outDir) : undefined;
  const skipped = skippedFrontierArms(flags, splitName);
  log(`${splitName}: ${queue.length} tasks to run (${done.size} already done); router ${roster ? "on" : "off (no dev results)"}`);
  await drain(queue, Number(flags.values.get("tasks") ?? 4), (taskId) => runTask(config, taskId, splitName, roster, skipped));
}

function gradingConfig(flags: Flags, bank: string, outDir: string, key = required(flags, "key")): GradingConfig {
  return { root: ROOT, bank, key, denyReads: [bank, dirname(key)], outDir, callTimeoutMs: CALL_TIMEOUT_MS, log };
}

async function drain(queue: string[], workers: number, job: (taskId: string) => Promise<void>): Promise<void> {
  await Promise.all(Array.from({ length: workers }, async () => {
    for (let taskId = queue.shift(); taskId; taskId = queue.shift()) {
      await job(taskId).catch((error: unknown) => log(`task ${taskId} FAILED: ${error instanceof Error ? error.message : error}`));
    }
  }));
}

// ── screen ──────────────────────────────────────────────────────────────────

function requireScreener(flags: Flags): string {
  const screener = flags.values.get("screener") ?? "";
  const arms = [...SMALL_TEAM, ...FRONTIER, ...TESTERS, REPAIRER, CONDUCTOR];
  if (!screener || arms.includes(screener)) throw new Error(`--screener must name a model in no arm (got "${screener}")`);
  return screener;
}

async function screenOne(config: GradingConfig, bank: string, taskId: string, screener: string) {
  const [task] = loadTasks(bank, [taskId]);
  const solo = await soloAttempt(config, parseWorker(screener), task);
  const grade = await gradeCode(config, taskId, solo.code, newSeed());
  return { passed: grade.passed, verdict: grade.first_failure?.verdict ?? "ok", examplesPassed: solo.examplesPassed, code: solo.code, calls: solo.calls };
}

/**
 * A task counts as screened once its latest row is a real verdict. A
 * no_code row means the screener's call failed (timeout, provider error),
 * which says nothing about difficulty, so the task is screened again.
 */
function screenedTasks(rows: ReadonlyArray<Record<string, unknown>>): Set<string> {
  const latest = new Map(rows.map((row) => [row.task as string, row.verdict as string]));
  return new Set([...latest].filter(([, verdict]) => verdict !== "no_code").map(([task]) => task));
}

/**
 * Author-side difficulty probe: seal one staged task into a throwaway bank
 * and run the screener on it. Prints {valid, passed, verdict, code} so an
 * authoring loop can ask for a harder revision. A probe never admits a task
 * to a bank; the pool still goes through `screen`.
 */
async function probe(flags: Flags): Promise<void> {
  const screener = requireScreener(flags);
  const work = mkdtempSync(join(tmpdir(), "bench-probe-"));
  try {
    mkdirSync(join(work, "staging", "p"), { recursive: true });
    symlinkSync(required(flags, "task"), join(work, "staging", "p", "t01"));
    const key = join(work, "bench-key");
    writeFileSync(key, randomBytes(32).toString("hex"));
    const bank = join(work, "bank");
    const sealed = JSON.parse(execFileSync("python3", [GRADER, "seal", join(work, "staging"), bank, key], { encoding: "utf8" }).trim().split("\n").at(-1) ?? "{}");
    if (sealed.sealed !== 1) return console.log(JSON.stringify({ valid: false, problems: sealed.rejected?.[0]?.problems ?? [] }));
    const result = await screenOne(gradingConfig(flags, bank, work, key), bank, "p-t01", screener);
    console.log(JSON.stringify({ valid: true, screener, passed: result.passed, verdict: result.verdict, examplesPassed: result.examplesPassed, code: result.code }));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Difficulty screen for a candidate pool, run before a bank is sealed: one
 * solo attempt by a model that is in no arm, graded on hidden tests. Tasks
 * the screener solves are too easy to separate the arms. No arm ever runs
 * here, so the filter cannot favour one arm over another.
 */
async function screen(flags: Flags): Promise<void> {
  const bank = required(flags, "bank");
  const outFile = join(required(flags, "out"), "screen.jsonl");
  const screener = requireScreener(flags);
  const done = screenedTasks(readResults(outFile));
  const queue = bankTaskIds(bank).filter((id) => !done.has(id));
  const config = gradingConfig(flags, bank, dirname(outFile));
  log(`screen: ${queue.length} tasks with ${screener} (${done.size} already done)`);
  await drain(queue, Number(flags.values.get("tasks") ?? 4), async (taskId) => {
    const { code: _code, ...result } = await screenOne(config, bank, taskId, screener);
    appendResult(outFile, { task: taskId, screener, ...result });
    log(`screen ${taskId}: ${result.passed ? "solved (drop)" : `failed (${result.verdict}) (keep)`}`);
  });
}

// ── report ──────────────────────────────────────────────────────────────────

/**
 * Every call an arm's answer depended on: the team pays for all of its
 * members' attempts plus its own test tools and repairs; the router pays for
 * its conductor plus the member it picked.
 */
function armCalls(arms: Record<string, ArmRecord>, arm: string): CallRecord[] {
  const own = arms[arm]?.calls ?? [];
  if (arm === "hive") return [...SMALL_TEAM.flatMap((member) => arms[member]?.calls ?? []), ...own];
  if (arm === "router") return [...own, ...(arms[String(arms.router?.choice)]?.calls ?? [])];
  return own;
}

function armCost(calls: readonly CallRecord[]): { usd: number; usdCovered: number; calls: number } {
  const priced = calls.filter((call) => typeof call.costUsd === "number");
  return { usd: priced.reduce((total, call) => total + (call.costUsd ?? 0), 0), usdCovered: priced.length, calls: calls.length };
}

const PRIMARY = ["claude:claude-opus-5-5", "codex:gpt-6-astra", "router"];

/** Holm step-down adjustment for the pre-registered primary comparisons. */
export function holmAdjusted(pValues: readonly number[]): number[] {
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(pValues.length);
  let running = 0;
  order.forEach(({ p, index }, rank) => {
    running = Math.max(running, Math.min(1, p * (pValues.length - rank)));
    adjusted[index] = running;
  });
  return adjusted;
}

function bestDevMember(outDir: string): string | undefined {
  const dev = readResults(join(outDir, "results-dev.jsonl"));
  if (dev.length === 0) return undefined;
  const rate = (label: string) => dev.filter((row) => (row.arms as Record<string, ArmRecord>)[label]?.grade.passed).length;
  return [...SMALL_TEAM].sort((a, b) => rate(b) - rate(a))[0];
}

function byAuthorTopic(rows: ReadonlyArray<Record<string, unknown>>, arms: readonly string[]) {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = String(row.task).split("-")[0];
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Object.fromEntries([...groups].map(([key, group]) => [key, Object.fromEntries(arms.map((arm) => [arm, `${group.filter((row) => (row.arms as Record<string, ArmRecord>)[arm]?.grade.passed).length}/${group.length}`]))]));
}

function report(flags: Flags): void {
  const outDir = required(flags, "out");
  const splitName = flags.values.get("split") ?? "test";
  const rows = readResults(join(outDir, `results-${splitName}.jsonl`));
  const valid = rows.filter((row) => Object.values(row.arms as Record<string, ArmRecord>).every((arm) => (arm.grade.oracle_conflicts ?? 0) === 0));
  const solved = (arm: string) => valid.map((row) => Boolean((row.arms as Record<string, ArmRecord>)[arm]?.grade.passed));
  const anySmall = valid.map((row) => SMALL_TEAM.some((label) => (row.arms as Record<string, ArmRecord>)[label]?.grade.passed));
  const armNames = [...FRONTIER, ...SMALL_TEAM, "router", "hive"];
  const table = armNames.map((arm) => {
    const wins = solved(arm).filter(Boolean).length;
    const [low, high] = wilsonInterval(wins, valid.length);
    const cost = valid.map((row) => armCost(armCalls(row.arms as Record<string, ArmRecord>, arm)));
    return { arm, solved: wins, of: valid.length, rate: +(wins / Math.max(1, valid.length)).toFixed(3), ci95: [+low.toFixed(3), +high.toFixed(3)], claudeUsd: +cost.reduce((t, c) => t + c.usd, 0).toFixed(2), calls: cost.reduce((t, c) => t + c.calls, 0) };
  });
  const comparisons = Object.fromEntries(
    [...FRONTIER, "router", ...SMALL_TEAM].map((other) => [`hive vs ${other}`, pairedComparison(solved("hive"), solved(other))]),
  );
  const holm = holmAdjusted(PRIMARY.map((other) => comparisons[`hive vs ${other}`].pOneSided));
  const primary = PRIMARY.map((other, index) => ({ comparison: `hive vs ${other}`, ...comparisons[`hive vs ${other}`], pHolm: holm[index], verdict: comparisons[`hive vs ${other}`].pOneSided < 0.05 && comparisons[`hive vs ${other}`].diff > 0 ? "hive beats it" : "not shown" }));
  const bestSmall = bestDevMember(outDir);
  const summary = {
    split: splitName,
    tasks: rows.length,
    excludedForOracleConflicts: rows.length - valid.length,
    oracleAnySmall: anySmall.filter(Boolean).length,
    table,
    primary,
    bestDevSmall: bestSmall ? { member: bestSmall, ...pairedComparison(solved("hive"), solved(bestSmall)) } : undefined,
    byAuthor: byAuthorTopic(valid, armNames),
    comparisons,
  };
  writeFileSync(join(outDir, `report-${splitName}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

// ── audit ───────────────────────────────────────────────────────────────────

// Anything beyond reading stdin and writing stdout is suspicious in a
// submission; matches are listed for a human to read, not auto-failed.
const SUSPICIOUS_CODE = /\b(subprocess|socket|urllib|requests|glob|pathlib|shutil|ctypes|importlib|__import__)\b|\bopen\((?!\s*0\s*[,)])|\bos\.(?!read\(0|write\(1|fstat\(0)/;
const SUSPICIOUS_LOG = /sealed\.bin|bench-key|bench\.key|manifest\.json|bank-staging|openssl|ref\.py|brute\.py|gen\.py/;

function filesUnder(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

function suspiciousLines(path: string, pattern: RegExp): string[] {
  return readFileSync(path, "utf8").split("\n").filter((line) => pattern.test(line)).map((line) => line.trim().slice(0, 160));
}

function audit(flags: Flags): void {
  const outDir = required(flags, "out");
  const codes = filesUnder(join(outDir, "codes"), /\.py$/).map((path) => ({ path: path.slice(outDir.length + 1), lines: suspiciousLines(path, SUSPICIOUS_CODE) })).filter((hit) => hit.lines.length);
  const claudeDirs = readdirSync(join(homedir(), ".claude/projects")).filter((name) => name.includes("bench-call-"));
  const claudeLogs = claudeDirs.flatMap((name) => filesUnder(join(homedir(), ".claude/projects", name), /\.jsonl$/));
  const toolUses = claudeLogs.flatMap((path) => readFileSync(path, "utf8").split("\n").filter((line) => line.includes('"type":"tool_use"')).map((line) => ({ path, line })));
  const leakyClaude = toolUses.filter((use) => SUSPICIOUS_LOG.test(use.line)).map((use) => use.line.slice(0, 300));
  const codexLogs = filesUnder(join(swarmPaths(ROOT).codexHome, "sessions"), /\.jsonl$/);
  const leakyCodex = codexLogs.flatMap((path) => suspiciousLines(path, SUSPICIOUS_LOG).map((line) => `${path.split("/").pop()}: ${line}`));
  const summary = {
    submissionsWithSuspiciousCode: codes,
    claudeTranscripts: claudeLogs.length,
    claudeToolUses: toolUses.length,
    claudeToolUsesTouchingOracles: leakyClaude,
    codexSessionLogs: codexLogs.length,
    codexLinesTouchingOracles: leakyCodex.slice(0, 50),
  };
  writeFileSync(join(outDir, "audit.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, submissionsWithSuspiciousCode: codes.length }, null, 2));
}

const COMMANDS: Record<string, (flags: Flags) => void | Promise<void>> = { seal, screen, probe, run, report, audit };

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const command = COMMANDS[flags.command];
  if (!command) throw new Error(`usage: bench <${Object.keys(COMMANDS).join("|")}>`);
  if (!existsSync(GRADER)) throw new Error(`grader missing at ${GRADER}`);
  await command(flags);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
