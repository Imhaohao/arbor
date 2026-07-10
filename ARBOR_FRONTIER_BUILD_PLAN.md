# Arbor Frontier Build Plan — Autonomous DAG Execution (Target "a")

Execution owner: **Fable 5**. This plan tells which builder agent/model builds which part.
Goal: a human posts one task → the hive decomposes and runs the full DAG to delivery with **zero further human input**, on **Azure OpenAI** (Anthropic key exhausted).

Research cutoff for this plan: frontier work May–Jun 2026 (past the Jan 2026 model cutoff; all sourced live). Verified against the current repo on 2026-07-03.

---

## 0. Frontier research grounding (last ~2 months)

Each finding is tied to the Arbor module it informs. Full citations in §6.

| Frontier finding (date) | One-line | Arbor module it maps to |
|---|---|---|
| **SeqRoute** — budget-aware sequential routing via offline RL (May 2026) | Route across a *sequence* under one global budget, forward-looking, not greedy per-query; reserve budget for harder later steps. | `hiveRouter` + `hiveOrchestrator` + `auctions` budget ceiling |
| **FlyRoute** — self-evolving agent profiling via data flywheel (May 2026) | Agent capability profiles updated in real time from execution outcomes (success/latency/quality); routing scores task-vs-profile compatibility + uncertainty. | `agentReadiness` + `reputationDimensions` + `hiveRouter` |
| **AutoMaAS** — self-evolving multi-agent architecture search (cost-aware operator lifecycle) | Sample query-dependent architectures from an evolving supernet; online feedback + cost-aware operator add/fuse/eliminate; +1–7% quality, −3–5% cost. | `hivePlanner` (query-dependent DAG shape) |
| **MasRouter (MASR)** — single-vs-multi-agent + role selection | Decide *whether* a query needs a multi-agent workflow at all, and which roles. Avoids blanket multi-agent overhead. | `hivePlanner` / `tasks` intake |
| **Agentverse** — semantic discovery ranked by capability×reputation×price×availability; multi-dim reputation (reliability/quality/safety/speed); SLA + DID identity; Stripe+crypto native payments (Jun 2026) | Discovery is a *4-dimensional recommendation engine*, not a keyword phone book. | `hiveRouter` shortlist + `a2a-market-card` + `reputationDimensions` + `settlement` |
| **DELM / structured blackboard** — curated verified shared state (2026) | Entries admitted *only after verification against supporting evidence*; stored as compact **gists that unfold on demand**; fully async, no central controller. | `scratchpad` / `scratchpadActions` + `hiveEvaluator` |
| **Survey (Mar 2026) + IBM** — orchestrator-worker is ~70% of prod; multi-agent adds +58–285% token overhead; structured agent logic on mid-size models beats naked frontier at ~30× fewer tokens | Only go multi-agent when it pays; push work down the model ladder. | Whole hive + model routing |

### Frontier model economics (drives the router roster — §W7)

| Model (release) | $/1M in·out | Ctx | Best at | Route to it for |
|---|---|---|---|---|
| **Gemini 3.5 Flash** (May 19 2026) | $1.50 / $9 | 1M | MCP Atlas 83.6% (leads), tool-use, multimodal, 278 tok/s | tool/MCP loops, multimodal, cheap high-volume nodes. Caveat: verbose. |
| **GPT-5.5** (Apr 2026) | $5 / $30 | 272K | ARC-AGI-2 84.6%, AA-Intelligence 60 (leads) | novel/abstract reasoning, planner on hard tasks |
| **Claude Opus 4.7/4.8** | $5 / $25 | 1M | SWE-Bench Pro 64.3%, Verified ~80.8% (leads) | hard software-engineering / PR-review nodes |
| **DeepSeek V4 Pro / Kimi K2.6** (open-weight) | frontier-quality, low cost | — | coding/reasoning at low price | bulk/cost-capped nodes, local-ish tier |

Routing thesis for Arbor: **most nodes are not frontier-hard.** Default nodes to Gemini 3.5 Flash (value leader for tool loops); escalate reasoning to GPT-5.5, hard code to Opus; drop bulk to DeepSeek/Kimi. This is the concrete 2026 instantiation of Arbor's existing purpose-based model selection in `lib/openai.ts`.

