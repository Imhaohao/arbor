import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TIKTOK_INBOX_HANDOFF_MESSAGE } from "@/lib/tiktok-upload";
import {
  corsPreflight,
  jsonError,
  requestedAgentFormat,
  structuredOk,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function internalKey(): string {
  const key = process.env.ARBOR_INTERNAL_API_KEY?.trim();
  if (!key) throw new Error("ARBOR_INTERNAL_API_KEY is not set");
  return key;
}

function singleTenantUploadEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const value = (process.env.ARBOR_TIKTOK_SINGLE_TENANT_UPLOADS ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

function isAllowedBrowserOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const allowed = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : new URL(req.url).origin;
  return origin === allowed;
}

export async function POST(req: NextRequest) {
  if (!singleTenantUploadEnabled()) {
    return jsonError(
      "TikTok uploads require per-user OAuth, or an explicit ARBOR_TIKTOK_SINGLE_TENANT_UPLOADS=true opt-in for a single-account deployment",
      503,
      "tiktok_upload_not_enabled",
    );
  }
  if (!isAllowedBrowserOrigin(req)) {
    return jsonError("cross-origin TikTok upload initiation is not allowed", 403);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("request body must be JSON", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("request body must be an object", 400);
  }
  const row = body as Record<string, unknown>;
  if (typeof row.task_id !== "string" || !row.task_id.trim()) {
    return jsonError("task_id is required", 400);
  }
  if (typeof row.artifact_id !== "string" || !row.artifact_id.trim()) {
    return jsonError("artifact_id is required", 400);
  }

  try {
    const client = convex();
    const taskId = row.task_id.trim() as Id<"tasks">;
    const artifactId = row.artifact_id.trim() as Id<"media_artifacts">;
    const artifact = await client.query(api.mediaArtifacts.getForTask, {
      task_id: taskId,
      artifact_id: artifactId,
    });
    if (!artifact || artifact.media_kind !== "video") {
      return jsonError("artifact is not a ready video for this task", 404);
    }
    const requestId =
      req.headers.get("Idempotency-Key")?.trim() ||
      (typeof row.idempotency_key === "string"
        ? row.idempotency_key.trim()
        : "") ||
      randomUUID();
    if (requestId.length > 256) {
      return jsonError("idempotency key is too long", 400);
    }
    const jobId = `tiktok_${randomUUID()}`;
    const created = await client.mutation(api.providerJobs.createServer, {
      server_key: internalKey(),
      job_id: jobId,
      idempotency_key: `tiktok:${taskId}:${artifactId}:${requestId}`,
      task_id: taskId,
      dag_id: artifact.dag_id,
      node_id: artifact.node_id,
      requested_by_agent_id: "arbor:tiktok-upload",
      provider: "tiktok",
      operation: "upload_inbox",
      input_artifact_id: artifactId,
      max_attempts: 3,
    });
    await client.action(api.tiktokUploadActions.enqueue, {
      server_key: internalKey(),
      job_id: created.job_id,
    });
    return structuredOk(
      {
        ok: true,
        job_id: created.job_id,
        status: created.status,
        status_url: `/api/v1/tiktok/uploads/${encodeURIComponent(created.job_id)}`,
        handoff_message: TIKTOK_INBOX_HANDOFF_MESSAGE,
      },
      requestedAgentFormat(req),
      202,
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
