# E4 — Results (2026-08-04)

## Verdict: H4 SUPPORTED — all three parts pass

P1 FRONTIER (pooled, no new runs): class-conditional policy =
  $0.000986/settled @ 88.3% accept-on-attempted, coverage 26/28.
  (bars: <= $0.0015, >= 0.78, 26/28 — all met). Decline-with-refund
  FINALIZED for dom-ai-governance + dom-incident-recovery (incident keeps
  the E5 golden-review caveat).

P2 METRIC: counterfactualSaving() on all 132 settled backstop@mini rows:
  positive 132/132 (100%), mean $0.001692, median $0.000882,
  range [$0.000318, $0.012621], frontier/actual ratio 4.25x.
  (bars: >= 95% positive, mean in [$0.001, $0.02] — met.)

P3 WIRING (organic e2e): task js71gbxmrktqpyjafw7vbv6yrh8bvda6 posted
  through the real auction; winner arbor-hive-backstop; row recorded
  execution_cost_usd $0.000679, 1270/90 tokens, models [gpt-5.4-mini].
  Browser-verified via DOM text on the live task page:
  "Routing saved you (measured) $0.0018 — $0.0025 at frontier list vs
  $0.0007 actual", model-tagged, "List price, not an invoice" footer;
  the "You saved" headroom label is GONE (headroomAsSaved=false).
  Unmeasured branch ("Budget unspent ... not a savings figure") is
  unit-tested (honest-savings.test.ts); browser proof of the measured
  branch only — pane scroll artifact blocked a below-fold screenshot,
  DOM innerText is the recorded evidence.

## The demonstration case nobody planned

The e2e task paid its full budget (price_paid = max_budget = $0.40), so the
OLD panel would have shown "You saved $0.00" while measured saving is
$0.0018. Headroom does not just overstate savings — on full-budget runs it
UNDERSTATES them. Wrong in both directions is the strongest argument for
the swap.

## Deltas landed
- lib/honest-savings.ts + test (registered in npm test)
- schema: tasks.execution_{cost_usd,input_tokens,output_tokens,models}
- auctions.execute wraps runner in collectUsage -> _recordExecutionUsage
  (range-guarded internal mutation, returns v.null())
- ValueImpactPanel: measured/unmeasured discriminated render + sub-cent
  formatter (formatMoney rounds $0.0018 to $0.00 — found in browser verify)
- Follow-up flagged, out of scope: "Efficiency improved vs 30-min
  generalist baseline" is still an invented constant; judge-call cost not
  yet attributed to tasks; external-infra agents record no cost (absence
  renders as unmeasured, honestly).

Typecheck, honest-savings/llm-usage tests, and convex test suite green.
