// Small-team-vs-frontier benchmark: pure decisions. Prompts, code
// extraction, the team's evidence-based candidate selection, and the paired
// statistics all live here so they can be tested without spawning a model or
// a sandbox. bench.ts does the I/O.

export interface Example {
  input: string;
  output: string;
}

/** The only part of a task any agent ever sees. Oracles stay sealed. */
export interface PublicTask {
  id: string;
  title: string;
  topic: string[];
  author: string;
  checker: string;
  time_limit_s: number;
  statement: string;
  examples: Example[];
}

export interface RunOutcome {
  status: "ok" | "timeout" | "error";
  stdout?: string;
  stderr?: string;
}

// ── output comparison (mirrors bench-grader.py outputs_match) ───────────────

export function outputsMatch(expected: string, actual: string, checker: string): boolean {
  const want = expected.split(/\s+/).filter(Boolean);
  const got = actual.split(/\s+/).filter(Boolean);
  if (checker === "tokens") return want.length === got.length && want.every((token, index) => token === got[index]);
  if (!checker.startsWith("float:")) throw new Error(`unknown checker ${checker}`);
  const eps = Number(checker.slice("float:".length));
  if (want.length !== got.length) return false;
  return want.every((token, index) => floatTokenMatches(token, got[index], eps));
}

function floatTokenMatches(want: string, got: string, eps: number): boolean {
  const wantNumber = Number(want);
  const gotNumber = Number(got);
  if (!Number.isFinite(wantNumber) || !Number.isFinite(gotNumber)) return want === got;
  return Math.abs(wantNumber - gotNumber) <= eps * Math.max(1, Math.abs(wantNumber));
}

