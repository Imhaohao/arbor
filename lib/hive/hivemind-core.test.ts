import assert from "node:assert/strict";
import {
  DEFAULT_EPSILON,
  DEFAULT_HIVE_WEIGHTS,
  DEFAULT_MAX_HIVE_SIZE,
  HIVE_ALLOWED_KINDS,
  HIVE_PRIME_DIRECTIVE,
  MIN_ROWS_TO_FIT,
  MIN_EXPLORE_SHARE,
  UBIQUITY_LIMIT,
  assessFittability,
  buildCharter,
  composeHive,
  coverageOf,
  diversityOf,
  scoreHive,
  seededRandom,
  teamReliability,
  type HiveMemberCandidate,
  type HiveOutcomeRow,
} from "./hivemind-core";

const agent = (
  id: string,
  partial: Partial<HiveMemberCandidate> = {},
): HiveMemberCandidate => ({
  agent_id: id,
  capabilities: [],
  reliability: 0.5,
  cost: 1,
  ...partial,
});

// ─── charter ─────────────────────────────────────────────────────────────────
const charter = buildCharter({
  objective: "make a video about a kid celebrating",
  members: ["higgsfield-video", "elevenlabs-music"],
  dagId: "dag123",
  nodeId: "generate",
});
assert.equal(charter.objective, "make a video about a kid celebrating");
assert.deepEqual(charter.members, ["higgsfield-video", "elevenlabs-music"]);
// Namespaced per node so parallel hives cannot read each other's working notes.
assert.equal(charter.blackboard_namespace, "hive:dag123:generate");
assert.equal(buildCharter({
  objective: "x", members: ["a"], dagId: "d",
}).blackboard_namespace, "hive:d");
// The collaboration verbs must be the ones the blackboard actually accepts.
assert.ok(charter.allowed_kinds.includes("critique"));
assert.ok(charter.allowed_kinds.includes("proposal"));
assert.ok(charter.allowed_kinds.includes("consensus"));
assert.equal(charter.allowed_kinds, HIVE_ALLOWED_KINDS);
// The prime directive must state the objective outranks a member's sub-answer.
assert.match(HIVE_PRIME_DIRECTIVE, /only success criterion/i);
assert.match(HIVE_PRIME_DIRECTIVE, /share one blackboard/i);
// Degenerate charters must fail loudly rather than produce an unaddressed hive.
assert.throws(() => buildCharter({ objective: "   ", members: ["a"], dagId: "d" }),
  /non-empty objective/);
assert.throws(() => buildCharter({ objective: "x", members: [], dagId: "d" }),
  /at least one member/);

// ─── coverageOf ──────────────────────────────────────────────────────────────
const vid = agent("vid", { capabilities: ["video"] });
const mus = agent("mus", { capabilities: ["music"] });
assert.equal(coverageOf([vid, mus], ["video", "music"]), 1);
assert.equal(coverageOf([vid], ["video", "music"]), 0.5);
assert.equal(coverageOf([], ["video"]), 0);
// No requirement means nothing is uncovered — not zero coverage.
assert.equal(coverageOf([], []), 1);

// ─── teamReliability ─────────────────────────────────────────────────────────
// Independent members: 1 - prod(1-p). This is the real reason a hive can beat
// its best member, and it is arithmetic, not a heuristic.
const twoIndependent = teamReliability([
  agent("a", { reliability: 0.5, provider: "p1" }),
  agent("b", { reliability: 0.5, provider: "p2" }),
]);
assert.ok(
  Math.abs(twoIndependent - 0.75) < 1e-9,
  `two independent 0.5 agents -> 0.75, got ${twoIndependent}`,
);
assert.ok(
  twoIndependent > 0.5,
  "a team must beat its best member when members are independent",
);

