import { ConvexHttpClient } from "convex/browser";
import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { TIKTOK_INBOX_HANDOFF_MESSAGE } from "@/lib/tiktok-upload";
import {
  corsPreflight,
  jsonError,
  requestedAgentFormat,
  structuredOk,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  if (!jobId) return jsonError("job id is required", 400);
  try {
    const job = await convex().query(api.providerJobs.getByJobId, {
      job_id: jobId,
    });
    if (!job || job.provider !== "tiktok") {
      return jsonError("TikTok upload job not found", 404);
    }
    return structuredOk(
      {
        job_id: job.job_id,
        status: job.status,
        progress: job.progress ?? 0,
        error:
          job.error_message
            ? {
                code: job.error_code,
                message: job.error_message,
                retryable: job.error_retryable ?? false,
              }
            : undefined,
        tiktok_status:
          job.provider_metadata &&
          typeof job.provider_metadata === "object" &&
          "tiktok_status" in job.provider_metadata
            ? job.provider_metadata.tiktok_status
            : undefined,
        action:
          job.status === "input_required" ? "open_tiktok_inbox" : undefined,
        handoff_message: TIKTOK_INBOX_HANDOFF_MESSAGE,
        updated_at: job.updated_at,
      },
      requestedAgentFormat(req),
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
