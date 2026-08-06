// External-agent connector: network backends. Thin I/O wrappers — every
// parse/compose decision lives in connector-core.ts where it is tested.
//
// Each backend returns the external agent's OWN text plus a provenance
// string; a backend that cannot produce real output throws, and the caller
// records the failure without posting anything to the hive.

import {
  buildToolArgs,
  extractMcpText,
  looksLikeErrorText,
  parseSseJson,
  pickTools,
  suggestArgFromError,
  type McpToolInfo,
} from "./connector-core";

export interface BackendReply {
  text: string;
  provenance: string;
  external_id?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── MCP (streamable HTTP) ───────────────────────────────────────────────────

export interface McpCallOptions {
  endpoint: string;
  bearer?: string;
  /** Tool names in preference order; first match on the server wins. */
  toolPreference: string[];
  /** Exact args for a known tool; fall back to schema-driven synthesis. */
  argsFor?: (tool: McpToolInfo, query: string) => Record<string, unknown>;
  query: string;
  timeoutMs?: number;
}

interface McpSession {
  endpoint: string;
  headers: Record<string, string>;
  nextId: number;
}

async function mcpRpc(
  session: McpSession,
  method: string,
  params: Record<string, unknown> | undefined,
  timeoutMs: number,
  options?: { notification?: boolean },
): Promise<unknown> {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params !== undefined) body.params = params;
  if (!options?.notification) body.id = session.nextId++;
  const response = await fetchWithTimeout(
    session.endpoint,
    {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) session.headers["mcp-session-id"] = sessionId;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `MCP ${method} failed ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  if (options?.notification || !text.trim()) return null;
  return parseSseJson(text);
}

export async function callMcpAgent(
  options: McpCallOptions,
): Promise<BackendReply> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const session: McpSession = {
    endpoint: options.endpoint,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(options.bearer
        ? { authorization: `Bearer ${options.bearer}` }
        : {}),
    },
    nextId: 1,
  };

  await mcpRpc(
    session,
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "arbor-hive-connector", version: "1.0.0" },
    },
    timeoutMs,
  );
  await mcpRpc(session, "notifications/initialized", {}, timeoutMs, {
    notification: true,
  }).catch(() => null);

  const listed = (await mcpRpc(session, "tools/list", {}, timeoutMs)) as {
    result?: { tools?: McpToolInfo[] };
  };
  const tools = listed?.result?.tools ?? [];
  const candidates = pickTools(tools, options.toolPreference);
  if (candidates.length === 0) {
    throw new Error(`MCP server at ${options.endpoint} lists no tools`);
  }

  // Fall through the server's callable tools: one tool demanding arguments we
  // cannot synthesize does not mean the agent is unreachable, and most of
  // these servers publish several.
  const failures: string[] = [];
  for (const tool of candidates) {
    const buildArgs = (query: string) =>
      options.argsFor
        ? options.argsFor(tool, query)
        : buildToolArgs(tool.inputSchema, query);

    let called = await mcpRpc(
      session,
      "tools/call",
      { name: tool.name, arguments: buildArgs(options.query) },
      timeoutMs,
    ).catch((err: Error) => {
      failures.push(`${tool.name}: ${err.message.slice(0, 80)}`);
      return null;
    });
    if (called === null) continue;
    let text = extractMcpText(called);

    // Error-guided retry: when a server rejects the query but names what it
    // wanted, ask again with its own suggestion. One retry per tool — a
    // second rejection means move on rather than keep guessing.
    const errored =
      Boolean((called as { result?: { isError?: boolean } })?.result?.isError) ||
      (text ? looksLikeErrorText(text) : false);
    if (errored) {
      const suggestion = suggestArgFromError(text, options.query);
      if (suggestion) {
        const retried = await mcpRpc(
          session,
          "tools/call",
          { name: tool.name, arguments: buildArgs(suggestion) },
          timeoutMs,
        ).catch(() => null);
        const retriedText = retried ? extractMcpText(retried) : "";
        if (retriedText && !looksLikeErrorText(retriedText)) {
          called = retried;
          text = retriedText;
        }
      }
    }

    const stillError =
      Boolean((called as { result?: { isError?: boolean } })?.result?.isError) ||
      (text ? looksLikeErrorText(text) : false);
    if (!text || stillError) {
      failures.push(
        `${tool.name}: ${text ? text.slice(0, 60) : "no text content"}`,
      );
      continue;
    }
    return {
      text,
      provenance: `real tool-backed: MCP tools/call ${tool.name} @ ${options.endpoint}`,
    };
  }

  throw new Error(
    `MCP server ${options.endpoint} returned no usable output from ${candidates.length} tool(s): ${failures.join(" | ").slice(0, 200)}`,
  );
}

// ── Devin (Cognition) sessions API ──────────────────────────────────────────

const DEVIN_BASE = "https://api.devin.ai/v1";

interface DevinMessage {
  type?: string;
  message?: string;
}

interface DevinSession {
  session_id?: string;
  status_enum?: string;
  messages?: DevinMessage[];
}

async function devinGet(
  apiKey: string,
  sessionId: string,
  timeoutMs: number,
): Promise<DevinSession> {
  const response = await fetchWithTimeout(
    `${DEVIN_BASE}/session/${sessionId}`,
    { headers: { authorization: `Bearer ${apiKey}` } },
    timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`Devin session fetch failed ${response.status}`);
  }
  return (await response.json()) as DevinSession;
}

function devinMessageCount(session: DevinSession): number {
  return (session.messages ?? []).filter((m) => m.type === "devin_message")
    .length;
}

function latestDevinMessage(session: DevinSession): string {
  const devinMessages = (session.messages ?? []).filter(
    (m) => m.type === "devin_message" && m.message?.trim(),
  );
  return devinMessages[devinMessages.length - 1]?.message?.trim() ?? "";
}

/**
 * One Devin session hosts the whole roundtable conversation: the first call
 * creates it, later rounds post follow-up messages, and each call waits for a
 * NEW devin_message (or a terminal/blocked status) before returning.
 */
export async function callDevin(options: {
  apiKey: string;
  message: string;
  sessionId?: string;
  timeoutMs?: number;
}): Promise<BackendReply & { sessionId: string }> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeoutMs;
  let sessionId = options.sessionId;
  let baselineCount = 0;

  if (!sessionId) {
    const response = await fetchWithTimeout(
      `${DEVIN_BASE}/sessions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: options.message,
          idempotent: false,
          title: "Arbor hive roundtable",
        }),
      },
      60_000,
    );
    if (!response.ok) {
      throw new Error(
        `Devin session create failed ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    const created = (await response.json()) as DevinSession;
    if (!created.session_id) throw new Error("Devin returned no session_id");
    sessionId = created.session_id;
  } else {
    const before = await devinGet(options.apiKey, sessionId, 30_000);
    baselineCount = devinMessageCount(before);
    const response = await fetchWithTimeout(
      `${DEVIN_BASE}/session/${sessionId}/message`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: options.message }),
      },
      60_000,
    );
    if (!response.ok) {
      throw new Error(`Devin message send failed ${response.status}`);
    }
  }

  // Poll until Devin says something new. "blocked" means Devin is waiting on
  // us — by then its reply is in the transcript.
  let last: DevinSession | null = null;
  while (Date.now() < deadline) {
    await sleep(12_000);
    last = await devinGet(options.apiKey, sessionId, 30_000);
    const count = devinMessageCount(last);
    const status = last.status_enum ?? "";
    if (count > baselineCount || ["blocked", "stopped", "finished"].includes(status)) {
      const text = latestDevinMessage(last);
      if (text && count > baselineCount) {
        return {
          text,
          provenance: `real agent session: Devin API session ${sessionId}`,
          external_id: sessionId,
          sessionId,
        };
      }
      if (["blocked", "stopped", "finished"].includes(status) && text) {
        return {
          text,
          provenance: `real agent session: Devin API session ${sessionId} (status ${status})`,
          external_id: sessionId,
          sessionId,
        };
      }
    }
  }
  throw new Error(
    `Devin session ${sessionId} produced no new message within ${timeoutMs}ms (status ${last?.status_enum ?? "unknown"})`,
  );
}

// ── v0 (Vercel) Platform API ────────────────────────────────────────────────

const V0_BASE = "https://api.v0.dev/v1";

interface V0Chat {
  id?: string;
  text?: string;
  latestVersion?: { status?: string; demoUrl?: string; files?: unknown[] };
  latest_version?: { status?: string; demo_url?: string; files?: unknown[] };
}

function v0Text(chat: V0Chat): string {
  if (chat.text?.trim()) return chat.text.trim();
  const version = chat.latestVersion ?? chat.latest_version;
  const demo =
    (chat.latestVersion?.demoUrl ?? chat.latest_version?.demo_url) || "";
  const files = version?.files?.length ?? 0;
  if (files > 0 || demo) {
    return [
      `Generated ${files} file(s) for the requested UI slice.`,
      demo ? `Live demo: ${demo}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export async function callV0(options: {
  apiKey: string;
  message: string;
  chatId?: string;
  timeoutMs?: number;
}): Promise<BackendReply & { chatId: string }> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const headers = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
  };
  const url = options.chatId
    ? `${V0_BASE}/chats/${options.chatId}/messages`
    : `${V0_BASE}/chats`;
  const response = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify({ message: options.message }) },
    120_000,
  );
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`v0 API ${response.status}: ${bodyText.slice(0, 200)}`);
  }
  const initial = (bodyText ? JSON.parse(bodyText) : {}) as V0Chat;
  const chatId = options.chatId ?? initial.id;
  if (!chatId) throw new Error("v0 returned no chat id");

  let text = v0Text(initial);
  const deadline = Date.now() + timeoutMs;
  while (!text && Date.now() < deadline) {
    await sleep(5_000);
    const poll = await fetchWithTimeout(
      `${V0_BASE}/chats/${chatId}`,
      { headers: { authorization: `Bearer ${options.apiKey}` } },
      30_000,
    );
    if (!poll.ok) continue;
    text = v0Text((await poll.json()) as V0Chat);
  }
  if (!text) throw new Error(`v0 chat ${chatId} produced no reply in time`);
  return {
    text,
    provenance: `real generation API: v0 chat ${chatId}`,
    external_id: chatId,
    chatId,
  };
}

