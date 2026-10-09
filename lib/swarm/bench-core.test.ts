import assert from "node:assert/strict";
import {
  candidateEvidence,
  compareEvidence,
  conductorPrompt,
  extractPython,
  mcnemarOneSided,
  mulberry32,
  needsRepair,
  normalizedOutput,
  outputSignature,
  outputsMatch,
  pairedComparison,
  parseConductorChoice,
  rankCandidates,
  repairPrompt,
  solvePrompt,
  testerPrompt,
  trustedExpectations,
  wilsonInterval,
  withClusterSizes,
  type CandidateEvidence,
  type FailureReport,
  type PublicTask,
  type RosterEntry,
  type RunOutcome,
} from "./bench-core";

function assertClose(actual: number, expected: number, tolerance: number): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function ok(stdout: string): RunOutcome {
  return { status: "ok", stdout };
}

const timedOut: RunOutcome = { status: "timeout" };
const crashed: RunOutcome = { status: "error", stderr: "Traceback" };

// ── bench-core: outputsMatch (tokens) ───────────────────────────────────────

assert.equal(outputsMatch("1 2 3", "1 2 3", "tokens"), true);
assert.equal(outputsMatch("1 2 3", "1\n2\n3\n", "tokens"), true);
assert.equal(outputsMatch("1 2 3\n", "  1   2\t3  ", "tokens"), true);
assert.equal(outputsMatch("", "  \n", "tokens"), true);
assert.equal(outputsMatch("1 2", "1 2 3", "tokens"), false);
assert.equal(outputsMatch("1 2 3", "1 2", "tokens"), false);
assert.equal(outputsMatch("1 2", "1 3", "tokens"), false);
assert.equal(outputsMatch("1 2", "12", "tokens"), false);
assert.equal(outputsMatch("YES", "yes", "tokens"), false);
assert.equal(outputsMatch("1.0", "1", "tokens"), false);

// ── bench-core: outputsMatch (float) ────────────────────────────────────────

assert.equal(outputsMatch("1.0", "1.0000005", "float:1e-6"), true);
assert.equal(outputsMatch("1.0", "1.000002", "float:1e-6"), false);
assert.equal(outputsMatch("1000000", "1000000.5", "float:1e-6"), true);
assert.equal(outputsMatch("1000000", "1000002", "float:1e-6"), false);
assert.equal(outputsMatch("0", "0.0000009", "float:1e-6"), true);
assert.equal(outputsMatch("0", "0.000002", "float:1e-6"), false);
assert.equal(outputsMatch("0.001", "0.0010005", "float:1e-6"), true);
assert.equal(outputsMatch("0.001", "0.0010015", "float:1e-6"), false);
assert.equal(outputsMatch("-5", "-5.000004", "float:1e-6"), true);
assert.equal(outputsMatch("-5", "-5.00001", "float:1e-6"), false);
assert.equal(outputsMatch("1.5 2.5\n3.5", "1.5\n2.5 3.5", "float:1e-6"), true);
assert.equal(outputsMatch("1.5 2.5", "1.5 2.6", "float:1e-6"), false);

assert.equal(outputsMatch("YES 1.0", "YES 1.0000001", "float:1e-6"), true);
assert.equal(outputsMatch("YES", "NO", "float:1e-6"), false);
assert.equal(outputsMatch("YES", "yes", "float:1e-6"), false);
assert.equal(outputsMatch("YES", "1", "float:1e-6"), false);
assert.equal(outputsMatch("NaN", "NaN", "float:1e-6"), true);

assert.equal(outputsMatch("1.0 2.0", "1.0", "float:1e-6"), false);
assert.equal(outputsMatch("1.0", "1.0 2.0", "float:1e-6"), false);
assert.equal(outputsMatch("", "", "float:1e-6"), true);

// ── bench-core: outputsMatch (unknown checker) ──────────────────────────────

assert.throws(() => outputsMatch("1", "1", "exact"), /unknown checker exact/);
assert.throws(() => outputsMatch("1", "1", "float"), /unknown checker float/);
assert.throws(() => outputsMatch("1", "1", ""), /unknown checker /);

// ── bench-core: normalizedOutput ────────────────────────────────────────────

