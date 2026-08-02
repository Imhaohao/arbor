// Routing integrity guards (Layer 5 pure helpers).
//
// The 4D rank in rank-core.ts always returns a sorted shortlist. It has no way to
// say "nothing here can do this", and no way to notice that one of its four
// dimensions contributed a constant. Both failures were measured on the live
// corpus, and both produce confident, wrong routing:
//
//   1. CAPABILITY NOISE. For "make me a video about a kid jumping in joy after
//      getting into stanford" the top-ranked candidates were a human-state agent,
//      a Korean news agent, a spatial atlas and a short-term-rental search. Best
//      capability similarity sat at noise level. Only 4 of 119 reachable agents
//      matched video keywords at all and just 1 of 20 corpus-wide video agents was
//      alive. The router cannot serve the request, and nothing in its score says so.
//
//   2. INERT DIMENSIONS. Reputation carries weight 0.30 but was the identical
//      constant 0.600 for 99.27% of agents (only 9 of 1,233 had settled history),
//      so its standard deviation across the pool was exactly 0. Weight spent on a
//      constant cannot reorder anything; it just dilutes the dimensions that can.
//      Price was 71-78% tied across 6 distinct values.
//
//   3. STALE AVAILABILITY. Of 45 A2A agents marked readiness="ready", a live probe
//      ~12h after the smoke run found only 18 (40%) actually alive. The signal is
//      real in provenance but decays fast, and the rank treated a 12-hour-old
//      "ready" exactly like a fresh one.
//
// Nothing here changes a score silently. Every function reports what it found so
// the caller can surface it, and the refusal path is explicit rather than a
// silently-reordered shortlist.

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlag(name: string): boolean {
  return TRUE_ENV_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

/**
 * Master switch for the behaviour changes (refusal + weight renormalization).
 * Default off keeps routing byte-for-byte on the existing path. The assessment
 * functions are pure and safe to call regardless, so shadow logging needs no flag.
 */
export function routingIntegrityEnabled(): boolean {
  return (
    !envFlag("ARBOR_ROUTING_INTEGRITY_DISABLED") &&
    envFlag("ARBOR_ROUTING_INTEGRITY_ENABLED")
  );
}

// ─── 1. Capability floor ─────────────────────────────────────────────────────

/**
 * Minimum best-in-pool capability similarity for a shortlist to be considered
 * semantically grounded.
 *
 * Calibrated on a match/no-match probe set against the live 119-agent pool using
 * all-MiniLM-L6-v2 cosine over each agent's capability_text:
 *
 *   should MATCH:   trust audit 0.5806 · korean news 0.5696 · payments 0.4800
 *   should REFUSE:  stanford video 0.2332 · nonsense 0.1801
 *
 * 0.35 sits in the empty band between those clusters.
 *
 * THRESHOLDS ARE ENCODER-SPECIFIC. This value is for MiniLM cosine. Production
 * discovery currently embeds with openai:text-embedding-3-small (1536-dim), whose
 * cosine scale differs — recalibrate with `calibrateCapabilityFloor` before
 * trusting this number against a different embedding model.
 */
export const DEFAULT_CAPABILITY_FLOOR = 0.35;

/**
 * A relative margin is deliberately NOT used as the primary gate. The top of any
 * similarity distribution is ~3 standard deviations out by construction: the
 * nonsense query scored z=2.97 and the video query z=3.20, versus 4.66-5.88 for
 * genuine matches. The bands overlap, so a z-score cannot separate "no capable
 * agent" from "weak but real match". Absolute similarity separates cleanly.
 *
 * The margin is still reported, because a tiny gap to the runner-up means the
 * ordering among the top candidates is arbitrary even when the match is real.
 */
export const AMBIGUOUS_RUNNER_UP_GAP = 0.02;

export type CapabilityVerdict =
  | "grounded"
  | "no_capable_candidate"
  | "empty_pool";

export interface CapabilityAssessment {
  verdict: CapabilityVerdict;
  best: number;
  /** Gap from best to runner-up; 0 when there is no runner-up. */
  runner_up_gap: number;
  /** True when the top two are within AMBIGUOUS_RUNNER_UP_GAP of each other. */
  top_order_arbitrary: boolean;
  floor_used: number;
  /** Human-readable reason, safe to surface to a user or a lifecycle event. */
  reason: string;
}

/**
 * Decide whether a shortlist is semantically grounded at all.
 *
 * `similarities` need not be sorted. Non-finite values are ignored rather than
 * treated as 0, so one bad embedding cannot fabricate a refusal.
 */
export function assessCapability(
  similarities: number[],
  floor = DEFAULT_CAPABILITY_FLOOR,
): CapabilityAssessment {
  const clean = similarities
    .filter((s) => Number.isFinite(s))
    .sort((l, r) => r - l);
  const effectiveFloor = Number.isFinite(floor) ? floor : DEFAULT_CAPABILITY_FLOOR;

  if (clean.length === 0) {
    return {
      verdict: "empty_pool",
      best: 0,
      runner_up_gap: 0,
      top_order_arbitrary: false,
      floor_used: effectiveFloor,
      reason: "No candidate had a usable capability score.",
    };
  }

  const best = clean[0];
  const gap = clean.length > 1 ? best - clean[1] : 0;
  const arbitrary = clean.length > 1 && gap < AMBIGUOUS_RUNNER_UP_GAP;

  if (best < effectiveFloor) {
    return {
      verdict: "no_capable_candidate",
      best,
      runner_up_gap: gap,
      top_order_arbitrary: arbitrary,
      floor_used: effectiveFloor,
      reason:
        `Best capability match ${best.toFixed(4)} is below the ${effectiveFloor} ` +
        `floor, so no agent in the reachable pool plausibly serves this task. ` +
        `Ranking these candidates would return a confident irrelevant answer.`,
    };
  }

  return {
    verdict: "grounded",
    best,
    runner_up_gap: gap,
    top_order_arbitrary: arbitrary,
    floor_used: effectiveFloor,
    reason: arbitrary
      ? `Top match ${best.toFixed(4)} clears the floor, but the runner-up is ` +
        `within ${gap.toFixed(4)} so the order among leaders is arbitrary.`
      : `Top match ${best.toFixed(4)} clears the ${effectiveFloor} floor.`,
  };
}

export interface FloorProbe {
  /** Best-in-pool similarity observed for this probe query. */
  best: number;
  /** Whether a capable agent genuinely exists for this query. */
  should_match: boolean;
}

/**
 * Derive a capability floor for a new embedding model from a labelled probe set.
 *
 * Returns the midpoint of the gap between the lowest should-match score and the
 * highest should-refuse score. Returns undefined when the classes overlap — which
 * means the embedding cannot separate capable from incapable at any threshold, and
 * the caller must fix the embedding or the capability text rather than pick a
 * number. Never silently returns a threshold that misclassifies a probe.
 */
export function calibrateCapabilityFloor(
  probes: FloorProbe[],
): number | undefined {
  const matches = probes.filter((p) => p.should_match && Number.isFinite(p.best));
  const refusals = probes.filter(
    (p) => !p.should_match && Number.isFinite(p.best),
  );
  if (matches.length === 0 || refusals.length === 0) return undefined;
  const lowestMatch = Math.min(...matches.map((p) => p.best));
  const highestRefusal = Math.max(...refusals.map((p) => p.best));
  if (lowestMatch <= highestRefusal) return undefined; // classes overlap
  return Number(((lowestMatch + highestRefusal) / 2).toFixed(4));
}

// ─── 2. Inert-dimension detection and weight renormalization ────────────────

export interface DimensionStats {
  name: string;
  weight: number;
  /** Population standard deviation across the candidate pool. */
  sd: number;
  /** weight * sd — how much this dimension can actually move the ranking. */
  weighted_sd: number;
  distinct_values: number;
  /** Share of the pool sitting on the single most common value. */
  modal_share: number;
  /** True when this dimension cannot meaningfully reorder the pool. */
  inert: boolean;
}

/**
 * A dimension whose weighted standard deviation is below this cannot change the
 * order of any realistic shortlist. Reputation measured exactly 0.0000 on the live
 * corpus; a small positive epsilon also catches the 6-value/78%-tied price case
 * degrading toward constant.
 */
export const INERT_WEIGHTED_SD = 0.005;

/** A dimension where nearly every candidate shares one value is inert in practice
 * even if a couple of outliers give it nonzero variance. */
export const INERT_MODAL_SHARE = 0.98;

function populationSd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Measure how much each scoring dimension actually discriminates across the REAL
 * candidate pool. This is the audit that found 30% of the routing weight was a
 * constant; run it on live candidates rather than trusting the weight table.
 */
export function dimensionDiscrimination(
  dimensions: Array<{ name: string; weight: number; values: number[] }>,
): DimensionStats[] {
  return dimensions.map((dim) => {
    const clean = dim.values.filter((v) => Number.isFinite(v));
    const sd = populationSd(clean);
    const weighted = dim.weight * sd;
    const counts = new Map<number, number>();
    for (const v of clean) {
      const key = Number(v.toFixed(6));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const modal = clean.length
      ? Math.max(...counts.values()) / clean.length
      : 1;
    return {
      name: dim.name,
      weight: dim.weight,
      sd: Number(sd.toFixed(6)),
      weighted_sd: Number(weighted.toFixed(6)),
      distinct_values: counts.size,
      modal_share: Number(modal.toFixed(4)),
      inert: weighted < INERT_WEIGHTED_SD || modal >= INERT_MODAL_SHARE,
    };
  });
}

/**
 * Redistribute the weight of inert dimensions across the dimensions that still
 * discriminate, preserving their relative proportions.
 *
 * Adding a constant to every candidate's score changes no ordering, so dropping an
 * inert dimension is order-preserving on its own. What it fixes is DILUTION: with
 * reputation frozen at 0.600 the live pool's remaining spread was compressed into
 * 70% of the scale, which let availability (weight 0.15) out-discriminate
 * capability (weight 0.40) by roughly 1.9x. Renormalizing restores the intended
 * balance between the dimensions that carry information.
 *
 * If every dimension is inert the input is returned unchanged — there is nothing
 * to renormalize onto, and silently inventing weights would be worse.
 */
export function renormalizeOverEvidenced(
  weights: Record<string, number>,
  inertNames: Iterable<string>,
): Record<string, number> {
  const inert = new Set(inertNames);
  const live = Object.entries(weights).filter(
    ([name, w]) => !inert.has(name) && Number.isFinite(w) && w > 0,
  );
  const liveTotal = live.reduce((a, [, w]) => a + w, 0);
  const total = Object.values(weights).reduce(
    (a, w) => a + (Number.isFinite(w) && w > 0 ? w : 0),
    0,
  );
  if (live.length === 0 || liveTotal <= 0 || total <= 0) return { ...weights };

  const out: Record<string, number> = {};
  for (const name of Object.keys(weights)) out[name] = 0;
  for (const [name, w] of live) {
    out[name] = Number(((w / liveTotal) * total).toFixed(6));
  }
  return out;
}

// ─── 3. Availability freshness ──────────────────────────────────────────────

/**
 * Half-life for a liveness observation, in milliseconds.
 *
 * Empirically anchored: a smoke run at 2026-07-29T06:54Z marked 45 A2A agents
 * "ready"; a live probe ~12h later found 18 still alive (40% survival). Under an
 * exponential decay model that implies a half-life near 9h
 * (12h * ln2 / ln(1/0.40) ~= 9.1h). Treat as an order-of-magnitude default, not a
 * precise constant — re-measure when the corpus or providers change.
 */
export const AVAILABILITY_HALF_LIFE_MS = 9 * 60 * 60 * 1000;

/** Score for "we have no idea". Decayed observations converge here, never past it. */
export const AVAILABILITY_UNKNOWN = 0.5;

export interface FreshnessResult {
  score: number;
  /** Fraction of the original signal still trusted, 1 at age 0. */
  retained: number;
  age_ms: number;
  stale: boolean;
}

/** An observation older than this is reported as stale. */
export const AVAILABILITY_STALE_AFTER_MS = AVAILABILITY_HALF_LIFE_MS;

/**
 * Decay a liveness score toward AVAILABILITY_UNKNOWN as the observation ages.
 *
 * A 12-hour-old "ready" is not evidence of being up now; on the measured corpus it
 * was wrong 60% of the time. Decaying toward 0.5 rather than 0 is deliberate: a
 * stale observation means "unknown", not "known dead", and collapsing it to 0
 * would wrongly rank a stale-but-healthy agent below a confirmed-dead one.
 *
 * A missing or non-finite `observedAtMs` yields AVAILABILITY_UNKNOWN — never the
 * undecayed input, which would treat unknown age as fresh.
 */
export function availabilityWithFreshness(
  score: number,
  observedAtMs: number | undefined,
  nowMs: number,
  halfLifeMs = AVAILABILITY_HALF_LIFE_MS,
): FreshnessResult {
  if (!Number.isFinite(score)) {
    return { score: AVAILABILITY_UNKNOWN, retained: 0, age_ms: 0, stale: true };
  }
  if (
    observedAtMs === undefined ||
    !Number.isFinite(observedAtMs) ||
    !Number.isFinite(nowMs)
  ) {
    return { score: AVAILABILITY_UNKNOWN, retained: 0, age_ms: 0, stale: true };
  }
  const age = Math.max(0, nowMs - observedAtMs);
  const hl =
    Number.isFinite(halfLifeMs) && halfLifeMs > 0
      ? halfLifeMs
      : AVAILABILITY_HALF_LIFE_MS;
  const retained = Math.pow(0.5, age / hl);
  const decayed =
    AVAILABILITY_UNKNOWN + (score - AVAILABILITY_UNKNOWN) * retained;
  return {
    score: Number(decayed.toFixed(6)),
    retained: Number(retained.toFixed(6)),
    age_ms: age,
    stale: age >= AVAILABILITY_STALE_AFTER_MS,
  };
}

// ─── 4. Discovery coverage ──────────────────────────────────────────────────

export interface CoverageAssessment {
  /** Agents the router can surface at all (e.g. rows in the vector index). */
  reachable: number;
  /** Agents believed usable (readiness ready) regardless of reachability. */
  usable: number;
  /** Usable agents that discovery cannot surface. */
  invisible: number;
  coverage: number;
  degraded: boolean;
  reason: string;
}

/**
 * Minimum share of usable agents that discovery must be able to surface before
 * routing results can be called representative of the corpus.
 */
export const MIN_DISCOVERY_COVERAGE = 0.9;

/**
 * Report whether candidate discovery can actually see the usable corpus.
 *
 * Measured: discovery ran through a vector index holding 119 rows against a
 * 1,122-agent corpus, so 174 of 219 readiness-ready agents (79%) could never be
 * surfaced no matter how well the ranker scored. A ranking metric computed over an
 * unrepresentative 10% of the corpus is not a statement about the corpus, and this
 * makes that explicit instead of leaving it implied.
 */
export function assessDiscoveryCoverage(args: {
  reachable_ids: Iterable<string>;
  usable_ids: Iterable<string>;
  minCoverage?: number;
}): CoverageAssessment {
  const reachable = new Set(args.reachable_ids);
  const usable = new Set(args.usable_ids);
  const min = args.minCoverage ?? MIN_DISCOVERY_COVERAGE;
  let visible = 0;
  for (const id of usable) if (reachable.has(id)) visible += 1;
  const invisible = usable.size - visible;
  const coverage = usable.size === 0 ? 1 : visible / usable.size;
  const degraded = coverage < min;
  return {
    reachable: reachable.size,
    usable: usable.size,
    invisible,
    coverage: Number(coverage.toFixed(4)),
    degraded,
    reason: degraded
      ? `Discovery can surface ${visible}/${usable.size} usable agents ` +
        `(${(coverage * 100).toFixed(1)}%); ${invisible} are invisible to routing. ` +
        `Rankings are drawn from an unrepresentative subset of the corpus.`
      : `Discovery surfaces ${visible}/${usable.size} usable agents ` +
        `(${(coverage * 100).toFixed(1)}%).`,
  };
}
