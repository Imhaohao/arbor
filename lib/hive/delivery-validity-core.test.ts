import assert from "node:assert/strict";
import {
  MIN_WORK_CHARS,
  assessDelivery,
  deliveryRate,
  verdictBreakdown,
} from "./delivery-validity-core";

// ─── the exact strings that broke the experiment ─────────────────────────────
// These are verbatim from battery_runs on 2026-07-30. Every one was recorded as
// status "complete", which made delivery rate 100% for every arm and left the
// redundancy hypothesis untestable.
const REAL_FAILURES: Array<[string, string]> = [
  [
    "infergonka-a2a",
    "[FALLBACK — auth not satisfied]\n\nagent card unreachable: HTTP 410 from https://a2a.gogonka.com/.well-known/agent.json",
  ],
  [
    "fodda",
    "Fodda A2A endpoint is operational. Provide an API key via Authorization: Bearer <key> for full access to trend intelligence. Get a key at https://app.fodda.ai",
  ],
  [
    "agentcrush",
    '{\n  "help": "AgentCrush A2A endpoint. Send a plain-text message:\\n  \\"find <capability>\\" — top 3 payable counterparty agents"\n}',
  ],
];
for (const [agent, text] of REAL_FAILURES) {
  const a = assessDelivery(text);
  assert.equal(a.isWork, false, `${agent} must NOT count as delivered work`);
  assert.ok(a.matched, `${agent} must record which marker fired`);
  assert.ok(a.reason.length > 0);
}
// And each is classified as the right KIND of failure.
assert.equal(assessDelivery(REAL_FAILURES[0][1]).verdict, "transport_failure");
assert.equal(assessDelivery(REAL_FAILURES[1][1]).verdict, "credentials_required");
assert.equal(assessDelivery(REAL_FAILURES[2][1]).verdict, "help_text");

// ─── transport failures ──────────────────────────────────────────────────────
for (const t of [
  "[FALLBACK] something went wrong",
  "agent card unreachable",
  "HTTP 503 from upstream",
  "http 404",
  "The endpoint is down for maintenance right now, please retry later today.",
  "ECONNREFUSED while connecting to the agent host",
  "fetch failed for the configured endpoint",
  "no runner: No specialist runner registered for foo",
]) {
  assert.equal(
    assessDelivery(t).verdict,
    "transport_failure",
    `should be transport_failure: ${t.slice(0, 40)}`,
  );
}

// A transport failure that ALSO mentions a key is transport, not credentials —
// the outage is the more fundamental fact.
assert.equal(
  assessDelivery(
    "agent card unreachable: HTTP 410. Provide an API key to continue.",
  ).verdict,
  "transport_failure",
  "outage must outrank the credential hint",
);

// ─── credential walls ────────────────────────────────────────────────────────
for (const t of [
  "This service is operational. Provide an API key via Authorization: Bearer <key> to continue using it.",
  "Unauthorized — please authenticate before calling this endpoint again today.",
  "This endpoint requires an API key before any capability can be invoked here.",
  "Payment required to access this capability, please top up your account now.",
]) {
  assert.equal(
    assessDelivery(t).verdict,
    "credentials_required",
    `should be credentials_required: ${t.slice(0, 40)}`,
  );
}

// ─── help text ───────────────────────────────────────────────────────────────
for (const t of [
  'Send a plain-text message: "find <capability>" to search the mesh network',
  '{"help": "this endpoint accepts natural language routing requests only"}',
  "Available commands: find, trust, route, verify, settle, and several others",
  "Usage: send a capability description and this router returns matching servers",
]) {
  assert.equal(
    assessDelivery(t).verdict,
    "help_text",
    `should be help_text: ${t.slice(0, 40)}`,
  );
}

// ─── genuine work is preserved ───────────────────────────────────────────────
// The classifier must be CONSERVATIVE. Failing a terse-but-real answer would
// bias the corpus against concise agents — the opposite of the bug being fixed.
const REAL_WORK = [
  "The escrow releases $114.00 to the worker after the 5% platform fee is deducted from $120.00.",
  "45 mph equals 20.1168 m/s, using exactly 1609.344 metres per mile and 3600 seconds per hour.",
  "A2A is the Agent2Agent protocol, originally published by Google and now stewarded by the Linux Foundation.",
  "The bug is a missing await before fetch(), so the cache stores a Promise instead of the resolved value.",
];
for (const t of REAL_WORK) {
  const a = assessDelivery(t);
  assert.equal(a.isWork, true, `real work misclassified: ${t.slice(0, 50)}`);
  assert.equal(a.verdict, "work");
}
// Mentioning "key" or "http" incidentally must not trip the classifier.
assert.equal(
  assessDelivery(
    "The primary key on the runs table should be a composite of agent_id and task_id for this query.",
  ).isWork,
  true,
  "the word 'key' in real work must not trigger a credential verdict",
);
assert.equal(
  assessDelivery(
    "Use an HTTPS endpoint and send the payload as JSON with a content-type header set appropriately.",
  ).isWork,
  true,
  "discussing HTTP without an error status is still work",
);

// ─── empty / too short ───────────────────────────────────────────────────────
assert.equal(assessDelivery("").verdict, "empty");
assert.equal(assessDelivery("   \n  ").verdict, "empty");
assert.equal(assessDelivery(undefined).verdict, "empty");
assert.equal(assessDelivery("ok").verdict, "empty", "a 2-char reply answers nothing");
assert.ok(MIN_WORK_CHARS > 10 && MIN_WORK_CHARS < 200);
// Exactly at the threshold counts as work.
assert.equal(assessDelivery("x".repeat(MIN_WORK_CHARS)).isWork, true);
assert.equal(assessDelivery("x".repeat(MIN_WORK_CHARS - 1)).isWork, false);

// ─── deliveryRate ────────────────────────────────────────────────────────────
// Undefined for an empty set: "we measured nothing" must never render as
// "everything failed".
assert.equal(deliveryRate([]), undefined);
assert.equal(deliveryRate(REAL_WORK), 1);
assert.equal(deliveryRate(REAL_FAILURES.map(([, t]) => t)), 0);
assert.equal(
  deliveryRate([REAL_WORK[0], REAL_FAILURES[0][1]]),
  0.5,
  "mixed set must yield a real fraction",
);

// The headline regression: the old instrument scored this 100%, the fixed one 0%.
const DEAD_ROSTER = REAL_FAILURES.map(([, t]) => t);
assert.equal(
  deliveryRate(DEAD_ROSTER),
  0,
  "a roster of dead endpoints must measure 0% delivery, not 100%",
);

// ─── verdictBreakdown ────────────────────────────────────────────────────────
const breakdown = verdictBreakdown([
  ...REAL_WORK,
  ...REAL_FAILURES.map(([, t]) => t),
  "",
]);
assert.equal(breakdown.work, REAL_WORK.length);
assert.equal(breakdown.transport_failure, 1);
assert.equal(breakdown.credentials_required, 1);
assert.equal(breakdown.help_text, 1);
assert.equal(breakdown.empty, 1);
// Counts must partition the input.
const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
assert.equal(total, REAL_WORK.length + REAL_FAILURES.length + 1);

console.log(
  "delivery-validity-core.test.ts: all assertions passed " +
    `(the 3 real 2026-07-30 fallback strings now measure 0% delivery, not 100%)`,
);
