import assert from "node:assert/strict";
import {
  emptyJudgeReputation,
  expectedArenaWinProbability,
  judgeReliabilityScore,
  legacyScoreVector,
  normalizeQualityScores,
  rubricScore,
  scoreQualityV2,
  stableOutputHash,
  updateArenaRatings,
  updateJudgeReputation,
} from "./judge-core";

const normalized = normalizeQualityScores(
  { correctness: 1.2, safety: -1 },
  0.75,
);
assert.equal(normalized.correctness, 1);
assert.equal(normalized.safety, 0);
assert.equal(normalized.completeness, 0.75);

const strongRubric = rubricScore({
  correctness: 0.9,
  completeness: 0.8,
  instruction_following: 0.85,
  evidence: 0.7,
  safety: 1,
  utility: 0.9,
  style: 0.8,
  cost_efficiency: 0.6,
});
assert.ok(strongRubric > 0.8 && strongRubric < 0.9);

const legacyAccept = legacyScoreVector(0.92, "accept");
assert.equal(legacyAccept.safety, 1);
assert.equal(legacyAccept.correctness, 0.92);

const legacyReject = legacyScoreVector(0.8, "reject");
assert.equal(legacyReject.correctness, 0.45);
assert.equal(legacyReject.safety, 0.6);

const quality = scoreQualityV2({
  scores: {
    correctness: 0.9,
    completeness: 0.8,
    instruction_following: 0.9,
    evidence: 0.75,
    safety: 1,
    utility: 0.9,
    style: 0.8,
    cost_efficiency: 0.7,
  },
  judgeReliability: 0.8,
  pairwiseScore: 0.7,
  trajectoryScore: 1,
});
assert.ok(quality.raw_score > 0.8);
assert.ok(quality.calibrated_score <= quality.raw_score);
assert.ok(quality.confidence > 0.7);
assert.equal(quality.components.length, 3);

const weakJudgeQuality = scoreQualityV2({
  scores: { correctness: 1, completeness: 1, safety: 1 },
  judgeReliability: 0,
});
assert.ok(
  weakJudgeQuality.calibrated_score < weakJudgeQuality.raw_score,
  "low-reliability judges should be shrunk toward neutral",
);

assert.equal(
  judgeReliabilityScore({
    gold_accuracy: 1,
    human_agreement: 1,
    brier_score: 0,
    bias_position: 0,
    bias_length: 0,
    bias_self_model: 0,
  }),
  1,
);

const rep0 = emptyJudgeReputation("judge-a");
const rep1 = updateJudgeReputation(rep0, {
  goldCorrect: true,
  humanAgreement: 0.9,
  brierScore: 0.05,
  positionBiasDelta: 0.02,
});
assert.equal(rep1.tasks, 1);
assert.ok(rep1.reliability > rep0.reliability);
assert.ok(rep1.uncertainty < rep0.uncertainty);

assert.equal(expectedArenaWinProbability(1000, 1000), 0.5);
const arena = updateArenaRatings({
  winnerRating: 1000,
  loserRating: 1000,
  k: 32,
});
assert.equal(arena.winner, 1016);
assert.equal(arena.loser, 984);

assert.equal(stableOutputHash("same"), stableOutputHash("same"));
assert.notEqual(stableOutputHash("same"), stableOutputHash("different"));

console.log("judge-core tests passed");