// ── Hyperspell (YC F25) memory agent ────────────────────────────────────────

/**
 * Hyperspell participates as the hive's durable-memory agent: each round it
 * WRITES the board digest into Hyperspell as a memory, then QUERIES the
 * memory store for the round's question. Both are real API calls against the
 * held key; the message reports what the memory layer actually did and
 * recalled, never a fabricated opinion.
 */
export async function callHyperspell(options: {
  round: number;
  goal: string;
  digest: string;
  query: string;
}): Promise<BackendReply> {
  const { addMemory, searchMemories } = await import("../hyperspell");
  const userId = process.env.HYPERSPELL_USER_ID?.trim() || "arbor-hive";
  const stored = await addMemory({
    userId,
    title: `hive roundtable round ${options.round}`,
    collection: "arbor-hive-roundtable",
    text: `Objective: ${options.goal}\n\nBoard digest:\n${options.digest || "(empty board)"}`,
  });
  const recalled = await searchMemories({
    userId,
    query: options.query,
    answer: true,
    maxResults: 5,
  });
  const answer =
    (recalled as { answer?: string }).answer?.trim() ??
    (recalled as { data?: { answer?: string } }).data?.answer?.trim();
  const docCount =
    (recalled as { documents?: unknown[] }).documents?.length ??
    (recalled as { data?: { documents?: unknown[] } }).data?.documents?.length ??
    0;
  const storedId =
    (stored as { resource_id?: string }).resource_id ??
    (stored as { data?: { resource_id?: string } }).data?.resource_id ??
    "ok";
  const text = answer
    ? `Memory recall on "${options.query.slice(0, 90)}": ${answer}\n(I also archived this round's board as durable memory ${storedId}.)`
    : `I archived this round's board digest as durable memory ${storedId} in collection arbor-hive-roundtable; recall for "${options.query.slice(0, 90)}" returned ${docCount} stored documents so far. My slice: I keep the roundtable's decisions durable and queryable across sessions.`;
  return {
    text,
    provenance: `real memory API: Hyperspell add+query (collection arbor-hive-roundtable)`,
    external_id: typeof storedId === "string" ? storedId : undefined,
  };
}