---

## 1. The blocker that makes "switch to Azure" silently half-work

`callClaude` in [`lib/anthropic.ts`](lib/anthropic.ts) is a fallback chain (Anthropic → OpenRouter → `callOpenAI`). `callOpenAI` in [`lib/openai.ts`](lib/openai.ts) already resolves Azure/Foundry. **But** the final (Azure-capable) branch is gated on `env("OPENAI_API_KEY")` at [`lib/anthropic.ts:279`](lib/anthropic.ts:279) — and `describeClaudeRuntime` repeats the bug at [:143](lib/anthropic.ts:143). In a pure-Azure deployment (`AZURE_OPENAI_API_KEY` + `ARBOR_AZURE_ENABLED=true`, no OpenAI key), the chain finds no matching guard, sets `attempted=false`, and **throws** — so `hivePlanner`, `hiveRouter`, `hiveEvaluator`, `hiveEvalGate`, `agentReadinessActions` (all direct `lib/anthropic.ts` importers) go dark and the DAG collapses to one node ([:185](lib/anthropic.ts:185)).

`resolveProvider()` returns `azure-openai` whenever `ARBOR_AZURE_ENABLED=true`, **independent of `OPENAI_API_KEY`**, and authenticates with `azureApiKey()`. So the fix is to gate the fallback on provider-usability, not on the OpenAI key. **This is W1 and it blocks everything else.**

---

## 2. Workstreams

Ordered by dependency. Each: what, frontier basis, files, builder.

