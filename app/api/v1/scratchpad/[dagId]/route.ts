import { NextRequest } from "next/server";
import {
  handleScratchpadRead,
  handleScratchpadWrite,
} from "@/lib/mcp-tools";
import {
  corsPreflight,
  jsonError,
  requestedAgentFormat,
  structuredOk,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ dagId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { dagId } = await ctx.params;
  if (!dagId) return jsonError("dag id is required", 400);
  try {
    const namespace = new URL(req.url).searchParams.get("namespace") ?? undefined;
    return structuredOk(
      await handleScratchpadRead({ dag_id: dagId, namespace }),
      requestedAgentFormat(req),
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { dagId } = await ctx.params;
  if (!dagId) return jsonError("dag id is required", 400);

  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json" && contentType !== "text/toon") {
    return jsonError("content-type must be application/json or text/toon", 415);
  }
  const rawBody = await req.text();
  if (!rawBody.trim()) return jsonError("request body is required", 400);

  try {
    const result = await handleScratchpadWrite({
      signed_payload: rawBody,
      format: contentType === "text/toon" ? "toon" : "json",
      agent_id: req.headers.get("X-Arbor-Agent") ?? "",
      timestamp: req.headers.get("X-Arbor-Timestamp") ?? "",
      nonce: req.headers.get("X-Arbor-Nonce") ?? "",
      signature: req.headers.get("X-Arbor-Signature") ?? "",
    });
    if (!result.ok) {
      const detail = "detail" in result ? result.detail : undefined;
      return jsonError(
        detail ? `${result.error}: ${detail}` : result.error,
        result.status,
        result.error,
      );
    }
    return structuredOk(result, requestedAgentFormat(req), 201);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 400);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
