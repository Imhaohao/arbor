"use node";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  TikTokUploadClient,
  TIKTOK_INBOX_HANDOFF_MESSAGE,
  classifyTikTokError,
  createTikTokChunkPlan,
  type TikTokPublishStatus,
  type TikTokVideoMetadata,
} from "../lib/tiktok-upload";

const DEFAULT_MAX_SERVER_UPLOAD_BYTES = 256 * 1024 * 1024;
const DEFAULT_POLL_DELAY_MS = 5_000;
const INPUT_REQUIRED_POLL_DELAY_MS = 60_000;
const MAX_STATUS_POLLS = 60;
const MAX_INPUT_REQUIRED_POLLS = 24 * 60;

function internalKey(): string {
  const key = process.env.ARBOR_INTERNAL_API_KEY?.trim();
  if (!key) throw new Error("ARBOR_INTERNAL_API_KEY is not configured");
  return key;
}

function assertServerKey(provided: string): void {
  const expected = internalKey();
  let diff = provided.length ^ expected.length;
  const length = Math.max(provided.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    diff |=
      (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  if (diff !== 0) throw new Error("unauthorized");
}

function accessToken(): string {
  const token = process.env.TIKTOK_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN is not configured");
  return token;
}

function maxServerUploadBytes(): number {
  const value = Number(process.env.ARBOR_TIKTOK_MAX_UPLOAD_BYTES);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_MAX_SERVER_UPLOAD_BYTES;
  }
  return value;
}

function errorDetail(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  category: ReturnType<typeof classifyTikTokError>["category"];
} {
  const classification = classifyTikTokError(error);
  const row = error as { code?: unknown } | undefined;
  return {
    code:
      typeof row?.code === "string"
        ? row.code
        : classification.category,
    message: error instanceof Error ? error.message : String(error),
    retryable: classification.retryable,
    category: classification.category,
  };
}

function uploadRetryDelayMs(attempts: number): number {
  return Math.min(60_000, DEFAULT_POLL_DELAY_MS * 2 ** Math.max(0, attempts - 1));
}

interface DurableUploadSession {
  encrypted_upload_url: string;
  publish_id: string;
  uploaded_bytes: number;
}

function uploadSessionKey(): Buffer {
  return createHash("sha256")
    .update(`arbor:tiktok-upload-session:${internalKey()}`)
    .digest();
}

function encryptUploadUrl(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", uploadSessionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptUploadUrl(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("invalid TikTok upload session");
  const [iv, authTag, encrypted] = parts.map((part) =>
    Buffer.from(part, "base64url"),
  );
  const decipher = createDecipheriv("aes-256-gcm", uploadSessionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

function uploadSessionMetadata(session: DurableUploadSession) {
  return {
    source: "FILE_UPLOAD",
    publish_id: session.publish_id,
    upload_session: session,
  };
}

function completedUploadMetadata(publishId: string) {
  return {
    source: "FILE_UPLOAD",
    publish_id: publishId,
    upload_complete: true,
    handoff_message: TIKTOK_INBOX_HANDOFF_MESSAGE,
  };
}

function readUploadSession(job: Doc<"provider_jobs">): DurableUploadSession {
  const metadata = job.provider_metadata;
  const session =
    metadata && typeof metadata === "object" && "upload_session" in metadata
      ? (metadata.upload_session as Record<string, unknown>)
      : undefined;
  if (
    !session ||
    typeof session.encrypted_upload_url !== "string" ||
    typeof session.publish_id !== "string" ||
    !Number.isSafeInteger(session.uploaded_bytes) ||
    (session.uploaded_bytes as number) < 0 ||
    session.publish_id !== job.external_job_id
  ) {
    throw new Error("TikTok upload session is unavailable");
  }
  return {
    encrypted_upload_url: session.encrypted_upload_url,
    publish_id: session.publish_id,
    uploaded_bytes: session.uploaded_bytes as number,
  };
}

async function loadUploadMedia(
  ctx: ActionCtx,
  job: Doc<"provider_jobs">,
): Promise<{
  artifact: Doc<"media_artifacts">;
  blob: Blob;
  metadata: TikTokVideoMetadata;
}> {
  if (!job.input_artifact_id) throw new Error("TikTok job has no input artifact");
  const artifact: Doc<"media_artifacts"> | null = await ctx.runQuery(
    internal.mediaArtifacts._get,
    { artifact_id: job.input_artifact_id },
  );
  if (
    !artifact ||
    artifact.status !== "ready" ||
    artifact.media_kind !== "video" ||
    !artifact.storage_id
  ) {
    throw new Error("TikTok input artifact is not a ready stored video");
  }
  if (
    !artifact.byte_size ||
    !artifact.duration_ms ||
    !artifact.width ||
    !artifact.height ||
    !artifact.codec ||
    !artifact.frame_rate
  ) {
    throw new Error(
      "TikTok upload requires byte size, duration, dimensions, codec, and frame rate metadata",
    );
  }
  if (artifact.byte_size > maxServerUploadBytes()) {
    throw new Error(
      `video exceeds Arbor's server upload limit of ${maxServerUploadBytes()} bytes`,
    );
  }
  const blob = await ctx.storage.get(artifact.storage_id);
  if (!blob) throw new Error("stored video bytes are unavailable");
  return {
    artifact,
    blob,
    metadata: {
      mimeType: artifact.mime_type,
      codec: artifact.codec,
      sizeBytes: blob.size,
      durationSeconds: artifact.duration_ms / 1000,
      width: artifact.width,
      height: artifact.height,
      frameRate: artifact.frame_rate,
    },
  };
}

export const enqueue = action({
  args: { server_key: v.string(), job_id: v.string() },
  returns: v.object({ ok: v.literal(true), job_id: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; job_id: string }> => {
    assertServerKey(args.server_key);
    const job: Doc<"provider_jobs"> | null = await ctx.runQuery(
      internal.providerJobs._getByJobId,
      {
      job_id: args.job_id,
      },
    );
    if (!job) throw new Error("provider job not found");
    if (job.provider !== "tiktok" || job.operation !== "upload_inbox") {
      throw new Error("provider job is not a TikTok inbox upload");
    }
    if (job.status === "queued") {
      await ctx.scheduler.runAfter(0, internal.tiktokUploadActions.run, {
        job_id: job.job_id,
      });
    }
    return { ok: true as const, job_id: job.job_id };
  },
});

export const run = internalAction({
  args: { job_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job: Doc<"provider_jobs"> | null = await ctx.runQuery(
      internal.providerJobs._getByJobId,
      { job_id: args.job_id },
    );
    if (!job || job.status !== "queued") return null;
    const claimed = await ctx.runMutation(internal.providerJobs._claimQueued, {
      job_id: job.job_id,
    });
    if (!claimed) return null;

    let initializedPublishId: string | undefined;
    let uploadCompleted = false;
    let uploadSession: DurableUploadSession | undefined;
    try {
      const { blob, metadata } = await loadUploadMedia(ctx, job);
      const client = new TikTokUploadClient({ accessToken: accessToken() });
      const initialized = await client.initializeFileUpload({ metadata });
      initializedPublishId = initialized.publishId;
      uploadSession = {
        encrypted_upload_url: encryptUploadUrl(initialized.uploadUrl),
        publish_id: initialized.publishId,
        uploaded_bytes: 0,
      };
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "running",
        external_job_id: initialized.publishId,
        attempts: job.attempts + 1,
        progress: 0,
        provider_metadata: uploadSessionMetadata(uploadSession),
        clear_error: true,
      });
      await client.uploadFile({
        uploadUrl: initialized.uploadUrl,
        data: blob,
        metadata,
        chunkPlan: initialized.chunkPlan,
        onProgress: async (uploadedBytes) => {
          if (!uploadSession) return;
          uploadSession.uploaded_bytes = uploadedBytes;
          await ctx.runMutation(api.providerJobs.transitionServer, {
            server_key: internalKey(),
            job_id: job.job_id,
            status: "running",
            progress: Math.min(0.85, (uploadedBytes / blob.size) * 0.85),
            provider_metadata: uploadSessionMetadata(uploadSession),
          });
        },
      });
      uploadCompleted = true;
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "running",
        progress: 0.9,
        provider_metadata: completedUploadMetadata(initialized.publishId),
      });
      await ctx.scheduler.runAfter(
        DEFAULT_POLL_DELAY_MS,
        internal.tiktokUploadActions.pollStatus,
        { job_id: job.job_id, poll_count: 0 },
      );
    } catch (error) {
      const detail = errorDetail(error);
      const attempts = Math.min(job.max_attempts, job.attempts + 1);
      if (initializedPublishId && uploadCompleted) {
        const retryDelay = uploadRetryDelayMs(attempts);
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "retry_wait",
          external_job_id: initializedPublishId,
          attempts,
          next_poll_at: Date.now() + retryDelay,
          error_code: `post_transfer_${detail.code}`,
          error_retryable: true,
          error_message:
            "The media transfer completed; Arbor will recover by checking the same TikTok publish ID",
          provider_metadata: completedUploadMetadata(initializedPublishId),
        });
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.tiktokUploadActions.pollStatus,
          { job_id: job.job_id, poll_count: 0 },
        );
        return null;
      }
      if (initializedPublishId && detail.retryable) {
        if (uploadSession && attempts < job.max_attempts) {
          const retryDelay = uploadRetryDelayMs(attempts);
          await ctx.runMutation(api.providerJobs.transitionServer, {
            server_key: internalKey(),
            job_id: job.job_id,
            status: "retry_wait",
            external_job_id: initializedPublishId,
            attempts,
            next_poll_at: Date.now() + retryDelay,
            error_code: "transfer_retry_wait",
            error_retryable: true,
            error_message:
              "TikTok transfer paused after retryable chunk errors; Arbor will resume the same upload session",
            provider_metadata: uploadSessionMetadata(uploadSession),
          });
          await ctx.scheduler.runAfter(
            retryDelay,
            internal.tiktokUploadActions.resumeTransfer,
            { job_id: job.job_id },
          );
          return null;
        }
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "failed",
          external_job_id: initializedPublishId,
          attempts,
          error_code: "transfer_retry_exhausted",
          error_retryable: false,
          error_message:
            "TikTok did not confirm the remaining chunk after Arbor exhausted the upload retry budget",
        });
        return null;
      }
      if (
        !initializedPublishId &&
        detail.category === "rate_limit" &&
        attempts < job.max_attempts
      ) {
        const retryDelay = uploadRetryDelayMs(attempts);
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "retry_wait",
          attempts,
          next_poll_at: Date.now() + retryDelay,
          error_code: detail.code,
          error_retryable: true,
          error_message: detail.message,
        });
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.tiktokUploadActions.resumeUpload,
          { job_id: job.job_id },
        );
        return null;
      }
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "failed",
        external_job_id: initializedPublishId,
        attempts,
        error_code: detail.code,
        error_retryable: detail.retryable,
        error_message: detail.message,
      });
    }
    return null;
  },
});

