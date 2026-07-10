// Hive router pure helpers (Layer 5). No Convex, no I/O — just deterministic
// string/number functions used by convex/hiveRouter.ts and exercised directly
// in router-core.test.ts.

const ROUTING_QUERY_MAX_CHARS = 1500;
const MAX_HINT_LINES = 3;
const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlag(name: string): boolean {
  return TRUE_ENV_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

function enabledUnlessDisabled(enabledName: string, disabledName: string): boolean {
  return !envFlag(disabledName) && envFlag(enabledName);
}

/**
 * Build the semantic-search query string for routing a single DAG node.
 * Layout: node description, then the success criteria line (if present), then
 * up to 3 scratchpad hint lines. The whole thing is clamped to 1500 chars so
 * it stays well inside embedding limits.
 */
export function buildRoutingQuery(
  node: { description: string; success_criteria?: string },
  scratchpadHints: string[],
): string {
  const lines: string[] = [node.description];
  if (node.success_criteria && node.success_criteria.trim()) {
    lines.push(`Success criteria: ${node.success_criteria.trim()}`);
  }
  for (const hint of scratchpadHints.slice(0, MAX_HINT_LINES)) {
    if (hint && hint.trim()) lines.push(hint.trim());
  }
  return lines.join("\n").slice(0, ROUTING_QUERY_MAX_CHARS);
}

/**
 * Even split of a DAG's budget across its nodes, rounded to cents. Guards
 * against a zero node count so the divisor is never 0.
 *
 * Legacy fallback — routing now uses allocateNodeBudget (SeqRoute-style
 * forward-looking allocation); this remains for degenerate inputs and tests.
 */
export function perNodeBudget(dagBudget: number, nodeCount: number): number {
  return Number((dagBudget / Math.max(1, nodeCount)).toFixed(2));
}

// ─── SeqRoute-style global budget allocation (W2) ───────────────────────────
//
// Instead of a greedy even split of the ORIGINAL budget over ALL nodes, each
// routing decision allocates from the REMAINING budget (original minus realized
// spend) across the UNFINISHED nodes, weighted by estimated difficulty, with a
// reserve multiplier that keeps budget back for deeper (later) nodes. This is
// the heuristic value function from the SeqRoute framing (arXiv:2605.25424);
// the allocation inputs are logged per node so an offline-RL policy can replace
// the heuristic later without a schema change.

export interface AllocatableNode {
  node_id: string;
  description: string;
  success_criteria?: string;
  task_class?: string;
  depends_on: string[];
  status: string;
}

const SETTLED_STATUSES = new Set(["complete", "failed"]);

/** Task classes ranked by how model-expensive their nodes tend to be. */
const CLASS_WEIGHTS: Record<string, number> = {
  reasoning: 1.3,
  generation: 1.2,
  extraction: 0.9,
  classification: 0.7,
};
const DEFAULT_CLASS_WEIGHT = 1.0;

/** How strongly deeper (later) nodes hold budget in reserve. */
const DEPTH_RESERVE = 0.25;
/** How much a long, detailed spec raises estimated difficulty (max +50%). */
const LENGTH_FACTOR_MAX = 0.5;
const LENGTH_SATURATION_CHARS = 600;

/**
 * Longest-dependency-path depth for every node (roots = 0). Unknown or cyclic
 * dependencies are treated as depth 0 contributors so a malformed DAG can
 * never wedge the allocator.
 */
export function nodeDepths(nodes: AllocatableNode[]): Record<string, number> {
  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  const depths: Record<string, number> = {};
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    if (depths[id] !== undefined) return depths[id];
    if (visiting.has(id)) return 0; // cycle guard
    const node = byId.get(id);
    if (!node) return 0;
    visiting.add(id);
    let depth = 0;
    for (const dep of node.depends_on) {
      if (!byId.has(dep)) continue;
      depth = Math.max(depth, depthOf(dep) + 1);
    }
    visiting.delete(id);
    depths[id] = depth;
    return depth;
  };

  for (const node of nodes) depthOf(node.node_id);
  return depths;
}

