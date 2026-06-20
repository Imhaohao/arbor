import assert from "node:assert/strict";
import {
  assessSmoke,
  classifyTransportFailure,
  generateSmokeTask,
} from "./agent-readiness";

assert.equal(classifyTransportFailure("bearer auth required; env var KEY not set"), "needs_key");
assert.equal(classifyTransportFailure("A2A JSON-RPC response missing result"), "protocol_mismatch");
assert.equal(classifyTransportFailure("fetch failed: connection refused"), "endpoint_down");

const smoke = generateSmokeTask("example-agent", ["create-payment", "refunds"]);
assert.equal(smoke.task_class, "generation");
assert.match(smoke.prompt, /read-only/i);
assert.match(smoke.prompt, /do not create/i);
for (const forbiddenAction of ["delete", "publish", "send", "purchase", "transfer", "charge"]) {
  assert.match(smoke.prompt, new RegExp(forbiddenAction));
}

assert.deepEqual(
  assessSmoke({
    transport_status: "ready",
    probe_status: "pass",
    bid_status: "pass",
    execution_status: "pass",
    judge_status: "pass",
    eval_status: "pass",
    scratchpad_status: "pass",
    full_run: true,
    has_live_transport: true,
    probe_error: undefined,
  }),
  {
    readiness_status: "ready",
    failure_bucket: "passed",
    settlement_eligible: true,
  },
);

assert.equal(
  assessSmoke({
    transport_status: "ready",
    probe_status: "pass",
    bid_status: "declined",
    execution_status: "skipped",
    judge_status: "skipped",
    eval_status: "pass",
    scratchpad_status: "skipped",
    full_run: true,
    has_live_transport: true,
    probe_error: undefined,
  }).failure_bucket,
  "bid_declined",
);

assert.equal(
  assessSmoke({
    transport_status: "ready",
    probe_status: "pass",
    bid_status: "pass",
    execution_status: "pass",
    judge_status: "pass",
    eval_status: "fail",
    scratchpad_status: "pass",
    full_run: true,
    has_live_transport: true,
    probe_error: undefined,
  }).failure_bucket,
  "registration_eval_failed",
);

assert.equal(
  assessSmoke({
    transport_status: "ready",
    probe_status: "fail",
    bid_status: "skipped",
    execution_status: "skipped",
    judge_status: "skipped",
    eval_status: "pass",
    scratchpad_status: "skipped",
    full_run: true,
    has_live_transport: true,
    probe_error: "skill mismatch: registry capability not declared by agent card",
  }).failure_bucket,
  "capability_mismatch",
);

console.log("agent-readiness tests passed");
