import assert from "node:assert/strict";
import {
  BOOTSTRAP_PLATT,
  CALIBRATION_REFIT_EVERY,
  CALIBRATION_WINDOW,
  CORPUS_PRIOR,
  PROBE_SUCCESS_MODEL,
  brierScore,
  fitPlatt,
  logit,
  probeSuccessProbability,
  probeSuccessScore,
  rocAuc,
  smoothedRate,
  type ProbeSuccessEvidence,
} from "./probe-success-core";

// ─── smoothedRate ────────────────────────────────────────────────────────────
// No evidence must fall back to the corpus prior, never to 0 (which would claim
// the agent is known-dead) and never to 1.
assert.equal(smoothedRate(0, 0), CORPUS_PRIOR, "no attempts -> prior");
assert.equal(smoothedRate(5, 0), CORPUS_PRIOR, "no attempts -> prior even if k>0");
assert.equal(smoothedRate(0, -3), CORPUS_PRIOR, "negative attempts -> prior");
assert.equal(smoothedRate(0, NaN), CORPUS_PRIOR, "non-finite attempts -> prior");

// Small samples must not outrank well-evidenced ones.
const oneOfOne = smoothedRate(1, 1);
const fortyOfFifty = smoothedRate(40, 50);
assert.ok(
  oneOfOne < fortyOfFifty,
  `1/1 (${oneOfOne}) must not outrank 40/50 (${fortyOfFifty})`,
);
assert.ok(fortyOfFifty > 0.7 && fortyOfFifty < 0.8, "40/50 lands near 0.8");
// Rates stay inside [0,1] and passes are clamped to attempts.
assert.equal(smoothedRate(99, 2), smoothedRate(2, 2), "passes clamp to attempts");
for (const [k, n] of [
  [0, 1],
  [1, 1],
  [3, 10],
  [10, 10],
  [0, 1000],
] as const) {
  const r = smoothedRate(k, n);
  assert.ok(r > 0 && r < 1, `rate ${r} out of (0,1) for ${k}/${n}`);
}
// Monotone in passes at fixed attempts.
assert.ok(smoothedRate(1, 10) < smoothedRate(5, 10));
assert.ok(smoothedRate(5, 10) < smoothedRate(9, 10));

// ─── probeSuccessScore ───────────────────────────────────────────────────────
const ev = (
  smokePasses: number,
  smokeRuns: number,
  probePasses: number,
  probeAttempts: number,
): ProbeSuccessEvidence => ({
  smoke: { runs: smokeRuns, passes: smokePasses },
  probes: { attempts: probeAttempts, passes: probePasses },
});

// With no evidence at all the score is exactly the prior.
assert.equal(probeSuccessScore(ev(0, 0, 0, 0)), CORPUS_PRIOR, "no evidence -> prior");
// It is the mean of the two smoothed rates.
assert.equal(
  probeSuccessScore(ev(3, 3, 0, 4)),
  (smoothedRate(3, 3) + smoothedRate(0, 4)) / 2,
  "score must be the mean of the two measured rates",
);
// A live agent must outrank a dead one, and both must sit inside (0,1).
const live = probeSuccessScore(ev(5, 5, 8, 10));
const dead = probeSuccessScore(ev(0, 5, 0, 10));
assert.ok(live > dead, `live ${live} must outrank dead ${dead}`);
assert.ok(dead > 0 && live < 1, "scores must stay strictly inside (0,1)");
// Either source alone moves the score, so one missing table cannot silently
// zero out the signal.
assert.ok(
  probeSuccessScore(ev(5, 5, 0, 0)) > CORPUS_PRIOR,
  "smoke evidence alone must raise the score",
);
assert.ok(
  probeSuccessScore(ev(0, 0, 8, 10)) > CORPUS_PRIOR,
  "probe evidence alone must raise the score",
);
assert.ok(
  probeSuccessScore(ev(0, 5, 0, 0)) < CORPUS_PRIOR,
  "failing smoke evidence alone must lower the score",
);

