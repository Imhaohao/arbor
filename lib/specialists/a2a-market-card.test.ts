import assert from "node:assert/strict";
import {
  attachMarketRankDimensions,
  buildMarketAgentCard,
  marketAvailabilityForReadiness,
} from "./a2a-market-card";

const previous = process.env.ARBOR_A2A_HMAC_REQUIRED;
process.env.ARBOR_A2A_HMAC_REQUIRED = "true";

const card = buildMarketAgentCard({
  url: "http://localhost:3000/api/a2a/market",
  headers: new Headers({
    "x-forwarded-host": "arbor.example",
    "x-forwarded-proto": "https",
  }),
});

assert.equal(card.url, "https://arbor.example/api/a2a/market");
assert.equal(card.arbor.did, "did:web:arbor.example:agents:arbor-market");
assert.ok(card.defaultInputModes.includes("text/toon"));
assert.ok(card.defaultOutputModes.includes("text/toon"));
assert.deepEqual(card.security, [{ arborHmac: [] }]);
assert.equal(card.arbor.blackboard.write_auth, "arborHmac");
assert.ok(card.arbor.supported_methods.includes("tasks/cancel"));

if (previous === undefined) delete process.env.ARBOR_A2A_HMAC_REQUIRED;
else process.env.ARBOR_A2A_HMAC_REQUIRED = previous;

// ─── W4: availability mapping ─────────────────────────────────────────────
assert.equal(marketAvailabilityForReadiness("ready"), 1.0, "ready -> 1.0");
assert.equal(marketAvailabilityForReadiness("mock_only"), 0.3, "mock_only -> 0.3");
assert.equal(marketAvailabilityForReadiness("needs_key"), 0.1, "needs_key -> 0.1");
assert.equal(marketAvailabilityForReadiness("endpoint_down"), 0.1, "endpoint_down -> 0.1");
assert.equal(
  marketAvailabilityForReadiness("protocol_mismatch"),
  0.1,
  "protocol_mismatch -> 0.1",
);
assert.equal(
  marketAvailabilityForReadiness("needs_owner_action"),
  0.1,
  "needs_owner_action -> 0.1",
);
assert.equal(marketAvailabilityForReadiness(undefined), 0.5, "unknown/no-smoke -> 0.5 neutral");
assert.equal(marketAvailabilityForReadiness("something-new"), 0.5, "unmapped status -> 0.5 neutral");

// ─── W4: attachMarketRankDimensions ────────────────────────────────────────
{
  const entries = [
    {
      agent_id: "cheap-ready",
      cost_baseline: 0.05,
      readiness_status: "ready",
      reputation_dims: { reliability: 0.9, quality: 0.9, safety: 1.0, speed: 0.9 },
    },
    {
      agent_id: "expensive-down",
      cost_baseline: 20,
      readiness_status: "endpoint_down",
      reputation_dims: { reliability: 0.2, quality: 0.2, safety: 1.0, speed: 0.2 },
    },
  ];
  const decorated = attachMarketRankDimensions(entries);
  assert.equal(decorated.length, 2, "entries are not dropped");
  // Original order preserved (this is a decoration, not a re-sort).
  assert.equal(decorated[0].agent_id, "cheap-ready");
  assert.equal(decorated[1].agent_id, "expensive-down");
  assert.ok(
    decorated[0].rank_score > decorated[1].rank_score,
    "cheaper + ready + better reputation must score higher",
  );
  for (const d of decorated) {
    assert.ok(d.rank_score >= 0 && d.rank_score <= 1, "rank_score clamped to [0,1]");
  }

  // Missing reputation_dims/similarity still produce a neutral, non-throwing score.
  const bare = attachMarketRankDimensions([{ agent_id: "no-data", cost_baseline: 1 }]);
  assert.equal(bare.length, 1);
  assert.ok(bare[0].rank_score >= 0 && bare[0].rank_score <= 1, "bare entry gets a valid score");
}

console.log("a2a-market-card tests passed");
