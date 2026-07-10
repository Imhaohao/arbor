import assert from "node:assert/strict";
import {
  emptyProfile,
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
}

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
  assert.equal(
    ranked[ranked.length - 1].agent_id,
    "veteran-bad",
    "proven-bad agent sinks",
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
}

console.log("profile-core tests passed");
