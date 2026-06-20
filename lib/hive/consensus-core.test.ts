import assert from "node:assert/strict";
import { decideConsensus } from "./consensus-core";

const base = {
  evaluations: [{ node_id: "a", verdict: "accept" as const }],
  nodes: [{ node_id: "a", revision_count: 0 }],
  confidence: 0.9,
  tieCount: 0,
  fallbackUsed: false,
  lowConfidenceThreshold: 0.55,
  maxRevisions: 2,
  tieEpsilon: 0.05,
};

assert.equal(decideConsensus(base).action, "reached");
assert.deepEqual(
  decideConsensus({
    ...base,
    evaluations: [{ node_id: "a", verdict: "reject" }],
  }),
  {
    action: "revise",
    node_ids: ["a"],
    reason: "Evaluator critique requires another bounded worker revision.",
  },
);
assert.equal(
  decideConsensus({
    ...base,
    evaluations: [{ node_id: "a", verdict: "reject" }],
    nodes: [{ node_id: "a", revision_count: 2 }],
  }).action,
  "escalate",
);
assert.equal(decideConsensus({ ...base, tieCount: 1 }).action, "escalate");
assert.equal(decideConsensus({ ...base, confidence: 0.2 }).action, "escalate");

console.log("consensus-core tests passed");
