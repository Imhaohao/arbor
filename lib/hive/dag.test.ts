import assert from "node:assert/strict";
import {
  deterministicFallbackPlan,
  validateDag,
  topologicalLevels,
  readyNodes,
  type PlannedNode,
} from "./dag";

function node(
  id: string,
  depends_on: string[] = [],
): PlannedNode {
  return { id, description: `node ${id}`, depends_on };
}

// cycle rejected
{
  const result = validateDag([
    node("a", ["b"]),
    node("b", ["a"]),
  ]);
  assert.equal(result.ok, false, "cycle should be rejected");
  if (!result.ok) assert.match(result.error, /cycle/i);
}

// dangling dep rejected
{
  const result = validateDag([node("a"), node("b", ["ghost"])]);
  assert.equal(result.ok, false, "dangling dep should be rejected");
  if (!result.ok) assert.match(result.error, /unknown node/i);
}

// self-dependency rejected
{
  const result = validateDag([node("a", ["a"])]);
  assert.equal(result.ok, false, "self-dependency should be rejected");
  if (!result.ok) assert.match(result.error, /itself/i);
}

// >8 nodes rejected
{
  const tooMany = Array.from({ length: 9 }, (_, i) => node(`n${i}`));
  const result = validateDag(tooMany);
  assert.equal(result.ok, false, ">8 nodes should be rejected");
  if (!result.ok) assert.match(result.error, /at most 8/i);
}

// a valid diamond DAG passes validation
const diamond: PlannedNode[] = [
  node("a"),
  node("b", ["a"]),
  node("c", ["a"]),
  node("d", ["b", "c"]),
];
assert.deepEqual(validateDag(diamond), { ok: true }, "diamond DAG must validate");

// Model-free fallback preserves parallel numbered work and dependency gates.
{
  const fallback = deterministicFallbackPlan(
    [
      "Complete this work as a dependency-aware project:",
      "1. Ask Alpha for a read-only acknowledgement.",
      "2. Independently ask Beta for a read-only acknowledgement.",
      "3. After both worksteps finish, combine their outputs into a report.",
      "Do not mutate external state.",
    ].join("\n"),
  );
  assert.equal(fallback.length, 3);
  assert.deepEqual(fallback[0].depends_on, []);
  assert.deepEqual(fallback[1].depends_on, []);
  assert.deepEqual(fallback[2].depends_on, ["step_1", "step_2"]);
  assert.match(fallback[0].description, /Do not mutate external state/);
  assert.deepEqual(validateDag(fallback), { ok: true });
  assert.deepEqual(deterministicFallbackPlan("Do one thing."), [
    { id: "main", description: "Do one thing.", depends_on: [] },
  ]);
}

// diamond DAG topological levels: [["a"],["b","c"],["d"]]
assert.deepEqual(
  topologicalLevels(diamond),
  [["a"], ["b", "c"], ["d"]],
  "diamond topological levels mismatch",
);

// readyNodes: d unlocks only when both b and c are complete
{
  // initial: only a is ready
  assert.deepEqual(
    readyNodes(diamond, {
      a: "pending",
      b: "pending",
      c: "pending",
      d: "pending",
    }),
    ["a"],
    "only a should be ready initially",
  );

  // a complete -> b and c ready, d still locked
  assert.deepEqual(
    readyNodes(diamond, {
      a: "complete",
      b: "pending",
      c: "pending",
      d: "pending",
    }),
    ["b", "c"],
    "b and c should be ready after a completes",
  );

  // only b complete -> d still locked
  assert.deepEqual(
    readyNodes(diamond, {
      a: "complete",
      b: "complete",
      c: "executing",
      d: "pending",
    }),
    [],
    "d must stay locked until both b and c complete",
  );

  // both b and c complete -> d unlocks
  assert.deepEqual(
    readyNodes(diamond, {
      a: "complete",
      b: "complete",
      c: "complete",
      d: "pending",
    }),
    ["d"],
    "d should unlock when both b and c are complete",
  );
}

console.log("dag tests passed");
