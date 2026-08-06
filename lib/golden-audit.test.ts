import assert from "node:assert/strict";
import {
  GOLDEN_BUDGET_CAP_DEFAULT,
  GOLDEN_MIN_INTERVAL_HOURS_DEFAULT,
  GOLDEN_TEMPLATES,
  checkRequiredSubstrings,
  combineAuditVerdict,
  createRng,
  deriveGoldenSeed,
  drawGoldenForRun,
  fnv1a32,
  formatPlain,
  formatUSD,
  goldenAuditUserPrompt,
  goldenBudgetCap,
  goldenMinIntervalMs,
  mulberry32,
  renderGoldenTemplate,
  roundedSubstring,
} from "./golden-audit";

// ─── env parsing: spend and frequency stay bounded on bad input ────────────

assert.equal(goldenBudgetCap(undefined), GOLDEN_BUDGET_CAP_DEFAULT);
assert.equal(goldenBudgetCap("garbage"), GOLDEN_BUDGET_CAP_DEFAULT);
assert.equal(goldenBudgetCap("-3"), GOLDEN_BUDGET_CAP_DEFAULT);
assert.equal(goldenBudgetCap("0.25"), 0.25);
assert.equal(goldenBudgetCap("0.001"), 0.05); // floor
assert.equal(goldenBudgetCap("500"), 5); // ceiling

assert.equal(
  goldenMinIntervalMs(undefined),
  GOLDEN_MIN_INTERVAL_HOURS_DEFAULT * 3_600_000,
);
assert.equal(goldenMinIntervalMs("nope"), 24 * 3_600_000);
assert.equal(goldenMinIntervalMs("6"), 6 * 3_600_000);
assert.equal(goldenMinIntervalMs("0"), 0); // explicit zero allowed for testing
assert.equal(goldenMinIntervalMs("100000"), 24 * 30 * 3_600_000); // ceiling

// ─── checkRequiredSubstrings: deterministic reference facts ────────────────

assert.deepEqual(checkRequiredSubstrings("net payout is $111.00", ["111"]), []);
// Case-insensitive.
assert.deepEqual(checkRequiredSubstrings("Invoice INV-88041", ["inv-88041"]), []);
// Thousands separators do not matter in either direction.
assert.deepEqual(
  checkRequiredSubstrings("Total due: $2,340.50", ["2340.50"]),
  [],
);
assert.deepEqual(
  checkRequiredSubstrings("Total due: $2340.50", ["2,340.50"]),
  [],
);
// Misses are reported verbatim.
assert.deepEqual(
  checkRequiredSubstrings("the answer is 42", ["111", "2026-08-15"]),
  ["111", "2026-08-15"],
);
assert.deepEqual(checkRequiredSubstrings("anything", []), []);

// ─── combineAuditVerdict ───────────────────────────────────────────────────

// Grader pass + substrings pass → audit pass with grader quality.
const pass = combineAuditVerdict({
  substring_misses: [],
  had_required_substrings: true,
  grader: { passed: true, quality_score: 0.9, reasoning: "Matches reference." },
});
assert.ok(pass);
assert.equal(pass.passed, true);
assert.equal(pass.quality, 0.9);
assert.equal(pass.grader_used, true);

// Missing reference facts always fail, even if the grader was charitable,
// and cap quality at 0.3.
const forcedFail = combineAuditVerdict({
  substring_misses: ["111"],
  had_required_substrings: true,
  grader: { passed: true, quality_score: 0.95 },
});
assert.ok(forcedFail);
assert.equal(forcedFail.passed, false);
assert.ok(forcedFail.quality <= 0.3);
assert.ok(forcedFail.reasoning.includes("111"));

// Grader fail → audit fail even when substrings pass.
const graderFail = combineAuditVerdict({
  substring_misses: [],
  had_required_substrings: false,
  grader: { passed: false, quality_score: 0.2, reasoning: "Wrong figure." },
});
assert.ok(graderFail);
assert.equal(graderFail.passed, false);
assert.equal(graderFail.quality, 0.2);

