const DEFAULT_API_BASE_URL = "https://open.tiktokapis.com";

export const TIKTOK_UPLOAD_INIT_PATH = "/v2/post/publish/inbox/video/init/";
export const TIKTOK_PUBLISH_STATUS_PATH = "/v2/post/publish/status/fetch/";

export const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const TIKTOK_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const TIKTOK_MAX_FINAL_CHUNK_BYTES = 128 * 1024 * 1024;
export const TIKTOK_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
export const TIKTOK_MAX_VIDEO_DURATION_SECONDS = 10 * 60;

export const TIKTOK_INBOX_HANDOFF_MESSAGE =
  "TikTok will send an inbox notification after it processes the video. Open that notification in TikTok to review or edit the draft and finish posting it.";

export type TikTokVideoMimeType = "video/mp4" | "video/quicktime" | "video/webm";
export type TikTokVideoCodec = "H.264" | "H.265" | "VP8" | "VP9";

export interface TikTokVideoMetadata {
  mimeType: TikTokVideoMimeType | string;
  codec: TikTokVideoCodec | string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;
}

export interface ValidatedTikTokVideoMetadata extends TikTokVideoMetadata {
  mimeType: TikTokVideoMimeType;
  codec: TikTokVideoCodec;
}

export interface TikTokChunk {
  index: number;
  start: number;
  end: number;
  size: number;
}

export interface TikTokChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  chunks: TikTokChunk[];
}

export type TikTokPublishStatusName =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export interface TikTokPublishStatus {
  status: TikTokPublishStatusName;
  fail_reason?: string;
  publicaly_available_post_id?: Array<string | number>;
  uploaded_bytes?: number;
  downloaded_bytes?: number;
}

export interface TikTokApiErrorBody {
  code: string;
  message?: string;
  log_id?: string;
  logid?: string;
}

interface TikTokApiEnvelope<T> {
  data?: T;
  error?: TikTokApiErrorBody;
}

export interface TikTokFileUploadInitialization {
  source: "FILE_UPLOAD";
  publishId: string;
  uploadUrl: string;
  chunkPlan: TikTokChunkPlan;
  handoffMessage: string;
}

export interface TikTokPullFromUrlInitialization {
  source: "PULL_FROM_URL";
  publishId: string;
  handoffMessage: string;
}

export interface TikTokFileUploadResult {
  uploadedBytes: number;
  chunkCount: number;
  handoffMessage: string;
}

export interface TikTokErrorClassificationInput {
  httpStatus?: number;
  code?: string;
  failReason?: string;
  networkError?: boolean;
}

export interface TikTokErrorClassification {
  retryable: boolean;
  category: "network" | "rate_limit" | "server" | "media_pull" | "permanent";
}

export class TikTokUploadError extends Error {
  readonly httpStatus?: number;
  readonly code?: string;
  readonly logId?: string;
  readonly retryable: boolean;
  readonly category: TikTokErrorClassification["category"];

  constructor(
    message: string,
    options: TikTokErrorClassificationInput & { logId?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "TikTokUploadError";
    this.httpStatus = options.httpStatus;
    this.code = options.code;
    this.logId = options.logId;
    const classification = classifyTikTokError(options);
    this.retryable = classification.retryable;
    this.category = classification.category;
  }
}

export class TikTokVideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TikTokVideoValidationError";
  }
}

export type TikTokFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface TikTokUploadClientOptions {
  accessToken: string;
  fetch?: TikTokFetch;
  apiBaseUrl?: string;
  chunkRetryAttempts?: number;
  chunkRetryBaseDelayMs?: number;
}

const MIME_TYPES = new Set<TikTokVideoMimeType>([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const CODEC_ALIASES: Record<string, TikTokVideoCodec> = {
  h264: "H.264",
  "h.264": "H.264",
  avc: "H.264",
  avc1: "H.264",
  h265: "H.265",
  "h.265": "H.265",
  hevc: "H.265",
  hvc1: "H.265",
  vp8: "VP8",
  vp9: "VP9",
};

const RETRYABLE_CODES = new Set(["rate_limit_exceeded", "internal_error"]);
const RETRYABLE_FAIL_REASONS = new Set(["internal", "video_pull_failed"]);

function positiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TikTokVideoValidationError(`${field} must be a positive number`);
  }
}

function positiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TikTokVideoValidationError(`${field} must be a positive safe integer`);
  }
}

