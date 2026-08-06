# Arbor Hive Mind — Build Progress

## Encoder-driven reputation + Pareto trilemma layer (2026-07-30)

Goal: (a) adjust every agent's reputation from the arbitrator's encoder-target
decoupling head, (b) put Arbor on the Agent System Trilemma (performance / cost /
latency) under a Pareto-efficiency framework.

### Part A — reputation priors (SHIPPED, applied to dev deployment)

Reputation was inert: 1,105 of 1,233 agents sat at exactly 0.5, so the
0.30-weighted reputation dimension of `rankAgents4D` had a standard deviation of
zero and could not reorder any candidate.

1. Recovered the encoder pipeline's missing half. `encoder-head-model.json`
   shipped coef/intercept/platt but no PCA basis and no scaler, so its vectors
   could not be regenerated. Replayed the training pipeline and froze the result
   as `lib/hive/encoder-projection.json`, verified against the 7 bundled
   fixtures (worst component error 4.7e-5).
2. `lib/hive/reputation-prior-core.ts` — ranks the unsettled pool
   lexicographically on (measured pass rate, encoder logit). The encoder acts
   ONLY inside measured ties, because the model card shows encoder+measured
   (0.9458 AUC) is worse than measured alone (0.9590). Midrank percentiles map
   to a [0.30, 0.70] band so a prediction cannot impersonate a track record.
3. `agent_encoder_vectors` table + `convex/reputationPrior.ts` +
   `npm run reputation:prior`. Settled agents are untouched: `reputation_events`
   is the authority there.
4. `scripts/encode-agent-descriptors.py` regenerates vectors from Convex using
   the frozen projection; `buildAgentDescriptor` stays the single TS contract.

Result on the live dev deployment: 1,225 distinct reputations across 1,233
agents (was 12 values), sd 0 -> 0.1184. The encoder broke the tie for 1,144 of
1,206 priors (94.9%).

### Part B — Pareto trilemma (machinery SHIPPED, training BLOCKED on data)

`lib/hive/pareto-core.ts` + `npm run trilemma:report`: bid utility
`quality^gamma - beta x normalized_cost` with the three beta tiers, marginal
gain + escalation rule, accuracy-per-thinking-token with a matched-budget guard,
padded AUCCC, oracle distance, and the 3-axis Pareto frontier. Wired into
`convex/auctions.ts` behind `ARBOR_PARETO_BID_ENABLED` (default off).

Measured readiness on the live corpus — 3 of 4 metrics cannot be trained:

| Metric | Have | Need | Status |
|---|---|---|---|
| marginal gain | 20 comparable pairs | 500 | underpowered |
| accuracy-per-thinking-token | 0 | 100 | no data — there is no `llm_usage` table at all |
| padded AUCCC | 3 distinct curve steps | 50 | underpowered |
| beta tuning | 0 labelled bids | 200 | no data — `reputation_dimensions.confidence` is never written |

All four block on ONE artifact: a shared task battery run across many agents
with graded outcomes and recorded tokens/cost/latency. `golden_tasks` has the
schema and 4 rows; `golden_task_runs` has 0.

Two traps the report now refuses to print as results: a P-AUCCC of 0.977 with
oracle distance 0 (the curve saturates at its first step, so the oracle is
matched by construction) and a "20/20 non-dominated" frontier (only 2 distinct
operating points — degeneracy, not efficiency).

### Part C — task battery (BUILT and validated; BLOCKED on provider credit)

The artifact all four metrics need. The golden AUDIT lane structurally cannot
supply it: it posts one task through the auction and grades only the winner, so
it never crosses agents on a query. The battery fans one task out to many agents
and grades all of them.

- `battery_runs` table: one row per (golden task, agent) carrying the bid
  (price, confidence), the reference-graded accuracy, and real token / cost /
  latency telemetry — so one harness feeds all four metrics.
- `convex/battery.ts` + `scripts/run-task-battery.ts` (`npm run battery`).
  `--dry-run` plans without spending, `--max-spend` is a hard abort checked
  after every run, and results checkpoint per task so an interrupted sweep keeps
  what it paid for. Declines are recorded as an outcome, not dropped — dropping
  them would bias the corpus toward agents that answer everything.
- Golden set expanded 4 -> 20 tasks (arithmetic, extraction under negation,
  conditional probability, weighted averages, dependency ordering, regex,
  SQL, off-by-one). All carry `required_substrings` so grading survives a
  reference-grader outage.
- Token/cost capture uses `collectUsage` around each execution — the telemetry
  that has no persistence path anywhere else in Arbor.

**Pilot run (battery-e733b936): 15/15 errored — both provider accounts have zero
credit.** OpenRouter returns HTTP 402 "Insufficient credits. This account never
purchased credits"; OpenAI returns HTTP 429 "You have no credits remaining".
The harness recorded all 15 as errors and reported 0 comparable pairs rather
than fabricating grades, which is the correct behaviour.

Sizing for a full sweep once credit exists (pairs = tasks x C(agents, 2)):

| Roster | Runs | Pairs | Clears the 500 floor |
|---|---|---|---|
| 20 tasks x 5 agents | 100 | 200 | no |
| 20 tasks x 8 agents | 160 | 560 | yes |

    npm run battery -- --agents 8 --max-spend 8.00


## Investor package + first-demo readiness (2026-07-29)

Goal: produce a submission-ready a16z Speedrun application and six-slide pitch,
then establish whether the current dirty worktree can deliver one credible first
demo without masking live-runtime failures.

1. Audit the repository, test surface, live dependencies, and demo paths.
2. Run the health check, code generation, typecheck, full tests, build, and only
   safe live smoke checks; diagnose and repair code-level blockers in scope.
3. Define one repeatable demo path with explicit environment prerequisites and
   a fallback that remains honest about provenance.
4. Draft the application and investor deck from verified product evidence only.

| Task | Model tier / executor |
|---|---|
| Test, eval, and demo-script audit | Sonnet/Luna-tier explorer |
| Hive, Convex, routing, and protocol audit | Sonnet/Luna-tier explorer |
| Product-surface and demo-flow audit | Sonnet/Luna-tier explorer |
| Integration, repairs, and investor narrative | Fable/Sol main agent |
| Health checks, build, typecheck, and tests | Deterministic local tooling |

