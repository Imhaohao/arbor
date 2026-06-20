import assert from "node:assert/strict";
import {
  assertBlackboardWriteAllowed,
  didForAgent,
  normalizeBlackboardNamespace,
  parseBlackboardContent,
  serializeBlackboardContent,
  validateBlackboardPayload,
} from "./blackboard-core";

const payload = validateBlackboardPayload({
  dag_id: "dag-1",
  kind: "proposal",
  data: { rows: [{ id: 1 }, { id: 2 }] },
  confidence: 0.8,
  format: "toon",
});
assert.equal(payload.kind, "proposal");
assert.equal(normalizeBlackboardNamespace(undefined, payload.kind), "proposals");
assert.equal(normalizeBlackboardNamespace("code/backend", "artifact"), "code/backend");
assert.throws(() => normalizeBlackboardNamespace("../system", "artifact"));

assert.doesNotThrow(() =>
  assertBlackboardWriteAllowed({ role: "worker", kind: "artifact", namespace: "code" }),
);
assert.throws(() =>
  assertBlackboardWriteAllowed({ role: "worker", kind: "critique", namespace: "review" }),
);
assert.doesNotThrow(() =>
  assertBlackboardWriteAllowed({ role: "reviewer", kind: "critique", namespace: "review" }),
);
assert.throws(() =>
  assertBlackboardWriteAllowed({ role: "reviewer", kind: "consensus", namespace: "consensus" }),
);
assert.doesNotThrow(() =>
  assertBlackboardWriteAllowed({ role: "control", kind: "consensus", namespace: "consensus" }),
);

assert.equal(didForAgent("reviewer-1"), "did:web:arbor.local:agents:reviewer-1");
assert.throws(() => didForAgent("bad agent"));

const encoded = serializeBlackboardContent({
  data: { rows: [{ id: 1 }, { id: 2 }] },
  format: "toon",
});
assert.equal(encoded.content_format, "toon");
assert.equal(encoded.content_type, "text/toon");
assert.deepEqual(parseBlackboardContent(encoded), {
  rows: [{ id: 1 }, { id: 2 }],
});

console.log("blackboard-core tests passed");
