/**
 * A2A-forwarding specialist runner.
 *
 * For specialists with `a2a_endpoint` set (tier:"a2a"), both bid and execute
 * are dispatched to the remote A2A agent via the A2A v0.3.0 JSON-RPC protocol:
 *
 *   1. At bid time, POST `message/send` to the endpoint with a cost-estimate
 *      intent. If the remote cannot honor it, fall back to cfg.cost_baseline.
 *   2. At execute time, POST `message/send` / `tasks/send`, then poll
 *      `tasks/get` until the task reaches a terminal state (completed/failed).
 *      On success, extract text from the first artifact part and return with
 *      provenance { tier:"a2a", live_tools_called:true, endpoint }.
 *      On failure (timeout, network error, remote "failed" state): return a
 *      [FALLBACK] banner with provenance live_tools_called:false, fallback_reason.
 *      No persona-LLM fallback — the auctioneer should pick another bidder.
 *
 * Request/response shapes follow what Arbor's own /api/a2a/market route emits
 * (see app/api/a2a/market/route.ts and convex/a2aTaskRuns.ts).
 */

import { buildTaskContext } from "../campaign-context";
import { callOpenAI } from "../openai";
import { getAuthForEndpoint, fetchAgentCard } from "./a2a-agent-card";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  BidPayload,
  SpecialistOutput,
  SpecialistExecuteResult,
  SpecialistProvenance,
  ProbeResult,
} from "../types";
import { toPublicTier } from "./tiers";

// ─── A2A protocol types ───────────────────────────────────────────────────

export interface A2AMessagePart {
  kind?: "text" | "data";
  type?: string;
  text?: string;
  data?: unknown;
}

interface A2ATaskStatus {
  state: "submitted" | "working" | "completed" | "failed" | "canceled";
  message?: {
    role: string;
    parts: A2AMessagePart[];
  };
}

interface A2AArtifact {
  name?: string;
  description?: string;
  parts: A2AMessagePart[];
}

export interface A2AMessage {
  kind?: "message";
  role?: string;
  parts?: A2AMessagePart[];
  messageId?: string;
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  kind?: "task";
  status: A2ATaskStatus;
  artifacts: A2AArtifact[];
  contextId?: string;
  metadata?: Record<string, unknown>;
}

type A2AResult = A2ATask | A2AMessage | Record<string, unknown>;

interface JsonRpcOk {
  jsonrpc: string;
  id?: string | number | null;
  result: A2AResult;
}

// ─── constants ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1_500;
const POLL_MAX_ATTEMPTS = 40; // up to 60 s
const SEND_TIMEOUT_MS = 15_000;
const POLL_TIMEOUT_MS = 5_000;
const BID_TIMEOUT_MS = 12_000;

