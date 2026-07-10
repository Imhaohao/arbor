// FlyRoute-style agent capability profiles (W3) — pure helpers, no Convex, no
// I/O. A profile is a per-(agent, task-class) EWMA over settled-node outcomes:
// success, judge quality, latency, price. `uncertainty` shrinks as evidence
// accumulates and buys exploration in the router (arXiv:2605.22057: route on
// task-vs-profile compatibility PLUS uncertainty, so new agents still get
// sampled). Exercised directly in profile-core.test.ts.

/** EWMA smoothing: how much one new outcome moves the profile. */
const ALPHA = 0.3;

/** Exploration weight for uncertain (thin-evidence) profiles. */
const UNCERTAINTY_BONUS = 0.15;

/** How much the profile blend can swing the router's similarity score. */
const PROFILE_WEIGHT = 0.4;

export interface AgentProfile {
  agent_id: string;
  task_class: string;
  tasks: number;
  success_rate: number;
  avg_quality: number;
  avg_latency_seconds: number;
  avg_price: number;
  uncertainty: number;
  updated_at: number;
}

export interface NodeOutcome {
  agent_id: string;
  task_class: string;
  success: boolean;
  quality_score?: number;
  latency_seconds?: number;
  price_paid?: number;
  settled_at: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function ewma(prev: number, next: number, firstSample: boolean): number {
  return firstSample ? next : prev + ALPHA * (next - prev);
}

/** Evidence-scaled uncertainty: 1 at zero observations, ~0.3 at 10, →0. */
export function uncertaintyFor(tasks: number): number {
  return Number((1 / Math.sqrt(tasks + 1)).toFixed(4));
}

/** Fresh prior for an unseen (agent, class) pair: neutral and fully uncertain. */
export function emptyProfile(
  agent_id: string,
  task_class: string,
  now: number,
): AgentProfile {
  return {
    agent_id,
    task_class,
    tasks: 0,
    success_rate: 0.5,
    avg_quality: 0.5,
    avg_latency_seconds: 0,
    avg_price: 0,
    uncertainty: uncertaintyFor(0),
    updated_at: now,
  };
}

/**
 * Fold one settled-node outcome into a profile. Missing observations (no judge
 * score, no latency, free execution) leave their dimension untouched rather
 * than dragging it toward zero.
 */
export function updateProfile(
  prev: AgentProfile,
  outcome: NodeOutcome,
): AgentProfile {
  const first = prev.tasks === 0;
  const tasks = prev.tasks + 1;
  return {
    ...prev,
    tasks,
    success_rate: clamp01(
      ewma(prev.success_rate, outcome.success ? 1 : 0, first),
    ),
    avg_quality:
      outcome.quality_score !== undefined
        ? clamp01(ewma(prev.avg_quality, clamp01(outcome.quality_score), first))
        : prev.avg_quality,
    avg_latency_seconds:
      outcome.latency_seconds !== undefined && outcome.latency_seconds >= 0
        ? Number(
            ewma(
              prev.avg_latency_seconds,
              outcome.latency_seconds,
              first || prev.avg_latency_seconds === 0,
            ).toFixed(2),
          )
        : prev.avg_latency_seconds,
    avg_price:
      outcome.price_paid !== undefined && outcome.price_paid > 0
        ? Number(
            ewma(
              prev.avg_price,
              outcome.price_paid,
              first || prev.avg_price === 0,
            ).toFixed(4),
          )
        : prev.avg_price,
    uncertainty: uncertaintyFor(tasks),
    updated_at: outcome.settled_at,
  };
}

/**
 * Scalar compatibility score for routing: mostly success x quality, plus an
 * exploration bonus that decays with evidence. Always in [0, 1].
 */
export function profileScore(profile: AgentProfile): number {
  const competence =
    0.6 * profile.success_rate + 0.4 * profile.avg_quality;
  return clamp01(competence + UNCERTAINTY_BONUS * profile.uncertainty);
}

export interface RankableCandidate {
  agent_id: string;
  similarity: number;
}

/**
 * Re-rank a semantic shortlist by blending each candidate's similarity with its
 * capability profile. Candidates without a profile get the neutral 0.5 blend,
 * so a thin profile store leaves the semantic order untouched. Returns a new
 * array sorted best-first; input order breaks ties.
 */
export function profileWeightedRank<C extends RankableCandidate>(
  candidates: C[],
  profiles: Map<string, AgentProfile>,
): Array<C & { routing_score: number }> {
  const scored = candidates.map((candidate, index) => {
    const profile = profiles.get(candidate.agent_id);
    const blend = profile ? profileScore(profile) : 0.5;
    const routing_score = Number(
      (
        candidate.similarity *
        (1 - PROFILE_WEIGHT + PROFILE_WEIGHT * 2 * blend)
      ).toFixed(6),
    );
    return { candidate, index, routing_score };
  });
  scored.sort(
    (a, b) => b.routing_score - a.routing_score || a.index - b.index,
  );
  return scored.map(({ candidate, routing_score }) => ({
    ...candidate,
    routing_score,
  }));
}
