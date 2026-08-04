# E1 — Results (2026-08-04)

## Verdict: H1 SUPPORTED — prediction met at 100% (bar was >=95%)

Battery battery-d1275b6f (2 tasks x arbor-baseline, Azure lane):

| golden | cost_usd | in/out tok | model | acc | audit |
|---|---|---|---|---|---|
| golden-escrow-math | $0.000339 | 339/94 | gpt-5.4-mini | 0.98 | PASS |
| golden-unit-conversion | $0.000437 | 320/141 | gpt-5.4-mini | 0.08 | FAIL |

- 2/2 rows carry cost_usd > 0, token counts, models_used. Arithmetic verified
  by hand: 339x0.375/1M + 94x2.25/1M = $0.000339 exactly.
- First real $/settled datapoint ever recorded: $0.000776 spend / 1 settled =
  $0.000776 (n=1, smoke scale — NOT a baseline; E2 establishes that).
- Smoke call (pre-battery): gpt-5.4-mini answered escrow arithmetic correctly
  for $0.000028 (33/7 tokens).

## Discovered along the way (exploratory, not in protocol)

1. MISPRICING BUG (fixed): priceForModel longest-prefix matched gpt-5.4-mini
   and gpt-5.6-terra to the "gpt-5" entry — 5.4-mini billed 3.3-4.4x too HIGH,
   terra 2x too LOW. The smoke call would have reported $0.000111 instead of
   $0.000028 (3.95x). Every earlier state-file claim that Azure models were
   "cost unknown" was wrong: they were silently mispriced. Fixed with explicit
   MODEL_PRICES entries + regression tests (llm-usage.test.ts).
2. ROSTER GAP (feeds E2): specialist runners bypass the Azure lane.
   nia-context execution hit direct OpenAI -> 429 "no credit";
   reacher-social's backend errored. Only callOpenAI-based runners
   (arbor-baseline lineage) ride the funded lane. E2 roster must be
   azure-lane runners, or the runners need the purpose-routed client.
3. gpt-5.4-mini failed unit conversion (acc 0.08) while acing escrow math
   (0.98) — early hint that per-task-class routing (H3+) has real spread to
   exploit even within one model.

## Price sourcing (protocol requirement)

- gpt-5.4-mini $0.375 in / $2.25 out per MTok — current list per
  pricepertoken.com and cloudprice.net, 2026-08-04. CONFLICT NOTED: one
  aggregator still lists the pre-drop $0.75/$4.50; if billing disputes the
  lower rate, measured costs here understate by 2x. Cache-read multiplier
  left at OpenAI default 0.25 (family-specific caching unpublished).
- gpt-5.6-terra $2.50 in / $15 out, cache write 1.25x ($3.125), cache read
  0.1x ($0.25) — official rate per requesty.ai and apidog.com, 2026-08-04.
