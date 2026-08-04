# E7 — Retire the invented efficiency stat (protocol)

ValueImpactPanel shows "Efficiency improved N% vs 30 min generalist
baseline" from BASELINE_GENERALIST_SECONDS = 30*60 — a hardcoded fiction
(named by docs/model-routing-handoff.md's "ban silent constants" rule and
flagged since E4). Replace with a measured quantity; invent nothing.

Change:
1. lib/task-view.ts gains pure executionElapsedMs(events): diff of
   execution_complete.timestamp - execution_started.timestamp; undefined on
   missing/negative. Unit-tested (new lib/task-view.test.ts, registered).
2. Panel: efficiency metric becomes "Execution time (measured)" — value =
   measured elapsed, sub = the winner's QUOTED estimate for contrast
   (quoted vs measured is real information; a fabricated generalist
   comparison is not). Constant, efficiencyLift, and the footer's
   efficiency sentence deleted.

Locked predictions:
P1: constant + "generalist baseline" string absent from the component; DOM
    on the E4 task page shows a measured execution time with quoted sub.
P2: helper unit tests pass (normal, missing-event, clock-skew cases);
    typecheck green.
P3: no other component references BASELINE_GENERALIST_SECONDS (grep-clean).
