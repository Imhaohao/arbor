// Reputation priors from the arbitrator's two liveness heads (Layer 5 pure
// helpers). No Convex, no I/O — exercised in reputation-prior-core.test.ts.
//
// THE PROBLEM. `agents.reputation_score` is event-sourced: it starts at
// `starting_reputation` and moves only when `_applyReputationDelta` records a
// settled outcome. On the live pool that means 1,105 of 1,233 agents sit at
// exactly 0.5 and 98 more at exactly 0.55, so the 0.30-weighted reputation
// dimension of `rankAgents4D` has a standard deviation of zero and cannot
// reorder any candidate. The dimension meant to capture effectiveness is inert.
//
// THE FIX. Give every agent that has never settled a task a *prior* built from
// the two heads the arbitrator already trusts for liveness:
//
//   measured — probeSuccessScore(), the unfitted mean of two smoothed measured
//              pass rates (smoke history + bid-probe history). Ranking AUC
//              0.9590 on the temporal holdout; the best signal we have.
//   encoder  — encoderColdStartLogit(), encoder-target decoupling
//              (arXiv:2603.20895): a local 22.7M-param MiniLM reads the agent's
//              own descriptor text and predicts whether that external A2A/MCP
//              service will answer. Cold-start AUC 0.9390 under a strict
//              capability-family holdout.
//
// HOW THEY COMBINE — lexicographic, not blended. The model card is explicit
// that mixing the two *hurts*: encoder+measured scored 0.9458 against 0.9590
// for the measured rate alone. So the measured ordering is preserved exactly
// and the encoder is consulted only to break ties within it. That is where the
// encoder demonstrably adds information: 670 agents share a measured pass rate
// of exactly zero and the measured head orders them arbitrarily.
//
// WHY RANKS AND NOT PROBABILITIES. Neither head is calibrated for this use.
// The encoder's Brier (0.01210) does not beat the base rate (0.01152), and the
// shipped Platt pair for the measured head is a cold-start bootstrap that goes
// badly overconfident without a rolling refit. A midrank percentile is the
// honest transform: it uses exactly the ordering information the heads have
// been validated to carry, and none of the magnitude they have not.
//
// WHAT THIS IS NOT. Both heads predict P(the agent answers at all), never
// P(the answer is good). A prior therefore lives in a band strictly inside the
// range earned reputation can reach — see PRIOR_HALF_BAND — so no amount of
// promising descriptor text can make an agent look like it has a track record.

import {
  probeSuccessScore,
  type ProbeSuccessEvidence,
} from "./probe-success-core";
import {
  ENCODER_HEAD_MODEL,
  encoderColdStartLogit,
  type EncoderHeadModel,
} from "./encoder-head-core";

/**
 * Half-width of the band a prior may occupy around the neutral 0.5.
 *
 * Load-bearing: earned reputation spans [0.05, 1.0] (REPUTATION_MIN/MAX in
 * convex/agents.ts), so confining priors to [0.30, 0.70] guarantees an agent
 * that has actually delivered can always out- or under-rank one that has only
 * been predicted to respond. Widening this trades that guarantee for spread.
 */
export const PRIOR_HALF_BAND = 0.2;

/** Neutral reputation — the value the whole cold pool currently shares. */
export const NEUTRAL_REPUTATION = 0.5;

/** Which signal determined an agent's reputation. */
export type ReputationPriorSource =
  /** Settled-task history exists; the event-sourced score is left alone. */
  | "earned"
  /** Ordered by measured pass rates. */
  | "measured"
  /** Measured rates tied; the encoder broke the tie. */
  | "encoder"
  /** No signal at all — stays neutral. */
  | "neutral";

export interface ReputationPriorInput {
  agent_id: string;
  /** Rows in `reputation_dimensions`. Non-zero means the agent has settled. */
  settled_tasks: number;
  /** Current event-sourced score, returned unchanged for settled agents. */
  current_reputation: number;
  /** Smoke-run and bid-probe history. */
  evidence: ProbeSuccessEvidence;
  /**
   * The 8-dim standardized PCA projection of the agent's descriptor, from the
   * offline encoder job. Absent when the agent has never been encoded.
   */
  encoder_vector?: number[];
}

export interface ReputationPriorResult {
  agent_id: string;
  /** The value to write to `agents.reputation_score`. */
  reputation: number;
  source: ReputationPriorSource;
  /** Ordering position within the unsettled pool, 0..1. Undefined if earned. */
  percentile?: number;
  /** probeSuccessScore() for this agent — the primary sort key. */
  measured_score?: number;
  /** encoderColdStartLogit() for this agent — the tiebreaker. */
  encoder_logit?: number;
  /** True when agents tied on measured_score were separated by the encoder. */
  encoder_broke_tie?: boolean;
  /** Difference from the score the agent had before. */
  delta: number;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

/**
 * Midrank percentiles, 0..1. Ties share the average of the positions they span,
 * so a block of agents the signal genuinely cannot separate lands on one value
 * instead of being spread by input order. A single element maps to 0.5 — the
 * neutral position — because one observation carries no ordering information.
 */
export function midrankPercentiles(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((l, r) => l.value - r.value || l.index - r.index);
  const out = new Array<number>(n);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && order[j + 1].value === order[i].value) j += 1;
    // Average position of the tied block, mapped to [0, 1].
    const shared = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k += 1) out[order[k].index] = shared;
    i = j + 1;
  }
  return out;
}

