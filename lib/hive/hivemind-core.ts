// Hivemind composition (Layer 5 pure helpers).
//
// The arbitrator picks the best agent PER NODE, independently. That cannot
// express "these two together beat either alone", which is the entire point of a
// hive. This module selects a TEAM for one objective: a set of agents sharing one
// blackboard, one assembled context, and one success criterion.
//
// WHY THE WEIGHTS ARE NOT LEARNED (yet).
// 16 labelled (team -> outcome) rows exist in scratchpad_entries + hive_evaluations.
// Measured on them:
//
//   solo (n=8)      mean quality 0.656
//   2 agents (n=5)  mean quality 0.470
//   4 agents (n=4)  mean quality 0.601      <- non-monotonic
//
// and the GOAL confounds it harder than team size does (goal A 0.744 vs goal B
// 0.466). Within goal A solo wins; within goal B the 4-agent team wins — opposite
// conclusions from 1-4 samples per cell. One agent (arbor-hive-backstop) appears
// in 15 of 16 teams, so its contribution is not identifiable at all.
//
// A regression fit on that would learn "goal B is hard" and present it as team
// selection. So the scoring below is an explicit, inspectable objective whose
// coefficients live in one struct (`HiveWeights`) ready to be REPLACED by a fit
// once `battery_runs` carries team arms. Nothing here claims to be trained.
//
// THE ONE PART THAT IS NOT A HEURISTIC is the reliability term: for independent
// members, P(at least one delivers) = 1 - prod(1 - p_i). That is arithmetic, and
// it is the real mathematical reason a hive can beat its best member.

export interface HiveMemberCandidate {
  agent_id: string;
  /** Capabilities this agent can cover, lowercased and normalized by the caller. */
  capabilities: string[];
  /** Calibrated P(this agent delivers), e.g. from probe-success-core. */
  reliability: number;
  /** Price for this agent's participation. */
  cost: number;
  /** Failure-correlation key: same provider or transport fails together. */
  provider?: string;
  /** Semantic fit to the objective, 0..1. */
  affinity?: number;
}

export interface HiveWeights {
  coverage: number;
  reliability: number;
  affinity: number;
  cost: number;
  /** Charged per ADDITIONAL member beyond the first. */
  coordination: number;
}

/**
 * Starting objective. Deliberately conservative on team size: the measured data
 * gives no evidence that bigger is better, so growth must be *earned* by covering
 * something new or by materially raising the odds of delivery.
 */
export const DEFAULT_HIVE_WEIGHTS: HiveWeights = {
  coverage: 0.40,
  reliability: 0.30,
  affinity: 0.15,
  cost: 0.10,
  coordination: 0.05,
};

/**
 * Charter every hive member operates under. These are contract terms, not
 * decoration: the executor writes them into the shared prompt so each member
 * knows it is one of several, sees the same board, and optimizes the objective
 * rather than its own sub-answer.
 */
export interface HiveCharter {
  /** The user's prompt. The single thing the hive is scored on. */
  objective: string;
  /** Blackboard namespace all members read and write. */
  blackboard_namespace: string;
  /** Every member id, so each can address the others by name. */
  members: string[];
  /** Entry kinds members may append (maps to scratchpad_entries.kind). */
  allowed_kinds: readonly string[];
  /** Restated per member so a sub-answer never displaces the real goal. */
  prime_directive: string;
}

/** Collaboration verbs the blackboard already supports. */
export const HIVE_ALLOWED_KINDS = [
  "observation",
  "proposal",
  "critique",
  "decision",
  "result",
  "consensus",
  "artifact",
] as const;

export const HIVE_PRIME_DIRECTIVE =
  "Completing the user's objective is your only success criterion. You share one " +
  "blackboard with the other members listed here: read it before acting, append " +
  "your findings, and critique or build on their entries rather than duplicating " +
  "them. A partial answer that advances the objective beats a complete answer to " +
  "a narrower question you preferred.";

