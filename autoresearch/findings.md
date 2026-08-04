# Findings — hive external-agent onboarding

## Current understanding

- The hive already exposes a production-grade onboarding surface for external
  agents: `scratchpadActions.writeSigned` (HMAC-SHA256 over
  `body\n timestamp\n nonce`, per-agent secrets in `agent_keys`, nonce replay
  guard, role-gated blackboard kinds). Nothing about it is OpenRouter-specific.
  The missing piece was agent-side: a connector that reads the board, drives a
  real external agent, and posts its reply through the signed write.
- Reachable external agents today (all liveness-verified 2026-08-03): Devin
  sessions API (200), v0 Platform API (200), Nia MCP (200), DeepWiki MCP
  (no-auth initialize ok), Context7 MCP (no-auth initialize ok). The five named
  `*_A2A_ENDPOINT` env vars are empty; the old "A2A external agents" were
  tunneled localhost demos.
- All three paid LLM providers have zero credit (verified live), so any design
  that needs a cloud LLM control plane is dead on arrival; the connector
  needs none (deterministic round templating), and local Ollama (11 models
  up) is available for labeled persona extras.
- Azure: no az/azd CLI, no Azure credentials on the machine. Deploying the
  connector on Azure requires the user to authenticate; documented as a user
  action, not performed.

## Patterns and insights

- Discussion-as-DAG: modeling the roundtable as per-(phase, agent) hive_nodes
  with cross-phase dependencies makes the existing network canvas draw real
  handoff edges from the agents' own entries — no new UI needed.
- Worker-role kinds constrain the protocol: proposal/question/decision rounds
  map cleanly to negotiate semantics without touching reviewer/control gates.

## Lessons and constraints

- Convex `agents._ensureAgent` cannot set `agent_role`; critique entries need
  the new `hiveConnector:_setAgentRole` promotion.
- `tasks.post` triggers the full auction lifecycle — discussion sessions must
  insert task+dag rows directly (hiveConnector:_createDiscussionSession).
- Timestamp for writeSigned is UNIX SECONDS (300s drift window).

## YC last-12-batches sweep (workflow wf_5ccbea2a-cd0, 13 agents, 12 batches)

- Standouts with programmatic surfaces: Superset (Spring 26; A2A agent card +
  MCP + OpenAPI), Context.dev (S26; API+MCP, key required), Silmaril (firewall
  MCP), Rindler (S26, MCP, account), Executor (S26, MCP gateway, account).
  Full ranked table in the workflow output file (see research-state.yaml).
- Most YC agent companies require account signup — documented for the user,
  not onboarded (no account creation).

## Open questions

- Do Superset/Silmaril endpoints answer unauthenticated? (probe pending)
- Does Devin's reply latency fit a 3-round session within tolerable wall time?

---

# Findings — multi-agent group routing efficiency (started 2026-08-04)

## Current understanding

- The optimization target ($/settled task) is unmeasurable at project start:
  no live run has ever recorded measured spend (llm_usage empty; all 318
  graded battery rows carry cost_usd=0 with no tokens), and no battery run
  has ever passed a reference audit (demo-lane free agents, mean acc 0.197).
- The product's displayed per-run saving ($3.73 mean, $783.42 total over 210
  settled tasks) is budget headroom, not saving — documented as such in
  lib/llm-usage.ts's own header. Replacing it with an honest counterfactual
  metric is H4.
- Instrumentation precedes optimization: E1 (cost capture + Azure prices in
  MODEL_PRICES) blocks every downstream experiment.

## Lessons and constraints

- Zero-credit battery sweeps produce structurally worthless efficiency data:
  free agents fail everything, so (cost, accuracy) collapses to (0, 0.2).
  Never run efficiency batteries on the demo lane.
- Azure lane models (gpt-5.4-mini, gpt-5.6-terra) are missing from
  MODEL_PRICES — priceForModel returns undefined = "cost unknown", which is
  correct behavior but means capture must ship WITH prices.

## Open questions

- Real judge-accept baseline on a funded lane (H2 predicts 30-70%).
- Does probe-gating actually convert its 0.959 AUC into >=30% cost cut at
  unchanged accept rate (H3)?

## E2 update (2026-08-04)

- Real baselines exist: $0.001026/settled, 0.580 accept, n=112 (protocol
  and results committed separately; 19.5x under the $0.02 prediction bar).
- Pattern: the two-agent pool is NOT a quality-cost tradeoff — backstop is
  better AND cheaper per settled task. Routing gains may come from simple
  dominance, not frontier tradeoffs. Check per-class before believing it.
- Pattern: task-class bimodality (a third of classes free, a fifth hopeless
  on the cheap lane). Class-conditional escalation is the obvious H3 shape;
  the dom-* failures are where fan-out/terra spend belongs.
- Constraint learned: same-family grader for worker and audit — keep as a
  named validity caveat on every accept-rate claim until grader moves to a
  different family (candidate E2b, low priority).

## E3' update (2026-08-04)

- Dominance is real, not a mix artifact: backstop wins or ties 24/25 eligible
  classes. First routing policy adopted (route-all-to-backstop). The cheap
  lane's frontier is now accept 0.786 @ $0.000933/settled.
