"use node";

import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  verifyInbound,
  type VerifyArgs,
  type VerifyVerdict,
} from "./a2aAuthCore";
import { parseAgentData } from "../lib/toon";

const MAX_SIGNED_BODY_CHARS = 12_000;
const DEFAULT_MAX_IMPORT_BYTES = 128 * 1024 * 1024;
const MAX_IMPORT_REDIRECTS = 3;

const signedArgs = {
  raw_body: v.string(),
  format: v.optional(v.union(v.literal("json"), v.literal("toon"))),
  agent_id: v.optional(v.string()),
  timestamp: v.optional(v.string()),
  nonce: v.optional(v.string()),
  signature: v.optional(v.string()),
};

const failureValidator = v.object({
  ok: v.literal(false),
  status: v.number(),
  error: v.string(),
  detail: v.optional(v.string()),
});

type Failure = {
  ok: false;
  status: number;
  error: string;
  detail?: string;
};

type MediaKind = "video" | "audio" | "image" | "other";

interface UploadRequest {
  dag_id: string;
  node_id: string;
  file_name: string;
  mime_type: string;
  media_kind: MediaKind;
}

interface FinalizeRequest extends UploadRequest {
  storage_id: string;
  source: "agent_upload" | "provider_output";
  duration_ms?: number;
  width?: number;
  height?: number;
  codec?: string;
  frame_rate?: number;
  provider?: string;
  external_artifact_id?: string;
}

interface ImportRequest extends Omit<FinalizeRequest, "storage_id" | "source"> {
  source_url: string;
}

function failure(status: number, error: string, detail?: string): Failure {
  return { ok: false, status, error, ...(detail ? { detail } : {}) };
}

