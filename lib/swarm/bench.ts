// Small-team-vs-frontier benchmark runner. Every arm sees only a task's
// public statement and examples; programs run in bench-grader.py's sandbox;
// hidden tests come from sealed oracles with one fresh seed per task, drawn
// after every arm has submitted. Decisions live in bench-core.ts.

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  candidateEvidence,
  compareEvidence,
  conductorPrompt,
  extractPython,
  needsRepair,
  outputSignature,
  outputsMatch,
  parseConductorChoice,
  rankCandidates,
  repairPrompt,
  solvePrompt,
  testerPrompt,
  trustedExpectations,
  withClusterSizes,
  type CandidateEvidence,
  type FailureReport,
  type PublicTask,
  type RosterEntry,
  type RunOutcome,
} from "./bench-core";
import { ensureCodexHome, runProcess, swarmPaths, type TimedResult } from "./orchestrate";
import { buildInvocation, headlessToolNote, parseWorkerOutput, type Backend, type WorkerSpec } from "./worker-core";

const GRADER = join(__dirname, "bench-grader.py");

export interface BenchConfig {
  root: string;
  denyReads: string[];
  outDir: string;
  callTimeoutMs: number;
  log: (line: string) => void;
}

export interface GradingConfig extends BenchConfig {
  bank: string;
  key: string;
}

// ── concurrency ─────────────────────────────────────────────────────────────

class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly capacity: number) {}

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await job();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

const BACKEND_CAPACITY: Record<Backend, number> = { claude: 6, codex: 2, cursor: 3, gemini: 2, antigravity: 3, opencode: 2, ollama: 3 };
const limiters = new Map<Backend, Limiter>();
const limiterFor = (backend: Backend) => limiters.get(backend) ?? limiters.set(backend, new Limiter(BACKEND_CAPACITY[backend])).get(backend)!;
const sandboxLimiter = new Limiter(6);

// ── model calls ─────────────────────────────────────────────────────────────

export interface CallRecord {
  label: string;
  role: "solve" | "repair" | "tester" | "conductor";
  ok: boolean;
  failure?: string;
  secs: number;
  attempts: number;
  costUsd?: number;
  tokens?: number;
  servedModels?: string[];
}

interface Usage {
  costUsd?: number;
  tokens?: number;
  servedModels?: string[];
}

