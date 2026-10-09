// Local swarm: run your subscription CLIs (Claude, Codex, Cursor, OpenCode,
// Ollama) side by side on one task and keep the best result.
//
// Usage:
//   npm run swarm -- doctor                                  # ping every worker
//   npm run swarm -- ask "question" [--workers a,b] [--count 3]
//   npm run swarm -- code "task" --check "npm test" [--workers a,b] [--count 3]
//   npm run swarm -- stats                                   # win rates + cooldowns
//   npm run swarm -- clean [runId]                           # remove worktrees
//   npm run swarm -- research --repo ~/autoresearch-mlx --agents antigravity@3,cursor:grok-4.7-high \
//     [--lead codex:gpt-6-astra] [--lead-every 5]           # autoresearch lab on a shared board;
//                                                            # @N weights an agent's share of turns
//
// Workers are `backend[:model]`, e.g. claude, codex, cursor:grok-4.7-medium,
// opencode:google/gemini-3-flash-preview, ollama:qwen2.5-coder:7b.

import { resolve } from "node:path";
import {
  removeWorktrees,
  runAsk,
  runCode,
  runDoctor,
  swarmPaths,
  workerStatsRows,
  type RunSummary,
} from "../lib/swarm/orchestrate";
import { splitTurnWeight } from "../lib/swarm/board-core";
import { runResearch } from "../lib/swarm/research";
import { DEFAULT_POOL, parseWorker, parseWorkerList } from "../lib/swarm/worker-core";

const ROOT = resolve(__dirname, "..");
const MINUTE = 60 * 1000;

interface Flags {
  positional: string[];
  values: Map<string, string>;
}

function parseFlags(argv: string[]): Flags {
  const positional: string[] = [];
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    values.set(arg.slice(2), argv[index + 1] ?? "");
    index += 1;
  }
  return { positional, values };
}

function numberFlag(flags: Flags, name: string, fallback: number): number {
  const raw = flags.values.get(name);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function poolFrom(flags: Flags) {
  const explicit = flags.values.get("workers");
  return {
    pool: explicit ? parseWorkerList(explicit) : DEFAULT_POOL.map(parseWorker),
    explicit: Boolean(explicit),
  };
}

function printTable(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");
  console.log(line(columns));
  for (const row of rows) console.log(line(columns.map((column) => String(row[column] ?? ""))));
}

function printSummary(summary: RunSummary): void {
  console.log("");
  printTable(
    summary.candidates.map((candidate) => ({
      worker: candidate.worker,
      family: candidate.family,
      result: candidate.ok ? "ok" : `failed (${candidate.failure})`,
      check: candidate.passed === null ? "-" : candidate.passed ? "pass" : "fail",
      lines: summary.mode === "code" ? candidate.changedLines : "-",
      secs: candidate.secs,
      won: candidate.worker === summary.winner ? "winner" : "",
    })),
  );
  console.log("");
  if (!summary.winner) {
    console.log(`No winner: ${summary.reason}. Outputs are in ${summary.runDir}`);
    return;
  }
  const judged = summary.judge ? ` (judge: ${summary.judge})` : "";
  console.log(`Winner: ${summary.winner}${judged}. ${summary.reason}`);
  const file = `${summary.runDir}/${summary.winner.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  if (summary.mode === "code") console.log(`Apply it with:\n  git apply ${file}.patch`);
  else console.log(`Answer: ${file}.txt`);
}

async function doctor(flags: Flags): Promise<void> {
  const { pool } = poolFrom(flags);
  console.log(`Pinging ${pool.length} workers in parallel...`);
  const rows = await runDoctor(ROOT, pool, numberFlag(flags, "timeout-min", 3) * MINUTE);
  printTable(rows.map((row) => ({ ...row, ok: row.ok ? "ready" : "FAILED" })));
}

async function ask(flags: Flags): Promise<void> {
  const task = flags.positional[1];
  if (!task) throw new Error('usage: swarm ask "question"');
  const summary = await runAsk({
    root: ROOT,
    task,
    ...poolFrom(flags),
    count: numberFlag(flags, "count", 3),
    timeoutMs: numberFlag(flags, "timeout-min", 5) * MINUTE,
    log: console.log,
  });
  printSummary(summary);
}

async function code(flags: Flags): Promise<void> {
  const task = flags.positional[1];
  if (!task) throw new Error('usage: swarm code "task" --check "npm test"');
  const summary = await runCode({
    root: ROOT,
    task,
    ...poolFrom(flags),
    check: flags.values.get("check"),
    count: numberFlag(flags, "count", 3),
    timeoutMs: numberFlag(flags, "timeout-min", 20) * MINUTE,
    checkTimeoutMs: numberFlag(flags, "check-timeout-min", 10) * MINUTE,
    log: console.log,
  });
  printSummary(summary);
}

function stats(flags: Flags): void {
  printTable(workerStatsRows(ROOT, poolFrom(flags).pool));
}

function clean(flags: Flags): void {
  const removed = removeWorktrees(swarmPaths(ROOT), flags.positional[1]);
  console.log(`Removed ${removed} worktree(s).`);
}

async function research(flags: Flags): Promise<void> {
  const repo = flags.values.get("repo");
  const agents = flags.values.get("agents");
  if (!repo || !agents) throw new Error("usage: swarm research --repo <autoresearch checkout> --agents a@3,b,c [--lead d]");
  const max = flags.values.get("max");
  const lead = flags.values.get("lead");
  await runResearch({
    repo: resolve(repo.replace(/^~(?=$|\/)/, process.env.HOME ?? "~")),
    agents: agents
      .split(",")
      .filter((part) => part.trim())
      .map(splitTurnWeight)
      .map(({ worker, weight }) => ({ spec: parseWorker(worker), weight })),
    lead: lead ? parseWorker(lead) : undefined,
    leadEvery: numberFlag(flags, "lead-every", 5),
    branch: flags.values.get("branch") || "autoresearch/board",
    queueDepth: numberFlag(flags, "queue", 2),
    proposeTimeoutMs: numberFlag(flags, "propose-timeout-min", 15) * MINUTE,
    trainTimeoutMs: numberFlag(flags, "train-timeout-min", 15) * MINUTE,
    maxExperiments: max === undefined ? undefined : numberFlag(flags, "max", 1),
    log: (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`),
  });
}

const COMMANDS: Record<string, (flags: Flags) => void | Promise<void>> = { doctor, ask, code, stats, clean, research };

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const command = COMMANDS[flags.positional[0] ?? ""];
  if (!command) {
    console.log(`usage: npm run swarm -- <${Object.keys(COMMANDS).join("|")}> ...`);
    process.exitCode = 1;
    return;
  }
  await command(flags);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
