# E2 — Real $/settled + accept-rate baseline on the Azure lane (protocol)

Hypothesis H2: a funded-lane battery produces the first real (cost, accuracy)
operating points; judge-accept baseline lands in 30-70% (E0's 0% was a
free-agent artifact, not task difficulty).

Design:
- Roster: arbor-baseline + arbor-hive-backstop (the two azure-lane runners;
  specialist runners bypass the funded lane per E1 finding #2).
- All enabled golden tasks (28) x 2 agents x 2 sweeps -> target n >= 100
  completed runs. Each sweep gets its own battery_id; analysis aggregates.
- Spend cap $1.00/sweep (expected ~$0.05 at E1's ~$0.0004/run).

Locked predictions (pass/fail decided before running):
P1: aggregate judge-accept (audit_passed) rate in [0.30, 0.70]   [H2 core]
P2: >= 95% of completed rows carry cost_usd > 0                  [E1 regression]
P3: $/settled (total cost / passed runs) <= $0.02
P4: per-agent completion rate >= 80% (errors are attrition, recorded)

Metrics recorded: $/settled, accept rate, per-task-class accept+cost spread,
per-agent completion, grader identity mix.

Validity notes (not blocking): battery grader runs on the default Azure
deployment (same family as workers) — reference+substring anchored, but a
shared-family grader is a known correlated-error risk; flagged for the
settlement-audit protocol. Substring-decided rows (grader outage) count as
graded but are reported separately.

Out of scope: multi-agent arms (E3+), UI metric (E4), grader model change.
