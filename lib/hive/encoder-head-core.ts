// Encoder-target-decoupling cold-start head (Layer 5 pure helpers).
//
// The measured-rate head in probe-success-core.ts is the better predictor
// whenever an agent has history (ranking AUC 0.9590 vs 0.9458 for any encoder
// combination we tested). But it has one blind spot that matters a lot in a
// marketplace that keeps discovering agents: with no smoke runs and no prior
// probes, BOTH of its rates fall back to the corpus prior, so every brand-new
// agent receives an identical score and is ordered arbitrarily.
//
// This head fills exactly that gap and nothing else.
//
// Encoder-target decoupling (arXiv:2603.20895): the model producing the
// predictive signal is NOT the model whose behaviour is predicted. Here a
// 22.7M-parameter local encoder (all-MiniLM-L6-v2) reads an agent's own
// descriptor text and predicts whether that agent — an external A2A or MCP
// service whose weights are entirely inaccessible — will answer a solicitation.
//
// Validated on 26,492 real bid_probes labels:
//   cold start, holding out whole capability-template families: AUC 0.9390
//   cold start, holding out random agents:                      AUC 0.9450
//   temporal June->July, encoder features only:                 AUC 0.8495
// The family holdout is the strict one: 40 agents share byte-identical
// capability text, so a random split could otherwise reward memorising a
// template family. It barely moved (0.9390 vs 0.9450), so the head generalises
// to descriptor text it has never seen.
//
// IMPORTANT — ranking only. On the temporal split this head's Brier (0.01210)
// does NOT beat the base-rate predictor (0.01152). Use it to ORDER cold
// candidates against each other; do not present its output as a calibrated
// probability or feed it to a cost tradeoff without a rolling recalibration.

import modelJson from "./encoder-head-model.json";

export interface EncoderHeadModel {
  version: number;
  kind: string;
  target: string;
  encoder: {
    model: string;
    params_millions: number;
    layers: number;
    hidden: number;
    layer_used: number;
    pooling: string;
    layer_selection: string;
    cost_usd_per_call: number;
    latency_ms_single: number;
    latency_ms_per_text_batched: number;
    why: string;
  };
  pca_dims: number;
  coef: number[];
  intercept: number;
  platt_a: number;
  platt_b: number;
  vector_source: {
    note: string;
    descriptor_fields: string[];
    pipeline: string;
  };
  metrics: Record<string, number | string>;
}

export const ENCODER_HEAD_MODEL = modelJson as unknown as EncoderHeadModel;

