import assert from "node:assert/strict";
import {
  artifactDataPart,
  canTransitionTask,
  dataFromParts,
  didWebForUrl,
  negotiateSla,
  textFromParts,
} from "./acp";

assert.equal(
  didWebForUrl("https://arbor.example", "agents/arbor-market"),
  "did:web:arbor.example:agents:arbor-market",
);
assert.equal(
  textFromParts([
    { kind: "text", text: "one" },
    { content_type: "text/plain", content: "two" },
  ]),
  "one\n\ntwo",
);
assert.deepEqual(dataFromParts([{ kind: "data", data: { prompt: "ship" } }]), {
  prompt: "ship",
});

const accepted = negotiateSla({
  request: {
    max_budget: 5,
    deadline_at: 2_000,
    capabilities: ["post_task"],
    accepted_formats: ["text/toon", "application/json"],
  },
  offeredCapabilities: ["post_task", "discover"],
  maxBudget: 20,
  now: 1_000,
});
assert.equal(accepted.accepted, true);
if (accepted.accepted) {
  assert.equal(accepted.sla.output_format, "toon");
  const part = artifactDataPart({ rows: [{ id: 1 }, { id: 2 }] }, "toon");
  assert.equal(part.content_type, "text/toon");
}

assert.deepEqual(
  negotiateSla({
    request: { capabilities: ["delete_everything"] },
    offeredCapabilities: ["post_task"],
  }),
  { accepted: false, reason: "unsupported capabilities: delete_everything" },
);
assert.equal(canTransitionTask("submitted", "working"), true);
assert.equal(canTransitionTask("working", "completed"), true);
assert.equal(canTransitionTask("completed", "working"), false);
assert.equal(canTransitionTask("input-required", "working"), true);

console.log("acp tests passed");