/**
 * Deterministic difficulty estimate for one node: task-class weight, scaled up
 * for long/detailed specs and for depth (later steps hold a reserve).
 */
export function estimateNodeDifficulty(
  node: AllocatableNode,
  depth: number,
  maxDepth: number,
): number {
  const classWeight =
    CLASS_WEIGHTS[(node.task_class ?? "").toLowerCase()] ?? DEFAULT_CLASS_WEIGHT;
  const specChars =
    node.description.length + (node.success_criteria?.length ?? 0);
  const lengthFactor =
    1 +
    LENGTH_FACTOR_MAX * Math.min(1, specChars / LENGTH_SATURATION_CHARS);
  const depthFactor =
    1 + (maxDepth > 0 ? DEPTH_RESERVE * (depth / maxDepth) : 0);
  return classWeight * lengthFactor * depthFactor;
}

/**
 * Budget ceiling for auctioning `nodeId` right now.
 *
 * remaining = max(0, dagBudget - spent); the node receives its difficulty-
 * weighted share of `remaining` across all unfinished nodes. Settled nodes
 * (complete/failed) are out of the pool — their money is either spent (counted
 * in `spent`) or freed for the survivors. Returns cents-rounded, never more
 * than `remaining`, and 0 once the budget is exhausted (the W6 floor still
 * guarantees delivery; it just runs on last-resort economics).
 */
export function allocateNodeBudget(args: {
  dagBudget: number;
  spent: number;
  nodes: AllocatableNode[];
  nodeId: string;
}): number {
  const remaining = Math.max(0, args.dagBudget - Math.max(0, args.spent));
  if (remaining === 0) return 0;

  const unfinished = args.nodes.filter(
    (node) => !SETTLED_STATUSES.has(node.status),
  );
  const target =
    unfinished.find((node) => node.node_id === args.nodeId) ??
    args.nodes.find((node) => node.node_id === args.nodeId);
  if (!target) return perNodeBudget(remaining, Math.max(1, unfinished.length));

  const pool = unfinished.some((node) => node.node_id === args.nodeId)
    ? unfinished
    : [...unfinished, target];

  const depths = nodeDepths(args.nodes);
  const maxDepth = Math.max(0, ...Object.values(depths));
  let totalWeight = 0;
  let targetWeight = 0;
  for (const node of pool) {
    const weight = estimateNodeDifficulty(
      node,
      depths[node.node_id] ?? 0,
      maxDepth,
    );
    totalWeight += weight;
    if (node.node_id === args.nodeId) targetWeight = weight;
  }
  if (totalWeight <= 0) return perNodeBudget(remaining, pool.length);

  const share = remaining * (targetWeight / totalWeight);
  return Math.min(remaining, Number(share.toFixed(2)));
}

/**
 * Decide whether routing should fall back to an open auction (no invited
 * shortlist). True when the registry returned fewer than 2 candidates, or when
 * even the best match is too weak (similarity < 0.15) to trust as a shortlist.
 */
export function shouldFallbackOpen(
  candidates: Array<{ similarity: number }>,
): boolean {
  if (candidates.length < 2) return true;
  const best = Math.max(...candidates.map((c) => c.similarity));
  return best < 0.15;
}

// ─── Orchestrator-first direct assignment ────────────────────────────────────
//
// An auction earns its latency and token cost only when several genuinely
// independent, ready agents can compete on price for the node. When the market
// for a node's task class is thin — which for most classes it currently is —
// the profile-weighted 4D rank already knows the best agent, and a bid round
// is pure overhead (bid window wall-clock, solicit fan-out, plausibility
// screens). Direct mode assigns the top-ranked ready candidate immediately by
// writing a single synthetic bid and resolving at once, so the ENTIRE existing
// pipeline (escrow, execute receipt rule, judge, settle, W6 floor on failure)
// runs unchanged downstream.

