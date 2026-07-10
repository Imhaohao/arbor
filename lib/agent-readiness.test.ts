import assert from "node:assert/strict";
import {
  assessMarketReadiness,
  assessSmoke,
  classifyTransportFailure,
  EPHEMERAL_TUNNEL_READINESS_MAX_AGE_MS,
  generateSmokeTask,
  isEphemeralTunnelEndpoint,
  READINESS_MAX_AGE_MS,
} from "./agent-readiness";

assert.equal(classifyTransportFailure("bearer auth required; env var KEY not set"), "needs_key");
assert.equal(classifyTransportFailure("A2A JSON-RPC response missing result"), "protocol_mismatch");
assert.equal(classifyTransportFailure("fetch failed: connection refused"), "endpoint_down");
assert.equal(isEphemeralTunnelEndpoint("https://quick.trycloudflare.com/a2a"), true);
assert.equal(isEphemeralTunnelEndpoint("https://trycloudflare.com.evil.example/a2a"), false);

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

const now = Date.now();
const completeRun = {
  run_id: "smoke-current",
  status: "complete",
  total_agents: 2,
  processed_agents: 2,
  completed_at: now - 1_000,
};
const readyEvidence = {
  run_id: completeRun.run_id,
  readiness_status: "ready",
  created_at: now - 1_000,
};

assert.deepEqual(
  assessMarketReadiness({
    endpoint: "https://agent.example.com/a2a",
    credential_satisfied: true,
    run: completeRun,
    evidence: readyEvidence,
    now,
  }),
  { ready: true, reason: null },
);
assert.equal(
  assessMarketReadiness({
    endpoint: "https://agent.example.com/a2a",
    credential_satisfied: true,
    run: null,
    evidence: null,
    now,
  }).reason,
  "no_readiness_run",
);
assert.equal(
  assessMarketReadiness({
    endpoint: "https://agent.example.com/a2a",
    credential_satisfied: true,
    run: { ...completeRun, status: "running" },
    evidence: readyEvidence,
    now,
  }).reason,
  "readiness_run_incomplete",
);
assert.equal(
  assessMarketReadiness({
    endpoint: "https://agent.example.com/a2a",
    credential_satisfied: true,
    run: { ...completeRun, completed_at: now - READINESS_MAX_AGE_MS - 1 },
    evidence: readyEvidence,
    now,
  }).reason,
  "readiness_expired",
);
assert.equal(
  assessMarketReadiness({
    endpoint: "https://temporary.trycloudflare.com/a2a",
    credential_satisfied: true,
    run: {
      ...completeRun,
      completed_at: now - EPHEMERAL_TUNNEL_READINESS_MAX_AGE_MS - 1,
    },
    evidence: readyEvidence,
    now,
  }).reason,
  "readiness_expired",
);
assert.equal(
  assessMarketReadiness({
    endpoint: "https://agent.example.com/a2a",
    credential_satisfied: true,
    run: completeRun,
    evidence: { ...readyEvidence, readiness_status: "endpoint_down" },
    now,
  }).reason,
  "endpoint_down",
);

console.log("agent-readiness tests passed");
