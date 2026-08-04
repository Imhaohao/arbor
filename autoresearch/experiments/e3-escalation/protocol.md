# E3 — Terra escalation on the unservable classes (protocol)

E3' left 3 classes at 0/12 across both cheap-lane agents: dom-ai-governance,
dom-incident-recovery, dom-spatial-curation. H3 (reshaped): the failure is
model capability, not task impossibility — escalating the WORKER model to
gpt-5.6-terra lifts them off zero at bounded cost.

Design (A/B, grader constant):
- Arm A (control): arbor-hive-backstop, agent purpose on gpt-5.4-mini
  (default env), 3 classes x 4 sweeps = 12 runs.
- Arm B (escalation): same agent code, AZURE_OPENAI_AGENT_DEPLOYMENT=
  gpt-5.6-terra for the process, 3 classes x 4 sweeps = 12 runs.
- Worker purpose "agent" and grader purpose "default" are distinct, so the
  override cannot touch the grader (verified in code before locking).
- New --golden-ids battery flag (committed with this protocol; dry-run and
  unknown-id failure path tested).

Locked predictions:
P1: Arm B pooled accept on the 3 classes >= 25% (>= 3/12).
P2: Arm B mean cost/run <= 10x Arm A mean cost/run.
P3: Arm A stays <= 1/12 (unservability is stable, not drift).
P4: 100% rows priced; Arm B rows carry models_used = gpt-5.6-terra.

Decision rule (locked): P1+P2+P3 pass -> class-conditional escalation enters
the adopted policy (dom-3 -> terra, rest -> backstop@mini); E4 computes the
blended frontier. P1 fail -> dom-3 move to decline-with-refund (the
mechanism-design answer), also a publishable negative. P4 fail -> fix
instrumentation before interpreting anything.