// ─── logit ───────────────────────────────────────────────────────────────────
assert.ok(Math.abs(logit(0.5)) < 1e-12, "logit(0.5) == 0");
assert.ok(Number.isFinite(logit(0)), "logit(0) must be clamped, not -Infinity");
assert.ok(Number.isFinite(logit(1)), "logit(1) must be clamped, not +Infinity");
assert.ok(logit(0.9) > logit(0.1), "logit must increase");

// ─── parity with the validated offline model ──────────────────────────────────
// Fixtures come from the same signal + calibration that scored ranking AUC
// 0.9590 / prequential AUC 0.9126 offline. Drift in the TS arithmetic fails here.
interface Fixture {
  smoke_passes: number;
  smoke_runs: number;
  agent_passes: number;
  agent_attempts: number;
  expected_probability: number;
}
const fixtures = (PROBE_SUCCESS_MODEL as unknown as { fixtures: Fixture[] })
  .fixtures;
assert.ok(fixtures.length >= 4, "model must ship parity fixtures");
for (const [i, f] of fixtures.entries()) {
  const actual = probeSuccessProbability(
    ev(f.smoke_passes, f.smoke_runs, f.agent_passes, f.agent_attempts),
  );
  assert.ok(
    Math.abs(actual - f.expected_probability) < 1e-6,
    `fixture ${i}: TS ${actual} !== offline ${f.expected_probability}`,
  );
}
// The fixture set must span a real decision range: a model pinned near 0
// everywhere would be useless to the router even with a good AUC.
const probs = fixtures.map((f) => f.expected_probability);
assert.ok(
  probs.every((p) => p > 0 && p < 1),
  "probabilities must be strictly inside (0,1)",
);
assert.ok(
  Math.max(...probs) > 0.5 && Math.min(...probs) < 0.01,
  "fixtures must span low and high confidence",
);

// Probability must be monotone in the score.
assert.ok(
  probeSuccessProbability(ev(5, 5, 8, 10)) >
    probeSuccessProbability(ev(0, 5, 0, 10)),
  "P(pass) must increase with the measured rate",
);
// Extreme inputs must not produce NaN.
for (const e of [ev(0, 0, 0, 0), ev(0, 1e9, 0, 1e9), ev(1e9, 1e9, 1e9, 1e9)]) {
  const p = probeSuccessProbability(e);
  assert.ok(Number.isFinite(p) && p >= 0 && p <= 1, `bad probability ${p}`);
}

// ─── fitPlatt ────────────────────────────────────────────────────────────────
// Degenerate windows return undefined so the caller keeps its previous
// parameters instead of adopting an invented calibration.
assert.equal(fitPlatt([]), undefined, "empty window -> undefined");
assert.equal(
  fitPlatt([{ logit: 1, passed: true }]),
  undefined,
  "single observation -> undefined",
);
assert.equal(
  fitPlatt([
    { logit: 1, passed: true },
    { logit: 2, passed: true },
  ]),
  undefined,
  "all-pass window -> undefined",
);
assert.equal(
  fitPlatt([
    { logit: 1, passed: false },
    { logit: 2, passed: false },
  ]),
  undefined,
  "all-fail window -> undefined",
);

const separable = [-3, -2, -1, 1, 2, 3].map((z) => ({
  logit: z,
  passed: z > 0,
}));
const fitted = fitPlatt(separable);
assert.ok(fitted, "separable window must fit");
assert.ok(fitted.a > 0, `slope must be positive, got ${fitted.a}`);
const at = (z: number) => 1 / (1 + Math.exp(-(fitted.a * z + fitted.b)));
assert.ok(at(2) > at(-2), "mapping must increase with the logit");
assert.ok(at(3) > 0.5 && at(-3) < 0.5, "sign of the logit must be preserved");

// Recalibration must react to a base-rate shift — this is the whole reason the
// calibrator is refit on a rolling window.
const mostlyFailing = [
  { logit: -3, passed: false },
  { logit: -2, passed: false },
  { logit: -1, passed: false },
  { logit: 1, passed: false },
  { logit: 2, passed: false },
  { logit: 3, passed: true },
];
const shifted = fitPlatt(mostlyFailing);
assert.ok(shifted, "shifted window must fit");
const atShifted = (z: number) =>
  1 / (1 + Math.exp(-(shifted.a * z + shifted.b)));