// ─── helpers ──────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label}: timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function nextRpcId(): string {
  return `arbor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  for (const part of parts) {
    if (isRecord(part) && typeof part.text === "string" && part.text.trim()) {
      return part.text;
    }
  }
  return "";
}

function taskCandidate(result: A2AResult): unknown {
  return isRecord(result) && "task" in result ? result.task : result;
}

function normalizeTaskResult(result: A2AResult): A2ATask | null {
  const candidate = taskCandidate(result);
  if (!isRecord(candidate)) return null;

  const status = candidate.status;
  const isTask =
    candidate.kind === "task" ||
    (isRecord(status) && typeof status.state === "string");
  if (!isTask || !isRecord(status) || typeof status.state !== "string") {
    return null;
  }

  return {
    ...(candidate as Omit<A2ATask, "artifacts" | "status">),
    kind: "task",
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : typeof candidate.taskId === "string" && candidate.taskId
          ? candidate.taskId
          : nextRpcId(),
    status: status as unknown as A2ATaskStatus,
    artifacts: Array.isArray(candidate.artifacts)
      ? (candidate.artifacts as A2AArtifact[])
      : [],
    metadata: isRecord(candidate.metadata) ? candidate.metadata : undefined,
  };
}

function metadataFromResult(result: A2AResult): Record<string, unknown> {
  const task = normalizeTaskResult(result);
  if (task?.metadata) return task.metadata;
  if (isRecord(result) && isRecord(result.metadata)) return result.metadata;
  return {};
}

function idFromResult(result: A2AResult): string | undefined {
  const task = normalizeTaskResult(result);
  if (task?.id) return task.id;
  if (!isRecord(result)) return undefined;
  const wrapped = isRecord(result.message) ? result.message : undefined;
  for (const candidate of [result, wrapped]) {
    if (!candidate) continue;
    for (const key of ["taskId", "id", "messageId", "contextId"]) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return undefined;
}

function extractTextFromResult(result: A2AResult): string {
  const task = normalizeTaskResult(result);
  if (task) return extractText(task);
  if (!isRecord(result)) return "";
  if (result.kind === "message") return textFromParts(result.parts);
  const wrapped = isRecord(result.message) ? result.message : undefined;
  return textFromParts(wrapped?.parts) || textFromParts(result.parts);
}

function looksLikeDecline(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "i don't help",
    "i cannot help",
    "i can't help",
    "cannot complete",
    "can't complete",
    "outside my",
    "outside our",
    "not supported",
    "unsupported",
    "not able to",
    "unable to",
  ].some((phrase) => lower.includes(phrase));
}

function taskSummary(prompt: string): string {
  return prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function budgetCeiling(prompt: string): number | undefined {
  const match = prompt.match(/Budget ceiling:\s*\$?([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function postJsonRpc(
  endpoint: string,
  method: string,
  params: unknown,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<JsonRpcOk> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextRpcId(),
    method,
    params,
  });
  const res = await withTimeout(
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body,
    }),
    timeoutMs,
    `POST ${method}`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`A2A ${method} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    error?: { message: string };
    result?: A2AResult;
  };
  if (json.error) {
    throw new Error(`A2A JSON-RPC error: ${json.error.message}`);
  }
  if (!("result" in json) || json.result === undefined || json.result === null) {
    throw new Error(`A2A response missing result`);
  }
  return json as JsonRpcOk;
}

/** Poll `tasks/get` until terminal, returning the final A2ATask. */
export async function pollUntilTerminal(
  endpoint: string,
  taskId: string,
  authHeaders: Record<string, string> = {},
): Promise<A2ATask> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(POLL_INTERVAL_MS);
    const rpc = await postJsonRpc(
      endpoint,
      "tasks/get",
      { id: taskId },
      POLL_TIMEOUT_MS,
      authHeaders,
    );
    const task = normalizeTaskResult(rpc.result);
    if (!task) {
      throw new Error(`A2A tasks/get response was not task-shaped`);
    }
    const state = task.status.state;
    if (state === "completed" || state === "failed") {
      return task;
    }
    // submitted / working → keep polling
  }
  throw new Error(`A2A task ${taskId} did not reach terminal state after ${POLL_MAX_ATTEMPTS} polls`);
}

