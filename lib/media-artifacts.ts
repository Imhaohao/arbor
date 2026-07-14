export type MediaKind = "video" | "audio" | "image" | "subtitle" | "other";

export type ArtifactLocator =
  | {
      kind: "convex_storage";
      storage_id: string;
    }
  | {
      kind: "external_url";
      url: string;
      /** Epoch milliseconds. Omit for URLs that do not expire. */
      expires_at_ms?: number;
    };

export interface ArtifactIntegrity {
  algorithm: "sha256" | "sha512";
  /** Lower-case hexadecimal digest. */
  digest: string;
}

/**
 * Self-contained pointer that may cross agent or provider boundaries.
 * It intentionally contains no credentials or provider-specific headers.
 */
export interface ArtifactRef {
  artifact_id: string;
  version: number;
  kind: MediaKind;
  mime_type: string;
  locator: ArtifactLocator;
  filename?: string;
  byte_size?: number;
  integrity?: ArtifactIntegrity;
}

export type ArtifactOrigin =
  | "user_upload"
  | "provider_output"
  | "agent_output"
  | "imported";

export interface ArtifactProvenance {
  origin: ArtifactOrigin;
  created_by_agent_id?: string;
  provider?: string;
  provider_job_id?: string;
  task_id?: string;
  dag_id?: string;
  node_id?: string;
  parent_artifact_ids?: string[];
}

export interface MediaDimensions {
  width: number;
  height: number;
}

/** Persisted artifact metadata. The media bytes live at `locator`. */
export interface MediaArtifact extends ArtifactRef {
  created_at_ms: number;
  updated_at_ms: number;
  provenance: ArtifactProvenance;
  duration_ms?: number;
  dimensions?: MediaDimensions;
  codec?: string;
  frame_rate?: number;
}

export type ProviderJobStatus =
  | "queued"
  | "submitted"
  | "running"
  | "retry_wait"
  | "input_required"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ProviderJobError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ProviderJobCost {
  amount: number;
  /** ISO 4217 code or provider-defined unit such as CREDITS. */
  currency: string;
}

export interface ProviderJobContext {
  agent_id?: string;
  task_id?: string;
  dag_id?: string;
  node_id?: string;
}

/**
 * Durable state machine for asynchronous generation, editing, and export jobs.
 * Store one record per idempotency key and update it after every provider call,
 * webhook, or poll.
 */
export interface ProviderJob {
  job_id: string;
  idempotency_key: string;
  provider: string;
  operation: string;
  status: ProviderJobStatus;
  provider_job_id?: string;
  context?: ProviderJobContext;
  input_artifacts: ArtifactRef[];
  output_artifacts: ArtifactRef[];
  progress?: number;
  attempts: number;
  max_attempts: number;
  next_poll_at_ms?: number;
  error?: ProviderJobError;
  quoted_cost?: ProviderJobCost;
  actual_cost?: ProviderJobCost;
  created_at_ms: number;
  updated_at_ms: number;
  started_at_ms?: number;
  completed_at_ms?: number;
}

const MEDIA_KINDS = new Set<MediaKind>([
  "video",
  "audio",
  "image",
  "subtitle",
  "other",
]);
const ARTIFACT_ORIGINS = new Set<ArtifactOrigin>([
  "user_upload",
  "provider_output",
  "agent_output",
  "imported",
]);
const JOB_STATUSES = new Set<ProviderJobStatus>([
  "queued",
  "submitted",
  "running",
  "retry_wait",
  "input_required",
  "succeeded",
  "failed",
  "cancelled",
]);
const TERMINAL_JOB_STATUSES = new Set<ProviderJobStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${label} must contain 1-${maxLength} characters`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maxLength = 512,
): string | undefined {
  return value === undefined ? undefined : text(value, label, maxLength);
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function finiteNumber(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${label} must be a finite number >= ${minimum}`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum = 0,
): number | undefined {
  return value === undefined ? undefined : integer(value, label, minimum);
}

function assignDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

function normalizeMimeType(value: unknown): string {
  const normalized = text(value, "mime_type", 127)
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(normalized)
  ) {
    throw new TypeError("mime_type must be a valid media type");
  }
  return normalized;
}

