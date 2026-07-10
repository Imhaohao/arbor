import assert from "node:assert/strict";
import {
  admitGenome,
  evolutionEnabled,
  fuseArtifacts,
  genomeId,
  isDescendantOf,
  lineageOf,
  mutateArtifact,
  promotionRequiresApproval,
  seedGenome,
  selectParents,
  type ArtifactGenome,
} from "./evolution-core";

// ─── master switch ───────────────────────────────────────────────────────────

{
  const prev = process.env.ARBOR_HIVE_EVOLUTION_ENABLED;
  delete process.env.ARBOR_HIVE_EVOLUTION_ENABLED;
  assert.equal(evolutionEnabled(), false, "default off");
  process.env.ARBOR_HIVE_EVOLUTION_ENABLED = "enabled";
  assert.equal(evolutionEnabled(), true, "'enabled' turns it on");
  if (prev === undefined) delete process.env.ARBOR_HIVE_EVOLUTION_ENABLED;
  else process.env.ARBOR_HIVE_EVOLUTION_ENABLED = prev;
}

// ─── deterministic id ────────────────────────────────────────────────────────

{
  const a = genomeId({
    kind: "prompt_template",
    content: "hello",
    lineage_parent_ids: ["x"],
    generation: 1,
  });
  const b = genomeId({
    kind: "prompt_template",
    content: "hello",
    lineage_parent_ids: ["x"],
    generation: 1,
  });
  assert.equal(a, b, "same inputs → same id (idempotent archive)");
  const c = genomeId({
    kind: "prompt_template",
    content: "hello!",
    lineage_parent_ids: ["x"],
    generation: 1,
  });
  assert.notEqual(a, c, "different content → different id");
  // Parent order does not matter (sorted).
  const p1 = genomeId({
    kind: "role_spec",
    content: "z",
    lineage_parent_ids: ["a", "b"],
    generation: 2,
  });
  const p2 = genomeId({
    kind: "role_spec",
    content: "z",
    lineage_parent_ids: ["b", "a"],
    generation: 2,
  });
  assert.equal(p1, p2, "parent order is normalized");
}

// ─── mutation never touches parent; child is a proposal ──────────────────────

{
  const parent = seedGenome({
    kind: "prompt_template",
    content: "Answer the question.",
    behavior_descriptor: "concise",
    score: 0.7,
  });
  const frozen = JSON.stringify(parent);
  const child = mutateArtifact(parent, "tweak", "Answer the question step by step.");
  assert.equal(JSON.stringify(parent), frozen, "parent is not mutated (reversible)");
  assert.equal(child.status, "proposed", "mutation yields a proposal, not a promotion");
  assert.equal(child.generation, 1, "generation increments");
  assert.deepEqual(child.lineage_parent_ids, [parent.id], "lineage links to parent");
  assert.equal(child.op, "tweak");
  assert.equal(child.behavior_descriptor, "concise", "inherits parent descriptor by default");
}

// ─── fusion of two same-kind parents ─────────────────────────────────────────

{
  const a = seedGenome({ kind: "tool_allowlist", content: '["web"]', score: 0.6 });
  const b = seedGenome({ kind: "tool_allowlist", content: '["fs"]', score: 0.65 });
  const fused = fuseArtifacts(a, b, '["web","fs"]');
  assert.equal(fused.op, "fuse");
  assert.deepEqual(fused.lineage_parent_ids.sort(), [a.id, b.id].sort());
  assert.equal(fused.generation, 1);
  assert.throws(
    () =>
      fuseArtifacts(
        a,
        seedGenome({ kind: "prompt_template", content: "x" }),
        "y",
      ),
    /different kinds/,
    "cannot fuse across kinds",
  );
}

// ─── quality-diversity parent selection ──────────────────────────────────────

{
  const archive: ArtifactGenome[] = [
    { ...seedGenome({ kind: "prompt_template", content: "a", behavior_descriptor: "concise", score: 0.9 }), status: "evaluated" },
    { ...seedGenome({ kind: "prompt_template", content: "b", behavior_descriptor: "concise", score: 0.85 }), status: "evaluated" },
    { ...seedGenome({ kind: "prompt_template", content: "c", behavior_descriptor: "verbose", score: 0.6 }), status: "evaluated" },
    // unevaluated proposal must be ineligible
    seedGenome({ kind: "prompt_template", content: "d", behavior_descriptor: "verbose" }),
  ];
  // give the proposal "proposed" status explicitly
  archive[3] = { ...archive[3], status: "proposed", score: undefined };

  const parents = selectParents(archive, 2);
  assert.equal(parents.length, 2);
  const descriptors = new Set(parents.map((p) => p.behavior_descriptor));
  assert.ok(
    descriptors.has("concise") && descriptors.has("verbose"),
    "diversity: picks one elite per behavior bucket before filling by score",
  );
  assert.ok(
    !parents.some((p) => p.content === "d"),
    "unevaluated proposals are ineligible as parents",
  );
}

