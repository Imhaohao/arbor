import assert from "node:assert/strict";
import {
  BETA_TIERS,
  TRILEMMA_MINIMUMS,
  accuracyPerThinkingToken,
  assessTrilemmaReadiness,
  bidUtility,
  costCoverageCurve,
  dominates,
  justifiesMultiAgent,
  marginalGain,
  normalizeCost,
  oracleDistance,
  paddedAucc,
  paretoFrontier,
  paretoBidScore,
  shouldEscalate,
  summarizeMarginalGain,
  sweepBeta,
  type TrilemmaPoint,
} from "./pareto-core";

// ─── bidUtility / normalizeCost ─────────────────────────────────────────────

// Free work at full confidence is worth exactly 1 whatever beta is.
assert.equal(bidUtility({ confidence: 1, normalized_cost: 0, beta: 0.25 }), 1);
// The cost term is beta * normalized_cost, linear and exact.
assert.equal(bidUtility({ confidence: 1, normalized_cost: 1, beta: 0.25 }), 0.75);
assert.equal(bidUtility({ confidence: 1, normalized_cost: 1, beta: 0.1 }), 0.9);
// At the quality-first tier cost is a tie-breaker: it cannot flip a 0.1
// confidence gap.
{
  const cheapWeak = bidUtility({
    confidence: 0.8,
    normalized_cost: 0,
    beta: BETA_TIERS.quality_first,
  });
  const dearStrong = bidUtility({
    confidence: 0.9,
    normalized_cost: 1,
    beta: BETA_TIERS.quality_first,
  });
  assert.ok(dearStrong > cheapWeak, "quality-first must not trade quality for price");
}
// At the cost-efficient tier the same gap does flip.
{
  const cheapWeak = bidUtility({
    confidence: 0.8,
    normalized_cost: 0,
    beta: BETA_TIERS.cost_efficient,
  });
  const dearStrong = bidUtility({
    confidence: 0.9,
    normalized_cost: 1,
    beta: BETA_TIERS.cost_efficient,
  });
  assert.ok(cheapWeak > dearStrong, "cost-efficient must prefer the cheap bid here");
}
// gamma sharpens the confidence preference.
assert.ok(
  bidUtility({ confidence: 0.5, normalized_cost: 0, gamma: 2 }) <
    bidUtility({ confidence: 0.5, normalized_cost: 0, gamma: 1 }),
);
// Utility is deliberately NOT clamped at 0 — an expensive hopeless bid must
// still be orderable against a slightly less hopeless one.
assert.ok(bidUtility({ confidence: 0, normalized_cost: 1, beta: 0.25 }) < 0);

assert.equal(normalizeCost(0.25, 1), 0.25);
assert.equal(normalizeCost(0, 1), 0); // free
assert.equal(normalizeCost(-5, 1), 0);
assert.equal(normalizeCost(5, 1), 1); // saturates rather than dominating a sweep
assert.equal(normalizeCost(0.5, 0), 1); // no budget: everything is maximally dear

// ─── paretoBidScore ─────────────────────────────────────────────────────────

