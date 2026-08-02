import assert from "node:assert/strict";
import {
  ENCODER_HEAD_MODEL,
  ENCODER_VECTOR_DIMS,
  MIN_EVIDENCE_FOR_MEASURED_HEAD,
  buildAgentDescriptor,
  encoderColdStartLogit,
  encoderColdStartScore,
  hasMeasuredEvidence,
  rankWithHeads,
  selectCandidateScore,
  type ScoredCandidate,
} from "./encoder-head-core";

// ─── buildAgentDescriptor ────────────────────────────────────────────────────
// Byte-stability matters: the trained head was fit on this exact serialization,
// so field order and separator are part of the model contract.
assert.equal(
  buildAgentDescriptor({
    agent_id: "korean-news-agent",
    capabilities: ["summarize sources", "translate"],
    one_liner: "Korean news digest",
    task_class: "extraction",
    transport: "a2a",
  }),
  "korean news agent . summarize sources translate . Korean news digest . extraction . a2a",
);
// Empty and missing fields collapse rather than leaving empty separators.
assert.equal(buildAgentDescriptor({ agent_id: "solo" }), "solo");
assert.equal(
  buildAgentDescriptor({ agent_id: "a-b", capabilities: [], one_liner: "  " }),
  "a b",
);
// Truncated to the length the encoder was fed.
const long = buildAgentDescriptor({
  agent_id: "x",
  one_liner: "y".repeat(5000),
});
assert.ok(long.length <= 1000, `descriptor must be clamped, got ${long.length}`);

// ─── parity with the validated offline head ──────────────────────────────────
interface Fixture {
  agent_id: string;
  vector: number[];
  expected_logit: number;
  expected_probability: number;
}
const fixtures = (ENCODER_HEAD_MODEL as unknown as { fixtures: Fixture[] })
  .fixtures;
assert.ok(fixtures.length >= 4, "model must ship parity fixtures");
for (const [i, f] of fixtures.entries()) {
  assert.equal(
    f.vector.length,
    ENCODER_VECTOR_DIMS,
    `fixture ${i} vector width must match pca_dims`,
  );
  const z = encoderColdStartLogit(f.vector);
  assert.ok(
    Math.abs(z - f.expected_logit) < 1e-6,
    `fixture ${i} logit: TS ${z} !== offline ${f.expected_logit}`,
  );
  const p = encoderColdStartScore(f.vector);
  assert.ok(
    Math.abs(p - f.expected_probability) < 1e-6,
    `fixture ${i} probability: TS ${p} !== offline ${f.expected_probability}`,
  );
}
// The head must actually separate candidates — a constant output would leave
// cold agents in arbitrary order, which is the bug this exists to fix.
const probs = fixtures.map((f) => f.expected_probability);
assert.ok(
  Math.max(...probs) - Math.min(...probs) > 0.3,
  "fixtures must span a usable ranking range",
);
assert.ok(
  probs.every((p) => p > 0 && p < 1),
  "probabilities must be strictly inside (0,1)",
);
// Monotone in the logit.
const sorted = [...fixtures].sort((a, b) => a.expected_logit - b.expected_logit);
for (let i = 1; i < sorted.length; i += 1) {
  assert.ok(
    sorted[i].expected_probability >= sorted[i - 1].expected_probability,
    "probability must be monotone in the logit",
  );
}

// ─── input validation ────────────────────────────────────────────────────────
// A raw 384-dim embedding must be rejected, not silently scored.
assert.throws(
  () => encoderColdStartLogit(new Array(384).fill(0.1)),
  /expects a \d+-dim vector/,
  "wrong width must throw",
);
assert.throws(() => encoderColdStartLogit([]), /expects a \d+-dim vector/);
const withNaN = new Array(ENCODER_VECTOR_DIMS).fill(0);
withNaN[2] = NaN;
assert.throws(
  () => encoderColdStartLogit(withNaN),
  /not finite/,
  "NaN component must throw rather than produce a NaN score",
);
// Extreme but finite input stays in range.
const extreme = new Array(ENCODER_VECTOR_DIMS).fill(1e6);
const extremeP = encoderColdStartScore(extreme);
assert.ok(
  Number.isFinite(extremeP) && extremeP >= 0 && extremeP <= 1,
  `extreme input produced ${extremeP}`,
);

// ─── evidence gating ─────────────────────────────────────────────────────────
assert.equal(hasMeasuredEvidence({ smoke_runs: 0, probe_attempts: 0 }), false);
assert.equal(
  hasMeasuredEvidence({ smoke_runs: 1, probe_attempts: 0 }),
  MIN_EVIDENCE_FOR_MEASURED_HEAD <= 1,
  "a single observation should not outrank the encoder unless the threshold is 1",
);
assert.equal(hasMeasuredEvidence({ smoke_runs: 1, probe_attempts: 1 }), true);
assert.equal(hasMeasuredEvidence({ smoke_runs: 5, probe_attempts: 0 }), true);
// Negative counts must not satisfy the gate.
assert.equal(
  hasMeasuredEvidence({ smoke_runs: -10, probe_attempts: 1 }),
  false,
  "negative counts must not be credited",
);

