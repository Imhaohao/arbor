# E5 — Results (2026-08-04)

## Verdict: rubric (a) — OVER-NARROW REFERENCE. The class was never unservable.

P1 PASS: classification decided on 4 sampled failures with quotable evidence.
Two of four failed deliveries (terra@0.28, mini@0.64) satisfied every written
criterion — capture-before-restart, three ordered steps, a named confirmation
signal per step — but chose different valid step orderings than the
reference's specific sequence (halt-rollout-first / rollback-then-restart vs
blast-radius -> rollback -> isolate-replay). The grader was enforcing the
reference's ordering, not the criteria. The golden also had NO
required_substrings, so nothing deterministic constrained the grader.

Fix applied per locked rule: reference gains explicit "equivalent orderings
are correct" language; criteria gain "do not fail for a different valid
ordering". The pass/fail CONTRACT (the four written criteria) is unchanged.

P2 PASS (both tiers): post-fix incident-recovery goes
  mini:  0/10 -> 1/4     terra: 0/4 -> 3/3  (one terra sweep errored, excluded)
Terra $/settled on this class: ~$0.0114 — same 12x-frontier band as spatial.

## What this means beyond the class

E3's "not rescued at any tier" verdict for this class was WRONG, and wrong
in the most instructive way: the ground-truth instrument itself was
defective. A reference-graded audit manufactured a false unservable class.
This is measured, in-the-wild evidence that reference error is a first-order
term in settlement auditing — it directly validates the settlement-audit
protocol's human-adjudication leg and its requirement to report a
reference-error rate alongside judge-error rates.

Honest caveats: (1) post-fix rates were produced under a reworded reference;
cross-class comparability now carries that footnote — the written criteria
never changed, which is why the fix is legitimate rather than
grade-inflation. (2) dom-ai-governance (1/4 on terra, "poor economics" in
E3) has not had this review; its verdict is now SUSPECT for the same reason.
Queued as E5b before its decline-with-refund is finalized.

Policy update: incident-recovery moves from declined to terra-escalation
(alongside spatial). Coverage becomes 27/28 pending E5b on governance.
