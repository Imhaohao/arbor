/**
 * Shared HTTP helpers for public API surfaces (MCP route + /api/v1 REST routes).
 *
 * The auction is a public marketplace — no auth — so CORS is wide open. Any
 * agent, browser, server, or curl session can hit it.
 */

import { NextResponse } from "next/server";
import { serializeAgentData, type AgentFormat } from "./toon";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Idempotency-Key, Mcp-Session-Id, Authorization, X-Arbor-Agent, X-Arbor-Timestamp, X-Arbor-Nonce, X-Arbor-Signature",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { error: { message, code: code ?? errorCodeForStatus(status) } },
    { status, headers: CORS_HEADERS },
  );
}

export function requestedAgentFormat(req: { url: string; headers: Headers }): AgentFormat {
  const requested = new URL(req.url).searchParams.get("format")?.toLowerCase();
  if (requested === "toon") return "toon";
  return req.headers.get("accept")?.includes("text/toon") ? "toon" : "json";
}

export function structuredOk(
  data: unknown,
  format: AgentFormat,
  status = 200,
): Response {
  if (format === "json") return jsonOk(data, status);
  const serialized = serializeAgentData(data, { override: "toon" });
  return new Response(serialized.text, {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": `${serialized.media_type}; charset=utf-8`,
      "x-arbor-format": serialized.format,
      "x-arbor-token-savings-estimate": String(serialized.saved_pct),
    },
  });
}

function errorCodeForStatus(status: number): string {
  if (status === 400) return "bad_request";
  if (status === 404) return "not_found";
  if (status === 422) return "unprocessable";
  if (status === 500) return "internal_error";
  return "error";
}

export function publicBaseUrl(req: { headers: Headers }): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
