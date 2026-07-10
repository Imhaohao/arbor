// Agentverse-style multi-dimensional ranked discovery (W4, arXiv:2606.20570).
// Replaces "embedding similarity + min_reputation 0.3 filter" with a
// deterministic 4-dimensional blend: capability-match x reputation x price x
// availability. Pure, no Convex, no I/O — exercised in rank-core.test.ts.

/** Weight given to each of the four ranking dimensions. Sums to 1. */
export const RANK_WEIGHTS: {
  capability: number;
  reputation: number;
  price: number;
  availability: number;
} = {
  capability: 0.4,
  reputation: 0.3,
  price: 0.15,
  availability: 0.15,
};

/** Weights within the reputation composite. Sums to 1. */
export const REPUTATION_WEIGHTS = {
  reliability: 0.3,
  quality: 0.3,
  safety: 0.2,
  speed: 0.2,
} as const;

/** Reference price (USD) at which the price dimension scores 0.5. */
const PRICE_REFERENCE = 0.5;

export interface ReputationDimensions {
  /** Accepted-rate: fraction of settled tasks the judge accepted, 0..1. */
  reliability: number;
  /** Mean judge quality_score across settled tasks, 0..1. */
  quality: number;
  /** Safety signal, 0..1. Defaults to 1.0 until a real signal exists. */
  safety: number;
  /** Mean speed_score across settled tasks, 0..1. */
  speed: number;
}

export interface RankCandidate {
  agent_id: string;
  /** Embedding/semantic similarity to the task query, 0..1. */
  similarity: number;
  reputation: ReputationDimensions;
  /** Price in USD. Cheaper is better; <= 0 is treated as free (best price). */
  price: number;
  /** Availability score, 0..1 (see availability mapping in agentReadiness). */
  availability: number;
}

export interface RankedCandidate<C extends RankCandidate = RankCandidate> {
  rank_score: number;
  capability_score: number;
  reputation_score: number;
  price_score: number;
  availability_score: number;
  candidate: C;
}

export interface RankAgents4DOptions {
  weights?: Partial<typeof RANK_WEIGHTS>;
  /** Reference price (USD) at which the price dimension scores 0.5. */
  priceReference?: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

/**
 * Weighted blend of the four reputation dimensions into a single 0..1 score.
 */
export function reputationScore(dims: ReputationDimensions): number {
  const score =
    REPUTATION_WEIGHTS.reliability * clamp01(dims.reliability) +
    REPUTATION_WEIGHTS.quality * clamp01(dims.quality) +
    REPUTATION_WEIGHTS.safety * clamp01(dims.safety) +
    REPUTATION_WEIGHTS.speed * clamp01(dims.speed);
  return clamp01(score);
}

/**
 * Invert price into a 0..1 "cheaper is better" score. Guards divide-by-zero:
 * price <= 0 is free (best possible score, 1.0). Uses a reference price so
 * price == reference maps to 0.5, and scales smoothly on either side.
 */
export function priceScore(price: number, reference = PRICE_REFERENCE): number {
  if (!Number.isFinite(price) || price <= 0) return 1;
  const ref = Number.isFinite(reference) && reference > 0 ? reference : PRICE_REFERENCE;
  return clamp01(ref / (ref + price));
}

/**
 * Score and sort a candidate shortlist by the 4D blend: capability-match x
 * reputation x price x availability. Every sub-score and the final blend are
 * clamped to [0, 1]. Deterministic: ties break on input order.
 */
export function rankAgents4D<C extends RankCandidate>(
  candidates: C[],
  opts?: RankAgents4DOptions,
): Array<RankedCandidate<C>> {
  const weights = { ...RANK_WEIGHTS, ...opts?.weights };
  const weightSum =
    weights.capability + weights.reputation + weights.price + weights.availability;
  const norm = weightSum > 0 ? weightSum : 1;

  const scored = candidates.map((candidate, index) => {
    const capability_score = clamp01(candidate.similarity);
    const reputation_score = reputationScore(candidate.reputation);
    const price_score = priceScore(candidate.price, opts?.priceReference);
    const availability_score = clamp01(candidate.availability);

    const blend =
      (weights.capability * capability_score +
        weights.reputation * reputation_score +
        weights.price * price_score +
        weights.availability * availability_score) /
      norm;

    return {
      index,
      candidate,
      rank_score: round6(clamp01(blend)),
      capability_score: round6(capability_score),
      reputation_score: round6(reputation_score),
      price_score: round6(price_score),
      availability_score: round6(availability_score),
    };
  });

  scored.sort(
    (a, b) => b.rank_score - a.rank_score || a.index - b.index,
  );

  return scored.map(
    ({ index: _index, ...rest }): RankedCandidate<C> => rest,
  );
}
