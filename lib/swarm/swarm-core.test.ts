import assert from "node:assert/strict";
import {
  buildInvocation,
  classifyFailure,
  familyOf,
  parseWorker,
  parseWorkerList,
  parseWorkerOutput,
  supportsMode,
  withoutNpmBinDirs,
  type ProcessResult,
  type WorkerSpec,
} from "./worker-core";
import {
  SUBSCRIPTION_WINDOW_MS,
  chooseWorkers,
  cooldownRemainingMs,
  summarize,
  type LedgerEntry,
} from "./router-core";
import {
  JUDGE_EXCERPT_CHARS,
  buildJudgePrompt,
  fallbackWinner,
  parseVerdict,
  pickJudge,
  preselect,
  type Candidate,
} from "./select-core";
import { jsonObjectsIn, lastJsonWith } from "./json-reply";
import {
  BASELINE_AUTHOR,
  MAX_BENCH_MS,
  RESULTS_TSV_HEADER,
  abandonUnfinished,
  benchMs,
  judgeRun,
  newBoard,
  nextAuthor,
  nextExperimentId,
  parseProposal,
  parseTrainingSummary,
  renderBoard,
  researchPrompt,
  resultsTsvRow,
  type Board,
  type Experiment,
} from "./board-core";

// ── worker-core: parsing ────────────────────────────────────────────────────

const ollamaWorker = parseWorker("ollama:qwen2.5-coder:7b");
assert.equal(ollamaWorker.backend, "ollama");
assert.equal(ollamaWorker.model, "qwen2.5-coder:7b");
assert.equal(ollamaWorker.label, "ollama:qwen2.5-coder:7b");

const bareClaude = parseWorker("claude");
assert.equal(bareClaude.backend, "claude");
assert.equal(bareClaude.model, undefined);
assert.equal(parseWorker("claude:").model, undefined);
assert.equal(parseWorker("  codex  ").label, "codex");
assert.throws(() => parseWorker("antigravity"), /unknown worker backend "antigravity"/);

const listed = parseWorkerList(" claude , ,codex,, cursor:grok-4.7-medium ,");
assert.deepEqual(
  listed.map((spec) => spec.label),
  ["claude", "codex", "cursor:grok-4.7-medium"],
);
assert.deepEqual(parseWorkerList(" , ,"), []);

// ── worker-core: families and modes ─────────────────────────────────────────

const familyCases: Array<[string, string]> = [
  ["cursor:grok-4.7-medium", "xai"],
  ["cursor:gemini-3.8-flash-high", "google"],
  ["cursor:claude-opus-5-thinking-high", "anthropic"],
  ["cursor:gpt-5.3-codex", "openai"],
  ["cursor:composer-2.5", "other"],
  ["codex", "openai"],
  ["claude", "anthropic"],
  ["ollama:anything", "local"],
  ["opencode:google/gemini-3-flash-preview", "google"],
];
for (const [raw, expected] of familyCases) {
  assert.equal(familyOf(parseWorker(raw)), expected, `family of ${raw}`);
}

assert.equal(supportsMode(parseWorker("ollama:qwen2.5-coder:7b"), "code"), false);
assert.equal(supportsMode(parseWorker("ollama:qwen2.5-coder:7b"), "ask"), true);
for (const raw of ["claude", "codex", "cursor:composer-2.5", "opencode:google/gemini-3-flash-preview"]) {
  assert.equal(supportsMode(parseWorker(raw), "code"), true, `${raw} can code`);
}

// ── worker-core: invocations ────────────────────────────────────────────────

const CONTEXT = { codexHome: "/swarm-test/codex-home" };

function argAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const claudeCode = buildInvocation(parseWorker("claude"), "code", "do it", CONTEXT);
assert.equal(claudeCode.bin, "claude");
assert.equal(argAfter(claudeCode.args, "--permission-mode"), "acceptEdits");
assert.ok(claudeCode.args.includes("--strict-mcp-config"));
assert.equal(argAfter(claudeCode.args, "-p"), "do it");
assert.equal(claudeCode.env, undefined);

const claudeAsk = buildInvocation(parseWorker("claude"), "ask", "what is it", CONTEXT);
assert.equal(claudeAsk.args.includes("--permission-mode"), false);
assert.ok(claudeAsk.args.includes("--strict-mcp-config"));
assert.equal(claudeAsk.args.includes("--model"), false);

const claudeModel = buildInvocation(parseWorker("claude:opus"), "ask", "p", CONTEXT);
assert.equal(argAfter(claudeModel.args, "--model"), "opus");

const codexAsk = buildInvocation(parseWorker("codex"), "ask", "p", CONTEXT);
assert.equal(codexAsk.bin, "codex");
assert.deepEqual(codexAsk.env, { CODEX_HOME: "/swarm-test/codex-home" });
assert.equal(argAfter(codexAsk.args, "-s"), "read-only");
assert.equal(codexAsk.args[codexAsk.args.length - 1], "p");

const codexCode = buildInvocation(parseWorker("codex:gpt-5.3-codex"), "code", "p", CONTEXT);
assert.equal(argAfter(codexCode.args, "-s"), "workspace-write");
assert.equal(argAfter(codexCode.args, "-m"), "gpt-5.3-codex");
assert.equal(codexCode.env?.CODEX_HOME, "/swarm-test/codex-home");

const cursorAsk = buildInvocation(parseWorker("cursor:grok-4.7-medium"), "ask", "p", CONTEXT);
assert.equal(cursorAsk.bin, "cursor-agent");
assert.equal(argAfter(cursorAsk.args, "--mode"), "ask");
assert.ok(cursorAsk.args.includes("--trust"));
assert.equal(argAfter(cursorAsk.args, "--model"), "grok-4.7-medium");

const cursorCode = buildInvocation(parseWorker("cursor:grok-4.7-medium"), "code", "p", CONTEXT);
assert.equal(cursorCode.args.includes("--mode"), false);
assert.ok(cursorCode.args.includes("--trust"));

const ollamaAsk = buildInvocation(parseWorker("ollama"), "ask", "p", CONTEXT);
assert.deepEqual(ollamaAsk.args, ["run", "--nowordwrap", "qwen2.5-coder:7b", "p"]);
assert.throws(
  () => buildInvocation(parseWorker("ollama:qwen2.5-coder:7b"), "code", "p", CONTEXT),
  /cannot run in code mode/,
);

// ── worker-core: failure classification ─────────────────────────────────────

assert.equal(classifyFailure("HTTP 429 Too Many Requests"), "rate_limit");
assert.equal(classifyFailure("usage limit reached"), "rate_limit");
assert.equal(classifyFailure("Failed to authenticate: OAuth session expired"), "auth");
assert.equal(classifyFailure("No auth type is selected"), "auth");
assert.equal(classifyFailure("segfault"), "other");
assert.equal(classifyFailure("processed 14012 rows"), "other");
assert.equal(classifyFailure("processed 14290 rows"), "other");
// "catalog index" contains "log in" mid-word; it must not trigger a 60-min auth cooldown.
assert.equal(classifyFailure("error in catalog index file"), "other");
assert.equal(classifyFailure("You are not logged in"), "auth");
assert.equal(classifyFailure("please run login first"), "auth");