function normalizeMediaKind(value: unknown): MediaKind {
  if (typeof value !== "string" || !MEDIA_KINDS.has(value as MediaKind)) {
    throw new TypeError("kind must be a supported media kind");
  }
  return value as MediaKind;
}

function assertKindMatchesMime(kind: MediaKind, mimeType: string): void {
  const expectedPrefix =
    kind === "video" || kind === "audio" || kind === "image"
      ? `${kind}/`
      : undefined;
  if (expectedPrefix && !mimeType.startsWith(expectedPrefix)) {
    throw new TypeError(
      `kind ${kind} is incompatible with mime_type ${mimeType}`,
    );
  }
  if (
    kind === "subtitle" &&
    ![
      "text/vtt",
      "application/x-subrip",
      "application/ttml+xml",
      "application/ttml+xml;codecs=im1t",
    ].includes(mimeType)
  ) {
    throw new TypeError(
      `kind subtitle is incompatible with mime_type ${mimeType}`,
    );
  }
}

function normalizeFilename(value: unknown): string | undefined {
  const filename = optionalText(value, "filename", 512);
  if (
    filename !== undefined &&
    (/[\\/\0]/.test(filename) || /[\u0000-\u001f]/.test(filename))
  ) {
    throw new TypeError("filename must be a safe basename");
  }
  return filename;
}

function normalizeLocator(value: unknown): ArtifactLocator {
  const input = record(value, "locator");
  if (input.kind === "convex_storage") {
    return {
      kind: "convex_storage",
      storage_id: text(input.storage_id, "locator.storage_id", 256),
    };
  }
  if (input.kind === "external_url") {
    const rawUrl = text(input.url, "locator.url", 8_192);
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new TypeError("locator.url must be a valid HTTP(S) URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new TypeError("locator.url must be a valid HTTP(S) URL");
    }
    if (url.username || url.password) {
      throw new TypeError("locator.url must not contain credentials");
    }
    const normalized: ArtifactLocator = {
      kind: "external_url",
      url: url.toString(),
    };
    assignDefined(
      normalized,
      "expires_at_ms",
      optionalInteger(input.expires_at_ms, "locator.expires_at_ms"),
    );
    return normalized;
  }
  throw new TypeError("locator.kind must be convex_storage or external_url");
}

function normalizeIntegrity(value: unknown): ArtifactIntegrity | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "integrity");
  if (input.algorithm !== "sha256" && input.algorithm !== "sha512") {
    throw new TypeError("integrity.algorithm must be sha256 or sha512");
  }
  const expectedLength = input.algorithm === "sha256" ? 64 : 128;
  const digest = text(
    input.digest,
    "integrity.digest",
    expectedLength,
  ).toLowerCase();
  if (digest.length !== expectedLength || !/^[0-9a-f]+$/.test(digest)) {
    throw new TypeError(
      `integrity.digest must be a ${expectedLength}-character hexadecimal digest`,
    );
  }
  return { algorithm: input.algorithm, digest };
}

export function normalizeArtifactRef(value: unknown): ArtifactRef {
  const input = record(value, "artifact reference");
  const kind = normalizeMediaKind(input.kind);
  const mimeType = normalizeMimeType(input.mime_type);
  assertKindMatchesMime(kind, mimeType);

  const normalized: ArtifactRef = {
    artifact_id: text(input.artifact_id, "artifact_id", 256),
    version: integer(input.version, "version", 1),
    kind,
    mime_type: mimeType,
    locator: normalizeLocator(input.locator),
  };
  assignDefined(normalized, "filename", normalizeFilename(input.filename));
  assignDefined(
    normalized,
    "byte_size",
    optionalInteger(input.byte_size, "byte_size"),
  );
  assignDefined(normalized, "integrity", normalizeIntegrity(input.integrity));
  return normalized;
}