function lastJsonLine(text: string): Record<string, unknown> | undefined {
  const line = text.trim().split("\n").reverse().find((candidate) => candidate.trim().startsWith("{"));
  try {
    return line ? (JSON.parse(line) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

type CliOutput = Pick<TimedResult, "stdout" | "stderr">;

interface ClaudeUsage {
  output_tokens?: number;
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function sumTokens(usage: ClaudeUsage): number {
  return [usage.output_tokens, usage.input_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens].reduce<number>((total, part) => total + (part ?? 0), 0);
}

function claudeUsage(result: CliOutput): Usage {
  const json = lastJsonLine(result.stdout);
  const usage = json?.usage as ClaudeUsage | undefined;
  const costUsd = typeof json?.total_cost_usd === "number" ? json.total_cost_usd : undefined;
  return { costUsd, tokens: usage && sumTokens(usage), servedModels: Object.keys((json?.modelUsage as object) ?? {}) };
}

function antigravityUsage(result: CliOutput): Usage {
  const usage = lastJsonLine(result.stdout)?.usage as { total_tokens?: number } | undefined;
  return { tokens: usage?.total_tokens };
}

function codexUsage(result: CliOutput): Usage {
  const match = result.stderr.match(/tokens used\s*\n\s*([\d,]+)/);
  return { tokens: match ? Number(match[1].replace(/,/g, "")) : undefined };
}

const USAGE_PARSERS: Partial<Record<Backend, (result: CliOutput) => Usage>> = {
  claude: claudeUsage,
  antigravity: antigravityUsage,
  codex: codexUsage,
  ollama: () => ({ costUsd: 0 }),
};

/** Cost and identity of the model that actually served the call, where the CLI reports it. */
export function parseUsage(backend: Backend, result: CliOutput): Usage {
  return USAGE_PARSERS[backend]?.(result) ?? {};
}

const RETRYABLE = new Set(["rate_limit", "other"]);
const RETRY_DELAYS_MS = [30_000, 120_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withToolNote(spec: WorkerSpec, prompt: string): string {
  const note = headlessToolNote(spec.backend);
  return note ? `${prompt}\n\n${note}` : prompt;
}

export async function callModel(
  config: BenchConfig,
  spec: WorkerSpec,
  role: CallRecord["role"],
  prompt: string,
): Promise<{ text: string; record: CallRecord }> {
  const started = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const cwd = mkdtempSync(join(tmpdir(), "bench-call-"));
    try {
      const invocation = buildInvocation(spec, "ask", withToolNote(spec, prompt), { codexHome: swarmPaths(config.root).codexHome });
      const result = await limiterFor(spec.backend).run(() => runProcess(invocation, cwd, config.callTimeoutMs));
      const output = parseWorkerOutput(spec.backend, result);
      const usage = parseUsage(spec.backend, result);
      const done = output.ok || !RETRYABLE.has(output.failure ?? "other") || attempts > RETRY_DELAYS_MS.length;
      if (done) {
        const secs = Math.round((Date.now() - started) / 1000);
        return { text: output.text, record: { label: spec.label, role, ok: output.ok, failure: output.failure, secs, attempts, ...usage } };
      }
      config.log(`    ${spec.label} ${role} failed (${output.failure}); retrying`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
    await sleep(RETRY_DELAYS_MS[attempts - 1]);
  }
}

// ── sandbox calls into bench-grader.py ──────────────────────────────────────

function runGrader(args: string[], env: Record<string, string> = {}): Promise<Record<string, unknown>> {
  return sandboxLimiter.run(
    () =>
      new Promise((resolve, reject) => {
        execFile("python3", [GRADER, ...args], { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
          const json = lastJsonLine(stdout);
          if (json) resolve(json);
          else reject(new Error(`grader ${args[0]} failed: ${error?.message ?? ""} ${stderr.slice(-500)}`));
        });
      }),
  );
}

function scratchFile(name: string, contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "bench-io-")), name);
  writeFileSync(path, contents);
  return path;
}

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(dirname(path), { recursive: true, force: true });
}

function denyEnv(config: BenchConfig): Record<string, string> {
  return { BENCH_DENY_READ: config.denyReads.join(":") };
}

export async function runPrograms(config: BenchConfig, code: string, inputs: readonly string[], seconds: number): Promise<RunOutcome[]> {
  if (inputs.length === 0) return [];
  const program = scratchFile("solution.py", code);
  const inputFile = scratchFile("inputs.json", JSON.stringify(inputs));
  try {
    const out = await runGrader(["run", program, inputFile, String(seconds)], denyEnv(config));
    return out.results as RunOutcome[];
  } finally {
    cleanup(program, inputFile);
  }
}

export async function callHelper(config: BenchConfig, code: string, fn: string, args: readonly unknown[], seconds: number): Promise<RunOutcome[]> {
  if (args.length === 0) return [];
  const helper = scratchFile("helper.py", code);
  const argsFile = scratchFile("args.json", JSON.stringify(args));
  try {
    const out = await runGrader(["call", helper, fn, argsFile, String(seconds)], denyEnv(config));
    return out.results as RunOutcome[];
  } finally {
    cleanup(helper, argsFile);
  }
}

export interface GradeResult {
  passed: boolean;
  tests: number;
  counts: Record<string, number>;
  first_failure: { size: string; verdict: string } | null;
  oracle_conflicts: number;
  seed: string;
}

export async function gradeCode(config: GradingConfig, taskId: string, code: string | undefined, seed: string): Promise<GradeResult> {
  if (!code) return { passed: false, tests: 0, counts: {}, first_failure: { size: "-", verdict: "no_code" }, oracle_conflicts: 0, seed };
  const solution = scratchFile("solution.py", code);
  try {
    return (await runGrader(["grade", config.bank, taskId, solution, config.key, seed])) as unknown as GradeResult;
  } finally {
    cleanup(solution);
  }
}

// ── arms ────────────────────────────────────────────────────────────────────

export interface SoloResult {
  label: string;
  code?: string;
  examplesPassed: boolean;
  calls: CallRecord[];
}

async function exampleFailures(config: BenchConfig, task: PublicTask, code: string): Promise<FailureReport[]> {
  const runs = await runPrograms(config, code, task.examples.map((example) => example.input), task.time_limit_s);
  return task.examples.flatMap((example, index): FailureReport[] => {
    const run = runs[index];
    if (run?.status === "ok" && outputsMatch(example.output, run.stdout ?? "", task.checker)) return [];
    const got = run?.status === "ok" ? (run.stdout ?? "") : `<${run?.status ?? "error"}> ${run?.stderr ?? ""}`;
    return [{ input: example.input, expected: example.output, got: got.slice(0, 2000), note: "statement example" }];
  });
}

/**
 * One model alone, with the same execution feedback every arm gets: its
 * program is run on the statement's examples and it may repair once.
 */
export async function soloAttempt(config: BenchConfig, spec: WorkerSpec, task: PublicTask, repairRounds = 1): Promise<SoloResult> {
  const calls: CallRecord[] = [];
  const first = await callModel(config, spec, "solve", solvePrompt(task));
  calls.push(first.record);
  // A call that failed (timeout, auth) produced no answer to repair; asking
  // again would just repeat the same wait.
  if (!first.record.ok) return { label: spec.label, code: undefined, examplesPassed: false, calls };
  let code = extractPython(first.text);
  for (let round = 0; ; round += 1) {
    const failures = code ? await exampleFailures(config, task, code) : [{ input: "", got: "(no ```python block found in your reply)", note: "format" }];
    if (failures.length === 0) return { label: spec.label, code, examplesPassed: true, calls };
    if (round >= repairRounds) return { label: spec.label, code, examplesPassed: false, calls };
    const prompt = code ? repairPrompt(task, code, failures.slice(0, 3)) : solvePrompt(task);
    const repair = await callModel(config, spec, code ? "repair" : "solve", prompt);
    calls.push(repair.record);
    code = extractPython(repair.text) ?? code;
  }
}

const SMALL_INPUTS_PER_TESTER = 30;
const LARGE_INPUTS_PER_TESTER = 2;
const HELPER_SECONDS = 3;

interface TesterKit {
  label: string;
  code: string;
}

// A brute force may legitimately time out on a huge statement example (N up
// to 1e18), so a timeout is not evidence against it; a wrong answer or a
// crash is, and at least one example must actually match.
function bruteAgreesWithExamples(task: PublicTask, runs: readonly RunOutcome[]): boolean {
  const verdicts = task.examples.map((example, i) => {
    const run = runs[i];
    if (run?.status === "timeout") return "skipped";
    return run?.status === "ok" && outputsMatch(example.output, run.stdout ?? "", task.checker) ? "match" : "wrong";
  });
  return verdicts.includes("match") && !verdicts.includes("wrong");
}

async function buildTesters(config: BenchConfig, task: PublicTask, testers: readonly WorkerSpec[], calls: CallRecord[]): Promise<TesterKit[]> {
  const replies = await Promise.all(testers.map((spec) => callModel(config, spec, "tester", testerPrompt(task))));
  const kits: TesterKit[] = [];
  for (const [index, reply] of replies.entries()) {
    calls.push(reply.record);
    const code = extractPython(reply.text);
    if (!code) continue;
    const runs = await callHelper(config, code, "brute", task.examples.map((example) => example.input), HELPER_SECONDS);
    if (bruteAgreesWithExamples(task, runs)) kits.push({ label: testers[index].label, code });
  }
  return kits;
}

async function generateInputs(config: BenchConfig, kits: readonly TesterKit[], size: "small" | "large", perTester: number): Promise<string[]> {
  const batches = await Promise.all(
    kits.map((kit, kitIndex) => {
      const args = Array.from({ length: perTester }, (_, i) => [1000 * (kitIndex + 1) + i, size]);
      return callHelper(config, kit.code, "gen_input", args, size === "small" ? HELPER_SECONDS : 20);
    }),
  );
  return batches.flat().filter((run) => run.status === "ok" && run.stdout).map((run) => run.stdout!);
}

interface TeamEvidence {
  smallInputs: string[];
  largeInputs: string[];
  expectations: (string | undefined)[];
}

export interface TeamTools {
  testers: string[];
  team: TeamEvidence;
  calls: CallRecord[];
}

/** Test tools depend only on the statement, so they are built while members solve. */
export async function prepareTeamTools(config: BenchConfig, task: PublicTask, testers: readonly WorkerSpec[]): Promise<TeamTools> {
  const calls: CallRecord[] = [];
  const kits = await buildTesters(config, task, testers, calls);
  const smallInputs = await generateInputs(config, kits, "small", SMALL_INPUTS_PER_TESTER);
  const largeInputs = await generateInputs(config, kits, "large", LARGE_INPUTS_PER_TESTER);
  const bruteRuns = await Promise.all(kits.map((kit) => callHelper(config, kit.code, "brute", smallInputs, HELPER_SECONDS)));
  return { testers: kits.map((kit) => kit.label), team: { smallInputs, largeInputs, expectations: trustedExpectations(bruteRuns) }, calls };
}

async function evaluate(config: BenchConfig, task: PublicTask, label: string, code: string, examplesPassed: boolean, team: TeamEvidence) {
  const smallRuns = await runPrograms(config, code, team.smallInputs, task.time_limit_s);
  const largeRuns = await runPrograms(config, code, team.largeInputs, task.time_limit_s);
  const evidence = candidateEvidence(label, examplesPassed, smallRuns, team.expectations, largeRuns, task.checker);
  return { evidence, smallRuns, largeRuns, signature: outputSignature(smallRuns) };
}

function teamFailures(team: TeamEvidence, smallRuns: readonly RunOutcome[], largeRuns: readonly RunOutcome[], checker: string): FailureReport[] {
  const wrong = team.expectations.flatMap((expected, index): FailureReport[] => {
    const run = smallRuns[index];
    if (expected === undefined || (run?.status === "ok" && outputsMatch(expected, run.stdout ?? "", checker))) return [];
    const got = run?.status === "ok" ? (run.stdout ?? "") : `<${run?.status}> ${run?.stderr ?? ""}`;
    return [{ input: team.smallInputs[index], expected, got: got.slice(0, 2000), note: "small test where two independent brute-force solvers agree on the expected output" }];
  });
  const slow = largeRuns.flatMap((run, index): FailureReport[] =>
    run.status === "ok" ? [] : [{ input: `${team.largeInputs[index].slice(0, 300)}... (truncated large input)`, got: `<${run.status}>`, note: "large input at maximum constraints: too slow or crashed" }],
  );
  return [...wrong.slice(0, 3), ...slow.slice(0, 1)];
}

export interface HiveResult {
  code?: string;
  chosen?: string;
  repaired: boolean;
  testers: string[];
  trustedInputs: number;
  ranking: CandidateEvidence[];
  calls: CallRecord[];
}

/**
 * The small-model team: diverse candidates, independent test tools, and
 * differential execution choose one program; a strong member repairs it when
 * the evidence shows a concrete flaw. Hidden tests are never consulted.
 */
export async function hiveAttempt(
  config: BenchConfig,
  task: PublicTask,
  candidates: readonly SoloResult[],
  tools: TeamTools,
  repairer: WorkerSpec,
  repairRounds = 2,
): Promise<HiveResult> {
  const calls: CallRecord[] = [...tools.calls];
  const team = tools.team;
  const withCode = candidates.filter((candidate) => candidate.code);
  const evaluated = await Promise.all(withCode.map((candidate) => evaluate(config, task, candidate.label, candidate.code!, candidate.examplesPassed, team)));
  const ranking = rankCandidates(withClusterSizes(evaluated.map((item) => item.evidence), evaluated.map((item) => item.signature)));
  const base = { testers: tools.testers, trustedInputs: team.expectations.filter((value) => value !== undefined).length, calls };
  let best = ranking[0];
  if (!best) return { ...base, repaired: false, ranking };
  const bestIndex = evaluated.findIndex((item) => item.evidence.label === best.label);
  let code = withCode[bestIndex].code!;
  let runs = evaluated[bestIndex];
  let repaired = false;
  for (let round = 0; round < repairRounds && needsRepair(best); round += 1) {
    const failures = best.passesExamples
      ? teamFailures(team, runs.smallRuns, runs.largeRuns, task.checker)
      : await exampleFailures(config, task, code);
    if (failures.length === 0) break;
    const reply = await callModel(config, repairer, "repair", repairPrompt(task, code, failures));
    calls.push(reply.record);
    const fixed = extractPython(reply.text);
    if (!fixed) continue;
    const examplesPassed = (await exampleFailures(config, task, fixed)).length === 0;
    const next = await evaluate(config, task, `${best.label}+repair`, fixed, examplesPassed, team);
    const candidate = { ...next.evidence, clusterSize: best.clusterSize };
    if (compareEvidence(candidate, best) < 0) {
      best = candidate;
      code = fixed;
      runs = next;
      repaired = true;
    }
  }
  return { ...base, code, chosen: best.label, repaired, ranking };
}

export interface RouterResult {
  choice?: string;
  code?: string;
  calls: CallRecord[];
}

/** Fugu-style conductor: route the task to ONE worker, reuse that worker's solo attempt. */
export async function routerAttempt(
  config: BenchConfig,
  task: PublicTask,
  solos: readonly SoloResult[],
  conductor: WorkerSpec,
  roster: readonly RosterEntry[],
): Promise<RouterResult> {
  const reply = await callModel(config, conductor, "conductor", conductorPrompt(task, roster));
  const labels = roster.map((entry) => entry.label);
  const choice = parseConductorChoice(reply.text, labels) ?? labels[0];
  return { choice, code: solos.find((solo) => solo.label === choice)?.code, calls: [reply.record] };
}

// ── bank and results ────────────────────────────────────────────────────────

export function loadTasks(bank: string, ids: readonly string[]): PublicTask[] {
  return ids.map((id) => JSON.parse(readFileSync(join(bank, id, "public.json"), "utf8")) as PublicTask);
}

export function bankTaskIds(bank: string): string[] {
  return readdirSync(bank).filter((name) => existsSync(join(bank, name, "public.json"))).sort();
}

export function newSeed(): string {
  return BigInt(`0x${randomBytes(8).toString("hex")}`).toString();
}

export function readResults(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function appendResult(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

export function ensureBenchCodexHome(root: string): void {
  ensureCodexHome(swarmPaths(root));
}
