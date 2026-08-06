import assert from "node:assert/strict";
import {
  buildNetwork,
  CANVAS,
  compressTimeline,
  edgePath,
  eventLabel,
  frameAt,
  inferRole,
  networkDurationMs,
  realAt,
  type NetworkEvaluationRow,
  type NetworkNodeRow,
  type ScratchpadRow,
} from "./network-core";

// ── role inference ─────────────────────────────────────────────────────────
const judges = new Set(["claude-fable-5", "arbor-backstop-judge"]);
assert.equal(inferRole("hive-planner", judges), "planner");
assert.equal(inferRole("hive-control", judges), "control");
assert.equal(inferRole("hive-evaluator", judges), "judge");
assert.equal(inferRole("spatial-atlas", judges), "worker");
// An agent that issued a verdict is a judge even without a telltale name.
assert.equal(inferRole("claude-fable-5", judges), "judge");

// ── labels ─────────────────────────────────────────────────────────────────
// A gist of "{" is the truncated head of a JSON blob and is useless as a label.
assert.equal(
  eventLabel({ gist: "{", content: "{\n  \"nodes\": [\n    { \"id\": \"a\" }" }),
  '"nodes": [',
);
assert.equal(eventLabel({ gist: "  ", content: "" }), "(no text recorded)");
assert.equal(eventLabel({ content: "abcdefghij" }, 5), "abcd…");
assert.equal(eventLabel({ gist: "short gist", content: "long content" }), "short gist");

// ── fixture mirroring the real recorded shape ──────────────────────────────
const nodes: NetworkNodeRow[] = [
  { node_id: "hello", depends_on: [], assigned_agent_id: "arbor-hive-backstop" },
  { node_id: "marg", depends_on: [], assigned_agent_id: "arbor-hive-backstop" },
  // Assigned to the backstop after revisions, but the recorded result row names
  // spatial-atlas as the agent that actually produced the output. This mirrors
  // the real data, where every node collapses onto one assigned agent.
  {
    node_id: "report",
    depends_on: ["hello", "marg"],
    assigned_agent_id: "arbor-hive-backstop",
  },
];

const entries: ScratchpadRow[] = [
  {
    agent_id: "hive-planner",
    kind: "proposal",
    content: "Complete this work as a project:",
    gist: "Complete this work as a project:",
    confidence: 1,
    created_at: 1000,
  },
  {
    agent_id: "arbor-hive-backstop",
    node_id: "hello",
    kind: "result",
    content: "I could not contact the specialist.",
    confidence: 0.35,
    created_at: 2000,
  },
  {
    agent_id: "spatial-atlas",
    node_id: "report",
    kind: "result",
    content: "Combined report.",
    confidence: 0.86,
    created_at: 3000,
  },
  {
    agent_id: "hive-evaluator",
    node_id: "report",
    kind: "critique",
    content: "Report claims evidence it does not have.",
    confidence: 0.4,
    created_at: 4500,
  },
  {
    agent_id: "hive-control",
    kind: "consensus",
    content: "Escalating.",
    confidence: 0.4,
    created_at: 9000,
  },
];

const evaluations: NetworkEvaluationRow[] = [
  {
    node_id: "report",
    agent_id: "spatial-atlas",
    judge_model: "arbor-backstop-judge",
    score: 0.98,
    verdict: "accept",
    reasoning: "Looks complete.",
    created_at: 4000,
  },
  {
    node_id: "report",
    agent_id: "spatial-atlas",
    judge_model: "claude-fable-5",
    score: 0.4,
    verdict: "reject",
    reasoning: "Claims worksteps that never happened.",
    created_at: 5000,
  },
  {
    node_id: "hello",
    agent_id: "arbor-hive-backstop",
    judge_model: "claude-fable-5",
    score: 0.35,
    verdict: "reject",
    reasoning: "No specialist evidence.",
    created_at: 6000,
  },
  // DAG-level summary row: no node, no counterparty — must not create an edge.
  {
    agent_id: "hive-evaluator",
    judge_model: "claude-fable-5",
    score: 0,
    verdict: "reject",
    reasoning: "summary",
    created_at: 7000,
  },
];

const net = buildNetwork({ nodes, evaluations, entries });