/**
 * Orchestrator-first master switch (mirrors the OpenRouter/TOON/best-of-N
 * rollout pattern). Default off keeps routing byte-for-byte on the auction
 * path; ARBOR_ORCHESTRATOR_FIRST_DISABLED is the kill switch that wins.
 */
export function orchestratorFirstEnabled(): boolean {
  return enabledUnlessDisabled(
    "ARBOR_ORCHESTRATOR_FIRST_ENABLED",
    "ARBOR_ORCHESTRATOR_FIRST_DISABLED",
  );
}

/** With at least this many independent ready candidates, the market is liquid
 * enough that a real auction beats direct assignment
 * (ARBOR_DIRECT_ROUTE_LIQUIDITY, default 3, clamped to [2, 10]). */
export function directRouteLiquidity(): number {
  const raw = Number.parseInt(
    process.env.ARBOR_DIRECT_ROUTE_LIQUIDITY ?? "",
    10,
  );
  if (!Number.isFinite(raw)) return DEFAULT_DIRECT_LIQUIDITY;
  return Math.max(2, Math.min(10, raw));
}

export const DEFAULT_DIRECT_LIQUIDITY = 3;

/** Availability score (W4 readiness mapping) at or above which a candidate
 * counts as genuinely ready: `ready` maps to 1.0, `mock_only` to 0.3, unknown
 * to 0.5 — so 0.9 admits only fresh-smoke `ready` agents. */
export const READY_AVAILABILITY = 0.9;

export interface RouteModeCandidate {
  agent_id: string;
  availability_score?: number;
  cost_baseline?: number;
  /** Raw semantic/capability match. Expert mode must clear the same 0.15
   * safety floor used before retaining a closed shortlist. */
  similarity?: number;
  capability_score?: number;
  /** Profile-blended rank score (W3), when the caller ranked with profiles. */
  routing_score?: number;
}

// ─── Expert delegation (Fugu-style confident direct assignment) ──────────────
//
// The thin-market gate above only skips the auction when there is no market.
// Expert delegation goes further: when the W3 flywheel has enough evidence
// that the top-ranked candidate is a PROVEN expert for this task class — and
// its blended rank clears the runner-up by a real margin — the orchestrator
// already knows the auction's answer, so running one buys nothing but a bid
// window of latency and solicit fan-out of tokens. This is the heuristic
// stand-in for Sakana Fugu's trained conductor (arXiv:2606.21228): route on
// profile confidence, fall back to the market when confidence is thin.

/**
 * Expert-delegation master switch (same pattern as orchestrator-first).
 * Default off; ARBOR_EXPERT_DELEGATION_DISABLED is the kill switch that wins.
 */
export function expertDelegationEnabled(): boolean {
  return enabledUnlessDisabled(
    "ARBOR_EXPERT_DELEGATION_ENABLED",
    "ARBOR_EXPERT_DELEGATION_DISABLED",
  );
}

/** Evaluate the expert policy without changing assignment or invite count. */
export function expertDelegationShadowEnabled(): boolean {
  return enabledUnlessDisabled(
    "ARBOR_EXPERT_DELEGATION_SHADOW",
    "ARBOR_EXPERT_DELEGATION_DISABLED",
  );
}

export const DEFAULT_EXPERT_MIN_TASKS = 8;

/** Minimum settled-task evidence before an agent can count as a proven expert
 * (ARBOR_EXPERT_MIN_TASKS, default 8, clamped to [5, 50]). */
export function expertMinTasks(): number {
  const raw = Number.parseInt(process.env.ARBOR_EXPERT_MIN_TASKS ?? "", 10);
  if (!Number.isFinite(raw)) return DEFAULT_EXPERT_MIN_TASKS;
  return Math.max(5, Math.min(50, raw));
}