Checkpoint: completed. `npm test`, `npm run typecheck`, `npx convex dev --once`,
and `npm run build` pass; the standard test chain now includes the previously
omitted judge and post-task-discovery tests. A live `npm run hive:e2e` task
reached `complete` with a non-empty result and full DAG/evaluation trail, using
the explicitly labeled Arbor-owned fallback for both nodes. The first demo is
therefore viable as a resilient execution-and-verification demo, not yet proof
that third-party specialists win live market work. Investor deck rebuilt at
`/present`; landing/dashboard labels now distinguish illustrative data from
live data. Do not expose the current deployment publicly with real A2A keys or
payments enabled: the audit found unauthenticated A2A-key and escrow-override
surfaces that need an authentication design before production launch.

## External-tool agentic harness + Sakana/Fugu integration (2026-07-15)

Goal: give Arbor a first-class external-tool execution harness modeled on major coding agents and Sakana's population/evaluator loops, while reusing the existing Hive router, candidate archive, receipts, and rollout gates.

1. Inventory current Codex external tools and Arbor tool/discovery/execution paths.
2. Compare official harness patterns from Codex, Claude Code, Gemini CLI, OpenHands, and Sakana/Fugu research.
3. Design the deep `ToolHarness` module twice-plus: minimal interface, extension-oriented interface, common-caller interface, and ports/adapters interface.
4. Implement a pure policy/trajectory core, normalized tool catalog, execution receipts, bounded retries, and evaluator-guided branch selection behind a default-off switch.
5. Add production adapters at existing MCP/A2A/GitHub/web seams and deterministic fake adapters at the same interface for tests.
6. Wire the harness into the Hive orchestrator without weakening current budget, approval, audit, or terminal-fallback behavior.
7. Run focused tests, Convex codegen, typecheck, full tests, and a deterministic harness benchmark; record measured behavior and remaining live-only gaps.

| Task | Model tier / executor |
|---|---|
| Bulk tool-registry inventory | Local Ollama tier / deterministic local tooling |
| Official coding-engine and Sakana research | Sonnet/Luna-tier parallel research agents |
| Alternative interface designs | Sonnet/Luna and Terra-tier parallel design agents |
| Cross-file harness architecture and integration decisions | Fable/Sol main agent |
| Settled cross-file implementation | Terra-tier worker agents with disjoint file ownership |
| Focused tests, reviews, and benchmark checks | Sonnet/Luna-tier agents + deterministic local tooling |

Checkpoint: research-deep resume check found all 5 Sakana items complete and schema-valid (10/10 fields each). Existing Arbor already covers candidate fan-out, evaluator selection, evolution archive, learned delegation, direct routing, receipts, and fallback; the active gap is normalized external-tool discovery/execution with bounded tool trajectories and feedback into routing.

Checkpoint: phase 1 landed. `lib/tool-harness.ts` is the deep protocol-neutral module: it normalizes tool schemas and names across adapters, rejects duplicate adapter IDs, enforces round/call/repetition/result limits, exposes an authorization hook, preserves deterministic transcript/receipt order, and parallelizes only tools an adapter marks safe. `lib/specialists/mcp-forwarding.ts` now supplies MCP and trusted Arbor-workspace adapters while retaining the existing external-call recorder and provenance gate. Focused tests, typecheck, and the full test suite pass. The existing Hive best-of-N/evaluator/evolution modules remain the Sakana/Fugu population layer above this deterministic trajectory executor.

Remaining adapter work: register host-provided GitHub, web-search/fetch, browser, A2A, and shell adapters where those runtimes expose callable functions; do not hardcode Codex-only tools into the Arbor server. Receipt hardening remains for generic MCP servers that return no durable external session/task ID. Live external execution was not attempted because credentials/endpoints are environment-owned.

## Sakana-style expert delegation and auction compression (2026-07-10)

Goal: turn the W3 profile flywheel into a confidence-aware delegation expert that can skip redundant auctions, shrink competitive auctions, and prove the change with replayable metrics while retaining a conservative fallback.

1. Fully audit the supplied Sakana research, verify implementation-critical claims against primary sources, and resolve open questions.
2. Specify observable routing behaviors and metrics: delegation accuracy, direct-route precision, auction invite count, fallback rate, and cost/latency proxies.
3. Complete the pure expert-routing core with vertical RED/GREEN tests.
4. Wire profile signals, adaptive shortlist sizing, telemetry, and default-off/kill-switch rollout through `convex/hiveRouter.ts`.
5. Add a deterministic evaluation harness comparing baseline and expert policies on known routing cases; record measured deltas.
6. Document switches, run focused tests/codegen/typecheck/full tests, perform standards/spec reviews, fix findings, and commit only the Sakana-delegation files.

| Task | Model / executor |
|---|---|
| Cross-file architecture, integration, and uncertain decisions | Opus main agent |
| Primary-source parity and open-weight availability | Sonnet research subagent (runtime-inherited) |
| Router/data-flow seam audit | Sonnet architecture subagent (runtime-inherited) |
| Focused test and metric-harness review | Sonnet test subagent (runtime-inherited) |
| Standards and spec review | Sonnet review subagents (runtime-inherited) |
| Build, codegen, typecheck, tests, benchmark | Deterministic local tooling |

Checkpoint: research audit, profile-label repair, learned selection head, confidence policy, Convex wiring, shadow telemetry, and offline benchmark are complete. No public Fugu/Conductor/TRINITY weights exist, so no Sakana checkpoint was downloaded or targeted for Azure. Arbor now has its own open 2,048-feature query-conditioned head (22 curated EASY gold-proxy examples, 10 learned agents, 1,452 nonzero centroid parameters); `npm run delegation:train` regenerates the seed, while `npm run delegation:train -- --data <measured.jsonl>` trains the same runtime from real worker reward vectors. On the disjoint HARD near-duplicate routing suite, `npm run delegation:eval` moves 4D acc@1 from 13/14 (92.9%) to 14/14 (100%). In the explicitly synthetic mature-profile policy simulation: one of 14 tasks routes direct (100% point precision, but only 27.1% Wilson lower bound), every auction retains a gold agent, non-floor solicitations fall 6.0 -> 2.79 per task (-53.6%), and total invites fall 8.0 -> 4.64. These are internal routing/gold-path regression metrics, not independent or end-to-end task-success evidence; live outcome non-inferiority remains gated on `ARBOR_EXPERT_DELEGATION_SHADOW`. `npx convex codegen`, `npm run typecheck`, focused tests, and full `npm test` pass.

## Orchestrator-first direct assignment (2026-07-09)

Step 1 of the orchestrator-first plan: thin-market nodes skip the bid round.

