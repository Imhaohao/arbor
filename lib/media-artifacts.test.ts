import assert from "node:assert/strict";
import {
  assertProviderJobTransition,
  extractMediaArtifactId,
  isArtifactRefAvailable,
  isTerminalProviderJob,
  normalizeArtifactRef,
  normalizeMediaArtifact,
  normalizeProviderJob,
  toArtifactRef,
} from "./media-artifacts";

const digest = "A".repeat(64);
const inputRef = {
  artifact_id: " video-1 ",
  version: 1,
  kind: "video",
  mime_type: "Video/MP4; codecs=avc1",
  locator: {
    kind: "external_url",
    url: "https://media.example/video.mp4",
    expires_at_ms: 2_000,
  },
  filename: " launch.mp4 ",
  byte_size: 1_024,
  integrity: { algorithm: "sha256", digest },
};

const ref = normalizeArtifactRef(inputRef);
assert.deepEqual(ref, {
  artifact_id: "video-1",
  version: 1,
  kind: "video",
  mime_type: "video/mp4",
  locator: {
    kind: "external_url",
    url: "https://media.example/video.mp4",
    expires_at_ms: 2_000,
  },
  filename: "launch.mp4",
  byte_size: 1_024,
  integrity: { algorithm: "sha256", digest: digest.toLowerCase() },
});
assert.equal(isArtifactRefAvailable(ref, 1_999), true);
assert.equal(isArtifactRefAvailable(ref, 2_000), false);

const convexRef = normalizeArtifactRef({
  artifact_id: "audio-1",
  version: 2,
  kind: "audio",
  mime_type: "audio/mpeg",
  locator: { kind: "convex_storage", storage_id: "kg2abc" },
});
assert.equal(isArtifactRefAvailable(convexRef, Number.MAX_SAFE_INTEGER), true);

assert.throws(
  () => normalizeArtifactRef({ ...inputRef, mime_type: "image/png" }),
  /incompatible/,
);

assert.equal(
  extractMediaArtifactId({ artifact: { artifact_id: "kg2media123" } }),
  "kg2media123",
);
assert.equal(
  extractMediaArtifactId({ text: '{"artifact_id":"kg2media456"}' }),
  "kg2media456",
);
assert.equal(
  extractMediaArtifactId("Final media: artifact://kg2media789"),
  "kg2media789",
);
assert.equal(extractMediaArtifactId("https://example.com/video.mp4"), undefined);
assert.throws(
  () =>
    normalizeArtifactRef({
      ...inputRef,
      locator: { kind: "external_url", url: "file:///tmp/video.mp4" },
    }),
  /HTTP\(S\)/,
);
assert.throws(
  () =>
    normalizeArtifactRef({
      ...inputRef,
      locator: {
        kind: "external_url",
        url: "https://secret@example.com/video.mp4",
      },
    }),
  /credentials/,
);
assert.throws(
  () => normalizeArtifactRef({ ...inputRef, filename: "../launch.mp4" }),
  /safe basename/,
);
assert.throws(
  () =>
    normalizeArtifactRef({
      ...inputRef,
      integrity: { algorithm: "sha256", digest: "abc" },
    }),
  /64-character/,
);

const artifact = normalizeMediaArtifact({
  ...inputRef,
  created_at_ms: 100,
  updated_at_ms: 200,
  duration_ms: 8_000,
  dimensions: { width: 1_080, height: 1_920 },
  provenance: {
    origin: "provider_output",
    provider: "higgsfield",
    provider_job_id: "provider-job-1",
    created_by_agent_id: "video-agent",
    task_id: "task-1",
    dag_id: "dag-1",
    node_id: "node-1",
    parent_artifact_ids: ["brief-1", "brief-1", "image-1"],
  },
});
assert.deepEqual(artifact.provenance.parent_artifact_ids, [
  "brief-1",
  "image-1",
]);
assert.deepEqual(toArtifactRef(artifact), ref);
assert.throws(
  () => normalizeMediaArtifact({ ...artifact, updated_at_ms: 99 }),
  /earlier/,
);
assert.throws(
  () =>
    normalizeMediaArtifact({
      ...artifact,
      provenance: { origin: "provider_output" },
    }),
  /requires provider/,
);

const queuedJob = normalizeProviderJob({
  job_id: "job-1",
  idempotency_key: "task-1:node-1:generate",
  provider: "higgsfield",
  operation: "generate_video",
  status: "queued",
  context: {
    agent_id: "video-agent",
    task_id: "task-1",
    dag_id: "dag-1",
    node_id: "node-1",
  },
  input_artifacts: [convexRef],
  output_artifacts: [],
  attempts: 0,
  max_attempts: 3,
  quoted_cost: { amount: 0.42, currency: "usd" },
  created_at_ms: 100,
  updated_at_ms: 100,
});
assert.equal(queuedJob.quoted_cost?.currency, "USD");
assert.equal(isTerminalProviderJob(queuedJob.status), false);

const succeededJob = normalizeProviderJob({
  ...queuedJob,
  status: "succeeded",
  provider_job_id: "hf-123",
  output_artifacts: [ref],
  progress: 1,
  attempts: 1,
  actual_cost: { amount: 0.39, currency: "USD" },
  updated_at_ms: 300,
  started_at_ms: 150,
  completed_at_ms: 300,
});
assert.equal(isTerminalProviderJob(succeededJob.status), true);
assert.equal(succeededJob.output_artifacts[0].artifact_id, "video-1");

const retryJob = normalizeProviderJob({
  ...queuedJob,
  status: "retry_wait",
  provider_job_id: "hf-123",
  attempts: 1,
  next_poll_at_ms: 500,
  error: { code: "rate_limited", message: "Retry later", retryable: true },
  updated_at_ms: 300,
});
assert.equal(retryJob.error?.retryable, true);

assert.throws(
  () => normalizeProviderJob({ ...queuedJob, status: "submitted" }),
  /provider_job_id/,
);
assert.throws(
  () =>
    normalizeProviderJob({
      ...queuedJob,
      status: "succeeded",
      started_at_ms: 150,
      completed_at_ms: 200,
    }),
  /output artifact/,
);
assert.throws(
  () =>
    normalizeProviderJob({
      ...queuedJob,
      status: "failed",
      completed_at_ms: 200,
    }),
  /require an error/,
);
assert.throws(
  () =>
    normalizeProviderJob({
      ...queuedJob,
      status: "retry_wait",
      next_poll_at_ms: 400,
      error: { code: "bad_request", message: "No", retryable: false },
    }),
  /retryable/,
);
assert.throws(
  () => normalizeProviderJob({ ...queuedJob, progress: 1.1 }),
  /between 0 and 1/,
);
assert.throws(
  () => normalizeProviderJob({ ...succeededJob, next_poll_at_ms: 400 }),
  /terminal jobs/,
);

assert.doesNotThrow(() => assertProviderJobTransition("queued", "submitted"));
assert.doesNotThrow(() => assertProviderJobTransition("running", "retry_wait"));
assert.doesNotThrow(() => assertProviderJobTransition("running", "input_required"));
assert.doesNotThrow(() =>
  assertProviderJobTransition("input_required", "running"),
);
assert.doesNotThrow(() => assertProviderJobTransition("retry_wait", "running"));
assert.throws(
  () => assertProviderJobTransition("succeeded", "running"),
  /invalid provider job transition/,
);

console.log("media-artifacts tests passed");