export function buildCharter(args: {
  objective: string;
  members: string[];
  dagId: string;
  nodeId?: string;
}): HiveCharter {
  const objective = args.objective.trim();
  if (!objective) throw new Error("a hive charter requires a non-empty objective");
  if (args.members.length === 0) {
    throw new Error("a hive charter requires at least one member");
  }
  return {
    objective,
    // Namespaced per node so parallel hives on one DAG cannot read each other's
    // working notes and drift onto the wrong sub-goal.
    blackboard_namespace: args.nodeId
      ? `hive:${args.dagId}:${args.nodeId}`
      : `hive:${args.dagId}`,
    members: [...args.members],
    allowed_kinds: HIVE_ALLOWED_KINDS,
    prime_directive: HIVE_PRIME_DIRECTIVE,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Required capabilities a team actually covers, as a 0..1 fraction. */
export function coverageOf(
  members: HiveMemberCandidate[],
  required: string[],
): number {
  if (required.length === 0) return 1;
  const have = new Set<string>();
  for (const m of members) for (const c of m.capabilities) have.add(c);
  const hit = required.filter((r) => have.has(r)).length;
  return hit / required.length;
}

/**
 * P(at least one member delivers), discounted for correlated failure.
 *
 * Independent members: 1 - prod(1 - p_i). Members sharing a provider do NOT fail
 * independently — one outage takes them all — so each provider group contributes
 * only its best member's reliability plus a heavily damped bonus for the rest.
 * Without this, stacking five agents from one vendor would look like near-certain
 * delivery when it is really one point of failure.
 */
export function teamReliability(members: HiveMemberCandidate[]): number {
  if (members.length === 0) return 0;
  const groups = new Map<string, number[]>();
  for (const m of members) {
    const key = m.provider ?? m.agent_id;
    const list = groups.get(key) ?? [];
    list.push(clamp01(m.reliability));
    groups.set(key, list);
  }
  let failAll = 1;
  for (const list of groups.values()) {
    list.sort((a, b) => b - a);
    // Best member carries the group; each additional same-provider member adds a
    // steeply discounted increment rather than a full independent factor.
    let groupSuccess = list[0];
    for (let i = 1; i < list.length; i += 1) {
      groupSuccess += (1 - groupSuccess) * list[i] * 0.25;
    }
    failAll *= 1 - clamp01(groupSuccess);
  }
  return clamp01(1 - failAll);
}

/** Distinct failure domains represented, 0..1. */
export function diversityOf(members: HiveMemberCandidate[]): number {
  if (members.length === 0) return 0;
  const providers = new Set(members.map((m) => m.provider ?? m.agent_id));
  return providers.size / members.length;
}

export interface HiveScore {
  score: number;
  coverage: number;
  reliability: number;
  affinity: number;
  cost: number;
  diversity: number;
  coordination_penalty: number;
}

/**
 * Score one candidate team.
 *
 * `costReference` normalizes spend to 0..1 so the cost term is comparable across
 * budgets; it defaults to the team's own cost so a single-team call is still sane.
 */
export function scoreHive(
  members: HiveMemberCandidate[],
  args: {
    required: string[];
    weights?: HiveWeights;
    costReference?: number;
  },
): HiveScore {
  const w = args.weights ?? DEFAULT_HIVE_WEIGHTS;
  const coverage = coverageOf(members, args.required);
  const reliability = teamReliability(members);
  const affinity =
    members.length === 0
      ? 0
      : members.reduce((a, m) => a + clamp01(m.affinity ?? 0), 0) / members.length;
  const cost = members.reduce((a, m) => a + Math.max(0, m.cost), 0);
  const ref = args.costReference && args.costReference > 0 ? args.costReference : cost || 1;
  const costPenalty = clamp01(cost / ref);
  // Coordination is charged per ADDITIONAL member: every extra participant adds
  // blackboard traffic and a chance of divergence. In the measured data critique
  // volume rose with team size while quality did not.
  const coordinationPenalty = Math.max(0, members.length - 1) * w.coordination;

  const score =
    w.coverage * coverage +
    w.reliability * reliability +
    w.affinity * affinity -
    w.cost * costPenalty -
    coordinationPenalty;

  return {
    score: Number(score.toFixed(6)),
    coverage: Number(coverage.toFixed(6)),
    reliability: Number(reliability.toFixed(6)),
    affinity: Number(affinity.toFixed(6)),
    cost: Number(cost.toFixed(6)),
    diversity: Number(diversityOf(members).toFixed(6)),
    coordination_penalty: Number(coordinationPenalty.toFixed(6)),
  };
}

export interface HiveComposition {
  members: HiveMemberCandidate[];
  scored: HiveScore;
  /** Why this shape was chosen, for the routing event and the UI. */
  rationale: string;
  /** True when a team genuinely beat every single-agent option. */
  hive_beats_solo: boolean;
  /** Best solo score, for the honest comparison. */
  best_solo_score: number;
  /**
   * True when exploration chose this team rather than the policy.
   *
   * A fit MUST know this: exploratory teams are not the policy's decision, and
   * training on them as if they were biases the learned weights toward whatever
   * the sampler happened to try.
   */
  explored: boolean;
}

/**
 * Deterministic RNG (mulberry32).
 *
 * `Math.random()` would make a sweep unreproducible: you could never re-derive
 * which teams a run chose, which is fatal for an experiment whose whole output
 * is a labelled dataset. Same seed + same candidates always yields the same team.
 */
export function seededRandom(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exploration policy for dataset generation.
 *
 * Pure argmax composition produced an unusable corpus in the pilot: with equal
 * reliability priors the composer picked the SAME pair for every task, so
 * `assessFittability` correctly rejected it — two agents appeared in 4/4 teams
 * and team size never varied. Neither the effect of an individual agent nor the
 * effect of team size is identifiable from data like that.
 *
 * Exploration fixes both deliberately: team size is SAMPLED rather than grown by
 * marginal gain, and member choice is softmax-weighted with a penalty on agents
 * already over-represented in the sweep.
 */
export interface ExploreConfig {
  /** Probability of sampling a member rather than taking the argmax, 0..1. */
  epsilon: number;
  /** Seed for reproducibility. Vary per task to avoid identical teams. */
  seed: number;
  /** Teams each agent has already appeared in, across this sweep. */
  usage?: Record<string, number>;
  /** Teams composed so far, the denominator for usage share. */
  teamsSoFar?: number;
  /** How hard to penalize an over-used agent. */
  usageWeight?: number;
}

export const DEFAULT_EPSILON = 0.5;
export const DEFAULT_USAGE_WEIGHT = 1.5;

export interface ComposeHiveArgs {
  candidates: HiveMemberCandidate[];
  /** Capabilities the objective needs covered. Empty = no coverage requirement. */
  required: string[];
  maxSize?: number;
  /** Hard spend ceiling for the whole team. */
  budget?: number;
  weights?: HiveWeights;
  /**
   * Dataset-generation mode. Absent = deterministic argmax, byte-for-byte the
   * production policy. Present = deliberately varied teams for training data.
   */
  explore?: ExploreConfig;
}

export const DEFAULT_MAX_HIVE_SIZE = 4;

/**
 * Greedily grow a team, keeping it only while each addition earns its place.
 *
 * Starts from the best solo agent and adds the member with the highest marginal
 * score gain, stopping as soon as no addition improves the objective. That makes
 * a SOLO result the default rather than a special case — which matches the data,
 * where solo scored highest on average and no size monotonicity exists.
 *
 * `hive_beats_solo` records whether teaming actually won, so the caller can
 * report the comparison instead of assuming a hive was the right call.
 */
export function composeHive(args: ComposeHiveArgs): HiveComposition | null {
  const maxSize = Math.max(1, args.maxSize ?? DEFAULT_MAX_HIVE_SIZE);
  const budget = args.budget;
  const affordable = args.candidates.filter(
    (c) => budget === undefined || c.cost <= budget,
  );
  if (affordable.length === 0) return null;

  const costReference =
    budget && budget > 0
      ? budget
      : Math.max(...affordable.map((c) => c.cost), 1);
  const scoreOf = (members: HiveMemberCandidate[]) =>
    scoreHive(members, {
      required: args.required,
      weights: args.weights,
      costReference,
    });

  // ── exploration branch: dataset generation, not the production policy ──
  if (args.explore && args.explore.epsilon > 0) {
    const cfg = args.explore;
    const rand = seededRandom(cfg.seed);
    const teamsSoFar = Math.max(0, cfg.teamsSoFar ?? 0);
    const usage = cfg.usage ?? {};
    const usageWeight = cfg.usageWeight ?? DEFAULT_USAGE_WEIGHT;

    // Penalize agents already over-represented, which is what makes an agent's
    // individual effect unidentifiable (see assessFittability's ubiquity check).
    const adjusted = affordable.map((c) => {
      const share = teamsSoFar > 0 ? (usage[c.agent_id] ?? 0) / teamsSoFar : 0;
      return { candidate: c, weight: Math.max(0.01, 1 - usageWeight * share) };
    });

    // Team size is SAMPLED, not grown by marginal gain. Marginal gain is
    // deterministic given the candidates, so it produced one size for every
    // task in the pilot and left team size unidentifiable.
    const upper = Math.min(maxSize, affordable.length);
    const targetSize = 1 + Math.floor(rand() * upper);

    const picked: HiveMemberCandidate[] = [];
    const pool = [...adjusted];
    while (picked.length < targetSize && pool.length > 0) {
      const trialCost = (c: HiveMemberCandidate) =>
        picked.reduce((a, m) => a + Math.max(0, m.cost), 0) + Math.max(0, c.cost);
      const eligible = pool.filter(
        (p) => budget === undefined || trialCost(p.candidate) <= budget,
      );
      if (eligible.length === 0) break;

      let choice: (typeof eligible)[number];
      if (rand() < cfg.epsilon) {
        // Explore: usage-weighted sample, so under-used agents surface.
        const total = eligible.reduce((a, e) => a + e.weight, 0);
        let r = rand() * total;
        choice = eligible[eligible.length - 1];
        for (const e of eligible) {
          r -= e.weight;
          if (r <= 0) {
            choice = e;
            break;
          }
        }
      } else {
        // Exploit: best marginal score, still usage-weighted on ties.
        let bestMarginal = -Infinity;
        choice = eligible[0];
        for (const e of eligible) {
          const marginal =
            scoreOf([...picked, e.candidate]).score + 0.001 * e.weight;
          if (marginal > bestMarginal) {
            bestMarginal = marginal;
            choice = e;
          }
        }
      }
      picked.push(choice.candidate);
      pool.splice(pool.indexOf(choice), 1);
    }

    if (picked.length === 0) return null;
    const exploredScored = scoreOf(picked);
    // The solo baseline is still computed honestly, so the paired comparison
    // stays meaningful even when the team itself was sampled.
    let soloBest = -Infinity;
    for (const c of affordable) {
      soloBest = Math.max(soloBest, scoreOf([c]).score);
    }
    return {
      members: picked,
      scored: exploredScored,
      rationale:
        `Explore (epsilon ${cfg.epsilon}, seed ${cfg.seed}): sampled team of ` +
        `${picked.length} for dataset coverage, not policy choice.`,
      hive_beats_solo:
        picked.length > 1 && exploredScored.score > soloBest + 1e-9,
      best_solo_score: Number(soloBest.toFixed(6)),
      explored: true,
    };
  }

  // Best solo baseline — the thing a hive must beat to justify itself.
  let best: HiveMemberCandidate[] = [];
  let bestScore = -Infinity;
  for (const c of affordable) {
    const s = scoreOf([c]).score;
    if (s > bestScore) {
      bestScore = s;
      best = [c];
    }
  }
  const bestSoloScore = bestScore;

  // Grow while an addition strictly improves the objective and fits the budget.
  let improved = true;
  while (improved && best.length < maxSize) {
    improved = false;
    let bestAddition: HiveMemberCandidate | null = null;
    let bestAdditionScore = bestScore;
    for (const c of affordable) {
      if (best.some((m) => m.agent_id === c.agent_id)) continue;
      const trial = [...best, c];
      const trialCost = trial.reduce((a, m) => a + Math.max(0, m.cost), 0);
      if (budget !== undefined && trialCost > budget) continue;
      const s = scoreOf(trial).score;
      if (s > bestAdditionScore) {
        bestAdditionScore = s;
        bestAddition = c;
      }
    }
    if (bestAddition) {
      best = [...best, bestAddition];
      bestScore = bestAdditionScore;
      improved = true;
    }
  }

  const scored = scoreOf(best);
  const hiveBeatsSolo = best.length > 1 && scored.score > bestSoloScore + 1e-9;
  const gaps = args.required.filter(
    (r) => !best.some((m) => m.capabilities.includes(r)),
  );

  const rationale =
    best.length === 1
      ? `Solo: no addition improved the objective over ${best[0].agent_id} alone.`
      : `Hive of ${best.length}: coverage ${(scored.coverage * 100).toFixed(0)}%, ` +
        `P(delivery) ${(scored.reliability * 100).toFixed(0)}%, ` +
        `${scored.diversity < 1 ? "shared failure domains present" : "independent failure domains"}` +
        `, beats best solo by ${(scored.score - bestSoloScore).toFixed(4)}.` +
        (gaps.length > 0 ? ` Uncovered: ${gaps.join(", ")}.` : "");

  return {
    members: best,
    scored,
    rationale,
    hive_beats_solo: hiveBeatsSolo,
    best_solo_score: Number(bestSoloScore.toFixed(6)),
    explored: false,
  };
}

/**
 * Training row for a future fit. Emitted per executed hive so the weights above
 * can eventually be replaced by measurement instead of judgement.
 *
 * `goal_family` is mandatory because goal type dominated team composition in the
 * historical data — a fit that ignores it will relearn "this goal is hard" and
 * mislabel it as team quality.
 */
export interface HiveOutcomeRow {
  objective: string;
  goal_family: string;
  members: string[];
  team_size: number;
  coverage: number;
  reliability: number;
  diversity: number;
  cost: number;
  /** Observed quality, 0..1. */
  outcome_quality: number;
  /** Quality of the best solo run on the SAME objective, when one exists. */
  solo_baseline_quality?: number;
  /**
   * True when exploration sampled this team rather than the policy choosing it.
   *
   * Off-policy provenance. Exploratory rows are what make agent and team-size
   * effects identifiable, but a fit that treats them as policy decisions will
   * mistake "the sampler tried this" for "the policy prefers this".
   */
  explored?: boolean;
}

/**
 * Is a labelled set fittable yet?
 *
 * Guards the exact trap the historical data fell into: too few rows, only one
 * goal family, or a member present in nearly every team (whose contribution is
 * then unidentifiable). Returns the blocking reasons rather than a boolean so
 * the caller can report what is missing.
 */
export function assessFittability(rows: HiveOutcomeRow[]): {
  fittable: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (rows.length < MIN_ROWS_TO_FIT) {
    reasons.push(`only ${rows.length} labelled teams (need >= ${MIN_ROWS_TO_FIT})`);
  }
  const families = new Set(rows.map((r) => r.goal_family));
  if (families.size < 2) {
    reasons.push("all rows share one goal family, so goal difficulty is not separable");
  }
  const sizes = new Set(rows.map((r) => r.team_size));
  if (sizes.size < 2) reasons.push("no team-size variation");
  const counts = new Map<string, number>();
  for (const r of rows) for (const m of new Set(r.members)) {
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  for (const [agent, n] of counts) {
    if (rows.length > 0 && n / rows.length > UBIQUITY_LIMIT) {
      reasons.push(
        `${agent} appears in ${n}/${rows.length} teams — its effect is not identifiable`,
      );
    }
  }
  const withBaseline = rows.filter(
    (r) => typeof r.solo_baseline_quality === "number",
  ).length;
  if (withBaseline < rows.length / 2) {
    reasons.push("fewer than half the rows carry a solo baseline to compare against");
  }
  // A corpus generated purely by the policy tends to confound itself: the policy
  // keeps picking its favourites, so their effect cannot be separated. Some
  // exploration is required for the estimates to be identifiable.
  const exploredRows = rows.filter((r) => r.explored === true).length;
  if (rows.length > 0 && exploredRows / rows.length < MIN_EXPLORE_SHARE) {
    reasons.push(
      `only ${exploredRows}/${rows.length} rows came from exploration ` +
        `(need >= ${Math.round(MIN_EXPLORE_SHARE * 100)}% for identifiability)`,
    );
  }
  return { fittable: reasons.length === 0, reasons };
}

/** Below this a fit cannot separate team effects from noise. */
export const MIN_ROWS_TO_FIT = 60;
/** A member in more than this share of teams has an unidentifiable effect. */
export const UBIQUITY_LIMIT = 0.9;
/** Minimum share of rows that must come from exploration, not policy. */
export const MIN_EXPLORE_SHARE = 0.25;