function normalizeProvenance(value: unknown): ArtifactProvenance {
  const input = record(value, "provenance");
  if (
    typeof input.origin !== "string" ||
    !ARTIFACT_ORIGINS.has(input.origin as ArtifactOrigin)
  ) {
    throw new TypeError("provenance.origin must be a supported origin");
  }
  const normalized: ArtifactProvenance = {
    origin: input.origin as ArtifactOrigin,
  };
  assignDefined(
    normalized,
    "created_by_agent_id",
    optionalText(
      input.created_by_agent_id,
      "provenance.created_by_agent_id",
      256,
    ),
  );
  assignDefined(
    normalized,
    "provider",
    optionalText(input.provider, "provenance.provider", 256),
  );
  assignDefined(
    normalized,
    "provider_job_id",
    optionalText(input.provider_job_id, "provenance.provider_job_id", 512),
  );
  for (const key of ["task_id", "dag_id", "node_id"] as const) {
    assignDefined(
      normalized,
      key,
      optionalText(input[key], `provenance.${key}`, 256),
    );
  }
  if (input.parent_artifact_ids !== undefined) {
    if (!Array.isArray(input.parent_artifact_ids)) {
      throw new TypeError("provenance.parent_artifact_ids must be an array");
    }
    const ids = input.parent_artifact_ids.map((id, index) =>
      text(id, `provenance.parent_artifact_ids[${index}]`, 256),
    );
    normalized.parent_artifact_ids = [...new Set(ids)];
  }
  if (normalized.origin === "provider_output" && !normalized.provider) {
    throw new TypeError("provider_output provenance requires provider");
  }
  return normalized;
}

function normalizeDimensions(value: unknown): MediaDimensions | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "dimensions");
  return {
    width: integer(input.width, "dimensions.width", 1),
    height: integer(input.height, "dimensions.height", 1),
  };
}

export function normalizeMediaArtifact(value: unknown): MediaArtifact {
  const input = record(value, "media artifact");
  const ref = normalizeArtifactRef(input);
  const createdAt = integer(input.created_at_ms, "created_at_ms");
  const updatedAt = integer(input.updated_at_ms, "updated_at_ms");
  if (updatedAt < createdAt) {
    throw new TypeError("updated_at_ms cannot be earlier than created_at_ms");
  }
  const normalized: MediaArtifact = {
    ...ref,
    created_at_ms: createdAt,
    updated_at_ms: updatedAt,
    provenance: normalizeProvenance(input.provenance),
  };
  const duration = optionalInteger(input.duration_ms, "duration_ms");
  const dimensions = normalizeDimensions(input.dimensions);
  if (duration !== undefined && ref.kind !== "video" && ref.kind !== "audio") {
    throw new TypeError(
      "duration_ms is only valid for video and audio artifacts",
    );
  }
  if (
    dimensions !== undefined &&
    ref.kind !== "video" &&
    ref.kind !== "image"
  ) {
    throw new TypeError(
      "dimensions are only valid for video and image artifacts",
    );
  }
  assignDefined(normalized, "duration_ms", duration);
  assignDefined(normalized, "dimensions", dimensions);
  assignDefined(
    normalized,
    "codec",
    optionalText(input.codec, "codec", 64),
  );
  if (input.frame_rate !== undefined) {
    normalized.frame_rate = finiteNumber(input.frame_rate, "frame_rate", 1);
  }
  return normalized;
}

export function toArtifactRef(artifact: MediaArtifact): ArtifactRef {
  return normalizeArtifactRef(artifact);
}

/** False only when a signed external URL is already expired. */
export function isArtifactRefAvailable(
  ref: ArtifactRef,
  atMs = Date.now(),
): boolean {
  return (
    ref.locator.kind !== "external_url" ||
    ref.locator.expires_at_ms === undefined ||
    ref.locator.expires_at_ms > atMs
  );
}

