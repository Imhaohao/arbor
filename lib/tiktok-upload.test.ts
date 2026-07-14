import assert from "node:assert/strict";
import {
  TIKTOK_INBOX_HANDOFF_MESSAGE,
  TIKTOK_MAX_CHUNK_BYTES,
  TIKTOK_MIN_CHUNK_BYTES,
  TikTokUploadClient,
  TikTokUploadError,
  TikTokVideoValidationError,
  classifyTikTokError,
  createTikTokChunkPlan,
  isRetryableTikTokError,
  validateTikTokVideoMetadata,
  type TikTokFetch,
  type TikTokVideoMetadata,
} from "./tiktok-upload";

const metadata: TikTokVideoMetadata = {
  mimeType: "video/mp4",
  codec: "h264",
  sizeBytes: 12 * 1024 * 1024,
  durationSeconds: 15,
  width: 1080,
  height: 1920,
  frameRate: 30,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  const normalized = validateTikTokVideoMetadata(metadata);
  assert.equal(normalized.mimeType, "video/mp4");
  assert.equal(normalized.codec, "H.264");
  assert.equal(
    validateTikTokVideoMetadata({ ...metadata, mimeType: "video/quicktime", codec: "hevc" })
      .codec,
    "H.265",
  );
  assert.equal(
    validateTikTokVideoMetadata({ ...metadata, mimeType: "video/webm", codec: "vp9" }).codec,
    "VP9",
  );
  assert.throws(
    () => validateTikTokVideoMetadata({ ...metadata, mimeType: "video/avi" }),
    TikTokVideoValidationError,
  );
  assert.throws(
    () => validateTikTokVideoMetadata({ ...metadata, frameRate: 61 }),
    /between 23 and 60/,
  );
  assert.throws(
    () => validateTikTokVideoMetadata({ ...metadata, width: 359 }),
    /between 360 and 4096/,
  );
  assert.throws(
    () => validateTikTokVideoMetadata({ ...metadata, durationSeconds: 601 }),
    /10-minute/,
  );

  const wholePlan = createTikTokChunkPlan(metadata.sizeBytes);
  assert.equal(wholePlan.totalChunkCount, 1);
  assert.equal(wholePlan.chunkSize, metadata.sizeBytes);

  const largeSize = 50_000_123;
  const multiPlan = createTikTokChunkPlan(largeSize, 10_000_000);
  assert.equal(multiPlan.totalChunkCount, 5);
  assert.deepEqual(multiPlan.chunks.at(-1), {
    index: 4,
    start: 40_000_000,
    end: 50_000_122,
    size: 10_000_123,
  });

  const justOverMaxPlan = createTikTokChunkPlan(TIKTOK_MAX_CHUNK_BYTES + 1);
  assert.equal(justOverMaxPlan.totalChunkCount, 2);
  assert.ok(justOverMaxPlan.chunkSize >= TIKTOK_MIN_CHUNK_BYTES);

  const nineMiBPlan = createTikTokChunkPlan(9 * 1024 * 1024, 5 * 1024 * 1024);
  assert.equal(nineMiBPlan.totalChunkCount, 1);
  assert.equal(nineMiBPlan.chunkSize, 9 * 1024 * 1024);

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: TikTokFetch = async (input, init) => {
    const url = input.toString();
    requests.push({ url, init });
    if (url.endsWith("/v2/post/publish/inbox/video/init/")) {
      const body = JSON.parse(String(init?.body)) as {
        source_info: { source: string };
      };
      if (body.source_info.source === "FILE_UPLOAD") {
        return jsonResponse({
          data: {
            publish_id: "v_inbox_file~123",
            upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=123&token=secret",
          },
          error: { code: "ok", message: "", log_id: "log-file" },
        });
      }
      return jsonResponse({
        data: { publish_id: "v_inbox_url~123" },
        error: { code: "ok", message: "", log_id: "log-url" },
      });
    }
    if (url.endsWith("/v2/post/publish/status/fetch/")) {
      return jsonResponse({
        data: {
          status: "SEND_TO_USER_INBOX",
          uploaded_bytes: metadata.sizeBytes,
          publicaly_available_post_id: [],
        },
        error: { code: "ok", message: "", log_id: "log-status" },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const client = new TikTokUploadClient({ accessToken: "user-token", fetch: fetchMock });
  const fileInit = await client.initializeFileUpload({ metadata });
  assert.equal(fileInit.source, "FILE_UPLOAD");
  assert.equal(fileInit.publishId, "v_inbox_file~123");
  assert.equal(fileInit.handoffMessage, TIKTOK_INBOX_HANDOFF_MESSAGE);
  const fileRequest = requests.at(-1);
  assert.ok(fileRequest);
  assert.equal(new Headers(fileRequest.init?.headers).get("authorization"), "Bearer user-token");
  assert.equal(
    new Headers(fileRequest.init?.headers).get("content-type"),
    "application/json; charset=UTF-8",
  );
  assert.deepEqual(JSON.parse(String(fileRequest.init?.body)), {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: metadata.sizeBytes,
      chunk_size: metadata.sizeBytes,
      total_chunk_count: 1,
    },
  });

  const pullInit = await client.initializePullFromUrl({
    videoUrl: "https://media.arbor.example/generated/video.mp4",
    metadata,
  });
  assert.equal(pullInit.publishId, "v_inbox_url~123");
  assert.deepEqual(JSON.parse(String(requests.at(-1)?.init?.body)), {
    source_info: {
      source: "PULL_FROM_URL",
      video_url: "https://media.arbor.example/generated/video.mp4",
    },
  });
  await assert.rejects(
    () => client.initializePullFromUrl({ videoUrl: "http://media.example/video.mp4" }),
    /must use HTTPS/,
  );

  const status = await client.fetchPublishStatus(fileInit.publishId);
  assert.equal(status.status, "SEND_TO_USER_INBOX");
  assert.equal(status.uploaded_bytes, metadata.sizeBytes);
  assert.deepEqual(JSON.parse(String(requests.at(-1)?.init?.body)), {
    publish_id: fileInit.publishId,
  });

  const uploadMetadata: TikTokVideoMetadata = {
    ...metadata,
    sizeBytes: 21 * 1024 * 1024,
  };
  const uploadPlan = createTikTokChunkPlan(uploadMetadata.sizeBytes, 10 * 1024 * 1024);
  const chunkRequests: Array<{ url: string; headers: Headers; size: number }> = [];
  const chunkFetch: TikTokFetch = async (input, init) => {
    const body = init?.body;
    assert.ok(body instanceof Blob);
    chunkRequests.push({
      url: input.toString(),
      headers: new Headers(init?.headers),
      size: body.size,
    });
    const isFinal = chunkRequests.length === uploadPlan.totalChunkCount;
    return new Response(null, { status: isFinal ? 201 : 206 });
  };
  const chunkClient = new TikTokUploadClient({ accessToken: "unused", fetch: chunkFetch });
  const uploaded = await chunkClient.uploadFile({
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=abc&upload_token=secret",
    data: new Blob([new Uint8Array(uploadMetadata.sizeBytes)]),
    metadata: uploadMetadata,
    chunkPlan: uploadPlan,
  });
  assert.equal(uploaded.uploadedBytes, uploadMetadata.sizeBytes);
  assert.equal(uploaded.chunkCount, 2);
  assert.equal(uploaded.handoffMessage, TIKTOK_INBOX_HANDOFF_MESSAGE);
  assert.equal(chunkRequests.length, 2);
  assert.equal(
    chunkRequests[0].url,
    "https://open-upload.tiktokapis.com/video/?upload_id=abc&upload_token=secret",
  );
  assert.equal(chunkRequests[0].headers.get("content-type"), "video/mp4");
  assert.equal(chunkRequests[0].headers.get("content-length"), String(10 * 1024 * 1024));
  assert.equal(
    chunkRequests[0].headers.get("content-range"),
    `bytes 0-${10 * 1024 * 1024 - 1}/${uploadMetadata.sizeBytes}`,
  );
  assert.equal(chunkRequests[0].size, 10 * 1024 * 1024);
  assert.equal(chunkRequests[1].size, 11 * 1024 * 1024);
  assert.equal(
    chunkRequests[1].headers.get("content-range"),
    `bytes ${10 * 1024 * 1024}-${uploadMetadata.sizeBytes - 1}/${uploadMetadata.sizeBytes}`,
  );

  let retriedChunkRequests = 0;
  const retryingClient = new TikTokUploadClient({
    accessToken: "unused",
    chunkRetryAttempts: 2,
    chunkRetryBaseDelayMs: 0,
    fetch: async () => {
      retriedChunkRequests += 1;
      return new Response(null, {
        status: retriedChunkRequests === 1 ? 503 : 201,
      });
    },
  });
  await retryingClient.uploadFile({
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=retry",
    data: new Blob([new Uint8Array(metadata.sizeBytes)]),
    metadata,
    chunkPlan: wholePlan,
  });
  assert.equal(retriedChunkRequests, 2);

  const resumedRanges: string[] = [];
  const halfChunk = 5 * 1024 * 1024;
  const reconcilingClient = new TikTokUploadClient({
    accessToken: "unused",
    chunkRetryAttempts: 2,
    chunkRetryBaseDelayMs: 0,
    fetch: async (_input, init) => {
      const range = new Headers(init?.headers).get("content-range") ?? "";
      resumedRanges.push(range);
      if (resumedRanges.length === 1) {
        return new Response(null, {
          status: 503,
          headers: {
            "Content-Range": `bytes 0-${halfChunk - 1}/${uploadMetadata.sizeBytes}`,
          },
        });
      }
      return new Response(null, {
        status: resumedRanges.length === 2 ? 206 : 201,
      });
    },
  });
  await reconcilingClient.uploadFile({
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=reconcile",
    data: new Blob([new Uint8Array(uploadMetadata.sizeBytes)]),
    metadata: uploadMetadata,
    chunkPlan: uploadPlan,
  });
  assert.deepEqual(resumedRanges, [
    `bytes 0-${10 * 1024 * 1024 - 1}/${uploadMetadata.sizeBytes}`,
    `bytes ${halfChunk}-${10 * 1024 * 1024 - 1}/${uploadMetadata.sizeBytes}`,
    `bytes ${10 * 1024 * 1024}-${uploadMetadata.sizeBytes - 1}/${uploadMetadata.sizeBytes}`,
  ]);

  const durableResumeRanges: string[] = [];
  const durableProgress: number[] = [];
  const durableResumeClient = new TikTokUploadClient({
    accessToken: "unused",
    fetch: async (_input, init) => {
      durableResumeRanges.push(
        new Headers(init?.headers).get("content-range") ?? "",
      );
      return new Response(null, {
        status: durableResumeRanges.length === 1 ? 206 : 201,
      });
    },
  });
  await durableResumeClient.uploadFile({
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=durable",
    data: new Blob([new Uint8Array(uploadMetadata.sizeBytes)]),
    metadata: uploadMetadata,
    chunkPlan: uploadPlan,
    startOffset: halfChunk,
    onProgress: (uploadedBytes) => {
      durableProgress.push(uploadedBytes);
    },
  });
  assert.deepEqual(durableResumeRanges, [
    `bytes ${halfChunk}-${10 * 1024 * 1024 - 1}/${uploadMetadata.sizeBytes}`,
    `bytes ${10 * 1024 * 1024}-${uploadMetadata.sizeBytes - 1}/${uploadMetadata.sizeBytes}`,
  ]);
  assert.deepEqual(durableProgress, [
    10 * 1024 * 1024,
    uploadMetadata.sizeBytes,
  ]);

  const apiFailureFetch: TikTokFetch = async () =>
    jsonResponse(
      {
        data: {},
        error: { code: "rate_limit_exceeded", message: "Slow down", log_id: "log-rate" },
      },
      429,
    );
  const failingClient = new TikTokUploadClient({
    accessToken: "user-token",
    fetch: apiFailureFetch,
  });
  await assert.rejects(
    () => failingClient.fetchPublishStatus("publish-1"),
    (error: unknown) => {
      assert.ok(error instanceof TikTokUploadError);
      assert.equal(error.code, "rate_limit_exceeded");
      assert.equal(error.logId, "log-rate");
      assert.equal(error.retryable, true);
      assert.equal(isRetryableTikTokError(error), true);
      return true;
    },
  );

  assert.deepEqual(classifyTikTokError({ httpStatus: 503 }), {
    retryable: true,
    category: "server",
  });
  assert.deepEqual(classifyTikTokError({ failReason: "video_pull_failed" }), {
    retryable: true,
    category: "media_pull",
  });
  assert.deepEqual(classifyTikTokError({ code: "access_token_invalid", httpStatus: 401 }), {
    retryable: false,
    category: "permanent",
  });
  assert.equal(isRetryableTikTokError(new TypeError("fetch failed")), true);

  console.log("tiktok-upload tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