assert.equal(normalizedOutput("  a \n b\t\tc  \n"), "a b c");
assert.equal(normalizedOutput(""), "");
assert.equal(normalizedOutput(" \n\t "), "");

// ── bench-core: extractPython ───────────────────────────────────────────────

assert.equal(
  extractPython("First try:\n```python\nprint(1)\n```\nBetter:\n```python\nprint(2)\n```\n"),
  "print(2)\n",
);
assert.equal(extractPython("```py\nx = 1\nprint(x)\n```"), "x = 1\nprint(x)\n");
assert.equal(extractPython("```python3\nprint('three')\n```"), "print('three')\n");
assert.equal(extractPython("```Python\nprint('caps')\n```"), "print('caps')\n");
assert.equal(extractPython("```python\nprint('a')\n```\nRun it with:\n```bash\npython a.py\n```\n"), "print('a')\n");
assert.equal(extractPython("```\nfirst\n```\nand\n```\nsecond\n```"), "second\n");
assert.equal(extractPython("```cpp\nint main() {}\n```"), "int main() {}\n");
assert.equal(extractPython("```python   \nprint(1)\n```"), "print(1)\n");

assert.equal(extractPython("no code here, just prose"), undefined);
assert.equal(extractPython(""), undefined);
assert.equal(extractPython("```python\n```"), undefined);
assert.equal(extractPython("```python\n   \n\n```"), undefined);
assert.equal(extractPython("```\n\n```"), undefined);

assert.equal(extractPython("```python\nprint(1)\n\n\n```"), "print(1)\n");
assert.equal(extractPython("```python\n\n\n  print(1)  \n```"), "print(1)\n");
assert.equal(extractPython("```python\nprint(1)```"), "print(1)\n");
assert.equal(extractPython("```python\nif True:\n    print(1)\n```"), "if True:\n    print(1)\n");

// ── bench-core: parseConductorChoice ────────────────────────────────────────

const labels = ["claude:opus", "codex:gpt-5", "ollama:qwen2.5-coder:7b"];

assert.equal(parseConductorChoice('{"worker":"codex:gpt-5"}', labels), "codex:gpt-5");
assert.equal(parseConductorChoice('{ "worker" : " claude:opus " }', labels), "claude:opus");
assert.equal(parseConductorChoice('Sure.\n{"worker":"ollama:qwen2.5-coder:7b"}\n', labels), "ollama:qwen2.5-coder:7b");

assert.equal(parseConductorChoice('I would pick codex:gpt-5 for this one. {"worker":"gemini:pro"}', labels), "codex:gpt-5");
assert.equal(parseConductorChoice("The best worker is claude:opus.", labels), "claude:opus");
assert.equal(parseConductorChoice("Between ollama:qwen2.5-coder:7b and claude:opus, hard to say.", labels), "claude:opus");

assert.equal(parseConductorChoice("no idea", labels), undefined);
assert.equal(parseConductorChoice('{"worker":"gemini:pro"}', labels), undefined);
assert.equal(parseConductorChoice("", labels), undefined);
assert.equal(parseConductorChoice('{"worker":"claude:opus"}', []), undefined);

// ── bench-core: trustedExpectations ─────────────────────────────────────────

assert.deepEqual(trustedExpectations([[ok("1  2\n"), ok("7")], [ok("1 2"), ok("7\n")]]), ["1 2", "7"]);
assert.deepEqual(trustedExpectations([[ok("3\n")], [ok("3\n")], [ok(" 3 ")]]), ["3"]);

assert.deepEqual(trustedExpectations([[ok("1")], [ok("2")]]), [undefined]);
assert.deepEqual(trustedExpectations([[ok("1 2")], [ok("12")]]), [undefined]);
assert.deepEqual(trustedExpectations([[ok("4")], [ok("4")], [ok("5")]]), [undefined]);

assert.deepEqual(trustedExpectations([[crashed], [ok("9\n")]]), ["9"]);
assert.deepEqual(trustedExpectations([[ok("9\n")], [timedOut]]), ["9"]);

assert.deepEqual(trustedExpectations([[crashed], [timedOut]]), [undefined]);
assert.deepEqual(trustedExpectations([[crashed]]), [undefined]);
assert.deepEqual(trustedExpectations([[{ status: "ok" }], [{ status: "ok" }]]), [undefined]);

