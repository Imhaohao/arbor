// Local swarm I/O: spawns the subscription CLIs, isolates code attempts in
// git worktrees, runs the check, asks a judge, and records every outcome in
// the ledger the router learns from. All decisions are delegated to the pure
// *-core modules.

import { spawn, execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  chooseWorkers,
  summarize,
  cooldownRemainingMs,
  type LedgerEntry,
  type LedgerMode,
} from "./router-core";
import {
  buildJudgePrompt,
  fallbackWinner,
  judgeLabels,
  parseVerdict,
  pickJudge,
  preselect,
  type Candidate,
} from "./select-core";
import {
  buildInvocation,
  familyOf,
  needsScratchCwdForAsk,
  withoutNpmBinDirs,
  parseWorkerOutput,
  supportsMode,
  type Invocation,
  type Mode,
  type ProcessResult,
  type WorkerOutput,
  type WorkerSpec,
} from "./worker-core";

export type Log = (line: string) => void;

export interface SwarmPaths {
  root: string;
  ledger: string;
  runs: string;
  worktrees: string;
  codexHome: string;
}

export function swarmPaths(root: string): SwarmPaths {
  const shared = join(homedir(), ".arbor-swarm");
  return {
    root,
    ledger: join(root, ".swarm", "ledger.jsonl"),
    runs: join(root, ".swarm", "runs"),
    // Outside the repo so tsc/next never see the copies.
    worktrees: join(tmpdir(), "arbor-swarm", basename(root)),
    codexHome: join(shared, "codex-home"),
  };
}

// ── processes ───────────────────────────────────────────────────────────────

export interface TimedResult extends ProcessResult {
  secs: number;
}

export function runProcess(invocation: Invocation, cwd: string, timeoutMs: number): Promise<TimedResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(invocation.bin, invocation.args, {
      cwd,
      env: { ...process.env, PATH: withoutNpmBinDirs(process.env.PATH ?? ""), ...invocation.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const finish = (code: number | null, extraErr = "") => {
      clearTimeout(timer);
      const secs = Math.round((Date.now() - started) / 1000);
      resolve({ code, stdout, stderr: stderr + extraErr, timedOut, secs });
    };
    child.on("error", (error) => finish(null, `\n${error.message}`));
    child.on("close", (code) => finish(code));
  });
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

// ── codex lean home ─────────────────────────────────────────────────────────
// The user's ~/.codex loads plugins, skills and memories on every call
// (~174k tokens for a one-line reply). A minimal CODEX_HOME that shares the
// login cuts that to ~10k. The auth file is a symlink so token refreshes land
// in the real home; if codex replaces the link with a file, copy it back.

const CODEX_LEAN_CONFIG = 'model_reasoning_effort = "medium"\n';

function realCodexAuth(): string {
  return join(homedir(), ".codex", "auth.json");
}

export function ensureCodexHome(paths: SwarmPaths): void {
  mkdirSync(paths.codexHome, { recursive: true });
  const auth = join(paths.codexHome, "auth.json");
  if (!existsSync(auth) && existsSync(realCodexAuth())) symlinkSync(realCodexAuth(), auth);
  const config = join(paths.codexHome, "config.toml");
  if (!existsSync(config)) writeFileSync(config, CODEX_LEAN_CONFIG);
}

export function syncCodexAuth(paths: SwarmPaths): void {
  const auth = join(paths.codexHome, "auth.json");
  if (!existsSync(auth) || lstatSync(auth).isSymbolicLink()) return;
  const real = realCodexAuth();
  if (!existsSync(real) || statSync(auth).mtimeMs > statSync(real).mtimeMs) copyFileSync(auth, real);
  unlinkSync(auth);
  symlinkSync(real, auth);
}

// ── ledger ──────────────────────────────────────────────────────────────────

export function readLedger(paths: SwarmPaths): LedgerEntry[] {
  if (!existsSync(paths.ledger)) return [];
  return readFileSync(paths.ledger, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry);
}

function appendLedger(paths: SwarmPaths, entries: readonly LedgerEntry[]): void {
  mkdirSync(join(paths.root, ".swarm"), { recursive: true });
  appendFileSync(paths.ledger, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

// ── workers ─────────────────────────────────────────────────────────────────

interface Attempt {
  spec: WorkerSpec;
  output: WorkerOutput;
  secs: number;
}

async function attempt(
  spec: WorkerSpec,
  mode: Mode,
  prompt: string,
  cwd: string,
  timeoutMs: number,
  paths: SwarmPaths,
): Promise<Attempt> {
  const invocation = buildInvocation(spec, mode, prompt, { codexHome: paths.codexHome });
  const result = await runProcess(invocation, cwd, timeoutMs);
  if (spec.backend === "codex") syncCodexAuth(paths);
  return { spec, output: parseWorkerOutput(spec.backend, result), secs: result.secs };
}

function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "arbor-swarm-scratch-"));
}

