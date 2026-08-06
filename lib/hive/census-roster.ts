// Census-driven roster: turn a probed agent into a hive participant.
//
// The hand-written roster (connector-roster.ts) carries per-agent tuned
// prompts and exact tool args. That does not scale to a roster of a thousand.
// This module derives a RosterEntry from what a server ITSELF declared during
// the census probe — its real tool names — so any reachable agent can take a
// seat at a roundtable without a human writing an entry for it.
//
// The tradeoff is honest and recorded in the provenance label: a derived entry
// asks a generic question rather than one tuned to the vendor's strengths, so
// its answers are shallower than a hand-tuned entry's. It is still the agent's
// own server doing the work.

import type { RosterEntry } from "./connector-roster";

export interface CensusLike {
  agent_id: string;
  display_name: string;
  sponsor: string;
  transport: "mcp" | "a2a" | "none";
  endpoint?: string;
  key_env?: string;
  verdict: string;
  abilities: string[];
}

/** Tools safe to call blind: read-only shapes that cannot mutate a vendor account. */
const READ_ONLY_HINTS = [
  "search",
  "query",
  "get_",
  "list",
  "read",
  "fetch",
  "ask",
  "docs",
  "lookup",
  "find",
  "describe",
  "info",
  "explain",
  "summar",
];

/**
 * Tools that must never be auto-called. A blind census must not create,
 * delete, send, pay, or deploy anything inside somebody's real account.
 */
const MUTATING_HINTS = [
  "create",
  "delete",
  "remove",
  "update",
  "write",
  "send",
  "post",
  "publish",
  "deploy",
  "pay",
  "charge",
  "buy",
  "order",
  "cancel",
  "execute",
  "run_",
  "upload",
  "invite",
  "revoke",
  "reset",
];

export function isReadOnlyTool(name: string): boolean {
  const lower = name.toLowerCase();
  if (MUTATING_HINTS.some((hint) => lower.includes(hint))) return false;
  return READ_ONLY_HINTS.some((hint) => lower.includes(hint));
}

export function readOnlyAbilities(abilities: string[]): string[] {
  return abilities.filter(isReadOnlyTool);
}

/**
 * Build a roundtable entry from census output, or null when the agent has no
 * safely callable surface. Returning null is the common case for account-
 * management servers whose every tool mutates state.
 */
export function rosterEntryFromCensus(row: CensusLike): RosterEntry | null {
  if (row.transport !== "mcp" || !row.endpoint) return null;
  if (row.verdict !== "live_open" && row.verdict !== "live_keyed") return null;
  const safe = readOnlyAbilities(row.abilities);
  if (safe.length === 0) return null;

  const label = row.display_name?.trim() || row.agent_id;
  return {
    agent_id: row.agent_id,
    display_name: label,
    sponsor: row.sponsor || "unknown",
    capabilities: safe.slice(0, 6),
    system_prompt: `You are ${row.agent_id}, an external specialist participating in an Arbor hive roundtable.`,
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.5,
    provenance_label: `real tool-backed (${label} MCP server, census-derived entry)`,
    requiresEnv: row.key_env ? [row.key_env] : [],
    backend: {
      type: "mcp",
      endpoint: row.endpoint,
      bearerEnv: row.key_env,
      toolPreference: safe,
      // SHORT queries on purpose. A census-derived entry does not know the
      // tool's domain, and passing a full roundtable prompt as a search
      // argument is what real servers reject: measured failures included
      // "Too many search terms (55); use up to 20" and validation errors on
      // enum-shaped arguments. Two or three neutral words survive nearly
      // every schema while still returning that server's own real content.
      queryFor: (round) =>
        round === 1
          ? "overview capabilities"
          : round === 2
            ? "limitations and requirements"
            : "getting started",
    },
  };
}

export function rosterFromCensus(rows: CensusLike[]): RosterEntry[] {
  const out: RosterEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.agent_id)) continue;
    const entry = rosterEntryFromCensus(row);
    if (entry) {
      seen.add(row.agent_id);
      out.push(entry);
    }
  }
  return out;
}