assert.deepEqual(trustedExpectations([[ok("")], [ok("")]]), [undefined]);
assert.deepEqual(trustedExpectations([[ok(" \n ")], [ok("\n")]]), [undefined]);
assert.deepEqual(trustedExpectations([[ok("")], [ok("5")]]), [undefined]);

assert.deepEqual(trustedExpectations([]), []);
assert.deepEqual(trustedExpectations([[]]), []);

assert.deepEqual(
  trustedExpectations([
    [ok("a"), ok("b"), crashed, ok("d")],
    [ok("a"), ok("c"), timedOut, crashed],
  ]),
  ["a", undefined, undefined, "d"],
);

// ── bench-core: candidateEvidence ───────────────────────────────────────────

const expectations = ["1", "2", "3", "4", "5"];
const allCorrect = [ok("1\n"), ok("2 \n"), ok("3"), ok("4\n"), ok("5\n")];

assert.deepEqual(candidateEvidence("perfect", true, allCorrect, expectations, [ok("x"), ok("y")], "tokens"), {
  label: "perfect",
  passesExamples: true,
  agreed: 5,
  trusted: 5,
  largeFailures: 0,
});
assert.deepEqual(
  candidateEvidence("flaky", false, [ok("1"), ok("9"), timedOut, crashed, ok("5")], expectations, [timedOut, crashed, ok("z")], "tokens"),
  { label: "flaky", passesExamples: false, agreed: 2, trusted: 5, largeFailures: 2 },
);
assert.deepEqual(
  candidateEvidence("skips-untrusted", true, [ok("1"), ok("anything"), ok("3")], ["1", undefined, "3"], [], "tokens"),
  { label: "skips-untrusted", passesExamples: true, agreed: 2, trusted: 2, largeFailures: 0 },
);
assert.deepEqual(candidateEvidence("no-trust", true, [ok("1")], [undefined], [], "tokens"), {
  label: "no-trust",
  passesExamples: true,
  agreed: 0,
  trusted: 0,
  largeFailures: 0,
});
assert.equal(candidateEvidence("short", true, [ok("1")], ["1", "2"], [], "tokens").agreed, 1);
assert.equal(candidateEvidence("short", true, [ok("1")], ["1", "2"], [], "tokens").trusted, 2);
assert.equal(candidateEvidence("float", true, [ok("0.3000001")], ["0.3"], [], "float:1e-6").agreed, 1);
assert.equal(candidateEvidence("float", true, [ok("0.3000001")], ["0.3"], [], "tokens").agreed, 0);

// ── bench-core: outputSignature ─────────────────────────────────────────────

assert.equal(outputSignature([ok("1\n"), timedOut, crashed]), "1\u0001<timeout>\u0001<error>");
assert.equal(outputSignature([ok(" 1   2 \n")]), "1 2");
assert.equal(outputSignature([{ status: "ok" }]), "");
assert.equal(outputSignature([]), "");
assert.notEqual(outputSignature([timedOut]), outputSignature([crashed]));
assert.notEqual(outputSignature([ok("1"), ok("2")]), outputSignature([ok("1 2")]));
assert.equal(outputSignature([ok("1\n"), ok("2\n")]), outputSignature([ok("1 "), ok(" 2")]));

// ── bench-core: withClusterSizes ────────────────────────────────────────────

const bareEvidence = [
  { label: "a", passesExamples: true, agreed: 1, trusted: 1, largeFailures: 0 },
  { label: "b", passesExamples: true, agreed: 1, trusted: 1, largeFailures: 0 },
  { label: "c", passesExamples: true, agreed: 1, trusted: 1, largeFailures: 0 },
];
assert.deepEqual(
  withClusterSizes(bareEvidence, ["x", "y", "x"]).map((item) => [item.label, item.clusterSize]),
  [
    ["a", 2],
    ["b", 1],
    ["c", 2],
  ],
);
assert.deepEqual(
  withClusterSizes(bareEvidence, ["x", "x", "x"]).map((item) => item.clusterSize),
  [3, 3, 3],
);
assert.deepEqual(
  withClusterSizes(bareEvidence, ["x", "y", "z"]).map((item) => item.clusterSize),
  [1, 1, 1],
);
assert.deepEqual(withClusterSizes([], []), []);