export function validateTikTokVideoMetadata(
  metadata: TikTokVideoMetadata,
): ValidatedTikTokVideoMetadata {
  const mimeType = metadata.mimeType.trim().toLowerCase() as TikTokVideoMimeType;
  if (!MIME_TYPES.has(mimeType)) {
    throw new TikTokVideoValidationError(
      "mimeType must be video/mp4, video/quicktime, or video/webm",
    );
  }

  const codec = CODEC_ALIASES[metadata.codec.trim().toLowerCase()];
  if (!codec) {
    throw new TikTokVideoValidationError("codec must be H.264, H.265, VP8, or VP9");
  }

  positiveSafeInteger(metadata.sizeBytes, "sizeBytes");
  if (metadata.sizeBytes > TIKTOK_MAX_VIDEO_BYTES) {
    throw new TikTokVideoValidationError("sizeBytes exceeds TikTok's 4 GB limit");
  }

  positiveFinite(metadata.durationSeconds, "durationSeconds");
  if (metadata.durationSeconds > TIKTOK_MAX_VIDEO_DURATION_SECONDS) {
    throw new TikTokVideoValidationError("durationSeconds exceeds TikTok's 10-minute limit");
  }

  positiveSafeInteger(metadata.width, "width");
  positiveSafeInteger(metadata.height, "height");
  if (metadata.width < 360 || metadata.width > 4096) {
    throw new TikTokVideoValidationError("width must be between 360 and 4096 pixels");
  }
  if (metadata.height < 360 || metadata.height > 4096) {
    throw new TikTokVideoValidationError("height must be between 360 and 4096 pixels");
  }

  positiveFinite(metadata.frameRate, "frameRate");
  if (metadata.frameRate < 23 || metadata.frameRate > 60) {
    throw new TikTokVideoValidationError("frameRate must be between 23 and 60 FPS");
  }

  return { ...metadata, mimeType, codec };
}

export function createTikTokChunkPlan(
  videoSize: number,
  preferredChunkSize?: number,
): TikTokChunkPlan {
  positiveSafeInteger(videoSize, "videoSize");
  if (videoSize > TIKTOK_MAX_VIDEO_BYTES) {
    throw new TikTokVideoValidationError("videoSize exceeds TikTok's 4 GB limit");
  }

  let chunkSize: number;
  let totalChunkCount: number;
  if (
    videoSize < TIKTOK_MIN_CHUNK_BYTES ||
    (videoSize <= TIKTOK_MAX_CHUNK_BYTES && preferredChunkSize === undefined)
  ) {
    chunkSize = videoSize;
    totalChunkCount = 1;
  } else {
    const requestedChunkSize = preferredChunkSize ?? TIKTOK_MAX_CHUNK_BYTES;
    positiveSafeInteger(requestedChunkSize, "preferredChunkSize");
    if (
      requestedChunkSize < TIKTOK_MIN_CHUNK_BYTES ||
      requestedChunkSize > TIKTOK_MAX_CHUNK_BYTES
    ) {
      throw new TikTokVideoValidationError(
        "preferredChunkSize must be between 5 MB and 64 MB for multi-chunk uploads",
      );
    }

    chunkSize = requestedChunkSize;
    if (
      requestedChunkSize >= videoSize &&
      videoSize <= TIKTOK_MAX_CHUNK_BYTES
    ) {
      chunkSize = videoSize;
      totalChunkCount = 1;
    } else if (Math.floor(videoSize / chunkSize) < 2) {
      // A custom chunk size can leave a video too small for two legal
      // non-final chunks (for example 9 MiB with a 5 MiB preference). Send it
      // as one valid chunk instead of inventing a sub-5-MiB chunk size.
      const halfSize = Math.floor(videoSize / 2);
      if (halfSize < TIKTOK_MIN_CHUNK_BYTES) {
        chunkSize = videoSize;
        totalChunkCount = 1;
      } else {
        chunkSize = halfSize;
        totalChunkCount = Math.floor(videoSize / chunkSize);
      }
    } else {
      totalChunkCount = Math.floor(videoSize / chunkSize);
    }
  }

  if (totalChunkCount < 1 || totalChunkCount > 1000) {
    throw new TikTokVideoValidationError("TikTok requires between 1 and 1000 chunks");
  }

  const chunks: TikTokChunk[] = [];
  for (let index = 0; index < totalChunkCount; index += 1) {
    const start = index * chunkSize;
    const end = index === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
    const size = end - start + 1;
    if (index < totalChunkCount - 1 && size > TIKTOK_MAX_CHUNK_BYTES) {
      throw new TikTokVideoValidationError("A non-final chunk exceeds TikTok's 64 MB limit");
    }
    if (index === totalChunkCount - 1 && size > TIKTOK_MAX_FINAL_CHUNK_BYTES) {
      throw new TikTokVideoValidationError("The final chunk exceeds TikTok's 128 MB limit");
    }
    chunks.push({ index, start, end, size });
  }

  return { videoSize, chunkSize, totalChunkCount, chunks };
}