assert.ok(
  atShifted(1) < at(1),
  "a lower-pass-rate window must lower P(pass) at the same logit",
);

// ─── rocAuc ──────────────────────────────────────────────────────────────────
assert.equal(rocAuc([1, 2, 3, 4], [false, false, true, true]), 1, "separable -> 1");
assert.equal(rocAuc([1, 2, 3, 4], [true, true, false, false]), 0, "inverted -> 0");
assert.equal(
  rocAuc([1, 2, 3, 4], [false, true, false, true]),
  0.75,
  "interleaved -> 0.75",
);
assert.equal(rocAuc([1, 1], [true, false]), 0.5, "all-tied -> 0.5");
assert.equal(rocAuc([1, 1, 1, 1], [true, false, true, false]), 0.5);
// Undefined rather than a placeholder when AUC is not defined.
assert.equal(rocAuc([1, 2], [true, true]), undefined, "one class -> undefined");
assert.equal(rocAuc([], []), undefined, "empty -> undefined");
assert.equal(rocAuc([1, 2], [true]), undefined, "length mismatch -> undefined");

// ─── brierScore ──────────────────────────────────────────────────────────────
assert.equal(brierScore([1, 0], [true, false]), 0, "perfect -> 0");
assert.equal(brierScore([0, 1], [true, false]), 1, "inverted -> 1");
assert.equal(brierScore([0.5, 0.5], [true, false]), 0.25, "uninformative -> 0.25");
assert.equal(brierScore([], []), undefined, "empty -> undefined");
assert.equal(brierScore([0.5], [true, false]), undefined, "mismatch -> undefined");

// ─── shipped metrics must clear the bar they claim ───────────────────────────
// Guards against silently shipping a regressed retrain.
const m = PROBE_SUCCESS_MODEL.metrics as Record<string, number>;
assert.ok(m.ranking_auc >= 0.8, `ranking AUC ${m.ranking_auc} must be >= 0.80`);
assert.ok(
  m.prequential_auc >= 0.8,
  `prequential AUC ${m.prequential_auc} must be >= 0.80`,
);
assert.ok(
  m.brier < m.brier_base_rate_predictor,
  `Brier ${m.brier} must beat the base-rate predictor ${m.brier_base_rate_predictor}`,
);
// The model only earns its place by beating the signal the router uses today.
assert.ok(
  m.ranking_auc > m.baseline_incumbent_3bucket_availability_auc + 0.05,
  "must beat the incumbent 3-bucket availability signal by >0.05 AUC",
);
// ...and by beating either measured rate alone, else ship the simpler thing.
assert.ok(
  m.ranking_auc > m.baseline_smoke_rate_only_auc &&
    m.ranking_auc > m.baseline_agent_rate_only_auc,
  "averaging must beat both single rates, else use the single rate",
);
assert.ok(
  m.top10_live_recall > m.top10_random_recall * 5,
  "top-10 recall must beat random by >5x to justify the model",
);
assert.ok(m.test_positives >= 100, "held-out positives must support the estimate");
assert.ok(
  CALIBRATION_WINDOW > 0 && CALIBRATION_REFIT_EVERY > 0,
  "calibration schedule must be positive",
);
assert.ok(
  BOOTSTRAP_PLATT.a > 0,
  "bootstrap calibration must be monotone increasing",
);

console.log(
  `probe-success-core.test.ts: all assertions passed ` +
    `(ranking AUC ${m.ranking_auc}, prequential AUC ${m.prequential_auc}, ` +
    `Brier ${m.brier} vs ${m.brier_base_rate_predictor} base-rate, ` +
    `top-10 recall ${m.top10_live_recall} vs ${m.top10_random_recall} random, ` +
    `incumbent signal ${m.baseline_incumbent_3bucket_availability_auc})`,
);