/** Flywheel bars a proven expert must clear (EWMA over settled nodes). */
export const EXPERT_MIN_SUCCESS_RATE = 0.85;
export const EXPERT_MIN_QUALITY = 0.65;
export const EXPERT_MIN_SUCCESS_LOWER_BOUND = 0.6;
export const EXPERT_MIN_CAPABILITY_SCORE = 0.15;
/** Blended-rank margin the expert must hold over the runner-up. With no
 * runner-up, or with missing/non-finite scores, the match is rejected. */
export const EXPERT_MIN_MARGIN = 0.08;

/** One-sided conservative success estimate. The profile still uses an EWMA
 * for ranking, while this bound uses the cumulative success count exclusively
 * for the higher-risk decision to bypass an auction. */
export function wilsonLowerBound(
  successes: number,
  trials: number,
  z = 1.64,
): number {
  if (
    !Number.isFinite(successes) ||
    !Number.isFinite(trials) ||
    !Number.isFinite(z) ||
    trials <= 0 ||
    z < 0
  ) {
    return 0;
  }
  const n = Math.max(0, Math.floor(trials));
  if (n === 0) return 0;
  const wins = Math.max(0, Math.min(n, Math.floor(successes)));
  const p = wins / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, Math.min(1, (center - spread) / denominator));
}

/** The profile evidence decideRouteMode needs — a projection of the W3
 * AgentProfile so the pure layer stays decoupled from profile-core. */
export interface RouteModeProfileSignal {
  task_class?: string;
  tasks: number;
  successful_tasks?: number;
  success_trials?: number;
  success_rate: number;
  avg_quality: number;
}

interface ExpertEvidence {
  tasks: number;
  successLowerBound: number;
  scoreMargin: number;
  capabilityScore: number;
}

function finiteUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function exactSuccessEvidence(
  profile: RouteModeProfileSignal,
): { successes: number; trials: number } | undefined {
  if (
    !Number.isFinite(profile.successful_tasks) ||
    !Number.isFinite(profile.success_trials)
  ) {
    return undefined;
  }
  const trials = Math.max(0, Math.floor(profile.success_trials ?? 0));
  const successes = Math.max(
    0,
    Math.min(trials, Math.floor(profile.successful_tasks ?? 0)),
  );
  return { successes, trials };
}

function findExpertTarget(
  independentReady: RouteModeCandidate[],
  profiles: ReadonlyMap<string, RouteModeProfileSignal> | undefined,
  minTasks: number,
  taskClass: string | undefined,
):
  | {
      target: RouteModeCandidate;
      profile: RouteModeProfileSignal;
      evidence: ExpertEvidence;
    }
  | undefined {
  if (!profiles) return undefined;
  const target = independentReady[0];
  const runnerUp = independentReady[1];
  if (!target || !runnerUp) return undefined;
  const profile = profiles.get(target.agent_id);
  const capabilityScore = target.capability_score ?? target.similarity;
  const exactEvidence = profile ? exactSuccessEvidence(profile) : undefined;
  const tasks = exactEvidence?.trials ?? 0;
  const successLowerBound = exactEvidence
    ? wilsonLowerBound(exactEvidence.successes, exactEvidence.trials)
    : 0;
  if (
    !profile ||
    (taskClass !== undefined && profile.task_class !== taskClass) ||
    !Number.isFinite(tasks) ||
    tasks < minTasks ||
    !finiteUnitInterval(profile.success_rate) ||
    !finiteUnitInterval(profile.avg_quality) ||
    profile.success_rate < EXPERT_MIN_SUCCESS_RATE ||
    profile.avg_quality < EXPERT_MIN_QUALITY ||
    successLowerBound < EXPERT_MIN_SUCCESS_LOWER_BOUND ||
    capabilityScore === undefined ||
    !finiteUnitInterval(capabilityScore) ||
    capabilityScore < EXPERT_MIN_CAPABILITY_SCORE ||
    !Number.isFinite(target.routing_score) ||
    !Number.isFinite(runnerUp.routing_score)
  ) {
    return undefined;
  }
  const scoreMargin =
    (target.routing_score as number) - (runnerUp.routing_score as number);
  if (!Number.isFinite(scoreMargin) || scoreMargin < EXPERT_MIN_MARGIN) {
    return undefined;
  }
  return {
    target,
    profile,
    evidence: { tasks, successLowerBound, scoreMargin, capabilityScore },
  };
}

