// External-agent connector: pure helpers.
//
// The connector lets agents that are NOT OpenRouter models participate in a
// hive discussion. Each roster agent is backed by a real external surface —
// an agent-session API (Devin), a generation API (v0), or a hosted MCP server
// (Nia, DeepWiki, Context7, and any YC-sweep additions) — and speaks to the
// hive through the signed public blackboard write (scratchpadActions.
// writeSigned). Nothing in this module performs I/O: prompt construction,
// MCP payload parsing, tool-arg synthesis, HMAC arg assembly, and message
// counting are all pure so they are testable without network access.

import { canonicalString, computeSignature } from "../a2a-hmac";

// ── rounds ──────────────────────────────────────────────────────────────────

export type ConnectorPhase = "propose" | "negotiate" | "decide";

export interface RoundSpec {
  round: number;
  phase: ConnectorPhase;
  /** Blackboard kind every write in this round uses. Worker-writable only. */
  kind: "proposal" | "question" | "decision";
  instruction: string;
}

/**
 * Three rounds: open proposals, negotiation (challenges and counter-offers),
 * final commitments. Kinds are restricted to what a worker-role agent may
 * write — critique and consensus are gated to reviewer/control rows, and the
 * roster registers everyone as a worker by default.
 */
export const ROUNDS: readonly RoundSpec[] = [
  {
    round: 1,
    phase: "propose",
    kind: "proposal",
    instruction:
      "Post your opening proposal: the slice of the objective you will own " +
      "given your real capabilities, your concrete approach, and the price " +
      "in USD you ask for that slice.",
  },
  {
    round: 2,
    phase: "negotiate",
    kind: "question",
    instruction:
      "Negotiate: respond to the other agents' proposals. Say where you " +
      "agree or disagree on the division of labor, flag overlaps with your " +
      "slice, make a counter-offer if a price looks wrong, and ask one " +
      "pointed question another agent should answer.",
  },
  {
    round: 3,
    phase: "decide",
    kind: "decision",
    instruction:
      "Final round: state what you commit to deliver, which other agents' " +
      "slices you depend on, and your final price. Be specific enough that " +
      "a coordinator could accept or reject your commitment as written.",
  },
] as const;

export function roundSpec(round: number): RoundSpec {
  const spec = ROUNDS.find((r) => r.round === round);
  if (!spec) throw new Error(`no round spec for round ${round}`);
  return spec;
}

// ── board digest ────────────────────────────────────────────────────────────

export interface BoardEntryLite {
  agent_id: string;
  kind: string;
  content: string;
  gist?: string;
  created_at: number;
}

/**
 * Chronological digest of what OTHER agents have said, for feeding into an
 * external agent's next turn. Own entries are excluded — an agent re-reading
 * its own words crowds out the negotiation. Oldest first so the narrative
 * reads forward. Truncated per entry and capped overall.
 */
