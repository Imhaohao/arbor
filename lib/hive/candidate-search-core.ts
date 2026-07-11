// Sakana-style candidate search for the Arbor hive (best-of-N + AB-MCTS-lite).
//
// Sakana AI's public work is a repeated pattern: generate many candidates,
// score them with a structured signal, search wider (more candidates) or deeper
// (refine a promising one) based on feedback, keep an archive, and promote or
// synthesize the best result (AB-MCTS: arXiv:2503.04412; TreeQuest).
//
// Arbor already generates diversity at the *bidding* stage (many agents compete
// to be chosen) but then executes a single winner — the judge scores a
// population of one. This module is the missing search layer: it decides how
// many real candidate executions to run per node, selects/synthesizes the best
// of the outputs that come back, and (as a later step) decides wider-vs-deeper.
//
// Pure and runtime-agnostic (no Convex imports) so it unit-tests offline and is
// reusable on the client, matching the other lib/hive/*-core.ts modules. All
// live behavior is gated behind ARBOR_HIVE_BESTOFN_ENABLED (default off).

import {
  scoreQualityV2,
  stableOutputHash,
  type QualityScoreVector,
} from "./judge-core";

// ─── Master switch (mirrors OpenRouter/TOON/blackboard rollout pattern) ──────

/**
 * Best-of-N candidate search master switch. Truthy convention matches the rest
 * of the codebase (1/true/yes/on/enabled). Default off keeps the orchestrator's
 * single-winner-per-node path byte-for-byte unchanged.
 */
