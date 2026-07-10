import assert from "node:assert/strict";
import {
  emptyProfile,
  profileOutcomeSucceeded,
  profileScore,
  profileWeightedRank,
  uncertaintyFor,
  updateProfile,
  type AgentProfile,
  type NodeOutcome,
} from "./profile-core";

const NOW = 1_750_000_000_000;

function outcome(overrides: Partial<NodeOutcome> = {}): NodeOutcome {
  return {
    agent_id: "agent-a",
    task_class: "reasoning",
    success: true,
    quality_score: 0.9,
    latency_seconds: 30,
    price_paid: 0.5,
    settled_at: NOW,
    ...overrides,
  };
}

// ─── uncertaintyFor ──────────────────────────────────────────────────────────
assert.equal(uncertaintyFor(0), 1, "no evidence -> fully uncertain");
assert.ok(uncertaintyFor(10) < 0.35, "10 tasks -> low uncertainty");
assert.ok(
  uncertaintyFor(3) > uncertaintyFor(8),
  "uncertainty decreases monotonically",
);

// ─── emptyProfile ────────────────────────────────────────────────────────────
{
  const fresh = emptyProfile("agent-a", "reasoning", NOW);
  assert.equal(fresh.tasks, 0);
  assert.equal(fresh.success_rate, 0.5, "neutral prior");
  assert.equal(fresh.uncertainty, 1);
}

// ─── updateProfile ───────────────────────────────────────────────────────────
{
  // First sample snaps to the observation (no stale prior drag).
  const first = updateProfile(emptyProfile("a", "reasoning", NOW), outcome());
  assert.equal(first.tasks, 1);
  assert.equal(first.successful_tasks, 1, "first accepted outcome is counted");
  assert.equal(first.success_trials, 1, "first exact success trial is counted");
  assert.equal(first.success_rate, 1, "first success snaps to 1");
  assert.equal(first.avg_quality, 0.9, "first quality snaps to sample");
  assert.equal(first.avg_latency_seconds, 30);
  assert.equal(first.avg_price, 0.5);
  assert.ok(first.uncertainty < 1, "evidence reduces uncertainty");

  // Subsequent samples move by EWMA, not replacement.
  const second = updateProfile(first, outcome({ success: false, quality_score: 0.1 }));
  assert.ok(
    second.success_rate < 1 && second.success_rate > 0.5,
    `failure moves rate partway, got ${second.success_rate}`,
  );
  assert.equal(second.successful_tasks, 1, "failure does not increment successes");
  assert.equal(second.success_trials, 2, "failure still increments exact trials");
  assert.ok(
    second.avg_quality < 0.9 && second.avg_quality > 0.1,
    "quality EWMA between samples",
  );

  // Missing observations leave dimensions untouched.
  const third = updateProfile(second, {
    ...outcome({ success: true }),
    quality_score: undefined,
    latency_seconds: undefined,
    price_paid: undefined,
  });
  assert.equal(third.avg_quality, second.avg_quality, "no judge -> quality kept");
  assert.equal(
    third.avg_latency_seconds,
    second.avg_latency_seconds,
    "no latency -> kept",
  );
  assert.equal(third.avg_price, second.avg_price, "free run -> price kept");
  assert.equal(third.tasks, 3);
  assert.equal(third.successful_tasks, 2);
  assert.equal(third.success_trials, 3);
}

// Profile success follows the judge outcome, not merely whether material text
// existed and allowed the DAG to continue.
assert.equal(profileOutcomeSucceeded("complete", "accept"), true);
assert.equal(profileOutcomeSucceeded("disputed", "reject"), false);
assert.equal(profileOutcomeSucceeded("failed", undefined), false);

// ─── profileScore ────────────────────────────────────────────────────────────
{
  const strong: AgentProfile = {
    ...emptyProfile("a", "reasoning", NOW),
    tasks: 20,
    success_rate: 0.95,
    avg_quality: 0.9,
    uncertainty: uncertaintyFor(20),
  };
  const weak: AgentProfile = {
    ...emptyProfile("b", "reasoning", NOW),
    tasks: 20,
    success_rate: 0.2,
    avg_quality: 0.3,
    uncertainty: uncertaintyFor(20),
  };
  assert.ok(profileScore(strong) > profileScore(weak), "competence ranks");
  assert.ok(profileScore(strong) <= 1 && profileScore(weak) >= 0, "clamped");

  // Exploration: an unknown agent outscores a proven-bad one.
  const unknown = emptyProfile("c", "reasoning", NOW);
  assert.ok(
    profileScore(unknown) > profileScore(weak),
    "uncertainty bonus keeps new agents in the running",
  );
}

// ─── profileWeightedRank ─────────────────────────────────────────────────────
{
  const candidates = [
    { agent_id: "veteran-bad", similarity: 0.8 },
    { agent_id: "veteran-good", similarity: 0.75 },
    { agent_id: "stranger", similarity: 0.7 },
  ];
  const profiles = new Map<string, AgentProfile>([
    [
      "veteran-bad",
      {
        ...emptyProfile("veteran-bad", "reasoning", NOW),
        tasks: 15,
        success_rate: 0.1,
        avg_quality: 0.2,
        uncertainty: uncertaintyFor(15),
      },
    ],
    [
      "veteran-good",
      {
        ...emptyProfile("veteran-good", "reasoning", NOW),
        tasks: 15,
        success_rate: 0.95,
        avg_quality: 0.9,
        uncertainty: uncertaintyFor(15),
      },
    ],
  ]);

  const ranked = profileWeightedRank(candidates, profiles);
  assert.equal(
    ranked[0].agent_id,
    "veteran-good",
    "proven agent overtakes higher-similarity bad agent",
  );
  assert.ok(
    ranked.findIndex((candidate) => candidate.agent_id === "veteran-bad") >
      ranked.findIndex((candidate) => candidate.agent_id === "veteran-good"),
    "proven-bad history cannot outrank a proven-good near-peer",
  );
  assert.ok(
    ranked.every((c) => typeof c.routing_score === "number"),
    "every candidate carries a routing_score",
  );

  // Empty profile store leaves the semantic order untouched.
  const neutral = profileWeightedRank(candidates, new Map());
  assert.deepEqual(
    neutral.map((c) => c.agent_id),
    ["veteran-bad", "veteran-good", "stranger"],
    "no profiles -> similarity order preserved",
  );

  // When 4D discovery supplied a rank_score, the flywheel must blend from that
  // combined capability/reputation/price/availability score rather than
  // silently reverting to raw embedding similarity.
  const ranked4d = profileWeightedRank(
    [
      { agent_id: "high-sim-low-4d", similarity: 0.95, rank_score: 0.4 },
      { agent_id: "lower-sim-high-4d", similarity: 0.7, rank_score: 0.8 },
    ],
    new Map(),
  );
  assert.equal(ranked4d[0].agent_id, "lower-sim-high-4d");

  const conservative = profileWeightedRank(
    [
      { agent_id: "known-generalist", similarity: 0.6, rank_score: 0.6 },
      { agent_id: "unknown-specialist", similarity: 0.7, rank_score: 0.7 },
    ],
    new Map([
      [
        "known-generalist",
        {
          ...emptyProfile("known-generalist", "reasoning", NOW),
          tasks: 30,
          successful_tasks: 29,
          success_rate: 0.97,
          avg_quality: 0.95,
          uncertainty: uncertaintyFor(30),
        },
      ],
    ]),
  );
  assert.equal(
    conservative[0].agent_id,
    "unknown-specialist",
    "broad history may break close ties but cannot erase a clear query-fit lead",
  );
}

console.log("profile-core tests passed");
