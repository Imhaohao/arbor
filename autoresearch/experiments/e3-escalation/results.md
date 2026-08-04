# E3 — Results (2026-08-04, arms A/B, 24 runs)

## Verdict: H3 SUPPORTED on locked terms — but rescue is class-specific

| Prediction | Bar | Measured | Verdict |
|---|---|---|---|
| P1 escalation accept | >= 3/12 | 5/12 = 41.7% | PASS |
| P2 cost ratio | <= 10x | 9.21x ($0.01594 vs $0.00173/run) | PASS |
| P3 control stability | <= 1/12 | 0/12 | PASS |
| P4 instrumentation | 100% priced, terra tagged | 12/12 + 12/12 | PASS |

Locked rule fired: class-conditional escalation enters the policy. The
per-class evidence (exploratory) says the blend must be finer than dom-3:

| class | mini (A) | terra (B) | terra $/settled | vs frontier $0.000933 |
|---|---|---|---|---|
| dom-spatial-curation | 0/4, acc 0.64 | **4/4, acc 0.94** | $0.0113 | 12x — RESCUED |
| dom-ai-governance | 0/4, acc 0.70 | 1/4, acc 0.63 | $0.0977 | 105x — POOR ECONOMICS |
| dom-incident-recovery | 0/4, acc 0.54 | 0/4, acc 0.47 | infinite | NOT RESCUED at 9x cost |

- Spatial curation is a clean capability gap: terra solves it outright.
- Incident recovery fails BOTH tiers — either the task needs tools/context no
  pure-LLM lane has, or the reference is defective. Flag for golden-task
  review before concluding "needs frontier."
- Governance: 1/4 at 105x frontier cost is worse economics than declining.
- Curious inversion: mini's mean accuracy EXCEEDS terra's on governance
  (0.70 vs 0.63) and incident (0.54 vs 0.47) while both fail — grader
  threshold effects dominate below the pass line; mean accuracy is not a
  reliable escalation signal, pass rate is.

E4 directive: compute the blended frontier with per-class assignment
(spatial -> terra; governance + incident -> decline-with-refund candidate),
not the coarse dom-3 -> terra the locked rule names. Arm spend: A $0.0208,
B $0.1913. Cumulative project ~$0.41.