export function bestOfNEnabled(): boolean {
  const disabled = (process.env.ARBOR_HIVE_BESTOFN_DISABLED ?? "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(disabled)) return false;
  const value = (process.env.ARBOR_HIVE_BESTOFN_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

// ─── Fan-out width (only widen when it pays) ─────────────────────────────────

// The Mar-2026 orchestration survey (doi.org/10.3390/fi18060326) measures large
// token overhead from redundant multi-agent work. Best-of-N is exactly that
// redundancy, so it must earn its cost: only high-value task classes fan out,
// and only when the remaining budget can afford the extra executions.
export const FANOUT_QUALIFYING_CLASSES = new Set<string>([
  "reasoning",
  "generation",
]);

// Task-class hints that some callers pass through (e.g. PR-review / code nodes).
// These are the classes where a second opinion most often changes the answer.
export const FANOUT_HIGH_VALUE_HINTS = ["code", "pr-review", "research"];

export const DEFAULT_MAX_FANOUT = 3;
export const DEFAULT_MIN_FANOUT = 1;

/**
 * Operator-tunable maximum candidates per node (ARBOR_HIVE_BESTOFN_MAX, default
 * 3). Clamped to [1, 5] so a mis-set env can never explode the fan-out.
 */
export function fanoutMaxWidth(): number {
  const raw = Number.parseInt(process.env.ARBOR_HIVE_BESTOFN_MAX ?? "", 10);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_FANOUT;
  return Math.max(1, Math.min(5, raw));
}

/**
 * Minimum budget one candidate needs to be worth launching
 * (ARBOR_HIVE_BESTOFN_MIN_BUDGET, default 10). The node ceiling must afford at
 * least two of these before it fans out, so best-of-N stays budget-sensitive.
 */
export function fanoutMinBudget(): number {
  const raw = Number.parseFloat(process.env.ARBOR_HIVE_BESTOFN_MIN_BUDGET ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  return raw;
}

/**
 * Wall-clock deadline (seconds past the bid window) after which a fanned-out
 * node stops waiting for stragglers and promotes from whatever candidates have
 * settled — or fails to the W6 floor if none did
 * (ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS, default 600, clamped to [60, 3600]).
 *
 * This is the liveness backstop for the barrier: Convex scheduled actions are
 * NOT retried on failure, so a candidate routeNode that throws before minting
 * its child task would otherwise leave settledCount < expected_candidates
 * forever and wedge the node in "executing". It is also the AB-MCTS "hard
 * budget on time" from the Sakana report.
 */
export function fanoutDeadlineSeconds(): number {
  const raw = Number.parseFloat(
    process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS ?? "",
  );
  if (!Number.isFinite(raw)) return 600;
  return Math.max(60, Math.min(3600, raw));
}

export interface FanoutWidthInput {
  enabled: boolean;
  taskClass?: string;
  // Remaining DAG budget already allocated to THIS node (the SeqRoute per-node
  // ceiling). Candidates share it, so width is bounded by how many the ceiling
  // can afford.
  nodeBudget: number;
  // Rough per-candidate cost floor. Below this the ceiling can't split further.
  perCandidateFloor?: number;
  minWidth?: number;
  maxWidth?: number;
  // Optional caller override when it has stronger signal (e.g. a code node the
  // deterministic class missed). When true, the node qualifies regardless of
  // taskClass.
  forceQualifies?: boolean;
}

export interface FanoutWidthResult {
  width: number;
  perCandidateBudget: number;
  qualifies: boolean;
  reason: string;
}

/**
 * Decide how many candidate executions to launch for one node. Returns width=1
 * (the legacy single-winner path) whenever best-of-N is off, the class does not
 * qualify, or the budget cannot afford a second candidate. When it does widen,
 * `perCandidateBudget` splits the node ceiling so K candidates still respect the
 * global DAG budget (no K× overspend).
 */
export function plannedFanoutWidth(input: FanoutWidthInput): FanoutWidthResult {
  const minWidth = Math.max(1, Math.floor(input.minWidth ?? DEFAULT_MIN_FANOUT));
  const maxWidth = Math.max(
    minWidth,
    Math.floor(input.maxWidth ?? DEFAULT_MAX_FANOUT),
  );
  const budget = Number.isFinite(input.nodeBudget)
    ? Math.max(0, input.nodeBudget)
    : 0;
  const floor = Math.max(1e-6, input.perCandidateFloor ?? 1);

  const single = (reason: string): FanoutWidthResult => ({
    width: 1,
    perCandidateBudget: budget,
    qualifies: false,
    reason,
  });

  if (!input.enabled) return single("best-of-N disabled");

  const qualifies =
    input.forceQualifies === true ||
    (typeof input.taskClass === "string" &&
      FANOUT_QUALIFYING_CLASSES.has(input.taskClass.toLowerCase()));
  if (!qualifies) {
    return single(
      `task class "${input.taskClass ?? "unknown"}" not high-value for best-of-N`,
    );
  }

  // How many candidates can the node ceiling afford, at the per-candidate floor?
  const affordable = Math.floor(budget / floor);
  if (affordable < 2) {
    return single(
      `node budget ${budget} cannot afford 2 candidates at floor ${floor}`,
    );
  }

  const width = Math.min(maxWidth, Math.max(minWidth, affordable));
  if (width < 2) return single("computed width < 2");

  return {
    width,
    // Split the ceiling so K candidates together stay within the node budget.
    perCandidateBudget: Math.max(floor, budget / width),
    qualifies: true,
    reason: `fan out ${width} candidates (class ${input.taskClass}, budget ${budget})`,
  };
}

// ─── Candidate archive record ────────────────────────────────────────────────

export type CandidateStatus = "contender" | "promoted" | "rejected";

export interface CandidateRecord {
  candidate_index: number;
  agent_id: string;
  task_id?: string;
  output_text: string;
  // Judge's calibrated quality in [0,1]. Undefined when the candidate produced
  // no judged output (e.g. its auction declined every bid); such candidates
  // still count toward the barrier but are unselectable.
  calibrated_score?: number;
  confidence?: number;
  cost_paid?: number;
  quality?: Partial<QualityScoreVector>;
  status: CandidateStatus;
  generation?: number;
  parent_candidate_id?: string;
}

/**
 * Fold a raw judge verdict into a comparable calibrated score for a candidate.
 * When a full quality vector is present it runs the same judge-core calibration
 * used elsewhere; otherwise it uses the scalar quality score. Returns undefined
 * for candidates with no usable output so selection can skip them.
 */
export function scoreCandidate(input: {
  outputText: string;
  qualityScore?: number;
  quality?: Partial<QualityScoreVector>;
  judgeReliability?: number;
}): { calibrated_score?: number; confidence: number } {
  const hasOutput = input.outputText.trim().length > 0;
  if (!hasOutput) return { calibrated_score: undefined, confidence: 0 };

  if (input.quality && Object.keys(input.quality).length > 0) {
    const v = scoreQualityV2({
      scores: input.quality,
      judgeReliability: input.judgeReliability,
    });
    return { calibrated_score: v.calibrated_score, confidence: v.confidence };
  }

  if (typeof input.qualityScore === "number" && Number.isFinite(input.qualityScore)) {
    const clamped = Math.max(0, Math.min(1, input.qualityScore));
    // Confidence is modest without a full rubric: a single scalar carries less
    // signal than the 8-dimension vector.
    return { calibrated_score: clamped, confidence: 0.4 };
  }

  // Output exists but was never judged — usable as a last resort, low confidence.
  return { calibrated_score: 0.5, confidence: 0.2 };
}

// ─── Selection (promote the best) + synthesis eligibility ────────────────────

export interface SelectionResult {
  winner: CandidateRecord | null;
  ranked: CandidateRecord[];
  margin: number;
  synthesize: boolean;
  reason: string;
}

/**
 * Select the best candidate output by calibrated score. Deterministic tie-break
 * order (higher score → higher confidence → lower cost → stable output hash) so
 * the same archive always promotes the same winner regardless of arrival order.
 * Candidates with no usable output are dropped from contention but not from the
 * archive. Returns winner=null when nothing is selectable (caller then fails the
 * node so the W6 floor backstop can take over).
 */
export function selectBestCandidate(
  candidates: CandidateRecord[],
  opts: { synthesizeEpsilon?: number } = {},
): SelectionResult {
  const selectable = candidates.filter(
    (c) =>
      typeof c.calibrated_score === "number" &&
      Number.isFinite(c.calibrated_score) &&
      c.output_text.trim().length > 0,
  );

  if (selectable.length === 0) {
    return {
      winner: null,
      ranked: [],
      margin: 0,
      synthesize: false,
      reason: "no candidate produced a judged, non-empty output",
    };
  }

  const ranked = [...selectable].sort((a, b) => {
    const sa = a.calibrated_score as number;
    const sb = b.calibrated_score as number;
    if (sb !== sa) return sb - sa;
    const ca = a.confidence ?? 0;
    const cb = b.confidence ?? 0;
    if (cb !== ca) return cb - ca;
    const costA = a.cost_paid ?? Number.POSITIVE_INFINITY;
    const costB = b.cost_paid ?? Number.POSITIVE_INFINITY;
    if (costA !== costB) return costA - costB;
    // Fully deterministic final tie-break, independent of input order.
    const ha = stableOutputHash(a.output_text);
    const hb = stableOutputHash(b.output_text);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });

  const winner = ranked[0];
  const runnerUp = ranked[1];
  const margin =
    runnerUp === undefined
      ? (winner.calibrated_score as number)
      : (winner.calibrated_score as number) - (runnerUp.calibrated_score as number);

  return {
    winner,
    ranked,
    margin,
    synthesize: shouldSynthesize(ranked, opts.synthesizeEpsilon),
    reason:
      runnerUp === undefined
        ? "single selectable candidate"
        : `best of ${ranked.length} by calibrated score (margin ${margin.toFixed(3)})`,
  };
}

export interface CandidateArchivePair<R> {
  row: R;
  record: CandidateRecord;
}

/**
 * Zip archive rows with the CandidateRecords passed to selectBestCandidate so
 * the promoted winner can be mapped back to durable storage without a brittle
 * re-find.
 */
export function pairCandidateArchive<R>(
  rows: R[],
  project: (row: R) => CandidateRecord,
): CandidateArchivePair<R>[] {
  return rows.map((row) => ({ row, record: project(row) }));
}

/**
 * Resolve the archive row for a selected winner. Primary key is
 * candidate_index; task_id and agent_id+output_text disambiguate duplicates or
 * repair a broken index link. Returns undefined when the winner cannot be tied
 * to exactly one row — callers must fail closed instead of promoting nobody.
 */
export function resolveWinnerPair<R>(
  pairs: CandidateArchivePair<R>[],
  winner: CandidateRecord,
  opts: { taskIdOf?: (row: R) => string | undefined } = {},
): CandidateArchivePair<R> | undefined {
  const taskIdOf = opts.taskIdOf ?? (() => undefined);

  const byIndex = pairs.filter(
    (p) => p.record.candidate_index === winner.candidate_index,
  );
  if (byIndex.length === 1) return byIndex[0];
  if (byIndex.length > 1) {
    if (winner.task_id) {
      const disambiguated = byIndex.find(
        (p) => taskIdOf(p.row) === winner.task_id,
      );
      if (disambiguated) return disambiguated;
    }
    return undefined;
  }

  if (winner.task_id) {
    const byTask = pairs.filter((p) => taskIdOf(p.row) === winner.task_id);
    if (byTask.length === 1) return byTask[0];
  }

  const byContent = pairs.filter(
    (p) =>
      p.record.agent_id === winner.agent_id &&
      p.record.output_text === winner.output_text,
  );
  if (byContent.length === 1) return byContent[0];

  return undefined;
}

/**
 * Sakana review-debate-synthesize eligibility: worth merging the top two only
 * when they score within epsilon of each other (no clear winner) AND their
 * outputs actually differ (complementary, not duplicates). A runaway margin
 * means one candidate already dominates — just promote it.
 */
export function shouldSynthesize(
  ranked: CandidateRecord[],
  epsilon = 0.05,
): boolean {
  if (ranked.length < 2) return false;
  const top = ranked[0].calibrated_score as number;
  const second = ranked[1].calibrated_score as number;
  if (top - second > epsilon) return false;
  // Complementary check: distinct outputs are worth merging; identical ones
  // (same hash) carry no extra information.
  return (
    stableOutputHash(ranked[0].output_text) !==
    stableOutputHash(ranked[1].output_text)
  );
}

// ─── AB-MCTS-lite: wider vs deeper ───────────────────────────────────────────

export interface SearchBranch {
  id: string;
  // Best judged score seen on this branch so far, [0,1]. Undefined = unexplored.
  score?: number;
  // Judge uncertainty for this branch, [0,1] (from judge-core confidence: high
  // uncertainty = low confidence = worth refining).
  uncertainty?: number;
  // How many times this branch has been expanded/refined.
  visits: number;
  depth: number;
}

export interface AbmctsConfig {
  maxDepth: number;
  maxWidth: number;
  maxModelCalls: number;
  modelCallsUsed: number;
  remainingBudget: number;
  perStepCost?: number;
  // Stop early once a branch is this good — no point searching further.
  scoreThreshold?: number;
  // Exploration weight for the UCB term.
  explore?: number;
}

export type AbmctsAction = "wider" | "deeper" | "stop";

export interface AbmctsDecision {
  action: AbmctsAction;
  targetBranchId?: string;
  reason: string;
}

/**
 * UCB1-style score for a branch: exploit its known quality, explore branches
 * with high judge uncertainty or few visits. Deterministic (no RNG — the search
 * runs in environments where Math.random is unavailable, and reproducibility is
 * a first-class requirement for a replayable archive).
 */
export function ucbScore(
  branch: SearchBranch,
  totalVisits: number,
  explore = 0.7,
): number {
  const exploit = branch.score ?? 0.5;
  const visits = Math.max(1, branch.visits);
  // Classic UCB exploration term, augmented by the judge's own uncertainty so a
  // branch the evaluator is unsure about is preferred for a deeper look.
  const confidenceGap = branch.uncertainty ?? 0.5;
  const exploration =
    explore * (Math.sqrt(Math.log(Math.max(2, totalVisits + 1)) / visits) + confidenceGap);
  return exploit + exploration;
}

/**
 * AB-MCTS-lite decision: given the current branch frontier and hard budgets,
 * decide whether to go WIDER (sample a new candidate), DEEPER (refine the most
 * promising uncertain branch), or STOP. Hard budgets are checked first so the
 * search always terminates. Falls back to best-of-N behavior (widen up to
 * maxWidth) when there is no evaluator signal yet, per the report's rule.
 */
export function abmctsDecision(
  branches: SearchBranch[],
  config: AbmctsConfig,
): AbmctsDecision {
  const perStep = Math.max(0, config.perStepCost ?? 0);

  // 1. Hard budget stops — the "always terminates" contract.
  if (config.modelCallsUsed >= config.maxModelCalls) {
    return { action: "stop", reason: "model-call budget exhausted" };
  }
  if (perStep > 0 && config.remainingBudget < perStep) {
    return { action: "stop", reason: "token/cost budget exhausted" };
  }

  // 2. Good-enough stop.
  const threshold = config.scoreThreshold ?? 0.9;
  const best = branches.reduce<SearchBranch | null>((acc, b) => {
    if (b.score === undefined) return acc;
    if (acc === null || (b.score ?? 0) > (acc.score ?? 0)) return b;
    return acc;
  }, null);
  if (best && (best.score ?? 0) >= threshold) {
    return {
      action: "stop",
      targetBranchId: best.id,
      reason: `branch ${best.id} reached score threshold ${threshold}`,
    };
  }

  // 3. No evaluator signal yet → behave like best-of-N: widen until we have a
  //    frontier to reason about (bounded by maxWidth).
  const scored = branches.filter((b) => b.score !== undefined);
  if (scored.length === 0) {
    if (branches.length < config.maxWidth) {
      return { action: "wider", reason: "no evaluator signal yet; sampling candidates" };
    }
    return { action: "stop", reason: "width cap reached with no evaluator signal" };
  }

  // 4. Deeper vs wider via UCB. Refine the highest-UCB branch when it still has
  //    depth budget and the evaluator is uncertain about it; otherwise, if there
  //    is width budget, sample a fresh candidate.
  const totalVisits = branches.reduce((sum, b) => sum + b.visits, 0);
  const byUcb = [...branches].sort(
    (a, b) => ucbScore(b, totalVisits, config.explore) - ucbScore(a, totalVisits, config.explore),
  );
  const target = byUcb[0];
  const canGoDeeper = target.depth < config.maxDepth;
  const canGoWider = branches.length < config.maxWidth;
  const uncertain = (target.uncertainty ?? 0.5) >= 0.35;

  if (canGoDeeper && uncertain) {
    return {
      action: "deeper",
      targetBranchId: target.id,
      reason: `refine uncertain frontier branch ${target.id} (depth ${target.depth}/${config.maxDepth})`,
    };
  }
  if (canGoWider) {
    return {
      action: "wider",
      reason: "frontier is confident but not good enough; sampling a new candidate",
    };
  }
  if (canGoDeeper) {
    return {
      action: "deeper",
      targetBranchId: target.id,
      reason: `width capped; refining best branch ${target.id}`,
    };
  }
  return {
    action: "stop",
    targetBranchId: best?.id,
    reason: "depth and width caps both reached",
  };
}

// ─── Lineage / replay helpers for the candidate archive ──────────────────────

/**
 * Deterministic prompt hash for provenance (which prompt produced a candidate).
 * Reuses the judge-core FNV hash so the archive and evaluations share one hash
 * space.
 */
export function promptHash(prompt: string): string {
  return stableOutputHash(prompt);
}

export function nextGeneration(parent?: { generation?: number }): number {
  return (parent?.generation ?? 0) + 1;
}
