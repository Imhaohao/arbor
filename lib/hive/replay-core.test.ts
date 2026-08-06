import assert from "node:assert/strict";
import {
  buildLedger,
  detectDisagreement,
  goalHeadline,
  groupEvaluationsByNode,
  orderNodes,
  primaryKillReason,
  summarizeReplay,
  type ReplayEvaluation,
  type ReplayNode,
} from "./replay-core";

const evaluation = (
  over: Partial<ReplayEvaluation> & { score: number; verdict: "accept" | "reject" },
): ReplayEvaluation => ({
  node_id: "report",
  agent_id: "agent-a",
  reasoning: "because",
  judge_model: "judge-1",
  created_at: 0,
  ...over,
});

// ── grouping ───────────────────────────────────────────────────────────────
// DAG-level rows carry no node_id and must not become a phantom node.
const grouped = groupEvaluationsByNode([
  evaluation({ score: 0.4, verdict: "reject" }),
  evaluation({ score: 0.98, verdict: "accept" }),
  evaluation({ node_id: "ack", score: 0.3, verdict: "reject" }),
  evaluation({ node_id: undefined, score: 0, verdict: "reject" }),
]);
assert.equal(grouped.size, 2);
assert.equal(grouped.get("report")!.length, 2);
// Sorted most-generous-first so the rubber stamp is the head of the list.
assert.equal(grouped.get("report")![0].score, 0.98);

// ── disagreement ───────────────────────────────────────────────────────────
// A single judge cannot disagree; claiming "no conflict" would overstate the
// amount of checking that actually happened.
assert.equal(
  detectDisagreement("report", [evaluation({ score: 0.9, verdict: "accept" })]),
  null,
);

// The real recorded shape: one judge accepts at 0.98, two others reject.
const split = detectDisagreement("report", [
  evaluation({ score: 0.98, verdict: "accept", judge_model: "arbor-backstop-judge" }),
  evaluation({ score: 0.55, verdict: "reject", judge_model: "claude-fable-5" }),
  evaluation({ score: 0.4, verdict: "reject", judge_model: "claude-fable-5" }),
])!;
assert.equal(split.severity, "split");
assert.equal(split.accepts, 1);
assert.equal(split.rejects, 2);
assert.ok(Math.abs(split.scoreSpread - 0.58) < 1e-9);
assert.equal(split.highest.judge_model, "arbor-backstop-judge");
assert.equal(split.lowest.score, 0.4);
assert.equal(split.optimisticOutlier, true);

// Two accepts against one reject is a split, but not the rubber-stamp pattern.
const notOutlier = detectDisagreement("report", [
  evaluation({ score: 0.9, verdict: "accept" }),
  evaluation({ score: 0.85, verdict: "accept" }),
  evaluation({ score: 0.2, verdict: "reject" }),
])!;
assert.equal(notOutlier.severity, "split");
assert.equal(notOutlier.optimisticOutlier, false);

// Same verdict, wide margin — surfaced as a spread, not a split.
const spread = detectDisagreement("ack", [
  evaluation({ score: 0.15, verdict: "reject" }),
  evaluation({ score: 0.55, verdict: "reject" }),
])!;
assert.equal(spread.severity, "spread");
assert.equal(spread.optimisticOutlier, false);

// Unanimous and tight — nothing to show.
const agreed = detectDisagreement("ack", [
  evaluation({ score: 0.3, verdict: "reject" }),
  evaluation({ score: 0.35, verdict: "reject" }),
])!;
assert.equal(agreed.severity, "none");

// ── ledger ─────────────────────────────────────────────────────────────────
const nodes: ReplayNode[] = [
  {
    node_id: "hello_world_ack",
    description: "contact hello world",
    depends_on: [],
    status: "complete",
    assigned_agent_id: "arbor-hive-backstop",
    cost_paid: 5.49,
    bid_price: 6,
    eval_score: 0.25,
    revision_count: 2,
  },
  {
    node_id: "report",
    description: "combine",
    depends_on: ["hello_world_ack"],
    status: "complete",
    assigned_agent_id: "arbor-hive-backstop",
    cost_paid: 7.42,
    bid_price: 8,
    eval_score: 0.86,
    revision_count: 2,
  },
];

const worker = "arbor-hive-backstop";
const ledgerEvals = [
  evaluation({ node_id: "hello_world_ack", agent_id: worker, score: 0.25, verdict: "reject" }),
  evaluation({ node_id: "report", agent_id: worker, score: 0.98, verdict: "accept" }),
  evaluation({ node_id: "report", agent_id: worker, score: 0.4, verdict: "reject" }),
  evaluation({ node_id: undefined, agent_id: worker, score: 0, verdict: "reject" }),
];