// The demo-lane sign trap: utility goes negative for a hopeless bid, so a
// weight applied to the SCORE would make the penalty a promotion. Applying it
// to the quality term keeps a demo-lane bid strictly below a live one.
{
  const live = paretoBidScore({
    reputation: 0.6,
    p_accept: 0.5,
    tier_weight: 1.0,
    semantic_weight: 1,
    price: 0.9,
    budget: 1,
    beta: BETA_TIERS.cost_efficient,
  });
  const demo = paretoBidScore({
    reputation: 0.6,
    p_accept: 0.5,
    tier_weight: 0.05,
    semantic_weight: 1,
    price: 0.9,
    budget: 1,
    beta: BETA_TIERS.cost_efficient,
  });
  assert.ok(demo < 0, "an expensive demo-lane bid should be worth less than nothing");
  assert.ok(live > demo, "the demo-lane weight must not promote a bid");
}
// An unverified bid (tier weight 0) scores purely as wasted spend.
assert.equal(
  paretoBidScore({
    reputation: 1,
    p_accept: 1,
    tier_weight: 0,
    semantic_weight: 1,
    price: 1,
    budget: 1,
    beta: 0.25,
  }),
  -0.25,
);
// Free work from a perfect agent tops out at 1.
assert.equal(
  paretoBidScore({
    reputation: 1,
    p_accept: 1,
    tier_weight: 1,
    semantic_weight: 1,
    price: 0,
    budget: 1,
  }),
  1,
);
// Shortlist position discounts quality, never inverts it.
{
  const first = paretoBidScore({
    reputation: 0.7, p_accept: 0.7, tier_weight: 1, semantic_weight: 1,
    price: 0.1, budget: 1,
  });
  const fourth = paretoBidScore({
    reputation: 0.7, p_accept: 0.7, tier_weight: 1, semantic_weight: 0.25,
    price: 0.1, budget: 1,
  });
  assert.ok(first > fourth);
}

// ─── marginal gain ──────────────────────────────────────────────────────────

assert.equal(
  marginalGain({
    query_id: "q",
    small_quality: 0.4,
    large_quality: 0.9,
    small_cost: 0.01,
    large_cost: 0.2,
  }),
  0.5,
);
// The expensive model is sometimes worse, and that must survive as a negative.
assert.equal(
  marginalGain({
    query_id: "q",
    small_quality: 0.9,
    large_quality: 0.4,
    small_cost: 0.01,
    large_cost: 0.2,
  }),
  -0.5,
);

// Escalation compares predicted gain against the EXTRA normalized spend.
assert.equal(
  shouldEscalate({
    predicted_gain: 0.3,
    small_cost: 0.1,
    large_cost: 1.0,
    budget: 1.0,
    beta: BETA_TIERS.balanced,
  }),
  true,
);
// A tiny predicted gain does not justify a big jump at the cost-efficient tier.
assert.equal(
  shouldEscalate({
    predicted_gain: 0.05,
    small_cost: 0.1,
    large_cost: 1.0,
    budget: 1.0,
    beta: BETA_TIERS.cost_efficient,
  }),
  false,
);
// ...but does at the quality-first tier, where cost barely registers.
assert.equal(
  shouldEscalate({
    predicted_gain: 0.05,
    small_cost: 0.1,
    large_cost: 1.0,
    budget: 1.0,
    beta: BETA_TIERS.quality_first,
  }),
  true,
);

// The hopeless case: both candidates fail, so escalating buys nothing. This is
// the distinction that routing on predicted DIFFICULTY gets wrong.
{
  const summary = summarizeMarginalGain([
    { query_id: "easy", small_quality: 0.9, large_quality: 0.92, small_cost: 0.01, large_cost: 0.2 },
    { query_id: "worth-it", small_quality: 0.3, large_quality: 0.9, small_cost: 0.01, large_cost: 0.2 },
    { query_id: "hopeless", small_quality: 0.1, large_quality: 0.15, small_cost: 0.01, large_cost: 0.2 },
  ]);
  assert.equal(summary.n, 3);
  assert.equal(summary.hopeless_share, round6(1 / 3));
  assert.equal(summary.positive_gain_share, 1);
  assert.ok(summary.mean_gain > 0);
  // 3 x $0.19 extra spend divided by 0.67 total quality gained.
  assert.ok(summary.cost_per_gain > 0 && Number.isFinite(summary.cost_per_gain));
}
// A corpus that gained nothing reports infinite cost-per-gain rather than a
// divide-by-zero that reads as "free".
{
  const summary = summarizeMarginalGain([
    { query_id: "a", small_quality: 0.5, large_quality: 0.5, small_cost: 0.01, large_cost: 0.2 },
  ]);
  assert.equal(summary.cost_per_gain, Number.POSITIVE_INFINITY);
}
assert.equal(summarizeMarginalGain([]).n, 0);

// ─── accuracy per thinking token ────────────────────────────────────────────

