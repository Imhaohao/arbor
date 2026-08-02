/**
 * Bid calibration: the incentive-compatible opt-out mechanism.
 *
 * Every bid carries a self-reported `confidence` — the bidder's probability
 * that the judge will accept its delivery. Three rules make honest abstention
 * the profit-maximizing strategy for a low-ability agent:
 *
 *   1. Confidence is scored against the actual judge verdict with a proper
 *      scoring rule (Brier), so truthful reporting is the dominant strategy.
 *      The score feeds a calibration reputation dimension.
 *   2. The judge-reject reputation slash scales with stated confidence
 *      (a bid bond): overconfident failures cost more, honest low-confidence
 *      attempts cost less, and declining always costs nothing.
 *   3. The auction ranks bids by reputation x calibrated P(accept) / price,
 *      where a self-report is trusted only in proportion to the agent's
 *      proven calibration — new and miscalibrated agents cannot buy rank
 *      with a confident claim (probation is baked in).
 */

import { cosineSimilarity } from "./hive/embeddings";

/** Confidence bounds: never certain either way, keeps Brier informative and
 * caps the slash multiplier. */
export const CONFIDENCE_MIN = 0.05;
export const CONFIDENCE_MAX = 0.95;

/** Settled tasks needed before an agent's own calibration history fully
 * replaces the neutral prior when weighing its self-report. */
export const CALIBRATION_RAMP_TASKS = 5;

/** Base reputation slash for a judge-rejected delivery (pre-scaling). */
export const REJECT_SLASH_BASE = 0.1;

export function clampConfidence(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, raw));
}

/**
 * Brier-based calibration score in 0..1 (1 = perfectly calibrated claim).
 * calibration = 1 - (confidence - outcome)^2.
 */
export function calibrationScore(
  confidence: number,
  accepted: boolean,
): number {
  const outcome = accepted ? 1 : 0;
  const brier = (confidence - outcome) ** 2;
  return Math.max(0, Math.min(1, 1 - brier));
}

/**
 * Magnitude of the reputation slash for a judge-rejected delivery, scaled by
 * the confidence the bidder claimed: base x (0.5 + confidence). At the
 * neutral 0.5 this reproduces the historical flat 0.10 slash; a maximally
 * confident failure costs 0.145, an honest low-confidence attempt 0.055.
 */
export function rejectSlashMagnitude(confidence: number): number {
  const c = clampConfidence(confidence) ?? 0.5;
  return REJECT_SLASH_BASE * (0.5 + c);
}

/**
 * Reputation delta applied by auctions.settle. Accepted work keeps the
 * historical quality-scaled reward; rejected work uses the confidence-scaled
 * bid bond. Keeping this decision pure makes the live settlement policy
 * directly testable without importing a Convex action.
 */
export function settlementReputationDelta(input: {
  accepted: boolean;
  qualityScore: number;
  confidence?: number;
}): number {
  if (!input.accepted) {
    return -rejectSlashMagnitude(input.confidence ?? 0.5);
  }
  const quality = Number.isFinite(input.qualityScore)
    ? Math.max(0, Math.min(1, input.qualityScore))
    : 0;
  return 0.05 * quality;
}

// ─── Task-conditional capability clusters ──────────────────────────────────
//
// Ability is task-relative: a flawless OCR record says nothing about legal
// drafting. Settled reputation rows are therefore keyed by the same
// task-class taxonomy the hive router uses, and incentive stats prefer the
// cluster-scoped slice of history over the agent's global record.

/** The hive task-class taxonomy (convex/hiveRouter.ts) reused as the
 * capability-cluster key for task-conditional reputation. */
export const TASK_CLASSES = [
  "reasoning",
  "classification",
  "extraction",
  "generation",
] as const;

export type TaskClass = (typeof TASK_CLASSES)[number];

export function normalizeTaskClass(raw: unknown): TaskClass | undefined {
  if (typeof raw !== "string") return undefined;
  const candidate = raw.trim().toLowerCase();
  return (TASK_CLASSES as readonly string[]).includes(candidate)
    ? (candidate as TaskClass)
    : undefined;
}

/** Prototype descriptions embedded once per auction to classify a plain
 * marketplace prompt into a cluster (hive nodes carry their class already). */
export const TASK_CLASS_PROTOTYPES: Record<TaskClass, string> = {
  reasoning:
    "analyze a problem, plan an approach, debug, evaluate trade-offs, prove or verify, multi-step logic, math, strategy, decide between options",
  classification:
    "categorize items, label or tag content, triage tickets, sentiment analysis, moderation, route each input into the right bucket",
  extraction:
    "extract structured fields, parse documents, OCR scans, scrape pages, pull entities, tables, or values out of unstructured text",
  generation:
    "write or draft content, compose copy, generate code, images, summaries, translations, emails, reports, or other new artifacts",
};

/**
 * Classify a task prompt into a capability cluster by nearest prototype
 * embedding. The embedder is injected (production passes embedTexts from
 * lib/hive/embeddings, which falls back to a local hash embedder without an
 * API key). Fail-soft: any error or a signal-free prompt returns undefined,
 * which callers treat as "use global stats".
 */