function objectRow(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} must contain 1-${max} characters`);
  }
  return normalized;
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function parseUploadRequest(value: unknown): UploadRequest {
  const row = objectRow(value, "media upload request");
  const dag_id = requiredText(row.dag_id, "dag_id", 256);
  const node_id = requiredText(row.node_id, "node_id", 128);
  const file_name = requiredText(row.file_name, "file_name", 255);
  if (/[\\/\0]/.test(file_name) || /[\u0000-\u001f]/.test(file_name)) {
    throw new Error("file_name must be a safe basename");
  }
  const mime_type = requiredText(row.mime_type, "mime_type", 127)
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime_type)) {
    throw new Error("mime_type must be a valid media type");
  }
  if (
    row.media_kind !== "video" &&
    row.media_kind !== "audio" &&
    row.media_kind !== "image" &&
    row.media_kind !== "other"
  ) {
    throw new Error("media_kind must be video, audio, image, or other");
  }
  if (
    row.media_kind !== "other" &&
    !mime_type.startsWith(`${row.media_kind}/`)
  ) {
    throw new Error("media_kind does not match mime_type");
  }
  return {
    dag_id,
    node_id,
    file_name,
    mime_type,
    media_kind: row.media_kind,
  };
}

function parseFinalizeRequest(value: unknown): FinalizeRequest {
  const row = objectRow(value, "media finalize request");
  const upload = parseUploadRequest(row);
  if (row.source !== "agent_upload" && row.source !== "provider_output") {
    throw new Error("source must be agent_upload or provider_output");
  }
  const provider =
    row.provider === undefined
      ? undefined
      : requiredText(row.provider, "provider", 128);
  if (row.source === "provider_output" && !provider) {
    throw new Error("provider_output requires provider");
  }
  return {
    ...upload,
    storage_id: requiredText(row.storage_id, "storage_id", 256),
    source: row.source,
    duration_ms: optionalPositiveNumber(row.duration_ms, "duration_ms"),
    width: optionalPositiveNumber(row.width, "width"),
    height: optionalPositiveNumber(row.height, "height"),
    codec:
      row.codec === undefined
        ? undefined
        : requiredText(row.codec, "codec", 64),
    frame_rate: optionalPositiveNumber(row.frame_rate, "frame_rate"),
    provider,
    external_artifact_id:
      row.external_artifact_id === undefined
        ? undefined
        : requiredText(
            row.external_artifact_id,
            "external_artifact_id",
            512,
          ),
  };
}

function parseImportRequest(value: unknown): ImportRequest {
  const row = objectRow(value, "media import request");
  const parsed = parseFinalizeRequest({
    ...row,
    storage_id: "pending-import",
    source: "provider_output",
  });
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(requiredText(row.source_url, "source_url", 4_096));
  } catch {
    throw new Error("source_url must be a valid URL");
  }
  if (sourceUrl.protocol !== "https:") {
    throw new Error("source_url must use HTTPS");
  }
  const { storage_id: _storageId, source: _source, ...metadata } = parsed;
  return { ...metadata, source_url: sourceUrl.toString() };
}

function maxImportBytes(): number {
  const configured = Number(process.env.ARBOR_AGENT_MEDIA_IMPORT_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_IMPORT_BYTES;
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized === "0.0.0.0") {
    return true;
  }
  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : undefined);
  if (!ipv4) return false;
  const octets = ipv4.split(".").map(Number);
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function resolvePublicHttpsUrl(
  url: URL,
): Promise<{ address: string; family: 4 | 6 }> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("media import URL must be public HTTPS without credentials");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("media import URL host is not public");
  }
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("media import URL resolves to a non-public address");
  }
  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) {
    throw new Error("media import URL resolved to an unsupported address");
  }
  return { address: selected.address, family: selected.family };
}

function requestPinnedHttps(
  url: URL,
  resolved: { address: string; family: 4 | 6 },
  expectedMimeType: string,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: resolved.address,
        family: resolved.family,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        headers: {
          host: url.host,
          accept: expectedMimeType,
          "user-agent": "Arbor-Media-Importer/1.0",
        },
      },
      resolve,
    );
    request.setTimeout(60_000, () => {
      request.destroy(new Error("media provider download timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

async function downloadPublicMedia(
  source: string,
  expectedMimeType: string,
): Promise<Blob> {
  let current = new URL(source);
  for (let redirect = 0; redirect <= MAX_IMPORT_REDIRECTS; redirect += 1) {
    const resolved = await resolvePublicHttpsUrl(current);
    const response = await requestPinnedHttps(
      current,
      resolved,
      expectedMimeType,
    );
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const location = response.headers.location;
      response.resume();
      if (!location || redirect === MAX_IMPORT_REDIRECTS) {
        throw new Error("media import exceeded the redirect limit");
      }
      current = new URL(location, current);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error(`media provider download failed with HTTP ${status}`);
    }
    const limit = maxImportBytes();
    const declaredSize = Number(response.headers["content-length"]);
    if (Number.isFinite(declaredSize) && declaredSize > limit) {
      response.destroy();
      throw new Error(`media import exceeds the ${limit}-byte limit`);
    }
    const rawContentType = response.headers["content-type"];
    const actualMimeType = (Array.isArray(rawContentType)
      ? rawContentType[0]
      : rawContentType
    )
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() ?? "";
    if (
      actualMimeType &&
      actualMimeType !== "application/octet-stream" &&
      actualMimeType.split("/", 1)[0] !== expectedMimeType.split("/", 1)[0]
    ) {
      throw new Error("provider response content type does not match the media kind");
    }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const rawChunk of response) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk as Uint8Array);
      totalBytes += chunk.byteLength;
      if (totalBytes > limit) {
        response.destroy();
        throw new Error(`media import exceeds the ${limit}-byte limit`);
      }
      chunks.push(chunk);
    }
    return new Blob([Buffer.concat(chunks, totalBytes)], {
      type: expectedMimeType,
    });
  }
  throw new Error("media import failed");
}

function parseResolveRequest(value: unknown): { artifact_id: string } {
  const row = objectRow(value, "media resolve request");
  return {
    artifact_id: requiredText(row.artifact_id, "artifact_id", 256),
  };
}

function decoded(args: VerifyArgs & { format?: "json" | "toon" }): unknown {
  return parseAgentData(args.raw_body, args.format);
}

async function authenticate(
  ctx: ActionCtx,
  args: VerifyArgs,
): Promise<VerifyVerdict | Failure> {
  if (args.raw_body.length > MAX_SIGNED_BODY_CHARS) {
    return failure(413, "request_too_large");
  }
  const verdict = await verifyInbound(ctx, args);
  if (!verdict.ok) return verdict;
  const agent: Doc<"agents"> | null = await ctx.runQuery(
    internal.agents._getByAgentId,
    {
    agent_id: verdict.agent_id,
    },
  );
  return agent
    ? verdict
    : { ok: false, status: 403, error: "unknown_agent" };
}

async function authorizeScope(
  ctx: ActionCtx,
  request: UploadRequest,
  agentId: string,
): Promise<
  | Failure
  | { ok: true; dagId: Id<"hive_dags">; node: Doc<"hive_nodes"> }
> {
  const dagId = request.dag_id as Id<"hive_dags">;
  const canAccess = await ctx.runQuery(
    internal.mediaArtifacts._canAgentAccessDag,
    { dag_id: dagId, agent_id: agentId },
  );
  if (!canAccess) return failure(403, "not_dag_collaborator");
  const node: Doc<"hive_nodes"> | null = await ctx.runQuery(
    internal.hiveData._getNodeByDagAndNodeId,
    { dag_id: dagId, node_id: request.node_id },
  );
  if (!node) return failure(404, "unknown_node");
  return { ok: true as const, dagId, node };
}

export const requestUploadSigned = action({
  args: signedArgs,
  returns: v.union(
    failureValidator,
    v.object({
      ok: v.literal(true),
      upload_url: v.string(),
      method: v.literal("POST"),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    Failure | { ok: true; upload_url: string; method: "POST" }
  > => {
    const auth = await authenticate(ctx, args);
    if (!auth.ok) return auth;
    try {
      const request = parseUploadRequest(decoded(args));
      const scope = await authorizeScope(ctx, request, auth.agent_id);
      if (!scope.ok) return scope;
      const upload_url: string = await ctx.runMutation(
        internal.mediaArtifacts._generateUploadUrl,
        {},
      );
      return { ok: true as const, upload_url, method: "POST" as const };
    } catch (error) {
      return failure(
        400,
        "invalid_request",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

export const finalizeUploadSigned = action({
  args: signedArgs,
  returns: v.union(
    failureValidator,
    v.object({
      ok: v.literal(true),
      artifact_id: v.id("media_artifacts"),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Failure | { ok: true; artifact_id: Id<"media_artifacts"> }> => {
    const auth = await authenticate(ctx, args);
    if (!auth.ok) return auth;
    try {
      const request = parseFinalizeRequest(decoded(args));
      const scope = await authorizeScope(ctx, request, auth.agent_id);
      if (!scope.ok) return scope;
      const artifact_id: Id<"media_artifacts"> = await ctx.runMutation(
        internal.mediaArtifacts._registerStored,
        {
          storage_id: request.storage_id as Id<"_storage">,
          task_id: scope.node.task_id,
          dag_id: scope.dagId,
          node_id: request.node_id,
          created_by_agent_id: auth.agent_id,
          source: request.source,
          media_kind: request.media_kind,
          file_name: request.file_name,
          mime_type: request.mime_type,
          duration_ms: request.duration_ms,
          width: request.width,
          height: request.height,
          codec: request.codec,
          frame_rate: request.frame_rate,
          provider: request.provider,
          external_artifact_id: request.external_artifact_id,
        },
      );
      return { ok: true as const, artifact_id };
    } catch (error) {
      return failure(
        400,
        "invalid_request",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

export const importUrlSigned = action({
  args: signedArgs,
  returns: v.union(
    failureValidator,
    v.object({
      ok: v.literal(true),
      artifact_id: v.id("media_artifacts"),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Failure | { ok: true; artifact_id: Id<"media_artifacts"> }> => {
    const auth = await authenticate(ctx, args);
    if (!auth.ok) return auth;
    try {
      const request = parseImportRequest(decoded(args));
      const scope = await authorizeScope(ctx, request, auth.agent_id);
      if (!scope.ok) return scope;
      const blob = await downloadPublicMedia(
        request.source_url,
        request.mime_type,
      );
      const storage_id = await ctx.storage.store(blob);
      const artifact_id: Id<"media_artifacts"> = await ctx.runMutation(
        internal.mediaArtifacts._registerStored,
        {
          storage_id,
          task_id: scope.node.task_id,
          dag_id: scope.dagId,
          node_id: request.node_id,
          created_by_agent_id: auth.agent_id,
          source: "provider_output",
          media_kind: request.media_kind,
          file_name: request.file_name,
          mime_type: request.mime_type,
          duration_ms: request.duration_ms,
          width: request.width,
          height: request.height,
          codec: request.codec,
          frame_rate: request.frame_rate,
          provider: request.provider,
          external_artifact_id: request.external_artifact_id,
        },
      );
      return { ok: true as const, artifact_id };
    } catch (error) {
      return failure(
        400,
        "invalid_request",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

export const resolveSigned = action({
  args: signedArgs,
  returns: v.union(
    failureValidator,
    v.object({ ok: v.literal(true), artifact: v.any() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Failure | { ok: true; artifact: unknown }> => {
    const auth = await authenticate(ctx, args);
    if (!auth.ok) return auth;
    try {
      const request = parseResolveRequest(decoded(args));
      const artifact: unknown = await ctx.runQuery(
        internal.mediaArtifacts._resolveForAgent,
        {
          artifact_id: request.artifact_id as Id<"media_artifacts">,
          agent_id: auth.agent_id,
        },
      );
      if (!artifact) return failure(404, "unknown_or_inaccessible_artifact");
      return { ok: true as const, artifact };
    } catch (error) {
      return failure(
        400,
        "invalid_request",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

async function trustedHiveScope(
  ctx: ActionCtx,
  args: { task_id: Id<"tasks">; agent_id: string },
): Promise<{
  task: Doc<"tasks">;
  dagId: Id<"hive_dags">;
  nodeId: string;
}> {
  const task: Doc<"tasks"> = await ctx.runQuery(internal.tasks._get, {
    task_id: args.task_id,
  });
  if (!task.hive_dag_id || !task.hive_node_id || !task.winning_bid_id) {
    throw new Error("task is not an awarded Hive node");
  }
  const bid = await ctx.runQuery(internal.bids._get, {
    bid_id: task.winning_bid_id,
  });
  if (bid.agent_id !== args.agent_id) {
    throw new Error("agent is not the awarded Hive collaborator");
  }
  return {
    task,
    dagId: task.hive_dag_id,
    nodeId: task.hive_node_id,
  };
}

/**
 * Trusted bridge used only by the auction action's awarded specialist runner.
 * Scope is derived from the child task rather than accepted from model output.
 */
export const invokeTrusted = internalAction({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.string(),
    operation: v.union(
      v.literal("request_upload"),
      v.literal("import_url"),
      v.literal("finalize_upload"),
      v.literal("resolve"),
    ),
    payload: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const scope = await trustedHiveScope(ctx, args);
    const payload = objectRow(args.payload, "media workspace payload");

    if (args.operation === "request_upload") {
      const request = parseUploadRequest({
        ...payload,
        dag_id: scope.dagId,
        node_id: scope.nodeId,
      });
      const access = await authorizeScope(ctx, request, args.agent_id);
      if (!access.ok) throw new Error(access.error);
      const upload_url: string = await ctx.runMutation(
        internal.mediaArtifacts._generateUploadUrl,
        {},
      );
      return { upload_url, method: "POST" as const };
    }

    if (args.operation === "finalize_upload") {
      const request = parseFinalizeRequest({
        ...payload,
        dag_id: scope.dagId,
        node_id: scope.nodeId,
      });
      const access = await authorizeScope(ctx, request, args.agent_id);
      if (!access.ok) throw new Error(access.error);
      const artifact_id: Id<"media_artifacts"> = await ctx.runMutation(
        internal.mediaArtifacts._registerStored,
        {
          storage_id: request.storage_id as Id<"_storage">,
          task_id: scope.task._id,
          dag_id: scope.dagId,
          node_id: scope.nodeId,
          created_by_agent_id: args.agent_id,
          source: request.source,
          media_kind: request.media_kind,
          file_name: request.file_name,
          mime_type: request.mime_type,
          duration_ms: request.duration_ms,
          width: request.width,
          height: request.height,
          codec: request.codec,
          frame_rate: request.frame_rate,
          provider: request.provider,
          external_artifact_id: request.external_artifact_id,
        },
      );
      return { artifact_id };
    }

    if (args.operation === "import_url") {
      const request = parseImportRequest({
        ...payload,
        dag_id: scope.dagId,
        node_id: scope.nodeId,
      });
      const access = await authorizeScope(ctx, request, args.agent_id);
      if (!access.ok) throw new Error(access.error);
      const blob = await downloadPublicMedia(
        request.source_url,
        request.mime_type,
      );
      const storage_id = await ctx.storage.store(blob);
      const artifact_id: Id<"media_artifacts"> = await ctx.runMutation(
        internal.mediaArtifacts._registerStored,
        {
          storage_id,
          task_id: scope.task._id,
          dag_id: scope.dagId,
          node_id: scope.nodeId,
          created_by_agent_id: args.agent_id,
          source: "provider_output",
          media_kind: request.media_kind,
          file_name: request.file_name,
          mime_type: request.mime_type,
          duration_ms: request.duration_ms,
          width: request.width,
          height: request.height,
          codec: request.codec,
          frame_rate: request.frame_rate,
          provider: request.provider,
          external_artifact_id: request.external_artifact_id,
        },
      );
      return { artifact_id };
    }

    const request = parseResolveRequest(payload);
    const artifact = await ctx.runQuery(
      internal.mediaArtifacts._resolveForAgent,
      {
        artifact_id: request.artifact_id as Id<"media_artifacts">,
        agent_id: args.agent_id,
      },
    );
    if (!artifact || artifact.dag_id !== scope.dagId) {
      throw new Error("unknown_or_inaccessible_artifact");
    }
    return { artifact };
  },
});
