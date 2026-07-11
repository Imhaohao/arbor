/**
 * Buyer-facing A2A v0.3.0 gateway for the Arbor market.
 *
 * Maps standard `message/send` calls onto the four protocol-core MCP tools
 * (`post_task`, `get_task`, `list_specialists`, `raise_dispute`) via
 * `metadata.intent`. A2A clients that do not understand the `intents`
 * extension still get a usable agent (default intent is `post_task` with
 * the prompt taken from `message.parts[].text`).
 *
 * Intent map:
 *   discover      -> list_specialists
 *   post_task     -> post_task
 *   get_task      -> get_task
 *   raise_dispute -> raise_dispute
 *
 * Per-call state is persisted in the `a2a_task_runs` Convex table so
 * `tasks/get` on this route returns the same artifact shape it returned
 * at message/send time.
 */

import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import { corsPreflight, jsonOk } from "@/lib/http";
import { dispatchTool } from "@/lib/mcp-tools";
import {
  buildMarketAgentCard,
  INTENT_TO_TOOL,
  INTENT_DESCRIPTIONS,
  NEGOTIATE_INTENT,
  type MarketIntent,
  type ToolBackedIntent,
} from "@/lib/specialists/a2a-market-card";
import {
  buildArbitratorSystemPrompt,
  buildNegotiationUserPrompt,
  fallbackNegotiationReply,
  looksConversational,
  type NegotiationRosterEntry,
  type NegotiationTurn,
} from "@/lib/hive/negotiation-core";
import { callOpenAI } from "@/lib/openai";
import {
  ARBOR_ACP_VERSION,
  artifactDataPart,
  dataFromParts,
  negotiateSla,
  textFromParts,
  type AcpMessagePart,
  type AcpSla,
  type AcpSlaRequest,
  type AcpTaskState,
} from "@/lib/acp";
import type { AgentFormat } from "@/lib/toon";
import { didForAgent } from "@/lib/hive/blackboard-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKET_AGENT_ID = "arbor-market";
const verifyInboundCallbackRef = makeFunctionReference<
  "action",
  {
    raw_body: string;
    agent_id?: string;
    timestamp?: string;
    nonce?: string;
    signature?: string;
  },
  | { ok: true; agent_id: string }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
      detail?: string;
    }
>("a2aAuth:verifyInboundCallback");

// ─── JSON-RPC + helpers ──────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface MessageSendParams {
  message?: {
    parts?: AcpMessagePart[];
    /** A2A multi-turn threading: clients echo the contextId we replied with. */
    contextId?: string;
    taskId?: string;
    messageId?: string;
  };
  metadata?: Record<string, unknown>;
}

interface TasksGetParams {
  id?: string;
}

interface TasksCancelParams {
  id?: string;
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}


function promptFromMessage(params: MessageSendParams | undefined): string {
  return textFromParts(params?.message?.parts);
}

function metadataObject(
  params: MessageSendParams | undefined,
): Record<string, unknown> {
  return (params?.metadata ?? {}) as Record<string, unknown>;
}

function slaFromParams(
  params: MessageSendParams | undefined,
): AcpSlaRequest | undefined {
  const raw = metadataObject(params).sla;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  return {
    max_budget:
      typeof value.max_budget === "number" ? value.max_budget : undefined,
    deadline_at:
      typeof value.deadline_at === "number" ? value.deadline_at : undefined,
    max_tokens:
      typeof value.max_tokens === "number" ? value.max_tokens : undefined,
    capabilities: Array.isArray(value.capabilities)
      ? value.capabilities.filter((item): item is string => typeof item === "string")
      : undefined,
    accepted_formats: Array.isArray(value.accepted_formats)
      ? value.accepted_formats.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
  };
}