// Grader unreachable: substring criteria decide alone.
const detOnly = combineAuditVerdict({
  substring_misses: [],
  had_required_substrings: true,
  grader: null,
});
assert.ok(detOnly);
assert.equal(detOnly.passed, true);
assert.equal(detOnly.grader_used, false);

const detFail = combineAuditVerdict({
  substring_misses: ["20.1"],
  had_required_substrings: true,
  grader: null,
});
assert.ok(detFail);
assert.equal(detFail.passed, false);

// Grader unreachable and no deterministic criteria → null (audit error, no
// reputation row — never punish or reward on a grader outage).
assert.equal(
  combineAuditVerdict({
    substring_misses: [],
    had_required_substrings: false,
    grader: null,
  }),
  null,
);
// Malformed grader verdict (no boolean passed) counts as unreachable.
assert.equal(
  combineAuditVerdict({
    substring_misses: [],
    had_required_substrings: false,
    grader: { quality_score: 0.8 },
  }),
  null,
);

// Out-of-range grader quality is clamped.
const clamped = combineAuditVerdict({
  substring_misses: [],
  had_required_substrings: false,
  grader: { passed: true, quality_score: 4 },
});
assert.ok(clamped);
assert.equal(clamped.quality, 1);

// ─── goldenAuditUserPrompt: all four sections present, inputs bounded ──────

const prompt = goldenAuditUserPrompt({
  taskPrompt: "Convert 45 mph to m/s.",
  referenceAnswer: "20.1 m/s",
  successCriteria: "Must arrive at ~20.1 m/s.",
  deliveryText: "x".repeat(10_000),
});
assert.ok(prompt.includes("Convert 45 mph"));
assert.ok(prompt.includes("20.1 m/s"));
assert.ok(prompt.includes("Agent's delivery"));
assert.ok(prompt.length < 8_000);

// ─── formatting helpers used by templates ──────────────────────────────────

assert.equal(formatUSD(2340.5), "$2,340.50");
assert.equal(formatUSD(111), "$111.00");
assert.equal(formatPlain(1500, 0), "1,500");
assert.equal(roundedSubstring(111, 2), "111"); // whole dollars: no trailing .00
assert.equal(roundedSubstring(20.1, 1), "20.1");
assert.equal(roundedSubstring(20, 1), "20"); // whole: no trailing .0
assert.equal(roundedSubstring(0.094, 4), "0.0940");

// ─── PRNG: deterministic, and different seeds diverge ──────────────────────

assert.equal(mulberry32(42)(), mulberry32(42)());
assert.notEqual(mulberry32(42)(), mulberry32(43)());
assert.equal(fnv1a32("golden-escrow-math::0"), fnv1a32("golden-escrow-math::0"));
assert.notEqual(fnv1a32("golden-escrow-math::0"), fnv1a32("golden-escrow-math::1"));
assert.equal(
  deriveGoldenSeed("golden-escrow-math", 5),
  deriveGoldenSeed("golden-escrow-math", 5),
);
assert.notEqual(
  deriveGoldenSeed("golden-escrow-math", 5),
  deriveGoldenSeed("golden-escrow-math", 6),
);
assert.notEqual(
  deriveGoldenSeed("golden-escrow-math", 0),
  deriveGoldenSeed("golden-unit-conversion", 0),
);

// ─── templating: all 28 goldens are registered exactly once ───────────────

assert.equal(GOLDEN_TEMPLATES.length, 28);
const templateIds = new Set(GOLDEN_TEMPLATES.map((t) => t.golden_id));
assert.equal(templateIds.size, 28, "golden_id values must be unique");