// ── worker-core: output parsing ─────────────────────────────────────────────

function processResult(overrides: Partial<ProcessResult>): ProcessResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
}

assert.deepEqual(parseWorkerOutput("claude", processResult({ timedOut: true, code: null })), {
  ok: false,
  text: "",
  failure: "timeout",
});
assert.deepEqual(parseWorkerOutput("codex", processResult({ timedOut: true, stdout: "partial" })), {
  ok: false,
  text: "",
  failure: "timeout",
});

const claudeOk = parseWorkerOutput(
  "claude",
  processResult({ stdout: '{"is_error":false,"result":"hi"}' }),
);
assert.equal(claudeOk.ok, true);
assert.equal(claudeOk.text, "hi");
assert.equal(claudeOk.failure, undefined);

const claudeLastLine = parseWorkerOutput(
  "claude",
  processResult({ stdout: 'warming up\n{"is_error":false,"result":"  padded  "}\n' }),
);
assert.equal(claudeLastLine.ok, true);
assert.equal(claudeLastLine.text, "padded");

const claudeAuth = parseWorkerOutput(
  "claude",
  processResult({ stdout: '{"is_error":true,"result":"Invalid OAuth token, please log in again"}' }),
);
assert.equal(claudeAuth.ok, false);
assert.equal(claudeAuth.failure, "auth");

const claudeRateLimited = parseWorkerOutput(
  "claude",
  processResult({ stdout: '{"is_error":true,"result":"5-hour usage limit reached"}' }),
);
assert.equal(claudeRateLimited.failure, "rate_limit");

const claudeEmptyResult = parseWorkerOutput(
  "claude",
  processResult({ stdout: '{"is_error":false,"result":"   "}' }),
);
assert.equal(claudeEmptyResult.ok, false);
assert.equal(claudeEmptyResult.failure, "empty");

const claudeNotJson = parseWorkerOutput("claude", processResult({ stdout: "Segmentation fault" }));
assert.equal(claudeNotJson.ok, false);
assert.equal(claudeNotJson.failure, "other");

const claudeNotJsonRateLimited = parseWorkerOutput(
  "claude",
  processResult({ code: 1, stdout: "", stderr: "Error: 429 Too Many Requests" }),
);
assert.equal(claudeNotJsonRateLimited.ok, false);
assert.equal(claudeNotJsonRateLimited.failure, "rate_limit");

const plainFailed = parseWorkerOutput(
  "codex",
  processResult({ code: 1, stdout: "", stderr: "boom" }),
);
assert.equal(plainFailed.ok, false);
assert.equal(plainFailed.text, "boom");
assert.equal(plainFailed.failure, "other");

const plainSignalKilled = parseWorkerOutput("cursor", processResult({ code: null, stderr: "killed" }));
assert.equal(plainSignalKilled.ok, false);

const plainRateLimited = parseWorkerOutput(
  "cursor",
  processResult({ code: 1, stderr: "\u001b[31mError: 429 Too Many Requests\u001b[0m" }),
);
assert.equal(plainRateLimited.failure, "rate_limit");
assert.equal(plainRateLimited.text, "Error: 429 Too Many Requests");

const longDiagnostic = parseWorkerOutput(
  "opencode",
  processResult({ code: 2, stderr: "x".repeat(3000) }),
);
assert.equal(longDiagnostic.text.length, 2000);

const plainAnsi = parseWorkerOutput(
  "cursor",
  processResult({ stdout: "\u001b[1mready\u001b[0m\n" }),
);
assert.equal(plainAnsi.ok, true);
assert.equal(plainAnsi.text, "ready");

const plainEmpty = parseWorkerOutput("opencode", processResult({ stdout: "" }));
assert.equal(plainEmpty.ok, false);
assert.equal(plainEmpty.failure, "empty");

const plainOnlyAnsi = parseWorkerOutput("ollama", processResult({ stdout: "\u001b[2K\u001b[1G\n" }));
assert.equal(plainOnlyAnsi.failure, "empty");

// ── router-core: ledger helpers ─────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function ledgerEntry(
  overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "worker">,
): LedgerEntry {
  return {
    at: NOW - MINUTE,
    runId: "run-1",
    mode: "ask",
    family: familyOf(parseWorker(overrides.worker)),
    ok: true,
    won: false,
    secs: 1,
    ...overrides,
  };
}

// ── router-core: summarize ──────────────────────────────────────────────────

const mixedLedger: LedgerEntry[] = [
  ledgerEntry({ worker: "claude", at: NOW - 10 * MINUTE, won: true }),
  ledgerEntry({ worker: "claude", at: NOW - 5 * MINUTE, won: false }),
  ledgerEntry({ worker: "claude", at: NOW - 2 * MINUTE, mode: "doctor" }),
  ledgerEntry({ worker: "claude", at: NOW - MINUTE, mode: "judge" }),
];
const mixedStats = summarize(mixedLedger, NOW);
assert.equal(mixedStats.has("codex"), false);
assert.equal(mixedStats.size, 1);
const claudeStats = mixedStats.get("claude");
assert.ok(claudeStats);
assert.equal(claudeStats.attempts, 2);
assert.equal(claudeStats.wins, 1);
assert.equal(claudeStats.winRate, 0.5);
assert.equal(claudeStats.recentRuns, 4);
assert.equal(claudeStats.failures, 0);
assert.equal(claudeStats.lastFailure, undefined);

const sweepLedger: LedgerEntry[] = [
  ledgerEntry({ worker: "codex", at: NOW - 3 * MINUTE, won: true }),
  ledgerEntry({ worker: "codex", at: NOW - 2 * MINUTE, won: true }),
  ledgerEntry({ worker: "cursor:grok-4.7-medium", at: NOW - 3 * MINUTE }),
  ledgerEntry({ worker: "cursor:grok-4.7-medium", at: NOW - 2 * MINUTE }),
  ledgerEntry({ worker: "cursor:grok-4.7-medium", at: NOW - MINUTE }),
];
const sweepStats = summarize(sweepLedger, NOW);
assert.equal(sweepStats.get("codex")?.winRate, 0.75);
assert.equal(sweepStats.get("cursor:grok-4.7-medium")?.winRate, 0.2);

const staleLedger: LedgerEntry[] = [
  ledgerEntry({ worker: "codex", at: NOW - SUBSCRIPTION_WINDOW_MS - MINUTE }),
  ledgerEntry({ worker: "claude", at: NOW - SUBSCRIPTION_WINDOW_MS }),
];
const staleStats = summarize(staleLedger, NOW);
assert.equal(staleStats.get("codex")?.recentRuns, 0);
assert.equal(staleStats.get("codex")?.attempts, 1);
assert.equal(staleStats.get("codex")?.winRate, 1 / 3);
assert.equal(staleStats.get("claude")?.recentRuns, 1);

