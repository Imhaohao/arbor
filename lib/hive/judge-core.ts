export const QUALITY_DIMENSIONS = [
  "correctness",
  "completeness",
  "instruction_following",
  "evidence",
  "safety",
  "utility",
  "style",
  "cost_efficiency",
] as const;

export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];
export type QualityScoreVector = Record<QualityDimension, number>;

export const DEFAULT_QUALITY_WEIGHTS: QualityScoreVector = {
  correctness: 0.22,
  completeness: 0.16,
  instruction_following: 0.15,
  evidence: 0.12,
  safety: 0.15,
  utility: 0.1,
  style: 0.05,
  cost_efficiency: 0.05,
};

export interface QualityV2Input {
  scores: Partial<QualityScoreVector>;
  judgeReliability?: number;
  pairwiseScore?: number;
  trajectoryScore?: number;
  delayedOutcomeScore?: number;
  rubricCompleteness?: number;
}

export interface QualityComponent {
  source: "rubric" | "pairwise" | "trajectory" | "delayed";
  score: number;
  weight: number;
}

export interface QualityV2Result {
  scores: QualityScoreVector;
  rubric_score: number;
  raw_score: number;
  calibrated_score: number;
  confidence: number;
  components: QualityComponent[];
}

export interface JudgeReputationState {
  judge_id: string;
  tasks: number;
  gold_accuracy: number;
  human_agreement: number;
  brier_score: number;
  bias_position: number;
  bias_length: number;
  bias_self_model: number;
  reliability: number;
  uncertainty: number;
}

export interface JudgeReputationOutcome {
  goldCorrect?: boolean;
  humanAgreement?: number;
  brierScore?: number;
  positionBiasDelta?: number;
  lengthBiasDelta?: number;
  selfModelBiasDelta?: number;
}

export interface ArenaRatingUpdate {
  winner: number;
  loser: number;
  expected_winner: number;
  expected_loser: number;
}

const SOURCE_WEIGHTS = {
  rubric: 0.5,
  pairwise: 0.2,
  trajectory: 0.2,
  delayed: 0.1,
} as const;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

function weightedAverage(
  values: Array<{ score: number; weight: number }>,
): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0.5;
  return clamp01(
    values.reduce((sum, item) => sum + clamp01(item.score) * item.weight, 0) /
      totalWeight,
  );
}

function ewma(prev: number, next: number, alpha = 0.2): number {
  return clamp01(prev + alpha * (clamp01(next) - prev));
}

export function normalizeQualityScores(
  partial: Partial<QualityScoreVector>,
  fallback = 0.5,
): QualityScoreVector {
  const safeFallback = clamp01(fallback);
  return QUALITY_DIMENSIONS.reduce((acc, dimension) => {
    acc[dimension] = clamp01(partial[dimension] ?? safeFallback);
    return acc;
  }, {} as QualityScoreVector);
}

export function rubricScore(
  scores: Partial<QualityScoreVector>,
  weights: QualityScoreVector = DEFAULT_QUALITY_WEIGHTS,
): number {
  const normalized = normalizeQualityScores(scores);
  return round6(
    weightedAverage(
      QUALITY_DIMENSIONS.map((dimension) => ({
        score: normalized[dimension],
        weight: weights[dimension],
      })),
    ),
  );
}

export function legacyScoreVector(
  qualityScore: number,
  verdict: "accept" | "reject",
): QualityScoreVector {
  const quality = clamp01(qualityScore);
  const accepted = verdict === "accept";
  return normalizeQualityScores(
    {
      correctness: accepted ? quality : Math.min(quality, 0.45),
      completeness: quality,
      instruction_following: quality,
      evidence: 0.5,
      safety: accepted ? 1 : 0.6,
      utility: quality,
      style: Math.max(0.4, quality),
      cost_efficiency: 0.5,
    },
    quality,
  );
}