function intentFromParams(
  params: MessageSendParams | undefined,
): MarketIntent | { error: string } {
  const raw = metadataObject(params).intent;
  if (raw === undefined || raw === null || raw === "") {
    return "post_task";
  }
  if (typeof raw !== "string") {
    return { error: `metadata.intent must be a string, got ${typeof raw}` };
  }
  const normalized = raw.toLowerCase();
  if (normalized in INTENT_TO_TOOL || normalized === NEGOTIATE_INTENT) {
    return normalized as MarketIntent;
  }
  return {
    error: `unknown intent "${raw}"; supported: ${[...Object.keys(INTENT_TO_TOOL), NEGOTIATE_INTENT].join(", ")}`,
  };
}

function argsForIntent(
  intent: ToolBackedIntent,
  params: MessageSendParams | undefined,
): Record<string, unknown> {
  const meta = metadataObject(params);
  const rawParams = meta.params;
  const metadataParams: Record<string, unknown> =
    rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};
  const metaParams = {
    ...(dataFromParts(params?.message?.parts) ?? {}),
    ...metadataParams,
  };

  if (intent === "post_task") {
    const messageText = promptFromMessage(params);
    const promptFromMeta =
      typeof metaParams.prompt === "string" && metaParams.prompt.trim()
        ? metaParams.prompt
        : undefined;
    const prompt = promptFromMeta ?? messageText;
    // External A2A buyers typically send only message text — post_task
    // requires a numeric max_budget, so default it rather than rejecting
    // every text-only task post.
    const max_budget =
      typeof metaParams.max_budget === "number" ? metaParams.max_budget : 5;
    return {
      ...metaParams,
      ...(prompt ? { prompt } : {}),
      max_budget,
    };
  }

  return metaParams;
}

function jsonRpcError(args: {
  id: string | number | null;
  code: number;
  message: string;
  data?: unknown;
  status?: number;
}) {
  return jsonOk(
    {
      jsonrpc: "2.0",
      id: args.id,
      error: {
        code: args.code,
        message: args.message,
        ...(args.data ? { data: args.data } : {}),
      },
    },
    args.status ?? 200,
  );
}

