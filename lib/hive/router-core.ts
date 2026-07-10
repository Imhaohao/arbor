// Hive router pure helpers (Layer 5). No Convex, no I/O — just deterministic
// string/number functions used by convex/hiveRouter.ts and exercised directly
// in router-core.test.ts.

const ROUTING_QUERY_MAX_CHARS = 1500;
const MAX_HINT_LINES = 3;

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
  const disabled = (process.env.ARBOR_ORCHESTRATOR_FIRST_DISABLED ?? "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(disabled)) return false;
  const value = (process.env.ARBOR_ORCHESTRATOR_FIRST_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
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
}

export interface RouteModeDecision {
  mode: "direct" | "auction";
  reason: string;
  direct_agent_id?: string;
  direct_price?: number;
  independent_ready_count: number;
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

  if (!input.enabled) {
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
  if (input.budget <= 0) {
    return { mode: "auction", reason: "budget_exhausted", ...base };
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

  const profilePrice = input.profilePrices?.get(target.agent_id);
  const rawPrice =
    profilePrice !== undefined && profilePrice > 0
      ? profilePrice
      : target.cost_baseline !== undefined && target.cost_baseline > 0
        ? target.cost_baseline
        : input.budget;
  const direct_price = Number(
    Math.min(input.budget, Math.max(0, rawPrice)).toFixed(2),
  );

  return {
    mode: "direct",
    reason: `thin_market_${independentReady.length}_ready`,
    direct_agent_id: target.agent_id,
    direct_price,
    ...base,
  };
}