// ── agents ─────────────────────────────────────────────────────────────────
const ids = net.agents.map((a) => a.agent_id).sort();
assert.deepEqual(ids, [
  "arbor-backstop-judge",
  "arbor-hive-backstop",
  "claude-fable-5",
  "hive-control",
  "hive-evaluator",
  "hive-planner",
  "spatial-atlas",
]);
const roleOf = (id: string) => net.agents.find((a) => a.agent_id === id)!.role;
assert.equal(roleOf("hive-planner"), "planner");
assert.equal(roleOf("spatial-atlas"), "worker");
assert.equal(roleOf("claude-fable-5"), "judge");
assert.equal(roleOf("hive-control"), "control");

// Lanes must be ordered left to right: planner < worker < judge < control.
const xOf = (id: string) => net.agents.find((a) => a.agent_id === id)!.x;
assert.ok(xOf("hive-planner") < xOf("spatial-atlas"));
assert.ok(xOf("spatial-atlas") < xOf("claude-fable-5"));
assert.ok(xOf("claude-fable-5") < xOf("hive-control"));
// Everything stays inside the canvas.
for (const a of net.agents) {
  assert.ok(a.x >= 0 && a.x <= CANVAS.width, `x in range for ${a.agent_id}`);
  assert.ok(a.y > 0 && a.y < CANVAS.height, `y in range for ${a.agent_id}`);
}
// Two workers share a lane and must not collide.
const workerYs = net.agents.filter((a) => a.role === "worker").map((a) => a.y);
assert.equal(new Set(workerYs).size, workerYs.length);

// Layout is deterministic: same input, same positions.
const again = buildNetwork({ nodes, evaluations, entries });
assert.deepEqual(
  again.agents.map((a) => [a.agent_id, a.x, a.y]),
  net.agents.map((a) => [a.agent_id, a.x, a.y]),
);

// ── edges ──────────────────────────────────────────────────────────────────
const edgeIds = net.edges.map((e) => e.id).sort();
assert.deepEqual(edgeIds, [
  "handoff:arbor-hive-backstop->spatial-atlas",
  "plan:hive-planner->arbor-hive-backstop",
  "verdict:arbor-backstop-judge->spatial-atlas",
  "verdict:claude-fable-5->arbor-hive-backstop",
  "verdict:claude-fable-5->spatial-atlas",
  "verdict:hive-evaluator->spatial-atlas",
]);
// The result row overrides assigned_agent_id, so the handoff lands on the agent
// that actually produced the report rather than collapsing into a self-edge.
assert.ok(edgeIds.includes("handoff:arbor-hive-backstop->spatial-atlas"));
// Both root nodes were executed by the backstop, so the plan edge carries 2.
assert.equal(net.edges.find((e) => e.kind === "plan")!.count, 2);
// A critique is a judgement channel and is flagged as a rejection.
assert.equal(
  net.edges.find((e) => e.id === "verdict:hive-evaluator->spatial-atlas")!.rejected,
  true,
);
// Both hello and marg feed report from the same agent — one edge, count 2.
const handoff = net.edges.find((e) => e.kind === "handoff")!;
assert.equal(handoff.count, 2);
// The rejecting judge's edge is flagged; the accepting one is not.
assert.equal(
  net.edges.find((e) => e.id === "verdict:claude-fable-5->spatial-atlas")!.rejected,
  true,
);
assert.equal(
  net.edges.find((e) => e.id === "verdict:arbor-backstop-judge->spatial-atlas")!
    .rejected,
  undefined,
);
// No self-edges, and every edge is backed by at least one row.
for (const e of net.edges) {
  assert.notEqual(e.from, e.to);
  assert.ok(e.count >= 1, "no arrow without a row behind it");
}

// ── events ─────────────────────────────────────────────────────────────────
assert.equal(net.events.length, entries.length + 3); // 4 evals, 1 dropped
assert.equal(net.startAt, 1000);
assert.equal(net.endAt, 9000);
assert.equal(networkDurationMs(net), 8000);
// Strictly non-decreasing in time.
for (let i = 1; i < net.events.length; i++) {
  assert.ok(net.events[i].at >= net.events[i - 1].at);
}
// The dropped DAG-level row must not appear as an event.
assert.equal(net.events.filter((e) => e.label === "summary").length, 0);

// ── playback ───────────────────────────────────────────────────────────────
const early = frameAt(net, 1000);
assert.equal(early.eventsSoFar, 1);
assert.equal(early.perAgent.get("hive-planner")!.kind, "proposal");
assert.ok(early.idle.has("spatial-atlas"));
assert.equal(early.elapsedMs, 0);

