import assert from "node:assert/strict";
import { verifySignature, canonicalString } from "../a2a-hmac";
import {
  ROUNDS,
  roundSpec,
  buildContextDigest,
  buildRoundPrompt,
  parseSseJson,
  extractMcpText,
  pickTool,
  buildToolArgs,
  composeEntryContent,
  looksLikeErrorText,
  truncateForBoard,
  signedWriteArgs,
  countAgentMessages,
  meetsBar,
  type BoardEntryLite,
} from "./connector-core";
import { activeRoster, CONNECTOR_ROSTER } from "./connector-roster";

// ── rounds ──────────────────────────────────────────────────────────────────

// Every round kind must be worker-writable on the blackboard (no critique,
// no consensus) or writeSigned rejects the entire session.
const WORKER_KINDS = new Set([
  "observation",
  "result",
  "decision",
  "question",
  "proposal",
  "artifact",
]);
for (const spec of ROUNDS) {
  assert.ok(
    WORKER_KINDS.has(spec.kind),
    `round ${spec.round} kind ${spec.kind} is not worker-writable`,
  );
}
assert.equal(roundSpec(2).phase, "negotiate");
assert.throws(() => roundSpec(9));

// ── digest ──────────────────────────────────────────────────────────────────

const entries: BoardEntryLite[] = [
  { agent_id: "b", kind: "proposal", content: "late entry", created_at: 30 },
  { agent_id: "self", kind: "proposal", content: "mine", created_at: 10 },
  {
    agent_id: "a",
    kind: "proposal",
    content: "first entry\nsecond line",
    gist: "first entry",
    created_at: 20,
  },
];
const digest = buildContextDigest(entries, "self");
assert.ok(!digest.includes("mine"), "own entries must be excluded");
const posA = digest.indexOf("a [proposal]");
const posB = digest.indexOf("b [proposal]");
assert.ok(posA >= 0 && posB > posA, "digest must be chronological");

// Cap: entries beyond maxChars are dropped, not truncated mid-line.
const many: BoardEntryLite[] = Array.from({ length: 50 }, (_, i) => ({
  agent_id: `agent-${i}`,
  kind: "proposal",
  content: "x".repeat(300),
  created_at: i,
}));
const capped = buildContextDigest(many, "self", 1000);
assert.ok(capped.length <= 1000);

// ── prompts ─────────────────────────────────────────────────────────────────

const prompt = buildRoundPrompt({
  goal: "build the dashboard",
  agentId: "devin-engineer",
  displayName: "Devin",
  sponsor: "Cognition",
  capabilities: ["debugging"],
  memberIds: ["devin-engineer", "vercel-v0"],
  round: 2,
  digest: "- vercel-v0 [proposal]: I take the UI",
});
assert.ok(prompt.includes("build the dashboard"));
assert.ok(prompt.includes("vercel-v0"));
assert.ok(prompt.includes("Round 2"));
const othersLine = prompt
  .split("\n")
  .find((l) => l.startsWith("Other members:"));
assert.equal(othersLine, "Other members: vercel-v0.", "self must not be in others list");

// ── MCP parsing ─────────────────────────────────────────────────────────────

assert.deepEqual(parseSseJson('{"a":1}'), { a: 1 });
const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":1}}\n\n';
assert.deepEqual(parseSseJson(sse), {
  jsonrpc: "2.0",
  id: 1,
  result: { ok: 1 },
});
// Multiple data lines: last one wins (progress notifications precede results).
const multi =
  'data: {"step":"progress"}\ndata: {"jsonrpc":"2.0","id":2,"result":{"done":true}}';
assert.deepEqual(
  (parseSseJson(multi) as { result: { done: boolean } }).result.done,
  true,
);
assert.throws(() => parseSseJson(""));
// Comment keepalives before the payload (DeepWiki under load).
assert.deepEqual(
  parseSseJson(
    ': ping - 2026-08-04 08:31:00\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"ok":2}}',
  ),
  { jsonrpc: "2.0", id: 3, result: { ok: 2 } },
);

