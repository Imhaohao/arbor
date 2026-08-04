import assert from "node:assert/strict";
import {
  cacheHitRate,
  collectUsage,
  recordLlmCall,
  setUsageObserver,
  costOfUsage,
  emptyUsageTotals,
  parseAnthropicUsage,
  parseOpenAIUsage,
  priceForModel,
  repriceOnModel,
  sumUsage,
  totalInputTokens,
  type LlmCallRecord,
  type TokenUsage,
} from "./llm-usage";

// ─── priceForModel ───────────────────────────────────────────────────────────
// Longest-prefix match so dated snapshots resolve to their family.
assert.equal(priceForModel("claude-opus-5")?.input_per_mtok, 5);
assert.equal(priceForModel("claude-opus-5-20260514")?.input_per_mtok, 5);
assert.equal(priceForModel("CLAUDE-SONNET-5")?.input_per_mtok, 3, "case-insensitive");
assert.equal(priceForModel("  gpt-5.2  ")?.input_per_mtok, 1.25, "trims");
// "gpt-5.2" must win over the shorter "gpt-5" prefix.
assert.equal(priceForModel("gpt-5.2")?.output_per_mtok, 10);
// Unknown models must be undefined, never a $0 default.
assert.equal(priceForModel("llama-3-70b"), undefined, "unknown -> undefined");
assert.equal(priceForModel(""), undefined, "empty -> undefined");
// Azure lane models must resolve to their OWN entries, not fall through to the
// "gpt-5" prefix — the fall-through mispriced 5.4-mini 3.3x high and terra 2x low.
assert.equal(priceForModel("gpt-5.4-mini")?.input_per_mtok, 0.375);
assert.equal(priceForModel("gpt-5.4-mini")?.output_per_mtok, 2.25);
assert.equal(priceForModel("gpt-5.6-terra")?.input_per_mtok, 2.5);
assert.equal(priceForModel("gpt-5.6-terra")?.cache_read_multiplier, 0.1, "terra caches Anthropic-style");
// A dated Azure deployment snapshot still resolves to the family entry.
assert.equal(priceForModel("gpt-5.4-mini-2026-03-17")?.input_per_mtok, 0.375);

// ─── costOfUsage ─────────────────────────────────────────────────────────────
// 1M input + 1M output on Opus 5 = $5 + $25.
assert.equal(
  costOfUsage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, "claude-opus-5"),
  30,
);
// Cache reads bill at 0.1x input: 1M cache reads on Opus 5 = $0.50, not $5.
assert.equal(
  costOfUsage(
    { input_tokens: 0, output_tokens: 0, cache_read_tokens: 1_000_000 },
    "claude-opus-5",
  ),
  0.5,
  "cache reads must bill at 0.1x base input",
);
// Cache writes bill at 1.25x input: 1M writes on Opus 5 = $6.25.
assert.equal(
  costOfUsage(
    { input_tokens: 0, output_tokens: 0, cache_write_tokens: 1_000_000 },
    "claude-opus-5",
  ),
  6.25,
  "cache writes must bill at 1.25x base input",
);
// reasoning_tokens must NOT be added on top of output_tokens (double-billing).
const withReasoning: TokenUsage = {
  input_tokens: 0,
  output_tokens: 1_000_000,
  reasoning_tokens: 900_000,
};
assert.equal(
  costOfUsage(withReasoning, "gpt-5.2"),
  costOfUsage({ input_tokens: 0, output_tokens: 1_000_000 }, "gpt-5.2"),
  "reasoning tokens are already inside output_tokens; costing them again double-bills",
);
// Unpriced model -> undefined, so a call is never silently free.
assert.equal(
  costOfUsage({ input_tokens: 1000, output_tokens: 1000 }, "mystery-model"),
  undefined,
  "unpriced model -> undefined, not 0",
);
// Negative / non-finite counts are floored at 0 rather than crediting money back.
assert.equal(
  costOfUsage({ input_tokens: -1_000_000, output_tokens: 0 }, "claude-opus-5"),
  0,
  "negative tokens must not produce negative cost",
);
assert.equal(
  costOfUsage({ input_tokens: NaN, output_tokens: 1_000_000 }, "claude-opus-5"),
  25,
  "NaN input is treated as 0, output still bills",
);
assert.equal(costOfUsage({ input_tokens: 0, output_tokens: 0 }, "claude-opus-5"), 0);