const ledger = buildLedger(nodes, ledgerEvals);
assert.equal(ledger.length, 1);
assert.equal(ledger[0].agent_id, "arbor-hive-backstop");
assert.equal(ledger[0].nodesWorked, 2);
assert.equal(ledger[0].accepts, 1);
assert.equal(ledger[0].rejects, 2);
assert.ok(Math.abs(ledger[0].costPaid - 12.91) < 1e-9);
assert.ok(Math.abs(ledger[0].meanScore! - (0.25 + 0.98 + 0.4) / 3) < 1e-9);

// An agent judged but never assigned a node still appears, with zero spend.
const judgedOnly = buildLedger(nodes, [
  ...ledgerEvals,
  evaluation({ node_id: "report", agent_id: "spatial-atlas", score: 0.55, verdict: "reject" }),
]);
const atlas = judgedOnly.find((r) => r.agent_id === "spatial-atlas")!;
assert.equal(atlas.nodesWorked, 0);
assert.equal(atlas.costPaid, 0);
assert.equal(atlas.rejects, 1);

// ── summary ────────────────────────────────────────────────────────────────
const escalatedSummary = summarizeReplay({
  status: "escalated",
  maxBudget: 20,
  nodes,
  evaluations: ledgerEvals,
  escalations: [
    { kind: "conflict_tie", reason: "judges split", status: "open", created_at: 0 },
  ],
  disagreements: [split, agreed],
});
assert.equal(escalatedSummary.shipped, false);
assert.equal(escalatedSummary.accepts, 1);
assert.equal(escalatedSummary.rejects, 2);
assert.equal(escalatedSummary.disagreements, 1); // `agreed` has severity "none"
assert.equal(escalatedSummary.optimisticOutliers, 1);
assert.equal(escalatedSummary.escalations, 1);
assert.equal(escalatedSummary.revisionRounds, 4);
// Escalated work stranded every dollar it spent — this must not read as $0.
assert.ok(Math.abs(escalatedSummary.strandedSpend - 12.91) < 1e-9);

const shippedSummary = summarizeReplay({
  status: "complete",
  maxBudget: 20,
  nodes,
  evaluations: ledgerEvals,
  escalations: [],
  disagreements: [],
});
assert.equal(shippedSummary.shipped, true);
assert.equal(shippedSummary.strandedSpend, 0);
assert.ok(Math.abs(shippedSummary.totalSpend - 12.91) < 1e-9);

// ── ordering ───────────────────────────────────────────────────────────────
const ordered = orderNodes([
  { node_id: "c", description: "", depends_on: ["a", "b"], status: "complete" },
  { node_id: "a", description: "", depends_on: [], status: "complete" },
  { node_id: "b", description: "", depends_on: [], status: "complete" },
]);
assert.deepEqual(ordered.map((n) => n.node_id), ["a", "b", "c"]);

// Cycles must not drop nodes — a replay missing a node is worse than a misordered one.
const cyclic = orderNodes([
  { node_id: "x", description: "", depends_on: ["y"], status: "complete" },
  { node_id: "y", description: "", depends_on: ["x"], status: "complete" },
]);
assert.equal(cyclic.length, 2);

// Dangling dependency references are tolerated.
const dangling = orderNodes([
  { node_id: "solo", description: "", depends_on: ["ghost"], status: "complete" },
]);
assert.deepEqual(dangling.map((n) => n.node_id), ["solo"]);

// ── goal headline ──────────────────────────────────────────────────────────
// The shared boilerplate opener must be skipped, or every index row reads the same.
assert.equal(
  goalHeadline(
    "Complete this work as a dependency-aware multi-agent project:\n1. Ask the Hello World specialist for a token.\n2. Then combine.",
  ),
  "1. Ask the Hello World specialist for a token. 2. Then combine.",
);
// A single-line goal has nothing to skip.
assert.equal(goalHeadline("Contrast two protocols."), "Contrast two protocols.");
// A one-line goal that happens to end in a colon must not be skipped into nothing.
assert.equal(goalHeadline("Do the thing:"), "Do the thing:");
assert.equal(goalHeadline("   \n  \n"), "(no goal recorded)");
assert.equal(goalHeadline("abcdefghij", 5), "abcd…");

// ── kill reason ────────────────────────────────────────────────────────────
assert.equal(primaryKillReason([evaluation({ score: 0.9, verdict: "accept" })]), null);
const killed = primaryKillReason([
  evaluation({ score: 0.98, verdict: "accept", reasoning: "a very long acceptance rationale" }),
  evaluation({ score: 0.4, verdict: "reject", reasoning: "short" }),
  evaluation({ score: 0.55, verdict: "reject", reasoning: "the longest rejection rationale here" }),
])!;
assert.equal(killed.reasoning, "the longest rejection rationale here");
assert.equal(killed.verdict, "reject");

console.log("replay-core tests passed");
