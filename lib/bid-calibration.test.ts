import assert from "node:assert/strict";
import {
  CLUSTER_FLOOR_MIN_TASKS,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  NEUTRAL_INCENTIVE_STATS,
  TASK_CLASSES,
  TASK_CLASS_PROTOTYPES,
  belowClusterAcceptFloor,
  bidIncentiveBlock,
  blendedAcceptProbability,
  calibrationScore,
  clampConfidence,
  classifyTaskClass,
  invitedSemanticWeight,
  normalizeTaskClass,
  rejectSlashMagnitude,
  settlementReputationDelta,
} from "./bid-calibration";

// ─── clampConfidence ───────────────────────────────────────────────────────

assert.equal(clampConfidence(0.7), 0.7);
assert.equal(clampConfidence(1.4), CONFIDENCE_MAX);
assert.equal(clampConfidence(-2), CONFIDENCE_MIN);
assert.equal(clampConfidence(0), CONFIDENCE_MIN);
assert.equal(clampConfidence(Number.NaN), undefined);
assert.equal(clampConfidence("0.9"), undefined);
assert.equal(clampConfidence(undefined), undefined);
assert.equal(clampConfidence(null), undefined);

// ─── calibrationScore: proper scoring — honesty beats bluffing ─────────────

// Perfect claims score highest.
assert.ok(calibrationScore(0.95, true) > calibrationScore(0.5, true));
assert.ok(calibrationScore(0.05, false) > calibrationScore(0.5, false));
// Overconfident failure is the worst outcome.
assert.ok(calibrationScore(0.95, false) < calibrationScore(0.5, false));
assert.ok(calibrationScore(0.95, false) < 0.2);
// Brier expectation: for a true ability p, reporting p beats reporting q.
const expectedCalibration = (report: number, trueP: number) =>
  trueP * calibrationScore(report, true) +
  (1 - trueP) * calibrationScore(report, false);
for (const trueP of [0.1, 0.3, 0.7, 0.9]) {
  for (const bluff of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    if (Math.abs(bluff - trueP) < 1e-9) continue;
    assert.ok(
      expectedCalibration(trueP, trueP) > expectedCalibration(bluff, trueP),
      `truthful report ${trueP} must beat bluff ${bluff}`,
    );
  }
}

// ─── rejectSlashMagnitude: confidence-scaled bid bond ──────────────────────

// Neutral confidence reproduces the historical flat 0.10 slash.
assert.ok(Math.abs(rejectSlashMagnitude(0.5) - 0.1) < 1e-9);
// Overconfidence costs more, honest low confidence costs less.
assert.ok(rejectSlashMagnitude(0.95) > rejectSlashMagnitude(0.5));
assert.ok(rejectSlashMagnitude(0.05) < rejectSlashMagnitude(0.5));
assert.ok(Math.abs(rejectSlashMagnitude(0.95) - 0.145) < 1e-9);
assert.ok(Math.abs(rejectSlashMagnitude(0.05) - 0.055) < 1e-9);
// Out-of-range input clamps instead of exploding the slash.
assert.ok(Math.abs(rejectSlashMagnitude(7) - 0.145) < 1e-9);

// ─── settlementReputationDelta: live settlement policy ────────────────────

// Accepted settlement preserves the historical quality-scaled reward.
assert.ok(
  Math.abs(
    settlementReputationDelta({
      accepted: true,
      qualityScore: 0.8,
      confidence: 0.95,
    }) - 0.04,
  ) < 1e-9,
);
// Confidence affects rejected settlement, not accepted settlement.
assert.equal(
  settlementReputationDelta({
    accepted: true,
    qualityScore: 0.8,
    confidence: 0.05,
  }),
  settlementReputationDelta({
    accepted: true,
    qualityScore: 0.8,
    confidence: 0.95,
  }),
);
const lowConfidenceReject = settlementReputationDelta({
  accepted: false,
  qualityScore: 1,
  confidence: 0.05,
});
const neutralReject = settlementReputationDelta({
  accepted: false,
  qualityScore: 1,
});
const highConfidenceReject = settlementReputationDelta({
  accepted: false,
  qualityScore: 1,
  confidence: 0.95,
});
assert.ok(lowConfidenceReject > neutralReject);
assert.ok(neutralReject > highConfidenceReject);
assert.ok(Math.abs(lowConfidenceReject - -0.055) < 1e-9);
assert.ok(Math.abs(neutralReject - -0.1) < 1e-9);
assert.ok(Math.abs(highConfidenceReject - -0.145) < 1e-9);
// Bad judge quality cannot create an out-of-range accepted reward.
assert.equal(
  settlementReputationDelta({ accepted: true, qualityScore: 10 }),
  0.05,
);
assert.equal(
  settlementReputationDelta({
    accepted: true,
    qualityScore: Number.NaN,
  }),
  0,
);