export function normalizedOutput(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

// ── prompts ──────────────────────────────────────────────────────────────────

function examplesBlock(examples: readonly Example[]): string {
  return examples
    .map((example, index) => `Example ${index + 1} input:\n\`\`\`\n${example.input}\`\`\`\nExample ${index + 1} output:\n\`\`\`\n${example.output}\`\`\``)
    .join("\n\n");
}

const SOLUTION_RULES = [
  "Write a complete Python 3.12 program that reads the input from standard input and prints the answer to standard output.",
  "Use only the Python standard library. The program runs with no network and no file access other than stdin/stdout.",
  "Hidden tests include inputs at the maximum constraints, so the algorithm must be efficient enough for CPython within the time limit.",
  "Do not use tools or run commands; reason it through and answer directly.",
  "Reply with your final program in a single ```python fenced block. Put nothing after the block.",
].join("\n");

export function solvePrompt(task: PublicTask): string {
  return [
    `Solve this programming problem. Time limit per test: ${task.time_limit_s} seconds (CPython).`,
    task.statement.trim(),
    examplesBlock(task.examples),
    SOLUTION_RULES,
  ].join("\n\n");
}

export interface FailureReport {
  input: string;
  expected?: string;
  got: string;
  note: string;
}

function failureBlock(failures: readonly FailureReport[]): string {
  return failures
    .map((failure, index) => {
      const expected = failure.expected === undefined ? "" : `Expected output:\n\`\`\`\n${failure.expected}\n\`\`\`\n`;
      return `Failing case ${index + 1} (${failure.note}).\nInput:\n\`\`\`\n${failure.input}\`\`\`\n${expected}Your program produced:\n\`\`\`\n${failure.got}\n\`\`\``;
    })
    .join("\n\n");
}

export function repairPrompt(task: PublicTask, code: string, failures: readonly FailureReport[]): string {
  return [
    `Your program for this problem fails on the cases below. Time limit per test: ${task.time_limit_s} seconds (CPython).`,
    task.statement.trim(),
    examplesBlock(task.examples),
    `Your previous program:\n\`\`\`python\n${code}\n\`\`\``,
    failureBlock(failures),
    "Find the bug (it may be a misread rule, an edge case, or an approach that is wrong in general, not just on these cases) and fix it.",
    SOLUTION_RULES,
  ].join("\n\n");
}

export function testerPrompt(task: PublicTask): string {
  return [
    "You are writing TEST TOOLS for the programming problem below, not a solution. Another team will be checked against your tools, so correctness matters more than speed.",
    task.statement.trim(),
    examplesBlock(task.examples),
    [
      "Write Python 3.12 code defining exactly these two functions:",
      "1. gen_input(seed: int, size: str) -> str: build one valid input as the full stdin text, using random.Random(seed) for all randomness. size is \"small\" or \"large\". \"small\" inputs must be tiny (so an exhaustive search finishes instantly) yet varied, and should often hit edge cases: minimum sizes, equal values, impossible cases. \"large\" inputs must reach the maximum constraints. Every input must satisfy all constraints in the statement.",
      "2. brute(inp: str) -> str: an OBVIOUSLY CORRECT slow solver for small inputs, written as the most literal reading of the statement (exhaustive search over all possibilities, direct step-by-step simulation). Never optimize it; clarity is the point.",
      "Use only the standard library. Do not use tools or run commands.",
      "Reply with the code in a single ```python fenced block. Put nothing after the block.",
    ].join("\n"),
  ].join("\n\n");
}

export interface RosterEntry {
  label: string;
  profile: string;
}

export function conductorPrompt(task: PublicTask, roster: readonly RosterEntry[]): string {
  const lines = roster.map((entry) => `- ${entry.label}: ${entry.profile}`);
  return [
    "You are a routing model. Pick the ONE worker most likely to solve the programming problem below correctly on its own. You do not solve it.",
    `Problem title: ${task.title}\nTopics: ${task.topic.join(", ") || "unknown"}`,
    task.statement.trim(),
    `Workers and their measured track record on a separate calibration set:\n${lines.join("\n")}`,
    'Do not use tools. Reply with one line of JSON and nothing else: {"worker":"<exact worker label>"}',
  ].join("\n\n");
}

// ── reply parsing ────────────────────────────────────────────────────────────

const FENCED_BLOCK = /```([a-zA-Z0-9_+-]*)[ \t\r]*\n([\s\S]*?)```/g;

/** The last ```python block, else the last fenced block of any language. */
export function extractPython(reply: string): string | undefined {
  const blocks = [...reply.matchAll(FENCED_BLOCK)].map((match) => ({ lang: match[1].toLowerCase(), body: match[2] }));
  const python = blocks.filter((block) => block.lang === "python" || block.lang === "py" || block.lang === "python3");
  const chosen = (python.length ? python : blocks).at(-1);
  const body = chosen?.body.trim();
  return body ? `${body}\n` : undefined;
}

export function parseConductorChoice(reply: string, labels: readonly string[]): string | undefined {
  const match = reply.match(/\{[^{}]*"worker"\s*:\s*"([^"]+)"[^{}]*\}/);
  const named = match?.[1]?.trim();
  if (named && labels.includes(named)) return named;
  return labels.find((label) => reply.includes(label));
}

// ── the team's evidence ──────────────────────────────────────────────────────

/**
 * Expected output per generated input, from the testers' brute forces. An
 * input is trusted only when every brute that ran agrees; disagreement
 * means at least one tester misread the statement, so it proves nothing.
 */
export function trustedExpectations(bruteRuns: readonly (readonly RunOutcome[])[]): (string | undefined)[] {
  const inputs = bruteRuns[0]?.length ?? 0;
  return Array.from({ length: inputs }, (_, index) => {
    const answers = bruteRuns
      .map((runs) => runs[index])
      .filter((run): run is RunOutcome & { stdout: string } => run?.status === "ok" && run.stdout !== undefined)
      .map((run) => normalizedOutput(run.stdout));
    if (answers.length === 0 || answers.some((answer) => answer !== answers[0]) || answers[0] === "") return undefined;
    return answers[0];
  });
}

export interface CandidateEvidence {
  label: string;
  passesExamples: boolean;
  /** Generated small inputs whose trusted expectation this candidate matches. */
  agreed: number;
  /** Generated small inputs that have a trusted expectation. */
  trusted: number;
  /** Crashes or timeouts on generated large inputs (no expectation; only "does it finish"). */
  largeFailures: number;
  /** Candidates (including itself) with byte-identical normalized outputs on all small inputs. */
  clusterSize: number;
}

export function candidateEvidence(
  label: string,
  examplesPassed: boolean,
  smallRuns: readonly RunOutcome[],
  expectations: readonly (string | undefined)[],
  largeRuns: readonly RunOutcome[],
  checker: string,
): Omit<CandidateEvidence, "clusterSize"> {
  let agreed = 0;
  let trusted = 0;
  expectations.forEach((expected, index) => {
    if (expected === undefined) return;
    trusted += 1;
    const run = smallRuns[index];
    if (run?.status === "ok" && outputsMatch(expected, run.stdout ?? "", checker)) agreed += 1;
  });
  const largeFailures = largeRuns.filter((run) => run.status !== "ok").length;
  return { label, passesExamples: examplesPassed, agreed, trusted, largeFailures };
}

export function outputSignature(smallRuns: readonly RunOutcome[]): string {
  return smallRuns.map((run) => (run.status === "ok" ? normalizedOutput(run.stdout ?? "") : `<${run.status}>`)).join("\u0001");
}

export function withClusterSizes(
  evidence: readonly Omit<CandidateEvidence, "clusterSize">[],
  signatures: readonly string[],
): CandidateEvidence[] {
  const counts = new Map<string, number>();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  return evidence.map((item, index) => ({ ...item, clusterSize: counts.get(signatures[index]) ?? 1 }));
}

function agreementRate(evidence: CandidateEvidence): number {
  return evidence.trusted === 0 ? 0 : evidence.agreed / evidence.trusted;
}

/**
 * Lexicographic preference, most important first: passes the statement's
 * examples, agrees with the trusted brute-force answers, finishes on large
 * inputs, and is in the biggest cluster of programs that agree with each
 * other (AlphaCode-style). Ties keep roster order.
 */
export function compareEvidence(a: CandidateEvidence, b: CandidateEvidence): number {
  return (
    Number(b.passesExamples) - Number(a.passesExamples) ||
    agreementRate(b) - agreementRate(a) ||
    a.largeFailures - b.largeFailures ||
    b.clusterSize - a.clusterSize
  );
}

export function rankCandidates(evidence: readonly CandidateEvidence[]): CandidateEvidence[] {
  return [...evidence].sort(compareEvidence);
}

/** True when the leading candidate leaves a concrete, checkable flaw to repair. */
export function needsRepair(best: CandidateEvidence | undefined): boolean {
  if (!best) return false;
  return !best.passesExamples || best.agreed < best.trusted || best.largeFailures > 0;
}

// ── statistics ──────────────────────────────────────────────────────────────

export function wilsonInterval(successes: number, trials: number, z = 1.96): [number, number] {
  if (trials === 0) return [0, 1];
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (p + (z * z) / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function logChoose(n: number, k: number): number {
  let total = 0;
  for (let i = 1; i <= k; i += 1) total += Math.log(n - k + i) - Math.log(i);
  return total;
}

/**
 * One-sided exact McNemar test: P(at least `aOnly` of the discordant pairs
 * favour A) when each discordant pair is a fair coin. aOnly = tasks only A
 * solved; bOnly = tasks only B solved.
 */
export function mcnemarOneSided(aOnly: number, bOnly: number): number {
  const n = aOnly + bOnly;
  if (n === 0) return 1;
  let p = 0;
  for (let k = aOnly; k <= n; k += 1) p += Math.exp(logChoose(n, k) - n * Math.LN2);
  return Math.min(1, p);
}

export interface PairedComparison {
  tasks: number;
  aSolved: number;
  bSolved: number;
  aOnly: number;
  bOnly: number;
  pOneSided: number;
  diff: number;
  diffCi: [number, number];
}

/** Deterministic PRNG so a reported bootstrap interval can be reproduced. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pairedComparison(a: readonly boolean[], b: readonly boolean[], iterations = 10_000, seed = 20261009): PairedComparison {
  if (a.length !== b.length) throw new Error("paired comparison needs the same tasks for both arms");
  const n = a.length;
  const aOnly = a.filter((solved, index) => solved && !b[index]).length;
  const bOnly = b.filter((solved, index) => solved && !a[index]).length;
  const differences = a.map((solved, index) => Number(solved) - Number(b[index]));
  const random = mulberry32(seed);
  const means: number[] = [];
  for (let iteration = 0; iteration < iterations && n > 0; iteration += 1) {
    let sum = 0;
    for (let draw = 0; draw < n; draw += 1) sum += differences[Math.floor(random() * n)];
    means.push(sum / n);
  }
  means.sort((x, y) => x - y);
  const quantile = (q: number) => (means.length ? means[Math.min(means.length - 1, Math.floor(q * means.length))] : 0);
  return {
    tasks: n,
    aSolved: a.filter(Boolean).length,
    bSolved: b.filter(Boolean).length,
    aOnly,
    bOnly,
    pOneSided: mcnemarOneSided(aOnly, bOnly),
    diff: n ? (aOnly - bOnly) / n : 0,
    diffCi: [quantile(0.025), quantile(0.975)],
  };
}