// ── bench-core: ranking candidates by evidence ──────────────────────────────

const failsExamplesSmall = [ok("1 \n"), ok("2"), ok("3\n"), ok("4"), ok("5\n")];
const timesOutSmall = [ok("1"), ok("2"), ok("3"), ok("4"), ok("5")];
const mostlyRightSmall = [ok("1"), ok("2"), ok("3"), ok("4"), ok("9")];

const rankingEvidence = withClusterSizes(
  [
    candidateEvidence("fails-examples", false, failsExamplesSmall, expectations, [ok("a"), ok("b")], "tokens"),
    candidateEvidence("times-out-large", true, timesOutSmall, expectations, [ok("a"), timedOut], "tokens"),
    candidateEvidence("mostly-right", true, mostlyRightSmall, expectations, [ok("a"), ok("b")], "tokens"),
  ],
  [outputSignature(failsExamplesSmall), outputSignature(timesOutSmall), outputSignature(mostlyRightSmall)],
);

assert.deepEqual(rankingEvidence, [
  { label: "fails-examples", passesExamples: false, agreed: 5, trusted: 5, largeFailures: 0, clusterSize: 2 },
  { label: "times-out-large", passesExamples: true, agreed: 5, trusted: 5, largeFailures: 1, clusterSize: 2 },
  { label: "mostly-right", passesExamples: true, agreed: 4, trusted: 5, largeFailures: 0, clusterSize: 1 },
]);
assert.deepEqual(
  rankCandidates(rankingEvidence).map((item) => item.label),
  ["times-out-large", "mostly-right", "fails-examples"],
);
assert.deepEqual(
  rankingEvidence.map((item) => item.label),
  ["fails-examples", "times-out-large", "mostly-right"],
);

const baseline: CandidateEvidence = { label: "base", passesExamples: true, agreed: 4, trusted: 4, largeFailures: 0, clusterSize: 1 };

assert.ok(compareEvidence({ ...baseline, passesExamples: false }, baseline) > 0);
assert.ok(compareEvidence(baseline, { ...baseline, passesExamples: false }) < 0);
assert.ok(compareEvidence({ ...baseline, agreed: 3 }, baseline) > 0);
assert.ok(compareEvidence({ ...baseline, largeFailures: 1 }, baseline) > 0);
assert.ok(compareEvidence({ ...baseline, clusterSize: 3 }, baseline) < 0);
assert.equal(compareEvidence(baseline, { ...baseline, label: "other" }), 0);

assert.ok(compareEvidence({ ...baseline, passesExamples: false, agreed: 4, largeFailures: 0, clusterSize: 9 }, { ...baseline, agreed: 0, largeFailures: 5 }) > 0);
assert.ok(compareEvidence({ ...baseline, agreed: 2, trusted: 4, largeFailures: 0, clusterSize: 9 }, { ...baseline, agreed: 4, trusted: 4, largeFailures: 5, clusterSize: 1 }) > 0);
assert.ok(compareEvidence({ ...baseline, largeFailures: 1, clusterSize: 9 }, { ...baseline, largeFailures: 0, clusterSize: 1 }) > 0);

assert.ok(compareEvidence({ ...baseline, agreed: 3, trusted: 4 }, { ...baseline, agreed: 1, trusted: 2 }) < 0);
assert.ok(compareEvidence({ ...baseline, agreed: 0, trusted: 0 }, { ...baseline, agreed: 1, trusted: 4 }) > 0);

const tiedFirst = { ...baseline, label: "tied-first" };
const tiedSecond = { ...baseline, label: "tied-second" };
const biggerCluster = { ...baseline, label: "bigger-cluster", clusterSize: 4 };
const fewerLargeFailures = { ...baseline, label: "fewer-large-failures", largeFailures: 0, clusterSize: 1 };
const moreLargeFailures = { ...baseline, label: "more-large-failures", largeFailures: 2, clusterSize: 5 };

assert.deepEqual(
  rankCandidates([tiedFirst, tiedSecond, biggerCluster]).map((item) => item.label),
  ["bigger-cluster", "tied-first", "tied-second"],
);
assert.deepEqual(
  rankCandidates([moreLargeFailures, tiedFirst, fewerLargeFailures]).map((item) => item.label),
  ["tied-first", "fewer-large-failures", "more-large-failures"],
);
assert.deepEqual(rankCandidates([]), []);

