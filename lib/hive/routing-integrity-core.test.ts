import assert from "node:assert/strict";
import {
  AMBIGUOUS_RUNNER_UP_GAP,
  AVAILABILITY_HALF_LIFE_MS,
  AVAILABILITY_UNKNOWN,
  DEFAULT_CAPABILITY_FLOOR,
  INERT_WEIGHTED_SD,
  MIN_DISCOVERY_COVERAGE,
  assessCapability,
  assessDiscoveryCoverage,
  availabilityWithFreshness,
  calibrateCapabilityFloor,
  dimensionDiscrimination,
  renormalizeOverEvidenced,
} from "./routing-integrity-core";

// ─── assessCapability ────────────────────────────────────────────────────────
// Measured similarities from the live 119-agent pool (MiniLM over capability_text).
const VIDEO_BEST = 0.2332; // "make me a video about a kid ... stanford"
const NONSENSE_BEST = 0.1801; // "xylophone quantum banana teapot velvet"
const TRUST_BEST = 0.5806; // "audit an identity and verify trust attestations"
const NEWS_BEST = 0.5696; // "summarize today's korean news headlines"
const PAY_BEST = 0.48; // "send a crypto payment and settle an invoice"

// The regression this module exists to prevent: the Stanford video prompt must
// refuse rather than confidently return a Korean news agent.
const video = assessCapability([VIDEO_BEST, 0.1751, 0.17, 0.16, 0.09]);
assert.equal(video.verdict, "no_capable_candidate", "video prompt must refuse");
assert.equal(video.best, VIDEO_BEST);
assert.match(video.reason, /below the 0\.35 floor/);
assert.ok(video.reason.includes("confident irrelevant"), "reason must be actionable");

const nonsense = assessCapability([NONSENSE_BEST, 0.1695, 0.16]);
assert.equal(nonsense.verdict, "no_capable_candidate", "nonsense must refuse");

// Genuine matches must NOT be refused — a guard that blocks real work is worse
// than no guard.
for (const [label, best] of [
  ["trust audit", TRUST_BEST],
  ["korean news", NEWS_BEST],
  ["payments", PAY_BEST],
] as const) {
  const a = assessCapability([best, best - 0.09, best - 0.15]);
  assert.equal(a.verdict, "grounded", `${label} must be grounded, got ${a.verdict}`);
}

// Exactly at the floor is grounded; a hair below is not.
assert.equal(assessCapability([DEFAULT_CAPABILITY_FLOOR]).verdict, "grounded");
assert.equal(
  assessCapability([DEFAULT_CAPABILITY_FLOOR - 1e-9]).verdict,
  "no_capable_candidate",
);

// Empty and all-garbage pools are reported distinctly, never as grounded.
assert.equal(assessCapability([]).verdict, "empty_pool");
assert.equal(assessCapability([NaN, Infinity]).verdict, "empty_pool");
// One bad embedding must not fabricate a refusal when a real match is present.
const withGarbage = assessCapability([NaN, TRUST_BEST, 0.2]);
assert.equal(withGarbage.verdict, "grounded", "non-finite values must be ignored");
assert.equal(withGarbage.best, TRUST_BEST);

// Input order must not matter.
assert.deepEqual(
  assessCapability([0.1, TRUST_BEST, 0.4]).best,
  assessCapability([TRUST_BEST, 0.4, 0.1]).best,
);

// Arbitrary-order detection: clears the floor but leaders are tied.
const tiedLeaders = assessCapability([0.5, 0.495, 0.2]);
assert.equal(tiedLeaders.verdict, "grounded");
assert.ok(tiedLeaders.top_order_arbitrary, "0.005 gap must flag arbitrary order");
assert.match(tiedLeaders.reason, /arbitrary/);
const clearLeader = assessCapability([0.58, 0.49, 0.2]);
assert.ok(!clearLeader.top_order_arbitrary, "0.09 gap is a clear leader");
assert.ok(clearLeader.runner_up_gap > AMBIGUOUS_RUNNER_UP_GAP);
// A single candidate has no runner-up and is not "arbitrary".
const single = assessCapability([TRUST_BEST]);
assert.equal(single.runner_up_gap, 0);
assert.ok(!single.top_order_arbitrary);

