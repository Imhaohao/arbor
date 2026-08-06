import assert from "node:assert/strict";
import {
  isReadOnlyTool,
  readOnlyAbilities,
  rosterEntryFromCensus,
  rosterFromCensus,
  type CensusLike,
} from "./census-roster";

// A blind mass probe must never call a tool that changes somebody's account.
assert.ok(isReadOnlyTool("search_docs"));
assert.ok(isReadOnlyTool("get_memories"));
assert.ok(isReadOnlyTool("ask_question"));
assert.ok(!isReadOnlyTool("create_workspace"));
assert.ok(!isReadOnlyTool("delete_memory"));
assert.ok(!isReadOnlyTool("send_email"));
assert.ok(!isReadOnlyTool("deploy_agent"));
assert.ok(!isReadOnlyTool("charge_card"));
// A name that reads both ways must be treated as mutating.
assert.ok(!isReadOnlyTool("create_search_index"));
// Unknown verbs are not assumed safe.
assert.ok(!isReadOnlyTool("frobnicate"));

assert.deepEqual(
  readOnlyAbilities(["search_x", "delete_y", "list_z"]),
  ["search_x", "list_z"],
);

const live: CensusLike = {
  agent_id: "acme-docs",
  display_name: "Acme",
  sponsor: "Acme Inc",
  transport: "mcp",
  endpoint: "https://mcp.acme.test/mcp",
  verdict: "live_open",
  abilities: ["search_docs", "create_ticket"],
};
const entry = rosterEntryFromCensus(live);
assert.ok(entry);
assert.equal(entry.agent_id, "acme-docs");
assert.deepEqual(entry.capabilities, ["search_docs"], "mutating tools excluded");
assert.equal(entry.backend.type, "mcp");
assert.ok(entry.provenance_label.includes("census-derived"));
assert.deepEqual(entry.requiresEnv, []);

// Keyed agents carry their env gate through.
const keyed = rosterEntryFromCensus({
  ...live,
  agent_id: "keyed",
  key_env: "ACME_API_KEY",
  verdict: "live_keyed",
});
assert.deepEqual(keyed?.requiresEnv, ["ACME_API_KEY"]);

// Nothing safely callable -> no seat at the table.
assert.equal(
  rosterEntryFromCensus({ ...live, abilities: ["create_thing", "delete_thing"] }),
  null,
);
// Unreachable agents never become participants.
assert.equal(rosterEntryFromCensus({ ...live, verdict: "dead" }), null);
assert.equal(rosterEntryFromCensus({ ...live, verdict: "paywalled" }), null);
assert.equal(rosterEntryFromCensus({ ...live, transport: "none", endpoint: undefined }), null);

// Dedupe by agent_id.
assert.equal(rosterFromCensus([live, live]).length, 1);

console.log("census-roster tests passed");

// ── A2A seating ─────────────────────────────────────────────────────────────

const a2aRow: CensusLike = {
  agent_id: "peer-agent",
  display_name: "Peer",
  sponsor: "Peer Inc",
  transport: "a2a",
  endpoint: "https://peer.test/a2a",
  verdict: "live_open",
  abilities: ["Check Health", "Search Startups"],
};
const a2aEntry = rosterEntryFromCensus(a2aRow);
assert.ok(a2aEntry, "live a2a peers must be seatable");
assert.equal(a2aEntry.backend.type, "a2a");
// A2A takes a natural-language turn, so mutating-tool screening does not
// apply — the peer decides what to do with the message.
assert.ok(
  rosterEntryFromCensus({ ...a2aRow, abilities: ["Create Invoice"] }),
  "a2a seating must not be blocked by tool-name screening",
);
assert.equal(rosterEntryFromCensus({ ...a2aRow, verdict: "dead" }), null);
assert.equal(rosterEntryFromCensus({ ...a2aRow, endpoint: undefined }), null);

console.log("a2a seating tests passed");