export function classifyTikTokError(
  input: TikTokErrorClassificationInput | unknown,
): TikTokErrorClassification {
  if (input instanceof TikTokUploadError) {
    return { retryable: input.retryable, category: input.category };
  }
  if (input instanceof TypeError) {
    return { retryable: true, category: "network" };
  }

  const value =
    input && typeof input === "object"
      ? (input as TikTokErrorClassificationInput)
      : ({} as TikTokErrorClassificationInput);
  if (value.networkError) return { retryable: true, category: "network" };
  if (value.httpStatus === 429 || value.code === "rate_limit_exceeded") {
    return { retryable: true, category: "rate_limit" };
  }
  if (
    (value.httpStatus !== undefined && value.httpStatus >= 500) ||
    (value.code !== undefined && RETRYABLE_CODES.has(value.code)) ||
    value.failReason === "internal"
  ) {
    return { retryable: true, category: "server" };
  }
  if (value.failReason !== undefined && RETRYABLE_FAIL_REASONS.has(value.failReason)) {
    return { retryable: true, category: "media_pull" };
  }
  return { retryable: false, category: "permanent" };
}

export function isRetryableTikTokError(error: unknown): boolean {
  return classifyTikTokError(error).retryable;
}

export function getTikTokInboxHandoffMessage(): string {
  return TIKTOK_INBOX_HANDOFF_MESSAGE;
}

function assertHttpsMediaUrl(videoUrl: string): string {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    throw new TikTokVideoValidationError("videoUrl must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") {
    throw new TikTokVideoValidationError("videoUrl must use HTTPS");
  }
  if (url.username || url.password) {
    throw new TikTokVideoValidationError("videoUrl must not contain embedded credentials");
  }
  return url.toString();
}

function assertChunkPlan(plan: TikTokChunkPlan, videoSize: number): void {
  const expected = createTikTokChunkPlan(videoSize, plan.chunkSize);
  if (
    plan.videoSize !== expected.videoSize ||
    plan.chunkSize !== expected.chunkSize ||
    plan.totalChunkCount !== expected.totalChunkCount ||
    plan.chunks.length !== expected.chunks.length ||
    plan.chunks.some((chunk, index) => {
      const expectedChunk = expected.chunks[index];
      return (
        chunk.index !== expectedChunk.index ||
        chunk.start !== expectedChunk.start ||
        chunk.end !== expectedChunk.end ||
        chunk.size !== expectedChunk.size
      );
    })
  ) {
    throw new TikTokVideoValidationError("chunkPlan does not match the video size");
  }
}

function uploadedByteCountFromContentRange(
  value: string | null,
  totalBytes: number,
): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^bytes\s+0-(\d+)\/(\d+)$/i);
  if (!match) return undefined;
  const lastUploadedByte = Number(match[1]);
  const reportedTotal = Number(match[2]);
  if (
    !Number.isSafeInteger(lastUploadedByte) ||
    !Number.isSafeInteger(reportedTotal) ||
    reportedTotal !== totalBytes ||
    lastUploadedByte < 0 ||
    lastUploadedByte >= totalBytes
  ) {
    return undefined;
  }
  return lastUploadedByte + 1;
}

async function toBlob(
  data: Blob | ArrayBuffer | Uint8Array,
  mimeType: TikTokVideoMimeType,
): Promise<Blob> {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: mimeType });
  const copy = Uint8Array.from(data);
  return new Blob([copy], { type: mimeType });
}

export class TikTokUploadClient {
  private readonly accessToken: string;
  private readonly fetchImpl: TikTokFetch;
  private readonly apiBaseUrl: string;
  private readonly chunkRetryAttempts: number;
  private readonly chunkRetryBaseDelayMs: number;