function makeRunId() {
  return `arbor-a2a-${MARKET_AGENT_ID}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ─── A2A task shapes (inlined; no other A2A route exists yet) ────────────

interface A2ATaskShape {
  id: string;
  kind: "task";
  contextId?: string;
  status: {
    state: AcpTaskState;
    message?: {
      role: string;
      parts: AcpMessagePart[];
    };
  };
  artifacts: Array<{
    name?: string;
    description?: string;
    parts: AcpMessagePart[];
  }>;
  metadata?: Record<string, unknown>;
}

function buildSuccessTask(args: {
  runId: string;
  text: string;
  description: string;
  artifactData?: unknown;
  format: AgentFormat;
  contextId?: string;
  metadata?: Record<string, unknown>;
}): A2ATaskShape {
  return {
    id: args.runId,
    kind: "task",
    ...(args.contextId ? { contextId: args.contextId } : {}),
    status: {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: args.text }],
      },
    },
    artifacts: [
      {
        name: `${MARKET_AGENT_ID}-artifact`,
        description: args.description,
        parts: [
          { kind: "text", text: args.text },
          ...(args.artifactData === undefined
            ? []
            : [artifactDataPart(args.artifactData, args.format)]),
        ],
      },
    ],
    metadata: args.metadata,
  };
}

function buildFailureTask(args: {
  runId: string;
  text: string;
  state?: Extract<AcpTaskState, "failed" | "rejected" | "input-required" | "canceled">;
  contextId?: string;
  metadata?: Record<string, unknown>;
}): A2ATaskShape {
  return {
    id: args.runId,
    kind: "task",
    ...(args.contextId ? { contextId: args.contextId } : {}),
    status: {
      state: args.state ?? "failed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: args.text }],
      },
    },
    artifacts: [],
    metadata: args.metadata,
  };
}

// ─── persistence (best-effort, never breaks the response) ────────────────

function logPersistenceWarning(event: string, runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[a2a-task-runs] persistence warning", {
    event,
    run_id: runId,
    error: message,
  });
}

async function persistRunStart(args: {
  runId: string;
  intent: MarketIntent;
  tool: string;
  prompt: string;
  requesterAgentId?: string;
  requesterDid?: string;
  sla?: AcpSla;
  negotiatedFormat?: AgentFormat;
}) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.start, {
        run_id: args.runId,
        agent_id: MARKET_AGENT_ID,
        intent: args.intent,
        tool: args.tool,
        prompt: args.prompt,
        requester_agent_id: args.requesterAgentId,
        requester_did: args.requesterDid,
        protocol_version: ARBOR_ACP_VERSION,
        sla: args.sla,
        negotiated_format: args.negotiatedFormat,
      })
      .catch((error) => logPersistenceWarning("start", args.runId, error));
  } catch (error) {
    logPersistenceWarning("start", args.runId, error);
  }
}

async function persistRunWorking(runId: string) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.setWorking, { run_id: runId })
      .catch((error) => logPersistenceWarning("set_working", runId, error));
  } catch (error) {
    logPersistenceWarning("set_working", runId, error);
  }
}

async function persistRunComplete(args: { runId: string; artifact: unknown }) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.complete, {
        run_id: args.runId,
        artifact: args.artifact,
      })
      .catch((error) => logPersistenceWarning("complete", args.runId, error));
  } catch (error) {
    logPersistenceWarning("complete", args.runId, error);
  }
}

async function persistRunFailure(args: { runId: string; message: string }) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.fail, {
        run_id: args.runId,
        error_message: args.message,
      })
      .catch((error) => logPersistenceWarning("fail", args.runId, error));
  } catch (error) {
    logPersistenceWarning("fail", args.runId, error);
  }
}

async function persistRunInputRequired(args: { runId: string; message: string }) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.setInputRequired, {
        run_id: args.runId,
        message: args.message,
      })
      .catch((error) =>
        logPersistenceWarning("set_input_required", args.runId, error),
      );
  } catch (error) {
    logPersistenceWarning("set_input_required", args.runId, error);
  }
}

async function persistRunRejected(args: { runId: string; message: string }) {
  try {
    await convex()
      .mutation(api.a2aTaskRuns.reject, {
        run_id: args.runId,
        error_message: args.message,
      })
      .catch((error) => logPersistenceWarning("reject", args.runId, error));
  } catch (error) {
    logPersistenceWarning("reject", args.runId, error);
  }
}

async function persistedRun(runId: string) {
  try {
    return await convex().query(api.a2aTaskRuns.getByRunId, {
      run_id: runId,
    });
  } catch (error) {
    logPersistenceWarning("get_by_run_id", runId, error);
    return null;
  }
}

// ─── conversational negotiation (intent: negotiate) ──────────────────────
//
// A2A never retransmits conversation history, so the gateway keeps its own
// memory keyed by contextId (convex/a2aNegotiations.ts) and echoes that
// contextId on every reply. Without this, a foreign agent's second turn
// would land with no context and get an unrelated post_task response — the
// documented root cause of off-topic/generic A2A replies.

const NEGOTIATION_LLM_TIMEOUT_MS = 12_000;
const NEGOTIATION_MAX_TOKENS = 400;

function negotiationEnabled(): boolean {
  return process.env.ARBOR_A2A_NEGOTIATION_ENABLED !== "false";
}

function makeContextId(): string {
  return `arbor-ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function configuredMaxBudget(): number {
  const parsed = Number(process.env.ARBOR_ACP_MAX_BUDGET ?? "10000");
  return Number.isFinite(parsed) ? parsed : 10000;
}

async function loadNegotiationTurns(
  contextId: string | undefined,
): Promise<NegotiationTurn[]> {
  if (!contextId) return [];
  try {
    const rows = await convex().query(api.a2aNegotiations.listByContext, {
      context_id: contextId,
    });
    return rows.map((row) => ({ role: row.role, text: row.text }));
  } catch (error) {
    logPersistenceWarning("negotiation_list", contextId, error);
    return [];
  }
}

async function persistNegotiationTurn(args: {
  contextId: string;
  role: "counterparty" | "agent";
  text: string;
  requesterAgentId?: string;
}) {
  try {
    await convex().mutation(api.a2aNegotiations.append, {
      context_id: args.contextId,
      role: args.role,
      text: args.text,
      requester_agent_id: args.requesterAgentId,
      intent: NEGOTIATE_INTENT,
    });
  } catch (error) {
    logPersistenceWarning("negotiation_append", args.contextId, error);
  }
}

/** Live roster for grounding — on failure the arbitrator still answers. */
async function negotiationRoster(): Promise<NegotiationRosterEntry[]> {
  try {
    const result = await dispatchTool("list_specialists", {});
    if (!Array.isArray(result)) return [];
    return result
      .filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
      .map((row) => ({
        agent_id: typeof row.agent_id === "string" ? row.agent_id : "",
        one_liner: typeof row.one_liner === "string" ? row.one_liner : undefined,
        capabilities: Array.isArray(row.capabilities)
          ? row.capabilities.filter(
              (cap): cap is string => typeof cap === "string",
            )
          : [],
        cost_baseline:
          typeof row.cost_baseline === "number" ? row.cost_baseline : 0,
        reputation_score:
          typeof row.reputation_score === "number"
            ? row.reputation_score
            : undefined,
        market_ready:
          typeof row.market_ready === "boolean" ? row.market_ready : undefined,
      }))
      .filter((entry) => entry.agent_id);
  } catch {
    return [];
  }
}

async function handleNegotiate(args: {
  rpcId: string | number | null;
  params: MessageSendParams | undefined;
  authenticatedAgentId?: string;
  priorTurns: NegotiationTurn[];
}) {
  const incoming = promptFromMessage(args.params);
  const contextId = args.params?.message?.contextId?.trim() || makeContextId();
  const roster = await negotiationRoster();
  const maxBudget = configuredMaxBudget();

  let replyText: string;
  let llmBacked = true;
  if (incoming.trim()) {
    try {
      replyText = (
        await callOpenAI({
          systemPrompt: buildArbitratorSystemPrompt({
            roster,
            maxBudget,
            intents: INTENT_DESCRIPTIONS,
          }),
          userPrompt: buildNegotiationUserPrompt(args.priorTurns, incoming),
          maxTokens: NEGOTIATION_MAX_TOKENS,
          timeoutMs: NEGOTIATION_LLM_TIMEOUT_MS,
          retries: 0,
          purpose: "agent",
        })
      ).trim();
      if (!replyText) throw new Error("empty negotiation reply");
    } catch {
      // Never surface raw error text to a counterparty agent — degrade to a
      // deterministic, on-topic negotiation turn instead.
      replyText = fallbackNegotiationReply({ roster, maxBudget });
      llmBacked = false;
    }
  } else {
    replyText = fallbackNegotiationReply({ roster, maxBudget });
    llmBacked = false;
  }

  if (incoming.trim()) {
    await persistNegotiationTurn({
      contextId,
      role: "counterparty",
      text: incoming,
      requesterAgentId: args.authenticatedAgentId,
    });
  }
  await persistNegotiationTurn({
    contextId,
    role: "agent",
    text: replyText,
    requesterAgentId: args.authenticatedAgentId,
  });

  // Reply as a Message (not a Task): this is one turn in an ongoing
  // exchange. Clients continue the thread by echoing contextId.
  return jsonOk({
    jsonrpc: "2.0",
    id: args.rpcId,
    result: {
      kind: "message",
      role: "agent",
      messageId: makeRunId(),
      contextId,
      parts: [{ kind: "text", text: replyText }],
      metadata: {
        intent: NEGOTIATE_INTENT,
        market_gateway: true,
        acp_version: ARBOR_ACP_VERSION,
        llm_backed: llmBacked,
        grounded_specialists: roster.length,
        turns_in_context: args.priorTurns.length + (incoming.trim() ? 2 : 1),
      },
    },
  });
}

// ─── handlers ────────────────────────────────────────────────────────────

function summarizeResult(intent: MarketIntent, result: unknown): string {
  if (intent === "discover" && Array.isArray(result)) {
    const ready = result.filter(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        (row as { market_ready?: boolean }).market_ready === true,
    ).length;
    return `discover: ${result.length} specialists (${ready} market_ready)`;
  }
  if (intent === "post_task" && result && typeof result === "object") {
    const r = result as { task_id?: unknown; web_view_url?: unknown };
    if (typeof r.task_id === "string") {
      return `post_task: ${r.task_id}${typeof r.web_view_url === "string" ? ` (${r.web_view_url})` : ""}`;
    }
  }
  if (intent === "get_task" && result && typeof result === "object") {
    const r = result as { task?: { status?: unknown } };
    if (r.task && typeof r.task === "object") {
      const status = (r.task as { status?: unknown }).status;
      if (typeof status === "string") {
        return `get_task: status=${status}`;
      }
    }
  }
  if (intent === "raise_dispute") {
    return `raise_dispute accepted`;
  }
  return `${intent} completed`;
}

async function handleMessageSend(args: {
  rpcId: string | number | null;
  params: MessageSendParams | undefined;
  authenticatedAgentId?: string;
}) {
  const { rpcId, params } = args;
  const intentResult = intentFromParams(params);
  if (typeof intentResult !== "string") {
    return jsonRpcError({
      id: rpcId,
      code: -32602,
      message: intentResult.error,
    });
  }
  const requestedContextId = params?.message?.contextId?.trim() || undefined;

  // Conversational path. Explicit intent:"negotiate" always negotiates; when
  // no intent is given, an ongoing negotiation thread (contextId with stored
  // turns) or clearly conversational text negotiates instead of silently
  // posting a task — foreign agents asking "what would this cost?" get an
  // on-topic arbitrator reply, not "post_task: task_x".
  if (negotiationEnabled()) {
    const rawIntent = metadataObject(params).intent;
    const explicitNegotiate = intentResult === NEGOTIATE_INTENT;
    const intentOmitted =
      rawIntent === undefined || rawIntent === null || rawIntent === "";
    if (explicitNegotiate || intentOmitted) {
      const priorTurns = await loadNegotiationTurns(requestedContextId);
      if (
        explicitNegotiate ||
        looksConversational(promptFromMessage(params), priorTurns.length > 0)
      ) {
        return await handleNegotiate({
          rpcId,
          params,
          authenticatedAgentId: args.authenticatedAgentId,
          priorTurns,
        });
      }
    }
  } else if (intentResult === NEGOTIATE_INTENT) {
    return jsonRpcError({
      id: rpcId,
      code: -32602,
      message:
        "negotiation is disabled on this deployment (ARBOR_A2A_NEGOTIATION_ENABLED=false)",
    });
  }

  const intent = intentResult as ToolBackedIntent;
  const toolName = INTENT_TO_TOOL[intent];
  const toolArgs = argsForIntent(intent, params);
  const runId = makeRunId();
  const promptForRecord =
    intent === "post_task"
      ? typeof toolArgs.prompt === "string"
        ? toolArgs.prompt
        : promptFromMessage(params)
      : JSON.stringify(toolArgs);

  const defaultBudget =
    intent === "post_task" && typeof toolArgs.max_budget === "number"
      ? toolArgs.max_budget
      : undefined;
  const slaDecision = negotiateSla({
    request: slaFromParams(params),
    offeredCapabilities: Object.keys(INTENT_TO_TOOL),
    defaultBudget,
    maxBudget: configuredMaxBudget(),
  });
  const requesterDid = args.authenticatedAgentId
    ? didForAgent(args.authenticatedAgentId)
    : undefined;

  await persistRunStart({
    runId,
    intent,
    tool: toolName,
    prompt: promptForRecord,
    requesterAgentId: args.authenticatedAgentId,
    requesterDid,
    sla: slaDecision.accepted ? slaDecision.sla : undefined,
    negotiatedFormat: slaDecision.accepted
      ? slaDecision.sla.output_format
      : "json",
  });

  if (!slaDecision.accepted) {
    await persistRunRejected({ runId, message: slaDecision.reason });
    return jsonOk({
      jsonrpc: "2.0",
      id: rpcId,
      result: buildFailureTask({
        runId,
        text: `SLA rejected: ${slaDecision.reason}`,
        state: "rejected",
        contextId: requestedContextId,
        metadata: {
          intent,
          acp_version: ARBOR_ACP_VERSION,
          sla_accepted: false,
        },
      }),
    });
  }

  if (intent === "post_task" && !promptForRecord.trim()) {
    const message = "A non-empty task prompt is required before work can begin.";
    await persistRunInputRequired({ runId, message });
    return jsonOk({
      jsonrpc: "2.0",
      id: rpcId,
      result: buildFailureTask({
        runId,
        text: message,
        state: "input-required",
        contextId: requestedContextId,
        metadata: {
          intent,
          acp_version: ARBOR_ACP_VERSION,
          required_input: ["prompt"],
          sla: slaDecision.sla,
        },
      }),
    });
  }

  if (intent === "post_task" && slaDecision.sla.max_budget !== undefined) {
    toolArgs.max_budget = slaDecision.sla.max_budget;
  }

  await persistRunWorking(runId);

  try {
    const result = await dispatchTool(toolName, toolArgs);
    const summary = summarizeResult(intent, result);
    const task = buildSuccessTask({
      runId,
      text: summary,
      description: INTENT_DESCRIPTIONS[intent],
      artifactData: { intent, tool: toolName, result },
      format: slaDecision.sla.output_format,
      contextId: requestedContextId,
      metadata: {
        intent,
        tool: toolName,
        market_gateway: true,
        acp_version: ARBOR_ACP_VERSION,
        requester_did: requesterDid,
        sla: slaDecision.sla,
      },
    });
    await persistRunComplete({ runId, artifact: task });
    return jsonOk({ jsonrpc: "2.0", id: rpcId, result: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const text = [
      `# Arbor market ${intent} failed`,
      "",
      message,
      "",
      `Intent: ${intent}`,
      `Tool: ${toolName}`,
    ].join("\n");
    await persistRunFailure({ runId, message: text });
    return jsonOk({
      jsonrpc: "2.0",
      id: rpcId,
      result: buildFailureTask({
        runId,
        text,
        contextId: requestedContextId,
        metadata: {
          intent,
          tool: toolName,
          market_gateway: true,
          error: message,
        },
      }),
    });
  }
}

async function handleTasksGet(args: {
  rpcId: string | number | null;
  params: TasksGetParams | undefined;
}) {
  const taskId = args.params?.id?.trim();
  if (!taskId) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32602,
      message: "tasks/get requires params.id",
    });
  }
  const row = await persistedRun(taskId);
  if (!row) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32001,
      message: `task ${taskId} not found`,
      status: 404,
    });
  }
  if (row.artifact && typeof row.artifact === "object") {
    return jsonOk({ jsonrpc: "2.0", id: args.rpcId, result: row.artifact });
  }
  const text =
    row.error_message ?? `Task ${row.run_id} is currently ${row.state}.`;
  return jsonOk({
    jsonrpc: "2.0",
    id: args.rpcId,
    result: {
      id: row.run_id,
      kind: "task",
      status: {
        state: row.state,
        message: {
          role: "agent",
          parts: [{ kind: "text", text }],
        },
      },
      artifacts: [],
      metadata: {
        intent: row.intent,
        market_gateway: true,
        acp_version: row.protocol_version ?? ARBOR_ACP_VERSION,
        requester_did: row.requester_did,
        sla: row.sla,
        negotiated_format: row.negotiated_format,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    },
  });
}

