import assert from "node:assert/strict";
import {
  assertBlackboardWriteAllowed,
  blackboardVerifyEnabled,
  didForAgent,
  makeGist,
  normalizeBlackboardNamespace,
  parseBlackboardContent,
  resolveBlackboardVerification,
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

// ── DELM: gist-unfold (makeGist) ────────────────────────────────────────────
assert.equal(makeGist(""), "");
assert.equal(makeGist("   \n  "), "");
assert.equal(makeGist("hello world"), "hello world");
assert.equal(
  makeGist("first line\nsecond line\nthird line"),
  "first line",
  "only the first line is used",
);
assert.equal(
  makeGist("  spaced   out    words  \nrest"),
  "spaced out words",
  "internal whitespace runs collapse to a single space and ends are trimmed",
);
{
  const long = "x".repeat(300);
  const gist = makeGist(long);
  assert.ok(gist.length <= 240, "gist respects the default 240-char ceiling");
  assert.ok(gist.endsWith("..."), "truncated gist carries an ellipsis marker");
  assert.equal(gist, "x".repeat(237) + "...");
}
{
  // Custom maxChars.
  const gist = makeGist("abcdefghij", 5);
  assert.equal(gist, "ab...");
}
assert.equal(
  makeGist("short"),
  "short",
  "content under the ceiling is returned unchanged (no ellipsis)",
);

// ── DELM: admit-on-verify env flag (ARBOR_BLACKBOARD_VERIFY_ENABLED) ───────
{
  const original = process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED;
  try {
    delete process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED;
    assert.equal(blackboardVerifyEnabled(), false, "default off");

    for (const truthy of ["1", "true", "yes", "on", "enabled", "TRUE", "On"]) {
      process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED = truthy;
      assert.equal(blackboardVerifyEnabled(), true, `truthy value: ${truthy}`);
    }

    for (const falsy of ["0", "false", "no", "off", "disabled", ""]) {
      process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED = falsy;
      assert.equal(blackboardVerifyEnabled(), false, `falsy value: ${falsy}`);
    }
  } finally {
    if (original === undefined) {
      delete process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED;
    } else {
      process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED = original;
    }
  }
}

// ── DELM: resolveBlackboardVerification (labeling, never rejection) ────────
assert.equal(
  resolveBlackboardVerification({
    enabled: false,
    declaredSupportingIds: ["a", "b"],
    resolvedSupportingIds: ["a", "b"],
  }),
  undefined,
  "gate disabled -> no label at all (pre-DELM shape)",
);
assert.equal(
  resolveBlackboardVerification({
    enabled: true,
    declaredSupportingIds: undefined,
    resolvedSupportingIds: [],
  }),
  "unverified",
  "no supporting ids declared -> unverified",
);
assert.equal(
  resolveBlackboardVerification({
    enabled: true,
    declaredSupportingIds: [],
    resolvedSupportingIds: [],
  }),
  "unverified",
  "empty declared list -> unverified",
);
assert.equal(
  resolveBlackboardVerification({
    enabled: true,
    declaredSupportingIds: ["a", "b"],
    resolvedSupportingIds: ["a", "b"],
  }),
  "evidence_backed",
  "all declared ids resolved -> evidence_backed",
);
assert.equal(
  resolveBlackboardVerification({
    enabled: true,
    declaredSupportingIds: ["a", "b"],
    resolvedSupportingIds: ["a"],
  }),
  "unverified",
  "partial resolution -> unverified (labeling, not rejection: caller still stores the entry)",
);

// ── DELM: validateBlackboardPayload parses supporting_entry_ids ────────────
{
  const withSupport = validateBlackboardPayload({
    dag_id: "dag-1",
    kind: "result",
    content: "some result",
    confidence: 0.5,
    supporting_entry_ids: ["e1", " e2 ", ""],
  });
  assert.deepEqual(withSupport.supporting_entry_ids, ["e1", "e2"]);

  const withoutSupport = validateBlackboardPayload({
    dag_id: "dag-1",
    kind: "result",
    content: "some result",
    confidence: 0.5,
  });
  assert.equal(withoutSupport.supporting_entry_ids, undefined);

  assert.throws(() =>
    validateBlackboardPayload({
      dag_id: "dag-1",
      kind: "result",
      content: "some result",
      confidence: 0.5,
      supporting_entry_ids: "not-an-array",
    }),
  );
}

console.log("blackboard-core tests passed");