// A custom floor is honoured; a non-finite floor falls back to the default.
assert.equal(assessCapability([0.3], 0.2).verdict, "grounded");
assert.equal(assessCapability([0.3], NaN).floor_used, DEFAULT_CAPABILITY_FLOOR);

// ─── calibrateCapabilityFloor ────────────────────────────────────────────────
// The real probe set separates cleanly, so the derived floor lands in the gap.
const derived = calibrateCapabilityFloor([
  { best: TRUST_BEST, should_match: true },
  { best: NEWS_BEST, should_match: true },
  { best: PAY_BEST, should_match: true },
  { best: VIDEO_BEST, should_match: false },
  { best: NONSENSE_BEST, should_match: false },
]);
assert.ok(derived !== undefined, "separable probes must yield a floor");
assert.ok(
  derived > VIDEO_BEST && derived < PAY_BEST,
  `derived floor ${derived} must sit between the classes`,
);
// Overlapping classes must return undefined rather than a misclassifying number.
assert.equal(
  calibrateCapabilityFloor([
    { best: 0.4, should_match: true },
    { best: 0.45, should_match: false },
  ]),
  undefined,
  "overlapping classes -> undefined",
);
// Missing either class is not calibratable.
assert.equal(
  calibrateCapabilityFloor([{ best: 0.5, should_match: true }]),
  undefined,
);
assert.equal(calibrateCapabilityFloor([]), undefined);

// ─── dimensionDiscrimination ─────────────────────────────────────────────────
// Reproduces the live-pool audit: reputation is a constant and must be inert.
const pool = 100;
const stats = dimensionDiscrimination([
  {
    name: "capability",
    weight: 0.4,
    values: Array.from({ length: pool }, (_, i) => 0.05 + (i / pool) * 0.2),
  },
  { name: "reputation", weight: 0.3, values: new Array(pool).fill(0.6) },
  {
    name: "price",
    weight: 0.15,
    // 6 distinct values, ~78% on the modal one — the measured price shape.
    values: Array.from({ length: pool }, (_, i) =>
      i < 78 ? 0.4545 : [0.4, 0.5, 0.1429, 0.55, 0.62][i % 5],
    ),
  },
  {
    name: "availability",
    weight: 0.15,
    values: Array.from({ length: pool }, (_, i) =>
      i < 81 ? 1.0 : i < 95 ? 0.5 : 0.3,
    ),
  },
]);
const byName = Object.fromEntries(stats.map((s) => [s.name, s]));

assert.equal(byName.reputation.sd, 0, "constant dimension has sd 0");
assert.equal(byName.reputation.weighted_sd, 0);
assert.equal(byName.reputation.distinct_values, 1);
assert.equal(byName.reputation.modal_share, 1);
assert.ok(byName.reputation.inert, "a constant dimension must be flagged inert");

assert.ok(!byName.capability.inert, "a spread dimension must not be inert");
assert.ok(!byName.availability.inert, "3-bucket availability still discriminates");
assert.ok(byName.capability.weighted_sd > INERT_WEIGHTED_SD);

// The audit's headline: availability out-discriminates capability despite far less
// weight. This is the dilution symptom renormalization addresses.
assert.ok(
  byName.availability.weighted_sd > byName.capability.weighted_sd,
  "measured pool: availability out-discriminates capability",
);

// Degenerate inputs are handled without throwing.
assert.equal(dimensionDiscrimination([]).length, 0);
const empty = dimensionDiscrimination([
  { name: "x", weight: 1, values: [] },
])[0];
assert.equal(empty.sd, 0);
assert.ok(empty.inert, "an empty dimension cannot discriminate");
const dirty = dimensionDiscrimination([
  { name: "x", weight: 1, values: [NaN, 1, 0, Infinity] },
])[0];
assert.ok(dirty.sd > 0, "non-finite values are ignored, not zeroed");
assert.equal(dirty.distinct_values, 2);