/** Extract readable text from the first artifact, falling back to status message. */
export function extractText(task: A2ATask): string {
  for (const artifact of task.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  // fall back to status message parts
  for (const part of task.status.message?.parts ?? []) {
    if (typeof part.text === "string" && part.text.trim()) {
      return part.text;
    }
  }
  return JSON.stringify(task.status);
}

// ─── factory ──────────────────────────────────────────────────────────────

export function makeA2aForwardingSpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  if (!config.a2a_endpoint) {
    throw new Error(
      `makeA2aForwardingSpecialist requires a2a_endpoint on ${config.agent_id}`,
    );
  }
  const endpoint = config.a2a_endpoint;

  /**
   * Bid plans must be task-specific. Preferred source is the remote agent's
   * own reply to the cost_estimate message; when the remote gives no usable
   * text, Arbor drafts a plan from the agent card and says so in the claim —
   * a live endpoint with a labeled draft plan, never a fabricated quote.
   */
  async function draftPlanFromCard(
    prompt: string,
    taskType: string,
  ): Promise<{ claim: string; source: "llm" | "baseline" }> {
    // Never pay for an LLM call per discovered corpus endpoint. For those
    // agents, use a deterministic, labeled card-derived plan so live but
    // message-only A2A responders can still participate in the auction without
    // pretending the remote agent authored the plan.
    if (config.discovered) {
      const capabilities = config.capabilities.slice(0, 4).join(", ");
      const summary = taskSummary(prompt) || taskType;
      return {
        claim:
          `1. Check the request "${summary}" against ${config.display_name}'s declared A2A capabilities (${capabilities || "general A2A response"}). ` +
          `2. Call the live A2A endpoint and use the closest matching capability to collect a text or structured response for this task. ` +
          `3. Return the useful result plus any limitation if the agent can only cover part of the request.\n\n` +
          `[Plan drafted by Arbor from ${config.display_name}'s agent card — endpoint verified live; plan not authored by the remote agent.]`,
        source: "baseline",
      };
    }
    try {
      const text = await callOpenAI({
        systemPrompt: `You draft a brief execution plan on behalf of "${config.display_name}" (${config.one_liner ?? ""}), whose declared capabilities are: ${config.capabilities.join(", ")}. Write 2-4 numbered steps for how an agent with exactly those capabilities would complete the user's task — name the task's actual subject matter. 2-3 sentences total. Plain text, no preamble. If the task is clearly outside those capabilities, still describe the closest in-scope contribution.`,
        userPrompt: buildTaskContext(prompt, taskType),
        maxTokens: 220,
        timeoutMs: 6_000,
        retries: 0,
        purpose: "agent",
      });
      const plan = text.trim();
      if (plan.length >= 40) {
        return {
          claim: `${plan.slice(0, 600)}\n\n[Plan drafted by Arbor from ${config.display_name}'s agent card — endpoint verified live; plan not authored by the remote agent.]`,
          source: "llm",
        };
      }
    } catch {
      // fall through to the static baseline claim
    }
    return {
      claim: `${config.display_name} via A2A at ${endpoint}`,
      source: "baseline",
    };
  }

  function fallbackBidPrice(prompt: string): number {
    const ceiling = budgetCeiling(prompt);
    if (!ceiling || !config.discovered) return config.cost_baseline;
    // Imported A2A corpus rows often have a conservative placeholder baseline.
    // If the live agent did not quote a cost, keep the fallback under the
    // buyer's ceiling so the responder can still compete.
    return Math.max(0.01, Number(Math.min(config.cost_baseline, ceiling * 0.8).toFixed(2)));
  }

  return {
    config,

    async bid(prompt, taskType): Promise<SpecialistDecision> {
      // Discover auth requirements from the agent card before sending any
      // request. Fail closed: if the card is unreachable or auth is unsatisfied,
      // decline immediately — never send an auth-less request at an endpoint
      // that requires auth (that's what this work is designed to prevent).
      let auth;
      try {
        auth = await getAuthForEndpoint(endpoint, config);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          decline: true,
          reason: `agent card unreachable: ${reason.slice(0, 200)}`,
        };
      }
      if (auth.kind === "decline") {
        return { decline: true, reason: auth.reason };
      }

      // Build auth headers for outbound requests.
      const authHeaders: Record<string, string> =
        auth.kind === "bearer"
          ? { Authorization: `Bearer ${auth.token}` }
          : auth.kind === "api-key"
            ? { [auth.headerName]: auth.token }
            : {};

      // Send a cost-estimate intent that also asks the remote to outline its
      // plan. If the remote doesn't understand it or fails, we fall back to
      // cfg.cost_baseline (price) and a labeled Arbor-drafted plan (claim).
      const context = buildTaskContext(prompt, taskType);
      const bidMessageText = `${context}\n\nThis is a bid request, not the task itself. Reply with a brief numbered plan (2-4 steps) describing exactly how you would complete this task. If you can, also set metadata.cost_estimate (number, USD) and metadata.estimated_seconds (integer) in your response.`;
      try {
        const rpc = await withTimeout(
          postJsonRpc(
            endpoint,
            "message/send",
            {
              // role/messageId/kind are required by spec-strict A2A servers
              // (the official Python SDK rejects messages without them).
              message: {
                role: "user",
                parts: [{ kind: "text", text: bidMessageText }],
                messageId: nextRpcId(),
                kind: "message",
              },
              metadata: {
                intent: "cost_estimate",
                agent_id: config.agent_id,
              },
            },
            BID_TIMEOUT_MS,
            authHeaders,
          ),
          BID_TIMEOUT_MS,
          "a2a-bid",
        );
        // If the remote completed and gave us a numeric cost in metadata, use it.
        const meta = metadataFromResult(rpc.result);
        const remoteCost =
          typeof meta.cost_estimate === "number" ? meta.cost_estimate : null;
        const bidPrice = remoteCost ?? fallbackBidPrice(prompt);
        // Prefer the remote agent's own reply text as the plan. extractText
        // falls back to JSON.stringify(status) — a "{"-prefixed string is not
        // a plan, so treat it as missing and draft a labeled one instead.
        const remotePlan = extractTextFromResult(rpc.result).trim();
        if (remotePlan && looksLikeDecline(remotePlan)) {
          return {
            decline: true,
            reason: remotePlan.slice(0, 220),
          };
        }
        const hasRemotePlan =
          remotePlan.length >= 40 && !remotePlan.startsWith("{");
        const drafted = hasRemotePlan
          ? null
          : await draftPlanFromCard(prompt, taskType);
        const bid: BidPayload = {
          bid_price: bidPrice,
          capability_claim: hasRemotePlan
            ? remotePlan.slice(0, 700)
            : drafted!.claim,
          estimated_seconds: typeof meta.estimated_seconds === "number"
            ? (meta.estimated_seconds as number)
            : 30,
          plan_source: hasRemotePlan ? "remote" : drafted!.source,
        };
        return bid;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // A JSON-RPC application error means the agent is alive but doesn't
        // support the optional cost_estimate intent — bid at cost_baseline
        // (the header contract: "If the remote cannot honor it, fall back").
        if (reason.startsWith("A2A JSON-RPC error")) {
          const drafted = await draftPlanFromCard(prompt, taskType);
          return {
            bid_price: fallbackBidPrice(prompt),
            capability_claim: drafted.claim,
            estimated_seconds: 30,
            plan_source: drafted.source,
          };
        }
        // Network/HTTP/timeout → decline cleanly so the auctioneer can route
        // elsewhere. Do NOT fall through to mock.
        return {
          decline: true,
          reason: `A2A endpoint unreachable during bid: ${reason.slice(0, 200)}`,
        };
      }
    },

    async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
      // Defensive: resolve auth again (module cache makes this essentially free
      // on the second call). If bid somehow declined and execute is still reached,
      // return a clear fallback rather than blasting an auth-less request.
      let auth;
      try {
        auth = await getAuthForEndpoint(endpoint, config);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const provenance: SpecialistProvenance = {
          tier: toPublicTier(config.tier),
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          fallback_reason: `agent card unreachable: ${reason.slice(0, 300)}`,
          endpoint,
        };
        return {
          output: `[FALLBACK — auth not satisfied]\n\nagent card unreachable: ${reason}`,
          provenance,
        };
      }
      if (auth.kind === "decline") {
        const provenance: SpecialistProvenance = {
          tier: toPublicTier(config.tier),
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          fallback_reason: `auth: ${auth.reason}`,
          endpoint,
        };
        return {
          output: `[FALLBACK — auth not satisfied]\n\n${auth.reason}`,
          provenance,
        };
      }

      const authHeaders: Record<string, string> =
        auth.kind === "bearer"
          ? { Authorization: `Bearer ${auth.token}` }
          : auth.kind === "api-key"
            ? { [auth.headerName]: auth.token }
            : {};

      const taskContext = buildTaskContext(prompt, taskType);
      // Record both JSON-RPC legs through the auctioneer's tool recorder so
      // A2A executions produce real receipts (external session id, observed
      // events, artifact hash) — same audit trail as MCP-forwarding runners.
      const recorder = context?.toolRecorder;

      let taskId: string | undefined;
      let finalTask: A2ATask | undefined;
      try {
        const send = () =>
          postJsonRpc(
            endpoint,
            "message/send",
            {
              message: {
                role: "user",
                parts: [{ kind: "text", text: taskContext }],
                messageId: nextRpcId(),
                kind: "message",
              },
              metadata: {
                intent: "post_task",
                agent_id: config.agent_id,
              },
            },
            SEND_TIMEOUT_MS,
            authHeaders,
          );
        const sendRpc = recorder
          ? await recorder.record(
              {
                agent_id: config.agent_id,
                phase: "execute",
                transport: "a2a",
                provider: config.sponsor,
                endpoint,
                method: "message/send",
                tool_name: "message/send",
                arguments: { intent: "post_task", task_type: taskType },
              },
              send,
              (rpc) => ({
                ok: true,
                result_preview: extractTextFromResult(rpc.result).slice(0, 300),
                external_session_id: idFromResult(rpc.result),
                external_task_id: idFromResult(rpc.result),
              }),
            )
          : await send();
        const initialTask = normalizeTaskResult(sendRpc.result);
        if (initialTask) {
          const state = initialTask.status.state;
          const terminal =
            state === "completed" || state === "failed" || state === "canceled";
          if (terminal) {
            finalTask = initialTask;
          } else {
            taskId = initialTask.id;
          }
        } else {
          const replyText = extractTextFromResult(sendRpc.result).trim();
          if (replyText) {
            const responseId = idFromResult(sendRpc.result) ?? nextRpcId();
            const provenance: SpecialistProvenance = {
              tier: toPublicTier(config.tier),
              live_tools_called: true,
              transport: "a2a",
              proof_level: "agent_session",
              external_session_id: responseId,
              external_task_id: responseId,
              endpoint,
            };
            return { output: replyText, provenance };
          }
          throw new Error("A2A response was neither task-shaped nor message-shaped");
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const provenance: SpecialistProvenance = {
          tier: toPublicTier(config.tier),
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          fallback_reason: `task send failed: ${reason.slice(0, 300)}`,
          endpoint,
        };
        const output: SpecialistOutput =
          `[FALLBACK — A2A endpoint unreachable]\n\nCould not send task to ${endpoint}: ${reason}`;
        return { output, provenance };
      }

      // Poll until terminal state. Recorded as a single tasks/get leg whose
      // outcome reflects the remote task's terminal state.
      if (!finalTask) {
        if (!taskId) {
          throw new Error("A2A task id missing after message/send");
        }
        try {
          const poll = () =>
            withTimeout(
              pollUntilTerminal(endpoint, taskId, authHeaders),
              POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS + POLL_TIMEOUT_MS + 2_000,
              "a2a-poll",
            );
          finalTask = recorder
            ? await recorder.record(
                {
                  agent_id: config.agent_id,
                  phase: "execute",
                  transport: "a2a",
                  provider: config.sponsor,
                  endpoint,
                  method: "tasks/get",
                  tool_name: "tasks/get",
                  call_id: taskId,
                },
                poll,
                (t) => ({
                  ok: t.status.state === "completed",
                  result_preview: extractText(t).slice(0, 300),
                  error_message:
                    t.status.state === "failed"
                      ? extractText(t).slice(0, 300)
                      : undefined,
                  external_session_id: taskId,
                  external_task_id: taskId,
                }),
              )
            : await poll();
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          const provenance: SpecialistProvenance = {
            tier: toPublicTier(config.tier),
            live_tools_called: false,
            transport: "a2a",
            proof_level: "none",
            external_task_id: taskId,
            fallback_reason: `poll timeout or error: ${reason.slice(0, 300)}`,
            endpoint,
          };
          const output: SpecialistOutput =
            `[FALLBACK — A2A endpoint unreachable]\n\nTask ${taskId} did not complete: ${reason}`;
          return { output, provenance };
        }
      }

      // Terminal state reached. Check success vs failure.
      if (finalTask.status.state === "failed") {
        const errorText = extractText(finalTask);
        const provenance: SpecialistProvenance = {
          tier: toPublicTier(config.tier),
          live_tools_called: false,
          transport: "a2a",
          proof_level: "none",
          external_task_id: taskId,
          fallback_reason: `remote task failed: ${errorText.slice(0, 200)}`,
          endpoint,
        };
        const output: SpecialistOutput =
          `[FALLBACK — A2A endpoint unreachable]\n\nRemote task ${taskId} failed: ${errorText}`;
        return { output, provenance };
      }

      // Completed successfully.
      const text = extractText(finalTask);
      const provenance: SpecialistProvenance = {
        tier: toPublicTier(config.tier),
        live_tools_called: true,
        transport: "a2a",
        proof_level: "agent_session",
        external_session_id: taskId,
        external_task_id: taskId,
        endpoint,
      };
      return { output: text, provenance };
    },

    async probe(taskType: string): Promise<ProbeResult> {
      const t0 = Date.now();

      // Step 1: Fetch agent card
      let card: Awaited<ReturnType<typeof fetchAgentCard>>;
      try {
        card = await fetchAgentCard(endpoint, config.a2a_agent_card_url);
      } catch (err) {
        return {
          status: "fail",
          duration_ms: Date.now() - t0,
          error_message: String((err as Error)?.message ?? err),
        };
      }

      // Step 2: Skill overlap check (deterministic, no LLM)
      const STOPWORDS = new Set(["general", "task", "the", "a", "for", "with", "to", "of"]);
      const lowerType = taskType.toLowerCase();
      const tokens = lowerType
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 0 && !STOPWORDS.has(t));

      interface AgentSkill {
        id?: string;
        name?: string;
        tags?: string[];
        description?: string;
      }
      const skills = (card.skills ?? []) as AgentSkill[];

      // If skills are declared, check overlap. Empty/missing skills → skip check.
      if (skills.length > 0 && lowerType !== "general") {
        const haystack = skills
          .map((s) =>
            [s.id ?? "", s.name ?? "", ...(s.tags ?? []), (s.description ?? "").slice(0, 200)]
              .join(" ")
              .toLowerCase(),
          )
          .join(" ");

        const hasOverlap = tokens.some((token) => haystack.includes(token));
        if (!hasOverlap) {
          return {
            status: "fail",
            duration_ms: Date.now() - t0,
            error_message: `skill mismatch: ${taskType} not declared by agent`,
            response_excerpt: JSON.stringify(skills).slice(0, 300),
          };
        }
      }

      // Step 3: Send a small probe ping
      const probeId = `probe-${Date.now()}`;
      const messageId = `msg-${Date.now()}`;
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: probeId,
        method: "message/send",
        params: {
          message: {
            role: "user",
            parts: [{ kind: "text", text: "probe" }],
            messageId,
          },
          metadata: { intent: "probe" },
        },
      });

      try {
        const authResult = await getAuthForEndpoint(endpoint, config);
        const authHeaders: Record<string, string> =
          authResult.kind === "bearer"
            ? { Authorization: `Bearer ${authResult.token}` }
            : authResult.kind === "api-key"
              ? { [authResult.headerName]: authResult.token }
              : {};

        // 12s: probe runs concurrently with the bid leg, so a generous cap
        // costs no wall-clock. LLM-backed agents (LangGraph currency sample)
        // run their full graph even on a probe ping and routinely exceed 8s.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);

        let res: Response;
        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", ...authHeaders },
            body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "(no body)");
          return {
            status: "fail",
            duration_ms: Date.now() - t0,
            error_message: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          };
        }

        const json = await res.json();
        const response_excerpt = JSON.stringify(json).slice(0, 300);
        return { status: "pass", duration_ms: Date.now() - t0, response_excerpt };
      } catch (err) {
        return {
          status: "fail",
          duration_ms: Date.now() - t0,
          error_message: String((err as Error)?.message ?? err),
        };
      }
    },
  };
}
