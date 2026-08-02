// Probe-success head (Layer 5 pure helpers). Predicts P(a solicited agent
// actually returns a usable bid) BEFORE the solicit call is made, so routing
// spends its invite slots on agents that will answer.
//
// This is the P(responds) factor of the routing decomposition
//
//     P(useful) = P(responds) x P(quality | responds)
//
// Only the FIRST factor is modelled here. Nothing in this file predicts output
// quality: the corpus has 231 judge-graded smoke rows in which the prompt is
// generated per agent, so prompt and agent identity are perfectly collinear and
// a quality model would only memorise identity. See docs/probe-success-model.md.
//
// Why a measured rate and not a fitted model. On a temporal holdout (train on
// everything before the newest batch, test on it: 21,354 rows / 249 positives) a
// 38-feature logistic regression scored 0.8978 AUC and a 6-feature
// forward-selected model 0.8817, both WORSE than the unfitted signal below at
// 0.9590. GroupKFold inside the training period reported 0.988 — overstating
// held-out performance by ~9 points — because coefficients fitted on the June
// regime (55% pass rate) do not transfer to the current one (1.2%). Ranking on a
// measured rate carries no coefficients and cannot go stale that way.
//
// The routing objective this feeds is from arXiv:2603.20895
// (score = lambda * P(success) - (1 - lambda) * normalized_cost), but NOT its
// feature source: prefill activations are unavailable for closed-weight
// providers, and the dominant failure modes here are transport-level (endpoint
// down, absent API key) rather than semantic, so activations would not carry
// this signal anyway.
//
// Leakage discipline: every input is strictly causal — computable before the
// probe runs. Fields derived FROM probe outcomes (duration_ms, error_message,
// and the agent_readiness roll-ups latest_probe_status / last_bid_status /
// failure_bucket / readiness_status) are excluded.

