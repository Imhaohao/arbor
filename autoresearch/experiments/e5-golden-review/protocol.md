# E5 — Golden review: dom-incident-recovery (protocol)

Class failed both tiers (mini 0/10, terra 0/4) and terra LOWERED mean acc.
Pre-review observation from the definition alone (before reading any
delivery): this golden has NO required_substrings — no deterministic leg —
and its reference encodes one specific 3-step ordering with strict criteria.

Classification rubric (LOCKED before reading any failed output):
(a) OVER-NARROW REFERENCE / GRADER FRAGILITY: >= 2 of 4 sampled failed
    deliveries satisfy the success criteria as written (evidence capture
    before restart, three ordered steps, a verifiable observable per step)
    on manual read, yet were failed. Manual read = the human-adjudication
    leg of the settlement-audit protocol, applied here.
(b) TOOL-DEPENDENCE: deliveries fail because they need live artifacts
    (real logs, versions); signature: hedges like "I would need access to".
(c) GENUINELY HARD: deliveries objectively miss the criteria (no
    capture-first, missing observables, generic restart advice).

Decision rule (LOCKED):
(a) -> minimal fix: reference reworded to accept equivalent valid orderings
    (criteria unchanged, no answer leak into prompt); re-run 4 sweeps each
    tier; class reclassified to servable if either tier > 0. Finding feeds
    the settlement-audit protocol as measured reference-error evidence.
(b) -> golden tagged tool-required and excluded from pure-LLM batteries;
    class stays declined; no reference edit.
(c) -> no edit; class stays declined; "needs frontier+tools" noted.

P1: the rubric decides on 4 sampled failures with quotable evidence.
P2 (conditional, only if (a) fires and fix applied): post-fix pass > 0 on
    at least one tier within 4 sweeps per tier.
Sample: 2 mini + 2 terra failed deliveries, most recent first.