export function buildContextDigest(
  entries: BoardEntryLite[],
  selfAgentId: string,
  maxChars = 2600,
): string {
  const others = entries
    .filter((e) => e.agent_id !== selfAgentId)
    .sort((a, b) => a.created_at - b.created_at);
  const lines: string[] = [];
  let used = 0;
  for (const e of others) {
    const body = (e.gist?.trim() || e.content).replace(/\s+/g, " ").trim();
    const line = `- ${e.agent_id} [${e.kind}]: ${body.slice(0, 320)}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

// ── prompts for conversational backends ─────────────────────────────────────

export interface RoundPromptArgs {
  goal: string;
  agentId: string;
  displayName: string;
  sponsor: string;
  capabilities: string[];
  memberIds: string[];
  round: number;
  digest: string;
}

export function buildRoundPrompt(args: RoundPromptArgs): string {
  const spec = roundSpec(args.round);
  const others = args.memberIds.filter((m) => m !== args.agentId);
  const parts = [
    `You are ${args.displayName} (agent id ${args.agentId}, by ${args.sponsor}), ` +
      `one member of a live multi-agent roundtable in the Arbor hive.`,
    `Objective the table is negotiating: ${args.goal}`,
    `Other members: ${others.join(", ")}.`,
    `Your real capabilities: ${args.capabilities.join(", ")}.`,
  ];
  if (args.digest.trim()) {
    parts.push(`The shared board so far (oldest first):\n${args.digest}`);
  }
  parts.push(
    `Round ${spec.round} (${spec.phase}). ${spec.instruction}`,
    "Reply in plain text, under 150 words, no markdown headings. Speak as " +
      "yourself to the other agents, not to a human operator.",
  );
  return parts.join("\n\n");
}

// ── MCP response handling ───────────────────────────────────────────────────

/**
 * Parse a streamable-HTTP MCP response body: either plain JSON or an SSE
 * stream whose `data:` lines carry JSON-RPC messages. Returns the LAST
 * data payload (servers emit progress notifications before the result).
 */
export function parseSseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty MCP response body");
  if (!trimmed.startsWith("event:") && !trimmed.startsWith("data:")) {
    return JSON.parse(trimmed);
  }
  const datas = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (datas.length === 0) throw new Error("SSE body carried no data lines");
  return JSON.parse(datas[datas.length - 1]);
}

interface McpContentBlock {
  type?: string;
  text?: string;
}

/** Join the text blocks of a tools/call result. */
export function extractMcpText(rpcResult: unknown): string {
  const result = (rpcResult as { result?: unknown })?.result ?? rpcResult;
  const content = (result as { content?: McpContentBlock[] })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

export interface McpToolInfo {
  name: string;
  inputSchema?: {
    properties?: Record<string, { type?: string }>;
    required?: string[];
  };
}

/** First preferred tool present on the server, else the first tool at all. */
export function pickTool(
  tools: McpToolInfo[],
  preference: string[],
): McpToolInfo | null {
  for (const want of preference) {
    const hit = tools.find((t) => t.name === want);
    if (hit) return hit;
  }
  return tools[0] ?? null;
}

/**
 * Synthesize arguments for an arbitrary MCP tool from its input schema:
 * every required property gets a type-appropriate value with the query going
 * into required string fields. This is the generic fallback — roster entries
 * for known servers pass exact args instead.
 */
export function buildToolArgs(
  schema: McpToolInfo["inputSchema"],
  query: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = schema?.properties ?? {};
  for (const name of schema?.required ?? []) {
    const type = props[name]?.type;
    if (type === "number" || type === "integer") out[name] = 5;
    else if (type === "boolean") out[name] = false;
    else if (type === "array") out[name] = [query];
    else out[name] = query;
  }
  return out;
}

// ── blackboard entry assembly ───────────────────────────────────────────────

export const BOARD_MESSAGE_MAX_CHARS = 1600;

export function truncateForBoard(
  text: string,
  max = BOARD_MESSAGE_MAX_CHARS,
): string {
  const collapsed = text.trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The message the hive sees: the external agent's own words first (the
 * canvas labels an event with the first line), provenance last. Provenance
 * is mandatory — the product rule is that specialist responses are clearly
 * labeled real tool-backed vs persona, and a roundtable is no exception.
 */
export function composeEntryContent(args: {
  message: string;
  provenance: string;
}): string {
  const body = truncateForBoard(args.message);
  if (!body) throw new Error("refusing to post an empty message");
  return `${body}\n\n[provenance: ${args.provenance}]`;
}

export interface SignedWriteArgs {
  raw_body: string;
  agent_id: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

/**
 * Assemble the exact writeSigned arguments for a blackboard payload. The
 * canonical string is `${raw_body}\n${timestamp}\n${nonce}` with timestamp in
 * UNIX SECONDS (verifyInbound compares against Date.now()/1000).
 */
export function signedWriteArgs(args: {
  payload: Record<string, unknown>;
  agentId: string;
  secretB64: string;
  nowMs: number;
  nonce: string;
}): SignedWriteArgs {
  const raw_body = JSON.stringify(args.payload);
  const timestamp = String(Math.floor(args.nowMs / 1000));
  const signature = computeSignature(
    args.secretB64,
    canonicalString(raw_body, timestamp, args.nonce),
  );
  return {
    raw_body,
    agent_id: args.agentId,
    timestamp,
    nonce: args.nonce,
    signature,
  };
}

// ── verification ────────────────────────────────────────────────────────────

export interface AgentMessageCount {
  agent_id: string;
  messages: number;
  error_messages: number;
}

/**
 * An entry whose body is an error dump rather than an agent utterance.
 * Session 1 proved backends can smuggle errors through as tool RESULTS
 * (Context7 returned "MCP error -32602..." as text content), so the bar
 * check cannot trust "posted" to mean "spoke".
 */
export function looksLikeErrorText(text: string): boolean {
  const first = text.trim().split("\n", 1)[0] ?? "";
  return /^(MCP error|error[:\s]|Input validation error|\{"error")/i.test(
    first,
  );
}

/**
 * Count NON-ERROR board messages per roster agent; error-shaped entries are
 * tallied separately so verify can report them instead of hiding them.
 * Entries from non-roster writers are ignored.
 */
export function countAgentMessages(
  entries: BoardEntryLite[],
  rosterIds: string[],
): AgentMessageCount[] {
  const ok = new Map<string, number>(rosterIds.map((id) => [id, 0]));
  const bad = new Map<string, number>(rosterIds.map((id) => [id, 0]));
  for (const e of entries) {
    if (!ok.has(e.agent_id)) continue;
    const target = looksLikeErrorText(e.content) ? bad : ok;
    target.set(e.agent_id, (target.get(e.agent_id) ?? 0) + 1);
  }
  return rosterIds.map((agent_id) => ({
    agent_id,
    messages: ok.get(agent_id) ?? 0,
    error_messages: bad.get(agent_id) ?? 0,
  }));
}

/** The session bar: at least `minAgents` agents with >= `minMessages` each. */
export function meetsBar(
  counts: AgentMessageCount[],
  minAgents = 5,
  minMessages = 2,
): boolean {
  return counts.filter((c) => c.messages >= minMessages).length >= minAgents;
}