/** Dimensionality of the stored per-agent vector this head consumes. */
export const ENCODER_VECTOR_DIMS = ENCODER_HEAD_MODEL.pca_dims;

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlag(name: string): boolean {
  return TRUE_ENV_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

/** Master switch. Default off; ARBOR_ENCODER_HEAD_DISABLED wins. */
export function encoderHeadEnabled(): boolean {
  return (
    !envFlag("ARBOR_ENCODER_HEAD_DISABLED") &&
    envFlag("ARBOR_ENCODER_HEAD_ENABLED")
  );
}

/**
 * Build the descriptor text that gets encoded for one agent. Kept here so the
 * offline encoder job and any future re-encode use byte-identical input — a
 * change in field order or separator silently invalidates the trained head.
 */
export function buildAgentDescriptor(input: {
  agent_id: string;
  capabilities?: string[];
  one_liner?: string;
  rationale?: string;
  task_class?: string;
  transport?: string;
}): string {
  const parts = [
    input.agent_id.replace(/-/g, " "),
    (input.capabilities ?? []).join(" "),
    input.one_liner ?? "",
    input.rationale ?? "",
    input.task_class ?? "",
    input.transport ?? "",
  ];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" . ")
    .slice(0, 1000);
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Linear score from a stored encoder vector. Monotone in P(responds), so this is
 * the value to rank cold candidates by.
 *
 * `vector` is the standardized PCA projection produced by the offline encoder
 * job (MiniLM layer 2, mean-pooled, PCA to 8 dims, standardized). It is NOT a
 * raw embedding — passing one will throw on the width check.
 */
export function encoderColdStartLogit(
  vector: number[],
  model: EncoderHeadModel = ENCODER_HEAD_MODEL,
): number {
  if (vector.length !== model.coef.length) {
    throw new Error(
      `encoder head expects a ${model.coef.length}-dim vector, received ${vector.length}`,
    );
  }
  let z = model.intercept;
  for (let i = 0; i < vector.length; i += 1) {
    const v = vector[i];
    if (!Number.isFinite(v)) {
      throw new Error(`encoder vector component ${i} is not finite`);
    }
    z += model.coef[i] * v;
  }
  return z;
}

/** Platt-mapped score. See the ranking-only caveat at the top of this file. */
export function encoderColdStartScore(
  vector: number[],
  model: EncoderHeadModel = ENCODER_HEAD_MODEL,
): number {
  const z = encoderColdStartLogit(vector, model);
  return sigmoid(model.platt_a * z + model.platt_b);
}

// ─── Head selection ─────────────────────────────────────────────────────────

/** Evidence counts that decide which head is authoritative. */
export interface EvidenceCounts {
  smoke_runs: number;
  probe_attempts: number;
}

/**
 * Minimum observations before the measured-rate head is trusted over the
 * encoder. One observation is a coin flip; the measured head only overtook the
 * encoder once real evidence existed, so this is deliberately not 1.
 */
export const MIN_EVIDENCE_FOR_MEASURED_HEAD = 2;

export function hasMeasuredEvidence(evidence: EvidenceCounts): boolean {
  const total =
    Math.max(0, evidence.smoke_runs) + Math.max(0, evidence.probe_attempts);
  return total >= MIN_EVIDENCE_FOR_MEASURED_HEAD;
}

export type HeadChoice = "measured" | "encoder" | "prior";

export interface ScoredCandidate {
  /** Value to rank by. Comparable only within the same `head`. */
  score: number;
  head: HeadChoice;
}

/**
 * Pick the authoritative score for one candidate.
 *
 * The two heads are NOT on a common scale, so a caller ranking a mixed
 * shortlist must rank within each head and interleave, rather than comparing
 * raw scores across heads. `head` is returned so callers cannot lose that.
 */
export function selectCandidateScore(args: {
  evidence: EvidenceCounts;
  /** Calibrated measured-rate score from probe-success-core. */
  measuredScore: number;
  /** Stored encoder vector, when the offline job has produced one. */
  encoderVector?: number[];
  /** Fallback when there is neither evidence nor a vector. */
  prior: number;
  model?: EncoderHeadModel;
}): ScoredCandidate {
  if (hasMeasuredEvidence(args.evidence)) {
    return { score: args.measuredScore, head: "measured" };
  }
  if (args.encoderVector && args.encoderVector.length > 0) {
    return {
      score: encoderColdStartScore(args.encoderVector, args.model),
      head: "encoder",
    };
  }
  return { score: args.prior, head: "prior" };
}

/**
 * Rank a mixed shortlist correctly: agents with measured evidence first (that
 * head is strictly better where it applies), then cold agents ordered by the
 * encoder, then agents with neither signal. Ties keep input order.
 *
 * This ordering is the whole point of the addon — without it every cold agent
 * shares one score and lands in arbitrary order.
 */
export function rankWithHeads<C>(
  candidates: Array<{ candidate: C; scored: ScoredCandidate }>,
): Array<{ candidate: C; scored: ScoredCandidate }> {
  const tier: Record<HeadChoice, number> = { measured: 0, encoder: 1, prior: 2 };
  return candidates
    .map((entry, index) => ({ entry, index }))
    .sort(
      (l, r) =>
        tier[l.entry.scored.head] - tier[r.entry.scored.head] ||
        r.entry.scored.score - l.entry.scored.score ||
        l.index - r.index,
    )
    .map(({ entry }) => entry);
}
