// Presentation logic for the DAG replay view (the "discard pile").
//
// Every other agent product shows you the output. Arbor is the only one that can
// show you what it rejected and why — the judge verdicts, the disagreements
// between judges, and the money spent on work that never shipped. That is the
// verification claim made auditable, so the arithmetic behind it belongs in a
// tested module rather than inline in JSX.
//
// The failure modes here are all flattering ones, which is exactly why they need
// tests: counting a rejected node as delivered, hiding a split verdict behind an
// average, or reporting spend on escalated work as if it bought something. A
// replay that only shows wins is marketing, not evidence.

/** Mirrors the `verdict` union on the hive_evaluations table. */
export type Verdict = "accept" | "reject";

/** Mirrors the `status` union on the hive_dags table. */
export type DagStatus =
  | "planning"
  | "running"
  | "evaluating"
  | "complete"
  | "failed"
  | "escalated";

export interface ReplayNode {
  node_id: string;
  description: string;
  depends_on: string[];
  status: string;
  assigned_agent_id?: string;
  eval_score?: number;
  revision_count?: number;
  cost_paid?: number;
  bid_price?: number;
  success_criteria?: string;
}

export interface ReplayEvaluation {
  node_id?: string;
  agent_id: string;
  score: number;
  verdict: Verdict;
  reasoning: string;
  judge_model: string;
  conflicts_with?: string[];
  created_at: number;
}

export interface ReplayEscalation {
  kind: "low_confidence" | "conflict_tie";
  reason: string;
  status: "open" | "resolved";
  resolution?: string;
  created_at: number;
}

/**
 * Score gap between the most and least generous judge on one node, beyond which
 * we surface a disagreement even when every judge landed on the same verdict.
 * Judges that agree on the call but not the margin are still worth showing.
 */
export const SPREAD_THRESHOLD = 0.25;

export interface NodeDisagreement {
  node_id: string;
  accepts: number;
  rejects: number;
  scoreSpread: number;
  highest: ReplayEvaluation;
  lowest: ReplayEvaluation;
  /**
   * The single most generous judge accepted work that the majority rejected.
   * This is the captured-rubber-stamp pattern and the most damning thing the
   * replay can show, so it gets its own flag rather than hiding inside `split`.
   */
  optimisticOutlier: boolean;
  severity: "none" | "spread" | "split";
}

/** Evaluations carrying a node_id, keyed by node. DAG-level rows are dropped. */
export function groupEvaluationsByNode(
  evaluations: ReplayEvaluation[],
): Map<string, ReplayEvaluation[]> {
  const grouped = new Map<string, ReplayEvaluation[]>();
  for (const evaluation of evaluations) {
    if (!evaluation.node_id) continue;
    const bucket = grouped.get(evaluation.node_id);
    if (bucket) bucket.push(evaluation);
    else grouped.set(evaluation.node_id, [evaluation]);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => b.score - a.score);
  }
  return grouped;
}

/**
 * Characterize how much the judges on one node disagreed. Returns null for a
 * node with fewer than two evaluations — a lone judge cannot disagree, and
 * rendering "no conflict" there would overstate the amount of checking done.
 */
export function detectDisagreement(
  node_id: string,
  evaluations: ReplayEvaluation[],
): NodeDisagreement | null {
  if (evaluations.length < 2) return null;

  const ranked = [...evaluations].sort((a, b) => b.score - a.score);
  const highest = ranked[0];
  const lowest = ranked[ranked.length - 1];
  const accepts = ranked.filter((e) => e.verdict === "accept").length;
  const rejects = ranked.length - accepts;
  const scoreSpread = highest.score - lowest.score;

  const split = accepts > 0 && rejects > 0;
  const severity: NodeDisagreement["severity"] = split
    ? "split"
    : scoreSpread >= SPREAD_THRESHOLD
      ? "spread"
      : "none";

  return {
    node_id,
    accepts,
    rejects,
    scoreSpread,
    highest,
    lowest,
    optimisticOutlier:
      split && accepts === 1 && highest.verdict === "accept" && rejects >= 2,
    severity,
  };
}

export interface LedgerRow {
  agent_id: string;
  nodesWorked: number;
  accepts: number;
  rejects: number;
  costPaid: number;
  bidTotal: number;
  /** Mean of the judged scores this agent's output received, or null if unjudged. */
  meanScore: number | null;
}

/**
 * Per-agent accounting: what each agent was paid and what the judges made of the
 * work. `hive_evaluations.agent_id` identifies the agent whose output was judged
 * (not the judge — that is `judge_model`), so accepts/rejects here are verdicts
 * received, not verdicts issued.
 */