assert.equal(
  accuracyPerThinkingToken({ label: "x", accuracy: 0.8, total_tokens: 1000 }),
  0.8,
);
assert.equal(
  accuracyPerThinkingToken({ label: "x", accuracy: 0.8, total_tokens: 0 }),
  0,
);

// A DAG that wins on accuracy while burning 4x the tokens has proved nothing:
// the single agent was never given the same budget.
{
  const verdict = justifiesMultiAgent({
    multi_agent: { label: "dag", accuracy: 0.85, total_tokens: 40000 },
    single_agent: { label: "single", accuracy: 0.8, total_tokens: 10000 },
  });
  assert.equal(verdict.verdict, "unmatched_budgets");
  assert.equal(verdict.token_ratio, 4);
  assert.equal(verdict.accuracy_delta, round6(0.05));
}
// Matched budgets, multi-agent genuinely ahead.
{
  const verdict = justifiesMultiAgent({
    multi_agent: { label: "dag", accuracy: 0.85, total_tokens: 10000 },
    single_agent: { label: "single", accuracy: 0.8, total_tokens: 10000 },
  });
  assert.equal(verdict.verdict, "multi_agent_justified");
  assert.ok(verdict.multi_apt > verdict.single_apt);
}
// Matched budgets, the single pass wins — the overhead was not earned back.
{
  const verdict = justifiesMultiAgent({
    multi_agent: { label: "dag", accuracy: 0.7, total_tokens: 11000 },
    single_agent: { label: "single", accuracy: 0.8, total_tokens: 10000 },
  });
  assert.equal(verdict.verdict, "single_agent_better");
}
// A zero-token single-agent arm is void, not an automatic multi-agent win.
{
  const verdict = justifiesMultiAgent({
    multi_agent: { label: "dag", accuracy: 0.7, total_tokens: 1000 },
    single_agent: { label: "single", accuracy: 0.8, total_tokens: 0 },
  });
  assert.equal(verdict.verdict, "unmatched_budgets");
}

// ─── cost-coverage curve / P-AUCCC / oracle distance ────────────────────────

// Points a rational operator would never pick (more money, less accuracy) are
// dropped by the running maximum.
{
  const curve = costCoverageCurve([
    { cost: 0.1, accuracy: 0.5 },
    { cost: 0.2, accuracy: 0.4 },
    { cost: 0.3, accuracy: 0.7 },
  ]);
  assert.deepEqual(curve, [
    { cost: 0.1, accuracy: 0.5 },
    { cost: 0.3, accuracy: 0.7 },
  ]);
}

// Hand-computed: accuracy 0 up to $0.50, then 0.8 from $0.50 to $1.00.
// area = 0.5*0 + 0.5*0.8 = 0.4; normalized by max_budget 1.0 -> 0.4.
assert.equal(paddedAucc([{ cost: 0.5, accuracy: 0.8 }], 1.0), 0.4);
// The padding is the point: a router that stops spending at $0.50 keeps
// delivering 0.8 up to the budget ceiling and must not be scored as if it
// collapsed to zero.
assert.equal(paddedAucc([{ cost: 0.5, accuracy: 0.8 }], 2.0), round6(1.5 * 0.8 / 2.0));
// A cheaper router reaching the same accuracy sooner scores strictly higher.
assert.ok(
  paddedAucc([{ cost: 0.2, accuracy: 0.8 }], 1.0) >
    paddedAucc([{ cost: 0.5, accuracy: 0.8 }], 1.0),
);
assert.equal(paddedAucc([], 1.0), 0);
assert.equal(paddedAucc([{ cost: 0.5, accuracy: 0.8 }], 0), 0);

// A router that matches the oracle everywhere is at distance 0.
{
  const curve = [
    { cost: 0.2, accuracy: 0.6 },
    { cost: 0.6, accuracy: 0.9 },
  ];
  assert.equal(oracleDistance({ router: curve, oracle: curve, max_budget: 1 }), 0);
}
// A router that never reaches the oracle's accuracy carries a positive distance.
{
  const d = oracleDistance({
    router: [{ cost: 0.2, accuracy: 0.5 }],
    oracle: [{ cost: 0.2, accuracy: 0.9 }],
    max_budget: 1,
    samples: 10,
  });
  assert.ok(d > 0.3 && d <= 0.4, `expected ~0.4 shortfall, got ${d}`);
}

