# E7 — Results (2026-08-04)

All three locked predictions pass:
P1: DOM on the E4 task page shows "Execution time (measured) | 2.6s |
    specialist quoted 40s"; "generalist baseline" absent.
P2: executionElapsedMs unit tests pass (normal / missing-endpoint /
    clock-skew / zero-elapsed); typecheck green.
P3: grep-clean — BASELINE_GENERALIST_SECONDS occurs nowhere in
    components/, lib/, app/.

Bonus observation: quoted 40s vs measured 2.6s — specialist quotes are
~15x conservative on this task. Quoted-vs-measured is now a live, honest
signal the panel shows for free; a calibration dimension for estimated_
seconds (mirroring bid-confidence Brier scoring) is a natural future
mechanism experiment.

The ValueImpactPanel now contains zero invented numbers: measured savings
(E4), measured execution time (E7), the winner's real id and real quote.