function normalizeArtifactList(value: unknown, label: string): ArtifactRef[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item, index) => {
    try {
      return normalizeArtifactRef(item);
    } catch (error) {
      throw new TypeError(
        `${label}[${index}] is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

function normalizeJobStatus(value: unknown): ProviderJobStatus {
  if (
    typeof value !== "string" ||
    !JOB_STATUSES.has(value as ProviderJobStatus)
  ) {
    throw new TypeError("status must be a supported provider job status");
  }
  return value as ProviderJobStatus;
}

function normalizeJobError(value: unknown): ProviderJobError | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "error");
  if (typeof input.retryable !== "boolean") {
    throw new TypeError("error.retryable must be a boolean");
  }
  return {
    code: text(input.code, "error.code", 256),
    message: text(input.message, "error.message", 4_096),
    retryable: input.retryable,
  };
}

function normalizeCost(
  value: unknown,
  label: string,
): ProviderJobCost | undefined {
  if (value === undefined) return undefined;
  const input = record(value, label);
  const currency = text(input.currency, `${label}.currency`, 16).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,15}$/.test(currency)) {
    throw new TypeError(
      `${label}.currency must be a currency code or provider unit`,
    );
  }
  return {
    amount: finiteNumber(input.amount, `${label}.amount`),
    currency,
  };
}

function normalizeJobContext(value: unknown): ProviderJobContext | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "context");
  const normalized: ProviderJobContext = {};
  for (const key of ["agent_id", "task_id", "dag_id", "node_id"] as const) {
    assignDefined(
      normalized,
      key,
      optionalText(input[key], `context.${key}`, 256),
    );
  }
  return normalized;
}

export function isTerminalProviderJob(status: ProviderJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function normalizeProviderJob(value: unknown): ProviderJob {
  const input = record(value, "provider job");
  const status = normalizeJobStatus(input.status);
  const createdAt = integer(input.created_at_ms, "created_at_ms");
  const updatedAt = integer(input.updated_at_ms, "updated_at_ms");
  const startedAt = optionalInteger(input.started_at_ms, "started_at_ms");
  const completedAt = optionalInteger(input.completed_at_ms, "completed_at_ms");
  const attempts = integer(input.attempts, "attempts");
  const maxAttempts = integer(input.max_attempts, "max_attempts", 1);
  const outputArtifacts = normalizeArtifactList(
    input.output_artifacts,
    "output_artifacts",
  );
  const error = normalizeJobError(input.error);

  if (updatedAt < createdAt) {
    throw new TypeError("updated_at_ms cannot be earlier than created_at_ms");
  }
  if (startedAt !== undefined && startedAt < createdAt) {
    throw new TypeError("started_at_ms cannot be earlier than created_at_ms");
  }
  if (completedAt !== undefined && completedAt < (startedAt ?? createdAt)) {
    throw new TypeError("completed_at_ms cannot be earlier than the job start");
  }
  if (attempts > maxAttempts) {
    throw new TypeError("attempts cannot exceed max_attempts");
  }
  if (status === "submitted" && input.provider_job_id === undefined) {
    throw new TypeError("submitted jobs require provider_job_id");
  }
  if (
    (status === "running" || status === "succeeded") &&
    startedAt === undefined
  ) {
    throw new TypeError(`${status} jobs require started_at_ms`);
  }
  if (status === "retry_wait" && input.next_poll_at_ms === undefined) {
    throw new TypeError("retry_wait jobs require next_poll_at_ms");
  }
  if (status === "retry_wait" && !error) {
    throw new TypeError("retry_wait jobs require the retryable error");
  }
  if (status === "retry_wait" && error && !error.retryable) {
    throw new TypeError("retry_wait jobs require error.retryable to be true");
  }
  if (isTerminalProviderJob(status) !== (completedAt !== undefined)) {
    throw new TypeError("only terminal jobs must have completed_at_ms");
  }
  if (isTerminalProviderJob(status) && input.next_poll_at_ms !== undefined) {
    throw new TypeError("terminal jobs cannot have next_poll_at_ms");
  }
  if (status === "succeeded" && outputArtifacts.length === 0) {
    throw new TypeError("succeeded media jobs require an output artifact");
  }
  if (status === "failed" && !error) {
    throw new TypeError("failed jobs require an error");
  }
  if (status !== "failed" && status !== "retry_wait" && error) {
    throw new TypeError("error is only valid for failed or retry_wait jobs");
  }
  if (status !== "succeeded" && outputArtifacts.length > 0) {
    throw new TypeError("output_artifacts are only valid for succeeded jobs");
  }

  const normalized: ProviderJob = {
    job_id: text(input.job_id, "job_id", 256),
    idempotency_key: text(input.idempotency_key, "idempotency_key", 512),
    provider: text(input.provider, "provider", 256),
    operation: text(input.operation, "operation", 256),
    status,
    input_artifacts: normalizeArtifactList(
      input.input_artifacts,
      "input_artifacts",
    ),
    output_artifacts: outputArtifacts,
    attempts,
    max_attempts: maxAttempts,
    created_at_ms: createdAt,
    updated_at_ms: updatedAt,
  };
  assignDefined(
    normalized,
    "provider_job_id",
    optionalText(input.provider_job_id, "provider_job_id", 512),
  );
  assignDefined(normalized, "context", normalizeJobContext(input.context));
  if (input.progress !== undefined) {
    const progress = finiteNumber(input.progress, "progress");
    if (progress > 1) throw new TypeError("progress must be between 0 and 1");
    normalized.progress = progress;
  }
  assignDefined(
    normalized,
    "next_poll_at_ms",
    optionalInteger(input.next_poll_at_ms, "next_poll_at_ms"),
  );
  assignDefined(normalized, "error", error);
  assignDefined(
    normalized,
    "quoted_cost",
    normalizeCost(input.quoted_cost, "quoted_cost"),
  );
  assignDefined(
    normalized,
    "actual_cost",
    normalizeCost(input.actual_cost, "actual_cost"),
  );
  assignDefined(normalized, "started_at_ms", startedAt);
  assignDefined(normalized, "completed_at_ms", completedAt);
  return normalized;
}

const ALLOWED_JOB_TRANSITIONS: Record<
  ProviderJobStatus,
  ReadonlySet<ProviderJobStatus>
> = {
  queued: new Set([
    "queued",
    "submitted",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  submitted: new Set([
    "submitted",
    "running",
    "retry_wait",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  running: new Set([
    "running",
    "retry_wait",
    "input_required",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  retry_wait: new Set([
    "retry_wait",
    "queued",
    "submitted",
    "running",
    "failed",
    "cancelled",
  ]),
  input_required: new Set([
    "input_required",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  succeeded: new Set(["succeeded"]),
  failed: new Set(["failed"]),
  cancelled: new Set(["cancelled"]),
};

export function assertProviderJobTransition(
  from: ProviderJobStatus,
  to: ProviderJobStatus,
): void {
  if (!JOB_STATUSES.has(from) || !JOB_STATUSES.has(to)) {
    throw new TypeError("provider job transition contains an unknown status");
  }
  if (!ALLOWED_JOB_TRANSITIONS[from].has(to)) {
    throw new TypeError(`invalid provider job transition: ${from} -> ${to}`);
  }
}

const OUTPUT_ARTIFACT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;

/**
 * Recover a durable artifact ID from common A2A/MCP final-output shapes.
 * The returned opaque ID is still checked against Convex before use.
 */
export function extractMediaArtifactId(value: unknown): string | undefined {
  function visit(candidate: unknown, depth: number): string | undefined {
    if (depth > 4 || candidate === null || candidate === undefined) {
      return undefined;
    }
    if (typeof candidate === "string") {
      const text = candidate.trim();
      if (!text) return undefined;
      if (
        (text.startsWith("{") || text.startsWith("[")) &&
        text.length <= 100_000
      ) {
        try {
          const parsed = visit(JSON.parse(text), depth + 1);
          if (parsed) return parsed;
        } catch {
          // Continue with bounded text patterns.
        }
      }
      const match =
        text.match(/artifact:\/\/([a-zA-Z0-9][a-zA-Z0-9._:-]{0,255})/) ??
        text.match(
          /["']?(?:media_)?artifact_id["']?\s*[:=]\s*["']([a-zA-Z0-9][a-zA-Z0-9._:-]{0,255})["']/i,
        );
      return match?.[1];
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate.slice(0, 20)) {
        const found = visit(entry, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof candidate !== "object") return undefined;
    const row = candidate as Record<string, unknown>;
    for (const key of ["media_artifact_id", "artifact_id"] as const) {
      const direct = row[key];
      if (typeof direct === "string" && OUTPUT_ARTIFACT_ID_RE.test(direct)) {
        return direct;
      }
    }
    for (const key of ["artifact", "data", "result", "text", "output"] as const) {
      const found = visit(row[key], depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  return visit(value, 0);
}
