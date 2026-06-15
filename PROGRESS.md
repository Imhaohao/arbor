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

## Next / open item (not a code task — runtime/integration)

- **Live `npm run hive:e2e` does not pass end-to-end.** Last known run: 5/9 assertions; root DAG task ends `hive_dag_failed` because the child auction declines all bids as `implausible_plan`. Bounded open-retry (option 3) was added to `hiveOrchestrator.onNodeSettled` as a mitigation but the loop still does not complete clean.
- Requires live setup, not just code: running Convex deployment, `ANTHROPIC_API_KEY` set on Convex (`npx convex env set`), and cloudflared tunnels refreshed so Convex cloud can reach localhost A2A/worker endpoints (see memory: `arbor-a2a-e2e-tunnel-setup`).
- Suggested next session: stand up the tunnels + env, run `npm run hive:e2e`, and debug the auction `implausible_plan` rejection (plan-plausibility screen in `convex/auctions.ts` vs. the hive child prompt) until the root DAG reaches `complete`.

## Not part of this ledger

Working tree has pre-existing uncommitted edits to `convex/auctions.ts`, `lib/specialists/a2a-forwarding.ts`, `package.json`, and a new `lib/specialists/a2a-forwarding.test.ts`. These predate this checkpoint and were left untouched.