// Same provider = correlated failure. Two 0.5 agents behind one vendor must NOT
// look like 0.75 — one outage takes both.
const twoCorrelated = teamReliability([
  agent("a", { reliability: 0.5, provider: "same" }),
  agent("b", { reliability: 0.5, provider: "same" }),
]);
assert.ok(
  twoCorrelated < twoIndependent,
  `correlated pair (${twoCorrelated}) must score below independent pair (${twoIndependent})`,
);
assert.ok(twoCorrelated >= 0.5, "the group still carries its best member");

// Stacking one vendor must not approach certainty.
const fiveSameVendor = teamReliability(
  Array.from({ length: 5 }, (_, i) =>
    agent(`a${i}`, { reliability: 0.5, provider: "same" }),
  ),
);
assert.ok(
  fiveSameVendor < 0.8,
  `five agents behind one vendor must not look near-certain, got ${fiveSameVendor}`,
);

assert.equal(teamReliability([]), 0);
assert.equal(teamReliability([agent("a", { reliability: 1 })]), 1);
// Monotone: adding an independent member never lowers delivery odds.
const base = teamReliability([agent("a", { reliability: 0.6, provider: "x" })]);
const plus = teamReliability([
  agent("a", { reliability: 0.6, provider: "x" }),
  agent("b", { reliability: 0.3, provider: "y" }),
]);
assert.ok(plus > base, "an independent addition must not reduce reliability");

// ─── diversityOf ─────────────────────────────────────────────────────────────
assert.equal(diversityOf([]), 0);
assert.equal(
  diversityOf([agent("a", { provider: "p" }), agent("b", { provider: "p" })]),
  0.5,
);
assert.equal(
  diversityOf([agent("a", { provider: "p1" }), agent("b", { provider: "p2" })]),
  1,
);

// ─── scoreHive ───────────────────────────────────────────────────────────────
const scored = scoreHive([vid, mus], { required: ["video", "music"] });
assert.equal(scored.coverage, 1);
assert.ok(scored.score > 0);
// Coordination is charged per ADDITIONAL member, never on the first.
assert.equal(
  scoreHive([vid], { required: ["video"] }).coordination_penalty,
  0,
  "a solo agent pays no coordination cost",
);
assert.ok(
  scoreHive([vid, mus], { required: [] }).coordination_penalty >
    scoreHive([vid], { required: [] }).coordination_penalty,
  "each additional member adds coordination cost",
);
// Weights sum sanely and cost/coordination are penalties, not bonuses.
assert.ok(DEFAULT_HIVE_WEIGHTS.coverage > DEFAULT_HIVE_WEIGHTS.coordination);
const cheap = scoreHive([agent("c", { cost: 1 })], { required: [], costReference: 10 });
const pricey = scoreHive([agent("d", { cost: 9 })], { required: [], costReference: 10 });
assert.ok(cheap.score > pricey.score, "cost must reduce the score");

// ─── composeHive: solo is the default, not a special case ────────────────────
// One agent covers everything: adding a redundant duplicate must NOT happen.
const soloCase = composeHive({
  candidates: [
    agent("all-rounder", {
      capabilities: ["video", "music"], reliability: 0.95, cost: 1, provider: "p1",
    }),
    agent("redundant", {
      capabilities: ["video"], reliability: 0.3, cost: 5, provider: "p1",
    }),
  ],
  required: ["video", "music"],
});
assert.ok(soloCase);
assert.equal(soloCase.members.length, 1, "must not add a costly redundant member");
assert.equal(soloCase.members[0].agent_id, "all-rounder");
assert.equal(soloCase.hive_beats_solo, false);
assert.match(soloCase.rationale, /Solo/);

// ─── composeHive: a hive forms when it genuinely covers more ─────────────────
const complementary = composeHive({
  candidates: [
    agent("video-only", {
      capabilities: ["video"], reliability: 0.9, cost: 1, provider: "p1", affinity: 0.8,
    }),
    agent("music-only", {
      capabilities: ["music"], reliability: 0.9, cost: 1, provider: "p2", affinity: 0.8,
    }),
    agent("unrelated", {
      capabilities: ["taxes"], reliability: 0.9, cost: 3, provider: "p3",
    }),
  ],
  required: ["video", "music"],
});
assert.ok(complementary);
assert.equal(complementary.members.length, 2, "must team up to cover both needs");
assert.deepEqual(
  complementary.members.map((m) => m.agent_id).sort(),
  ["music-only", "video-only"],
  "must pick the complementary pair, not the irrelevant third agent",
);
assert.equal(complementary.scored.coverage, 1);
assert.ok(
  complementary.hive_beats_solo,
  "teaming must be reported as a genuine win over the best solo",
);
assert.ok(complementary.scored.score > complementary.best_solo_score);
assert.match(complementary.rationale, /Hive of 2/);