// ─── renormalizeOverEvidenced ────────────────────────────────────────────────
const WEIGHTS = {
  capability: 0.4,
  reputation: 0.3,
  price: 0.15,
  availability: 0.15,
};
const fixed = renormalizeOverEvidenced(WEIGHTS, ["reputation"]);
assert.equal(fixed.reputation, 0, "inert dimension drops to 0");
const total = Object.values(fixed).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(total - 1) < 1e-6, `weights must still sum to 1, got ${total}`);
// Relative proportions among the survivors are preserved. Tolerance is 1e-4
// because the implementation rounds each weight to 6 decimals and the division
// amplifies that to ~3e-6.
assert.ok(
  Math.abs(fixed.capability / fixed.price - WEIGHTS.capability / WEIGHTS.price) <
    1e-4,
  "surviving dimensions keep their relative proportions",
);
// Capability regains its intended dominance over availability.
assert.ok(
  fixed.capability > WEIGHTS.capability,
  "freed weight must flow to the evidenced dimensions",
);

// Dropping two inert dimensions still normalizes.
const twoDropped = renormalizeOverEvidenced(WEIGHTS, ["reputation", "price"]);
assert.equal(twoDropped.price, 0);
assert.ok(
  Math.abs(
    Object.values(twoDropped).reduce((a, b) => a + b, 0) - 1,
  ) < 1e-6,
);
// All-inert is returned unchanged rather than inventing weights.
assert.deepEqual(
  renormalizeOverEvidenced(WEIGHTS, Object.keys(WEIGHTS)),
  WEIGHTS,
  "all dimensions inert -> unchanged",
);
// No inert dimensions is a no-op.
const noop = renormalizeOverEvidenced(WEIGHTS, []);
for (const k of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
  assert.ok(Math.abs(noop[k] - WEIGHTS[k]) < 1e-6, `${k} must be unchanged`);
}
// Unknown names in the inert list are ignored safely.
assert.deepEqual(
  renormalizeOverEvidenced(WEIGHTS, ["does-not-exist"]),
  noop,
);

// ─── availabilityWithFreshness ───────────────────────────────────────────────
const NOW = 1_785_000_000_000;
// A fresh observation is trusted as-is.
const fresh = availabilityWithFreshness(1.0, NOW, NOW);
assert.equal(fresh.retained, 1);
assert.equal(fresh.score, 1);
assert.ok(!fresh.stale);

// At one half-life, half the signal above "unknown" is gone.
const oneHalfLife = availabilityWithFreshness(
  1.0,
  NOW - AVAILABILITY_HALF_LIFE_MS,
  NOW,
);
assert.ok(
  Math.abs(oneHalfLife.score - 0.75) < 1e-6,
  `expected 0.75 at one half-life, got ${oneHalfLife.score}`,
);
assert.ok(oneHalfLife.stale, "one half-life old counts as stale");

// The measured case: a 12h-old "ready" must be materially discounted.
const twelveHours = availabilityWithFreshness(
  1.0,
  NOW - 12 * 60 * 60 * 1000,
  NOW,
);
assert.ok(
  twelveHours.score < 0.72 && twelveHours.score > AVAILABILITY_UNKNOWN,
  `12h-old ready should discount toward unknown, got ${twelveHours.score}`,
);
assert.ok(twelveHours.stale);