export function safeName(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function newRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ── worktrees ───────────────────────────────────────────────────────────────

// Commit the working tree as it is right now (tracked edits plus untracked,
// non-ignored files) through a throwaway index, so workers start from what
// the user actually has and the user's own staging area is never touched.
// `git stash create` was not enough: it refuses files staged then re-edited.
function snapshotBase(root: string): string {
  const indexFile = join(mkdtempSync(join(tmpdir(), "arbor-swarm-index-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  const run = (args: string[]) =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  try {
    run(["read-tree", "HEAD"]);
    run(["add", "-A"]);
    const tree = run(["write-tree"]);
    return run(["commit-tree", tree, "-p", "HEAD", "-m", "swarm snapshot of working tree"]);
  } finally {
    rmSync(indexFile, { force: true });
  }
}

function createWorktree(root: string, path: string, base: string): void {
  git(root, ["worktree", "add", "--detach", path, base]);
  const modules = join(root, "node_modules");
  if (existsSync(modules)) symlinkSync(modules, join(path, "node_modules"));
}

interface CollectedPatch {
  patch: string;
  changedLines: number;
}

function collectPatch(worktree: string, base: string): CollectedPatch {
  git(worktree, ["add", "-A"]);
  const patch = git(worktree, ["diff", "--cached", "--binary", base]);
  const changedLines = git(worktree, ["diff", "--cached", "--numstat", base])
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => {
      const [added, removed] = line.split("\t");
      return sum + (Number(added) || 0) + (Number(removed) || 0);
    }, 0);
  return { patch: patch ? `${patch}\n` : "", changedLines };
}

export function removeWorktrees(paths: SwarmPaths, runId?: string): number {
  const target = runId ? join(paths.worktrees, runId) : paths.worktrees;
  const listed = git(paths.root, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((path) => path.startsWith(target));
  for (const path of listed) git(paths.root, ["worktree", "remove", "--force", path]);
  rmSync(target, { recursive: true, force: true });
  git(paths.root, ["worktree", "prune"]);
  return listed.length;
}

// ── selection ───────────────────────────────────────────────────────────────

export interface RunOptions {
  root: string;
  task: string;
  pool: readonly WorkerSpec[];
  explicit: boolean;
  count: number;
  timeoutMs: number;
  log: Log;
}

export interface RunSummary {
  runId: string;
  mode: Mode;
  task: string;
  candidates: Array<Omit<Candidate, "patch" | "text"> & { secs: number; failure?: string }>;
  winner?: string;
  reason: string;
  judge?: string;
  runDir: string;
}

function chooseForRun(options: RunOptions, mode: Mode, ledger: readonly LedgerEntry[]): WorkerSpec[] {
  if (options.explicit) {
    const runnable = options.pool.filter((spec) => supportsMode(spec, mode));
    for (const spec of options.pool.filter((spec) => !runnable.includes(spec))) {
      options.log(`  skip ${spec.label}: cannot run ${mode} tasks`);
    }
    return runnable;
  }
  const choice = chooseWorkers(options.pool, ledger, { count: options.count, mode, now: Date.now() });
  for (const skipped of choice.skipped) options.log(`  skip ${skipped.worker}: ${skipped.reason}`);
  return choice.chosen;
}

interface Outcome {
  winner?: string;
  reason: string;
  judge?: string;
  judgeText?: string;
  entry?: LedgerEntry;
}

async function judgeFinalists(
  options: RunOptions,
  mode: Mode,
  finalists: Candidate[],
  ledger: readonly LedgerEntry[],
  runId: string,
): Promise<Outcome> {
  const isCode = mode === "code";
  const now = Date.now();
  const available = options.pool.filter((spec) => cooldownRemainingMs(ledger, spec.label, now) === 0);
  const judge = pickJudge(finalists, available);
  const fallback = fallbackWinner(finalists, isCode);
  if (!judge) return { winner: fallback.worker, reason: "no judge available; picked the smallest passing change" };
  options.log(`  judging ${finalists.length} finalists with ${judge.label}`);
  const paths = swarmPaths(options.root);
  const prompt = buildJudgePrompt(options.task, finalists, isCode);
  const result = await attempt(judge, "ask", prompt, scratchDir(), options.timeoutMs, paths);
  const labels = judgeLabels(finalists.length);
  const verdict = result.output.ok ? parseVerdict(result.output.text, labels) : undefined;
  const entry = ledgerEntry(runId, "judge", judge, result, { passed: null, won: false });
  const judged = { judge: judge.label, judgeText: result.output.text, entry };
  if (!verdict) {
    return { ...judged, winner: fallback.worker, reason: "judge gave no usable verdict; picked the smallest passing change" };
  }
  const winner = finalists[labels.indexOf(verdict.label)];
  return { ...judged, winner: winner.worker, reason: verdict.reason || "chosen by judge" };
}

function ledgerEntry(
  runId: string,
  mode: LedgerMode,
  spec: WorkerSpec,
  result: Attempt,
  outcome: { passed: boolean | null; won: boolean },
): LedgerEntry {
  return {
    at: Date.now(),
    runId,
    mode,
    worker: spec.label,
    family: familyOf(spec),
    ok: result.output.ok,
    failure: result.output.failure,
    passed: outcome.passed,
    won: outcome.won,
    secs: result.secs,
  };
}

interface Scored {
  attempt: Attempt;
  candidate: Candidate;
}

async function settle(
  options: RunOptions,
  mode: Mode,
  runId: string,
  scored: readonly Scored[],
  ledger: readonly LedgerEntry[],
): Promise<RunSummary> {
  const isCode = mode === "code";
  const candidates = scored.map((item) => item.candidate);
  const pre = preselect(candidates, isCode);
  const outcome: Outcome =
    pre.kind === "judge"
      ? await judgeFinalists(options, mode, pre.finalists, ledger, runId)
      : { winner: pre.kind === "winner" ? pre.worker : undefined, reason: pre.reason };

  const entries = scored.map((item) =>
    ledgerEntry(runId, mode, item.attempt.spec, item.attempt, {
      passed: item.candidate.passed,
      won: item.candidate.worker === outcome.winner,
    }),
  );
  appendLedger(swarmPaths(options.root), outcome.entry ? [...entries, outcome.entry] : entries);
  return writeRun(options, mode, runId, scored, outcome);
}

function writeRun(
  options: RunOptions,
  mode: Mode,
  runId: string,
  scored: readonly Scored[],
  outcome: Outcome,
): RunSummary {
  const runDir = join(swarmPaths(options.root).runs, runId);
  mkdirSync(runDir, { recursive: true });
  for (const { candidate } of scored) {
    const name = safeName(candidate.worker);
    writeFileSync(join(runDir, `${name}.txt`), candidate.text + "\n");
    if (candidate.patch) writeFileSync(join(runDir, `${name}.patch`), candidate.patch);
  }
  if (outcome.judgeText !== undefined) writeFileSync(join(runDir, "judge.txt"), outcome.judgeText + "\n");
  const summary: RunSummary = {
    runId,
    mode,
    task: options.task,
    candidates: scored.map(({ attempt: run, candidate }) => ({
      worker: candidate.worker,
      family: candidate.family,
      ok: candidate.ok,
      passed: candidate.passed,
      changedLines: candidate.changedLines,
      secs: run.secs,
      failure: run.output.failure,
    })),
    winner: outcome.winner,
    reason: outcome.reason,
    judge: outcome.judge,
    runDir,
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

function toCandidate(run: Attempt, patch: CollectedPatch, passed: boolean | null): Candidate {
  return {
    worker: run.spec.label,
    family: familyOf(run.spec),
    ok: run.output.ok,
    text: run.output.text,
    passed,
    patch: patch.patch,
    changedLines: patch.changedLines,
  };
}

// ── ask ─────────────────────────────────────────────────────────────────────

const NO_PATCH: CollectedPatch = { patch: "", changedLines: 0 };

export async function runAsk(options: RunOptions): Promise<RunSummary> {
  const paths = swarmPaths(options.root);
  ensureCodexHome(paths);
  const ledger = readLedger(paths);
  const runId = newRunId();
  const workers = chooseForRun(options, "ask", ledger);
  options.log(`ask ${runId}: ${workers.map((spec) => spec.label).join(", ")}`);
  const scored = await Promise.all(
    workers.map(async (spec) => {
      const cwd = needsScratchCwdForAsk(spec) ? scratchDir() : options.root;
      const run = await attempt(spec, "ask", options.task, cwd, options.timeoutMs, paths);
      options.log(`  ${run.output.ok ? "done" : `fail (${run.output.failure})`}  ${spec.label}  ${run.secs}s`);
      return { attempt: run, candidate: toCandidate(run, NO_PATCH, null) };
    }),
  );
  return settle(options, "ask", runId, scored, ledger);
}

// ── code ────────────────────────────────────────────────────────────────────

export interface CodeOptions extends RunOptions {
  check?: string;
  checkTimeoutMs: number;
}

export function codePrompt(task: string, check?: string): string {
  return [
    "You are one of several independent agents attempting the same task, each in its own copy of the repository.",
    "Work only inside the current directory. Do not commit, push, or create branches.",
    `Task:\n${task}`,
    check ? `Your change will be judged by running \`${check}\` from this directory; exit code 0 means pass.` : "",
    "When you are done, reply with two sentences describing what you changed.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runCheck(options: CodeOptions, worktree: string, label: string): Promise<boolean | null> {
  if (!options.check) return null;
  const result = await runProcess({ bin: "sh", args: ["-c", options.check] }, worktree, options.checkTimeoutMs);
  const passed = result.code === 0 && !result.timedOut;
  options.log(`  check ${passed ? "pass" : "FAIL"}  ${label}  ${result.secs}s`);
  return passed;
}

async function codeAttempt(
  options: CodeOptions,
  spec: WorkerSpec,
  runId: string,
  base: string,
): Promise<Scored> {
  const paths = swarmPaths(options.root);
  const worktree = join(paths.worktrees, runId, safeName(spec.label));
  createWorktree(options.root, worktree, base);
  const run = await attempt(spec, "code", codePrompt(options.task, options.check), worktree, options.timeoutMs, paths);
  options.log(`  ${run.output.ok ? "done" : `fail (${run.output.failure})`}  ${spec.label}  ${run.secs}s`);
  const patch = collectPatch(worktree, base);
  const produced = run.output.ok && patch.changedLines > 0;
  const passed = produced ? await runCheck(options, worktree, spec.label) : null;
  return { attempt: run, candidate: toCandidate(run, patch, passed) };
}

export async function runCode(options: CodeOptions): Promise<RunSummary> {
  const paths = swarmPaths(options.root);
  ensureCodexHome(paths);
  const ledger = readLedger(paths);
  const runId = newRunId();
  const base = snapshotBase(options.root);
  const workers = chooseForRun(options, "code", ledger);
  options.log(`code ${runId} from ${base.slice(0, 10)}: ${workers.map((spec) => spec.label).join(", ")}`);
  const scored = await Promise.all(workers.map((spec) => codeAttempt(options, spec, runId, base)));
  return settle(options, "code", runId, scored, ledger);
}

// ── doctor ──────────────────────────────────────────────────────────────────

export interface DoctorRow {
  worker: string;
  family: string;
  ok: boolean;
  secs: number;
  detail: string;
}

const DOCTOR_PROMPT = "Reply with exactly the single word: ready";

export async function runDoctor(root: string, pool: readonly WorkerSpec[], timeoutMs: number): Promise<DoctorRow[]> {
  const paths = swarmPaths(root);
  ensureCodexHome(paths);
  const runId = `doctor-${newRunId()}`;
  const runs = await Promise.all(pool.map((spec) => attempt(spec, "ask", DOCTOR_PROMPT, scratchDir(), timeoutMs, paths)));
  appendLedger(
    paths,
    runs.map((run) => ledgerEntry(runId, "doctor", run.spec, run, { passed: null, won: false })),
  );
  return runs.map((run) => ({
    worker: run.spec.label,
    family: familyOf(run.spec),
    ok: run.output.ok,
    secs: run.secs,
    detail: run.output.ok ? run.output.text.slice(0, 40) : `${run.output.failure}: ${run.output.text.slice(-120)}`,
  }));
}

export function workerStatsRows(root: string, pool: readonly WorkerSpec[]) {
  const ledger = readLedger(swarmPaths(root));
  const now = Date.now();
  const stats = summarize(ledger, now);
  const labels = new Set([...pool.map((spec) => spec.label), ...stats.keys()]);
  return [...labels].map((worker) => {
    const row = stats.get(worker);
    const cooldownMin = Math.ceil(cooldownRemainingMs(ledger, worker, now) / 60000);
    return {
      worker,
      attempts: row?.attempts ?? 0,
      wins: row?.wins ?? 0,
      winRate: row ? row.winRate.toFixed(2) : "0.50",
      recentRuns: row?.recentRuns ?? 0,
      status: cooldownMin > 0 ? `cooling ${cooldownMin}m (${row?.lastFailure})` : "ready",
    };
  });
}