// ─── composeHive: constraints ────────────────────────────────────────────────
// Budget is a hard ceiling on the WHOLE team.
const budgeted = composeHive({
  candidates: [
    agent("a", { capabilities: ["video"], cost: 3, provider: "p1", reliability: 0.9 }),
    agent("b", { capabilities: ["music"], cost: 3, provider: "p2", reliability: 0.9 }),
  ],
  required: ["video", "music"],
  budget: 4,
});
assert.ok(budgeted);
assert.equal(budgeted.members.length, 1, "team cost must stay within budget");
assert.ok(budgeted.scored.cost <= 4);

// A candidate that alone exceeds the budget is never selected.
assert.equal(
  composeHive({
    candidates: [agent("expensive", { cost: 100 })],
    required: [],
    budget: 5,
  }),
  null,
  "no affordable candidate -> null, not an over-budget team",
);
assert.equal(composeHive({ candidates: [], required: [] }), null);

// maxSize is respected.
const capped = composeHive({
  candidates: Array.from({ length: 6 }, (_, i) =>
    agent(`a${i}`, { capabilities: [`c${i}`], reliability: 0.5, cost: 0.1, provider: `p${i}` }),
  ),
  required: Array.from({ length: 6 }, (_, i) => `c${i}`),
  maxSize: 3,
});
assert.ok(capped);
assert.ok(capped.members.length <= 3, "maxSize must bound the team");
assert.ok(DEFAULT_MAX_HIVE_SIZE >= 2);

// No duplicate members.
const ids = complementary.members.map((m) => m.agent_id);
assert.equal(new Set(ids).size, ids.length, "a member must not be added twice");

// ─── composeHive: correlated failure is not rewarded ─────────────────────────
// Two same-provider agents covering the same capability add little; the composer
// must prefer an independent one when reliability is what is on offer.
const independentPreferred = composeHive({
  candidates: [
    agent("p1-a", { capabilities: ["x"], reliability: 0.6, cost: 1, provider: "p1" }),
    agent("p1-b", { capabilities: ["x"], reliability: 0.6, cost: 1, provider: "p1" }),
    agent("p2-a", { capabilities: ["x"], reliability: 0.6, cost: 1, provider: "p2" }),
  ],
  required: ["x"],
});
assert.ok(independentPreferred);
if (independentPreferred.members.length > 1) {
  const providers = new Set(independentPreferred.members.map((m) => m.provider));
  assert.ok(
    providers.size > 1,
    "when teaming for reliability, members must span failure domains",
  );
}

// ─── assessFittability: the guard against the trap this module documents ─────
const row = (
  partial: Partial<HiveOutcomeRow> = {},
): HiveOutcomeRow => ({
  objective: "o",
  goal_family: "A",
  members: ["m1", "m2"],
  team_size: 2,
  coverage: 1,
  reliability: 0.8,
  diversity: 1,
  cost: 2,
  outcome_quality: 0.6,
  solo_baseline_quality: 0.5,
  ...partial,
});