export const resumeTransfer = internalAction({
  args: { job_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job: Doc<"provider_jobs"> | null = await ctx.runQuery(
      internal.providerJobs._getByJobId,
      { job_id: args.job_id },
    );
    if (!job || job.status !== "retry_wait") return null;
    if (job.attempts >= job.max_attempts) {
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "failed",
        attempts: job.attempts,
        error_code: "transfer_retry_exhausted",
        error_retryable: false,
        error_message: "TikTok transfer exhausted its upload retry budget",
      });
      return null;
    }

    const attempts = job.attempts + 1;
    let session: DurableUploadSession | undefined;
    let uploadCompleted = false;
    try {
      session = readUploadSession(job);
      const uploadUrl = decryptUploadUrl(session.encrypted_upload_url);
      const { blob, metadata } = await loadUploadMedia(ctx, job);
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "running",
        attempts,
        progress: Math.min(0.85, (session.uploaded_bytes / blob.size) * 0.85),
        provider_metadata: uploadSessionMetadata(session),
        clear_error: true,
      });

      const client = new TikTokUploadClient({ accessToken: accessToken() });
      await client.uploadFile({
        uploadUrl,
        data: blob,
        metadata,
        chunkPlan: createTikTokChunkPlan(blob.size),
        startOffset: session.uploaded_bytes,
        onProgress: async (uploadedBytes) => {
          if (!session) return;
          session.uploaded_bytes = uploadedBytes;
          await ctx.runMutation(api.providerJobs.transitionServer, {
            server_key: internalKey(),
            job_id: job.job_id,
            status: "running",
            attempts,
            progress: Math.min(0.85, (uploadedBytes / blob.size) * 0.85),
            provider_metadata: uploadSessionMetadata(session),
          });
        },
      });
      uploadCompleted = true;
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "running",
        attempts,
        progress: 0.9,
        provider_metadata: completedUploadMetadata(session.publish_id),
        clear_error: true,
      });
      await ctx.scheduler.runAfter(
        DEFAULT_POLL_DELAY_MS,
        internal.tiktokUploadActions.pollStatus,
        { job_id: job.job_id, poll_count: 0 },
      );
    } catch (error) {
      const detail = errorDetail(error);
      if (uploadCompleted && session) {
        const retryDelay = uploadRetryDelayMs(attempts);
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "retry_wait",
          attempts,
          next_poll_at: Date.now() + retryDelay,
          error_code: `post_transfer_${detail.code}`,
          error_retryable: true,
          error_message:
            "The media transfer completed; Arbor will recover by checking the same TikTok publish ID",
          provider_metadata: completedUploadMetadata(session.publish_id),
        });
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.tiktokUploadActions.pollStatus,
          { job_id: job.job_id, poll_count: 0 },
        );
        return null;
      }
      if (detail.retryable && session && attempts < job.max_attempts) {
        const retryDelay = uploadRetryDelayMs(attempts);
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "retry_wait",
          attempts,
          next_poll_at: Date.now() + retryDelay,
          error_code: "transfer_retry_wait",
          error_retryable: true,
          error_message:
            "TikTok transfer paused after retryable chunk errors; Arbor will resume the same upload session",
          provider_metadata: uploadSessionMetadata(session),
        });
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.tiktokUploadActions.resumeTransfer,
          { job_id: job.job_id },
        );
        return null;
      }
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "failed",
        attempts,
        error_code:
          detail.retryable ? "transfer_retry_exhausted" : detail.code,
        error_retryable: false,
        error_message: detail.retryable
          ? "TikTok transfer exhausted its upload retry budget"
          : detail.message,
      });
    }
    return null;
  },
});