// ─── totalInputTokens / cacheHitRate ─────────────────────────────────────────
assert.equal(
  totalInputTokens({
    input_tokens: 50,
    output_tokens: 0,
    cache_write_tokens: 100,
    cache_read_tokens: 850,
  }),
  1000,
);
assert.equal(
  cacheHitRate({
    input_tokens: 50,
    output_tokens: 0,
    cache_write_tokens: 100,
    cache_read_tokens: 850,
  }),
  0.85,
);
// No input at all is "no data", not "no cache hits".
assert.equal(
  cacheHitRate({ input_tokens: 0, output_tokens: 500 }),
  undefined,
  "zero input -> undefined, not 0",
);

// ─── parseAnthropicUsage ─────────────────────────────────────────────────────
// The shape straight from the prompt-caching docs.
const anth = parseAnthropicUsage({
  usage: {
    input_tokens: 50,
    cache_read_input_tokens: 100_000,
    cache_creation_input_tokens: 0,
    output_tokens: 503,
  },
});
assert.ok(anth);
assert.equal(anth.input_tokens, 50);
assert.equal(anth.output_tokens, 503);
assert.equal(anth.cache_read_tokens, 100_000);
assert.equal(anth.cache_write_tokens, 0);
// total input = 50 + 0 + 100000, and cache reads dominate the bill's token count
assert.equal(totalInputTokens(anth), 100_050);
// A missing usage block must be undefined, not a zero-cost record.
assert.equal(parseAnthropicUsage({}), undefined, "no usage block -> undefined");
assert.equal(parseAnthropicUsage(null), undefined, "null body -> undefined");
assert.equal(parseAnthropicUsage({ usage: {} }), undefined, "empty usage -> undefined");
// Absent cache fields stay absent (provider silence != zero).
const noCache = parseAnthropicUsage({
  usage: { input_tokens: 10, output_tokens: 20 },
});
assert.ok(noCache);
assert.equal(noCache.cache_read_tokens, undefined);
assert.equal(noCache.cache_write_tokens, undefined);

// ─── parseOpenAIUsage ────────────────────────────────────────────────────────
// Chat Completions shape. cached_tokens is INSIDE prompt_tokens and must be
// split out so it does not bill at the full input rate.
const chat = parseOpenAIUsage({
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 500,
    prompt_tokens_details: { cached_tokens: 800 },
    completion_tokens_details: { reasoning_tokens: 400 },
  },
});
assert.ok(chat);
assert.equal(chat.input_tokens, 200, "1000 total - 800 cached = 200 at full rate");
assert.equal(chat.cache_read_tokens, 800);
assert.equal(chat.output_tokens, 500);
assert.equal(chat.reasoning_tokens, 400);
assert.equal(totalInputTokens(chat), 1000, "split must preserve the input total");

// Responses API shape.
const resp = parseOpenAIUsage({
  usage: {
    input_tokens: 2000,
    output_tokens: 900,
    input_tokens_details: { cached_tokens: 1500 },
    output_tokens_details: { reasoning_tokens: 700 },
  },
});
assert.ok(resp);
assert.equal(resp.input_tokens, 500);
assert.equal(resp.cache_read_tokens, 1500);
assert.equal(resp.reasoning_tokens, 700);
assert.equal(totalInputTokens(resp), 2000);

assert.equal(parseOpenAIUsage({}), undefined, "no usage -> undefined");
assert.equal(parseOpenAIUsage({ usage: {} }), undefined, "empty usage -> undefined");
// No cache/reasoning reported -> fields absent rather than 0.
const plain = parseOpenAIUsage({
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});
assert.ok(plain);
assert.equal(plain.cache_read_tokens, undefined);
assert.equal(plain.reasoning_tokens, undefined);

// A reasoning-heavy call costs far more than its visible output suggests — the
// specific asymmetry that makes OpenAI spend easy to underestimate.
const reasoningCost = costOfUsage(resp, "gpt-5.2");
assert.ok(reasoningCost !== undefined);
const visibleOnly = costOfUsage(
  { input_tokens: resp.input_tokens, output_tokens: 900 - 700 },
  "gpt-5.2",
);
assert.ok(visibleOnly !== undefined);
assert.ok(
  reasoningCost > visibleOnly,
  "billing all output tokens must exceed billing only the visible completion",
);

// ─── sumUsage ────────────────────────────────────────────────────────────────
const empty = emptyUsageTotals();
assert.equal(empty.calls, 0);
assert.equal(empty.cost_usd, 0);
assert.equal(empty.unpriced_calls, 0);
assert.deepEqual(sumUsage([]), empty, "empty input -> empty totals");

