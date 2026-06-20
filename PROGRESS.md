# Arbor Hive Mind — Build Progress

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
| Live 154-agent run | done | `agent-smoke-2026-06-20T05-10-21-028Z`: 154/154 persisted; 16 ready |

Final readiness: ready 16; endpoint down 48; needs key 27; protocol mismatch 23; needs owner action 23; mock only 17. Failure detail: registration eval failed 18, execution failed 4, bid declined 1. All 154 dashboard rows report visible; stored endpoint/evidence fields were scrubbed after the run.

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
