// Agent System Trilemma: Pareto efficiency across performance (accuracy), cost
// (monetary spend), and efficiency (latency / wall-clock). Pure helpers, no
// Convex, no I/O — exercised in pareto-core.test.ts.
//
// Arbor's existing auction ranks bids by `reputation x calibrated P(accept) /
// price` (lib/bid-calibration.ts). That ratio has no operating point: it bakes
// one implicit exchange rate between quality and money and offers no knob to
// move along the trade-off. You cannot trace a frontier with it, so you cannot
// tell whether the marketplace is Pareto-efficient or merely consistent.
//
// This module replaces the ratio with an explicit utility carrying a tunable
// cost sensitivity (beta), and adds the four measurements that make the
// trade-off legible:
//
//   1. bidUtility          — confidence^gamma - beta * normalized_cost
//   2. marginalGain        — quality(expensive) - quality(cheap), per query
//   3. accuracyPerThinkingToken — does the multi-agent DAG beat one strong pass
//   4. paddedAucc / oracleDistance — market-wide router behaviour across budgets
//
// READ THIS BEFORE QUOTING ANY NUMBER THESE FUNCTIONS PRODUCE. Three of the
// four need a query x agent matrix of GRADED outcomes that Arbor does not have.
// The implementations are correct and tested against hand-computed cases, but
// on the live corpus they have almost nothing to consume — `hive_evaluations`
// yields 20 comparable pairs, `llm_usage` is empty, and `golden_task_runs` has
// zero rows. `assessTrilemmaReadiness` reports that gap in numbers rather than
// letting a caller present a metric computed on 20 pairs as a market finding.