// ── bench-core: needsRepair ─────────────────────────────────────────────────

const perfectEvidence: CandidateEvidence = { label: "perfect", passesExamples: true, agreed: 5, trusted: 5, largeFailures: 0, clusterSize: 3 };

assert.equal(needsRepair(undefined), false);
assert.equal(needsRepair(perfectEvidence), false);
assert.equal(needsRepair({ ...perfectEvidence, agreed: 0, trusted: 0 }), false);
assert.equal(needsRepair({ ...perfectEvidence, passesExamples: false }), true);
assert.equal(needsRepair({ ...perfectEvidence, agreed: 4 }), true);
assert.equal(needsRepair({ ...perfectEvidence, largeFailures: 1 }), true);

// ── bench-core: wilsonInterval ──────────────────────────────────────────────

assert.deepEqual(wilsonInterval(0, 0), [0, 1]);

const [halfLower, halfUpper] = wilsonInterval(5, 10);
assertClose(halfLower, 0.237, 0.001);
assertClose(halfUpper, 0.763, 0.001);
assertClose(halfLower + halfUpper, 1, 1e-12);

const [noneLower, noneUpper] = wilsonInterval(0, 10);
assertClose(noneLower, 0, 1e-12);
assertClose(noneUpper, 0.2775, 0.001);

const [allLower, allUpper] = wilsonInterval(10, 10);
assertClose(allLower, 0.7225, 0.001);
assertClose(allUpper, 1, 1e-12);

for (let trials = 1; trials <= 30; trials += 1) {
  for (let successes = 0; successes <= trials; successes += 1) {
    const [lower, upper] = wilsonInterval(successes, trials);
    const rate = successes / trials;
    assert.ok(lower >= 0 && upper <= 1, `bounds [${lower}, ${upper}] left [0,1] for ${successes}/${trials}`);
    assert.ok(lower <= rate + 1e-12 && rate <= upper + 1e-12, `${rate} outside [${lower}, ${upper}] for ${successes}/${trials}`);
  }
}

const [wideLower, wideUpper] = wilsonInterval(5, 10);
const [narrowLower, narrowUpper] = wilsonInterval(500, 1000);
assert.ok(narrowUpper - narrowLower < wideUpper - wideLower);
const [looseLower, looseUpper] = wilsonInterval(5, 10, 1);
assert.ok(looseUpper - looseLower < wideUpper - wideLower);

// ── bench-core: mcnemarOneSided ─────────────────────────────────────────────

assert.equal(mcnemarOneSided(0, 0), 1);
assertClose(mcnemarOneSided(5, 0), 1 / 32, 1e-12);
assertClose(mcnemarOneSided(10, 0), 1 / 1024, 1e-12);
assertClose(mcnemarOneSided(1, 0), 0.5, 1e-12);
assertClose(mcnemarOneSided(3, 3), 0.65625, 1e-12);
assertClose(mcnemarOneSided(2, 1), 0.5, 1e-12);
assertClose(mcnemarOneSided(0, 5), 1, 1e-12);
assertClose(mcnemarOneSided(0, 1), 1, 1e-12);
assertClose(mcnemarOneSided(4, 0), 1 / 16, 1e-12);
assertClose(mcnemarOneSided(9, 1), 11 / 1024, 1e-12);

const pValuesByAOnly = Array.from({ length: 11 }, (_, aOnly) => mcnemarOneSided(aOnly, 10 - aOnly));
for (let index = 1; index < pValuesByAOnly.length; index += 1) {
  assert.ok(pValuesByAOnly[index] < pValuesByAOnly[index - 1], `p-value did not drop from aOnly=${index - 1} to aOnly=${index}`);
}
assert.ok(pValuesByAOnly.every((p) => p > 0 && p <= 1));

// ── bench-core: mulberry32 ──────────────────────────────────────────────────

const seedZero = mulberry32(0);
assert.deepEqual([seedZero(), seedZero(), seedZero(), seedZero()], [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111]);
const seedFortyTwo = mulberry32(42);
assert.deepEqual([seedFortyTwo(), seedFortyTwo(), seedFortyTwo(), seedFortyTwo()], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693]);

