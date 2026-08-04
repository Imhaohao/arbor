# E3' — Agent dominance per class (protocol)

From E2 exploratory finding 1: backstop beat baseline on BOTH axes in
aggregate (75% vs 41% accept; $0.00098 vs $0.00111 per settled). Before
adopting route-to-best as policy, check the dominance is not a class-mix
artifact (Simpson risk) and not sweep noise.

Design: 4 additional sweeps, 28 tasks x 2 agents each -> 224 new runs.
Analysis pools with E2's 112 (same protocol, same lane) -> 6 runs per
(class, agent) cell, n=336.

Locked predictions:
P1: pooled dominance holds — backstop accept > baseline accept AND backstop
    $/settled < baseline $/settled.
P2: sign consistency — among classes where either agent passes at least once,
    backstop's per-class accept >= baseline's in >= 70% of classes.
P3: stability — pooled aggregate accept in [0.50, 0.66] (E2 baseline 0.580;
    drift outside this band flags non-stationarity and blocks policy adoption).
P4: >= 95% of new rows priced (instrumentation regression).

Decision rule (locked): P1+P2+P3 pass -> adopt "route-all-to-backstop" as the
routing policy E4 compares against, and record its simulated gain on pooled
data (delta accept, delta $/settled vs the observed 50/50 mix). P1 pass but
P2 fail -> class-aware mixed policy instead. P3 fail -> investigate before
any policy claim.

Out of scope: probe-gating (E3), grader family change (E2b), UI (E4).
