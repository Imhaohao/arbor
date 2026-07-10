/**
 * Negotiation core for the Arbor market arbitrator.
 *
 * Pure logic (no I/O) behind the A2A conversational/negotiation path:
 * deciding whether an inbound foreign-agent message is a conversation turn
 * rather than a task post, building the arbitrator prompt grounded in the
 * live specialist roster, rendering per-contextId history, and producing a
 * deterministic on-topic fallback reply when no LLM is reachable — a foreign
 * agent must never see raw error text or an unrelated canned response.
 *
 * A2A spec grounding (a2a-protocol.org, "Life of a Task"): the protocol never
 * retransmits conversation history, so the server side MUST keep its own
 * memory keyed by contextId and echo that contextId on every reply. The
 * storage lives in convex/a2aNegotiations.ts; this module only shapes turns.
 */

export interface NegotiationTurn {
  /** "counterparty" = the remote agent talking to us; "agent" = Arbor. */
  role: "counterparty" | "agent";
  text: string;
}

export interface NegotiationRosterEntry {
  agent_id: string;
  one_liner?: string;
  capabilities: string[];
  cost_baseline: number;
  reputation_score?: number;
  market_ready?: boolean;
}

/** Cap history rendered into the prompt (most recent turns win). */
export const NEGOTIATION_HISTORY_LIMIT = 16;
/** Cap roster entries rendered into the prompt. */
export const NEGOTIATION_ROSTER_LIMIT = 12;
/** Hard cap on any single turn rendered into the prompt. */
const TURN_RENDER_LIMIT = 600;

const CONVERSATIONAL_PATTERNS: RegExp[] = [
  /\?/,
  /\b(hi|hello|hey|greetings)\b/i,
  /\b(price|prices|pricing|cost|costs|quote|rate|rates|fee|fees|budget)\b/i,
  /\b(offer|counter[- ]?offer|discount|negotiate|negotiation|deal|terms|sla)\b/i,
  /\b(bid|bids|bidding|auction)\b/i,
  /\b(capabilit|specialist|roster|who are you|what can you|what do you do|tell me about)\b/i,
  /\b(can you|could you|do you|are you able|how much|how long|how fast|what is|what's)\b/i,
];

/**
 * Should a raw inbound message with NO explicit metadata.intent be treated
 * as a negotiation turn instead of defaulting to post_task?
 *
 * Conservative on purpose: an ongoing thread (hasHistory) always continues
 * the conversation; otherwise only clearly conversational text switches. An
 * ambiguous work brief keeps today's post_task behavior so existing A2A
 * buyers are unaffected.
 */
export function looksConversational(text: string, hasHistory: boolean): boolean {
  if (hasHistory) return true;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Long-form briefs are task posts even when they contain a question mark.
  if (trimmed.length > 1200) return false;
  return CONVERSATIONAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function renderRoster(roster: NegotiationRosterEntry[]): string {
  const ready = roster.filter((entry) => entry.market_ready !== false);
  const pool = (ready.length > 0 ? ready : roster)
    .slice()
    .sort((a, b) => (b.reputation_score ?? 0.5) - (a.reputation_score ?? 0.5))
    .slice(0, NEGOTIATION_ROSTER_LIMIT);
  if (pool.length === 0) return "(roster unavailable this turn)";
  return pool
    .map((entry) => {
      const caps = entry.capabilities.slice(0, 5).join(", ") || "general";
      const line = entry.one_liner ? ` — ${entry.one_liner}` : "";
      return `- ${entry.agent_id} (from $${entry.cost_baseline.toFixed(2)}; ${caps})${line}`;
    })
    .join("\n");
}

export function buildArbitratorSystemPrompt(args: {
  roster: NegotiationRosterEntry[];
  maxBudget: number;
  intents: Record<string, string>;
}): string {
  const intentLines = Object.entries(args.intents)
    .map(([intent, description]) => `- ${intent}: ${description}`)
    .join("\n");
  return [
    `You are the Arbor Market arbitrator agent, speaking over the A2A protocol to another autonomous agent (not a human). You negotiate scope, price, and terms on behalf of the Arbor specialist marketplace.`,
    ``,
    `Ground rules:`,
    `- Ground every claim in the specialist roster below. Never invent specialists, tools, or capabilities that are not listed.`,
    `- Quote prices from the roster's cost baselines. You may negotiate within reason but never above the service budget ceiling of $${args.maxBudget}.`,
    `- If the counterparty's request is outside the roster's capabilities, say so plainly and name the closest in-scope alternative.`,
    `- When the counterparty is ready to proceed, tell them to send message/send with metadata.intent "post_task" (include their prompt and max_budget). Structured intents available on this endpoint:`,
    intentLines,
    `- Stay on the topic of the current conversation. Answer the counterparty's actual last message; do not restate boilerplate.`,
    `- Reply in plain text, at most 180 words, no markdown headings. You are one turn in an ongoing exchange, not a final report.`,
    ``,
    `Specialist roster (live):`,
    renderRoster(args.roster),
  ].join("\n");
}

/** Render stored history plus the incoming message into one user prompt. */
export function buildNegotiationUserPrompt(
  history: NegotiationTurn[],
  incoming: string,
): string {
  const recent = history.slice(-NEGOTIATION_HISTORY_LIMIT);
  const transcript = recent
    .map((turn) => {
      const speaker = turn.role === "agent" ? "Arbor" : "Counterparty";
      return `${speaker}: ${turn.text.slice(0, TURN_RENDER_LIMIT)}`;
    })
    .join("\n");
  return [
    transcript ? `Conversation so far:\n${transcript}` : `This is the first turn of the conversation.`,
    ``,
    `Counterparty's new message:\n${incoming.slice(0, 4_000)}`,
    ``,
    `Write Arbor's next reply.`,
  ].join("\n");
}

/**
 * Deterministic reply used when no LLM backend is reachable. Still on-topic:
 * names real roster entries and the concrete next protocol step, so the
 * counterparty gets a useful negotiation turn instead of an error string.
 */
export function fallbackNegotiationReply(args: {
  roster: NegotiationRosterEntry[];
  maxBudget: number;
}): string {
  const pool = args.roster
    .filter((entry) => entry.market_ready !== false)
    .slice(0, 5);
  const named =
    pool.length > 0
      ? pool
          .map((entry) => `${entry.agent_id} (from $${entry.cost_baseline.toFixed(2)})`)
          .join(", ")
      : "our specialist roster";
  return (
    `This is the Arbor Market arbitrator. I can match your request to ${named}. ` +
    `Tell me what you need done, your budget (service ceiling $${args.maxBudget}), and any deadline, and I will quote the best-fit specialist. ` +
    `When you are ready to commit, send message/send with metadata.intent "post_task" including your prompt and max_budget, or metadata.intent "discover" for the full roster.`
  );
}
