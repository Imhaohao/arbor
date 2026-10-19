/**
 * Admin console A2A chat.
 *
 * GET  -> list every specialist shown in the market/admin listing, with
 *         A2A-ready entries marked for direct chat.
 * POST -> { agent_id, text, context_id?, task_id? }: send one user message to that
 *         specialist over A2A JSON-RPC message/send, poll tasks/get to a
 *         terminal state when the reply is a task, and return the agent's
 *         reply text plus the raw protocol payload for debugging.
 */

import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { jsonOk, corsPreflight } from "@/lib/http";
import {
  SPECIALISTS,
  specialistConfigFromPersisted,
  specialistEnabled,
} from "@/lib/specialists/registry";
import { getAuthForEndpoint, type ResolvedAuth } from "@/lib/specialists/a2a-agent-card";
import {
  pollUntilTerminal,
  extractText,
  type A2ATask,
  type A2AMessagePart,
} from "@/lib/specialists/a2a-forwarding";
import {
  buildThreadedA2AMessage,
  describeA2ATaskSnapshot,
} from "@/lib/specialists/a2a-chat-threading";
import type { SpecialistConfig } from "@/lib/types";
import { adminOnly } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kept under typical serverless gateway limits (Vercel Hobby ~10s) so a slow
// or unreachable agent yields a clean JSON 502 from this route rather than an
// HTML gateway-timeout page the client can't parse.
const SEND_TIMEOUT_MS = 9_000;

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

interface DiscoveredRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  tier?: SpecialistConfig["tier"];
  openrouter_model_id?: string;
  openrouter_api_key_env?: string;
  mcp_endpoint?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  a2a_auth_mode?: "none" | "card";
  discovery_source?: "google" | "catalog" | "registry" | "a2a" | "synthesized";
}

/** Static registry + Convex-discovered rows. */
async function listedSpecialists(): Promise<SpecialistConfig[]> {
  const fromRegistry = SPECIALISTS;
  let discovered: SpecialistConfig[] = [];
  try {
    const rows = (await convex().query(
      api.discoveredSpecialists.list,
      {},
    )) as DiscoveredRow[];
    discovered = rows
      .map((row) => specialistConfigFromPersisted(row))
      .filter((config) => specialistEnabled(config));
  } catch {
    // Convex unreachable -> registry-only list rather than a hard failure.
  }
  const seen = new Set(fromRegistry.map((s) => s.agent_id));
  return [...fromRegistry, ...discovered.filter((s) => !seen.has(s.agent_id))];
}

/** Static registry + Convex-discovered rows, filtered to A2A-capable. */
async function a2aSpecialists(): Promise<SpecialistConfig[]> {
  return (await listedSpecialists()).filter((s) => s.a2a_endpoint);
}

function chatUnavailableReason(s: SpecialistConfig): string | undefined {
  if (s.a2a_endpoint) return undefined;
  if (s.mcp_endpoint) return "MCP specialist; not directly reachable over A2A.";
  if (s.tier === "a2a-bridge") {
    return "A2A bridge specialist; use auction flow rather than direct message/send.";
  }
  if (s.tier === "openrouter") {
    return "OpenRouter model specialist; use the auction flow rather than direct A2A chat.";
  }
  if (s.tier === "mock") {
    return "Mock/persona specialist; no direct A2A endpoint configured.";
  }
  if (s.tier === "real") {
    return "Native API specialist; no direct A2A endpoint configured.";
  }
  return "No A2A endpoint configured.";
}

async function handleGet() {
  const specs = await listedSpecialists();
  return jsonOk({
    specialists: specs.map((s) => ({
      agent_id: s.agent_id,
      display_name: s.display_name,
      sponsor: s.sponsor,
      one_liner: s.one_liner,
      tier: s.tier,
      a2a_endpoint: s.a2a_endpoint,
      chat_ready: Boolean(s.a2a_endpoint),
      chat_unavailable_reason: chatUnavailableReason(s),
      discovered: s.discovered === true,
    })),
  });
}

// ─── message/send (lenient: task OR message reply) ─────────────────────────

interface RawJsonRpc {
  jsonrpc?: string;
  id?: string | number | null;
  result?: { kind?: string; [key: string]: unknown };
  error?: { code?: number; message?: string; data?: unknown };
}

function textFromParts(parts: A2AMessagePart[] | undefined): string {
  // Lenient: many live A2A servers omit the part `kind`/`type` discriminator
  // and just send `{ text }`. Accept any part that carries text.
  for (const p of parts ?? []) {
    if (p && typeof p.text === "string" && p.text) return p.text;
  }
  return "";
}

type JsonResponse = ReturnType<typeof jsonOk>;

interface ChatRequest {
  agent_id: string;
  text: string;
  context_id?: string;
  task_id?: string;
}

interface ChatTarget {
  agent_id: string;
  endpoint: string;
  context_id?: string;
  task_id?: string;
}