- The residual is structural, not statistical: 3 classes are 0/12 across
  both agents. No amount of cheap-lane routing fixes them — escalation or
  honest decline are the only moves. This is the empirical case for
  class-conditional escalation (reshaped E3) and for decline-as-a-mechanism
  (ties back to bid-calibration's abstention design).
- Method lesson: per-agent accept at sweep scale (n=56) drifts +-6pp;
  lock policy decisions to pooled data and keep stability bands in every
  protocol (P3 caught this).

## Outer-loop reflection 1 (2026-08-04, after E0-E3)

What we know: the marketplace's cheap lane has a real, measured frontier —
accept 0.786 @ $0.000933/settled (backstop@mini, n=168) — and deviations
from it are now CLASSIFIED, not mysterious: (a) 22/28 classes sit on or near
the frontier; (b) 1 class (spatial) is a pure capability gap that 12x spend
closes completely; (c) 2 classes resist 9-10x spend and belong to
decline-with-refund or golden-task review, not routing.

The pattern across E2->E3: every "routing" gain so far decomposed into
SELECTION (pick the dominant agent) or TIERING (pay for capability only
where it pays back). Nothing yet required the auction/probe machinery —
with a 2-agent live roster there is nothing to prune or price. The probe
head and Vickrey layer become testable only when the roster grows (H3
original stays deferred; noted so we do not claim more than the data shows).

Story test: could a reader write the abstract? "In a deployed agent
marketplace we made cost-per-settled-task measurable, found the displayed
savings metric was headroom, established a $0.001 frontier, and showed the
residual failures split into one purchasable capability gap and two classes
where honest decline beats any routing" — yes. E4 (honest savings swap)
completes the user-facing half; E5 guards the claim hygiene.

Method lessons this cycle: (1) lock decision rules but write them per-class
— pooled rules can technically fire on economics no one should ship; (2)
purpose-scoped env overrides give clean model A/Bs with zero code change;
(3) pass rate, not mean accuracy, is the signal near the grader threshold.

## E4 update (2026-08-04)

- The user-facing savings story is now measured end to end: routed lane
  $0.000986/settled, honest per-run saving mean $0.001692 vs frontier list,
  live in the panel with "list price, not an invoice" wording. The old
  headroom metric was wrong in both directions (overstates on cheap wins,
  understates to $0.00 on full-budget runs) — the strongest possible case
  for the swap, found by accident in the P3 e2e task.
- Instrumentation-first paid off: E1's capture is what made E2-E4 possible
  in one day. The panel bug (sub-cent rounding to $0.00) was only findable
  in a browser, not in unit tests — verification layers are complementary,
  which is also this project's thesis.

## E5 update (2026-08-04) — the instrument was broken, not the market

- A golden reference with no deterministic anchors and an implicit ordering
  requirement failed valid work at both tiers, and the routing layer
  faithfully concluded "unservable class, decline." The conclusion was
  wrong because the measuring instrument was wrong. Post-fix: terra 3/3.
- Generalization: every class-level routing decision is downstream of
  reference quality. Before declaring any class unservable, run the E5
  rubric (read failed deliveries against the WRITTEN criteria, blind to the
  reference's specific answer). This is the routing-loop version of the
  settlement-audit protocol's reference-error leg, now with an in-the-wild
  positive: the audit lane's own instrument produced a false negative that
  propagated into policy.
- For the paper: "judge error" decomposes into judge-vs-reference and
  reference-vs-truth. We measured the second term existing at class-flipping
  magnitude. Nobody in the simulation literature can observe this term.

## Outer-loop reflection 2 (2026-08-04, after E5b — 9 experiments)

The project's story inverted twice and is now coherent:
1. E2-E3' said: routing is selection + tiering; residual failures are
   capability limits; decline the rest.
2. E5/E5b say: BOTH "capability limit" classes were instrument artifacts —
   an over-narrow reference (twice) and a grading pipe that amputated
   deliveries at 4000 chars before the grader saw them. Post-repair, one
   class runs on the frontier-cheap tier at 2.7x, the other on terra at
   12x. Nothing in the current task set is unservable. Coverage 28/28
   pending E5c re-checks.

The durable claim is methodological, and it is the paper's spine: in a
deployed agent market, apparent market failures decompose into (i) true
capability gaps, (ii) reference error, (iii) measurement-pipeline error —
and (ii)+(iii) were the MAJORITY here (2 of 3 classes). Simulation work
cannot observe terms (ii) and (iii) because its instruments are correct by
construction. A real marketplace must therefore audit its auditors: the
E5 rubric (read failures against written criteria, blind to the reference's
specific answer) is the cheap, repeatable procedure that caught both.

Efficiency ledger this loop: frontier $0.000933/settled (floor — truncation
could only deflate historical accepts); blended policy $0.000986 @ 88.3%
pre-E5b, improving with governance on mini; honest per-run saving mean
$0.001692 live in product. Total research spend ~$0.75.

Method lessons: (a) store what you grade — any cap applied before grading
is part of the instrument and must match the audit window; (b) length is a
confound: style-verbose models fail truncating graders at higher rates —
check len distributions before comparing tiers; (c) instrument review
(E5 rubric) belongs BEFORE escalation experiments in the dependency order;
we ran it after and had to retract two conclusions. Cheap lesson at n=28
tasks; expensive at marketplace scale.
