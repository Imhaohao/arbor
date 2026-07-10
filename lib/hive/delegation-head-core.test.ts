import assert from "node:assert/strict";

import {
  rankWithDelegationHead,
  softWorkerTargets,
  trainDelegationHead,
} from "./delegation-head-core";

const targets = softWorkerTargets(
  { stripe: 1, square: 0, neon: 0 },
  0.2,
);
assert.ok(targets.stripe > targets.square, "higher measured reward gets more mass");
assert.ok(
  Math.abs(Object.values(targets).reduce((sum, value) => sum + value, 0) - 1) <
    1e-9,
  "soft targets sum to one",
);

const model = trainDelegationHead([
  {
    query: "onboard marketplace sellers and split payouts",
    worker_rewards: { stripe: 1, square: 0, neon: 0 },
  },
  {
    query: "monthly subscriptions and customer refunds",
    worker_rewards: { stripe: 1, square: 0, neon: 0 },
  },
  {
    query: "create an isolated postgres branch for a pull request",
    worker_rewards: { stripe: 0, square: 0, neon: 1 },
  },
]);

const ranked = rankWithDelegationHead(
  "marketplace seller payout accounts with automatic revenue split",
  [
    { agent_id: "square", similarity: 0.5, routing_score: 0.6 },
    { agent_id: "stripe", similarity: 0.5, routing_score: 0.58 },
    { agent_id: "unknown", similarity: 0.5, routing_score: 0.59 },
  ],
  model,
);
assert.equal(ranked[0].agent_id, "stripe", "query-conditioned head fixes a close base-rank miss");
assert.ok((ranked[0].learned_score ?? 0) > 0, "learned evidence is exposed");

const unknownOnly = rankWithDelegationHead(
  "unseen task",
  [
    { agent_id: "new-a", similarity: 0.5, routing_score: 0.7 },
    { agent_id: "new-b", similarity: 0.5, routing_score: 0.6 },
  ],
  model,
);
assert.deepEqual(
  unknownOnly.map((candidate) => candidate.agent_id),
  ["new-a", "new-b"],
  "agents absent from training retain the base order",
);

console.log("delegation-head-core tests passed");
