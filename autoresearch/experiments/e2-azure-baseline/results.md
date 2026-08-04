# E2 — Results (2026-08-04, batteries e17aeedf + b3c3be6c)

## Verdict: H2 SUPPORTED — all four locked predictions pass

n = 112 completed runs (28 tasks x 2 agents x 2 sweeps), 0 errors.

| Prediction | Bar | Measured | Verdict |
|---|---|---|---|
| P1 accept rate | 0.30-0.70 | 65/112 = **0.580** | PASS |
| P2 rows priced | >= 95% | 112/112 = 100% | PASS |
| P3 $/settled | <= $0.02 | **$0.001026** | PASS (19.5x under) |
| P4 agent completion | >= 80% | 100% both agents | PASS |

BASELINES (the numbers every later experiment compares against):
- usd_per_settled_task = $0.001026  (total $0.0667 / 65 passed)
- judge_accept_rate    = 0.580
- grader mix: 112/112 model-graded (default Azure deployment)

## Exploratory (not in protocol, flagged as such)

1. AGENT DOMINANCE, BOTH AXES: arbor-hive-backstop passed 42/56 (75%) at
   $0.00098/settled; arbor-baseline passed 23/56 (41%) at $0.00111/settled.
   The higher-accept agent is ALSO cheaper per settled task. If this holds,
   routing 100% to backstop beats the 50/50 mix on both target and guardrail
   — a trivially implementable routing gain worth ~$0.0001/settled and +17pp
   accept. Candidate E3': verify dominance holds per task class, n>=4 sweeps.
2. TASK-CLASS BIMODALITY: 9/28 classes pass 4/4 (escrow-math, json-extraction,
   probability, weighted-average, percentage-change, ordering-constraints,
   invoice-extraction, code-bugfix, dom-security-review); 6/28 pass 0/4
   (contradiction-detect acc 0.05, dom-incident-recovery 0.10,
   dom-capability-routing, dom-ai-governance, dom-spatial-curation,
   dom-web-retrieval). The failing set is dominated by dom-* (domain-expert)
   classes — exactly where escalation to gpt-5.6-terra or fan-out should
   spend, and where the cheap lane should decline. Direct input to H3/E3.
3. Cost spread per class is 11.7x ($0.00071 json-extraction to $0.00828
   dom-capability-routing) — token length tracks task class, so class-aware
   budget caps are feasible.

## Sanity notes
- The 2 unpriced rows in the 45-min window belong to E1's aborted first
  mini-sweep (nia-context 429, reacher-social backend error) — excluded from
  E2 scope; E2's own priced share is 100%.
- Same-family grader caveat carries over from protocol; accept-rate baseline
  is conditional on this grader identity.