// ─── Confidence-adaptive auction sizing ──────────────────────────────────────
//
// When the auction does run, its size is the second lever: every invited agent
// costs a solicit call, a plausibility screen, and bid processing. With proven
// profiles at the top of the rank, the long tail of low-ranked invitees adds
// cost without adding a plausible winner — so prune to a small competitive set.
// A cold market (no evidence) keeps the full exploratory shortlist, and the
// uncertainty bonus in profileWeightedRank keeps sampling new agents.

export const FULL_SHORTLIST_INVITES = 6;
export const CONFIDENT_SHORTLIST_INVITES = 3;
/** Success bar for "proven" in auction pruning — deliberately lower than the
 * expert-direct bar: pruning still runs a competitive auction, so it needs
 * less certainty than skipping the market entirely. */
export const PROVEN_MIN_SUCCESS_RATE = 0.6;
export const PROVEN_MIN_QUALITY = 0.55;
export const PROVEN_MIN_SUCCESS_LOWER_BOUND = 0.4;

/**
 * How many ranked candidates to invite into the auction. Prunes to the top 3
 * only when at least 2 of those top 3 are proven (enough evidence + decent
 * success rate) — the auction stays competitive among known-good agents.
 * Anything less keeps today's full shortlist.
 */
export function adaptiveInviteCount(args: {
  enabled: boolean;
  candidates: RouteModeCandidate[];
  profiles?: ReadonlyMap<string, RouteModeProfileSignal>;
  minTasks: number;
}): number {
  const unique: RouteModeCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of args.candidates) {
    if (seen.has(candidate.agent_id)) continue;
    seen.add(candidate.agent_id);
    unique.push(candidate);
  }
  const fullCount = Math.min(FULL_SHORTLIST_INVITES, unique.length);
  if (!args.enabled || !args.profiles) return fullCount;
  let proven = 0;
  for (const candidate of unique.slice(
    0,
    CONFIDENT_SHORTLIST_INVITES,
  )) {
    if ((candidate.availability_score ?? 0) < READY_AVAILABILITY) continue;
    const profile = args.profiles.get(candidate.agent_id);
    const evidence = profile ? exactSuccessEvidence(profile) : undefined;
    if (
      profile &&
      evidence !== undefined &&
      evidence.trials >= args.minTasks &&
      finiteUnitInterval(profile.success_rate) &&
      profile.success_rate >= PROVEN_MIN_SUCCESS_RATE &&
      finiteUnitInterval(profile.avg_quality) &&
      profile.avg_quality >= PROVEN_MIN_QUALITY &&
      wilsonLowerBound(
        evidence.successes,
        evidence.trials,
      ) >=
        PROVEN_MIN_SUCCESS_LOWER_BOUND
    ) {
      proven += 1;
    }
  }
  return proven >= 2
    ? Math.min(CONFIDENT_SHORTLIST_INVITES, unique.length)
    : fullCount;
}

export interface RouteModeInput {
  enabled: boolean;
  forceOpen: boolean;
  isFanout: boolean;
  revisionCount: number;
  budget: number;
  /** Profile-weighted rank order (best first), floors excluded upstream. */
  candidates: RouteModeCandidate[];
  floorAgentIds: Iterable<string>;
  liquidityThreshold: number;
  /** Observed avg price per agent_id from the W3 flywheel, when available. */
  profilePrices?: ReadonlyMap<string, number>;
  /** Expert delegation (default off): confident direct assignment even on a
   * liquid market, driven by W3 profile evidence. */
  expertEnabled?: boolean;
  expertMinTasks?: number;
  taskClass?: string;
  profiles?: ReadonlyMap<string, RouteModeProfileSignal>;
}