assert.equal(
  extractMcpText({
    result: {
      content: [
        { type: "text", text: "hello" },
        { type: "image", data: "x" },
        { type: "text", text: "world" },
      ],
    },
  }),
  "hello\nworld",
);
assert.equal(extractMcpText({ result: {} }), "");

assert.equal(
  pickTool(
    [{ name: "a" }, { name: "ask_question" }],
    ["ask_question", "a"],
  )?.name,
  "ask_question",
);
assert.equal(pickTool([{ name: "only" }], ["missing"])?.name, "only");
assert.equal(pickTool([], ["x"]), null);

assert.deepEqual(
  buildToolArgs(
    {
      properties: {
        q: { type: "string" },
        n: { type: "number" },
        deep: { type: "boolean" },
        skip: { type: "string" },
      },
      required: ["q", "n", "deep"],
    },
    "find things",
  ),
  { q: "find things", n: 5, deep: false },
);

// ── entry assembly ──────────────────────────────────────────────────────────

const content = composeEntryContent({
  message: "I will take the frontend slice.",
  provenance: "real generation API (v0)",
});
assert.ok(content.startsWith("I will take the frontend slice."));
assert.ok(content.includes("[provenance: real generation API (v0)]"));
assert.throws(() => composeEntryContent({ message: "  ", provenance: "x" }));

assert.equal(truncateForBoard("short"), "short");
assert.ok(truncateForBoard("y".repeat(5000)).length <= 1600);

// ── signing round-trip ──────────────────────────────────────────────────────

const secret = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64",
);
const signed = signedWriteArgs({
  payload: { dag_id: "d1", kind: "proposal", content: "hi", confidence: 0.7 },
  agentId: "devin-engineer",
  secretB64: secret,
  nowMs: 1_754_000_000_000,
  nonce: "nonce-1",
});
assert.equal(signed.timestamp, "1754000000");
assert.ok(
  verifySignature(
    secret,
    canonicalString(signed.raw_body, signed.timestamp, signed.nonce),
    signed.signature,
  ),
  "signature must verify with the server-side check",
);
assert.deepEqual(JSON.parse(signed.raw_body).kind, "proposal");

// ── counting and the bar ────────────────────────────────────────────────────

assert.ok(looksLikeErrorText("MCP error -32602: Input validation error: [..."));
assert.ok(looksLikeErrorText("Error: something broke"));
assert.ok(looksLikeErrorText("Input validation error: bad args"));
assert.ok(!looksLikeErrorText("We should handle errors in the UI slice."));
assert.ok(!looksLikeErrorText("I propose owning the data-sync layer."));

const board: BoardEntryLite[] = [
  ...["a", "b", "c", "d", "e"].flatMap((id) => [
    { agent_id: id, kind: "proposal", content: "p", created_at: 1 },
    { agent_id: id, kind: "decision", content: "d", created_at: 2 },
  ]),
  { agent_id: "outsider", kind: "proposal", content: "x", created_at: 3 },
  // Error-shaped entries must count as errors, not messages.
  {
    agent_id: "a",
    kind: "question",
    content: "MCP error -32602: Invalid arguments",
    created_at: 4,
  },
];
const counts = countAgentMessages(board, ["a", "b", "c", "d", "e", "f"]);
assert.equal(counts.find((c) => c.agent_id === "a")?.messages, 2);
assert.equal(counts.find((c) => c.agent_id === "a")?.error_messages, 1);
assert.equal(counts.find((c) => c.agent_id === "f")?.messages, 0);
assert.ok(meetsBar(counts, 5, 2));
assert.ok(!meetsBar(counts, 6, 2));
assert.ok(!meetsBar(counts.slice(0, 4), 5, 2));

// An agent whose only posts are error dumps must not clear the bar.
const errorOnly: BoardEntryLite[] = [
  { agent_id: "z", kind: "proposal", content: "MCP error -1: x", created_at: 1 },
  { agent_id: "z", kind: "decision", content: "Error: y", created_at: 2 },
];
assert.ok(!meetsBar(countAgentMessages(errorOnly, ["z"]), 1, 2));

// ── roster gating ───────────────────────────────────────────────────────────

