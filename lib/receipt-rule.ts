/**
 * Fulfilment receipt rule.
 *
 * A task is fulfilled only when we can PROVE the winning agent did the work.
 * The guarantee is constant; the available proof differs by transport, which
 * is the same distinction finalizeProvenance already draws with proof_level.
 *
 * Extracted from convex/auctions.ts so the transport split is unit-testable
 * without the Convex server runtime.
 */

export interface ReceiptInputs {
  /** SpecialistProvenance.transport — "mcp", "a2a-bridge", etc. */
  transport?: string;
  /** Audited agent_tool_calls rows with ok=true attributable to this run. */
  successful_tool_call_count?: number;
  /** External session/task id, from the tool-call receipt or provenance. */
  external_session_id?: string;
  /** Streamed events observed across this agent's calls for the task. */
  events_observed_total: number;
  /** A captured artifact, a PR url, or non-empty delivered text. */
  artifact_present: boolean;
}

/**
 * MCP is sessionless. Streamable-HTTP MCP servers are commonly stateless and
 * never issue an `Mcp-Session-Id` (Nia is one), so a session id cannot be a
 * fulfilment condition for this transport — requiring it failed every
 * mcp-forwarding specialist permanently regardless of the work performed.
 */
export function isSessionlessToolTransport(transport?: string): boolean {
  return transport === "mcp";
}

/**
 * Returns the list of missing proofs — empty means the receipt is complete.
 *
 * Session-based transports must present an external session id and observed
 * events. Sessionless (MCP) transports prove the work with audited successful
 * tool calls instead: persisted rows against the real remote endpoint, which
 * is stronger evidence than an echoed header string. Every transport must
 * still produce an artifact.
 */
export function receiptShortfall(input: ReceiptInputs): string[] {
  const missing: string[] = [];
  if (isSessionlessToolTransport(input.transport)) {
    if ((input.successful_tool_call_count ?? 0) <= 0) {
      missing.push("successful_tool_calls");
    }
  } else {
    if (!input.external_session_id) missing.push("external_session_id");
    if (input.events_observed_total <= 0) missing.push("events_observed");
  }
  if (!input.artifact_present) missing.push("artifact_present");
  return missing;
}