const failureLedger: LedgerEntry[] = [
  ledgerEntry({ worker: "codex", at: NOW - MINUTE, ok: true }),
  ledgerEntry({ worker: "codex", at: NOW - 2 * MINUTE, ok: false, failure: "rate_limit" }),
];
const failureStats = summarize(failureLedger, NOW).get("codex");
assert.equal(failureStats?.failures, 1);
assert.equal(failureStats?.lastFailure, undefined);

assert.equal(summarize([], NOW).size, 0);

// ── router-core: cooldowns ──────────────────────────────────────────────────

const rateLimited = [
  ledgerEntry({ worker: "codex", at: NOW - 10 * MINUTE, ok: false, failure: "rate_limit" }),
];
assert.equal(cooldownRemainingMs(rateLimited, "codex", NOW), 20 * MINUTE);
assert.equal(cooldownRemainingMs(rateLimited, "claude", NOW), 0);

const expiredRateLimit = [
  ledgerEntry({ worker: "codex", at: NOW - 31 * MINUTE, ok: false, failure: "rate_limit" }),
];
assert.equal(cooldownRemainingMs(expiredRateLimit, "codex", NOW), 0);

const authFailed = [ledgerEntry({ worker: "codex", at: NOW, ok: false, failure: "auth" })];
assert.equal(cooldownRemainingMs(authFailed, "codex", NOW), 60 * MINUTE);
assert.equal(cooldownRemainingMs(authFailed, "codex", NOW + 15 * MINUTE), 45 * MINUTE);

const recoveredLedger = [
  ledgerEntry({ worker: "codex", at: NOW - 10 * MINUTE, ok: false, failure: "rate_limit" }),
  ledgerEntry({ worker: "codex", at: NOW - 5 * MINUTE, ok: true }),
];
assert.equal(cooldownRemainingMs(recoveredLedger, "codex", NOW), 0);

const otherFailure = [ledgerEntry({ worker: "codex", at: NOW - MINUTE, ok: false, failure: "other" })];
assert.equal(cooldownRemainingMs(otherFailure, "codex", NOW), 0);

const timeoutFailure = [ledgerEntry({ worker: "codex", at: NOW - MINUTE, ok: false, failure: "timeout" })];
assert.equal(cooldownRemainingMs(timeoutFailure, "codex", NOW), 0);

assert.equal(cooldownRemainingMs([], "codex", NOW), 0);

const shuffledLedger = [
  ledgerEntry({ worker: "codex", at: NOW - 5 * MINUTE, ok: true }),
  ledgerEntry({ worker: "codex", at: NOW - 10 * MINUTE, ok: false, failure: "rate_limit" }),
];
assert.equal(cooldownRemainingMs(shuffledLedger, "codex", NOW), 0);

// ── router-core: chooseWorkers ──────────────────────────────────────────────

const DIVERSE_POOL = parseWorkerList(
  "claude, cursor:claude-sonnet-5-thinking-high, codex, cursor:grok-4.7-medium",
);
const labelsOf = (specs: readonly WorkerSpec[]): string[] => specs.map((spec) => spec.label);

const freshChoice = chooseWorkers(DIVERSE_POOL, [], { count: 3, mode: "ask", now: NOW });
assert.equal(freshChoice.chosen.length, 3);
assert.equal(new Set(freshChoice.chosen.map(familyOf)).size, 3);
assert.deepEqual(labelsOf(freshChoice.chosen), ["claude", "codex", "cursor:grok-4.7-medium"]);
assert.deepEqual(freshChoice.skipped, []);

const fullChoice = chooseWorkers(DIVERSE_POOL, [], { count: 4, mode: "ask", now: NOW });
assert.deepEqual(labelsOf(fullChoice.chosen), [
  "claude",
  "codex",
  "cursor:grok-4.7-medium",
  "cursor:claude-sonnet-5-thinking-high",
]);

const oversizedChoice = chooseWorkers(DIVERSE_POOL, [], { count: 10, mode: "ask", now: NOW });
assert.equal(oversizedChoice.chosen.length, 4);

const coolingChoice = chooseWorkers(
  DIVERSE_POOL,
  [ledgerEntry({ worker: "codex", at: NOW - 10 * MINUTE, ok: false, failure: "rate_limit" })],
  { count: 3, mode: "ask", now: NOW },
);
assert.equal(coolingChoice.skipped.length, 1);
assert.equal(coolingChoice.skipped[0].worker, "codex");
assert.ok(coolingChoice.skipped[0].reason.includes("cooling down"));
assert.ok(coolingChoice.skipped[0].reason.includes("20 more min"));
assert.equal(labelsOf(coolingChoice.chosen).includes("codex"), false);
assert.equal(coolingChoice.chosen.length, 3);

const MIXED_POOL = parseWorkerList("claude, ollama:qwen2.5-coder:7b, codex");
const codeChoice = chooseWorkers(MIXED_POOL, [], { count: 3, mode: "code", now: NOW });
assert.deepEqual(labelsOf(codeChoice.chosen), ["claude", "codex"]);
assert.equal(codeChoice.skipped.length, 1);
assert.equal(codeChoice.skipped[0].worker, "ollama:qwen2.5-coder:7b");
assert.ok(codeChoice.skipped[0].reason.includes("cannot run code"));

const askChoice = chooseWorkers(MIXED_POOL, [], { count: 3, mode: "ask", now: NOW });
assert.equal(askChoice.chosen.length, 3);
assert.deepEqual(askChoice.skipped, []);

const winnerLedger = [
  ledgerEntry({ worker: "cursor:grok-4.7-medium", at: NOW - 3 * MINUTE, won: true }),
  ledgerEntry({ worker: "cursor:grok-4.7-medium", at: NOW - 2 * MINUTE, won: true }),
];
const winnerFirst = chooseWorkers(DIVERSE_POOL, winnerLedger, { count: 3, mode: "ask", now: NOW });
assert.equal(winnerFirst.chosen[0].label, "cursor:grok-4.7-medium");

const sameFamilyLedger = [
  ledgerEntry({ worker: "cursor:claude-sonnet-5-thinking-high", at: NOW - 3 * MINUTE, won: true }),
  ledgerEntry({ worker: "claude", at: NOW - 2 * MINUTE, won: false }),
];
const sameFamilyChoice = chooseWorkers(DIVERSE_POOL, sameFamilyLedger, {
  count: 2,
  mode: "ask",
  now: NOW,
});
assert.equal(labelsOf(sameFamilyChoice.chosen).includes("cursor:claude-sonnet-5-thinking-high"), true);
assert.equal(labelsOf(sameFamilyChoice.chosen).includes("claude"), false);