// ─── Pareto frontier ────────────────────────────────────────────────────────

const P = (
  label: string,
  accuracy: number,
  cost: number,
  latency_seconds: number,
): TrilemmaPoint => ({ label, accuracy, cost, latency_seconds });

// Better on every axis.
assert.equal(dominates(P("a", 0.9, 0.1, 1), P("b", 0.8, 0.2, 2)), true);
assert.equal(dominates(P("b", 0.8, 0.2, 2), P("a", 0.9, 0.1, 1)), false);
// Identical points do not dominate each other — nothing is strictly better.
assert.equal(dominates(P("a", 0.9, 0.1, 1), P("a2", 0.9, 0.1, 1)), false);
// Trading accuracy for latency is not domination; both stay on the frontier.
assert.equal(dominates(P("fast", 0.7, 0.1, 1), P("good", 0.9, 0.1, 5)), false);

{
  const frontier = paretoFrontier([
    P("best-quality", 0.95, 0.9, 10),
    P("balanced", 0.85, 0.3, 4),
    P("cheap-fast", 0.6, 0.05, 1),
    P("dominated", 0.6, 0.4, 8), // worse than balanced on every axis
  ]);
  const labels = frontier.map((p) => p.label);
  assert.deepEqual(labels, ["best-quality", "balanced", "cheap-fast"]);
  assert.ok(!labels.includes("dominated"));
}

// ─── beta sweep ─────────────────────────────────────────────────────────────

{
  const candidates = [
    { agent: "frontier", confidence: 0.92, cost: 1.0 },
    { agent: "mid", confidence: 0.8, cost: 0.3 },
    { agent: "cheap", confidence: 0.7, cost: 0.02 },
  ];
  const sweep = sweepBeta(candidates, 1.0, [
    BETA_TIERS.quality_first,
    BETA_TIERS.balanced,
    BETA_TIERS.cost_efficient,
  ]);
  // Quality-first buys the frontier agent; raising beta walks down the curve.
  assert.equal(sweep[0].winner?.agent, "frontier");
  assert.equal(sweep[2].winner?.agent, "mid");
  // Utility falls monotonically as cost is penalized harder.
  assert.ok(sweep[0].utility >= sweep[1].utility);
  assert.ok(sweep[1].utility >= sweep[2].utility);
}
// An empty field yields no winner rather than a fabricated one.
assert.equal(sweepBeta([], 1.0)[0].winner, undefined);

// ─── readiness ──────────────────────────────────────────────────────────────

{
  // The live Arbor corpus as measured on 2026-07-30.
  const report = assessTrilemmaReadiness({
    comparable_pairs: 20,
    matched_budget_runs: 0,
    cost_accuracy_points: 0,
    labelled_bids: 0,
  });
  const by = new Map(report.map((r) => [r.metric, r]));
  assert.equal(by.get("marginal_gain")!.readiness, "underpowered");
  assert.equal(
    by.get("marginal_gain")!.shortfall,
    TRILEMMA_MINIMUMS.comparable_pairs - 20,
  );
  assert.equal(by.get("accuracy_per_thinking_token")!.readiness, "no_data");
  assert.equal(by.get("padded_aucc")!.readiness, "no_data");
  assert.equal(by.get("beta_tuning")!.readiness, "no_data");
}
{
  const report = assessTrilemmaReadiness({
    comparable_pairs: 900,
    matched_budget_runs: 150,
    cost_accuracy_points: 80,
    labelled_bids: 400,
  });
  assert.ok(report.every((r) => r.readiness === "ready"));
  assert.ok(report.every((r) => r.shortfall === 0));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

console.log("pareto-core.test.ts: all assertions passed");
