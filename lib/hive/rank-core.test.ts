import assert from "node:assert/strict";
import {
  priceScore,
  rankAgents4D,
  reputationScore,
  type RankCandidate,
} from "./rank-core";

// ─── reputationScore ───────────────────────────────────────────────────────
// Perfect dims -> 1.0.
assert.equal(
  reputationScore({ reliability: 1, quality: 1, safety: 1, speed: 1 }),
  1,
  "all-perfect reputation dims -> 1.0",
);
// Zero dims -> 0.0.
assert.equal(
  reputationScore({ reliability: 0, quality: 0, safety: 0, speed: 0 }),
  0,
  "all-zero reputation dims -> 0.0",
);
// Out-of-range inputs are clamped, not propagated.
assert.equal(
  reputationScore({ reliability: 2, quality: -1, safety: 1, speed: 1 }),
  reputationScore({ reliability: 1, quality: 0, safety: 1, speed: 1 }),
  "out-of-range dims must clamp to [0,1]",
);

// ─── priceScore ────────────────────────────────────────────────────────────
// Free (<=0) is best possible score.
assert.equal(priceScore(0), 1, "price 0 -> best score 1.0");
assert.equal(priceScore(-5), 1, "negative price -> best score 1.0 (no div-by-zero)");
// Price at the reference point scores 0.5.
assert.equal(priceScore(0.5, 0.5), 0.5, "price == reference -> 0.5");
// Cheaper than reference scores higher than more expensive.
assert.ok(
  priceScore(0.1, 0.5) > priceScore(1, 0.5),
  "cheaper price must score higher",
);
// Score is always within [0, 1] even for huge prices.
assert.ok(priceScore(1_000_000) > 0 && priceScore(1_000_000) < 0.01, "huge price -> near 0, never negative");
// NaN/invalid guarded.
assert.equal(priceScore(NaN), 1, "NaN price falls back to free/best score");

// ─── rankAgents4D ──────────────────────────────────────────────────────────
function mk(
  agent_id: string,
  similarity: number,
  reputation: RankCandidate["reputation"],
  price: number,
  availability: number,
): RankCandidate {
  return { agent_id, similarity, reputation, price, availability };
}

const perfectRep = { reliability: 1, quality: 1, safety: 1, speed: 1 };
const poorRep = { reliability: 0.1, quality: 0.1, safety: 0.5, speed: 0.1 };

// Best on every dimension must rank first.
{
  const ranked = rankAgents4D([
    mk("weak", 0.2, poorRep, 5, 0.1),
    mk("strong", 0.9, perfectRep, 0.1, 1.0),
    mk("mid", 0.5, { reliability: 0.5, quality: 0.5, safety: 0.5, speed: 0.5 }, 1, 0.5),
  ]);
  assert.equal(ranked[0].candidate.agent_id, "strong", "dominant candidate ranks first");
  assert.equal(ranked[2].candidate.agent_id, "weak", "dominated candidate ranks last");
  assert.ok(ranked[0].rank_score > ranked[1].rank_score);
  assert.ok(ranked[1].rank_score > ranked[2].rank_score);
}

// Every sub-score and the blend are clamped into [0, 1].
{
  const ranked = rankAgents4D([mk("a", 5, perfectRep, -10, 2)]);
  const r = ranked[0];
  for (const v of [r.rank_score, r.capability_score, r.reputation_score, r.price_score, r.availability_score]) {
    assert.ok(v >= 0 && v <= 1, `score ${v} must be clamped to [0,1]`);
  }
}

// Deterministic: identical candidates preserve input order (stable tie-break).
{
  const a = mk("a", 0.5, perfectRep, 1, 0.5);
  const b = mk("b", 0.5, perfectRep, 1, 0.5);
  const ranked = rankAgents4D([a, b]);
  assert.equal(ranked[0].candidate.agent_id, "a", "tie -> input order preserved");
  assert.equal(ranked[1].candidate.agent_id, "b", "tie -> input order preserved");
}

// Cheaper price wins when all else is equal.
{
  const ranked = rankAgents4D([
    mk("expensive", 0.7, perfectRep, 10, 0.8),
    mk("cheap", 0.7, perfectRep, 0.05, 0.8),
  ]);
  assert.equal(ranked[0].candidate.agent_id, "cheap", "cheaper price must win, all else equal");
}

// Custom weights are honored (and normalized if they do not sum to 1).
{
  const capabilityOnly = rankAgents4D(
    [
      mk("high-sim-low-rep", 0.95, poorRep, 5, 0.2),
      mk("low-sim-high-rep", 0.2, perfectRep, 0.05, 1.0),
    ],
    { weights: { capability: 1, reputation: 0, price: 0, availability: 0 } },
  );
  assert.equal(
    capabilityOnly[0].candidate.agent_id,
    "high-sim-low-rep",
    "capability-only weighting must favor pure similarity",
  );
}

// Empty input -> empty output, no throw.
assert.deepEqual(rankAgents4D([]), [], "empty candidate list -> empty result");

console.log("rank-core tests passed");