const firstStream = mulberry32(20261009);
const secondStream = mulberry32(20261009);
const firstDraws = Array.from({ length: 50 }, () => firstStream());
const secondDraws = Array.from({ length: 50 }, () => secondStream());
assert.deepEqual(firstDraws, secondDraws);
assert.equal(new Set(firstDraws).size, 50);

const neighbourStream = mulberry32(20261010);
const neighbourDraws = Array.from({ length: 50 }, () => neighbourStream());
assert.notDeepEqual(firstDraws, neighbourDraws);

const longStream = mulberry32(7);
for (let draw = 0; draw < 5000; draw += 1) {
  const value = longStream();
  assert.ok(value >= 0 && value < 1, `draw ${draw} left [0,1): ${value}`);
}

assert.equal(mulberry32(-1)(), mulberry32(4294967295)());
assert.equal(mulberry32(4294967301)(), mulberry32(5)());

// ── bench-core: pairedComparison ────────────────────────────────────────────

const armA = [true, true, false, false, true];
const armB = [true, false, true, false, false];
const comparison = pairedComparison(armA, armB);

assert.equal(comparison.tasks, 5);
assert.equal(comparison.aSolved, 3);
assert.equal(comparison.bSolved, 2);
assert.equal(comparison.aOnly, 2);
assert.equal(comparison.bOnly, 1);
assertClose(comparison.diff, 0.2, 1e-12);
assertClose(comparison.pOneSided, 0.5, 1e-12);
assert.ok(comparison.diffCi[0] <= comparison.diff && comparison.diff <= comparison.diffCi[1], `diff ${comparison.diff} outside ${comparison.diffCi}`);
assert.ok(comparison.diffCi[0] < comparison.diffCi[1]);
assert.ok(comparison.diffCi[0] >= -1 && comparison.diffCi[1] <= 1);

assert.deepEqual(pairedComparison(armA, armB), pairedComparison(armA, armB));
assert.deepEqual(pairedComparison(armA, armB, 2000, 99), pairedComparison(armA, armB, 2000, 99));
assert.deepEqual(pairedComparison(armA, armB, 10_000, 20261009), comparison);

const mirrored = pairedComparison(armB, armA);
assert.equal(mirrored.aOnly, 1);
assert.equal(mirrored.bOnly, 2);
assertClose(mirrored.diff, -0.2, 1e-12);

const sweep = pairedComparison([true, true, true, true], [false, false, false, false]);
assert.equal(sweep.tasks, 4);
assert.equal(sweep.aSolved, 4);
assert.equal(sweep.bSolved, 0);
assert.equal(sweep.aOnly, 4);
assert.equal(sweep.bOnly, 0);
assert.equal(sweep.diff, 1);
assert.deepEqual(sweep.diffCi, [1, 1]);
assertClose(sweep.pOneSided, 1 / 16, 1e-12);

const identical = pairedComparison([true, false, true], [true, false, true]);
assert.equal(identical.aOnly, 0);
assert.equal(identical.bOnly, 0);
assert.equal(identical.diff, 0);
assert.deepEqual(identical.diffCi, [0, 0]);
assert.equal(identical.pOneSided, 1);

const empty = pairedComparison([], []);
assert.equal(empty.tasks, 0);
assert.equal(empty.diff, 0);
assert.deepEqual(empty.diffCi, [0, 0]);
assert.equal(empty.pOneSided, 1);

assert.deepEqual(pairedComparison([true], [false], 0).diffCi, [0, 0]);

assert.throws(() => pairedComparison([true, false], [true]), /same tasks/);
assert.throws(() => pairedComparison([], [true]), /same tasks/);

// ── bench-core: solvePrompt ─────────────────────────────────────────────────

const task: PublicTask = {
  id: "cf-1234-a",
  title: "Sum of the Two Largest",
  topic: ["math", "greedy"],
  author: "setter",
  checker: "tokens",
  time_limit_s: 3,
  statement: "  Given n integers, print the sum of the two largest.\n",
  examples: [
    { input: "3\n1 5 2\n", output: "7\n" },
    { input: "2\n10 20\n", output: "30\n" },
  ],
};