  constructor(options: TikTokUploadClientOptions) {
    if (!options.accessToken.trim()) throw new Error("accessToken is required");
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetch ?? fetch;
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    this.chunkRetryAttempts = options.chunkRetryAttempts ?? 4;
    this.chunkRetryBaseDelayMs = options.chunkRetryBaseDelayMs ?? 500;
    if (
      !Number.isSafeInteger(this.chunkRetryAttempts) ||
      this.chunkRetryAttempts < 1 ||
      this.chunkRetryAttempts > 10
    ) {
      throw new Error("chunkRetryAttempts must be an integer between 1 and 10");
    }
    if (
      !Number.isSafeInteger(this.chunkRetryBaseDelayMs) ||
      this.chunkRetryBaseDelayMs < 0 ||
      this.chunkRetryBaseDelayMs > 30_000
    ) {
      throw new Error("chunkRetryBaseDelayMs must be an integer between 0 and 30000");
    }
  }

  async initializeFileUpload(options: {
    metadata: TikTokVideoMetadata;
    preferredChunkSize?: number;
  }): Promise<TikTokFileUploadInitialization> {
    const metadata = validateTikTokVideoMetadata(options.metadata);
    const chunkPlan = createTikTokChunkPlan(metadata.sizeBytes, options.preferredChunkSize);
    const data = await this.requestJson<{ publish_id?: string; upload_url?: string }>(
      TIKTOK_UPLOAD_INIT_PATH,
      {
        source_info: {
          source: "FILE_UPLOAD",
          video_size: metadata.sizeBytes,
          chunk_size: chunkPlan.chunkSize,
          total_chunk_count: chunkPlan.totalChunkCount,
        },
      },
    );
    if (!data.publish_id || !data.upload_url) {
      throw new TikTokUploadError("TikTok returned an invalid FILE_UPLOAD initialization response");
    }
    return {
      source: "FILE_UPLOAD",
      publishId: data.publish_id,
      uploadUrl: data.upload_url,
      chunkPlan,
      handoffMessage: TIKTOK_INBOX_HANDOFF_MESSAGE,
    };
  }

  async initializePullFromUrl(options: {
    videoUrl: string;
    metadata?: TikTokVideoMetadata;
  }): Promise<TikTokPullFromUrlInitialization> {
    if (options.metadata) validateTikTokVideoMetadata(options.metadata);
    const videoUrl = assertHttpsMediaUrl(options.videoUrl);
    const data = await this.requestJson<{ publish_id?: string }>(TIKTOK_UPLOAD_INIT_PATH, {
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    });
    if (!data.publish_id) {
      throw new TikTokUploadError("TikTok returned an invalid PULL_FROM_URL initialization response");
    }
    return {
      source: "PULL_FROM_URL",
      publishId: data.publish_id,
      handoffMessage: TIKTOK_INBOX_HANDOFF_MESSAGE,
    };
  }

