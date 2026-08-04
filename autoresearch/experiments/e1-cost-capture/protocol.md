# E1 — Make $/settled measurable (protocol, locked before results)

Hypothesis H1: adding Azure lane prices to MODEL_PRICES and verifying the
usage-parse path makes usd_per_settled_task measurable in one battery sweep.

Prediction (pass/fail, decided before running):
- A single battery task run on the Azure lane (--roster azure default agent)
  produces a battery_runs row with cost_usd > 0, total_tokens > 0, and
  models_used containing the azure model id.
- >= 95% of rows in that mini-sweep carry cost_usd > 0.

Changes in scope:
1. lib/llm-usage.ts: add gpt-5.4-mini and gpt-5.6-terra to MODEL_PRICES at
   published list prices (sourced from Azure/OpenAI pricing pages at run time;
   source URL recorded in results.md — NO invented numbers; if a price cannot
   be sourced, the model stays unpriced and E1 fails honestly).
2. Verify parseOpenAIUsage covers the responses-API usage shape the Azure
   branch returns (judge gpt-5.6-terra runs via responses API).
3. No changes to auction/settlement logic. Instrumentation only.

Sanity checks before trusting results:
- costOfUsage unit test with the new prices (exact arithmetic).
- One manual call via model:smoke returns usage fields non-zero.

Out of scope: llm_usage Convex table writer (secondary; battery_runs is the
metric source), probe-gating (E3), UI metric swap (E4).
