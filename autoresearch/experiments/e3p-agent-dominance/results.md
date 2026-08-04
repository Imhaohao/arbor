# E3' — Results (2026-08-04, n=336 pooled over 6 sweeps)

## Verdict: dominance CONFIRMED on locked terms — route-to-best adopted

| Prediction | Bar | Measured | Verdict |
|---|---|---|---|
| P1 pooled dominance | both axes | accept 0.786 vs 0.327; $/settled 0.000933 vs 0.001374 | PASS |
| P2 sign consistency | >= 70% of eligible classes | 19 wins / 5 ties / 1 loss of 25 = 76% wins | PASS |
| P3 stability | pooled accept in [0.50, 0.66] | 0.5565 | PASS |
| P4 priced rows | >= 95% | 100% (336/336) | PASS |

Decision rule fired: **route-all-to-backstop** is the adopted routing policy
for E4 comparison. Simulated on pooled real data vs the observed 50/50 mix:
- accept: 0.786 vs 0.557 -> **+22.9pp**
- $/settled: $0.000933 vs $0.001063 -> **-12.2%**
(Simulated-on-real-runs, not yet deployed; deployment measurement is E4+.)

## Per-class structure (6 runs per cell)

- Baseline's only class win: contradiction-detect 1/6 vs 0/6 — noise-level.
- Both agents 0/6: dom-ai-governance, dom-incident-recovery,
  dom-spatial-curation — 0/12 pooled. These three classes are UNSERVABLE by
  the current cheap lane regardless of routing; they are the escalation
  budget's target (E3 probe-gating / terra fan-out), and decline-with-refund
  is more honest than attempting them at the cheap tier.
- Backstop sweeps 22/28 classes at 5/6 or better, including several the
  baseline zeroes (sql-reasoning 6/6 vs 0/6, table-lookup 6/6 vs 0/6,
  regex-spec 6/6 vs 0/6, unit-rate 6/6 vs 0/6, dom-clinical-summary 6/6 vs 0/6).

## Honest variance note
arbor-baseline accept drifted: 41.1% (E2 sweeps) vs 28.6% (E3' sweeps),
pooled 32.7%. Aggregate stability band still held (P3), but per-agent rates
at n=56/sweep-pair carry meaningful noise; policy claims rest on the pooled
336, not any single sweep. Total E3' spend $0.1321; cumulative project spend
~$0.20.