type LooseA2AResult = {
  kind?: string;
  message?: { parts?: A2AMessagePart[]; contextId?: string };
  parts?: A2AMessagePart[];
  contextId?: string;
  taskId?: string;
};

const TERMINAL_TASK_STATES = new Set(["completed", "failed", "canceled", "rejected"]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function parseChatRequest(req: NextRequest): Promise<ChatRequest | JsonResponse> {
  let body: Partial<ChatRequest>;
  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "invalid JSON body" }, 400);
  }
  const { agent_id, text, context_id, task_id } = body;
  if (!agent_id || !text?.trim()) {
    return jsonOk({ ok: false, error: "agent_id and text are required" }, 400);
  }
  return { agent_id, text: text.trim(), context_id, task_id };
}

/**
 * Key vault hydration: if the specialist needs a key env var that isn't set
 * in the process environment, pull the key from the Convex outbound-key
 * vault (console paste / auto-acquired) so chat works without redeploys.
 */
async function hydrateKeyFromVault(cfg: SpecialistConfig): Promise<void> {
  const envVar = cfg.a2a_api_key_env;
  if (cfg.a2a_auth_mode === "none" || !envVar || process.env[envVar]) return;
  try {
    const vaultKey = (await convex().query(api.a2aOutboundKeys.getForAgent, {
      agent_id: cfg.agent_id,
    })) as { api_key: string } | null;
    if (vaultKey?.api_key) process.env[envVar] = vaultKey.api_key;
  } catch {
    // Vault unreachable — fall through to normal resolution, which will
    // decline with a clear "env var not set" message.
  }
}

function authHeaders(auth: Exclude<ResolvedAuth, { kind: "decline" }>): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth.kind === "bearer") headers.authorization = `Bearer ${auth.token}`;
  if (auth.kind === "api-key") headers[auth.headerName] = auth.token;
  return headers;
}

function authDeclinedResponse(target: ChatTarget, reason: string): JsonResponse {
  return jsonOk(
    {
      ok: false,
      agent_id: target.agent_id,
      endpoint: target.endpoint,
      error: `auth: ${reason}`,
      // Tells the console UI to render the paste-a-key input for this agent.
      needs_key: /env var .* not set|not configured/.test(reason),
    },
    502,
  );
}

function sendFailedResponse(target: ChatTarget, err: unknown): JsonResponse {
  const timedOut = err instanceof Error && err.name === "AbortError";
  return jsonOk(
    {
      ok: false,
      agent_id: target.agent_id,
      endpoint: target.endpoint,
      error: timedOut
        ? `agent did not respond within ${SEND_TIMEOUT_MS / 1000}s (timed out)`
        : `send failed: ${errorMessage(err)}`,
    },
    504,
  );
}

async function sendA2AMessage(
  target: ChatTarget,
  headers: Record<string, string>,
  text: string,
): Promise<RawJsonRpc | JsonResponse> {
  const rpcId = `admin-chat-${Date.now()}`;
  const message = buildThreadedA2AMessage(text, crypto.randomUUID(), {
    contextId: target.context_id,
    taskId: target.task_id,
  });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    const res = await fetch(target.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId,
        method: "message/send",
        params: { message },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return jsonOk(
        {
          ok: false,
          agent_id: target.agent_id,
          endpoint: target.endpoint,
          error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
        },
        502,
      );
    }
    return (await res.json()) as RawJsonRpc;
  } catch (err) {
    return sendFailedResponse(target, err);
  }
}

function messageReplyResponse(target: ChatTarget, result: LooseA2AResult, raw: RawJsonRpc): JsonResponse {
  return jsonOk({
    ok: true,
    agent_id: target.agent_id,
    endpoint: target.endpoint,
    kind: "message",
    reply_text: textFromParts(result.parts) || "(no text parts in reply)",
    context_id: result.contextId ?? target.context_id,
    task_id: result.taskId ?? target.task_id,
    raw,
  });
}

/**
 * Task detection is lenient: many live servers omit `kind:"task"` and just
 * return the task object (`{id,status,artifacts}`), or wrap it as
 * `result.task`. Normalize all of these to one task object.
 */
function taskFromResult(result: RawJsonRpc["result"]): A2ATask | undefined {
  const candidate = (result as { task?: unknown } | undefined)?.task ?? result;
  if (!candidate) return undefined;
  const hasTaskState = !!(candidate as { status?: { state?: string } }).status?.state;
  return result?.kind === "task" || hasTaskState ? (candidate as unknown as A2ATask) : undefined;
}

function taskIdOf(task: A2ATask, fallback: string | undefined): string | undefined {
  const { id, taskId } = task as unknown as { id?: unknown; taskId?: unknown };
  if (typeof id === "string") return id;
  if (typeof taskId === "string") return taskId;
  return fallback;
}

