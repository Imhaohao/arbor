// Small-team-vs-frontier benchmark CLI.
//
//   npx tsx scripts/bench.ts seal   --staging DIR --bank DIR --key FILE [--dev 12]
//   npx tsx scripts/bench.ts run    --split dev|test --bank DIR --key FILE --out DIR [--limit N] [--tasks 4]
//   npx tsx scripts/bench.ts report --out DIR [--split test]
//   npx tsx scripts/bench.ts audit  --out DIR           # leakage / cheating scan
//
// The arm roster below is part of the pre-registration: changing it after
// the test split has run invalidates the comparison.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
  type BenchConfig,
  type CallRecord,
  type GradeResult,
  type SoloResult,
} from "../lib/swarm/bench";
import { swarmPaths } from "../lib/swarm/orchestrate";
import { parseWorker } from "../lib/swarm/worker-core";

const ROOT = resolve(__dirname, "..");
const GRADER = join(ROOT, "lib/swarm/bench-grader.py");

export const SMALL_TEAM = [
  "claude:claude-haiku-5-5",
  "claude:claude-sonnet-5-5",
  "cursor:grok-4.7-medium",
  "antigravity:gemini-3.8-flash-high",
];
export const FRONTIER = ["claude:claude-opus-5-5", "codex:gpt-6-astra"];
const TESTERS = ["claude:claude-sonnet-5-5", "cursor:grok-4.7-medium"];
const REPAIRER = "claude:claude-sonnet-5-5";
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

function seal(flags: Flags): void {
  const bank = required(flags, "bank");
  const report = execFileSync("python3", [GRADER, "seal", required(flags, "staging"), bank, required(flags, "key")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  console.log(report.trim());
  const order = shuffled(bankTaskIds(bank), SPLIT_SEED);
  const devTasks = Number(flags.values.get("dev") ?? DEFAULT_DEV_TASKS);
  const split = { seed: SPLIT_SEED, dev: order.slice(0, devTasks).sort(), test: order.slice(devTasks).sort() };
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

async function runTask(config: BenchConfig, taskId: string, split: string, roster: RosterEntry[] | undefined): Promise<void> {
  const [task] = loadTasks(config.bank, [taskId]);
  log(`task ${taskId} (${task.title}): solving`);
  const soloSpecs = [...SMALL_TEAM, ...FRONTIER].map(parseWorker);
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

async function gradedSolo(config: BenchConfig, taskId: string, solo: SoloResult, seed: string): Promise<ArmRecord> {
  return { code_sha: sha(solo.code), examplesPassed: solo.examplesPassed, grade: await gradeCode(config, taskId, solo.code, seed), calls: solo.calls };
}

async function run(flags: Flags): Promise<void> {
  const bank = required(flags, "bank");
  const outDir = required(flags, "out");
  const splitName = flags.values.get("split") ?? "dev";
  const split = JSON.parse(readFileSync(join(bank, "split.json"), "utf8")) as Record<string, string[]>;
  const done = new Set(readResults(join(outDir, `results-${splitName}.jsonl`)).map((row) => row.task as string));
  const limit = Number(flags.values.get("limit") ?? Infinity);
  const queue = split[splitName].filter((id) => !done.has(id)).slice(0, limit);
  const config: BenchConfig = { root: ROOT, bank, key: required(flags, "key"), outDir, callTimeoutMs: CALL_TIMEOUT_MS, log };
  ensureBenchCodexHome(ROOT);
  const roster = splitName === "test" ? rosterFromDev(outDir) : undefined;
  log(`${splitName}: ${queue.length} tasks to run (${done.size} already done); router ${roster ? "on" : "off (no dev results)"}`);
  const workers = Number(flags.values.get("tasks") ?? 4);
  await Promise.all(Array.from({ length: workers }, async () => {
    for (let taskId = queue.shift(); taskId; taskId = queue.shift()) {
      await runTask(config, taskId, splitName, roster).catch((error: unknown) => log(`task ${taskId} FAILED: ${error instanceof Error ? error.message : error}`));
    }
  }));
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

const COMMANDS: Record<string, (flags: Flags) => void | Promise<void>> = { seal, run, report, audit };

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