const records: LlmCallRecord[] = [
  {
    provider: "anthropic",
    model: "claude-opus-5",
    usage: { input_tokens: 1_000_000, output_tokens: 0 },
    cost_usd: 5,
    phase: "judge",
  },
  {
    provider: "openai",
    model: "gpt-5.2",
    usage: {
      input_tokens: 500_000,
      output_tokens: 100_000,
      cache_read_tokens: 500_000,
      reasoning_tokens: 80_000,
    },
    cost_usd: 1.78125,
    phase: "planner",
  },
  {
    provider: "openrouter",
    model: "some-unpriced-model",
    usage: { input_tokens: 1000, output_tokens: 1000 },
    // cost_usd intentionally undefined
    phase: "bid",
  },
];
const totals = sumUsage(records);
assert.equal(totals.calls, 3);
assert.equal(totals.input_tokens, 1_501_000);
assert.equal(totals.output_tokens, 101_000);
assert.equal(totals.cache_read_tokens, 500_000);
assert.equal(totals.reasoning_tokens, 80_000);
assert.equal(
  totals.unpriced_calls,
  1,
  "an unpriced call must be counted so the total can be labelled a lower bound",
);
assert.ok(
  Math.abs(totals.cost_usd - 6.78125) < 1e-9,
  `expected 6.78125, got ${totals.cost_usd}`,
);

// ─── repriceOnModel ──────────────────────────────────────────────────────────
// The counterfactual baseline: same observed tokens, priced on one model.
const cheap: LlmCallRecord[] = [
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    cost_usd: 6,
  },
];
assert.equal(repriceOnModel(cheap, "claude-haiku-4-5"), 6, "self-reprice is identity");
assert.equal(
  repriceOnModel(cheap, "claude-opus-5"),
  30,
  "same tokens on Opus 5 = $5 + $25",
);
// So the honest saving from routing to Haiku is 30 - 6 = 24, and it is a
// repricing claim, not a claim about what Opus would have produced.
const baseline = repriceOnModel(cheap, "claude-opus-5");
const actual = sumUsage(cheap).cost_usd;
assert.ok(baseline !== undefined);
assert.equal(baseline - actual, 24);
// Unknown reference model -> undefined so the UI shows "baseline unavailable".
assert.equal(
  repriceOnModel(cheap, "mystery-model"),
  undefined,
  "unpriced reference -> undefined, never a fabricated baseline",
);
// A record whose usage cannot be priced on the reference poisons the whole
// baseline rather than silently contributing $0.
assert.equal(repriceOnModel(records, "mystery-model"), undefined);
assert.equal(repriceOnModel([], "claude-opus-5"), 0, "no calls -> $0 baseline");

// Async assertions live in main() — top-level await breaks the tsx CJS transform.
async function main(): Promise<void> {
  // ─── recording hook ──────────────────────────────────────────────────────────
  // With no observer set, recording must be a silent no-op (the provider clients
  // call it unconditionally).
  recordLlmCall(records[0]);

  const collected = await collectUsage(async () => {
    recordLlmCall(records[0]);
    recordLlmCall(records[1]);
    return "result";
  });
  assert.equal(collected.result, "result", "collectUsage must return fn's value");
  assert.equal(collected.records.length, 2);
  assert.equal(collected.totals.calls, 2);
  assert.ok(Math.abs(collected.totals.cost_usd - 6.78125) < 1e-9);

  // The observer must be restored afterwards, so calls outside the block are not
  // attributed to it.
  recordLlmCall(records[2]);
  assert.equal(collected.records.length, 2, "observer must not outlive the block");

  // Restoration must also happen when fn throws, else one failed call silently
  // captures every later call in the isolate.
  await assert.rejects(
    collectUsage(async () => {
      recordLlmCall(records[0]);
      throw new Error("boom");
    }),
    /boom/,
  );
  const afterThrow = await collectUsage(async () => {
    recordLlmCall(records[0]);
    return 1;
  });
  assert.equal(
    afterThrow.records.length,
    1,
    "a throw inside collectUsage must not leak the observer",
  );

  // A throwing observer must not break the model call it only measures.
  setUsageObserver(() => {
    throw new Error("observer exploded");
  });
  assert.doesNotThrow(
    () => recordLlmCall(records[0]),
    "a broken observer must never fail the call",
  );
  setUsageObserver(undefined);

  // Nesting restores the outer observer rather than clearing it.
  const outer = await collectUsage(async () => {
    recordLlmCall(records[0]);
    const inner = await collectUsage(async () => {
      recordLlmCall(records[1]);
      return 0;
    });
    assert.equal(inner.records.length, 1, "inner block sees only its own calls");
    recordLlmCall(records[0]);
    return 0;
  });
  assert.equal(
    outer.records.length,
    2,
    "outer block sees its own calls but not the inner block's",
  );
}

void main().then(() => {
  console.log("llm-usage.test.ts: all assertions passed");
});