/** A single (accuracy, cost, latency) operating point. */
export interface TrilemmaPoint {
  label: string;
  /** Task accuracy or judge-graded quality, 0..1. Higher is better. */
  accuracy: number;
  /** Monetary spend in USD. Lower is better. */
  cost: number;
  /** Wall-clock seconds. Lower is better. */
  latency_seconds: number;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

// ─── 1. Cost sensitivity (beta) ─────────────────────────────────────────────

/**
 * Named operating points on the cost/quality trade-off. These are POLICY
 * settings, not fitted parameters — beta is chosen to meet an SLO, not learned
 * from data. The descriptions record the published behaviour of each tier;
 * Arbor has not reproduced those numbers on its own corpus and must not claim
 * them as measured until `assessTrilemmaReadiness` reports a gradeable battery.
 */
export const BETA_TIERS = {
  /** Cost is a tie-breaker only. */
  quality_first: 0.001,
  /** Reported to hold ~95% of frontier quality for ~35% less spend. */
  balanced: 0.1,
  /** Roughly halves spend for a material accuracy drop. */
  cost_efficient: 0.25,
} as const;

export type BetaTier = keyof typeof BETA_TIERS;

/**
 * Exponent on confidence. gamma > 1 sharpens the preference for high-confidence
 * bids (a 0.9 bid pulls further ahead of a 0.6 one); gamma = 1 is linear.
 */
export const DEFAULT_GAMMA = 1;

export interface BidUtilityInput {
  /** Calibrated P(judge accepts), 0..1 — use blendedAcceptProbability(), not
   * the agent's raw self-report, or the knob rewards confident lying. */
  confidence: number;
  /** Cost mapped to 0..1 against the task budget. See normalizeCost(). */
  normalized_cost: number;
  beta?: number;
  gamma?: number;
}

/**
 * Utility = confidence^gamma - beta * normalized_cost.
 *
 * Linear in cost rather than a ratio: the whole point is that sweeping beta
 * traces the accuracy-cost frontier, and a ratio collapses that family to a
 * single curve. Not clamped to 0..1 — a bid can be worth less than nothing when
 * it is expensive and unlikely to be accepted, and clamping would erase exactly
 * the ordering the auction needs at the bottom of the field.
 */
export function bidUtility(input: BidUtilityInput): number {
  const beta = input.beta ?? BETA_TIERS.balanced;
  const gamma = input.gamma ?? DEFAULT_GAMMA;
  const confidence = clamp01(input.confidence);
  const cost = clamp01(input.normalized_cost);
  return round6(Math.pow(confidence, gamma) - beta * cost);
}

/**
 * Map a price to 0..1 against the task budget. Prices at or above budget
 * saturate at 1 — beyond the budget the bid is inadmissible anyway, and letting
 * normalized cost run past 1 would let one absurd quote dominate the sweep.
 * A non-positive budget yields 0 (free), matching priceScore() in rank-core.
 */
export function normalizeCost(price: number, budget: number): number {
  if (!isFiniteNumber(price) || price <= 0) return 0;
  if (!isFiniteNumber(budget) || budget <= 0) return 1;
  return clamp01(price / budget);
}

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlag(name: string): boolean {
  return TRUE_ENV_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

/** Master switch for the beta-tunable auction score. Default off keeps the
 * live Vickrey ranking byte-for-byte; _DISABLED wins. */
export function paretoBidEnabled(): boolean {
  return !envFlag("ARBOR_PARETO_BID_DISABLED") && envFlag("ARBOR_PARETO_BID_ENABLED");
}

/** Operating point from the environment, defaulting to the balanced tier. */
export function configuredBeta(): number {
  const raw = Number.parseFloat(process.env.ARBOR_PARETO_BETA ?? "");
  return Number.isFinite(raw) && raw >= 0 ? raw : BETA_TIERS.balanced;
}

export function configuredGamma(): number {
  const raw = Number.parseFloat(process.env.ARBOR_PARETO_GAMMA ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GAMMA;
}

/**
 * The auction score in beta-tunable form, replacing the Vickrey ratio
 * `reputation x P(accept) / price`.
 *
 * Why the ratio is not enough: it fixes one exchange rate between quality and
 * money with no way to move along the trade-off, so the marketplace has exactly
 * one operating point and cannot be tuned to an SLO or checked for Pareto
 * efficiency. Sweeping beta over this function traces the frontier the ratio
 * collapses to a point.
 *
 * The tier and semantic discounts multiply the QUALITY term rather than the
 * final score. Applying them to the score would be a sign trap: utility can be
 * negative, and multiplying a negative by the 0.05 demo-lane weight would move
 * that bid UP the ranking, quietly promoting exactly the bids the weight exists
 * to bury.
 */
export function paretoBidScore(args: {
  /** Agent reputation, 0..1. */
  reputation: number;
  /** Calibrated P(judge accepts) — blendedAcceptProbability(), not the raw
   * self-report. */
  p_accept: number;
  /** Transport-tier discount: 1.0 live, 0.05 demo lane, 0 unverified. */
  tier_weight: number;
  /** Shortlist-position discount from invitedSemanticWeight(). */
  semantic_weight: number;
  price: number;
  budget: number;
  beta?: number;
  gamma?: number;
}): number {
  const quality =
    clamp01(args.reputation) *
    clamp01(args.p_accept) *
    clamp01(args.tier_weight) *
    clamp01(args.semantic_weight);
  return bidUtility({
    confidence: quality,
    normalized_cost: normalizeCost(args.price, args.budget),
    beta: args.beta ?? configuredBeta(),
    gamma: args.gamma ?? configuredGamma(),
  });
}

// ─── 2. Marginal gain ───────────────────────────────────────────────────────

export interface MarginalGainObservation {
  query_id: string;
  /** Graded quality of the cheap candidate on this query, 0..1. */
  small_quality: number;
  /** Graded quality of the expensive candidate on the SAME query, 0..1. */
  large_quality: number;
  small_cost: number;
  large_cost: number;
}

/**
 * g = quality(expensive) - quality(cheap) for one query.
 *
 * The reason to route on g rather than on absolute quality: g is near zero both
 * where the cheap model already suffices AND where the query is so hard that
 * both fail. Absolute quality conflates those, and escalating on predicted
 * difficulty burns the budget on the second case, which no amount of money
 * fixes. Negative g is real and kept — the expensive model is sometimes worse.
 */
export function marginalGain(obs: MarginalGainObservation): number {
  return round6(clamp01(obs.large_quality) - clamp01(obs.small_quality));
}

/**
 * Escalate to the expensive candidate only when the predicted gain outweighs
 * the extra spend at the current cost sensitivity. With beta at the
 * quality-first tier almost everything escalates; at the cost-efficient tier
 * only large predicted gains do.
 */
export function shouldEscalate(args: {
  predicted_gain: number;
  small_cost: number;
  large_cost: number;
  budget: number;
  beta?: number;
}): boolean {
  const beta = args.beta ?? BETA_TIERS.balanced;
  const extra =
    normalizeCost(args.large_cost, args.budget) -
    normalizeCost(args.small_cost, args.budget);
  return args.predicted_gain > beta * extra;
}

/**
 * Summarize a marginal-gain corpus. `escalation_worthwhile_share` is the
 * fraction of queries where the expensive candidate actually helped — if that
 * is near zero, the frontier model is being bought for nothing regardless of
 * how good the router is.
 */
export function summarizeMarginalGain(
  observations: MarginalGainObservation[],
): {
  n: number;
  mean_gain: number;
  positive_gain_share: number;
  /** Queries where BOTH candidates scored below 0.5 — hard for everyone, so
   * escalating cannot rescue them. */
  hopeless_share: number;
  /** Mean extra dollars paid per unit of quality actually gained. Infinite when
   * the corpus gained nothing on net. */
  cost_per_gain: number;
} {
  const n = observations.length;
  if (n === 0) {
    return {
      n: 0,
      mean_gain: 0,
      positive_gain_share: 0,
      hopeless_share: 0,
      cost_per_gain: Number.POSITIVE_INFINITY,
    };
  }
  let gainSum = 0;
  let positive = 0;
  let hopeless = 0;
  let extraCost = 0;
  for (const o of observations) {
    const g = marginalGain(o);
    gainSum += g;
    if (g > 0) positive += 1;
    if (clamp01(o.large_quality) < 0.5 && clamp01(o.small_quality) < 0.5) {
      hopeless += 1;
    }
    extraCost += Math.max(0, o.large_cost - o.small_cost);
  }
  return {
    n,
    mean_gain: round6(gainSum / n),
    positive_gain_share: round6(positive / n),
    hopeless_share: round6(hopeless / n),
    cost_per_gain:
      gainSum > 0 ? round6(extraCost / gainSum) : Number.POSITIVE_INFINITY,
  };
}

// ─── 3. Accuracy per thinking token ─────────────────────────────────────────

export interface TokenBudgetRun {
  label: string;
  accuracy: number;
  /** Every token the configuration burned, including inter-agent messages. */
  total_tokens: number;
}

/** Accuracy bought per thousand tokens. Zero tokens yields 0, not Infinity. */
export function accuracyPerThinkingToken(run: TokenBudgetRun): number {
  if (!isFiniteNumber(run.total_tokens) || run.total_tokens <= 0) return 0;
  return round6((clamp01(run.accuracy) * 1000) / run.total_tokens);
}

/**
 * Does the multi-agent system earn its overhead?
 *
 * The comparison must be made at MATCHED total token budgets. A DAG that beats
 * a single pass while spending four times the tokens has demonstrated nothing —
 * the single agent was never given the same budget. Message passing between
 * agents cannot add information (data processing inequality): every hop can
 * only preserve or destroy what the context already contained, so the multi-
 * agent arrangement has to buy back its communication overhead through better
 * search or decomposition, and this is the test of whether it does.
 *
 * `token_ratio` outside [1/tolerance, tolerance] means the budgets were not
 * matched and the verdict is reported as `unmatched_budgets` rather than a
 * win or a loss.
 */
export function justifiesMultiAgent(args: {
  multi_agent: TokenBudgetRun;
  single_agent: TokenBudgetRun;
  /** Allowed ratio between the two token counts before the comparison is void. */
  tolerance?: number;
}): {
  verdict: "multi_agent_justified" | "single_agent_better" | "unmatched_budgets";
  multi_apt: number;
  single_apt: number;
  accuracy_delta: number;
  token_ratio: number;
} {
  const tolerance = args.tolerance ?? 1.25;
  const multiTokens = Math.max(0, args.multi_agent.total_tokens);
  const singleTokens = Math.max(0, args.single_agent.total_tokens);
  const ratio =
    singleTokens > 0 ? multiTokens / singleTokens : Number.POSITIVE_INFINITY;
  const multiApt = accuracyPerThinkingToken(args.multi_agent);
  const singleApt = accuracyPerThinkingToken(args.single_agent);
  const accuracyDelta = round6(
    clamp01(args.multi_agent.accuracy) - clamp01(args.single_agent.accuracy),
  );
  if (!Number.isFinite(ratio) || ratio > tolerance || ratio < 1 / tolerance) {
    return {
      verdict: "unmatched_budgets",
      multi_apt: multiApt,
      single_apt: singleApt,
      accuracy_delta: accuracyDelta,
      token_ratio: round6(ratio),
    };
  }
  return {
    verdict:
      multiApt > singleApt ? "multi_agent_justified" : "single_agent_better",
    multi_apt: multiApt,
    single_apt: singleApt,
    accuracy_delta: accuracyDelta,
    token_ratio: round6(ratio),
  };
}

// ─── 4. Cost-coverage curve, P-AUCCC, oracle distance ───────────────────────

export interface CostAccuracyPoint {
  /** Budget spent, USD. */
  cost: number;
  /** Accuracy achieved at that spend, 0..1. */
  accuracy: number;
}

/**
 * Monotone cost-coverage curve: at each budget, the best accuracy achievable
 * for that spend or less. Sorting and taking a running maximum removes points a
 * rational operator would never choose (paying more for less).
 */
export function costCoverageCurve(
  points: CostAccuracyPoint[],
): CostAccuracyPoint[] {
  const sorted = [...points]
    .filter((p) => isFiniteNumber(p.cost) && isFiniteNumber(p.accuracy))
    .sort((l, r) => l.cost - r.cost);
  const out: CostAccuracyPoint[] = [];
  let best = Number.NEGATIVE_INFINITY;
  for (const p of sorted) {
    if (p.accuracy > best) {
      best = p.accuracy;
      out.push({ cost: p.cost, accuracy: clamp01(p.accuracy) });
    }
  }
  return out;
}

/**
 * Padded area under the cost-coverage curve, normalized to 0..1.
 *
 * The padding is what makes two routers comparable. A router whose curve stops
 * at $0.40 has not failed above $0.40 — it simply never spends more, and it
 * keeps delivering its final accuracy. Without extending ("padding") the curve
 * flat to `max_budget`, a cheap router is silently scored as if its accuracy
 * collapsed to zero past its own range, which rewards profligate routers for
 * nothing. Below the first point the curve is padded with `floor_accuracy`
 * (default 0: no budget, no answer).
 */
export function paddedAucc(
  points: CostAccuracyPoint[],
  maxBudget: number,
  floorAccuracy = 0,
): number {
  if (!isFiniteNumber(maxBudget) || maxBudget <= 0) return 0;
  const curve = costCoverageCurve(points).filter((p) => p.cost <= maxBudget);
  if (curve.length === 0) return round6(clamp01(floorAccuracy));

  let area = 0;
  let prevCost = 0;
  let prevAccuracy = clamp01(floorAccuracy);
  for (const p of curve) {
    // Step function: accuracy holds at the previous level until this budget is
    // reached. A trapezoid would interpolate accuracy the router never had.
    area += (p.cost - prevCost) * prevAccuracy;
    prevCost = p.cost;
    prevAccuracy = p.accuracy;
  }
  area += (maxBudget - prevCost) * prevAccuracy;
  return round6(clamp01(area / maxBudget));
}

/**
 * Mean Euclidean distance from a router's curve to the oracle's, sampled on a
 * uniform budget grid. Zero means the router matches a perfect chooser at every
 * budget. Cost is divided by `max_budget` first so the two axes are on the same
 * scale and the distance is not dominated by whichever unit happens to be
 * larger.
 */
export function oracleDistance(args: {
  router: CostAccuracyPoint[];
  oracle: CostAccuracyPoint[];
  max_budget: number;
  samples?: number;
}): number {
  const samples = Math.max(2, args.samples ?? 50);
  if (!isFiniteNumber(args.max_budget) || args.max_budget <= 0) return 0;
  const router = costCoverageCurve(args.router);
  const oracle = costCoverageCurve(args.oracle);

  const accuracyAt = (curve: CostAccuracyPoint[], budget: number): number => {
    let best = 0;
    for (const p of curve) {
      if (p.cost <= budget) best = p.accuracy;
      else break;
    }
    return best;
  };

  let total = 0;
  for (let i = 0; i < samples; i += 1) {
    const budget = (args.max_budget * (i + 1)) / samples;
    // Both curves are evaluated at the same budget, so the cost axis
    // contributes nothing; the distance is the accuracy shortfall. Kept in
    // Euclidean form so a caller sampling unmatched budgets still gets a
    // meaningful number.
    const da = accuracyAt(oracle, budget) - accuracyAt(router, budget);
    total += Math.sqrt(da * da);
  }
  return round6(total / samples);
}

// ─── Pareto frontier over the three axes ────────────────────────────────────

/** True when `a` is at least as good on every axis and strictly better on one. */
export function dominates(a: TrilemmaPoint, b: TrilemmaPoint): boolean {
  const atLeast =
    a.accuracy >= b.accuracy &&
    a.cost <= b.cost &&
    a.latency_seconds <= b.latency_seconds;
  const strictly =
    a.accuracy > b.accuracy ||
    a.cost < b.cost ||
    a.latency_seconds < b.latency_seconds;
  return atLeast && strictly;
}

/**
 * The non-dominated set: every configuration for which no other configuration
 * is better on one axis without being worse on another. This is the answer to
 * "which settings are worth considering at all" — everything off the frontier
 * is strictly wasteful, whatever the operator's preferences.
 *
 * Returned in input order so a caller can zip against its own list.
 */
export function paretoFrontier(points: TrilemmaPoint[]): TrilemmaPoint[] {
  return points.filter(
    (candidate, i) =>
      !points.some((other, j) => j !== i && dominates(other, candidate)),
  );
}

/**
 * Sweep beta over a set of candidates and report the operating point each tier
 * selects. This is how a beta is chosen for an SLO: run the sweep, look at
 * where the accuracy/cost pair lands, pick the tier that meets the target.
 */
export function sweepBeta<C extends { confidence: number; cost: number }>(
  candidates: C[],
  budget: number,
  betas: number[] = Object.values(BETA_TIERS),
  gamma: number = DEFAULT_GAMMA,
): Array<{ beta: number; winner: C | undefined; utility: number }> {
  return betas.map((beta) => {
    let winner: C | undefined;
    let best = Number.NEGATIVE_INFINITY;
    for (const c of candidates) {
      const u = bidUtility({
        confidence: c.confidence,
        normalized_cost: normalizeCost(c.cost, budget),
        beta,
        gamma,
      });
      if (u > best) {
        best = u;
        winner = c;
      }
    }
    return {
      beta,
      winner,
      utility: winner === undefined ? 0 : round6(best),
    };
  });
}

// ─── Data readiness ─────────────────────────────────────────────────────────

export interface TrilemmaCorpusCounts {
  /** Queries graded on 2+ agents — the crossing marginal gain needs. */
  comparable_pairs: number;
  /** Rows carrying real token counts for both a MAS and a single-agent run. */
  matched_budget_runs: number;
  /** DISTINCT STEPS on the cost-coverage curve, not raw settled rows. Rows that
   * collapse to the same step add no resolution, and a 3-step staircase cannot
   * locate a router against an oracle however many rows produced it. */
  cost_accuracy_points: number;
  /** Settled bids carrying BOTH a calibrated confidence and an outcome. */
  labelled_bids: number;
}

/**
 * What each metric needs before its output means anything.
 *
 * The thresholds are sample-size floors, not aspirations: below them the metric
 * is dominated by noise and reporting it invites a false conclusion. Call this
 * before quoting any number from this module.
 */
export const TRILEMMA_MINIMUMS: TrilemmaCorpusCounts = {
  // 500 queries x 2 candidates is the smallest battery where a per-query gain
  // model has enough signal to beat "always escalate" / "never escalate".
  comparable_pairs: 500,
  // One matched pair per task class, repeated enough to separate the two arms.
  matched_budget_runs: 100,
  // A curve traced from fewer points is a handful of steps, not a curve.
  cost_accuracy_points: 50,
  // Below this the calibration term is the neutral prior for nearly everyone.
  labelled_bids: 200,
};

export type MetricReadiness = "ready" | "underpowered" | "no_data";

/**
 * Grade each metric against the corpus actually available. Returns a per-metric
 * verdict plus the shortfall, so a report can say how far off it is instead of
 * just refusing.
 */
export function assessTrilemmaReadiness(counts: TrilemmaCorpusCounts): Array<{
  metric: string;
  readiness: MetricReadiness;
  have: number;
  need: number;
  shortfall: number;
}> {
  const grade = (
    metric: string,
    have: number,
    need: number,
  ): {
    metric: string;
    readiness: MetricReadiness;
    have: number;
    need: number;
    shortfall: number;
  } => ({
    metric,
    readiness: have === 0 ? "no_data" : have >= need ? "ready" : "underpowered",
    have,
    need,
    shortfall: Math.max(0, need - have),
  });

  return [
    grade("marginal_gain", counts.comparable_pairs, TRILEMMA_MINIMUMS.comparable_pairs),
    grade(
      "accuracy_per_thinking_token",
      counts.matched_budget_runs,
      TRILEMMA_MINIMUMS.matched_budget_runs,
    ),
    grade(
      "padded_aucc",
      counts.cost_accuracy_points,
      TRILEMMA_MINIMUMS.cost_accuracy_points,
    ),
    grade("beta_tuning", counts.labelled_bids, TRILEMMA_MINIMUMS.labelled_bids),
  ];
}
