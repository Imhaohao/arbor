import assert from "node:assert/strict";
import {
  arborHiveBackstop,
  ARBOR_HIVE_BACKSTOP_CONFIG,
  ARBOR_HIVE_BACKSTOP_LABEL,
} from "./arbor-hive-backstop";
import { ARBOR_FLOOR_AGENT_IDS } from "./registry";

// The whole point of the floor: it must bid on EVERY task class and never
// decline, so no hive node can fail for lack of a plausible bidder.
async function testNeverDeclines() {
  const prompts = [
    "Contrast two open agent-interoperability protocols in a short paragraph.",
    "Classify this support ticket as bug, feature, or question.",
    "Extract all dates from the following text.",
    "Generate a product launch checklist.",
    "Review https://github.com/foo/bar/pull/12", // even PR-shaped tasks
  ];
  for (const p of prompts) {
    const decision = await arborHiveBackstop.bid(p, "general");
    assert.ok(!("decline" in decision), `floor declined: ${p}`);
    if (!("decline" in decision)) {
      assert.ok(decision.bid_price > 0, "bid_price > 0");
      assert.ok(
        decision.capability_claim.includes(ARBOR_HIVE_BACKSTOP_LABEL),
        "claim is honestly labeled",
      );
      assert.equal(decision.plan_source, "baseline");
    }
  }
}

// With an advertised ceiling the floor bids at/under it (a valid bid) but high
// enough that reputation/price stays the lowest of any live bidder.
async function testLastResortPrice() {
  const decision = await arborHiveBackstop.bid(
    "Summarize the input.\n\nBudget ceiling: $2.00",
    "general",
  );
  assert.ok(!("decline" in decision));
  if (!("decline" in decision)) {
    assert.ok(decision.bid_price <= 2.0, "bid <= ceiling");
    assert.ok(
      decision.bid_price >= ARBOR_HIVE_BACKSTOP_CONFIG.cost_baseline,
      "bid >= cost baseline",
    );
  }
}

function testFloorMembershipAndEconomics() {
  assert.ok(ARBOR_FLOOR_AGENT_IDS.has("arbor-hive-backstop"));
  assert.ok(ARBOR_FLOOR_AGENT_IDS.has("arbor-baseline"));
  // Must stay last-resort: very low reputation keeps reputation/price under any
  // live specialist, so screen-exemption never lets it outrank real supply.
  assert.ok(ARBOR_HIVE_BACKSTOP_CONFIG.starting_reputation <= 0.1);
}

async function main() {
  await testNeverDeclines();
  await testLastResortPrice();
  testFloorMembershipAndEconomics();
  console.log("arbor-hive-backstop tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