  async uploadFile(options: {
    uploadUrl: string;
    data: Blob | ArrayBuffer | Uint8Array;
    metadata: TikTokVideoMetadata;
    chunkPlan: TikTokChunkPlan;
    startOffset?: number;
    onProgress?: (uploadedBytes: number) => Promise<void> | void;
  }): Promise<TikTokFileUploadResult> {
    const metadata = validateTikTokVideoMetadata(options.metadata);
    assertChunkPlan(options.chunkPlan, metadata.sizeBytes);
    const media = await toBlob(options.data, metadata.mimeType);
    if (media.size !== metadata.sizeBytes) {
      throw new TikTokVideoValidationError(
        `Media byte length ${media.size} does not match metadata sizeBytes ${metadata.sizeBytes}`,
      );
    }
    const startOffset = options.startOffset ?? 0;
    if (
      !Number.isSafeInteger(startOffset) ||
      startOffset < 0 ||
      startOffset > metadata.sizeBytes
    ) {
      throw new TikTokVideoValidationError(
        "startOffset must be within the media byte range",
      );
    }

    const reportProgress = async (uploadedBytes: number): Promise<void> => {
      if (!options.onProgress) return;
      try {
        await options.onProgress(uploadedBytes);
      } catch (cause) {
        throw new TikTokUploadError(
          "TikTok upload progress checkpoint failed",
          { networkError: true, cause },
        );
      }
    };

    for (const chunk of options.chunkPlan.chunks) {
      if (startOffset > chunk.end) continue;
      const isFinal = chunk.index === options.chunkPlan.totalChunkCount - 1;
      const expectedStatus = isFinal ? 201 : 206;
      let nextByte = Math.max(chunk.start, startOffset);
      let attempt = 1;
      while (nextByte <= chunk.end) {
        const body = media.slice(nextByte, chunk.end + 1, metadata.mimeType);
        const requestStart = nextByte;
        let response: Response;
        try {
          response = await this.fetchImpl(options.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": metadata.mimeType,
              "Content-Length": String(chunk.end - requestStart + 1),
              "Content-Range": `bytes ${requestStart}-${chunk.end}/${metadata.sizeBytes}`,
            },
            body,
          });
        } catch (cause) {
          if (attempt < this.chunkRetryAttempts) {
            await this.waitBeforeChunkRetry(attempt);
            attempt += 1;
            continue;
          }
          throw new TikTokUploadError(
            `TikTok media upload failed at the network boundary after ${attempt} attempts`,
            { networkError: true, cause },
          );
        }

        if (response.status === expectedStatus) {
          nextByte = chunk.end + 1;
          await reportProgress(nextByte);
          break;
        }
        const reportedOffset = uploadedByteCountFromContentRange(
          response.headers.get("content-range"),
          metadata.sizeBytes,
        );
        if (
          reportedOffset !== undefined &&
          reportedOffset >= chunk.start &&
          reportedOffset <= chunk.end + 1 &&
          reportedOffset !== requestStart
        ) {
          await response.body?.cancel().catch(() => {});
          nextByte = reportedOffset;
          await reportProgress(nextByte);
          attempt = 1;
          continue;
        }
        const error = new TikTokUploadError(
          `TikTok rejected chunk ${chunk.index + 1} with HTTP ${response.status}`,
          { httpStatus: response.status },
        );
        if (error.retryable && attempt < this.chunkRetryAttempts) {
          await response.body?.cancel().catch(() => {});
          await this.waitBeforeChunkRetry(attempt);
          attempt += 1;
          continue;
        }
        throw error;
      }
    }

    return {
      uploadedBytes: metadata.sizeBytes,
      chunkCount: options.chunkPlan.totalChunkCount,
      handoffMessage: TIKTOK_INBOX_HANDOFF_MESSAGE,
    };
  }

  private async waitBeforeChunkRetry(attempt: number): Promise<void> {
    const delay = Math.min(
      10_000,
      this.chunkRetryBaseDelayMs * 2 ** Math.max(0, attempt - 1),
    );
    if (delay <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }

  async fetchPublishStatus(publishId: string): Promise<TikTokPublishStatus> {
    if (!publishId.trim()) throw new Error("publishId is required");
    const data = await this.requestJson<Partial<TikTokPublishStatus>>(
      TIKTOK_PUBLISH_STATUS_PATH,
      { publish_id: publishId },
    );
    const statuses: TikTokPublishStatusName[] = [
      "PROCESSING_UPLOAD",
      "PROCESSING_DOWNLOAD",
      "SEND_TO_USER_INBOX",
      "PUBLISH_COMPLETE",
      "FAILED",
    ];
    if (!data.status || !statuses.includes(data.status)) {
      throw new TikTokUploadError("TikTok returned an invalid publish status response");
    }
    return data as TikTokPublishStatus;
  }

  private async requestJson<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new TikTokUploadError("TikTok API request failed at the network boundary", {
        networkError: true,
        cause,
      });
    }

    let envelope: TikTokApiEnvelope<T>;
    try {
      envelope = (await response.json()) as TikTokApiEnvelope<T>;
    } catch (cause) {
      throw new TikTokUploadError("TikTok returned a non-JSON response", {
        httpStatus: response.status,
        cause,
      });
    }

    const apiError = envelope.error;
    if (!response.ok || apiError?.code !== "ok") {
      throw new TikTokUploadError(
        apiError?.message || `TikTok API request failed with HTTP ${response.status}`,
        {
          httpStatus: response.status,
          code: apiError?.code,
          logId: apiError?.log_id ?? apiError?.logid,
        },
      );
    }
    if (envelope.data === undefined) {
      throw new TikTokUploadError("TikTok returned a response without data", {
        httpStatus: response.status,
      });
    }
    return envelope.data;
  }
}