/** Only polls when non-terminal AND the server gave us a task id to poll. */
async function pollUnlessTerminal(
  endpoint: string,
  task: A2ATask,
  taskId: string | undefined,
  headers: Record<string, string>,
): Promise<{ task: A2ATask; pollError?: string }> {
  const state = task.status?.state as string | undefined;
  if (TERMINAL_TASK_STATES.has(state ?? "") || !taskId) return { task };
  try {
    return { task: await pollUntilTerminal(endpoint, taskId, headers) };
  } catch (err) {
    // Poll failed (server doesn't support tasks/get, or task errored) — fall
    // back to whatever text the initial response already carried rather than
    // failing the turn. `input_required`/`working` snapshots still have text.
    return { task, pollError: errorMessage(err) };
  }
}

async function taskReplyResponse(
  target: ChatTarget,
  initialTask: A2ATask,
  headers: Record<string, string>,
  raw: RawJsonRpc,
): Promise<JsonResponse> {
  const candidateTaskId = taskIdOf(initialTask, target.task_id);
  const { task, pollError } = await pollUnlessTerminal(
    target.endpoint,
    initialTask,
    candidateTaskId,
    headers,
  );
  const finalState = task.status?.state as string | undefined;
  const { pending, replyText } = describeA2ATaskSnapshot(
    finalState,
    extractText(task),
    JSON.stringify(task.status),
  );
  return jsonOk({
    ok: true,
    agent_id: target.agent_id,
    endpoint: target.endpoint,
    kind: "task",
    state: finalState,
    pending,
    task_id: task.id || candidateTaskId,
    reply_text: replyText,
    context_id: (task as unknown as { contextId?: string }).contextId ?? target.context_id,
    ...(pollError ? { poll_error: pollError } : {}),
    raw: { ...raw, result: task },
  });
}

/**
 * Lenient fallback: some live A2A servers don't tag the result with
 * `kind`. They return the reply wrapped as `result.message` (e.g. protobuf
 * ROLE_AGENT style), or put `parts` directly on the result. Extract text
 * from whichever shape we find rather than failing the whole turn.
 */
function looseReplyResponse(
  target: ChatTarget,
  result: LooseA2AResult | undefined,
  raw: RawJsonRpc,
): JsonResponse {
  const wrappedMsg = result?.message;
  const looseText = textFromParts(wrappedMsg?.parts ?? result?.parts);
  if (!looseText) {
    return jsonOk(
      {
        ok: false,
        agent_id: target.agent_id,
        endpoint: target.endpoint,
        error: "reply was neither a message nor a task",
        raw,
      },
      502,
    );
  }
  return jsonOk({
    ok: true,
    agent_id: target.agent_id,
    endpoint: target.endpoint,
    kind: "message",
    reply_text: looseText,
    context_id: wrappedMsg?.contextId ?? result?.contextId ?? target.context_id,
    task_id: result?.taskId ?? target.task_id,
    raw,
  });
}

async function replyResponse(
  target: ChatTarget,
  headers: Record<string, string>,
  raw: RawJsonRpc,
): Promise<JsonResponse> {
  if (raw.error) {
    return jsonOk(
      {
        ok: false,
        agent_id: target.agent_id,
        endpoint: target.endpoint,
        error: `JSON-RPC error ${raw.error.code ?? ""}: ${raw.error.message ?? "unknown"}`,
        raw,
      },
      502,
    );
  }
  const result = raw.result as LooseA2AResult | undefined;
  // Reply may be a plain message (A2A allows message OR task results).
  if (result?.kind === "message") return messageReplyResponse(target, result, raw);
  const task = taskFromResult(raw.result);
  if (task) return taskReplyResponse(target, task, headers, raw);
  return looseReplyResponse(target, result, raw);
}

async function handlePost(req: NextRequest) {
  const request = await parseChatRequest(req);
  if (request instanceof Response) return request;

  const specs = await a2aSpecialists();
  const cfg = specs.find((s) => s.agent_id === request.agent_id);
  if (!cfg?.a2a_endpoint) {
    return jsonOk(
      { ok: false, error: `no A2A specialist registered with agent_id "${request.agent_id}"` },
      404,
    );
  }
  const target: ChatTarget = {
    agent_id: request.agent_id,
    endpoint: cfg.a2a_endpoint,
    context_id: request.context_id,
    task_id: request.task_id,
  };

  await hydrateKeyFromVault(cfg);
  // Resolve auth from the agent card (fail closed on unsupported schemes).
  const auth = await getAuthForEndpoint(target.endpoint, cfg);
  if (auth.kind === "decline") return authDeclinedResponse(target, auth.reason);
  const headers = authHeaders(auth);

  const raw = await sendA2AMessage(target, headers, request.text);
  if (raw instanceof Response) return raw;
  return replyResponse(target, headers, raw);
}

export function OPTIONS() {
  return corsPreflight();
}

export const GET = adminOnly(handleGet);
export const POST = adminOnly(handlePost);
