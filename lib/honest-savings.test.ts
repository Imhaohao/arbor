import assert from "node:assert/strict";
import {
  counterfactualSaving,
  savingsDisplay,
  FRONTIER_COUNTERFACTUAL_MODEL,
} from "./honest-savings";

// ─── counterfactualSaving arithmetic ─────────────────────────────────────────
// gpt-5.2 list: $1.25/MTok in, $10/MTok out. 243 in + 79 out (real E2 row):
// frontier = 243*1.25/1M + 79*10/1M = 0.00030375 + 0.00079 = 0.00109375.
{
  const cf = counterfactualSaving({
    input_tokens: 243,
    output_tokens: 79,
    cost_usd: 0.000269,
  });
  assert.ok(cf, "priced frontier model must yield a result");
  assert.ok(Math.abs(cf.frontier_cost_usd - 0.00109375) < 1e-9);
  assert.ok(Math.abs(cf.saving_usd - (0.00109375 - 0.000269)) < 1e-9);
  assert.ok(cf.ratio > 4 && cf.ratio < 4.1, "ratio ~4.07 for this row");
}

// Missing tokens or cost -> undefined, never a fabricated number.
assert.equal(counterfactualSaving({ cost_usd: 0.01 }), undefined);
assert.equal(
  counterfactualSaving({ input_tokens: 10, output_tokens: 5 }),
  undefined,
);
// Unknown frontier model -> undefined.
assert.equal(
  counterfactualSaving(
    { input_tokens: 10, output_tokens: 5, cost_usd: 0.001 },
    "unpriced-model-xyz",
  ),
  undefined,
);
// Negative inputs are invalid, not zero.
assert.equal(
  counterfactualSaving({ input_tokens: -1, output_tokens: 5, cost_usd: 0.1 }),
  undefined,
);
// A saving can be negative (routed cost above frontier) — report it honestly.
{
  const cf = counterfactualSaving({
    input_tokens: 100,
    output_tokens: 100,
    cost_usd: 0.5,
  });
  assert.ok(cf && cf.saving_usd < 0, "negative saving must survive, not clamp");
}

// ─── savingsDisplay gating ───────────────────────────────────────────────────
// Full measured fields -> measured display.
{
  const d = savingsDisplay({
    max_budget: 2,
    price_paid: 0.5,
    execution_cost_usd: 0.000269,
    execution_input_tokens: 243,
    execution_output_tokens: 79,
    execution_models: ["gpt-5.4-mini"],
  });
  assert.equal(d.kind, "measured");
  if (d.kind === "measured") {
    assert.equal(d.actual_cost_usd, 0.000269);
    assert.deepEqual(d.models, ["gpt-5.4-mini"]);
  }
}
// No measured cost -> unmeasured, headroom exposed only as budget_unspent.
{
  const d = savingsDisplay({ max_budget: 2, price_paid: 0.5 });
  assert.equal(d.kind, "unmeasured");
  if (d.kind === "unmeasured") {
    assert.equal(d.budget_unspent_usd, 1.5);
  }
}
// No pricing data at all -> unmeasured with undefined unspent.
{
  const d = savingsDisplay({});
  assert.equal(d.kind, "unmeasured");
  if (d.kind === "unmeasured") assert.equal(d.budget_unspent_usd, undefined);
}

assert.equal(FRONTIER_COUNTERFACTUAL_MODEL, "gpt-5.2");
console.log("honest-savings.test.ts: all assertions passed");