// ─── blendedAcceptProbability: probation + trust-weighted self-report ──────

// New agent claiming max confidence is shrunk hard toward the prior.
const newbieBrag = blendedAcceptProbability(0.95, NEUTRAL_INCENTIVE_STATS);
assert.ok(newbieBrag < 0.75, `newbie brag should cap near 0.7, got ${newbieBrag}`);
assert.ok(newbieBrag > 0.5);

// A proven, well-calibrated agent's claim is mostly trusted.
const veteran = blendedAcceptProbability(0.9, {
  settled_tasks: 20,
  accept_rate: 0.85,
  mean_calibration: 0.9,
});
assert.ok(veteran > 0.85, `calibrated veteran claim should hold, got ${veteran}`);

// A miscalibrated agent's claim is dominated by its realized accept rate.
const bluffer = blendedAcceptProbability(0.95, {
  settled_tasks: 20,
  accept_rate: 0.2,
  mean_calibration: 0.15,
});
assert.ok(bluffer < 0.45, `bluffer claim should be discounted, got ${bluffer}`);

// No stated confidence falls back to neutral, not zero.
const silent = blendedAcceptProbability(undefined, NEUTRAL_INCENTIVE_STATS);
assert.ok(Math.abs(silent - 0.5) < 1e-9);

// Monotonic in stated confidence for a fixed history.
const stats = { settled_tasks: 10, accept_rate: 0.6, mean_calibration: 0.7 };
assert.ok(
  blendedAcceptProbability(0.9, stats) > blendedAcceptProbability(0.4, stats),
);

// Output always stays inside the confidence bounds.
for (const c of [0, 0.5, 1]) {
  for (const s of [
    NEUTRAL_INCENTIVE_STATS,
    { settled_tasks: 50, accept_rate: 1, mean_calibration: 1 },
    { settled_tasks: 50, accept_rate: 0, mean_calibration: 0 },
  ]) {
    const p = blendedAcceptProbability(c, s);
    assert.ok(p >= CONFIDENCE_MIN && p <= CONFIDENCE_MAX);
  }
}

// ─── bidIncentiveBlock ─────────────────────────────────────────────────────

const newbieBlock = bidIncentiveBlock(NEUTRAL_INCENTIVE_STATS);
assert.ok(newbieBlock.includes("confidence"));
assert.ok(newbieBlock.includes("no settled history"));
assert.ok(newbieBlock.includes("decline"));

const veteranBlock = bidIncentiveBlock({
  settled_tasks: 12,
  accept_rate: 0.75,
  mean_calibration: 0.83,
});
assert.ok(veteranBlock.includes("12 settled tasks"));
assert.ok(veteranBlock.includes("75%"));
assert.ok(veteranBlock.includes("0.83"));

// Cluster-scoped stats change the wording, not the arithmetic.
const clusterBlock = bidIncentiveBlock({
  settled_tasks: 8,
  accept_rate: 0.9,
  mean_calibration: 0.8,
  task_class: "extraction",
  scope: "cluster",
});
assert.ok(clusterBlock.includes("on extraction tasks"));
assert.ok(clusterBlock.includes("8 settled tasks"));

const globalFallbackBlock = bidIncentiveBlock({
  settled_tasks: 8,
  accept_rate: 0.9,
  mean_calibration: 0.8,
  task_class: "extraction",
  scope: "global",
});
assert.ok(globalFallbackBlock.includes("no settled extraction tasks"));
assert.ok(globalFallbackBlock.includes("overall record"));

// ─── normalizeTaskClass ────────────────────────────────────────────────────