const leastUsedLedger = [
  ledgerEntry({ worker: "claude", at: NOW - 4 * MINUTE, won: true }),
  ledgerEntry({ worker: "claude", at: NOW - 3 * MINUTE, won: false }),
];
const leastUsedChoice = chooseWorkers(parseWorkerList("claude, codex"), leastUsedLedger, {
  count: 2,
  mode: "ask",
  now: NOW,
});
assert.deepEqual(labelsOf(leastUsedChoice.chosen), ["codex", "claude"]);

// ── select-core: candidate helper ───────────────────────────────────────────

function candidate(overrides: Partial<Candidate> & Pick<Candidate, "worker">): Candidate {
  return {
    family: familyOf(parseWorker(overrides.worker)),
    ok: true,
    text: `answer from somebody`,
    passed: null,
    patch: "",
    changedLines: 0,
    ...overrides,
  };
}

// ── select-core: preselect ──────────────────────────────────────────────────

const nobodyAnswered = preselect(
  [candidate({ worker: "claude", ok: false }), candidate({ worker: "codex", ok: false })],
  false,
);
assert.deepEqual(nobodyAnswered, { kind: "none", reason: "no worker answered" });
assert.deepEqual(preselect([], false), { kind: "none", reason: "no worker answered" });

const noChanges = preselect(
  [
    candidate({ worker: "claude", changedLines: 0 }),
    candidate({ worker: "codex", ok: false, changedLines: 12 }),
  ],
  true,
);
assert.deepEqual(noChanges, { kind: "none", reason: "no worker produced a change" });

const codeIgnoresEmptyDiff = preselect(
  [
    candidate({ worker: "claude", changedLines: 0 }),
    candidate({ worker: "codex", changedLines: 7 }),
  ],
  true,
);
assert.deepEqual(codeIgnoresEmptyDiff, {
  kind: "winner",
  worker: "codex",
  reason: "only worker that answered",
});

const checkedMix = preselect(
  [
    candidate({ worker: "claude", passed: true, changedLines: 3 }),
    candidate({ worker: "codex", passed: false, changedLines: 2 }),
    candidate({ worker: "cursor:grok-4.7-medium", passed: true, changedLines: 9 }),
  ],
  true,
);
assert.equal(checkedMix.kind, "judge");
if (checkedMix.kind === "judge") {
  assert.deepEqual(
    checkedMix.finalists.map((finalist) => finalist.worker),
    ["claude", "cursor:grok-4.7-medium"],
  );
}

const onlyPasser = preselect(
  [
    candidate({ worker: "claude", passed: false, changedLines: 3 }),
    candidate({ worker: "codex", passed: true, changedLines: 2 }),
  ],
  true,
);
assert.deepEqual(onlyPasser, {
  kind: "winner",
  worker: "codex",
  reason: "only candidate that passed the check",
});

const everyoneFailed = preselect(
  [
    candidate({ worker: "claude", passed: false, changedLines: 3 }),
    candidate({ worker: "codex", passed: false, changedLines: 2 }),
  ],
  true,
);
assert.deepEqual(everyoneFailed, { kind: "none", reason: "no candidate passed the check" });

const uncheckedAsk = preselect(
  [candidate({ worker: "claude" }), candidate({ worker: "codex" })],
  false,
);
assert.equal(uncheckedAsk.kind, "judge");
if (uncheckedAsk.kind === "judge") {
  assert.equal(uncheckedAsk.finalists.length, 2);
}

const soleAnswer = preselect(
  [candidate({ worker: "claude" }), candidate({ worker: "codex", ok: false })],
  false,
);
assert.deepEqual(soleAnswer, { kind: "winner", worker: "claude", reason: "only worker that answered" });

// ── select-core: pickJudge ──────────────────────────────────────────────────

const anthropicFinalist = [candidate({ worker: "claude" })];
const twoFamilyFinalists = [candidate({ worker: "claude" }), candidate({ worker: "codex" })];

const outsideFamily = pickJudge(
  anthropicFinalist,
  parseWorkerList("claude, ollama:qwen2.5-coder:7b, codex"),
);
assert.equal(outsideFamily?.label, "codex");

const skipsBothAuthors = pickJudge(
  twoFamilyFinalists,
  parseWorkerList("claude, codex, cursor:grok-4.7-medium"),
);
assert.equal(skipsBothAuthors?.label, "cursor:grok-4.7-medium");

const sameFamilyFallback = pickJudge(anthropicFinalist, parseWorkerList("claude"));
assert.equal(sameFamilyFallback?.label, "claude");

const neverLocalFirst = pickJudge(
  anthropicFinalist,
  parseWorkerList("ollama:qwen2.5-coder:7b, claude"),
);
assert.equal(neverLocalFirst?.label, "claude");

const localOnly = pickJudge(anthropicFinalist, parseWorkerList("ollama:qwen2.5-coder:7b"));
assert.equal(localOnly, undefined);
assert.equal(pickJudge(anthropicFinalist, []), undefined);

// ── select-core: buildJudgePrompt ───────────────────────────────────────────

const askFinalists = [
  candidate({ worker: "claude", text: "first answer body" }),
  candidate({ worker: "cursor:grok-4.7-medium", text: "second answer body" }),
];
const askPrompt = buildJudgePrompt("Why is the sky blue?", askFinalists, false);
assert.ok(askPrompt.includes("Candidate A"));
assert.ok(askPrompt.includes("Candidate B"));
assert.equal(askPrompt.includes("Candidate C"), false);
for (const finalist of askFinalists) {
  assert.equal(askPrompt.includes(finalist.worker), false, `${finalist.worker} leaked into prompt`);
}
assert.ok(askPrompt.includes("Why is the sky blue?"));
assert.ok(askPrompt.indexOf("first answer body") < askPrompt.indexOf("second answer body"));
assert.ok(askPrompt.indexOf("Candidate A") < askPrompt.indexOf("first answer body"));
assert.ok(askPrompt.includes("one of A, B"));
assert.equal(askPrompt.includes("Diff:"), false);

const codeFinalists = [
  candidate({ worker: "claude", text: "renamed the helper", patch: "-old\n+new", changedLines: 2 }),
  candidate({ worker: "codex", text: "also renamed it", patch: "-a\n+b", changedLines: 2 }),
];
const codePrompt = buildJudgePrompt("Rename the helper", codeFinalists, true);
assert.ok(codePrompt.includes("Diff:\n-old\n+new"));
assert.ok(codePrompt.includes("Summary from its author:\nrenamed the helper"));
assert.ok(codePrompt.includes("passed the automated check"));

const atLimit = "a".repeat(JUDGE_EXCERPT_CHARS);
const atLimitPrompt = buildJudgePrompt(
  "t",
  [candidate({ worker: "claude", text: atLimit }), candidate({ worker: "codex" })],
  false,
);
assert.ok(atLimitPrompt.includes(atLimit));
assert.equal(atLimitPrompt.includes("more characters cut"), false);