export function scoreQualityV2(input: QualityV2Input): QualityV2Result {
  const scores = normalizeQualityScores(input.scores);
  const rubric = rubricScore(scores);
  const components: QualityComponent[] = [
    { source: "rubric", score: rubric, weight: SOURCE_WEIGHTS.rubric },
  ];
  if (input.pairwiseScore !== undefined) {
    components.push({
      source: "pairwise",
      score: input.pairwiseScore,
      weight: SOURCE_WEIGHTS.pairwise,
    });
  }
  if (input.trajectoryScore !== undefined) {
    components.push({
      source: "trajectory",
      score: input.trajectoryScore,
      weight: SOURCE_WEIGHTS.trajectory,
    });
  }
  if (input.delayedOutcomeScore !== undefined) {
    components.push({
      source: "delayed",
      score: input.delayedOutcomeScore,
      weight: SOURCE_WEIGHTS.delayed,
    });
  }

  const raw = round6(weightedAverage(components));
  const reliability = clamp01(input.judgeReliability ?? 0.5);
  const calibrationStrength = 0.5 + 0.5 * reliability;
  const calibrated = round6(0.5 + (raw - 0.5) * calibrationStrength);
  const rubricCompleteness = clamp01(
    input.rubricCompleteness ??
      QUALITY_DIMENSIONS.filter((dimension) => input.scores[dimension] !== undefined)
        .length /
        QUALITY_DIMENSIONS.length,
  );
  const extraSources = components.length - 1;
  const confidence = round6(
    clamp01(
      0.25 +
        0.25 * reliability +
        0.25 * rubricCompleteness +
        0.1 * Math.min(2, extraSources) +
        0.15 * (components.some((component) => component.source === "delayed") ? 1 : 0),
    ),
  );

  return {
    scores,
    rubric_score: rubric,
    raw_score: raw,
    calibrated_score: calibrated,
    confidence,
    components: components.map((component) => ({
      ...component,
      score: round6(clamp01(component.score)),
    })),
  };
}

export function emptyJudgeReputation(judgeId: string): JudgeReputationState {
  return {
    judge_id: judgeId,
    tasks: 0,
    gold_accuracy: 0.5,
    human_agreement: 0.5,
    brier_score: 0.25,
    bias_position: 0,
    bias_length: 0,
    bias_self_model: 0,
    reliability: 0.5,
    uncertainty: 1,
  };
}

export function judgeReliabilityScore(
  state: Pick<
    JudgeReputationState,
    | "gold_accuracy"
    | "human_agreement"
    | "brier_score"
    | "bias_position"
    | "bias_length"
    | "bias_self_model"
  >,
): number {
  return round6(
    clamp01(
      0.35 * clamp01(state.gold_accuracy) +
        0.25 * clamp01(state.human_agreement) +
        0.2 * (1 - clamp01(state.brier_score)) +
        0.1 * (1 - clamp01(state.bias_position)) +
        0.05 * (1 - clamp01(state.bias_length)) +
        0.05 * (1 - clamp01(state.bias_self_model)),
    ),
  );
}

export function updateJudgeReputation(
  previous: JudgeReputationState,
  outcome: JudgeReputationOutcome,
): JudgeReputationState {
  const next = {
    ...previous,
    tasks: previous.tasks + 1,
    gold_accuracy:
      outcome.goldCorrect === undefined
        ? previous.gold_accuracy
        : ewma(previous.gold_accuracy, outcome.goldCorrect ? 1 : 0),
    human_agreement:
      outcome.humanAgreement === undefined
        ? previous.human_agreement
        : ewma(previous.human_agreement, outcome.humanAgreement),
    brier_score:
      outcome.brierScore === undefined
        ? previous.brier_score
        : ewma(previous.brier_score, outcome.brierScore),
    bias_position:
      outcome.positionBiasDelta === undefined
        ? previous.bias_position
        : ewma(previous.bias_position, Math.abs(outcome.positionBiasDelta)),
    bias_length:
      outcome.lengthBiasDelta === undefined
        ? previous.bias_length
        : ewma(previous.bias_length, Math.abs(outcome.lengthBiasDelta)),
    bias_self_model:
      outcome.selfModelBiasDelta === undefined
        ? previous.bias_self_model
        : ewma(previous.bias_self_model, Math.abs(outcome.selfModelBiasDelta)),
    uncertainty: round6(1 / Math.sqrt(previous.tasks + 2)),
  };
  return {
    ...next,
    reliability: judgeReliabilityScore(next),
  };
}

export function expectedArenaWinProbability(
  ratingA: number,
  ratingB: number,
): number {
  return round6(1 / (1 + 10 ** ((ratingB - ratingA) / 400)));
}

export function updateArenaRatings(args: {
  winnerRating: number;
  loserRating: number;
  draw?: boolean;
  k?: number;
}): ArenaRatingUpdate {
  const k = Number.isFinite(args.k) ? Math.max(1, args.k ?? 24) : 24;
  const expectedWinner = expectedArenaWinProbability(
    args.winnerRating,
    args.loserRating,
  );
  const expectedLoser = expectedArenaWinProbability(
    args.loserRating,
    args.winnerRating,
  );
  const winnerActual = args.draw ? 0.5 : 1;
  const loserActual = args.draw ? 0.5 : 0;
  return {
    winner: round6(args.winnerRating + k * (winnerActual - expectedWinner)),
    loser: round6(args.loserRating + k * (loserActual - expectedLoser)),
    expected_winner: expectedWinner,
    expected_loser: expectedLoser,
  };
}

export function stableOutputHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