// The planner's proposal lights its plan edges into the root executors.
assert.ok(frameAt(net, 1000).hotEdges.has("plan:hive-planner->arbor-hive-backstop"));

const mid = frameAt(net, 5000);
assert.equal(mid.perAgent.get("claude-fable-5")!.tone, "bad");
assert.equal(mid.perAgent.get("claude-fable-5")!.score, 0.4);
assert.ok(mid.hotEdges.has("verdict:claude-fable-5->spatial-atlas"));
// The accept at t=4000 is still inside the 6s window.
assert.ok(mid.hotEdges.has("verdict:arbor-backstop-judge->spatial-atlas"));

// Cursor before anything happened: empty frame, everyone idle.
const before = frameAt(net, 0);
assert.equal(before.eventsSoFar, 0);
assert.equal(before.perAgent.size, 0);
assert.equal(before.idle.size, net.agents.length);

// Scrubbing is pure — recomputing the same cursor gives the same frame.
const midAgain = frameAt(net, 5000);
assert.deepEqual([...midAgain.hotEdges].sort(), [...mid.hotEdges].sort());
assert.equal(midAgain.eventsSoFar, mid.eventsSoFar);

// Edges cool down once the window passes.
const late = frameAt(net, 20000);
assert.equal(late.hotEdges.size, 0);
assert.equal(late.eventsSoFar, net.events.length);
assert.equal(late.idle.size, 0);

// ── timeline compression ───────────────────────────────────────────────────
// Events sit at 1000,2000,3000,4000,4500,5000,6000,9000. With a 1500ms cap the
// only gap that gets clipped is the 3000ms one at the end.
const tl = compressTimeline(net, 1500);
assert.equal(tl.points[0].real, 1000);
assert.equal(tl.points[0].play, 0);
// Real span is 8000ms; compressed drops the final 3000ms gap to 1500ms.
assert.equal(networkDurationMs(net), 8000);
assert.equal(tl.playDuration, 6500);
// Endpoints map back exactly.
assert.equal(realAt(tl, 0), 1000);
assert.equal(realAt(tl, tl.playDuration), 9000);
// Clamps outside the range rather than extrapolating.
assert.equal(realAt(tl, -500), 1000);
assert.equal(realAt(tl, 99999), 9000);
// Monotonic: playback never runs backwards in real time.
let prevReal = -Infinity;
for (let p = 0; p <= tl.playDuration; p += 250) {
  const r = realAt(tl, p);
  assert.ok(r >= prevReal, `monotonic at play=${p}`);
  prevReal = r;
}
// Midpoint of the clipped final gap lands halfway through the real gap.
const beforeLast = tl.points[tl.points.length - 2];
assert.equal(realAt(tl, beforeLast.play + 750), 7500);
// An uncompressed timeline preserves the real span exactly.
assert.equal(compressTimeline(net, 1e9).playDuration, 8000);

const emptyTl = compressTimeline(
  buildNetwork({ nodes: [], evaluations: [], entries: [] }),
);
assert.equal(emptyTl.playDuration, 0);
assert.equal(emptyTl.points.length, 1);

// ── empty input ────────────────────────────────────────────────────────────
const empty = buildNetwork({ nodes: [], evaluations: [], entries: [] });
assert.deepEqual(empty.agents, []);
assert.deepEqual(empty.edges, []);
assert.equal(networkDurationMs(empty), 0);
assert.equal(frameAt(empty, 123).eventsSoFar, 0);

// An agent assigned a node but silent in the record still gets drawn.
const silent = buildNetwork({
  nodes: [{ node_id: "n", depends_on: [], assigned_agent_id: "ghost-agent" }],
  evaluations: [],
  entries,
});
assert.ok(silent.agents.some((a) => a.agent_id === "ghost-agent"));
assert.equal(
  silent.agents.find((a) => a.agent_id === "ghost-agent")!.eventCount,
  0,
);

// ── geometry ───────────────────────────────────────────────────────────────
const path = edgePath({ x: 0, y: 0 }, { x: 100, y: 50 });
assert.ok(path.startsWith("M 0 0 C "));
assert.ok(path.includes("100 50"));

console.log("network-core tests passed");