export const resumeUpload = internalAction({
  args: { job_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const requeued = await ctx.runMutation(
      internal.providerJobs._requeueRetry,
      { job_id: args.job_id },
    );
    if (requeued) {
      await ctx.scheduler.runAfter(0, internal.tiktokUploadActions.run, {
        job_id: args.job_id,
      });
    }
    return null;
  },
});

function progressForStatus(status: TikTokPublishStatus): number {
  if (status.status === "SEND_TO_USER_INBOX" || status.status === "PUBLISH_COMPLETE") {
    return 1;
  }
  return 0.95;
}

export const pollStatus = internalAction({
  args: { job_id: v.string(), poll_count: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job: Doc<"provider_jobs"> | null = await ctx.runQuery(
      internal.providerJobs._getByJobId,
      { job_id: args.job_id },
    );
    if (
      !job ||
      job.status === "succeeded" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return null;
    }
    if (!job.external_job_id) return null;

    if (
      job.status === "input_required" &&
      args.poll_count >= MAX_INPUT_REQUIRED_POLLS
    ) {
      return null;
    }

    if (job.status !== "input_required" && args.poll_count >= MAX_STATUS_POLLS) {
      const resumeAt = Date.now() + 60_000;
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "retry_wait",
        next_poll_at: resumeAt,
        error_code: "status_poll_timeout",
        error_retryable: true,
        error_message: "TikTok is still processing; status polling can resume",
      });
      await ctx.scheduler.runAfter(
        60_000,
        internal.tiktokUploadActions.pollStatus,
        { job_id: job.job_id, poll_count: 0 },
      );
      return null;
    }

    try {
      if (job.status === "retry_wait") {
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "running",
          clear_error: true,
        });
      }
      const client = new TikTokUploadClient({ accessToken: accessToken() });
      const status = await client.fetchPublishStatus(job.external_job_id);
      const providerMetadata = {
        ...(job.provider_metadata && typeof job.provider_metadata === "object"
          ? (job.provider_metadata as Record<string, unknown>)
          : {}),
        tiktok_status: status.status,
        fail_reason: status.fail_reason,
        uploaded_bytes: status.uploaded_bytes,
        downloaded_bytes: status.downloaded_bytes,
        public_post_ids: status.publicaly_available_post_id,
      };
      if (status.status === "SEND_TO_USER_INBOX") {
        const nextPollAt = Date.now() + INPUT_REQUIRED_POLL_DELAY_MS;
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "input_required",
          progress: 1,
          next_poll_at: nextPollAt,
          provider_metadata: providerMetadata,
          clear_error: true,
        });
        await ctx.scheduler.runAfter(
          INPUT_REQUIRED_POLL_DELAY_MS,
          internal.tiktokUploadActions.pollStatus,
          {
            job_id: job.job_id,
            poll_count: job.status === "input_required" ? args.poll_count + 1 : 0,
          },
        );
        return null;
      }
      if (status.status === "PUBLISH_COMPLETE") {
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "succeeded",
          progress: 1,
          output_artifact_id: job.input_artifact_id as
            | Id<"media_artifacts">
            | undefined,
          provider_metadata: providerMetadata,
          clear_error: true,
        });
        return null;
      }
      if (status.status === "FAILED") {
        const detail = errorDetail({ failReason: status.fail_reason });
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "failed",
          progress: progressForStatus(status),
          error_code: status.fail_reason ?? detail.code,
          error_retryable: detail.retryable,
          error_message: status.fail_reason ?? "TikTok upload failed",
          provider_metadata: providerMetadata,
        });
        return null;
      }
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "running",
        progress: progressForStatus(status),
        provider_metadata: providerMetadata,
        clear_error: true,
      });
      await ctx.scheduler.runAfter(
        DEFAULT_POLL_DELAY_MS,
        internal.tiktokUploadActions.pollStatus,
        { job_id: job.job_id, poll_count: args.poll_count + 1 },
      );
    } catch (error) {
      const detail = errorDetail(error);
      if (!detail.retryable) {
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "failed",
          error_code: detail.code,
          error_retryable: false,
          error_message: detail.message,
        });
        return null;
      }
      const retryDelay =
        job.status === "input_required"
          ? INPUT_REQUIRED_POLL_DELAY_MS
          : DEFAULT_POLL_DELAY_MS;
      const nextPollAt = Date.now() + retryDelay;
      if (job.status === "input_required") {
        await ctx.runMutation(api.providerJobs.transitionServer, {
          server_key: internalKey(),
          job_id: job.job_id,
          status: "input_required",
          next_poll_at: nextPollAt,
          error_code: detail.code,
          error_retryable: true,
          error_message: detail.message,
        });
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.tiktokUploadActions.pollStatus,
          { job_id: job.job_id, poll_count: args.poll_count + 1 },
        );
        return null;
      }
      await ctx.runMutation(api.providerJobs.transitionServer, {
        server_key: internalKey(),
        job_id: job.job_id,
        status: "retry_wait",
        next_poll_at: nextPollAt,
        error_code: detail.code,
        error_retryable: true,
        error_message: detail.message,
      });
      await ctx.scheduler.runAfter(
        retryDelay,
        internal.tiktokUploadActions.pollStatus,
        { job_id: job.job_id, poll_count: args.poll_count + 1 },
      );
    }
    return null;
  },
});
