import assert from "node:assert/strict";
import {
  elapsedLabel,
  headlineFor,
  isActive,
  isTerminal,
  nodeLabel,
  presentStatus,
  progressLevels,
  summarizeProgress,
  totalSpend,
  type NodeStatus,
  type ProgressNode,
} from "./dag-progress-core";

const node = (
  node_id: string,
  status: NodeStatus,
  depends_on: string[] = [],
  extra: Partial<ProgressNode> = {},
): ProgressNode => ({
  node_id,
  description: `${node_id} description`,
  depends_on,
  status,
  ...extra,
});

// ─── isTerminal / isActive ───────────────────────────────────────────────────
assert.ok(isTerminal("complete"));
assert.ok(isTerminal("failed"), "failed is terminal — it will not change again");
assert.ok(!isTerminal("executing"));
assert.ok(!isTerminal("pending"));
assert.ok(isActive("ready") && isActive("auctioned") && isActive("executing"));
assert.ok(!isActive("pending"), "pending is queued, not active");
assert.ok(!isActive("complete"));

// ─── progressLevels ──────────────────────────────────────────────────────────
// The media pipeline shape: video and music run in PARALLEL off the brief.
const media = [
  node("creative_brief", "complete"),
  node("generate_video", "executing", ["creative_brief"]),
  node("generate_music", "executing", ["creative_brief"]),
  node("edit_video", "pending", ["generate_video", "generate_music"]),
  node("media_review", "pending", ["creative_brief", "edit_video"]),
];
assert.deepEqual(
  progressLevels(media).map((l) => l.map((n) => n.node_id)),
  [
    ["creative_brief"],
    ["generate_video", "generate_music"],
    ["edit_video"],
    ["media_review"],
  ],
  "parallel nodes must share a level",
);

assert.deepEqual(progressLevels([]), [], "empty DAG -> no levels");
assert.deepEqual(
  progressLevels([node("main", "complete")]).map((l) => l.map((n) => n.node_id)),
  [["main"]],
);

// A dependency on a node that is not in this DAG must not hide the node. Hiding
// a step from a progress view is worse than showing it slightly out of order.
assert.deepEqual(
  progressLevels([
    node("a", "pending", ["ghost"]),
    node("b", "pending", ["a"]),
  ]).map((l) => l.map((n) => n.node_id)),
  [["a"], ["b"]],
  "unknown dependencies must not strand a node",
);

// A cycle must terminate rather than spin, emitting the unresolved remainder.
const cyclic = progressLevels([
  node("x", "pending", ["y"]),
  node("y", "pending", ["x"]),
]);
assert.equal(cyclic.length, 1, "cycle emits one remainder level");
assert.deepEqual(cyclic[0].map((n) => n.node_id).sort(), ["x", "y"]);

// Every node appears exactly once, whatever the shape.
for (const set of [media, cyclic.flat()]) {
  const flat = progressLevels(set).flat().map((n) => n.node_id);
  assert.equal(new Set(flat).size, flat.length, "no node may be duplicated");
  assert.equal(flat.length, set.length, "no node may be dropped");
}

// ─── summarizeProgress ───────────────────────────────────────────────────────
const mid = summarizeProgress(media);
assert.equal(mid.total, 5);
assert.equal(mid.complete, 1);
assert.equal(mid.active, 2);
assert.equal(mid.pending, 2);
assert.equal(mid.failed, 0);
assert.equal(mid.percent, 20, "1 of 5 terminal -> 20%");
assert.ok(!mid.settled);
assert.equal(mid.currentNodeId, "generate_video");

// An empty DAG is 0%, never NaN and never 100%.
const empty = summarizeProgress([]);
assert.equal(empty.percent, 0);
assert.equal(empty.fraction, 0);
assert.ok(!empty.settled, "an empty DAG has not 'finished'");
assert.ok(Number.isFinite(empty.fraction));

// A failed node counts toward terminal progress but must NOT read as success.
const withFailure = summarizeProgress([
  node("a", "complete"),
  node("b", "failed"),
]);
assert.equal(withFailure.percent, 100, "both nodes are terminal");
assert.ok(withFailure.settled);
assert.ok(withFailure.hasFailure, "failure must be reported alongside 100%");