async function handleTasksCancel(args: {
  rpcId: string | number | null;
  params: TasksCancelParams | undefined;
}) {
  const taskId = args.params?.id?.trim();
  if (!taskId) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32602,
      message: "tasks/cancel requires params.id",
    });
  }
  const result = await convex().mutation(api.a2aTaskRuns.cancel, {
    run_id: taskId,
  });
  if (!result.ok) {
    return jsonRpcError({
      id: args.rpcId,
      code: -32002,
      message: result.missing
        ? `task ${taskId} not found`
        : `task ${taskId} cannot transition to canceled`,
      status: result.missing ? 404 : 409,
    });
  }
  return jsonOk({
    jsonrpc: "2.0",
    id: args.rpcId,
    result: buildFailureTask({
      runId: taskId,
      text: `Task ${taskId} canceled.`,
      state: "canceled",
      metadata: {
        acp_version: ARBOR_ACP_VERSION,
        scope: "acp_contract",
        underlying_execution_may_continue: true,
      },
    }),
  });
}

// ─── route entry points ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return jsonOk(buildMarketAgentCard(req));
}

export async function POST(req: NextRequest) {
  // Read the raw body up front so HMAC verification can sign exactly what
  // the caller sent (re-stringifying parsed JSON loses key order and would
  // break signatures generated against the wire format).
  const rawBody = await req.text();

  let authenticatedAgentId: string | undefined;
  const hmacRequired = process.env.ARBOR_A2A_HMAC_REQUIRED === "true";
  const hasSignature = Boolean(req.headers.get("X-Arbor-Signature"));
  // Verify every signed request. Unsigned compatibility remains available only
  // when the deployment has not enabled the HMAC-required policy.
  if (hmacRequired || hasSignature) {
    const client = convex();
    const verdict = await client.action(verifyInboundCallbackRef, {
      raw_body: rawBody,
      agent_id: req.headers.get("X-Arbor-Agent") ?? undefined,
      timestamp: req.headers.get("X-Arbor-Timestamp") ?? undefined,
      nonce: req.headers.get("X-Arbor-Nonce") ?? undefined,
      signature: req.headers.get("X-Arbor-Signature") ?? undefined,
    });
    if (!verdict.ok) {
      return new Response(
        JSON.stringify({
          error: verdict.error,
          detail: verdict.detail,
        }),
        {
          status: verdict.status,
          headers: { "content-type": "application/json" },
        },
      );
    }
    authenticatedAgentId = verdict.agent_id;
  }

  let body: JsonRpcRequest;
  try {
    body = rawBody ? (JSON.parse(rawBody) as JsonRpcRequest) : ({} as JsonRpcRequest);
  } catch {
    return jsonRpcError({
      id: null,
      code: -32700,
      message: "invalid JSON body",
      status: 400,
    });
  }
  const rpcId = body.id ?? null;
  const method = body.method ?? "";

  if (method === "message/send" || method === "tasks/send") {
    return await handleMessageSend({
      rpcId,
      params: body.params as MessageSendParams | undefined,
      authenticatedAgentId,
    });
  }
  if (method === "tasks/get") {
    return await handleTasksGet({
      rpcId,
      params: body.params as TasksGetParams | undefined,
    });
  }
  if (method === "tasks/cancel") {
    return await handleTasksCancel({
      rpcId,
      params: body.params as TasksCancelParams | undefined,
    });
  }
  return jsonRpcError({
    id: rpcId,
    code: -32601,
    message: `unsupported A2A method: ${method || "missing"}`,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