export interface RouteModeDecision {
  mode: "direct" | "auction";
  reason: string;
  direct_agent_id?: string;
  direct_price?: number;
  independent_ready_count: number;
  expert_tasks?: number;
  expert_success_lower_bound?: number;
  expert_score_margin?: number;
  expert_capability_score?: number;
}

function resolveDirectPrice(
  target: RouteModeCandidate,
  profilePrices: ReadonlyMap<string, number> | undefined,
  budget: number,
): number {
  const profilePrice = profilePrices?.get(target.agent_id);
  const rawPrice =
    profilePrice !== undefined && Number.isFinite(profilePrice) && profilePrice > 0
      ? profilePrice
      : target.cost_baseline !== undefined &&
          Number.isFinite(target.cost_baseline) &&
          target.cost_baseline > 0
        ? target.cost_baseline
        : budget;
  return Number(Math.min(budget, Math.max(0, rawPrice)).toFixed(2));
}

/**
 * Choose direct assignment vs. Vickrey auction for one node. Conservative by
 * design: every special path (force_open safety valve, best-of-N fan-out,
 * consensus revisions, exhausted budget) stays on the battle-tested auction
 * machinery; only the plain thin-market first attempt goes direct.
 *
 * Direct price: the agent's observed flywheel price when we have one, else its
 * registry cost baseline, else the node ceiling — always clamped to budget so
 * direct mode can never outspend what the auction path would have allowed.
 */
export function decideRouteMode(input: RouteModeInput): RouteModeDecision {
  const floors = new Set(input.floorAgentIds);
  const independentReady = input.candidates.filter(
    (c) =>
      !floors.has(c.agent_id) &&
      (c.availability_score ?? 0) >= READY_AVAILABILITY,
  );
  const base = { independent_ready_count: independentReady.length };

  if (!input.enabled && !input.expertEnabled) {
    return { mode: "auction", reason: "orchestrator_first_disabled", ...base };
  }
  if (input.forceOpen) {
    return { mode: "auction", reason: "force_open_retry", ...base };
  }
  if (input.isFanout) {
    return { mode: "auction", reason: "best_of_n_fanout", ...base };
  }
  if (input.revisionCount > 0) {
    return { mode: "auction", reason: "consensus_revision", ...base };
  }
  if (!Number.isFinite(input.budget) || input.budget <= 0) {
    return { mode: "auction", reason: "budget_exhausted", ...base };
  }

  // Expert match beats the liquidity check: a proven expert with a clear rank
  // margin is direct-assigned even when the market could support an auction.
  if (input.expertEnabled) {
    const expert = findExpertTarget(
      independentReady,
      input.profiles,
      input.expertMinTasks ?? DEFAULT_EXPERT_MIN_TASKS,
      input.taskClass,
    );
    if (expert) {
      return {
        mode: "direct",
        reason: "expert_match",
        direct_agent_id: expert.target.agent_id,
        direct_price: resolveDirectPrice(
          expert.target,
          input.profilePrices,
          input.budget,
        ),
        expert_tasks: expert.evidence.tasks,
        expert_success_lower_bound: expert.evidence.successLowerBound,
        expert_score_margin: expert.evidence.scoreMargin,
        expert_capability_score: expert.evidence.capabilityScore,
        ...base,
      };
    }
  }
  // Thin-market direct assignment below requires orchestrator-first proper.
  if (!input.enabled) {
    return { mode: "auction", reason: "expert_no_match", ...base };
  }
  if (independentReady.length >= input.liquidityThreshold) {
    return {
      mode: "auction",
      reason: `liquid_market_${independentReady.length}_ready`,
      ...base,
    };
  }
  const target = independentReady[0];
  if (!target) {
    return { mode: "auction", reason: "no_ready_direct_target", ...base };
  }

  return {
    mode: "direct",
    reason: `thin_market_${independentReady.length}_ready`,
    direct_agent_id: target.agent_id,
    direct_price: resolveDirectPrice(target, input.profilePrices, input.budget),
    ...base,
  };
}