export async function classifyTaskClass(
  prompt: string,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<TaskClass | undefined> {
  const trimmed = prompt.trim();
  if (!trimmed) return undefined;
  try {
    const vectors = await embed([
      trimmed,
      ...TASK_CLASSES.map((c) => TASK_CLASS_PROTOTYPES[c]),
    ]);
    const promptVec = vectors[0];
    let best: TaskClass | undefined;
    let bestSim = 0;
    for (let i = 0; i < TASK_CLASSES.length; i++) {
      const sim = cosineSimilarity(promptVec, vectors[i + 1]);
      if (sim > bestSim) {
        bestSim = sim;
        best = TASK_CLASSES[i];
      }
    }
    return best;
  } catch {
    return undefined;
  }
}

/** Cluster-scoped settled tasks required before the accept-rate floor may
 * skip soliciting an agent — never skip on one or two bad data points. */
export const CLUSTER_FLOOR_MIN_TASKS = 3;

/**
 * True when an agent's record ON THIS CLUSTER is deep enough to trust and
 * bad enough to skip soliciting entirely. Global-scope stats never trigger
 * the floor: a great OCR agent's global record must not block (or vouch for)
 * its legal-drafting bids — only same-cluster evidence counts.
 */
export function belowClusterAcceptFloor(
  stats: AgentIncentiveStats,
  floor: number,
): boolean {
  if (!Number.isFinite(floor) || floor <= 0) return false;
  return (
    stats.scope === "cluster" &&
    stats.settled_tasks >= CLUSTER_FLOOR_MIN_TASKS &&
    stats.accept_rate < floor
  );
}

export interface AgentIncentiveStats {
  /** Judged-and-settled tasks on record for this agent. */
  settled_tasks: number;
  /** Fraction of settled tasks the judge accepted (0.5 when no history). */
  accept_rate: number;
  /** Mean Brier calibration over settled tasks (0.5 when no history). */
  mean_calibration: number;
  /** Capability cluster the stats were scoped to, when one was resolved. */
  task_class?: string;
  /** "cluster" when the numbers come from same-class rows only; "global"
   * when the cluster had no history and the agent's full record was used.
   * Absent on legacy callers — treated as global. */
  scope?: "cluster" | "global";
}

export const NEUTRAL_INCENTIVE_STATS: AgentIncentiveStats = {
  settled_tasks: 0,
  accept_rate: 0.5,
  mean_calibration: 0.5,
};

/**
 * Convert the semantic shortlist order into an auction relevance multiplier.
 * Open auctions have no semantic ordering. Arbor-owned floor agents are also
 * unweighted so they remain available when every live specialist declines.
 */
export function invitedSemanticWeight(
  agentId: string,
  invitedAgentIds: readonly string[] | undefined,
  floorAgentIds: ReadonlySet<string>,
): number {
  if (!invitedAgentIds || floorAgentIds.has(agentId)) return 1;
  const ranked = invitedAgentIds.filter(
    (candidateId) => !floorAgentIds.has(candidateId),
  );
  const index = ranked.indexOf(agentId);
  return index < 0 ? 1 : 1 / (index + 1);
}

/**
 * Calibrated P(judge accepts) for ranking a bid. The stated confidence is
 * trusted in proportion to the agent's proven calibration; the remainder of
 * the weight falls on its realized accept rate. Trust ramps from the neutral
 * 0.5 prior to the agent's measured calibration over CALIBRATION_RAMP_TASKS
 * settled tasks, so a brand-new agent claiming 0.95 lands near 0.7, not 0.95.
 */
export function blendedAcceptProbability(
  statedConfidence: number | undefined,
  stats: AgentIncentiveStats,
): number {
  const stated = clampConfidence(statedConfidence) ?? 0.5;
  const ramp = Math.max(
    0,
    Math.min(1, stats.settled_tasks / CALIBRATION_RAMP_TASKS),
  );
  const trust = 0.5 * (1 - ramp) + stats.mean_calibration * ramp;
  const history = stats.settled_tasks > 0 ? stats.accept_rate : 0.5;
  const p = trust * stated + (1 - trust) * history;
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, p));
}

/**
 * The incentive terms appended to every bid solicitation. This is the market
 * signal that replaces "please opt out": it makes the payoff arithmetic and
 * the agent's own track record legible at bid time, so declining is the
 * rational move exactly when ability is low.
 */
export function bidIncentiveBlock(stats: AgentIncentiveStats): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const scopeLabel =
    stats.scope === "cluster" && stats.task_class
      ? ` on ${stats.task_class} tasks (this task's class)`
      : stats.scope === "global" && stats.task_class
        ? ` (no settled ${stats.task_class} tasks yet, so your overall record is used)`
        : "";
  const track =
    stats.settled_tasks > 0
      ? `Your track record on this marketplace${scopeLabel}: ${stats.settled_tasks} settled task${stats.settled_tasks === 1 ? "" : "s"}, ${pct(stats.accept_rate)} judge-accept rate, calibration ${stats.mean_calibration.toFixed(2)}.`
      : "You have no settled history on this marketplace yet, so your stated confidence is heavily discounted toward a neutral prior until you build a calibration record.";
  return [
    "Marketplace incentive terms:",
    'Include "confidence" (a number 0-1) in your bid JSON: your honest probability that the marketplace judge will ACCEPT your delivery. It is scored against the actual verdict with a proper scoring rule (Brier), so truthful reporting maximizes your reputation — over- and under-claiming both cost you.',
    `- Accepted delivery: reputation +0.05 x quality. Rejected delivery: reputation slashed by ${REJECT_SLASH_BASE.toFixed(2)} x (0.5 + your stated confidence), so an overconfident failure costs up to ~2.6x an honest low-confidence one. Declining costs nothing, ever.`,
    "- Bids are ranked by reputation x calibrated P(accept) / price. Your self-report is trusted only as far as your measured calibration, so claiming high confidence on a task you cannot deliver does not raise your rank — it only raises your downside.",
    track,
    "If this task is outside what you can actually deliver, the profit-maximizing move is to decline.",
  ].join("\n");
}