import modelJson from "./probe-success-model.json";

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlag(name: string): boolean {
  return TRUE_ENV_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

/**
 * Master switch, mirroring the orchestrator-first / best-of-N rollout pattern.
 * Default off keeps routing byte-for-byte on the existing path;
 * ARBOR_PROBE_SUCCESS_DISABLED is the kill switch that wins.
 */
export function probeSuccessEnabled(): boolean {
  return (
    !envFlag("ARBOR_PROBE_SUCCESS_DISABLED") &&
    envFlag("ARBOR_PROBE_SUCCESS_ENABLED")
  );
}

/** Score the model without letting it change invite counts or ordering. */
export function probeSuccessShadowEnabled(): boolean {
  return (
    !envFlag("ARBOR_PROBE_SUCCESS_DISABLED") &&
    envFlag("ARBOR_PROBE_SUCCESS_SHADOW")
  );
}

export interface ProbeSuccessModel {
  version: number;
  kind: string;
  target: string;
  signal: {
    name: string;
    definition: string;
    prior: number;
    smoothing_strength: number;
    rationale: string;
  };
  platt_a: number;
  platt_b: number;
  calibration: {
    method: string;
    window: number;
    refit_every: number;
    note: string;
  };
  metrics: Record<string, number | string>;
}

export const PROBE_SUCCESS_MODEL = modelJson as unknown as ProbeSuccessModel;

export interface PlattParams {
  a: number;
  b: number;
}

/**
 * Cold-start calibration only. Production must replace these with parameters
 * refit on recent outcomes (see `calibration.note`): the observed pass rate moved
 * from 0.55 to 0.012 when the 1000-agent discovery fan-out landed, and a stale
 * calibrator is badly overconfident.
 */
export const BOOTSTRAP_PLATT: PlattParams = {
  a: PROBE_SUCCESS_MODEL.platt_a,
  b: PROBE_SUCCESS_MODEL.platt_b,
};

export const CORPUS_PRIOR = PROBE_SUCCESS_MODEL.signal.prior;
export const SMOOTHING_STRENGTH = PROBE_SUCCESS_MODEL.signal.smoothing_strength;

/**
 * Additive smoothing toward the corpus prior, so 1 pass in 1 attempt is not
 * treated as stronger evidence than 40 in 50. With no attempts at all this
 * returns the prior — never 0, which would claim the agent is known-dead.
 */
export function smoothedRate(
  passes: number,
  attempts: number,
  prior: number = CORPUS_PRIOR,
  strength: number = SMOOTHING_STRENGTH,
): number {
  if (!Number.isFinite(attempts) || attempts <= 0) return prior;
  const n = Math.max(0, attempts);
  const k = Math.max(0, Math.min(n, passes));
  return (k + prior * strength) / (n + strength);
}

/** Read-only smoke-run history for one agent, counted from rows strictly older
 * than the probe being scored. A separate measurement from bid_probes, so it is
 * an independent signal rather than leakage. */
export interface SmokeEvidence {
  runs: number;
  passes: number;
}

/** Prior bid-probe outcomes for one agent, counted from rows strictly older than
 * the probe being scored. */
export interface ProbeEvidence {
  attempts: number;
  passes: number;
}

export interface ProbeSuccessEvidence {
  smoke: SmokeEvidence;
  probes: ProbeEvidence;
}

/**
 * The ranking score: mean of two independently-measured pass rates. Monotone in
 * P(pass), so this is the correct value to ORDER candidates by. Use
 * `probeSuccessProbability` whenever the number is compared against a threshold
 * or traded off against a cost.
 *
 * Averaging is deliberate rather than fitted: both terms estimate the same
 * latent quantity (will this agent answer a solicitation), so the mean reduces
 * variance while introducing no coefficient that can go stale.
 */
export function probeSuccessScore(
  evidence: ProbeSuccessEvidence,
  prior: number = CORPUS_PRIOR,
): number {
  const smoke = smoothedRate(evidence.smoke.passes, evidence.smoke.runs, prior);
  const probes = smoothedRate(
    evidence.probes.passes,
    evidence.probes.attempts,
    prior,
  );
  return (smoke + probes) / 2;
}

const LOGIT_EPSILON = 1e-6;

/** Log-odds of a probability, clamped so 0 and 1 cannot produce +/-Infinity. */
export function logit(p: number): number {
  const clamped = Math.min(1 - LOGIT_EPSILON, Math.max(LOGIT_EPSILON, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(z: number): number {
  // Split by sign so a large |z| cannot overflow Math.exp.
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Calibrated P(probe passes). `platt` defaults to the shipped cold-start pair;
 * pass the rolling refit in production.
 */
export function probeSuccessProbability(
  evidence: ProbeSuccessEvidence,
  platt: PlattParams = BOOTSTRAP_PLATT,
  prior: number = CORPUS_PRIOR,
): number {
  const z = logit(probeSuccessScore(evidence, prior));
  return sigmoid(platt.a * z + platt.b);
}

// ─── Rolling recalibration ──────────────────────────────────────────────────

export interface CalibrationObservation {
  /** logit(probeSuccessScore(...)) at the time the probe was scored. */
  logit: number;
  passed: boolean;
}

/**
 * Refit Platt scaling on recent (logit, outcome) pairs via Newton-Raphson on the
 * 1-D logistic likelihood. Returns undefined when the window is degenerate
 * (all-pass or all-fail), in which case the caller MUST keep its previous
 * parameters rather than adopt an invented calibration.
 */
export function fitPlatt(
  observations: CalibrationObservation[],
  iterations = 50,
): PlattParams | undefined {
  const positives = observations.filter((o) => o.passed).length;
  if (
    observations.length < 2 ||
    positives === 0 ||
    positives === observations.length
  ) {
    return undefined;
  }
  let a = 1;
  let b = 0;
  for (let step = 0; step < iterations; step += 1) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (const o of observations) {
      const p = sigmoid(a * o.logit + b);
      const err = p - (o.passed ? 1 : 0);
      const w = Math.max(p * (1 - p), 1e-12);
      g0 += err * o.logit;
      g1 += err;
      h00 += w * o.logit * o.logit;
      h01 += w * o.logit;
      h11 += w;
    }
    // Ridge term keeps the Hessian invertible when the logits are near-constant.
    const r = 1e-9;
    const det = (h00 + r) * (h11 + r) - h01 * h01;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-18) break;
    const da = ((h11 + r) * g0 - h01 * g1) / det;
    const db = ((h00 + r) * g1 - h01 * g0) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < 1e-10 && Math.abs(db) < 1e-10) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return { a, b };
}

/** How many recent outcomes the rolling calibrator should hold, and how often to
 * refit. Both validated offline; see `metrics` in the model JSON. */
export const CALIBRATION_WINDOW = PROBE_SUCCESS_MODEL.calibration.window;
export const CALIBRATION_REFIT_EVERY =
  PROBE_SUCCESS_MODEL.calibration.refit_every;

// ─── Offline metrics (used by the eval gate, never at inference) ─────────────

/**
 * Mann-Whitney AUC. Ties contribute 0.5, matching sklearn's roc_auc_score.
 * Returns undefined when one class is absent, because AUC is undefined there —
 * callers must surface that rather than print a placeholder.
 */
export function rocAuc(
  scores: number[],
  labels: boolean[],
): number | undefined {
  if (scores.length !== labels.length || scores.length === 0) return undefined;
  const pos = labels.filter(Boolean).length;
  const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return undefined;

  const order = scores
    .map((score, index) => ({ score, label: labels[index] }))
    .sort((l, r) => l.score - r.score);

  // Average ranks within tied score groups.
  const ranks = new Array<number>(order.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].score === order[i].score) j += 1;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[k] = shared;
    i = j + 1;
  }

  let rankSum = 0;
  for (let i = 0; i < order.length; i += 1) {
    if (order[i].label) rankSum += ranks[i];
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Mean squared error of calibrated probabilities. Compare against the
 * base-rate predictor to prove the model adds information. */
export function brierScore(
  probabilities: number[],
  labels: boolean[],
): number | undefined {
  if (probabilities.length !== labels.length || probabilities.length === 0) {
    return undefined;
  }
  let total = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    const diff = probabilities[i] - (labels[i] ? 1 : 0);
    total += diff * diff;
  }
  return total / probabilities.length;
}