// ─── selectCandidateScore ────────────────────────────────────────────────────
const vec = fixtures[fixtures.length - 1].vector;

// With evidence, the measured head wins even when a vector exists — it is the
// strictly better predictor there (0.9590 vs 0.9458).
const withHistory = selectCandidateScore({
  evidence: { smoke_runs: 3, probe_attempts: 5 },
  measuredScore: 0.42,
  encoderVector: vec,
  prior: 0.0626,
});
assert.equal(withHistory.head, "measured");
assert.equal(withHistory.score, 0.42);

// With no evidence but a vector, the encoder takes over.
const cold = selectCandidateScore({
  evidence: { smoke_runs: 0, probe_attempts: 0 },
  measuredScore: 0.0626,
  encoderVector: vec,
  prior: 0.0626,
});
assert.equal(cold.head, "encoder");
assert.ok(
  Math.abs(cold.score - fixtures[fixtures.length - 1].expected_probability) < 1e-6,
  "cold-start path must route through the encoder head",
);
assert.notEqual(
  cold.score,
  0.0626,
  "a cold agent must not fall back to the flat prior when a vector exists",
);

// With neither, fall back to the prior and say so.
const blind = selectCandidateScore({
  evidence: { smoke_runs: 0, probe_attempts: 0 },
  measuredScore: 0.0626,
  prior: 0.0626,
});
assert.equal(blind.head, "prior");
assert.equal(blind.score, 0.0626);
// An empty vector counts as absent rather than throwing.
assert.equal(
  selectCandidateScore({
    evidence: { smoke_runs: 0, probe_attempts: 0 },
    measuredScore: 0.0626,
    encoderVector: [],
    prior: 0.0626,
  }).head,
  "prior",
);

// ─── rankWithHeads ───────────────────────────────────────────────────────────
// Measured-evidence agents come first, then encoder-scored cold agents, then
// blind ones — regardless of raw score, because the scales are not comparable.
const mk = (id: string, head: ScoredCandidate["head"], score: number) => ({
  candidate: id,
  scored: { head, score },
});
const ranked = rankWithHeads([
  mk("cold-high", "encoder", 0.92),
  mk("blind", "prior", 0.99),
  mk("measured-low", "measured", 0.10),
  mk("cold-low", "encoder", 0.11),
  mk("measured-high", "measured", 0.80),
]);
assert.deepEqual(
  ranked.map((r) => r.candidate),
  ["measured-high", "measured-low", "cold-high", "cold-low", "blind"],
  "tiers must dominate raw score across heads",
);
// A high-scoring blind candidate must never outrank a real signal.
assert.equal(ranked[ranked.length - 1].candidate, "blind");
// Ties keep input order (deterministic routing).
const tied = rankWithHeads([
  mk("first", "encoder", 0.5),
  mk("second", "encoder", 0.5),
]);
assert.deepEqual(tied.map((t) => t.candidate), ["first", "second"]);
assert.deepEqual(rankWithHeads([]), [], "empty shortlist is fine");

// ─── shipped metrics must back the claims in the file header ─────────────────
const m = ENCODER_HEAD_MODEL.metrics as Record<string, number | string>;
assert.ok(
  (m.coldstart_family_holdout_auc as number) >= 0.8,
  `family-holdout AUC ${m.coldstart_family_holdout_auc} must be >= 0.80`,
);
assert.ok(
  (m.temporal_auc as number) >= 0.8,
  `temporal AUC ${m.temporal_auc} must be >= 0.80`,
);
// The family holdout is the strict test; it must not be wildly better than the
// random-agent split, which would mean the split leaked template families.
assert.ok(
  (m.coldstart_family_holdout_auc as number) <=
    (m.coldstart_random_agent_holdout_auc as number) + 0.02,
  "family holdout beating the random split would indicate a leaky comparison",
);
// Honesty guard: this head must NOT be claimed to beat the measured-rate head.
assert.ok(
  (m.encoder_plus_measured_rate_auc as number) <
    (m.measured_rate_head_auc as number),
  "recorded metrics must keep the encoder in its cold-start lane",
);
assert.equal(ENCODER_HEAD_MODEL.encoder.cost_usd_per_call, 0, "encoder must be free");

console.log(
  `encoder-head-core.test.ts: all assertions passed ` +
    `(cold-start family-holdout AUC ${m.coldstart_family_holdout_auc}, ` +
    `temporal AUC ${m.temporal_auc}, encoder=${ENCODER_HEAD_MODEL.encoder.model} ` +
    `@ $${ENCODER_HEAD_MODEL.encoder.cost_usd_per_call}/call)`,
);