const overLimit = "b".repeat(JUDGE_EXCERPT_CHARS + 123);
const overLimitPrompt = buildJudgePrompt(
  "t",
  [candidate({ worker: "claude", text: overLimit }), candidate({ worker: "codex" })],
  false,
);
assert.ok(overLimitPrompt.includes("[... 123 more characters cut]"));
assert.equal(overLimitPrompt.includes(overLimit), false);
assert.ok(overLimitPrompt.includes("b".repeat(JUDGE_EXCERPT_CHARS)));

const longPatchPrompt = buildJudgePrompt(
  "t",
  [
    candidate({ worker: "claude", patch: "+".repeat(JUDGE_EXCERPT_CHARS + 5), changedLines: 1 }),
    candidate({ worker: "codex", patch: "+x", changedLines: 1 }),
  ],
  true,
);
assert.ok(longPatchPrompt.includes("[... 5 more characters cut]"));

// ── select-core: parseVerdict ───────────────────────────────────────────────

const LABELS = ["A", "B"];

assert.deepEqual(
  parseVerdict('Thinking it over, here is my pick: {"winner":"B","reason":"x"} -- done.', LABELS),
  { label: "B", reason: "x" },
);
assert.deepEqual(parseVerdict('{"winner":"b","reason":" lower case "}', LABELS), {
  label: "B",
  reason: "lower case",
});
assert.deepEqual(
  parseVerdict('```json\n{"winner":"A","reason":"fenced"}\n```', LABELS),
  { label: "A", reason: "fenced" },
);
assert.equal(parseVerdict('{"winner":"C","reason":"not a candidate"}', LABELS), undefined);
assert.equal(parseVerdict("I cannot decide between them.", LABELS), undefined);
assert.equal(parseVerdict("{winner: B", LABELS), undefined);
assert.equal(parseVerdict('{"winner":null}', LABELS), undefined);
assert.equal(parseVerdict("", LABELS), undefined);

assert.deepEqual(
  parseVerdict('{"winner":"A","reason":"first"} on reflection {"winner":"B","reason":"second"}', LABELS),
  { label: "B", reason: "second" },
);
assert.deepEqual(
  parseVerdict('{"winner":"A","reason":"valid"} then {"winner":"Z","reason":"bad label"}', LABELS),
  { label: "A", reason: "valid" },
);
assert.deepEqual(parseVerdict('{"winner":"A"}', LABELS), { label: "A", reason: "" });

// ── select-core: fallbackWinner ─────────────────────────────────────────────

const sizedFinalists = [
  candidate({ worker: "claude", changedLines: 40 }),
  candidate({ worker: "codex", changedLines: 5 }),
  candidate({ worker: "cursor:grok-4.7-medium", changedLines: 12 }),
];
assert.equal(fallbackWinner(sizedFinalists, true).worker, "codex");
assert.equal(fallbackWinner(sizedFinalists, false).worker, "claude");
assert.deepEqual(
  sizedFinalists.map((finalist) => finalist.worker),
  ["claude", "codex", "cursor:grok-4.7-medium"],
  "fallbackWinner must not reorder its input",
);

const tiedFinalists = [
  candidate({ worker: "claude", changedLines: 5 }),
  candidate({ worker: "codex", changedLines: 5 }),
];
assert.equal(fallbackWinner(tiedFinalists, true).worker, "claude");

// Regression: a real Gemini verdict quoted a regex with braces in its reason.
assert.deepEqual(
  parseVerdict('{"winner":"B","reason":"uses Unicode property escapes (\\\\p{M}) for accents"}', LABELS),
  { label: "B", reason: "uses Unicode property escapes (\\p{M}) for accents" },
);
assert.deepEqual(parseVerdict('{"reason":"order {swapped}","winner":"A"}', LABELS), {
  label: "A",
  reason: "order {swapped}",
});

// ── json-reply: jsonObjectsIn ───────────────────────────────────────────────

assert.deepEqual(jsonObjectsIn('Here you go: {"a":1} and then, later, {"b":"two"}. Done.'), [
  { a: 1 },
  { b: "two" },
]);
assert.deepEqual(jsonObjectsIn("no braces here"), []);
assert.deepEqual(jsonObjectsIn(""), []);
assert.deepEqual(jsonObjectsIn("[1, 2, 3] and 42 and 3.14"), []);
assert.deepEqual(jsonObjectsIn('[1, 2, 3] then 42 then {"ok":true}'), [{ ok: true }]);
assert.deepEqual(jsonObjectsIn('{ not json } then {"ok":true}'), [{ ok: true }]);

const braceInString = jsonObjectsIn('{"reason":"uses \\\\p{M} for accents","winner":"B"}');
assert.equal(braceInString.length, 1);
assert.equal(braceInString[0].reason, "uses \\p{M} for accents");
assert.equal(braceInString[0].winner, "B");

// ── json-reply: lastJsonWith ────────────────────────────────────────────────

const multiObjectReply = 'first {"a":1} middle {"a":2,"b":"x"} tail {"c":3}';
assert.deepEqual(lastJsonWith(multiObjectReply, "a"), { a: 2, b: "x" });
assert.deepEqual(lastJsonWith(multiObjectReply, "b"), { a: 2, b: "x" });
assert.deepEqual(lastJsonWith(multiObjectReply, "c"), { c: 3 });
assert.equal(lastJsonWith(multiObjectReply, "missing"), undefined);
assert.equal(lastJsonWith("no json at all", "a"), undefined);
assert.equal(lastJsonWith("", "a"), undefined);

const buriedObject = '{"k":1}' + "x".repeat(5000 - '{"k":1}'.length);
assert.equal(buriedObject.length, 5000);
assert.deepEqual(jsonObjectsIn(buriedObject), [{ k: 1 }]);
assert.equal(lastJsonWith(buriedObject, "k"), undefined);

const objectAtTailEnd = "x".repeat(5000) + '{"k":1}';
assert.deepEqual(lastJsonWith(objectAtTailEnd, "k"), { k: 1 });

const objectFillingTail = '{"k":1}' + "x".repeat(4000 - '{"k":1}'.length);
assert.equal(objectFillingTail.length, 4000);
assert.deepEqual(lastJsonWith(objectFillingTail, "k"), { k: 1 });
assert.equal(lastJsonWith(objectFillingTail + "y", "k"), undefined);

// ── worker-core: gemini parsing ─────────────────────────────────────────────

const bareGemini = parseWorker("gemini");
assert.equal(bareGemini.backend, "gemini");
assert.equal(bareGemini.model, undefined);
assert.equal(bareGemini.label, "gemini");
assert.equal(familyOf(bareGemini), "google");

const proGemini = parseWorker("gemini:gemini-3-pro");
assert.equal(proGemini.backend, "gemini");
assert.equal(proGemini.model, "gemini-3-pro");
assert.equal(proGemini.label, "gemini:gemini-3-pro");
assert.equal(familyOf(proGemini), "google");