/**
 * Map an ordering position to a reputation inside the prior band. 0 -> 0.30,
 * 0.5 -> 0.50, 1 -> 0.70.
 */
export function percentileToReputation(
  percentile: number,
  halfBand: number = PRIOR_HALF_BAND,
): number {
  const p = clamp(percentile, 0, 1);
  return round6(NEUTRAL_REPUTATION + halfBand * (2 * p - 1));
}

/**
 * Assign a reputation to every agent in one pass.
 *
 * Agents with settled history keep their event-sourced score untouched — the
 * `reputation_events` log is the authority there and rewriting the base would
 * desynchronize it from the replayable sum of its deltas.
 *
 * Everyone else is ranked *as one pool* on (measured_score, encoder_logit),
 * lexicographically. Ranking the whole unsettled pool together rather than
 * per-tier is deliberate: an agent measured at a 0% pass rate genuinely should
 * fall below a never-probed agent whose descriptor looks live, and tiered bands
 * would forbid that.
 */
export function assignReputationPriors(
  inputs: ReputationPriorInput[],
  options?: { halfBand?: number; model?: EncoderHeadModel },
): ReputationPriorResult[] {
  const halfBand = options?.halfBand ?? PRIOR_HALF_BAND;
  const model = options?.model ?? ENCODER_HEAD_MODEL;

  const results = new Map<string, ReputationPriorResult>();
  const pool: Array<{
    agent_id: string;
    measured: number;
    encoder?: number;
    current: number;
  }> = [];

  for (const input of inputs) {
    if (input.settled_tasks > 0) {
      results.set(input.agent_id, {
        agent_id: input.agent_id,
        reputation: input.current_reputation,
        source: "earned",
        delta: 0,
      });
      continue;
    }
    let encoder: number | undefined;
    if (
      input.encoder_vector &&
      input.encoder_vector.length === model.coef.length
    ) {
      encoder = encoderColdStartLogit(input.encoder_vector, model);
    }
    pool.push({
      agent_id: input.agent_id,
      measured: probeSuccessScore(input.evidence),
      encoder,
      current: input.current_reputation,
    });
  }

  if (pool.length > 0) {
    // Lexicographic key: measured rate first, encoder logit only within ties.
    // Agents with no vector sort to the bottom of their tied block — an unknown
    // descriptor is weaker evidence than one the encoder scored, however low.
    const ENCODER_ABSENT = Number.NEGATIVE_INFINITY;
    const enc = (p: (typeof pool)[number]) => p.encoder ?? ENCODER_ABSENT;

    // Measured values shared by more than one agent: the blocks the encoder is
    // allowed to reorder, and the only place it is consulted at all.
    const measuredCounts = new Map<number, number>();
    for (const p of pool) {
      measuredCounts.set(p.measured, (measuredCounts.get(p.measured) ?? 0) + 1);
    }

    const ordered = pool
      .map((p, index) => ({ p, index }))
      .sort(
        (l, r) =>
          l.p.measured - r.p.measured || enc(l.p) - enc(r.p) || l.index - r.index,
      );

    const n = ordered.length;
    for (let i = 0; i < n; ) {
      // Midrank over the full composite key: agents that neither head can
      // separate share one percentile instead of being spread by input order.
      let j = i;
      while (
        j + 1 < n &&
        ordered[j + 1].p.measured === ordered[i].p.measured &&
        enc(ordered[j + 1].p) === enc(ordered[i].p)
      ) {
        j += 1;
      }
      const percentile = n === 1 ? 0.5 : (i + j) / 2 / (n - 1);
      const reputation = percentileToReputation(percentile, halfBand);

      for (let k = i; k <= j; k += 1) {
        const { p } = ordered[k];
        const tied = (measuredCounts.get(p.measured) ?? 1) > 1;
        const hasEncoder = p.encoder !== undefined;
        const brokeTie = tied && hasEncoder;
        const source: ReputationPriorSource = brokeTie
          ? "encoder"
          : tied
            ? // In a measured tie with nothing to separate it: position inside
              // the block is not information, so say so rather than crediting
              // a head that did not decide it.
              "neutral"
            : "measured";
        results.set(p.agent_id, {
          agent_id: p.agent_id,
          reputation,
          source,
          percentile: round6(percentile),
          measured_score: round6(p.measured),
          encoder_logit: hasEncoder ? round6(p.encoder as number) : undefined,
          encoder_broke_tie: brokeTie,
          delta: round6(reputation - p.current),
        });
      }
      i = j + 1;
    }
  }

  return inputs.map(
    (input) =>
      results.get(input.agent_id) ?? {
        agent_id: input.agent_id,
        reputation: input.current_reputation,
        source: "neutral" as const,
        delta: 0,
      },
  );
}

/**
 * How much ordering information the encoder actually contributed: the share of
 * the pool sitting in a measured-score tie that the encoder could separate.
 *
 * Report this rather than the encoder's own AUC when justifying the addon —
 * a head with a great AUC that never breaks a tie changes no routing decision.
 */
export function encoderContribution(results: ReputationPriorResult[]): {
  pool: number;
  tie_broken: number;
  tie_broken_share: number;
  distinct_reputations: number;
} {
  const pool = results.filter((r) => r.source !== "earned");
  const tieBroken = pool.filter((r) => r.encoder_broke_tie).length;
  return {
    pool: pool.length,
    tie_broken: tieBroken,
    tie_broken_share: pool.length === 0 ? 0 : round6(tieBroken / pool.length),
    distinct_reputations: new Set(pool.map((r) => r.reputation)).size,
  };
}
