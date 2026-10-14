import assert from "node:assert/strict";
import { buildTreeling, hashSeed, speciesFor, statureFromReputation } from "./treeling";
import { agentTerms, queryTerms, termsOverlap } from "./match";
import { oklchTokenToRgb } from "./color";

// The same agent must draw identically on every surface: the seed alone fixes the shape.
const a = buildTreeling({ seed: "nia-context", capabilities: ["doc-and-research-paper-search"] });
const b = buildTreeling({ seed: "nia-context", capabilities: ["doc-and-research-paper-search"] });
assert.deepEqual(a, b);
assert.notDeepEqual(
  buildTreeling({ seed: "agent-one", species: "oak" }).body,
  buildTreeling({ seed: "agent-two", species: "oak" }).body,
);
assert.equal(hashSeed("arbor"), hashSeed("arbor"));

// Species reads the name first, so a bid (id only) and a directory card
// (id plus capabilities) agree whenever the name names the trade.
assert.equal(speciesFor([], "github-pr-review"), "conifer");
assert.equal(speciesFor(["code-review"], "github-pr-review"), "conifer");
assert.equal(speciesFor(["image generation"], "studio"), "willow");
assert.equal(speciesFor([], "unnamed"), "oak");

// The view box hugs the drawing: the crown or a raised lantern hand is its top edge.
for (const species of ["oak", "conifer", "birch", "willow", "acacia"] as const) {
  const tree = buildTreeling({ seed: `vb-${species}`, species, stature: 1 });
  assert.ok(tree.viewTop >= 0 && tree.viewTop < 150, `${species} viewTop ${tree.viewTop}`);
  assert.equal(tree.eyes.length, 2);
  assert.equal(tree.arms.length, 2);
}

assert.equal(statureFromReputation(undefined), 0.5);
assert.equal(statureFromReputation(0.1), 0);
assert.equal(statureFromReputation(2), 1);

// Matching is plain skill-word overlap, the claim the hero readout makes.
assert.deepEqual(queryTerms("Write the marketing emails for our launch"), ["write", "market", "email", "launch"]);
assert.ok(termsOverlap(queryTerms("review my pull requests"), agentTerms(["pull-request-review"], "Arbor Baseline")));
assert.ok(!termsOverlap(queryTerms("book a flight"), agentTerms(["code-review"], "github-pr-review")));
assert.deepEqual(queryTerms("the and for"), []);

// Token conversion for the canvas forest: white stays white, black stays black.
assert.deepEqual(oklchTokenToRgb("1 0 0"), [255, 255, 255]);
assert.deepEqual(oklchTokenToRgb("0 0 0"), [0, 0, 0]);

console.log("grove ok");