assert.equal(supportsMode(bareGemini, "code"), true);
assert.equal(supportsMode(bareGemini, "ask"), true);

// ── worker-core: gemini invocations ─────────────────────────────────────────

const geminiCode = buildInvocation(bareGemini, "code", "fix it", CONTEXT);
assert.equal(geminiCode.bin, "gemini");
assert.equal(argAfter(geminiCode.args, "-p"), "fix it");
assert.equal(argAfter(geminiCode.args, "-o"), "json");
assert.equal(argAfter(geminiCode.args, "--approval-mode"), "auto_edit");
assert.equal(geminiCode.args.includes("-m"), false);
assert.equal(geminiCode.env, undefined);

const geminiAsk = buildInvocation(bareGemini, "ask", "what is it", CONTEXT);
assert.equal(argAfter(geminiAsk.args, "-p"), "what is it");
assert.equal(argAfter(geminiAsk.args, "-o"), "json");
assert.equal(argAfter(geminiAsk.args, "--approval-mode"), "plan");
assert.equal(geminiAsk.args.includes("-m"), false);

const geminiAskModel = buildInvocation(proGemini, "ask", "p", CONTEXT);
assert.equal(argAfter(geminiAskModel.args, "-m"), "gemini-3-pro");
assert.equal(argAfter(geminiAskModel.args, "--approval-mode"), "plan");

const geminiCodeModel = buildInvocation(proGemini, "code", "p", CONTEXT);
assert.equal(argAfter(geminiCodeModel.args, "-m"), "gemini-3-pro");
assert.equal(argAfter(geminiCodeModel.args, "--approval-mode"), "auto_edit");

// ── worker-core: gemini output parsing ──────────────────────────────────────

assert.deepEqual(
  parseWorkerOutput("gemini", processResult({ stdout: '{"response":"hello","stats":{}}' })),
  { ok: true, text: "hello" },
);

const geminiPadded = parseWorkerOutput(
  "gemini",
  processResult({ stdout: '{"response":"  padded  \\n"}\n' }),
);
assert.equal(geminiPadded.ok, true);
assert.equal(geminiPadded.text, "padded");

const geminiQuota = parseWorkerOutput(
  "gemini",
  processResult({ code: 1, stdout: '{"error":{"message":"Quota exceeded"}}' }),
);
assert.equal(geminiQuota.ok, false);
assert.equal(geminiQuota.failure, "rate_limit");
assert.equal(geminiQuota.text, "Quota exceeded");

const geminiStringError = parseWorkerOutput(
  "gemini",
  processResult({ code: 1, stdout: '{"error":"Please log in again"}' }),
);
assert.equal(geminiStringError.ok, false);
assert.equal(geminiStringError.failure, "auth");

const geminiNotJson = parseWorkerOutput(
  "gemini",
  processResult({ code: 1, stdout: "Segmentation fault" }),
);
assert.equal(geminiNotJson.ok, false);
assert.equal(geminiNotJson.failure, "other");
assert.equal(geminiNotJson.text, "Segmentation fault");

const geminiNotJsonRateLimited = parseWorkerOutput(
  "gemini",
  processResult({ code: 1, stdout: "", stderr: "Error: 429 Too Many Requests" }),
);
assert.equal(geminiNotJsonRateLimited.ok, false);
assert.equal(geminiNotJsonRateLimited.failure, "rate_limit");

const geminiEmptyResponse = parseWorkerOutput("gemini", processResult({ stdout: '{"response":""}' }));
assert.equal(geminiEmptyResponse.ok, false);
assert.equal(geminiEmptyResponse.failure, "empty");
assert.equal(
  parseWorkerOutput("gemini", processResult({ stdout: '{"stats":{}}' })).failure,
  "empty",
);

assert.deepEqual(parseWorkerOutput("gemini", processResult({ timedOut: true, code: null })), {
  ok: false,
  text: "",
  failure: "timeout",
});
assert.equal(
  parseWorkerOutput("gemini", processResult({ timedOut: true, stdout: '{"response":"late"}' })).failure,
  "timeout",
);

// ── board-core: helpers ─────────────────────────────────────────────────────

function boardExperiment(
  overrides: Partial<Experiment> & Pick<Experiment, "id" | "author">,
): Experiment {
  return {
    hypothesis: "raise the learning rate",
    status: "kept",
    proposedAt: NOW,
    ...overrides,
  };
}

function boardWith(experiments: Experiment[], notes: Board["notes"] = []): Board {
  return { ...newBoard("autoresearch/board", "abc123"), experiments, notes };
}

// ── board-core: newBoard and nextExperimentId ───────────────────────────────

const freshBoard = newBoard("autoresearch/board", "abc123");
assert.equal(freshBoard.branch, "autoresearch/board");
assert.equal(freshBoard.best.commit, "abc123");
assert.equal(freshBoard.best.valBpb, null);
assert.deepEqual(freshBoard.experiments, []);
assert.deepEqual(freshBoard.notes, []);

const growingBoard = newBoard("autoresearch/board", "abc123");
assert.equal(nextExperimentId(growingBoard), "e001");
growingBoard.experiments.push(boardExperiment({ id: "e001", author: "claude" }));
assert.equal(nextExperimentId(growingBoard), "e002");

const manyExperiments = Array.from({ length: 99 }, (_, index) =>
  boardExperiment({ id: `e${index + 1}`, author: "claude" }),
);
assert.equal(nextExperimentId(boardWith(manyExperiments)), "e100");

// ── board-core: abandonUnfinished ───────────────────────────────────────────

const unfinishedBoard = boardWith([
  boardExperiment({ id: "e001", author: "claude", status: "kept", valBpb: 1.6 }),
  boardExperiment({
    id: "e002",
    author: "codex",
    status: "discarded",
    valBpb: 1.7,
    bestBefore: 1.6,
    detail: "worse than the best",
  }),
  boardExperiment({ id: "e003", author: "claude", status: "running" }),
  boardExperiment({ id: "e004", author: "codex", status: "queued" }),
  boardExperiment({ id: "e005", author: "claude", status: "crashed", detail: "out of memory" }),
]);
const unfinishedSnapshot = structuredClone(unfinishedBoard);
const afterRestart = abandonUnfinished(unfinishedBoard);

assert.deepEqual(
  afterRestart.experiments.map((experiment) => experiment.status),
  ["kept", "discarded", "abandoned", "abandoned", "crashed"],
);
assert.equal(afterRestart.experiments[2].detail, "lab restarted before it ran");
assert.equal(afterRestart.experiments[3].detail, "lab restarted before it ran");
assert.equal(afterRestart.experiments[2].id, "e003");
assert.deepEqual(afterRestart.experiments[0], unfinishedBoard.experiments[0]);
assert.deepEqual(afterRestart.experiments[1], unfinishedBoard.experiments[1]);
assert.deepEqual(afterRestart.experiments[4], unfinishedBoard.experiments[4]);
assert.deepEqual(afterRestart.best, unfinishedBoard.best);
assert.equal(afterRestart.branch, unfinishedBoard.branch);
assert.notEqual(afterRestart, unfinishedBoard);
assert.deepEqual(unfinishedBoard, unfinishedSnapshot, "abandonUnfinished must not mutate its input");
assert.equal(unfinishedBoard.experiments[2].status, "running");
assert.equal(unfinishedBoard.experiments[3].status, "queued");

