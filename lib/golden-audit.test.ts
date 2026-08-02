import assert from "node:assert/strict";
import {
  GOLDEN_BUDGET_CAP_DEFAULT,
  GOLDEN_MIN_INTERVAL_HOURS_DEFAULT,
  checkRequiredSubstrings,
  combineAuditVerdict,
  goldenAuditUserPrompt,
  goldenBudgetCap,
  goldenMinIntervalMs,
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

console.log("golden-audit tests passed");