| Piece | State | Evidence |
|---|---|---|
| Route-mode decision (pure) | done | `lib/hive/router-core.ts` `decideRouteMode` + `orchestratorFirstEnabled`/`directRouteLiquidity` (master-switch + kill-switch pattern). Conservative: force_open, best-of-N fan-out, consensus revisions, exhausted budget always auction. Liquidity = independent (non-floor) candidates with `availability_score >= 0.9`; below `ARBOR_DIRECT_ROUTE_LIQUIDITY` (default 3) → direct. Price = flywheel avg_price, else `cost_baseline`, else node ceiling; clamped to budget. |
| Router wiring | done | `convex/hiveRouter.ts`: decision after profile re-rank; direct mode writes ONE synthetic bid (`plan_source: "direct_assignment"`) and schedules `auctions.resolve` immediately — degenerate single-bid Vickrey then runs the UNCHANGED escrow → execute (receipt rule) → judge → settle pipeline; failed assignee falls to the W6 floor like a failed auction. `invited_agent_ids` = the assignee (audit). `hive_node_routed` gains `route_mode`/`route_mode_reason`/`independent_ready_count`/`direct_agent_id`/`direct_price`. Settlement sweep unchanged on both paths. |
| Tests | done | 17 new asserts in `lib/hive/router-core.test.ts` (all gate reasons, liquidity counting excludes floors/mocks, top-ranked-ready target selection, skip non-ready top, price precedence + budget clamp). |
| Docs | done | `docs/api-keys.md` rows + `.env.example` block for `ARBOR_ORCHESTRATOR_FIRST_ENABLED` / `ARBOR_ORCHESTRATOR_FIRST_DISABLED` / `ARBOR_DIRECT_ROUTE_LIQUIDITY`. |
| Verification | green | `npx convex codegen`, `npm run typecheck`, full `npm test` (exit 0). Live behavior with the flag on not exercised here (default off; flip on Convex via `npx convex env set` to trial). |

Default off = routing is byte-for-byte on the auction path. Next steps from the plan: judge-driven escalation ladder (step 2), latency-aware gating (step 3), evolution-loop driver (step 4).

## Sakana-style candidate search + evolution archive (2026-07-09)

Sakana AI's core loop (generate many candidates → score with a structured signal → archive → promote/synthesize; AB-MCTS arXiv:2503.04412, ShinkaEvolve/DGM/CycleQD) mapped onto the hive. Gap closed: Arbor generated diversity at the *bidding* stage but executed a single winner — the judge scored a population of one. All switches default off; single-winner path byte-for-byte unchanged when off.