// ── board-core: nextAuthor ──────────────────────────────────────────────────

const AUTHORS = ["claude", "codex", "cursor:grok-4.7-medium"];
const turnsBoard = boardWith([
  boardExperiment({ id: "e001", author: "claude" }),
  boardExperiment({ id: "e002", author: "claude" }),
  boardExperiment({ id: "e003", author: "codex" }),
]);

assert.equal(nextAuthor(turnsBoard, AUTHORS, new Set()), "cursor:grok-4.7-medium");
assert.equal(nextAuthor(turnsBoard, AUTHORS, new Set(["cursor:grok-4.7-medium"])), "codex");
assert.equal(
  nextAuthor(turnsBoard, AUTHORS, new Set(["cursor:grok-4.7-medium", "codex"])),
  "claude",
);
assert.equal(nextAuthor(turnsBoard, AUTHORS, new Set(AUTHORS)), undefined);
assert.equal(nextAuthor(turnsBoard, [], new Set()), undefined);
assert.equal(nextAuthor(freshBoard, AUTHORS, new Set()), "claude");

const baselineOnlyBoard = boardWith([
  boardExperiment({ id: "e001", author: BASELINE_AUTHOR }),
  boardExperiment({ id: "e002", author: BASELINE_AUTHOR }),
  boardExperiment({ id: "e003", author: BASELINE_AUTHOR }),
]);
assert.equal(nextAuthor(baselineOnlyBoard, ["claude", "codex"], new Set()), "claude");

const baselineAndCodexBoard = boardWith([
  boardExperiment({ id: "e001", author: BASELINE_AUTHOR }),
  boardExperiment({ id: "e002", author: BASELINE_AUTHOR }),
  boardExperiment({ id: "e003", author: BASELINE_AUTHOR }),
  boardExperiment({ id: "e004", author: "codex" }),
]);
assert.equal(nextAuthor(baselineAndCodexBoard, ["codex", "claude"], new Set()), "claude");
assert.equal(nextAuthor(baselineAndCodexBoard, ["claude", "codex"], new Set(["claude"])), "codex");

// ── board-core: parseTrainingSummary ────────────────────────────────────────

const finishedLog = [
  "step 00001 | loss 9.8 | val_bpb: 9",
  "---",
  "val_bpb:          1.633895",
  "training_seconds: 300.1",
  "peak_vram_mb:     8600.2",
].join("\n");
const finishedSummary = parseTrainingSummary(finishedLog);
assert.equal(finishedSummary.valBpb, 1.633895);
assert.equal(finishedSummary.peakMemoryGb, 8.4);

assert.equal(parseTrainingSummary("peak_vram_mb: 24576").peakMemoryGb, 24);

const logWithoutSummary = parseTrainingSummary("Traceback (most recent call last):\nOutOfMemoryError");
assert.equal(logWithoutSummary.valBpb, undefined);
assert.equal(logWithoutSummary.peakMemoryGb, undefined);
assert.equal(parseTrainingSummary("").valBpb, undefined);

const midLineOnly = parseTrainingSummary("step 00001 | val_bpb: 9\nstep 00002 | peak_vram_mb: 500");
assert.equal(midLineOnly.valBpb, undefined);
assert.equal(midLineOnly.peakMemoryGb, undefined);

assert.equal(parseTrainingSummary("step 00001 | val_bpb: 9\nval_bpb: 1.5\n").valBpb, 1.5);
assert.equal(parseTrainingSummary("val_bpb: nan").valBpb, undefined);

// ── board-core: judgeRun ────────────────────────────────────────────────────

assert.equal(judgeRun(1.6, undefined), "crashed");
assert.equal(judgeRun(null, undefined), "crashed");
assert.equal(judgeRun(1.6, 0), "crashed");
assert.equal(judgeRun(null, 0), "crashed");
assert.equal(judgeRun(null, 1.7), "kept");
assert.equal(judgeRun(1.6, 1.59), "kept");
assert.equal(judgeRun(1.6, 1.6), "discarded");
assert.equal(judgeRun(1.6, 1.61), "discarded");

// ── board-core: resultsTsvRow ───────────────────────────────────────────────

const keptRow = resultsTsvRow(
  "abcdef1234567890",
  boardExperiment({
    id: "e001",
    author: "claude",
    hypothesis: "raise LR to 0.04",
    status: "kept",
    valBpb: 1.5,
    peakMemoryGb: 8.4,
  }),
);
assert.equal(keptRow, "abcdef1\t1.500000\t8.4\tkeep\tclaude: raise LR to 0.04");
assert.equal(keptRow.split("\t").length, 5);
assert.equal(RESULTS_TSV_HEADER.split("\t").length, 5);

const statusCases: Array<[Experiment["status"], string]> = [
  ["kept", "keep"],
  ["discarded", "discard"],
  ["crashed", "crash"],
];
for (const [status, expected] of statusCases) {
  const row = resultsTsvRow("abcdef1234", boardExperiment({ id: "e001", author: "codex", status }));
  assert.equal(row.split("\t")[3], expected, `tsv status for ${status}`);
}

assert.equal(
  resultsTsvRow("abcdef1234", boardExperiment({ id: "e002", author: "codex", status: "crashed" })),
  "abcdef1\t0.000000\t0.0\tcrash\tcodex: raise the learning rate",
);
assert.equal(
  resultsTsvRow("abc", boardExperiment({ id: "e003", author: "codex", valBpb: 1.2 })).split("\t")[0],
  "abc",
);
assert.equal(
  resultsTsvRow("abc", boardExperiment({ id: "e003", author: "codex", valBpb: 1.2 })).split("\t")[1],
  "1.200000",
);
assert.equal(
  resultsTsvRow("abc", boardExperiment({ id: "e003", author: "codex", valBpb: 1.633895 })).split("\t")[1],
  "1.633895",
);

const messyRow = resultsTsvRow(
  "abcdef1234",
  boardExperiment({
    id: "e004",
    author: "claude",
    hypothesis: "tab\there\nnewline\n\ndouble",
    valBpb: 1.5,
  }),
);
assert.equal(messyRow.split("\t").length, 5);
assert.equal(messyRow.includes("\n"), false);
assert.equal(messyRow.split("\t")[4], "claude: tab here newline double");

// ── board-core: renderBoard ─────────────────────────────────────────────────