// ─── templating: task_type only uses values seen in real organic traffic ──
//
// scripts/data/organic-tasks-snapshot.json (212-row dev snapshot, captured
// 2026-08-05) never contains task_type "code", "reasoning", "extraction", or
// "generation" — those four values used to appear on 11 of the 28 templates
// and were themselves a detectability leak (a bidder never needs an LLM to
// notice a task_type value that has zero organic precedent). Lock in that
// those four values are gone and that every template's task_type is one this
// snapshot actually observed, so a future template can't reintroduce the
// leak silently.
const ORGANIC_OBSERVED_TASK_TYPES = new Set([
  "general",
  "code-context-retrieval",
  "multi-step-engineering",
  "end-to-end-campaign",
  "startup-launch-plan",
  "creator-scouting",
  "reacher-live-launch",
  "currency-conversion",
  "copywriting",
  "market discovery",
  "readiness-smoke",
  "hive-roundtable",
  "research",
]);
const LEAKED_TASK_TYPES = new Set(["code", "reasoning", "extraction", "generation"]);
for (const t of GOLDEN_TEMPLATES) {
  assert.ok(
    !LEAKED_TASK_TYPES.has(t.task_type),
    `${t.golden_id}: task_type "${t.task_type}" does not occur anywhere in the organic snapshot`,
  );
  assert.ok(
    ORGANIC_OBSERVED_TASK_TYPES.has(t.task_type),
    `${t.golden_id}: task_type "${t.task_type}" is not a known organic-observed value`,
  );
}
// The 28 templates should not all collapse onto a single task_type either —
// that would trade one detectable pattern (impossible values) for another
// (a golden population 100% concentrated on one value while organic spans
// 13). code-context-retrieval must still carry the 3 code-flavored templates.
const taskTypeCounts = new Map<string, number>();
for (const t of GOLDEN_TEMPLATES) {
  taskTypeCounts.set(t.task_type, (taskTypeCounts.get(t.task_type) ?? 0) + 1);
}
assert.equal(taskTypeCounts.get("code-context-retrieval"), 3);
assert.equal(taskTypeCounts.get("general"), 25);

// ─── templating: same seed reproduces the same task, byte for byte ────────

for (const t of GOLDEN_TEMPLATES) {
  const a = renderGoldenTemplate(t, 12345);
  const b = renderGoldenTemplate(t, 12345);
  assert.deepEqual(a, b, `${t.golden_id}: same seed must reproduce the same draw`);
}

const runA1 = drawGoldenForRun("golden-escrow-math", 3);
const runA2 = drawGoldenForRun("golden-escrow-math", 3);
assert.ok(runA1 && runA2);
assert.equal(runA1.seed, runA2.seed);
assert.deepEqual(runA1.draw, runA2.draw);

// Reproducible from the seed alone too (not just from re-calling with the
// same golden_id/run_index): createRng(seed) + template.draw must match what
// drawGoldenForRun produced, since that is exactly how a recorded
// golden_task_runs.seed would be replayed for re-grading.
const escrowTemplate = GOLDEN_TEMPLATES.find((t) => t.golden_id === "golden-escrow-math")!;
const replayed = escrowTemplate.draw(createRng(runA1.seed));
assert.deepEqual(replayed, runA1.draw);

assert.equal(drawGoldenForRun("golden-does-not-exist", 0), null);

// ─── templating: two draws of the same golden produce different surface
// values (the whole point — an agent cannot memorize a fixed prompt) ───────

for (const t of GOLDEN_TEMPLATES) {
  const run0 = drawGoldenForRun(t.golden_id, 0)!;
  const run1 = drawGoldenForRun(t.golden_id, 1)!;
  assert.notEqual(run0.seed, run1.seed, `${t.golden_id}: run 0/1 seeds must differ`);
  assert.notEqual(
    run0.draw.prompt,
    run1.draw.prompt,
    `${t.golden_id}: run 0/1 prompts must differ`,
  );
}