// ── OpenAI-compatible proxy (LiteLLM and friends) ───────────────────────────

export async function callOpenAICompat(options: {
  baseUrl: string;
  model: string;
  system: string;
  prompt: string;
  bearer?: string;
  timeoutMs?: number;
}): Promise<BackendReply> {
  const response = await fetchWithTimeout(
    `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 400,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.prompt },
        ],
      }),
    },
    options.timeoutMs ?? 120_000,
  );
  if (!response.ok) {
    throw new Error(
      `openai-compat ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("openai-compat endpoint returned no content");
  return {
    text,
    provenance: `gateway-backed persona: ${options.model} via OpenAI-compatible proxy at ${options.baseUrl}`,
  };
}

// ── local Ollama persona (labeled, never counted as external) ───────────────

export async function callOllamaPersona(options: {
  model: string;
  system: string;
  prompt: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<BackendReply> {
  const base = options.baseUrl ?? "http://localhost:11434";
  const response = await fetchWithTimeout(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        options: { temperature: 0.4 },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.prompt },
        ],
      }),
    },
    options.timeoutMs ?? 120_000,
  );
  if (!response.ok) {
    throw new Error(`ollama ${response.status}`);
  }
  const data = (await response.json()) as { message?: { content?: string } };
  const text = data.message?.content?.trim();
  if (!text) throw new Error("ollama returned an empty message");
  return {
    text,
    provenance: `local-llm persona (${options.model}) — NOT an external agent`,
  };
}