const emptyRendered = renderBoard(freshBoard);
assert.ok(emptyRendered.includes("No baseline yet"));
assert.ok(emptyRendered.includes("nothing yet"));
assert.ok(emptyRendered.includes("- none yet"));
assert.equal(emptyRendered.includes("Best so far"), false);

const renderedWithBest = renderBoard({
  branch: "autoresearch/board",
  best: { commit: "abcdef1234", valBpb: 1.5, experiment: "e000" },
  experiments: [
    boardExperiment({
      id: "e001",
      author: "codex",
      hypothesis: "gate a | b",
      status: "discarded",
      valBpb: 1.51,
      bestBefore: 1.5,
    }),
  ],
  notes: [],
});
assert.equal(renderedWithBest.includes("No baseline yet"), false);
assert.equal(renderedWithBest.includes("nothing yet"), false);
assert.ok(renderedWithBest.includes("Best so far: val_bpb 1.5000 (e000, commit abcdef1)"));
const discardedRow = "| e001 | codex | discarded | 1.5100 | +0.0100 | gate a / b |";
assert.ok(renderedWithBest.includes(discardedRow));
assert.equal(discardedRow.split("|").length - 1, 7);
assert.equal(renderedWithBest.includes("a | b"), false);

const improvedRow = renderBoard(
  boardWith([
    boardExperiment({ id: "e001", author: "claude", valBpb: 1.49, bestBefore: 1.5 }),
    boardExperiment({ id: "e002", author: "codex", status: "discarded", valBpb: 1.5, bestBefore: 1.5 }),
  ]),
);
assert.ok(improvedRow.includes("| e001 | claude | kept | 1.4900 | -0.0100 | raise the learning rate |"));
assert.ok(improvedRow.includes("| e002 | codex | discarded | 1.5000 | +0.0000 | raise the learning rate |"));

const abandonedRender = renderBoard(
  boardWith([
    boardExperiment({
      id: "e003",
      author: "claude",
      hypothesis: "h",
      status: "abandoned",
      detail: "lab restarted | before it ran",
    }),
  ]),
);
assert.ok(abandonedRender.includes("| e003 | claude | abandoned |  |  | h (lab restarted / before it ran) |"));

const baselineNamed = renderBoard({
  ...freshBoard,
  best: { commit: "abcdef1234", valBpb: 1.6384 },
});
assert.ok(baselineNamed.includes("(baseline, commit abcdef1)"));

const manyNotes = Array.from({ length: 35 }, (_, index) => ({
  at: NOW,
  author: "claude",
  text: `lesson-${String(index + 1).padStart(2, "0")}`,
}));
const renderedManyNotes = renderBoard(boardWith([], manyNotes));
assert.equal(renderedManyNotes.includes("lesson-05"), false);
assert.ok(renderedManyNotes.includes("- claude: lesson-06"));
assert.ok(renderedManyNotes.includes("- claude: lesson-35"));
assert.equal(renderedManyNotes.split("\n").filter((line) => line.startsWith("- claude: ")).length, 30);
assert.equal(renderedManyNotes.includes("none yet"), false);

// ── board-core: researchPrompt ──────────────────────────────────────────────

const promptForCodex = researchPrompt("codex", "# Research board\nBOARD-MARKER", "1x H100 80GB");
assert.ok(promptForCodex.includes("You are codex"));
assert.ok(promptForCodex.includes("(1x H100 80GB)"));
assert.ok(promptForCodex.includes("BOARD-MARKER"));
assert.ok(promptForCodex.includes("Do not run training"));
assert.ok(promptForCodex.includes('"hypothesis"'));
assert.ok(promptForCodex.includes('"note"'));
assert.ok(
  promptForCodex.indexOf("BOARD-MARKER") < promptForCodex.indexOf("end your reply with one line of JSON"),
);

// ── board-core: parseProposal ───────────────────────────────────────────────

assert.deepEqual(
  parseProposal(
    'Raised the LR.\n{"hypothesis":"warm up LR over 100 steps","note":"warmup helped in e002"}',
  ),
  { hypothesis: "warm up LR over 100 steps", note: "warmup helped in e002" },
);

const emptyNote = parseProposal('done\n{"hypothesis":"drop weight decay","note":""}');
assert.equal(emptyNote.hypothesis, "drop weight decay");
assert.equal(emptyNote.note, undefined);
assert.equal(parseProposal('{"hypothesis":"no note key"}').note, undefined);
assert.equal(parseProposal('{"hypothesis":"  padded  ","note":"  spaced  "}').hypothesis, "padded");
assert.equal(parseProposal('{"hypothesis":"  padded  ","note":"  spaced  "}').note, "spaced");

const proposalAfterCode = parseProposal('edited `if cond { y }` in train.py\n{"hypothesis":"h","note":"n"}');
assert.deepEqual(proposalAfterCode, { hypothesis: "h", note: "n" });

const longReply = "x".repeat(300);
const longFallback = parseProposal(longReply);
assert.equal(longFallback.hypothesis, "x".repeat(200));
assert.equal(longFallback.note, undefined);

assert.equal(parseProposal("  I tried a bigger batch.  ").hypothesis, "I tried a bigger batch.");
assert.equal(parseProposal("").hypothesis, "(no description given)");
assert.equal(parseProposal("   \n ").hypothesis, "(no description given)");
assert.equal(parseProposal("").note, undefined);

// ── worker-core: PATH as the user's shell sees it ───────────────────────────

// The PATH npx built on compute-box, where ~/node_modules/.bin held an
// unrelated `codex` package that shadowed /opt/homebrew/bin/codex.
const npxPath = [
  "/Users/yanzihao/arbor-lab/node_modules/.bin",
  "/Users/yanzihao/node_modules/.bin",
  "/Users/node_modules/.bin",
  "/node_modules/.bin",
  "/opt/homebrew/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin",
  "/Users/yanzihao/.local/bin",
  "/opt/homebrew/bin",
  "/usr/bin",
].join(":");
assert.equal(withoutNpmBinDirs(npxPath), "/Users/yanzihao/.local/bin:/opt/homebrew/bin:/usr/bin");
assert.equal(withoutNpmBinDirs("/usr/bin::/bin"), "/usr/bin:/bin");
assert.equal(withoutNpmBinDirs("/opt/node_modules_tools/bin:/usr/bin"), "/opt/node_modules_tools/bin:/usr/bin");

// ── board-core: benching agents that keep failing ───────────────────────────

assert.equal(benchMs("other", 1), 60 * 1000);
assert.equal(benchMs("empty", 3), 4 * 60 * 1000);
assert.equal(benchMs("no_change", 2), 2 * 60 * 1000);
assert.equal(benchMs("rate_limit", 1), 30 * 60 * 1000);
assert.equal(benchMs("rate_limit", 2), MAX_BENCH_MS);
assert.equal(benchMs("other", 50), MAX_BENCH_MS);
assert.equal(benchMs("other", 0), 60 * 1000);

console.log("swarm-core tests passed");