assert.equal(normalizeTaskClass("extraction"), "extraction");
assert.equal(normalizeTaskClass("  Reasoning "), "reasoning");
assert.equal(normalizeTaskClass("ocr"), undefined);
assert.equal(normalizeTaskClass(""), undefined);
assert.equal(normalizeTaskClass(42), undefined);
assert.equal(normalizeTaskClass(undefined), undefined);

// ─── classifyTaskClass: nearest-prototype with injected embedder ───────────

// Fake embedder: one dimension per class, 1 when the text mentions that
// class's marker keyword. Each prototype contains exactly its own marker.
const MARKERS: Record<string, string> = {
  reasoning: "trade-offs",
  classification: "categorize",
  extraction: "extract",
  generation: "draft",
};
for (const cls of TASK_CLASSES) {
  assert.ok(
    TASK_CLASS_PROTOTYPES[cls].toLowerCase().includes(MARKERS[cls]),
    `prototype for ${cls} must contain its marker "${MARKERS[cls]}"`,
  );
}
const fakeEmbed = async (texts: string[]) =>
  texts.map((t) =>
    TASK_CLASSES.map((cls) =>
      t.toLowerCase().includes(MARKERS[cls]) ? 1 : 0,
    ),
  );

async function classifyTaskClassTests() {
  assert.equal(
    await classifyTaskClass(
      "Extract the invoice line items from these PDFs",
      fakeEmbed,
    ),
    "extraction",
  );
  assert.equal(
    await classifyTaskClass(
      "Categorize these support tickets by urgency",
      fakeEmbed,
    ),
    "classification",
  );
  assert.equal(
    await classifyTaskClass("Draft a launch announcement email", fakeEmbed),
    "generation",
  );
  // No signal at all → undefined (caller degrades to global stats).
  assert.equal(await classifyTaskClass("xyzzy", fakeEmbed), undefined);
  assert.equal(await classifyTaskClass("   ", fakeEmbed), undefined);
  // Embedder failure is fail-soft, never a throw.
  assert.equal(
    await classifyTaskClass("Extract fields", async () => {
      throw new Error("embedder down");
    }),
    undefined,
  );
}

// ─── belowClusterAcceptFloor ───────────────────────────────────────────────

const badOnCluster = {
  settled_tasks: CLUSTER_FLOOR_MIN_TASKS,
  accept_rate: 0.1,
  mean_calibration: 0.4,
  task_class: "generation",
  scope: "cluster" as const,
};
assert.ok(belowClusterAcceptFloor(badOnCluster, 0.25));
// Global-scope stats never trigger the floor, however bad.
assert.ok(
  !belowClusterAcceptFloor({ ...badOnCluster, scope: "global" as const }, 0.25),
);
// Legacy stats without a scope are treated as global.
assert.ok(
  !belowClusterAcceptFloor(
    { settled_tasks: 10, accept_rate: 0.0, mean_calibration: 0.4 },
    0.25,
  ),
);
// Too little same-class history → never skip.
assert.ok(
  !belowClusterAcceptFloor(
    { ...badOnCluster, settled_tasks: CLUSTER_FLOOR_MIN_TASKS - 1 },
    0.25,
  ),
);
// At or above the floor → keep soliciting.
assert.ok(!belowClusterAcceptFloor({ ...badOnCluster, accept_rate: 0.25 }, 0.25));
// Disabled or nonsense floors never skip.
assert.ok(!belowClusterAcceptFloor(badOnCluster, 0));
assert.ok(!belowClusterAcceptFloor(badOnCluster, Number.NaN));

// ─── invitedSemanticWeight: preserve semantic routing in the auction ──────

const floorIds = new Set(["arbor-hive-backstop"]);
const invited = [
  "best-match",
  "second-match",
  "third-match",
  "arbor-hive-backstop",
];
assert.equal(invitedSemanticWeight("best-match", invited, floorIds), 1);
assert.equal(invitedSemanticWeight("second-match", invited, floorIds), 0.5);
assert.equal(invitedSemanticWeight("third-match", invited, floorIds), 1 / 3);
assert.equal(
  invitedSemanticWeight("arbor-hive-backstop", invited, floorIds),
  1,
);
assert.equal(
  invitedSemanticWeight("open-market-agent", undefined, floorIds),
  1,
);

classifyTaskClassTests()
  .then(() => {
    console.log("bid-calibration tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
