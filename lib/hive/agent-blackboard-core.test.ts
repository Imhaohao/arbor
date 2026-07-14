import assert from "node:assert/strict";
import {
  AGENT_BLACKBOARD_DEFAULT_READ_LIMIT,
  AGENT_BLACKBOARD_MAX_RAW_BODY_CHARS,
  containsCredentialLikeMaterial,
  isAssignedDagCollaborator,
  parseAgentBlackboardAppendRequest,
  parseAgentBlackboardReadRequest,
  safeBlackboardText,
  selectAgentBlackboardEntries,
  toAgentBlackboardStoredEntry,
} from "./agent-blackboard-core";

assert.equal(AGENT_BLACKBOARD_MAX_RAW_BODY_CHARS, 12_000);

assert.deepEqual(parseAgentBlackboardReadRequest({ dag_id: "dag-1", node_id: "edit" }), {
  dag_id: "dag-1",
  node_id: "edit",
  limit: AGENT_BLACKBOARD_DEFAULT_READ_LIMIT,
});
assert.equal(
  parseAgentBlackboardReadRequest({
    dag_id: "dag-1",
    node_id: "edit",
    namespace: "Artifacts/Media",
    limit: 4,
  }).namespace,
  "artifacts/media",
);
assert.throws(() =>
  parseAgentBlackboardReadRequest({ dag_id: "dag-1", node_id: "edit", limit: 51 }),
);
assert.throws(() =>
  parseAgentBlackboardReadRequest({
    dag_id: "dag-1",
    node_id: "edit",
    unexpected: true,
  }),
);
assert.throws(() =>
  parseAgentBlackboardReadRequest({
    dag_id: "dag-1",
    node_id: "edit",
    namespace: "system",
  }),
);

const textRequest = parseAgentBlackboardAppendRequest({
  dag_id: "dag-1",
  node_id: "edit",
  entry: {
    type: "text",
    kind: "observation",
    text: "  The source video is ready.  ",
    namespace: "handoff/video",
    confidence: 0.8,
  },
});
assert.deepEqual(toAgentBlackboardStoredEntry(textRequest), {
  kind: "observation",
  namespace: "handoff/video",
  content: "The source video is ready.",
  content_format: "text",
  content_type: "text/plain",
  confidence: 0.8,
});

const artifactRequest = parseAgentBlackboardAppendRequest({
  dag_id: "dag-1",
  node_id: "generate",
  entry: {
    type: "artifact_reference",
    artifact_id: "media:abc-123",
    media_type: "Video/MP4",
    label: "Vertical source video",
  },
});
assert.deepEqual(toAgentBlackboardStoredEntry(artifactRequest), {
  kind: "artifact",
  namespace: "artifacts",
  artifact_id: "media:abc-123",
  content:
    '{"type":"artifact_reference","version":1,"artifact_id":"media:abc-123","media_type":"video/mp4","label":"Vertical source video"}',
  content_format: "json",
  content_type: "application/vnd.arbor.artifact-reference+json",
  confidence: 1,
});
assert.throws(() =>
  parseAgentBlackboardAppendRequest({
    dag_id: "dag-1",
    node_id: "generate",
    entry: {
      type: "artifact_reference",
      artifact_id: "https://cdn.example/video.mp4?token=secretsecret",
      media_type: "video/mp4",
    },
  }),
);
assert.throws(() =>
  parseAgentBlackboardAppendRequest({
    dag_id: "dag-1",
    node_id: "generate",
    entry: {
      type: "text",
      kind: "result",
      text: "access_token=secretsecret",
    },
  }),
);
assert.throws(() =>
  parseAgentBlackboardAppendRequest({
    dag_id: "dag-1",
    node_id: "generate",
    entry: { type: "text", kind: "decision", text: "Control the workflow." },
  }),
);

assert.equal(containsCredentialLikeMaterial("Bearer abcdefghijklmnop"), true);
assert.equal(containsCredentialLikeMaterial("Normal editing guidance"), false);
assert.equal(
  safeBlackboardText("password=correct-horse-battery-staple"),
  "[redacted: credential-like content]",
);

assert.equal(
  isAssignedDagCollaborator({
    agentId: "clueso",
    nodeId: "edit",
    nodes: [
      { node_id: "generate", assigned_agent_id: "higgsfield" },
      { node_id: "edit", assigned_agent_id: "clueso" },
    ],
  }),
  true,
);
assert.equal(
  isAssignedDagCollaborator({
    agentId: "unassigned",
    nodeId: "edit",
    nodes: [{ node_id: "edit", assigned_agent_id: "clueso" }],
  }),
  false,
);

const rows = [
  {
    _id: "secret",
    node_id: "generate",
    agent_id: "higgsfield",
    kind: "observation",
    namespace: "system",
    content: "internal",
    confidence: 1,
    created_at: 4,
  },
  {
    _id: "artifact",
    node_id: "generate",
    agent_id: "higgsfield",
    kind: "artifact",
    namespace: "artifacts",
    content:
      '{"type":"artifact_reference","version":1,"artifact_id":"media:abc-123","media_type":"video/mp4"}',
    content_type: "application/vnd.arbor.artifact-reference+json",
    confidence: 0.9,
    created_at: 3,
  },
  {
    _id: "redacted",
    agent_id: "legacy",
    kind: "result",
    namespace: "research",
    content: "api_key=legacy-secret-value",
    confidence: 2,
    created_at: 2,
  },
  {
    _id: "older",
    agent_id: "worker",
    kind: "result",
    namespace: "research",
    content: "Older result",
    confidence: 0.5,
    created_at: 1,
  },
];
const selected = selectAgentBlackboardEntries({ rows, limit: 2 });
assert.equal(selected.length, 2);
assert.equal(selected[0]?.entry_id, "artifact");
assert.deepEqual(selected[0]?.value, {
  type: "artifact_reference",
  version: 1,
  artifact_id: "media:abc-123",
  media_type: "video/mp4",
});
assert.deepEqual(selected[1]?.value, {
  type: "text",
  text: "[redacted: credential-like content]",
});
assert.equal(selected[1]?.confidence, 1);
assert.deepEqual(
  selectAgentBlackboardEntries({ rows, namespace: "research", limit: 1 })[0]?.value,
  { type: "text", text: "[redacted: credential-like content]" },
);

console.log("agent-blackboard-core tests passed");
