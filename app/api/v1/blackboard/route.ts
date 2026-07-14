import { NextRequest } from "next/server";
import {
  handleBlackboardAppendSigned,
  handleBlackboardReadSigned,
  type SignedAgentPayloadArgs,
} from "@/lib/mcp-tools";
import {
  corsPreflight,
  jsonError,
  requestedAgentFormat,
  structuredOk,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json" && contentType !== "text/toon") {
    return jsonError("content-type must be application/json or text/toon", 415);
  }
  const operation = new URL(req.url).searchParams.get("operation");
  if (operation !== "read" && operation !== "append") {
    return jsonError("operation must be read or append", 400);
  }
  const rawBody = await req.text();
  if (!rawBody.trim()) return jsonError("request body is required", 400);
  const envelope: SignedAgentPayloadArgs = {
    signed_payload: rawBody,
    format: contentType === "text/toon" ? "toon" : "json",
    agent_id: req.headers.get("X-Arbor-Agent") ?? "",
    timestamp: req.headers.get("X-Arbor-Timestamp") ?? "",
    nonce: req.headers.get("X-Arbor-Nonce") ?? "",
    signature: req.headers.get("X-Arbor-Signature") ?? "",
  };
  try {
    const result =
      operation === "read"
        ? await handleBlackboardReadSigned(envelope)
        : await handleBlackboardAppendSigned(envelope);
    if (!result.ok) {
      return jsonError(
        result.detail ? `${result.error}: ${result.detail}` : result.error,
        result.status,
        result.error,
      );
    }
    return structuredOk(
      result,
      requestedAgentFormat(req),
      operation === "append" ? 201 : 200,
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