| Piece | State | Evidence |
|---|---|---|
| Candidate-search core (pure) | done | `lib/hive/candidate-search-core.ts` — `bestOfNEnabled` (+kill switch), `plannedFanoutWidth` (class-gated, budget-split: K candidates never exceed the node's SeqRoute ceiling), `scoreCandidate`/`selectBestCandidate` (deterministic tie-breaks), `shouldSynthesize` (close-margin + distinct outputs), `abmctsDecision`/`ucbScore` (wider-vs-deeper, hard budgets, best-of-N fallback when no signal), env tunables (`fanoutMaxWidth`/`fanoutMinBudget`/`fanoutDeadlineSeconds`). 40+ asserts in `candidate-search-core.test.ts`, wired into `npm test`. |
| Evolution core (pure) | done | `lib/hive/evolution-core.ts` — reversible-artifact genomes (prompt_template/rubric_weights/dag_prior/role_spec/tool_allowlist), deterministic lineage ids, `mutateArtifact`/`fuseArtifacts` (parents never mutated), CycleQD `selectParents` (per-bucket elites), `admitGenome` (harness-tamper hard reject; beat-the-parent; NEVER auto-promote), `lineageOf` cycle-safe replay. Full test suite in `evolution-core.test.ts`. |
| Schema (additive) | done | `hive_node_candidates` (archive: by_dag / by_dag_and_node / by_task_id), `evolution_genomes`, `tasks.hive_candidate_index`, `hive_nodes.expected_candidates` + `promotion_claimed`; `nodeDocValidator` gap fixed (pre-existing optional cols listed). |
| Router fan-out | done | `hiveRouter.routeNode`: primary call decides width via `plannedFanoutWidth`, patches node executing+expected_candidates BEFORE scheduling K-1 sibling routeNode calls (pre-split per-candidate budget), schedules the liveness sweeper, logs `hive_node_fanout`. Fan-out only on first attempt (`revision_count === 0`) — a consensus revision is AB-MCTS "deeper", runs legacy single-winner, and keeps round-1 latch state provably inert. |
| Candidate settle + atomic barrier | done | `hiveOrchestrator.onNodeSettled`: legacy ordering restored (node lookup first); unlinked tasks with `hive_candidate_index` → `hiveCandidates.recordAndMaybePromote` (archive row idempotent by task_id, flywheel outcome only on first insert). `hiveCandidates._settleBarrier` claims the promotion latch + selects + patches node + relabels archive in ONE transaction (no burned-latch crash window); follow-ups (advance, lifecycle, blackboard artifact/decision via `persistWinnerArtifacts`) scheduled exactly-once from the commit. Winner-null → node failed → W6 floor. |
| Barrier liveness | done | `forcePromotionCheck` sweeper scheduled at bid-window + `ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS` (default 600s): promotes from settled candidates or fails to W6 — actions are not retried on failure, so a dead candidate routeNode can no longer wedge the node. Found by adversarial review (workflow, partial — rate-limited), verified + fixed inline. |
| Cost integrity | done | `_dagSpend` counts candidate spend (losers via rows, winner via node.task_id with double-count guard); per-candidate budget = ceiling/K so fan-out never exceeds single-winner spend. |
| Evolution archive persistence | done | `convex/evolutionArchive.ts` — `_proposeGenome` (idempotent), `_recordGenomeEvaluation` (immutable-harness gate), `approveGenome` (the ONLY path to promoted), `promotedGenomes` query. Nothing in the live loop triggers evolution automatically. |
| Docs + env | done | `docs/api-keys.md` + `.env.example`: `ARBOR_HIVE_BESTOFN_ENABLED/_DISABLED/_MAX/_MIN_BUDGET/_DEADLINE_SECONDS`, `ARBOR_HIVE_EVOLUTION_ENABLED`. |
| Verification | green | `npx convex codegen`, `npm run typecheck`, full `npm test` (27 suites incl. 2 new). Live behavior with the switch on not exercised — same Azure-credentials gate as the rest of the hive (see M1 open item). |

Deferred (substrate ready): AB-MCTS-lite adaptive loop (`abmctsDecision` is pure+tested; wiring it to drive iterative wider/deeper rounds per node is a follow-up), synthesis executor (selection logs `synthesize_eligible`; a merge step for close-margin winners is a follow-up), evolution driver (archive + approval gate exist; no automatic proposer by design).

## Frontier build (ARBOR_FRONTIER_BUILD_PLAN.md) — started 2026-07-04

Target "a": one posted task -> full DAG to delivery with zero human input, on Azure OpenAI.

All 8 workstreams code-complete 2026-07-04. Final gates green: `npx convex codegen`, `npm run typecheck`, full `npm test` (26 suites). Milestones: M2 (always terminates) and M3/M4 code paths done offline; M1 (runs on Azure live) blocked ONLY on credentials.

Fix 2026-07-05: Codex's `ARBOR_HIVE_MODEL_PROVIDER` layer in `lib/anthropic.ts` made the unset/auto case silently prefer a usable OpenAI path over a configured ANTHROPIC_API_KEY (inverting the documented Anthropic -> OpenRouter -> OpenAI fallback order and contradicting its own `.env.example` comment), and rewrote/added four tests to codify the inversion. Fixed: auto/unset keeps the legacy order; openai-first requires the explicit flag (forced mode unchanged — `=openai` still routes exclusively to the OpenAI path). Tests restored/inverted: `/Azure fallback/` assertion back, "unset flag keeps Anthropic-first", "defaults to Anthropic first even when OpenAI usable", "auto cascades Anthropic -> OpenRouter -> OpenAI on exhaustion". 13/13 anthropic tests, typecheck, full `npm test` green. No behavior change on the Convex deployment (no Anthropic key there; OpenAI already wins by fallback).

Open items (not code):
1. Azure credentials: set `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `ARBOR_AZURE_ENABLED=true`, `AZURE_OPENAI_PLANNER_DEPLOYMENT`, `AZURE_OPENAI_FAST_DEPLOYMENT` (+ per-purpose AGENT/JUDGE as desired) on the Convex deployment via `npx convex env set`, then run live `npm run hive:e2e`.
2. Leaked ANTHROPIC_API_KEY: value scrubbed from `.env.example` 2026-07-04, but it remains in git history — rotate the key at console.anthropic.com.
3. `bid_price` on `hive_nodes` unfilled (winning bid price lives behind `winning_bid_id` FK) — small follow-up if the RL dataset needs it.

| WS | What | State | Evidence |
|---|---|---|---|
| W1 | Azure provider unblock | code done; live env blocked | `lib/openai.ts` `describeOpenAIPathReadiness` (throw-free usability probe); `lib/anthropic.ts` third-fallback + `describeClaudeRuntime` gate on provider usability, not OPENAI_API_KEY. 4 new regression tests in `lib/anthropic.test.ts` (pure-Azure ready, pure-Azure callClaude reaches Azure URL, missing-deployment blocks without throwing, kill switch wins). typecheck + full `npm test` green. **Blocker: no Azure credentials exist in `.env.local` or Convex env — user must supply AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, ARBOR_AZURE_ENABLED=true, AZURE_OPENAI_PLANNER_DEPLOYMENT, AZURE_OPENAI_FAST_DEPLOYMENT and push via `npx convex env set`.** |
| W6 | Guaranteed terminal executor (every node class) | done | `convex/hiveOrchestrator.ts` step 1b: every failed node (any task class) gets one floor hand-off before failure propagation; backstop-pending nodes count as in-flight; dependency-skipped + BACKSTOP_FAILED nodes excluded (honest failure, no loop). `convex/hiveBaselineBackstop.ts` generalized: PR-review -> arbor-baseline, all else -> arbor-hive-backstop; generic judge; full attributable trail (scratchpad, evaluation, reputation, lifecycle) on the actual runner id; `LEGACY_BACKSTOP_FAILED_PREFIX` honored for pre-W6 rows. typecheck + codegen + full `npm test` green. |
| W8 | Single-vs-multi gate (MasRouter) | done | `lib/hive/dag.ts` `classifyTaskComplexity` (deterministic heuristic: enumeration/sequencing/verb-count/budget triggers, conservative default-to-dag on ambiguity); `convex/hivePlanner.ts` gates before the model call, single-node path reuses planner fallback shape, logs `hive_plan_gated_single`; `ARBOR_HIVE_GATE_DISABLED` escape hatch; 15-assert `lib/hive/dag-gate.test.ts` wired into `npm test`. codegen + typecheck green. |
| W2 | DAG budget allocator (SeqRoute) | done | `lib/hive/router-core.ts` `allocateNodeBudget`/`nodeDepths`/`estimateNodeDifficulty` (remaining-budget share weighted by class x spec-length x depth reserve; 0 when exhausted — W6 floor still delivers); `convex/hiveData.ts` `_dagSpend`; `convex/hiveRouter.ts` routes on remaining budget and logs dag_spent/allocator in `hive_node_routed`. Cost telemetry: `hive_nodes` gained `cost_paid`/`bid_price`/`allocated_budget`/`settled_at`, written in `onNodeSettled` (bid_price deferred — only `winning_bid_id` FK on task row). Allocator unit tests in `router-core.test.ts` green. |
| W7 | Frontier roster + purpose routing | done | `lib/specialists/openrouter-roster.ts`: opus-4.8 (hard SWE/PR), gpt-5.5 (hard reasoning/planner), gemini-3.5-flash (default/tool loops, verbosity note), deepseek-v4-pro + kimi-k2.6 (bulk OSS) — all 5 slugs verified live against OpenRouter /models with live pricing; purpose->env mapping documented in `docs/api-keys.md` (Azure names are customer-chosen — warning front-loaded) + `.env.example`. typecheck + full `npm test` green. Note: pre-existing leaked ANTHROPIC_API_KEY in `.env.example` re-flagged; scrub task spawned. |
| W3 | Agent profiles / flywheel (FlyRoute) | done | `lib/hive/profile-core.ts` (EWMA success/quality/latency/price per (agent, task-class), `uncertainty = 1/sqrt(tasks+1)` exploration bonus, `profileScore`, `profileWeightedRank`) + green `profile-core.test.ts` (wired into `npm test`). `agent_profiles` table (`by_agent`, `by_agent_and_class`); `convex/agentProfiles.ts` `_recordOutcome` upsert + `_profilesFor` (class -> general fallback). Loop closed: `hiveOrchestrator.onNodeSettled` and the W6 backstop both record outcomes (success, judge quality, latency from task `_creationTime`, price); `hiveRouter.routeNode` blends profiles into the shortlist, drops proven-bad agents (>=5 tasks, <0.2 success), logs per-candidate `routing_scores` as future offline-RL data. codegen + typecheck + full `npm test` green. |
| W4 | Multi-dim ranked discovery (Agentverse) | done | `lib/hive/rank-core.ts` `rankAgents4D`: 0.4 capability + 0.3 reputation (0.3 reliability / 0.3 quality / 0.2 safety / 0.2 speed) + 0.15 price (inverted, $0.50 reference) + 0.15 availability; +`rank-core.test.ts` in `npm test`. `reputationDimensions._dimensionsForAgents` (reliability=accepted-rate, quality/speed=means, safety=1.0 placeholder). `hiveRegistry.searchAgents` `rank_mode:"4d"` (additive `HiveAgentCandidate4D` fields; default path unchanged); `hiveRouter` passes `rank_mode:"4d"` under the W3 profile blend. Availability map: ready=1.0, mock_only=0.3, down/needs_key=0.1, unknown=0.5. Market surface: `attachMarketRankDimensions` in `a2a-market-card.ts`, wired into `list_specialists` (`lib/mcp-tools.ts`) so discover consumers see the same rank. codegen + typecheck + full `npm test` green. |
| W5 | Blackboard verify + gist (DELM) | done | Admit-on-verify: `convex/scratchpad.ts` `_write` resolves optional `supporting_entry_ids` against the same DAG and labels new `verification: "evidence_backed" \| "unverified"` (schema-added, additive) — labeling only, never rejection; gated behind `ARBOR_BLACKBOARD_VERIFY_ENABLED` (default off, byte-for-byte unchanged when off) via `lib/hive/blackboard-core.ts` `blackboardVerifyEnabled`/`resolveBlackboardVerification`; threaded through `convex/scratchpadActions.ts` `writeSigned` via `BlackboardWritePayload.supporting_entry_ids`. Gist-unfold: pure `makeGist(content, maxChars=240)` helper (first-line, whitespace-collapsed, deterministic ellipsis truncation, no model call) populates a new optional `gist` field unconditionally at write time. `assembleBlackboardPointers` left untouched (no relevance signal in its input type to prefer gist on — would require broadening its public signature, out of scope). 15 new asserts in `lib/hive/blackboard-core.test.ts`; env flag row added to `docs/api-keys.md`. `npx convex codegen` + `npm run typecheck` + full `npm test` green. |

Ledger for `ARBOR_HIVE_MIND_BUILD_PLAN.md` (22 tasks). Verified 2026-06-15.

## Status: all 22 tasks built, wired, and unit-green

- `npm run typecheck` → pass (app/ + lib/)
- `npm test` → pass (all suites: anthropic, embeddings, dag, context-store, router-core, evaluator-core, settlement-core, a2a-agent-card, intake, tool-call-audit, openai-runtime)
- All deliverable files present on disk; file-modifying tasks (12, 14, 15, 19) verified wired into the live flow.

| # | Task | State | Key evidence |
|---|------|-------|--------------|
| 1 | Anthropic model layer | done | `lib/anthropic.ts` (+test) |
| 2 | Embedding module | done | `lib/hive/embeddings.ts` (+test) |
| 3 | Hive schema | done | `convex/schema.ts` (6 hive tables, 2 vector indexes) |
| 4 | Registry backend | done | `convex/hiveRegistry.ts`, `hiveRegistryData.ts`, `lib/hive/registry-core.ts` |
| 5 | Registration eval gate | done | `convex/hiveEvalGate.ts` |
| 6 | Registry REST endpoints | done | `app/api/v1/agents/{register,search}` |
| 7 | Hive registry MCP tools | done | `register_agent` / `search_agents` in `lib/mcp-tools.ts` |
| 8 | Roster embedding backfill | done | `scripts/hive-backfill-embeddings.ts` |
| 9 | DAG planner | done | `convex/hivePlanner.ts`, `lib/hive/dag.ts` |
| 10 | DAG orchestrator | done | `convex/hiveOrchestrator.ts` |
| 11 | Hive router | done | `convex/hiveRouter.ts`, `lib/hive/router-core.ts` |
| 12 | Invited-bidder auction ext | done | `invited_agent_ids` scoping in `convex/auctions.ts:450` |
| 13 | Shared context store | done | `convex/scratchpad.ts`, `lib/hive/context-store.ts` |
| 14 | Scratchpad injection | done | `assembleNodeContext` + router injection + orchestrator `result`/`decision` writes |
| 15 | Hive evaluator | done | `convex/hiveEvaluator.ts`, scheduled from orchestrator |
| 16 | Settlement accrual | done | `convex/settlement.ts`, `settlementData.ts` |
| 17 | Owner dashboard | done | `components/dashboard/HivePayouts.tsx` mounted in `app/dashboard/page.tsx` |
| 18 | Settlement REST + cron | done | `convex/crons.ts` → `settlement.accrueCurrentAndPrevious` |
| 19 | Wire hive into task post | done | `convex/tasks.ts:166` → `hivePlanner.planDag` |
| 20 | Scratchpad REST + MCP | done | `app/api/v1/scratchpad/[dagId]`, `scratchpad_{read,write,recall}` tools |
| 21 | E2E hive test | done | `scripts/hive-e2e.ts` (`npm run hive:e2e`) |
| 22 | Docs + env reference | done | `docs/api-keys.md` (ANTHROPIC_API_KEY documented) |

## Agent Task 23 — Trustworthy PR-review completion (in progress)

Built and offline-green; the live 20-run is the only remaining gate.

| Piece | State | Evidence |
|---|---|---|
| Arbor-owned fallback runner | done | `lib/specialists/arbor-baseline.ts` (`real`-tier, `[Arbor baseline]`-labeled) |
| Live PR-review specialist | done | `lib/specialists/github-pr-review.ts` |
| PR-review class detector (shared) | done | `lib/specialists/pr-review-detect.ts` (+test, see below) |
| Registered in roster, gated last-resort | done | `lib/specialists/registry.ts` |
| `agent_readiness` table + CRUD + smoke | done | `convex/schema.ts`, `convex/agentReadiness.ts`, `convex/agentReadinessActions.ts` |
| No-bid backstop in orchestrator | done | `convex/hiveBaselineBackstop.ts` + `hiveOrchestrator.ts` (`BACKSTOP_FAILED_PREFIX`) |
| Dashboard readiness section | done | `components/dashboard/SpecialistReadiness.tsx` mounted in `app/dashboard/page.tsx` |
| Reliability harness + report | done | `eval/pr-review-reliability/run.ts`; `npm run pr-review:eval:dry` → 9/9 synthetic |
| Offline verification | green | `npm run typecheck`, `npm test`, `npx convex codegen` all clean |
| Live 20× `hive:e2e` at 9/9 | pending | needs Convex `ANTHROPIC_API_KEY` + refreshed tunnels (see open item below) |

- Fix 2026-06-17: `package.json` `test` chain referenced `lib/specialists/pr-review-detect.test.ts` which did not exist, so `npm test` died with `ERR_MODULE_NOT_FOUND`. Wrote the missing test (covers all six exported helpers); suite is green again.

## Next / open item (not a code task — runtime/integration)

- **Live `npm run hive:e2e` does not pass end-to-end.** Last known run: 5/9 assertions; root DAG task ends `hive_dag_failed` because the child auction declines all bids as `implausible_plan`. Bounded open-retry (option 3) was added to `hiveOrchestrator.onNodeSettled` as a mitigation but the loop still does not complete clean.
- Requires live setup, not just code: running Convex deployment, `ANTHROPIC_API_KEY` set on Convex (`npx convex env set`), and cloudflared tunnels refreshed so Convex cloud can reach localhost A2A/worker endpoints (see memory: `arbor-a2a-e2e-tunnel-setup`).
- Suggested next session: stand up the tunnels + env, run `npm run hive:e2e`, and debug the auction `implausible_plan` rejection (plan-plausibility screen in `convex/auctions.ts` vs. the hive child prompt) until the root DAG reaches `complete`.

## OpenRouter hivemind rollout (plan: `~/.claude/plans/create-a-plan-for-sunny-tome.md`)

Phased, toggleable (`ARBOR_OPENROUTER_ENABLED`, default off; per-task `model_gateway`).

| Phase | Scope | State | Evidence |
|---|---|---|---|
| 0 | Switch + unified OpenAI-path gateway | done | `lib/openai.ts` (`openrouterEnabled()`, gateway routing in `callOpenAI`/`callOpenAIChat`, `openRouterModel()`); `convex/schema.ts` + `convex/tasks.ts` (`model_gateway`); `convex/auctions.ts` (judge + screen honor per-task gateway); `docs/api-keys.md`. typecheck + `npm test` green; offline toggle check passed (off→OpenAI, on→OpenRouter, per-call/per-task override, per-purpose slug). |
| 1 | Guaranteed bidder fixes the loop (5/9→9/9) | code done; live 9/9 gated | New `lib/specialists/arbor-hive-backstop.ts` — universal model floor (+`.test.ts`, wired into `npm test`). Registered + `ARBOR_FLOOR_AGENT_IDS` in `registry.ts`; screen-exempt in `auctions.ts`; always invited in `hiveRouter.ts` (appended past the `min_reputation 0.3` shortlist). Backfill auto-includes it (iterates SPECIALISTS). typecheck + `npm test` green; floor never declines and bids ≤ budget ceiling. Live 9/9 needs Convex deploy + a model key (open item below). model_gateway propagation to hive child tasks deferred (global switch already covers all hive model calls). |
| 2 | OpenRouter models as first-class specialists | done | `openrouter` tier + `model-backed` provenance; five-model curated roster; global/per-task gating; persisted registry/backfill/hive routing; focused HTTP smoke |
| 3 | Cost telemetry + cost-aware routing | pending | per-call cost on `hive_nodes` → settlement |
| 4 | Self-optimizing hivemind | pending | eval+cost feedback; catalog auto-sync |

Phase 0 note: native providers are byte-for-byte unchanged when the switch is off; the `ARBOR_MODEL_SPEND_DISABLED` kill switch still wins over the gateway. Live behavior on a real OpenRouter key not exercised here (no key in this env) — verified hermetically via `describeModelRuntime`.

### Phase 2 implementation checkpoint (2026-06-19)

- [x] Map specialist types, public provenance, persistence, discovery, backfill, child-task override, and hive shortlist contracts.
- [x] Add a per-model OpenRouter runner and curated reasoning/classification/long-context/coding/OSS roster.
- [x] Gate roster inclusion behind `ARBOR_OPENROUTER_ENABLED` and per-task `model_gateway`; preserve tier/model metadata through registry hydration.
- [x] Add an offline focused smoke covering switch state, model selection, bids, execution, and provenance.
- [x] Run `npx convex codegen`, `npm run typecheck`, `npm test`, and the focused smoke; update this checkpoint with evidence.

Verified 2026-06-19: OpenRouter catalog IDs checked against the live `/api/v1/models` endpoint; `npx convex codegen`, `npm run typecheck`, full `npm test`, and `npx tsx lib/specialists/openrouter-forwarding.test.ts` pass. The smoke covers exact-model requests, bearer auth, `max_tokens`, task/global switch precedence, persisted hydration, bids, execution, and honest no-tools provenance. No paid live model call was made.

| Work | Model |
|---|---|
| Cross-file architecture and integration | Opus inline |
| Discovery/registry gap review | Haiku subagent |
| Runner/test pattern review | Sonnet subagent |
| Verification | Local shell |

## TOON agentic-format switch

Token-Oriented Object Notation ([toon-format/toon](https://github.com/toon-format/toon)) for agent-to-LLM structured payloads. Toggleable (`ARBOR_TOON_ENABLED`, default off; `ARBOR_TOON_DISABLED` kill switch; per-call `"toon"`/`"json"` override), mirroring the OpenRouter master-switch pattern.

| Piece | State | Evidence |
|---|---|---|
| Codec + switch + boundary | done | `lib/toon.ts` — self-contained `encodeToon`/`decodeToon` (JSON-faithful round-trip: objects, nested, inline `[N]` primitive arrays, `[N]{fields}:` tabular uniform-object arrays, dash-list fallback, quoting), `toonEnabled()`, `toonStats()`, `serializeAgentData`/`parseAgentData`, `formatStructuredBlock` (self-describing labeled block). No npm dep; safe in Next + Convex. |
| Tests | done | `lib/toon.test.ts` — 19 tests (round-trip fidelity, tabular form, type-ambiguous string quoting, empties, root scalars/arrays, canonical-TOON read, ≥30% savings, switch precedence, boundary helpers). Wired first in `npm test`. |
| Integrations (switch-gated) | done | `convex/auctions.ts` judge "Required output schema" block; `convex/hiveEvalGate.ts` grader input block. Both via `formatStructuredBlock` → JSON when off, TOON when on, always self-describing. A2A wire envelopes to third-party agents stay JSON (remote agents don't speak TOON) — only Arbor-controlled LLM readers switch. |
| Docs | done | `docs/api-keys.md` (`ARBOR_TOON_ENABLED`/`ARBOR_TOON_DISABLED` rows); `.env.example`. |

Verified: `npm run typecheck` + full `npm test` green. Measured ~70% token reduction on a realistic 8-row specialist shortlist (353→106 est. tokens). Live behavior with the switch flipped on a deployed Convex backend not exercised here.

## Not part of this ledger

Working tree has pre-existing uncommitted edits to `convex/auctions.ts`, `lib/specialists/a2a-forwarding.ts`, `package.json`, and a new `lib/specialists/a2a-forwarding.test.ts`. These predate this checkpoint and were left untouched.

## Agent readiness matrix and per-agent smoke (2026-06-19)

| Step | State | Evidence |
|---|---|---|
| Durable matrix and smoke result schema | done | `agent_readiness`, `agent_smoke_runs`, `agent_smoke_results` |
| Registry-wide smoke runner | done | `scripts/agent-smoke.ts` + `agentReadinessActions.runSmokeBatch`; authoritative `agents` join |
| Dashboard integration | done | Full stage matrix and all six readiness filters in `SpecialistReadiness.tsx` |
| Offline verification | green | `npm run typecheck`, `npm test`, `npx convex dev --once` |
| Live registered-agent run | done | Baseline `agent-smoke-2026-06-20T05-10-21-028Z`: 154/154, 16 ready. Current `agent-smoke-2026-06-20T05-23-08-358Z`: 232/232, 25 ready, scratchpad 44/44. |

Final readiness: ready 16; endpoint down 48; needs key 27; protocol mismatch 23; needs owner action 23; mock only 17. Failure detail: registration eval failed 18, execution failed 4, bid declined 1. All 154 dashboard rows report visible; stored endpoint/evidence fields were scrubbed after the run.

The registry expanded concurrently from 154 to 232 after the baseline run. The current matrix is: ready 25; needs key 94; endpoint down 47; needs owner action 25; protocol mismatch 24; mock only 17. The final run wrote and read 44/44 material deliveries through a zero-budget run-scoped production scratchpad DAG; it creates no winning bid and is excluded from payout accrual.

Delegation: architecture and multi-file implementation use Opus inline; targeted test-gap review uses local `qwen2.5-coder:7b`; build/deploy/live execution use shell tooling.

## ACP + agentic blackboard integration (2026-06-19)

Goal: make Hive coordination board-driven, authenticated, durable, and TOON-aware without replacing Arbor's existing A2A gateway, Vickrey auctions, or Convex control plane.

| Step | State | Evidence |
|---|---|---|
| Official TOON codec + `text/toon` boundary | done | `@toon-format/toon` 2.3.0 behind the existing `lib/toon.ts` API and rollout switches; `text/toon`, `.toon`, 19 focused tests green |
| Namespaced immutable blackboard | done | `scratchpad_entries` now stores namespaces, typed entries, content media/format, writer DID, verification, supersession, and revisions; indexed namespace reads preserve legacy scratchpad reads |
| Signed external writes + control-shell permissions | done | `scratchpadActions.writeSigned` reuses agent HMAC keys/nonces; identity comes from signed headers; reviewer/control permissions enforced; anonymous REST writes removed |
| ACP/A2A discovery, SLA, Parts, Artifacts, durable states | done | Agent Card advertises ACP/blackboard/TOON/HMAC; gateway negotiates SLA and artifact format; task runs support input-required/rejected/canceled |
| Consensus loop | done | Planner proposals -> worker artifacts -> evaluator critiques -> max 2 bounded revisions -> control-shell consensus or escalation |
| Verification | done with external concern | Official TOON/ACP/blackboard/consensus focused tests green; full `npm test`, `npm run typecheck`, `npx convex codegen`, and live `npm run hive:e2e` pass. Arbor health reports 2 stale trycloudflare tunnel URLs. |

| Work | Model |
|---|---|
| Cross-file architecture, schema, security, integration | Opus inline |
| Focused implementation-gap review | local `qwen2.5-coder:7b` |
| Build, codegen, tests, health checks | deterministic local tooling |

## Stale trycloudflare readiness fix (2026-06-20)

- [x] Root cause confirmed: `list_specialists` ignores `agent_readiness` and reports configured endpoints as ready; `arbor-check` independently promotes every dead tunnel string in `.env.local` to P1.
- [x] Add smoke freshness/expiry semantics and regression tests.
- [x] Wire A2A market and health output to the latest complete smoke run.
- [x] Verify focused tests, typecheck, full tests, live market output, and Arbor health.

Fresh full run `agent-smoke-2026-06-21T05-59-44-060Z`: 232/232, 22 ready, scratchpad 41/41. A2A market now reports 15 ready among its 131 routable specialists; all four trycloudflare-backed agents are unavailable with current `endpoint_down`/`needs_key` reasons. Default `arbor-check` passes Convex, typecheck, tests, and hive E2E with no issues; the two dead `.env.local` tunnel origins are warnings backed by current smoke evidence, not P1 failures.

## A2A agent-to-agent negotiation layer (2026-07-11)

Goal: arbitrator/market agents hold coherent multi-turn negotiations with foreign A2A agents — no error text, no off-topic canned replies. Grounded in A2A spec findings: servers must keep conversation memory keyed by `contextId` (history is never retransmitted) and clients must echo `taskId`+`contextId` on follow-ups.

| Step | State | Evidence |
|---|---|---|
| Negotiation core (classification, arbitrator prompt, fallback) | done | `lib/hive/negotiation-core.ts` + tests in npm chain |
| Convex per-contextId turn memory | done | `a2a_negotiation_turns` table, `convex/a2aNegotiations.ts`, deployed |
| Inbound gateway `negotiate` intent + conversational default | done | `/api/a2a/market` returns LLM arbitrator Message replies threading contextId; task results echo contextId; agent card advertises `negotiate` |
| Outbound context threading + input-required handling | done | `a2a-forwarding.ts`: poll exits on input-required and answers once echoing taskId+contextId; bid→execute contextId cache; no more stringified-status deliverables |
| a2a-worker conversational memory | done | per-contextId turns, `negotiate` intent, continuation heuristic, contextId on all tasks |
| Verification | done | typecheck + full `npm test` green; live smoke: worker negotiate turn 1/2 threaded; market gateway turn 1 (`llm_backed:true`, 1131 grounded specialists) and turn 2 resolved "the cheaper one" from stored history (`turns_in_context:4`); explicit `discover` intent regression clean |

Env: `ARBOR_A2A_NEGOTIATION_ENABLED=false` disables the conversational path (documented in docs/api-keys.md).

| Work | Model |
|---|---|
| Protocol research fan-out (partial — rate-limited) | deep-research workflow subagents |
| Cross-file design + implementation | Fable inline |
| Build, codegen, tests, live smoke | deterministic local tooling |

---

## Encoder-target decoupling addon + routing reality audit (2026-07-29)

Goal: give the arbitrator a real, validated P(success) signal instead of defaults, and verify that the numbers driving routing are measured rather than assumed.

### Prediction heads (both validated, both above the 80% bar)

| Head | Protocol | AUC | Notes |
|---|---|---|---|
| Measured-rate (`lib/hive/probe-success-core.ts`) | temporal day-boundary holdout, 21,354 rows / 249 positives | **0.9590** | unfitted mean of two smoothed measured pass rates; Brier 0.00795 vs 0.01152 base-rate |
| Encoder cold-start (`lib/hive/encoder-head-core.ts`) | hold out whole capability-template families | **0.9390** | strict test: 40 agents share byte-identical capability text |
| Encoder cold-start | hold out random agents | 0.9450 | |
| Encoder only | temporal June→July | 0.8495 | most conservative; ranking-only (Brier does NOT beat base rate) |

Rejected, with numbers, so this is not re-litigated: 38-feature logistic regression **0.8978**, 6-feature forward-selected **0.8817**, encoder+measured-rate combined **0.9458** — all worse than the unfitted 0.9590. In-period GroupKFold reported 0.988, overstating held-out performance by ~9 points, because the probe pass rate shifted 0.55 (June) → 0.012 (July) when the 1,000-agent discovery fan-out landed.

**Architecture: the two heads are complementary, not competing.** Measured rates win wherever history exists. The encoder exists only for cold start, where both rates collapse to the corpus prior and every brand-new agent receives an identical score. `selectCandidateScore` / `rankWithHeads` enforce that the two scales are never compared directly.

### Encoder choice

`sentence-transformers/all-MiniLM-L6-v2` — 22.7M params, 6 layers, 384-dim, **$0/call**, 66ms single / 0.8ms per text batched, weights already cached locally. Chosen because it is the cheapest thing that still exposes per-layer hidden states, which the paper's Fisher layer selection requires. Ollama cannot serve embeddings without `--embeddings` and only ever exposes final-layer pooled vectors, never L/2..L. Fisher J selected **layer 2** (J=0.4341); layer 6 was worst (0.1270). Cost comparison for a 1-query/1000-agent pass: MiniLM $0.000000 vs `openai:text-embedding-3-small` $0.000801.

### Routing reality audit

| Dimension | Weight | Reality |
|---|---|---|
| capability | 0.40 | real embeddings, but **sd 0.0488 → weighted sd 0.0195** |
| reputation | 0.30 | **constant 0.600 — sd exactly 0.0000, 1 distinct value.** Only 9/1233 agents have settled history; `safety` is hardcoded 1.0 for all |
| price | 0.15 | 3 distinct values in the live pool, weighted sd 0.0090 |
| availability | 0.15 | **weighted sd 0.0367 — the largest discriminator, out-ranking capability 1.9x despite 0.40 vs 0.15 weight** |

Discovery reach: `ctx.vectorSearch("hive_agent_embeddings")` gates candidates, and that table holds **119 rows for a 1,233-agent corpus (9.7%)**. **174 of 219 `readiness=ready` agents are invisible to routing.** Of the 119 reachable, 73 were dead at audit time.

Availability is real in provenance but stale in fact: of 45 A2A agents marked `readiness=ready`, only **18 (40%) answered a live probe**; 27 are stale.

### A2A liveness (live read-only probe of all 120 endpoints)

**45/120 alive (37.5%).** Failures: 56 HTTP 404, 6 unreachable, 3× 503, 3× 401, 3× **402 Payment Required**, 2× 410 Gone, 1× 530, 1 malformed JSON. 4 of the 45 live cards declare zero skills. Slowest live: `trustauditor` 6.3s, `trust-auditor` 4.2s. The 6 unreachable include 4 of Arbor's own stale cloudflared tunnels.

### Remaining work

1. **Offline encoder job** — compute the 8-dim descriptor vector at agent-discovery time and store it per agent (mirrors `hive:backfill`). Until this runs, cold-start agents have no vector and fall back to `head: "prior"`. Vectors are deliberately NOT bundled: cold start is precisely the case of an agent absent from any bundle.
2. **Backfill `hive_agent_embeddings`** to the full corpus — the single highest-leverage routing fix, since 90% of agents currently cannot be discovered at all.
3. **Rolling recalibration** for both heads on the last N observed outcomes (window 3000, refit every 250). Shipped Platt pairs are cold-start bootstraps, not the evaluated calibrators.
4. **Populate reputation or drop its weight** — 0.30 of the blend currently cannot reorder anything.
5. ~~Measured control arm before any user-facing savings claim~~ **DONE 2026-08-04**: `ValueImpactPanel` now shows measured counterfactual savings (same tokens at gpt-5.2 list minus actual measured spend, `lib/honest-savings.ts`) and lifecycle-measured execution time; the headroom number is relabeled "Budget unspent" and the 30-minute baseline constant is deleted. Cost capture is live on organic tasks (`execution_cost_usd` on the task row via `collectUsage` in `auctions.execute`). Evidence: autoresearch/experiments/e4-honest-savings/ and e7-measured-latency/.
6. **Quality head** remains untrainable: 231 judge-graded smoke rows are 73 agents × 73 prompts, exactly 1:1, so an encoder could only memorise agent identity. Needs a shared task battery.

| Work | Model |
|---|---|
| Data extraction, feature engineering, model selection, ablations | Fable inline |
| Encoder implementation + per-layer Fisher analysis | local MiniLM-L6 (free) |
| A2A liveness probe, routing trace | deterministic local tooling |
