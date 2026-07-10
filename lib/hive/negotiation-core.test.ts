import assert from "node:assert/strict";
import {
  buildArbitratorSystemPrompt,
  buildNegotiationUserPrompt,
  fallbackNegotiationReply,
  looksConversational,
  NEGOTIATION_HISTORY_LIMIT,
  type NegotiationRosterEntry,
  type NegotiationTurn,
} from "./negotiation-core";

// ─── looksConversational ────────────────────────────────────────────────────
// Ongoing thread always continues the conversation regardless of text.
assert.equal(
  looksConversational("Ship the deliverable now.", true),
  true,
  "any message with history continues the negotiation thread",
);
// Questions and pricing talk are conversational.
assert.equal(looksConversational("How much would a landing page cost?", false), true);
assert.equal(looksConversational("Can you handle code review tasks?", false), true);
assert.equal(looksConversational("I offer $2, counter-offer welcome", false), true);
assert.equal(looksConversational("hello there", false), true);
// A plain imperative work brief stays a task post (no false switch).
assert.equal(
  looksConversational(
    "Write a 500-word product announcement for our new SDK release. Include installation steps and a code sample.",
    false,
  ),
  false,
  "imperative work briefs must keep post_task default",
);
// Empty or long-form briefs are never conversational without history.
assert.equal(looksConversational("   ", false), false);
assert.equal(
  looksConversational(`Requirements?\n${"detail ".repeat(300)}`, false),
  false,
  "long briefs stay task posts even with a question mark",
);

// ─── buildArbitratorSystemPrompt ────────────────────────────────────────────
const roster: NegotiationRosterEntry[] = [
  {
    agent_id: "codex-writer",
    one_liner: "Writes production code",
    capabilities: ["code", "refactor"],
    cost_baseline: 1.25,
    reputation_score: 0.9,
    market_ready: true,
  },
  {
    agent_id: "broken-agent",
    capabilities: ["misc"],
    cost_baseline: 0.1,
    reputation_score: 0.2,
    market_ready: false,
  },
];
{
  const prompt = buildArbitratorSystemPrompt({
    roster,
    maxBudget: 100,
    intents: { post_task: "Post a work brief.", discover: "List specialists." },
  });
  assert.ok(prompt.includes("codex-writer"), "roster agent ids appear in prompt");
  assert.ok(prompt.includes("$1.25"), "cost baselines quoted");
  assert.ok(prompt.includes("$100"), "budget ceiling quoted");
  assert.ok(prompt.includes("post_task"), "intents listed");
  assert.ok(
    !prompt.includes("broken-agent"),
    "non-market-ready agents excluded when ready agents exist",
  );
}
// Empty roster renders a placeholder instead of crashing.
{
  const prompt = buildArbitratorSystemPrompt({ roster: [], maxBudget: 10, intents: {} });
  assert.ok(prompt.includes("roster unavailable"), "empty roster stays valid");
}

// ─── buildNegotiationUserPrompt ─────────────────────────────────────────────
{
  const history: NegotiationTurn[] = [
    { role: "counterparty", text: "What do you charge for research briefs?" },
    { role: "agent", text: "From $0.50 with arbor-worker-a2a." },
  ];
  const prompt = buildNegotiationUserPrompt(history, "Deal at $0.40?");
  assert.ok(prompt.includes("Counterparty: What do you charge"), "history rendered");
  assert.ok(prompt.includes("Arbor: From $0.50"), "agent turns rendered");
  assert.ok(prompt.includes("Deal at $0.40?"), "incoming message rendered");
  const order =
    prompt.indexOf("What do you charge") < prompt.indexOf("Deal at $0.40?");
  assert.ok(order, "history precedes the new message");
}
// First turn has no transcript but still frames the exchange.
assert.ok(
  buildNegotiationUserPrompt([], "hi").includes("first turn"),
  "empty history labeled as first turn",
);
// History is capped to the most recent turns.
{
  const long: NegotiationTurn[] = Array.from({ length: 40 }, (_, i) => ({
    role: "counterparty" as const,
    text: `turn-${i}`,
  }));
  const prompt = buildNegotiationUserPrompt(long, "latest");
  assert.ok(!prompt.includes("turn-0"), "oldest turns dropped");
  assert.ok(
    prompt.includes(`turn-${40 - NEGOTIATION_HISTORY_LIMIT}`),
    "recent turns kept",
  );
}

// ─── fallbackNegotiationReply ───────────────────────────────────────────────
{
  const reply = fallbackNegotiationReply({ roster, maxBudget: 100 });
  assert.ok(reply.includes("codex-writer"), "fallback names real roster entries");
  assert.ok(reply.includes("post_task"), "fallback names the next protocol step");
  assert.ok(reply.includes("$100"), "fallback quotes the ceiling");
}
{
  const reply = fallbackNegotiationReply({ roster: [], maxBudget: 10 });
  assert.ok(reply.includes("specialist roster"), "fallback valid with empty roster");
}

console.log("negotiation-core tests passed");