### W1 — Azure provider unblock (FOUNDATION, do first)
- **What:** In `lib/anthropic.ts`, change the third-fallback guard (and `describeClaudeRuntime`) from `env("OPENAI_API_KEY")` to `describeModelRuntime("planner").provider !== "disabled"`, so the control-plane reaches Azure. Set Azure env on the **Convex deployment** (not just `.env.local`): `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `ARBOR_AZURE_ENABLED=true`, and per-purpose `AZURE_OPENAI_PLANNER_DEPLOYMENT` / `AZURE_OPENAI_FAST_DEPLOYMENT` (`azureDeployment()` throws if unset, [`lib/openai.ts:216`](lib/openai.ts:216)).
- **Frontier basis:** n/a (infra). Precondition for all model-backed workstreams.
- **Files:** `lib/anthropic.ts`, Convex env; regression test in `lib/*.test.ts`.
- **Builder:** **Fable 5 inline** (model-routing/auth layer — global rules keep routing on top tier). Tests → **Sonnet**.

### W2 — Global budget-aware DAG routing (SeqRoute)
- **What:** Today each node auctions independently against the task budget. Add a **DAG-level budget allocator**: distribute the parent task's `max_budget` across nodes forward-looking (reserve for downstream/harder nodes by depth + estimated difficulty), instead of greedy per-node. Start with a heuristic value function (offline-RL is the stretch goal; log the data to enable it later).
- **Frontier basis:** SeqRoute (global budget, forward-looking, offline-RL-ready). Also Arbor Phase 3 (cost telemetry → settlement).
- **Files:** `convex/hiveRouter.ts`, `convex/hiveOrchestrator.ts`, `convex/auctions.ts` (budget ceiling per node), `lib/hive/router-core.ts`; per-call cost telemetry onto `hive_nodes`.
- **Builder:** **Fable 5 inline** (novel cross-file algorithm touching money flow). Cost-logging plumbing → **Sonnet**.

### W3 — Self-evolving agent profiles / data flywheel (FlyRoute + AutoMaAS)
- **What:** Close the loop: on every settled node, update a durable **capability profile** per agent (success rate, latency, judge quality by task-class, uncertainty) from the judge `quality_score` Arbor already writes. Feed profiles into the router's shortlist score. This is Arbor's Phase 4 self-optimizing hivemind made concrete.
- **Frontier basis:** FlyRoute (profile store + compatibility scoring + flywheel), AutoMaAS (online feedback, cost-aware operator lifecycle).
- **Files:** new `convex/agentProfiles.ts` (+ schema table), `convex/reputationDimensions.ts`, `convex/hiveOrchestrator.ts` (`onNodeSettled` writes outcome), `convex/hiveRouter.ts` (profile-weighted shortlist), `lib/hive/router-core.ts`.
- **Builder:** **Fable 5 inline** (schema + closed-loop across orchestrator/router). Profile-updater unit + tests → **Sonnet**.

### W4 — Multi-dimensional ranked discovery (Agentverse)
- **What:** Replace embedding + `min_reputation 0.3` shortlist with a **4-dimensional rank**: capability match × reputation × price × availability. Extend reputation to reliability/quality/safety/speed. Surface the same ranking in the A2A market card.
- **Frontier basis:** Agentverse Almanac-as-recommendation-engine; multi-dim reputation.
- **Files:** `convex/hiveRouter.ts` (ranker), `convex/reputationDimensions.ts`, `lib/specialists/a2a-market-card.ts`, `convex/hiveRegistry.ts` (faceted filter).
- **Builder:** **Sonnet** (scoped scoring function over existing dims). Rank design + Fable 5 review.

### W5 — Curated/verified blackboard with gist-unfold (DELM)
- **What:** Arbor's scratchpad is already namespaced/signed/typed/TOON. Add: (1) **admit-on-verify** — entries validated against supporting evidence before they land; (2) **gists that unfold on demand** — store compact gist + expandable detail to keep shared state scalable as agent count grows.
- **Frontier basis:** DELM (verified curated state, gist unfold, async queue).
- **Files:** `convex/scratchpadActions.ts` (verify gate in `writeSigned`), `convex/scratchpad.ts` (gist/detail fields), `lib/hive/blackboard-core.ts`, `lib/toon.ts` (gist encode).
- **Builder:** **Sonnet** (scoped on scratchpad). Verification-gate design → **Fable 5**.

### W6 — Guaranteed terminal executor (correctness contract for "a")
- **What:** Generalize the PR-review-only backstop at [`hiveOrchestrator.ts:136`](convex/hiveOrchestrator.ts:136) (`isPrReviewTask`-gated) to **every node class**. After shortlist + bounded open-retry exhaust, hand any still-failed node to the Azure floor agent (`arbor-hive-backstop`, screen-exempt, always-invited, `callOpenAI`→Azure, runs inside Convex, needs no tunnel). Guarantees the DAG always reaches delivery when the Azure key is set; fails fast+labeled when it isn't.
- **Frontier basis:** n/a (Arbor's "always terminates" contract). Enables tunnel-free happy path.
- **Files:** `convex/hiveOrchestrator.ts`, `convex/hiveBaselineBackstop.ts`, `lib/specialists/arbor-hive-backstop.ts`, `lib/specialists/registry.ts`.
- **Builder:** **Fable 5 inline** (orchestrator control flow, correctness-critical, hard to undo).

### W7 — Frontier model roster + purpose routing
- **What:** Update the curated roster and purpose→deployment mapping to the 2026 economics: default nodes → Gemini 3.5 Flash; reasoning → GPT-5.5; hard code/PR-review → Opus 4.8; bulk/cost-capped → DeepSeek V4 Pro / Kimi K2.6. Wire Azure deployment names per purpose. Add a verbosity guard for Flash (cap `max_tokens`).
- **Frontier basis:** §0 model table (Gemini 3.5 Flash, GPT-5.5, Opus 4.8, DeepSeek/Kimi).
- **Files:** `lib/specialists/catalog-*.ts` / OpenRouter roster, `lib/openai.ts` (purpose suffix → Azure deployment), `docs/api-keys.md`.
- **Builder:** roster/catalog data edits → **local `qwen2.5-coder:7b`** (bulk); purpose-mapping wiring → **Sonnet**; final routing review → **Fable 5**.

### W8 — Single-vs-multi-agent gate (MasRouter)
- **What:** Before `hivePlanner.planDag`, a cheap classifier decides single-node vs full DAG (and rough role set). Kills the +285% multi-agent token overhead the Mar-2026 survey flags on simple tasks.
- **Frontier basis:** MasRouter MASR; survey cost overhead numbers.
- **Files:** `convex/hivePlanner.ts`, `convex/tasks.ts` (intake branch), `lib/hive/dag.ts`.
- **Builder:** **Sonnet** (one classifier + one branch). Fable 5 review.

---

## 3. Sequencing / milestones

1. **M1 — Runs on Azure at all:** W1. Then live `npm run hive:e2e` with Azure env → planner/router/evaluator alive.
2. **M2 — Always terminates (100%-workable "a"):** W6 + W8. DAG completes tunnel-free via the Azure floor agent; simple tasks skip the DAG.
3. **M3 — Cost-correct:** W2 + W7. Budget respected across the DAG; nodes on the right-priced 2026 models.
4. **M4 — Self-improving + better discovery:** W3 + W4 + W5. Profiles/reputation/blackboard close the loop.

M2 is the definition-of-done for the target the user chose ("a", 100% workable). M3–M4 are the frontier upgrades.

---

## 4. Delegation table (task → builder)

| Workstream | Builder | Why this tier |
|---|---|---|
| W1 gateway fix | **Fable 5 inline** | model-routing/auth layer, unblocks all |
| W1 tests | Sonnet | scoped test for a known module |
| W2 budget allocator | **Fable 5 inline** | novel algorithm across router/orchestrator/money |
| W2 cost telemetry | Sonnet | scoped plumbing |
| W3 flywheel loop + schema | **Fable 5 inline** | closed loop across orchestrator+router, schema |
| W3 profile updater + tests | Sonnet | single-module unit |
| W4 multi-dim ranker | Sonnet | scoped scoring over existing dims |
| W5 blackboard verify+gist | Sonnet (design: Fable 5) | scoped on scratchpad |
| W6 terminal executor | **Fable 5 inline** | orchestrator control flow, correctness-critical |
| W7 roster data | local `qwen2.5-coder:7b` | bulk catalog edits, offline |
| W7 purpose wiring | Sonnet | scoped config wiring |
| W8 single-vs-multi gate | Sonnet | one classifier + one branch |
| All typecheck/test/e2e/codegen | local shell | deterministic verification |

All-Fable-5 would be a bug: only W1/W2/W3/W6 (cross-file, algorithmic, correctness- or money-critical) stay top-tier; the rest push down the ladder.

---

## 5. Honest scope caveat

"100% workable (a)" = the network *completes every task* to a judged, honestly-labeled delivery. It does **not** mean all ~232 catalog agents are live — post-W1 only ~22 real specialists + the Azure floor/baseline execute; the rest stay `needs_key`/`endpoint_down`. Breadth of *real* third-party specialists is a separate, longer road (per-agent credentials + live endpoints) and is out of scope for target "a".

---

## 6. Sources (all live-fetched, May–Jun 2026 unless noted)

- SeqRoute: budget-aware sequential LLM routing (offline RL) — arXiv:2605.25424
- FlyRoute: self-evolving agent profiling via data flywheel — arXiv:2605.22057
- Switchcraft: AI model router for agentic tool calling — arXiv:2605.07112
- MetaAgent-X: end-to-end RL for automatic MAS — arXiv:2605.14212
- AutoMaAS: self-evolving multi-agent architecture search — arXiv:2510.02669; foundational Agentic Supernet — arXiv:2502.04180
- MasRouter: routing LLMs for multi-agent systems — arXiv:2502.11133
- AgentOrchestra: hierarchical multi-agent framework — arXiv:2506.12508
- Agentverse: infrastructure for the agentic web (gap analysis) — arXiv:2606.20570
- Magentic Marketplace (Microsoft) — arXiv:2510.25779
- DELM / LLM-based multi-agent blackboard — arXiv:2510.01285; Decentralized MAS with shared context — arXiv:2606.10662
- Survey: LLM-based multi-agent orchestration (Mar 2026 cutoff) — doi.org/10.3390/fi18060326
- A2A protocol v1.0 (Apr 2026, Linux Foundation); AgentCard at `/.well-known/agent-card.json`
- Frontier models: Gemini 3.5 Flash (llm-stats.com, artificialanalysis.ai, OpenRouter), GPT-5.5 & Opus 4.7/4.8 comparisons (mindstudio.ai, datacamp.com), IBM structured-agent-logic (davidveksler frontier cheatsheet)