const solve = solvePrompt(task);
assert.ok(solve.startsWith("Solve this programming problem. Time limit per test: 3 seconds (CPython)."));
assert.ok(solve.includes("Given n integers, print the sum of the two largest."));
assert.ok(!solve.includes("  Given n integers"));
assert.ok(solve.includes("Example 1 input:\n```\n3\n1 5 2\n```\nExample 1 output:\n```\n7\n```"));
assert.ok(solve.includes("Example 2 input:\n```\n2\n10 20\n```\nExample 2 output:\n```\n30\n```"));
assert.ok(solve.includes("```python"));
assert.ok(solve.includes("Python 3.12"));
assert.ok(solve.includes("standard input"));
assert.ok(!solve.includes("Your previous program"));
assert.ok(solvePrompt({ ...task, time_limit_s: 0.5 }).includes("Time limit per test: 0.5 seconds"));

// ── bench-core: repairPrompt ────────────────────────────────────────────────

const previousCode = "n = int(input())\nprint(n)\n";
const failures: FailureReport[] = [
  { input: "3\n1 5 2\n", expected: "7", got: "3", note: "wrong answer on example 1" },
  { input: "200000\n1 2 3\n", got: "", note: "timed out after 3s" },
];

const repair = repairPrompt(task, previousCode, failures);
assert.ok(repair.startsWith("Your program for this problem fails on the cases below. Time limit per test: 3 seconds (CPython)."));
assert.ok(repair.includes("Given n integers, print the sum of the two largest."));
assert.ok(repair.includes("Example 2 input:\n```\n2\n10 20\n```\nExample 2 output:\n```\n30\n```"));
assert.ok(repair.includes(`Your previous program:\n\`\`\`python\n${previousCode}\n\`\`\``));
assert.ok(repair.includes("Failing case 1 (wrong answer on example 1).\nInput:\n```\n3\n1 5 2\n```\nExpected output:\n```\n7\n```\nYour program produced:\n```\n3\n```"));
assert.ok(repair.includes("Failing case 2 (timed out after 3s).\nInput:\n```\n200000\n1 2 3\n```\nYour program produced:\n```\n\n```"));
assert.equal(repair.split("Expected output:").length - 1, 1);
assert.ok(repair.includes("Find the bug"));
assert.ok(repair.includes("```python"));
assert.ok(repair.indexOf("Your previous program") < repair.indexOf("Failing case 1"));
assert.ok(!repairPrompt(task, previousCode, []).includes("Failing case"));

// ── bench-core: testerPrompt ────────────────────────────────────────────────

const tester = testerPrompt(task);
assert.ok(tester.includes("gen_input(seed: int, size: str) -> str"));
assert.ok(tester.includes("brute(inp: str) -> str"));
assert.ok(tester.includes('"small"'));
assert.ok(tester.includes('"large"'));
assert.ok(tester.includes("TEST TOOLS"));
assert.ok(tester.includes("Given n integers, print the sum of the two largest."));
assert.ok(tester.includes("Example 1 input:\n```\n3\n1 5 2\n```\nExample 1 output:\n```\n7\n```"));
assert.ok(tester.includes("```python"));

// ── bench-core: conductorPrompt ─────────────────────────────────────────────

const roster: RosterEntry[] = [
  { label: "claude:opus", profile: "solved 9/10 of the hard calibration tasks" },
  { label: "codex:gpt-5", profile: "solved 7/10, strong on greedy" },
  { label: "ollama:qwen2.5-coder:7b", profile: "solved 2/10" },
];

const conductor = conductorPrompt(task, roster);
assert.ok(conductor.includes("Problem title: Sum of the Two Largest\nTopics: math, greedy"));
assert.ok(conductor.includes("Given n integers, print the sum of the two largest."));
assert.ok(
  conductor.includes(
    "- claude:opus: solved 9/10 of the hard calibration tasks\n- codex:gpt-5: solved 7/10, strong on greedy\n- ollama:qwen2.5-coder:7b: solved 2/10",
  ),
);
for (const entry of roster) assert.ok(conductor.includes(`- ${entry.label}: ${entry.profile}`), `missing roster line for ${entry.label}`);
assert.ok(conductor.includes('{"worker":"<exact worker label>"}'));
assert.ok(conductorPrompt({ ...task, topic: [] }, roster).includes("Topics: unknown"));

console.log("bench-core tests passed");