{
  assert.deepEqual(selectParents([], 3), [], "empty archive → no parents");
}

// ─── admission gate ──────────────────────────────────────────────────────────

const HARNESS = "harness-v1";

{
  // Harness tampering → hard reject, regardless of score.
  const r = admitGenome({
    candidate: seedGenome({ kind: "prompt_template", content: "x" }),
    evaluatorScore: 0.99,
    parentScore: 0.5,
    harnessId: "hacked-harness",
    expectedHarnessId: HARNESS,
    approved: true,
  });
  assert.equal(r.status, "rejected", "tampered harness is rejected");
  assert.match(r.reason, /harness/i);
}

{
  // Did not beat parent → rejected.
  const r = admitGenome({
    candidate: seedGenome({ kind: "prompt_template", content: "x" }),
    evaluatorScore: 0.5,
    parentScore: 0.7,
    harnessId: HARNESS,
    expectedHarnessId: HARNESS,
    approved: true,
  });
  assert.equal(r.status, "rejected", "regression is rejected even if approved");
}

{
  // Beats parent but NOT approved → evaluated (never auto-promote).
  const r = admitGenome({
    candidate: seedGenome({ kind: "prompt_template", content: "x" }),
    evaluatorScore: 0.85,
    parentScore: 0.7,
    harnessId: HARNESS,
    expectedHarnessId: HARNESS,
    approved: false,
  });
  assert.equal(r.status, "evaluated", "improvement without approval is NOT promoted");
  assert.match(r.reason, /approval/i);
}

{
  // Beats parent AND approved → promoted.
  const r = admitGenome({
    candidate: {
      ...seedGenome({ kind: "prompt_template", content: "x" }),
      approved_by: "imzihao",
    },
    evaluatorScore: 0.85,
    parentScore: 0.7,
    harnessId: HARNESS,
    expectedHarnessId: HARNESS,
    approved: true,
  });
  assert.equal(r.status, "promoted");
}

{
  // minImprovement guards against noise.
  const r = admitGenome({
    candidate: seedGenome({ kind: "prompt_template", content: "x" }),
    evaluatorScore: 0.71,
    parentScore: 0.7,
    harnessId: HARNESS,
    expectedHarnessId: HARNESS,
    approved: true,
    minImprovement: 0.05,
  });
  assert.equal(r.status, "rejected", "sub-threshold gain is not a real improvement");
}

{
  assert.equal(promotionRequiresApproval("rubric_weights"), true);
  assert.equal(promotionRequiresApproval("dag_prior"), true);
}

// ─── lineage / replay ────────────────────────────────────────────────────────

{
  const root = seedGenome({ kind: "role_spec", content: "v0" });
  const g1 = mutateArtifact(root, "tweak", "v1");
  const g2 = mutateArtifact(g1, "tweak", "v2");
  const archive = [root, g1, g2];

  const chain = lineageOf(archive, g2.id);
  assert.deepEqual(
    chain.map((g) => g.content),
    ["v2", "v1", "v0"],
    "lineage walks child → ancestors to root",
  );
  assert.equal(isDescendantOf(archive, g2.id, root.id), true, "g2 descends from root");
  assert.equal(isDescendantOf(archive, root.id, g2.id), false, "root does not descend from g2");
}

{
  // Cycle safety: a malformed archive must not loop forever.
  const a: ArtifactGenome = {
    id: "a",
    kind: "prompt_template",
    content: "a",
    lineage_parent_ids: ["b"],
    generation: 1,
    status: "evaluated",
  };
  const b: ArtifactGenome = {
    id: "b",
    kind: "prompt_template",
    content: "b",
    lineage_parent_ids: ["a"],
    generation: 1,
    status: "evaluated",
  };
  const chain = lineageOf([a, b], "a");
  assert.ok(chain.length <= 2, "cycle is broken, not infinite");
}

console.log("evolution-core.test.ts: all assertions passed");