const noEnv = activeRoster({});
assert.ok(
  noEnv.some((e) => e.agent_id === "deepwiki-docs"),
  "no-auth MCP agents stay active without env",
);
assert.ok(!noEnv.some((e) => e.agent_id === "devin-engineer"));
const withDevin = activeRoster({ DEVIN_API_KEY: "k" });
assert.ok(withDevin.some((e) => e.agent_id === "devin-engineer"));
assert.ok(CONNECTOR_ROSTER.length >= 5, "roster must field at least 5 agents");

console.log("connector-core tests passed");

// ── error-guided retry ──────────────────────────────────────────────────────

import { suggestArgFromError } from "./connector-core";

assert.equal(
  suggestArgFromError("Invalid industry. Available: plumbing, hvac, electrical", "x"),
  "plumbing",
);
assert.equal(
  suggestArgFromError("Valid options are: alpha | beta", "x"),
  "alpha",
);
assert.equal(
  suggestArgFromError("Supported values: 'us-east', 'eu-west'", "x"),
  "us-east",
);
// Caps shorten the ORIGINAL query rather than inventing a value.
assert.equal(
  suggestArgFromError("Too many search terms (55); use up to 3.", "one two three four five"),
  "one two three",
);
// No actionable hint -> caller must report the failure, not guess.
assert.equal(suggestArgFromError("Internal server error", "q"), null);
assert.equal(suggestArgFromError("", "q"), null);

console.log("error-guided retry tests passed");

// ── schema-aware argument synthesis ─────────────────────────────────────────

// An enum is the server telling us exactly what it accepts.
assert.deepEqual(
  buildToolArgs(
    {
      properties: { industry: { type: "string", enum: ["plumbing", "hvac"] } },
      required: ["industry"],
    } as never,
    "overview capabilities",
  ),
  { industry: "plumbing" },
);
// Defaults beat free text.
assert.deepEqual(
  buildToolArgs(
    { properties: { limit: { type: "integer", default: 3 } }, required: ["limit"] } as never,
    "q",
  ),
  { limit: 3 },
);
// Format-shaped strings must not receive prose.
assert.deepEqual(
  buildToolArgs(
    { properties: { when: { type: "string", format: "date" } }, required: ["when"] } as never,
    "q",
  ),
  { when: "2026-01-01" },
);
// Arrays recurse into their item schema.
assert.deepEqual(
  buildToolArgs(
    {
      properties: { tags: { type: "array", items: { type: "string", enum: ["a", "b"] } } },
      required: ["tags"],
    } as never,
    "q",
  ),
  { tags: ["a"] },
);
// Plain strings still take the query.
assert.deepEqual(
  buildToolArgs(
    { properties: { q: { type: "string" } }, required: ["q"] } as never,
    "find things",
  ),
  { q: "find things" },
);

console.log("schema-aware arg tests passed");

// ── multi-tool fallback ─────────────────────────────────────────────────────

import { pickTools } from "./connector-core";

// Preference order is preserved, and every present preferred tool is offered.
assert.deepEqual(
  pickTools(
    [{ name: "create_x" }, { name: "search_x" }, { name: "list_x" }],
    ["search_x", "list_x", "missing"],
  ).map((t) => t.name),
  ["search_x", "list_x"],
);
// No preferred tool present -> the server's own first tool, as a last resort.
assert.deepEqual(
  pickTools([{ name: "only_tool" }], ["nope"]).map((t) => t.name),
  ["only_tool"],
);
// Duplicates in the preference list must not produce duplicate attempts.
assert.deepEqual(
  pickTools([{ name: "a" }], ["a", "a"]).map((t) => t.name),
  ["a"],
);
assert.deepEqual(pickTools([], ["x"]), []);
// Bounded so a 40-tool server does not turn into 40 sequential calls.
assert.equal(
  pickTools(
    Array.from({ length: 10 }, (_, i) => ({ name: `search_${i}` })),
    Array.from({ length: 10 }, (_, i) => `search_${i}`),
  ).length,
  4,
);

console.log("multi-tool fallback tests passed");