// Decay converges to "unknown", never past it — a stale observation means we do
// not know, not that the agent is dead.
const ancient = availabilityWithFreshness(1.0, NOW - 1e12, NOW);
assert.ok(
  Math.abs(ancient.score - AVAILABILITY_UNKNOWN) < 1e-6,
  `ancient observation must converge to unknown, got ${ancient.score}`,
);
// A known-dead observation decays UPWARD toward unknown, so a stale-but-healthy
// agent is never ranked below a freshly-confirmed-dead one.
const staleDead = availabilityWithFreshness(0, NOW - 1e12, NOW);
assert.ok(
  Math.abs(staleDead.score - AVAILABILITY_UNKNOWN) < 1e-6,
  "stale dead also converges to unknown",
);
const freshDead = availabilityWithFreshness(0, NOW, NOW);
assert.equal(freshDead.score, 0);
assert.ok(
  freshDead.score < availabilityWithFreshness(1.0, NOW - 1e12, NOW).score,
  "fresh-dead must rank below stale-ready",
);

// Unknown age must NOT be treated as fresh.
assert.equal(
  availabilityWithFreshness(1.0, undefined, NOW).score,
  AVAILABILITY_UNKNOWN,
);
assert.equal(availabilityWithFreshness(1.0, NaN, NOW).score, AVAILABILITY_UNKNOWN);
assert.equal(availabilityWithFreshness(NaN, NOW, NOW).score, AVAILABILITY_UNKNOWN);
// Future timestamps clamp to age 0 rather than amplifying the signal.
const future = availabilityWithFreshness(1.0, NOW + 60_000, NOW);
assert.equal(future.age_ms, 0);
assert.equal(future.score, 1);
// A non-positive half-life falls back to the default instead of dividing by zero.
assert.ok(
  Number.isFinite(availabilityWithFreshness(1.0, NOW - 1000, NOW, 0).score),
);
// Monotone: older is never more trusted.
let prev = 1.1;
for (const hours of [0, 3, 9, 24, 72]) {
  const s = availabilityWithFreshness(1.0, NOW - hours * 3_600_000, NOW).score;
  assert.ok(s <= prev, `score must not increase with age at ${hours}h`);
  prev = s;
}

// ─── assessDiscoveryCoverage ─────────────────────────────────────────────────
// The measured case: 45 of 219 usable agents reachable.
const usable = Array.from({ length: 219 }, (_, i) => `agent-${i}`);
const reachable = usable.slice(0, 45);
const cov = assessDiscoveryCoverage({
  reachable_ids: reachable,
  usable_ids: usable,
});
assert.equal(cov.usable, 219);
assert.equal(cov.invisible, 174, "174 usable agents must be reported invisible");
assert.ok(Math.abs(cov.coverage - 45 / 219) < 1e-4);
assert.ok(cov.degraded, "21% coverage must be flagged degraded");
assert.match(cov.reason, /unrepresentative/);

// Full coverage is not degraded.
const full = assessDiscoveryCoverage({
  reachable_ids: usable,
  usable_ids: usable,
});
assert.equal(full.invisible, 0);
assert.ok(!full.degraded);
// Reachable agents that are not usable must not inflate coverage.
const inflated = assessDiscoveryCoverage({
  reachable_ids: [...usable.slice(0, 45), ...Array.from({ length: 500 }, (_, i) => `dead-${i}`)],
  usable_ids: usable,
});
assert.equal(inflated.invisible, 174, "unusable reachable agents must not count");
assert.ok(inflated.degraded);
// Empty usable set is vacuously covered, not a divide-by-zero.
const none = assessDiscoveryCoverage({ reachable_ids: [], usable_ids: [] });
assert.equal(none.coverage, 1);
assert.ok(!none.degraded);
// Threshold is configurable.
assert.ok(
  !assessDiscoveryCoverage({
    reachable_ids: reachable,
    usable_ids: usable,
    minCoverage: 0.1,
  }).degraded,
);
assert.ok(MIN_DISCOVERY_COVERAGE > 0.5, "default coverage bar must be meaningful");

console.log(
  "routing-integrity-core.test.ts: all assertions passed " +
    `(capability floor ${DEFAULT_CAPABILITY_FLOOR} refuses the stanford video ` +
    `prompt at ${VIDEO_BEST} and admits trust-audit at ${TRUST_BEST}; ` +
    `availability half-life ${AVAILABILITY_HALF_LIFE_MS / 3_600_000}h)`,
);