// The historical shape: 16 rows, one ubiquitous member, thin baselines.
const historical = Array.from({ length: 16 }, (_, i) =>
  row({
    goal_family: i < 7 ? "A" : "B",
    members: ["arbor-hive-backstop", `other-${i}`],
    team_size: i % 3 === 0 ? 1 : 2,
    solo_baseline_quality: undefined,
  }),
);
const verdict = assessFittability(historical);
assert.equal(verdict.fittable, false, "16 confounded rows must not be declared fittable");
assert.ok(
  verdict.reasons.some((r) => /only 16 labelled teams/.test(r)),
  "must report the sample-size problem",
);
assert.ok(
  verdict.reasons.some((r) => /arbor-hive-backstop/.test(r) && /identifiable/.test(r)),
  "must flag the member present in nearly every team",
);
assert.ok(
  verdict.reasons.some((r) => /solo baseline/.test(r)),
  "must flag missing solo baselines",
);

// A single goal family is never fittable, however many rows.
const oneFamily = Array.from({ length: 200 }, (_, i) =>
  row({ goal_family: "A", members: [`a${i}`, `b${i}`], team_size: (i % 3) + 1 }),
);
assert.equal(assessFittability(oneFamily).fittable, false);
assert.ok(
  assessFittability(oneFamily).reasons.some((r) => /one goal family/.test(r)),
);

// A genuinely healthy set passes.
const healthy = Array.from({ length: MIN_ROWS_TO_FIT + 10 }, (_, i) =>
  row({
    goal_family: ["A", "B", "C"][i % 3],
    members: [`a${i % 11}`, `b${i % 7}`],
    team_size: (i % 3) + 1,
    explored: i % 2 === 0,
  }),
);
const healthyVerdict = assessFittability(healthy);
assert.equal(
  healthyVerdict.fittable,
  true,
  `healthy set should be fittable, blocked by: ${healthyVerdict.reasons.join("; ")}`,
);
assert.deepEqual(healthyVerdict.reasons, []);
assert.ok(UBIQUITY_LIMIT > 0.5 && UBIQUITY_LIMIT <= 1);

// A corpus with NO exploration is rejected even when it is otherwise healthy:
// a policy that only ever picks its favourites cannot identify their effect.
const policyOnly = healthy.map((r) => ({ ...r, explored: false }));
const policyVerdict = assessFittability(policyOnly);
assert.equal(policyVerdict.fittable, false, "a pure-policy corpus is self-confounded");
assert.ok(
  policyVerdict.reasons.some((r) => /exploration/.test(r)),
  "must name the missing exploration",
);
assert.ok(MIN_EXPLORE_SHARE > 0 && MIN_EXPLORE_SHARE < 1);

// ─── seededRandom ────────────────────────────────────────────────────────────
// Reproducibility is the whole point: a sweep's output IS a dataset, and you
// must be able to re-derive which teams it chose.
const r1 = seededRandom(42);
const r2 = seededRandom(42);
const seqA = [r1(), r1(), r1()];
const seqB = [r2(), r2(), r2()];
assert.deepEqual(seqA, seqB, "same seed must replay the same sequence");
assert.notDeepEqual(
  seqA,
  [seededRandom(43)(), seededRandom(43)(), seededRandom(43)()],
  "different seeds must diverge",
);
for (const v of seqA) assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
// A zero seed must not collapse the generator to a constant.
const rz = seededRandom(0);
assert.notEqual(rz(), rz());

// ─── explore: default path is untouched ──────────────────────────────────────
const deterministic = composeHive({
  candidates: [
    agent("a", { capabilities: ["x"], reliability: 0.9, cost: 1, provider: "p1" }),
    agent("b", { capabilities: ["y"], reliability: 0.9, cost: 1, provider: "p2" }),
  ],
  required: ["x", "y"],
});
assert.ok(deterministic);
assert.equal(deterministic.explored, false, "policy composition is not explored");
// epsilon 0 must behave exactly like no explore config at all.
const epsilonZero = composeHive({
  candidates: [
    agent("a", { capabilities: ["x"], reliability: 0.9, cost: 1, provider: "p1" }),
    agent("b", { capabilities: ["y"], reliability: 0.9, cost: 1, provider: "p2" }),
  ],
  required: ["x", "y"],
  explore: { epsilon: 0, seed: 1 },
});
assert.ok(epsilonZero);
assert.equal(epsilonZero.explored, false, "epsilon 0 must not mark as explored");
assert.deepEqual(
  epsilonZero.members.map((m) => m.agent_id),
  deterministic.members.map((m) => m.agent_id),
);