export function buildLedger(
  nodes: ReplayNode[],
  evaluations: ReplayEvaluation[],
): LedgerRow[] {
  const rows = new Map<string, LedgerRow & { scoreSum: number; scoreN: number }>();
  const ensure = (agent_id: string) => {
    let row = rows.get(agent_id);
    if (!row) {
      row = {
        agent_id,
        nodesWorked: 0,
        accepts: 0,
        rejects: 0,
        costPaid: 0,
        bidTotal: 0,
        meanScore: null,
        scoreSum: 0,
        scoreN: 0,
      };
      rows.set(agent_id, row);
    }
    return row;
  };

  for (const node of nodes) {
    if (!node.assigned_agent_id) continue;
    const row = ensure(node.assigned_agent_id);
    row.nodesWorked += 1;
    row.costPaid += node.cost_paid ?? 0;
    row.bidTotal += node.bid_price ?? 0;
  }

  for (const evaluation of evaluations) {
    if (!evaluation.node_id) continue;
    const row = ensure(evaluation.agent_id);
    if (evaluation.verdict === "accept") row.accepts += 1;
    else row.rejects += 1;
    row.scoreSum += evaluation.score;
    row.scoreN += 1;
  }

  return [...rows.values()]
    .map(({ scoreSum, scoreN, ...row }) => ({
      ...row,
      meanScore: scoreN > 0 ? scoreSum / scoreN : null,
    }))
    .sort((a, b) => b.rejects - a.rejects || b.costPaid - a.costPaid);
}

export interface ReplaySummary {
  status: DagStatus;
  /** A DAG only "shipped" if it reached complete. Escalated and failed did not. */
  shipped: boolean;
  nodeCount: number;
  accepts: number;
  rejects: number;
  disagreements: number;
  optimisticOutliers: number;
  escalations: number;
  totalSpend: number;
  maxBudget: number;
  /** Money spent on a DAG that never shipped. Zero when the DAG completed. */
  strandedSpend: number;
  revisionRounds: number;
}

export function summarizeReplay(input: {
  status: DagStatus;
  maxBudget: number;
  nodes: ReplayNode[];
  evaluations: ReplayEvaluation[];
  escalations: ReplayEscalation[];
  disagreements: NodeDisagreement[];
}): ReplaySummary {
  const nodeEvaluations = input.evaluations.filter((e) => e.node_id);
  const totalSpend = input.nodes.reduce((sum, n) => sum + (n.cost_paid ?? 0), 0);
  const shipped = input.status === "complete";

  return {
    status: input.status,
    shipped,
    nodeCount: input.nodes.length,
    accepts: nodeEvaluations.filter((e) => e.verdict === "accept").length,
    rejects: nodeEvaluations.filter((e) => e.verdict === "reject").length,
    disagreements: input.disagreements.filter((d) => d.severity !== "none")
      .length,
    optimisticOutliers: input.disagreements.filter((d) => d.optimisticOutlier)
      .length,
    escalations: input.escalations.length,
    totalSpend,
    maxBudget: input.maxBudget,
    strandedSpend: shipped ? 0 : totalSpend,
    revisionRounds: input.nodes.reduce(
      (sum, n) => sum + (n.revision_count ?? 0),
      0,
    ),
  };
}

/**
 * Topological-ish ordering for rendering: dependencies before dependents. Falls
 * back to input order for cycles or dangling references rather than dropping
 * nodes, since a replay that silently omits a node is worse than a misordered one.
 */
export function orderNodes(nodes: ReplayNode[]): ReplayNode[] {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const placed = new Set<string>();
  const ordered: ReplayNode[] = [];

  const visit = (node: ReplayNode, seen: Set<string>) => {
    if (placed.has(node.node_id) || seen.has(node.node_id)) return;
    seen.add(node.node_id);
    for (const dep of node.depends_on) {
      const parent = byId.get(dep);
      if (parent) visit(parent, seen);
    }
    if (!placed.has(node.node_id)) {
      placed.add(node.node_id);
      ordered.push(node);
    }
  };

  for (const node of nodes) visit(node, new Set());
  return ordered;
}

/**
 * One-line label for a DAG in the replay index.
 *
 * Goals are multi-line and usually open with a line that announces the shape of
 * the work ("Complete this work as a dependency-aware multi-agent project:").
 * That line is identical across runs, so using it as the label renders every row
 * the same and makes the index useless. Skip it and lead with the first line
 * that actually says what the run was for.
 */
export function goalHeadline(goal: string, maxChars = 120): string {
  const lines = goal
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "(no goal recorded)";

  const start = lines.length > 1 && lines[0].endsWith(":") ? 1 : 0;
  const text = lines.slice(start).join(" ").replace(/\s+/g, " ");
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Longest reasoning text among the rejections, used as the headline kill reason. */
export function primaryKillReason(
  evaluations: ReplayEvaluation[],
): ReplayEvaluation | null {
  const rejections = evaluations.filter((e) => e.verdict === "reject");
  if (rejections.length === 0) return null;
  return rejections.reduce((best, current) =>
    current.reasoning.length > best.reasoning.length ? current : best,
  );
}