const allDone = summarizeProgress([node("a", "complete"), node("b", "complete")]);
assert.ok(allDone.settled && !allDone.hasFailure);
assert.equal(allDone.percent, 100);
assert.equal(allDone.currentNodeId, undefined);

// Counts must always partition the node set.
for (const set of [media, [], withFailure ? media : []]) {
  const s = summarizeProgress(set);
  assert.equal(
    s.complete + s.failed + s.active + s.pending,
    s.total,
    "status counts must sum to total",
  );
}

// ─── presentStatus ───────────────────────────────────────────────────────────
assert.deepEqual(presentStatus("complete"), { label: "Complete", tone: "done" });
assert.deepEqual(presentStatus("failed"), { label: "Failed", tone: "error" });
assert.equal(presentStatus("executing").tone, "running");
assert.equal(presentStatus("auctioned").tone, "running");
assert.equal(presentStatus("ready").tone, "running");
assert.equal(presentStatus("pending").tone, "waiting");
// Every status in the schema union must produce a non-empty label.
for (const s of [
  "pending",
  "ready",
  "auctioned",
  "executing",
  "complete",
  "failed",
] as const) {
  assert.ok(presentStatus(s).label.length > 0, `${s} needs a label`);
}

// ─── nodeLabel ───────────────────────────────────────────────────────────────
assert.equal(nodeLabel("generate_music"), "Music");
assert.equal(nodeLabel("creative_brief"), "Creative brief");
assert.equal(nodeLabel("media_review"), "Review");
// Unmapped ids degrade to a readable form rather than raw snake_case.
assert.equal(nodeLabel("some_new_node"), "Some new node");
assert.equal(nodeLabel("solo"), "Solo");

// ─── elapsedLabel ────────────────────────────────────────────────────────────
const T = 1_700_000_000_000;
assert.equal(elapsedLabel(T, T), "0s");
assert.equal(elapsedLabel(T - 45_000, T), "45s");
assert.equal(elapsedLabel(T - 90_000, T), "1m 30s");
assert.equal(elapsedLabel(T - 3_700_000, T), "1h 1m");
// A future start clamps to 0 rather than rendering a negative duration.
assert.equal(elapsedLabel(T + 60_000, T), "0s");
// Missing or unusable input yields nothing to render.
assert.equal(elapsedLabel(undefined, T), undefined);
assert.equal(elapsedLabel(NaN, T), undefined);
assert.equal(elapsedLabel(T, NaN), undefined);

// ─── totalSpend ──────────────────────────────────────────────────────────────
assert.equal(totalSpend([]), undefined, "nothing settled -> no figure shown");
assert.equal(
  totalSpend([node("a", "complete"), node("b", "pending")]),
  undefined,
  "nodes without cost_paid must not render as $0",
);
assert.equal(
  totalSpend([
    node("a", "complete", [], { cost_paid: 1.4 }),
    node("b", "complete", [], { cost_paid: 0.6 }),
  ]),
  2,
);
// Non-finite costs are ignored rather than poisoning the sum.
assert.equal(
  totalSpend([
    node("a", "complete", [], { cost_paid: 1.5 }),
    node("b", "complete", [], { cost_paid: NaN }),
  ]),
  1.5,
);

// ─── headlineFor ─────────────────────────────────────────────────────────────
assert.equal(headlineFor(summarizeProgress([])), "No steps planned yet");
assert.equal(headlineFor(allDone), "All steps complete");
// A finished-but-broken pipeline must never read as success.
assert.equal(
  headlineFor(withFailure),
  "Finished with 1 failed step",
  "100% with a failure must not say 'complete'",
);
assert.equal(
  headlineFor(summarizeProgress([node("a", "failed"), node("b", "failed")])),
  "Finished with 2 failed steps",
);
// Running state names the current step.
assert.equal(headlineFor(mid), "Running Video generation — 1/5 done");
// Queued but not started.
assert.equal(
  headlineFor(summarizeProgress([node("a", "pending"), node("b", "pending")])),
  "Queued — 0/2 done",
);
// Stalled: a failure with nothing active and work left.
assert.equal(
  headlineFor(summarizeProgress([node("a", "failed"), node("b", "pending")])),
  "Stalled after 1 failed step",
);

console.log("dag-progress-core.test.ts: all assertions passed");