// ─── templating: drawn params flow into prompt AND reference AND substrings
// consistently — never a hardcoded literal alongside a templated prompt ────

// Generic check across every template and several run indices: whatever the
// reference_answer says, the required_substrings (if any) must be found
// inside it. This is only possible if the substrings were computed FROM the
// same values used to build reference_answer, not independently hardcoded.
for (const t of GOLDEN_TEMPLATES) {
  for (const runIndex of [0, 1, 2, 3, 4]) {
    const { draw } = drawGoldenForRun(t.golden_id, runIndex)!;
    assert.ok(draw.prompt.length > 0, `${t.golden_id}: prompt must be non-empty`);
    assert.ok(
      draw.reference_answer.length > 0,
      `${t.golden_id}: reference_answer must be non-empty`,
    );
    assert.ok(
      draw.success_criteria.length > 0,
      `${t.golden_id}: success_criteria must be non-empty`,
    );
    if (draw.required_substrings && draw.required_substrings.length > 0) {
      const misses = checkRequiredSubstrings(draw.reference_answer, draw.required_substrings);
      assert.deepEqual(
        misses,
        [],
        `${t.golden_id} run ${runIndex}: required_substrings ${JSON.stringify(draw.required_substrings)} not found in its own reference_answer "${draw.reference_answer}"`,
      );
    }
  }
}

// Targeted checks tying specific recorded `params` values to what actually
// appears in the prompt/reference text, for a representative sample of
// templates spanning money, dates, and pure-logic domains.
{
  const { draw } = drawGoldenForRun("golden-escrow-math", 2)!;
  const { escrow, feePct, net } = draw.params as {
    escrow: number;
    feePct: number;
    net: number;
  };
  assert.ok(draw.prompt.includes(formatUSD(escrow)));
  assert.ok(draw.prompt.includes(String(feePct)));
  assert.ok(draw.reference_answer.includes(formatUSD(net)));
  assert.deepEqual(checkRequiredSubstrings(draw.reference_answer, draw.required_substrings!), []);
}
{
  const { draw } = drawGoldenForRun("golden-date-arithmetic", 4)!;
  const { startDate, windowDays, closingDate } = draw.params as {
    startDate: string;
    windowDays: number;
    closingDate: string;
  };
  assert.ok(draw.prompt.includes(startDate));
  assert.ok(draw.prompt.includes(String(windowDays)));
  assert.deepEqual(draw.required_substrings, [closingDate]);
}
{
  const { draw } = drawGoldenForRun("golden-contradiction-detect", 1)!;
  const { contradictionPos } = draw.params as { contradictionPos: number };
  assert.deepEqual(draw.required_substrings, [String(contradictionPos)]);
  assert.ok(draw.reference_answer.startsWith(`Statement ${contradictionPos} contradicts`));
}
{
  const { draw } = drawGoldenForRun("golden-ordering-constraints", 3)!;
  const { nA, nB, nC, nD, nE } = draw.params as {
    nA: string; nB: string; nC: string; nD: string; nE: string;
  };
  assert.ok(draw.prompt.includes(`${nC} needs both ${nA} and ${nB} done first`));
  assert.ok(draw.reference_answer.includes(`${nA} -> ${nB} -> ${nC} -> ${nD}`));
  assert.ok(draw.prompt.includes(nE));
}

// The 8 open-ended "golden-dom-*" tasks deliberately carry no
// required_substrings (see the comment above GOLDEN_TEMPLATES in
// golden-audit.ts) — confirm that stays true rather than silently changing.
const domIds = GOLDEN_TEMPLATES.filter((t) => t.golden_id.startsWith("golden-dom-")).map(
  (t) => t.golden_id,
);
assert.equal(domIds.length, 8);
for (const id of domIds) {
  const { draw } = drawGoldenForRun(id, 0)!;
  assert.equal(draw.required_substrings, undefined, `${id} should have no required_substrings`);
}

console.log("golden-audit tests passed");