// ─── explore: reproducible, and varies across seeds ──────────────────────────
const pool = Array.from({ length: 6 }, (_, i) =>
  agent(`ag${i}`, {
    capabilities: [`c${i}`],
    reliability: 0.5,
    cost: 1,
    provider: `prov${i}`,
  }),
);
const exploreArgs = (seed: number) => ({
  candidates: pool,
  required: [],
  maxSize: 3,
  explore: { epsilon: 1, seed },
});
const e1 = composeHive(exploreArgs(7));
const e1again = composeHive(exploreArgs(7));
assert.ok(e1 && e1again);
assert.equal(e1.explored, true, "sampled teams must be flagged as explored");
assert.deepEqual(
  e1.members.map((m) => m.agent_id),
  e1again.members.map((m) => m.agent_id),
  "same seed must reproduce the same team",
);
assert.match(e1.rationale, /Explore/);

// Across many seeds, BOTH failure modes from the pilot must disappear:
// team size must vary, and no agent may dominate.
const sizes = new Set<number>();
const memberCounts = new Map<string, number>();
const TRIALS = 60;
for (let seed = 0; seed < TRIALS; seed += 1) {
  const c = composeHive(exploreArgs(seed));
  assert.ok(c);
  sizes.add(c.members.length);
  for (const m of c.members) {
    memberCounts.set(m.agent_id, (memberCounts.get(m.agent_id) ?? 0) + 1);
  }
}
assert.ok(
  sizes.size >= 2,
  `exploration must produce varied team sizes, saw ${[...sizes]}`,
);
const maxShare = Math.max(...memberCounts.values()) / TRIALS;
assert.ok(
  maxShare <= UBIQUITY_LIMIT,
  `no agent may exceed the ubiquity limit; worst share was ${maxShare.toFixed(2)}`,
);

// ─── explore: usage penalty rotates away from over-used agents ───────────────
// An agent already in every prior team must be sampled less than a fresh one.
const usageSkewed = { "ag0": 100 };
let ag0Picks = 0;
for (let seed = 0; seed < 60; seed += 1) {
  const c = composeHive({
    candidates: pool,
    required: [],
    maxSize: 2,
    explore: { epsilon: 1, seed, usage: usageSkewed, teamsSoFar: 100 },
  });
  assert.ok(c);
  if (c.members.some((m) => m.agent_id === "ag0")) ag0Picks += 1;
}
assert.ok(
  ag0Picks < 30,
  `a saturated agent must be down-weighted, but it appeared ${ag0Picks}/60 times`,
);

// ─── explore: constraints still hold ─────────────────────────────────────────
// Budget is respected even when sampling.
for (let seed = 0; seed < 25; seed += 1) {
  const c = composeHive({
    candidates: pool.map((p) => ({ ...p, cost: 3 })),
    required: [],
    maxSize: 4,
    budget: 7,
    explore: { epsilon: 1, seed },
  });
  assert.ok(c);
  assert.ok(c.scored.cost <= 7, `explored team broke budget: ${c.scored.cost}`);
  const ids = c.members.map((m) => m.agent_id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate members when sampling");
  assert.ok(c.members.length <= 4, "maxSize must bound sampled teams");
}
// No affordable candidate still returns null, not an over-budget sample.
assert.equal(
  composeHive({
    candidates: [agent("pricey", { cost: 50 })],
    required: [],
    budget: 5,
    explore: { epsilon: 1, seed: 3 },
  }),
  null,
);
assert.ok(DEFAULT_EPSILON > 0 && DEFAULT_EPSILON <= 1);

console.log(
  "hivemind-core.test.ts: all assertions passed " +
    `(2 independent 0.5 agents -> P(delivery) 0.75; same-vendor pair -> ${twoCorrelated.toFixed(3)}; ` +
    `fit gate needs >=${MIN_ROWS_TO_FIT} rows across >=2 goal families)`,
);
