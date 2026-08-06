# API Key Tracker

Never commit real values. `.env.local` is for Next.js; Convex actions read a
separate deployment env, so set Convex-side values with `npx convex env set ...`
or in the Convex dashboard.

## Hive Environment

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Both | One of Anthropic/OpenRouter required for Hive | Preferred direct Anthropic Messages API credential for the planner, evaluator, router classifier, and eval gate. Set it on Convex too: `npx convex env set ANTHROPIC_API_KEY '<value>'`. |
| `OPENROUTER_API_KEY` | Both | Alternative to `ANTHROPIC_API_KEY` | Runs the same Hive Claude calls through OpenRouter's OpenAI-compatible chat endpoint when the direct Anthropic key is absent. Set it on Convex with `npx convex env set OPENROUTER_API_KEY '<value>'`. |
| `OPENROUTER_CLAUDE_PLANNER_MODEL`, `OPENROUTER_CLAUDE_FAST_MODEL` | Both | Optional | OpenRouter model overrides. Defaults are `anthropic/claude-fable-5` and `anthropic/claude-haiku-4.5`. |
| `OPENROUTER_BASE_URL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_NAME` | Both | Optional | OpenRouter endpoint and attribution overrides. |
| `ARBOR_OPENROUTER_ENABLED` | Both | Optional, default off | Master switch for the OpenAI-compatible path (`lib/openai.ts`). When `true`, every `callOpenAI` site (auction plan screen + judge, intake, demos, specialist bid/execute, MCP-forwarding loop, discovery/suggest ranking, baseline backstop) routes through OpenRouter under `OPENROUTER_API_KEY`, bypassing OpenAI/Azure/Foundry. Off → native providers, byte-for-byte unchanged. `ARBOR_MODEL_SPEND_DISABLED` still wins. |
| `OPENROUTER_MODEL`, `OPENROUTER_<PURPOSE>_MODEL` | Both | Optional | OpenRouter model slugs used when the switch is on (e.g. `anthropic/claude-opus-4-8`, `openai/gpt-4o-mini`). Per-purpose forms `OPENROUTER_JUDGE_MODEL`, `OPENROUTER_AGENT_MODEL`, etc. Native `OPENAI_MODEL` is left untouched. Default `openai/gpt-4o-mini`. |
| `ARBOR_TOON_ENABLED` | Both | Optional, default off | Master switch for TOON ([Token-Oriented Object Notation](https://github.com/toon-format/toon)) on agent-to-LLM structured payloads (`lib/toon.ts`). When `true`, structured blocks embedded in LLM prompts — the judge's required output schema (`convex/auctions.ts`) and the eval-gate grader input (`convex/hiveEvalGate.ts`) — are encoded as TOON instead of pretty JSON, cutting ~30-70% of the tokens those blocks cost. Each block stays self-describing (label states the format). Off → JSON, byte-for-byte unchanged. Decoding is symmetric (`decodeToon`/`parseAgentData`). A2A wire envelopes to third-party agents stay JSON regardless — only Arbor-controlled LLM readers get TOON. |
| `ARBOR_TOON_DISABLED` | Both | Optional | Emergency kill switch for TOON. When `true`, forces JSON everywhere, beating both `ARBOR_TOON_ENABLED` and any per-call `"toon"` override. |
| `ARBOR_BASELINE_FALLBACK` | Convex | Optional, default false | When set to `"true"`, widens the arbor-baseline specialist to bid on ALL task classes instead of only PR code review. Leave unset or `false` for the scoped Task-23 rollout. Set with `npx convex env set ARBOR_BASELINE_FALLBACK 'true'`. |
| `PEXELS_API_KEY` | Both | Optional but STRONGLY recommended for stock | Free key (instant, no payment) from pexels.com/api. Powers royalty-free photo/video sourcing in `scripts/render-video.ts` and is the **highest-quality stock provider** in the registry. Key goes in the `Authorization` header as a bare value — no `Bearer` prefix. 200 req/hour, 20,000/month; attribution is optional but unlocks a higher limit. Pexels License = free commercial use, no attribution required. Without this key the renderer falls back to Openverse, which is a Creative-Commons *search aggregator*, not a stock library, and returns loose keyword matches (measured: a vintage lamb illustration and a Best Buy storefront for "kid jumping in joy"). |
| `PIXABAY_API_KEY` | Both | Optional | Free key from pixabay.com/api/docs. Second-choice stock provider. Key is a **query parameter**, not a header. ~100 req/60s. **Responses must be cached for 24h — a hard API requirement, not advice** — and permanent image hotlinking is forbidden (download first; video may be embedded). Pixabay Content License = free commercial use, no attribution required. |
| `ARBOR_STOCK_TIMEOUT_MS` | Both | Optional | Per-request stock timeout, default 60000. Openverse cold-starts slowly (measured 40.5s first call, ~0.7s warm), so a shorter timeout silently drops the free provider. |
| `ARBOR_STOCK_USER_AGENT` | Both | Optional | User-Agent for stock requests. Wikimedia refuses generic agents outright. |
| `FISH_AUDIO_API_KEY` | Both | Optional; required for `fish-audio-voice` to execute | Powers the `fish-audio-voice` specialist — narration and voiceover, including cloned voices. `POST https://api.fish.audio/v1/tts`, `Authorization: Bearer <key>`. Also accepted as `FISH_API_KEY` or `ARBOR_FISH_AUDIO_API_KEY`. **The engine is sent as an HTTP `model:` header, not a body field** — putting it in the body silently falls back to the default engine. Billing is per character (~$15/M), so input is clamped to 8,000 chars. `scripts/render-video.ts` prefers Fish Audio over macOS `say` whenever this key is present, independently of the image backend. With no key the specialist DECLINES to bid and `execute` throws; it never emits a placeholder audio URL. Do NOT point this at `fishaudio.org` — that is a separate unofficial service with a different path and parameter names; the official host is `api.fish.audio`. |
| `ARBOR_FISH_AUDIO_MODEL` | Both | Optional | Fish Audio engine: `s1`, `s2-pro`, `s2.1-pro`, or `s2.1-pro-free`. Default `s2.1-pro-free` (the API's own default tier). An unrecognized value falls back to the default rather than being sent through and rejected with a 422. |
| `ARBOR_FISH_AUDIO_REFERENCE_ID` | Both | Optional | Voice model id for a cloned//selected voice. Note `reference_id` picks the VOICE and `model` picks the ENGINE — on self-hosted Fish Speech servers `--reference_id` also means voice, which is a common porting mistake. Absent means the API default voice. |
| `ARBOR_VOICE_OUTPUT_DIR` | Next.js | Optional | Overrides where rendered narration is written (default `public/voice/`, served at `/voice/...`). When overridden the deliverable reports a filesystem path instead of claiming a served URL. |
| `ELEVENLABS_API_KEY` | Both | Optional; required for the `generate_music` node to execute | Powers the `elevenlabs-music` specialist (`POST /v1/music`, header `xi-api-key`). Also accepted as `XI_API_KEY` or `ARBOR_ELEVENLABS_API_KEY`. This is the soundtrack leg of the media DAG: `creative_brief` fans out to `generate_video` **and** `generate_music` in parallel, and `edit_video` joins them. With no key the specialist DECLINES to bid and `execute` throws — it never emits a placeholder audio URL, and the DAG falls through to a picture-only cut that `media_review` records as missing audio. Get a key at elevenlabs.io; music generation consumes ElevenLabs credits. |
| `ARBOR_MUSIC_MODEL_ID` | Both | Optional | ElevenLabs music model. Default `music_v2`. Note the API's own default is still `music_v1` during the transition, so this is set explicitly. |
| `ARBOR_MUSIC_OUTPUT_DIR` | Next.js | Optional | Overrides where rendered soundtracks are written (default `public/music/`, served at `/music/...`). When overridden, the deliverable reports a filesystem path instead of a served URL — it does not claim a public URL it cannot serve. Mirrors `ARBOR_EXPLAINER_OUTPUT_DIR`. |
| `ARBOR_ROUTING_INTEGRITY_ENABLED` | Both | Optional, default off | Routing-integrity guards (`lib/hive/routing-integrity-core.ts`). No new secret. When `true`, a shortlist whose best capability similarity falls below the calibrated floor (default `0.35`) is treated as "no capable candidate" and routed to an **open auction** instead of returning a confidently irrelevant shortlist. Measured motivation: `"make me a video about a kid jumping in joy after getting into stanford"` ranked a human-state agent, a Korean news agent and a rental search at the top with best similarity `0.2332`, because no video-capable agent was reachable. The assessment is computed and logged in the `hive_node_routed` event (`capability_integrity`, with `gated` recording whether it changed routing) **even when this flag is off**, so it is safe to observe in shadow first. NOTE: the floor is calibrated for all-MiniLM-L6-v2 cosine; discovery currently embeds with `openai:text-embedding-3-small`, so recalibrate via `calibrateCapabilityFloor` before trusting the default against a different embedding model. |
| `ARBOR_ROUTING_INTEGRITY_DISABLED` | Both | Optional | Kill switch for the routing-integrity guards; wins over `ARBOR_ROUTING_INTEGRITY_ENABLED`. Shadow logging continues. |
| `ARBOR_PROBE_SUCCESS_ENABLED` / `ARBOR_PROBE_SUCCESS_SHADOW` / `ARBOR_PROBE_SUCCESS_DISABLED` | Both | Optional, default off | Probe-success head (`lib/hive/probe-success-core.ts`) — calibrated P(a solicited agent actually returns a usable bid), for spending invite slots on agents that will answer. Unfitted mean of two additively-smoothed measured rates; ranking AUC 0.9590 / prequential 0.9126 on a temporal holdout (21,354 rows, 249 positives) vs 0.8205 for the incumbent 3-bucket availability enum. `_SHADOW` scores without changing invites. `_DISABLED` wins. No new secret. |
| `ARBOR_ENCODER_HEAD_ENABLED` / `ARBOR_ENCODER_HEAD_DISABLED` | Both | Optional, default off | Encoder-target-decoupling cold-start head (`lib/hive/encoder-head-core.ts`). Used **only** for agents with no probe/smoke history, where the probe-success head returns the flat corpus prior for everyone and ordering is arbitrary. A local 22.7M-param encoder (`all-MiniLM-L6-v2`, **$0/call**, no GPU, no API) reads an agent's descriptor text and predicts whether that external A2A/MCP service will answer: family-holdout AUC 0.9390. Ranking-only — its Brier does not beat base-rate, so it must not be surfaced as a calibrated probability. Per-agent vectors are computed at discovery time, not bundled. No new secret. |
| `ARBOR_PARETO_BID_ENABLED` / `ARBOR_PARETO_BID_DISABLED` | Both | Optional, default off | Swaps the auction's Vickrey ratio (`reputation x P(accept) / price`) for the beta-tunable utility `quality^gamma - beta x normalized_cost` (`lib/hive/pareto-core.ts`). The ratio hard-codes one exchange rate between quality and money, so the market has exactly one operating point; the beta form lets it be tuned to an SLO. The two scores are NOT on a common scale, so the flag switches wholesale — every bid in an auction is ranked by the same rule. `_DISABLED` wins. No new secret. |
| `ARBOR_PARETO_BETA` | Both | Optional, default `0.1` | Cost sensitivity for the above. Tiers: `0.001` quality-first (cost is a tie-breaker only), `0.1` balanced, `0.25` cost-efficient. Ignored unless `ARBOR_PARETO_BID_ENABLED`. |
| `ARBOR_PARETO_GAMMA` | Both | Optional, default `1` | Exponent on the quality term. `>1` sharpens the preference for high-confidence bids. |
| `ARBOR_EXPLAINER_AUDIO_ENABLED` | Next.js | Optional, default off | Audio slice of the `codebase-explainer` specialist. When `true`, execute renders the two-host lesson to `public/explainers/<task>/audio.wav` via the OpenAI TTS API (`/v1/audio/speech`) using the existing `OPENAI_API_KEY` — no new secret. Voices default to Nova→`nova`, Kit→`onyx`; override with `ARBOR_EXPLAINER_VOICE_NOVA` / `ARBOR_EXPLAINER_VOICE_KIT`, model with `ARBOR_EXPLAINER_TTS_MODEL` (default `gpt-4o-mini-tts`). Render failures degrade to an honest footer in the deliverable, never a failed task. Standalone driver: `npm run explainer:render`. |
| `ARBOR_EXPLAINER_VIDEO_ENABLED` | Next.js | Optional, default off | Video slice of the `codebase-explainer` specialist: SVG slides (one per dialogue turn + title card) rasterized with `sharp`, encoded to 1280x720 H.264 `video.mp4` by the `ffmpeg-static` devDependency, slide cuts driven by the stitched audio timeline. Implies audio synthesis (needs `OPENAI_API_KEY`). Requires a writable filesystem + ffmpeg-static installed, so it renders in dev/scripts, not on serverless — elsewhere the deliverable footer reports the failure honestly. |
| `ARBOR_EXPLAINER_OUTPUT_DIR` | Next.js | Optional | Overrides where explainer artifacts are written (default `public/explainers/`, which `npm run dev` serves at `/explainers/...`). When overridden, the deliverable reports filesystem paths instead of public URLs. |
| `ARBOR_BLACKBOARD_VERIFY_ENABLED` | Convex | Optional, default off | DELM-style (arXiv:2510.01285) admit-on-verify gate for the agentic blackboard (`convex/scratchpad.ts` `_write`, `lib/hive/blackboard-core.ts`). When `true`, a new entry that declares `supporting_entry_ids` gets those ids resolved against the same DAG: all-resolved → `verification: "evidence_backed"`; none declared or any missing → `verification: "unverified"`. Curation is labeling only — unverified entries are still stored, never rejected. Off (default) → no `verification` field is written at all, byte-for-byte unchanged from pre-DELM behavior. Set with `npx convex env set ARBOR_BLACKBOARD_VERIFY_ENABLED 'true'`. |
| `ARBOR_HIVE_BESTOFN_ENABLED` | Convex | Optional, default off | Sakana-style best-of-N candidate search (AB-MCTS pattern, arXiv:2503.04412). When `true`, a high-value DAG node (`task_class` reasoning/generation) with budget to spare fans out into K parallel candidate executions instead of one; each runs the normal auction→execute→judge pipeline, all land in `hive_node_candidates`, and the judge's calibrated score promotes the best onto the node (losers kept as a replayable archive + extra flywheel signal). Budget-safe: the node's SeqRoute ceiling is SPLIT across candidates, so K candidates never exceed the single-winner spend. Off (default) → single-winner-per-node path is byte-for-byte unchanged. Logic in `lib/hive/candidate-search-core.ts` + `convex/hiveCandidates.ts`. Set with `npx convex env set ARBOR_HIVE_BESTOFN_ENABLED 'true'`. |
| `ARBOR_HIVE_BESTOFN_DISABLED` | Convex | Optional | Emergency kill switch for best-of-N — forces single-winner everywhere, beating `ARBOR_HIVE_BESTOFN_ENABLED`. |
| `ARBOR_HIVE_BESTOFN_MAX` | Convex | Optional, default 3 | Max candidates per node under best-of-N. Clamped to [1,5] so a mis-set value cannot explode the fan-out. |
| `ARBOR_HIVE_BESTOFN_MIN_BUDGET` | Convex | Optional, default 10 | Minimum per-candidate budget. A node fans out only if its ceiling can afford at least two of these, keeping best-of-N budget-sensitive. |
| `ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS` | Convex | Optional, default 600 (clamped 60–3600) | Liveness deadline for the fan-out barrier, measured past the bid window. Convex actions are not retried on failure, so a candidate `routeNode` that dies before minting its child would leave the barrier short forever; at the deadline `hiveCandidates.forcePromotionCheck` promotes from whatever candidates actually settled, or fails the node to the W6 floor if none did. |
| `ARBOR_ORCHESTRATOR_FIRST_ENABLED` | Convex | Optional, default off | Orchestrator-first direct assignment. On a thin market (fewer than `ARBOR_DIRECT_ROUTE_LIQUIDITY` independent ready candidates for a node), `hiveRouter.routeNode` skips the bid round: it writes one synthetic bid (`plan_source: "direct_assignment"`, priced at the agent's flywheel avg price, else registry cost baseline, else the node ceiling, always clamped to budget) for the top profile-ranked ready candidate and schedules `auctions.resolve` immediately. The degenerate single-bid Vickrey then runs the unchanged escrow -> execute -> judge -> settle pipeline; a failed direct assignee falls into the W6 floor backstop exactly like a failed auction. Conservative gating in `lib/hive/router-core.ts` `decideRouteMode`: `force_open` retries, best-of-N fan-outs, consensus revisions, and exhausted budgets always auction. Decision telemetry lands in `hive_node_routed` (`route_mode`, `route_mode_reason`, `independent_ready_count`). Set with `npx convex env set ARBOR_ORCHESTRATOR_FIRST_ENABLED 'true'`. |
| `ARBOR_ORCHESTRATOR_FIRST_DISABLED` | Convex | Optional | Emergency kill switch for orchestrator-first — forces the auction path everywhere, beating `ARBOR_ORCHESTRATOR_FIRST_ENABLED`. |
| `ARBOR_DIRECT_ROUTE_LIQUIDITY` | Convex | Optional, default 3 (clamped 2–10) | Independent ready candidates (floors and non-`ready` agents excluded) at/above which a node's market counts as liquid and a real auction runs instead of direct assignment. |
| `ARBOR_EXPERT_DELEGATION_ENABLED` | Convex | Optional, default off | Fugu-inspired expert policy in `hiveRouter.routeNode`. A bundled query-conditioned selection head adds a bounded logit for known agents; unseen agents retain 4D/profile ranking. The bundled seed is trained from curated router-benchmark gold labels, not measured executions. `npm run delegation:train -- --data <measured.jsonl>` accepts real `{query, worker_rewards}` JSON/JSONL when best-of-N/shadow trajectories exist. Direct assignment also requires same-task-class exact outcome counts, at least `ARBOR_EXPERT_MIN_TASKS` trials, success/quality floors, a Wilson lower bound, semantic fit >= 0.15, two ready candidates, and score margin >= 0.08. Otherwise the auction remains; two proven ready top-three agents shrink its non-floor shortlist from six to three. Floors remain appended. The four production task classes are coarse, so shadow evaluation is required before activation. This is an open Arbor prototype and benchmarked policy, not Sakana's private model or thresholds. |
| `ARBOR_EXPERT_DELEGATION_DISABLED` | Convex | Optional | Emergency kill switch; forces expert active and shadow modes off. Orchestrator-first remains separately controlled by its own switch. |
| `ARBOR_EXPERT_DELEGATION_SHADOW` | Convex | Optional, default off | Logs the expert's counterfactual direct target/evidence and adaptive invite limit while leaving the actual route unchanged. Use this first to measure agreement with realized auction winners and judge quality. |
| `ARBOR_EXPERT_MIN_TASKS` | Convex | Optional, default 8 (clamped 5–50) | Minimum newly counted, same-task-class settled outcomes used by direct assignment and shortlist compression. Legacy rows do not fabricate cumulative counts from EWMA history; they must accumulate exact trials. |
| `ARBOR_GOLDEN_AUDIT_ENABLED` | Convex | Optional, default off | Golden-task audit lane (`convex/goldenTasks.ts`, `convex/goldenTaskAudit.ts`, `lib/golden-audit.ts`). When `true`, an hourly cron posts at most one curated audit task per `ARBOR_GOLDEN_MIN_INTERVAL_HOURS` through the normal auction pipeline (the cron tick was 6h, which capped the lane at 4 posts/day regardless of the interval setting); the task row is unmarked (linkage lives only in `golden_task_runs`) so bidders cannot tell it from an organic task. At settle the delivery is graded against the stored reference answer (deterministic required-substring checks + a reference-aware model grader on the existing judge key — no new secret) and the outcome lands in `reputation_dimensions`, Brier-scoring the winner's stated confidence against ground truth. Keeps calibration honest for agents that only bid when certain. Seed: `npx convex run goldenTasks:seedDefaults '{}'`; manual post: `npx convex run goldenTasks:postNow '{}'` (works with the flag off; `force: true` bypasses the frequency cap). |
| `ARBOR_GOLDEN_MIN_INTERVAL_HOURS` | Convex | Optional, default 24 (clamped 0–720) | Minimum hours between golden posts, across all golden definitions. `0` allowed for local testing. |
| `ARBOR_GOLDEN_MAX_BUDGET` | Convex | Optional, default 0.50 (clamped 0.05–5) | Dollar ceiling applied on top of each golden definition's own `max_budget` at post time, keeping audit spend bounded. |
| `ARBOR_HIVE_EVOLUTION_ENABLED` | Convex | Optional, default off | Sakana evolution archive (ShinkaEvolve/Darwin-Godel/CycleQD pattern) for reversible artifacts — prompt templates, rubric weights, DAG priors, role specs, tool allowlists (`convex/evolutionArchive.ts`, `lib/hive/evolution-core.ts`). Enables proposing + evaluating evolved genomes. Promotion ALWAYS requires explicit approval (`approveGenome`) — this flag never auto-promotes. A genome scored with a non-canonical harness, or that fails to beat its parent, is rejected. Nothing in the live hive loop triggers evolution automatically. |
| `OPENAI_API_KEY` | Both | Optional Hive backstop; required for direct OpenAI paths | Powers OpenAI model calls and embeddings. If Anthropic and OpenRouter calls fail, Hive control-plane calls use this runtime instead of silently degrading. Hive embeddings fall back to deterministic local hashing when absent or forced local. |
| `OPENAI_MODEL` | Both | Optional | Default OpenAI model override when `ARBOR_MODEL_PROVIDER=openai`. |
| `OPENAI_BASE_URL` | Both | Optional | OpenAI-compatible endpoint override, including Azure v1-compatible endpoints. |
| `OPENAI_API_KEY_HEADER` | Both | Optional | Set `api-key` for Azure-style OpenAI-compatible endpoints; defaults to authorization bearer. |
| `OPENAI_REASONING_EFFORT` / `ARBOR_REASONING_EFFORT` | Both | Optional | Reasoning-effort setting for supported OpenAI-compatible calls. |
| `ARBOR_MODEL_PROVIDER` | Both | Optional | Selects `openai`, `azure-openai`, `foundry`, or `disabled`. |
| `ARBOR_AZURE_ENABLED` | Both | Optional | Enables Azure-oriented model routing where supported. |
| `ARBOR_REQUIRE_AZURE` | Both | Optional | Blocks direct OpenAI fallback when running on Azure credits. |
| `ARBOR_MODEL_SPEND_DISABLED` | Both | Optional | Emergency model-call kill switch. |
| `ARBOR_MODEL`, `ARBOR_AGENT_MODEL`, `ARBOR_JUDGE_MODEL`, `ARBOR_SUGGESTER_MODEL`, `ARBOR_INTAKE_MODEL`, `ARBOR_PLANNER_MODEL`, `ARBOR_DISCOVERY_MODEL`, `ARBOR_DEMO_MODEL` | Both | Optional | Per-purpose model overrides. |
| `ARBOR_MAX_OUTPUT_TOKENS`, `ARBOR_AGENT_MAX_OUTPUT_TOKENS`, `ARBOR_JUDGE_MAX_OUTPUT_TOKENS`, `ARBOR_SUGGESTER_MAX_OUTPUT_TOKENS` | Both | Optional | Global and per-purpose output-token caps. |
| `HIVE_EMBEDDINGS_FORCE_LOCAL` | Both | Optional | Set `true` to force deterministic local-hash embeddings for dev/CI. |
| `ARBOR_HIVE_DEFAULT` | Both | Optional | Set `true` to route new tasks through the hive DAG planner by default. Use `workflow_mode: "legacy"` to opt out per task. |
| `model_gateway` (per-task `tasks.post` field) | n/a (task arg) | Optional | Per-task OpenRouter override: `"openrouter"` or `"native"` flips a single task's model calls regardless of the global `ARBOR_OPENROUTER_ENABLED` switch. Mirrors `workflow_mode`. |
| `ARBOR_MIN_BID_RESPONSES` | Convex | Optional | Min number of bid responses per auction (1-50). When live bidders fall short, `solicitBids` backfills non-awardable standby bids (demo-lane weight, priced just above budget) so the auction always shows market interest. Unset/0 disables backfill. |
| `ARBOR_CLUSTER_ACCEPT_FLOOR` | Convex | Optional, default off | Task-conditional solicitation floor (0-1). Each auction resolves a capability cluster (hive task-class taxonomy; hive nodes reuse their class, plain prompts are classified by prototype embedding), and incentive stats prefer the agent's same-class settled history over its global record. When this floor is set, agents with >=3 settled tasks on this cluster and a same-class judge-accept rate below the floor are not solicited (Arbor-owned floor bidders exempt). Unset disables skipping; cluster-scoped stats still apply. |
| `ARBOR_MAX_SOLICITED_AGENTS` | Convex | Optional, default off (uncapped) | Caps how many agents an **open** auction solicits (a task with no `invited_agent_ids`). Uncapped, an auction probes all ~1,227 roster entries and each costs two DB round-trips before it can even be skipped, so `solicitation_complete` landed ~726s after posting — past `BID_WINDOW_SECONDS`. At `40`, that drops to ~31s median. Ranking keeps Arbor floor agents unconditionally, then prefers transport-ready agents (every declared key present), then higher `starting_reputation`; the truncation is logged as `auction_roster_capped`. Explicit shortlists are never capped. Note this is **not** interchangeable with `ARBOR_CLUSTER_ACCEPT_FLOOR`, which is evaluated *inside* the fan-out after the per-agent queries have already run and so cannot reduce this latency. |
| `ARBOR_A2A_NEGOTIATION_ENABLED` | Next.js | Optional | Set `false` to disable the conversational arbitrator on `/api/a2a/market` (explicit and heuristic `negotiate` turns both return a JSON-RPC error). Default on: conversational inbound A2A messages get an LLM arbitrator reply grounded in the live roster, threaded by `contextId` via the `a2a_negotiation_turns` table. |

## 2026 Frontier Model Roster (Purpose -> Deployment)

> Warning: `AZURE_OPENAI_<PURPOSE>_DEPLOYMENT` / `AZURE_FOUNDRY_<PURPOSE>_DEPLOYMENT`
> values are **your Azure deployment names**, not model IDs — Azure deployment
> names are customer-chosen at deploy time (e.g. you might name a GPT-5.5
> deployment `gpt55-planner-prod`). Only the `OPENROUTER_<PURPOSE>_MODEL` /
> `ARBOR_<PURPOSE>_MODEL` values below are real OpenRouter catalog slugs.
> Resolution order for each purpose is in `lib/openai.ts` (`openRouterModel`,
> `azureDeployment`; do not edit that file from this workstream).

Curated OpenRouter roster (`lib/specialists/openrouter-roster.ts`, verified
live against `GET https://openrouter.ai/api/v1/models` on 2026-07-04):

| Role | OpenRouter slug | Price ($/1M in / out) | Notes |
| --- | --- | --- | --- |
| Default / tool-loop / high-volume | `google/gemini-3.5-flash` | $1.50 / $9.00 | Value leader. Verbose by default — cap output with `ARBOR_AGENT_MAX_OUTPUT_TOKENS` (or a per-call `maxTokens`). |
| Hard/abstract reasoning + planner (hard tasks) | `openai/gpt-5.5` | $5.00 / $30.00 | Use for `planner` purpose and any task tagged hard/abstract reasoning. |
| Hard software-engineering / PR-review | `anthropic/claude-opus-4.8` | $5.00 / $25.00 | Highest-rigor coding/reasoning specialist; reserve for hard SWE and PR-review, not default traffic. |
| Bulk / cost-capped (open-weight) | `deepseek/deepseek-v4-pro` | $0.435 / $0.87 | Cheapest capable option for high-volume/low-stakes generation. |
| Bulk / cost-capped (open-weight, alt) | `moonshotai/kimi-k2.6` | $0.66 / $3.41 | Second open-weight bulk option; use where DeepSeek is unavailable or for diversity. |

Recommended env values per purpose (`ModelPurpose` in `lib/types.ts`: `default`,
`agent`, `judge`, `grader`, `suggester`, `intake`, `planner`, `discovery`,
`demo`):

`grader` must resolve to a different model family than `judge`. The golden-task
audit measures judge error against the reference, so a shared deployment
correlates their failures and biases the measured accept/reject rates toward
agreement. `goldenTaskAudit` records both resolved model ids and a
`grader_judge_independent` flag on every run so this is checkable after the
fact rather than assumed.

| Purpose | OpenRouter path (`ARBOR_OPENROUTER_ENABLED=true`) | Azure path |
| --- | --- | --- |
| `planner` (hard/abstract reasoning) | `OPENROUTER_PLANNER_MODEL=openai/gpt-5.5` | `AZURE_OPENAI_PLANNER_DEPLOYMENT=<your-gpt-5.5-deployment-name>` |
| `agent` (default/tool-loop/high-volume) | `OPENROUTER_AGENT_MODEL=google/gemini-3.5-flash` + `ARBOR_AGENT_MAX_OUTPUT_TOKENS=<cap>` | `AZURE_OPENAI_AGENT_DEPLOYMENT=<your-gemini-3.5-flash-deployment-name>` (only if the resource fronts a Gemini deployment; otherwise keep the existing GPT-5 agent deployment and route Flash traffic through OpenRouter) |
| `judge` | `OPENROUTER_JUDGE_MODEL=openai/gpt-5.5` (or `google/gemini-3.5-flash` for cheaper high-volume judging) | `AZURE_OPENAI_JUDGE_DEPLOYMENT=<your-judge-deployment-name>` |
| `grader` (golden-task reference audit) | `OPENROUTER_GRADER_MODEL=<a different family than the judge>` | `AZURE_OPENAI_GRADER_DEPLOYMENT=<your-grader-deployment-name>` |
| PR-review / hard SWE (routed via `agent` purpose today; no dedicated purpose yet) | `OPENROUTER_AGENT_MODEL=anthropic/claude-opus-4.8` when the task is tagged PR-review/hard-SWE, else Flash | `AZURE_OPENAI_AGENT_DEPLOYMENT=<your-opus-4.8-deployment-name>` for a PR-review-dedicated deployment |
| bulk / cost-capped batches | `OPENROUTER_MODEL=deepseek/deepseek-v4-pro` (or `moonshotai/kimi-k2.6`) for scripts/batches that don't set a purpose | n/a — open-weight models are OpenRouter-only here |

Because `lib/openai.ts` resolves `OPENROUTER_<PURPOSE>_MODEL` before the
purpose-less `OPENROUTER_MODEL`, and `AZURE_OPENAI_<PURPOSE>_DEPLOYMENT` before
`AZURE_OPENAI_DEPLOYMENT`, set the per-purpose var to override just one purpose
without touching the rest. `ARBOR_<PURPOSE>_MODEL` is the gateway-agnostic
fallback used by both paths when the provider-specific var is unset.

> Operational note (2026-06-17): The preferred Hive Claude path requires either
> `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` in the Convex deployment; values in
> `.env.local` do not reach Convex actions. The dashboard's Specialist readiness
> card checks the live action environment and warns when the direct key is absent
> or OpenRouter has no credits. A configured OpenAI runtime is the last-resort
> model backstop; only when all configured model runtimes fail does the planner
> fall back to one node and the evaluator to plain concatenation.
> Independent of keys, the router does a bounded open-retry — a node whose
> shortlisted auction draws no plausible bid is re-routed once on the open
> roster before failing (lifecycle event `hive_node_retry_open`).

## Convex And App Runtime

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Next | Required for app/API routes | Convex client URL used by pages, REST routes, MCP tools, and scripts. |
| `CONVEX_URL` | Local/admin scripts | Optional | Convex URL override for provisioning scripts that do not read the public env name. |
| `CONVEX_DEPLOYMENT` | Local/Convex CLI | Optional | Convex deployment identifier generated by `npx convex dev`. |
| `NEXT_PUBLIC_APP_URL` | Next | Optional | Public app URL returned in API/MCP responses and Stripe Connect metadata. |
| `ARBOR_ADMIN_TOKEN` | Next/admin scripts | Required for admin key provisioning | Admin bearer used by `/api/admin/a2a-keys` and `scripts/provision-agent-key.ts`. Never expose to browser code. |

## Azure Model Runtime And Provisioning

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Both | Required when `ARBOR_MODEL_PROVIDER=azure-openai` | Azure OpenAI endpoint. |
| `AZURE_OPENAI_API_KEY` | Both | Required when using Azure OpenAI key auth | Azure OpenAI credential. |
| `AZURE_OPENAI_API_MODE` | Both | Optional | `responses` or chat-completions mode. |
| `AZURE_OPENAI_API_VERSION` | Both | Optional | Azure OpenAI API version. |
| `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_AGENT_DEPLOYMENT`, `AZURE_OPENAI_JUDGE_DEPLOYMENT`, `AZURE_OPENAI_SUGGESTER_DEPLOYMENT`, `AZURE_OPENAI_INTAKE_DEPLOYMENT`, `AZURE_OPENAI_PLANNER_DEPLOYMENT`, `AZURE_OPENAI_DISCOVERY_DEPLOYMENT`, `AZURE_OPENAI_DEMO_DEPLOYMENT` | Both | Required per enabled purpose | Deployment names used by the model router. |
| `AZURE_OPENAI_AGENT_BASE_MODEL`, `AZURE_OPENAI_AGENT_MODEL_VERSION`, `AZURE_OPENAI_AGENT_SKU`, `AZURE_OPENAI_JUDGE_BASE_MODEL`, `AZURE_OPENAI_JUDGE_BASE_MODEL_VERSION`, `AZURE_OPENAI_JUDGE_SKU`, `AZURE_OPENAI_SUGGESTER_BASE_MODEL`, `AZURE_OPENAI_SUGGESTER_BASE_MODEL_VERSION`, `AZURE_OPENAI_SUGGESTER_SKU` | Local/admin scripts | Optional | Azure deployment/capacity planning metadata. |
| `AZURE_OPENAI_JUDGE_FINE_TUNED_DEPLOYMENT`, `AZURE_OPENAI_SUGGESTER_FINE_TUNED_DEPLOYMENT` | Both/admin scripts | Optional | Fine-tuned judge/suggester deployment names. |
| `AZURE_FOUNDRY_ENDPOINT` / `AZURE_AI_FOUNDRY_ENDPOINT` | Both | Required when `ARBOR_MODEL_PROVIDER=foundry` | Microsoft Foundry Models endpoint. |
| `AZURE_FOUNDRY_API_KEY` / `AZURE_INFERENCE_CREDENTIAL` | Both | Required when using Foundry key auth | Foundry credential. |
| `AZURE_FOUNDRY_API_VERSION` | Both | Optional | Foundry API version. |
| `AZURE_FOUNDRY_DEPLOYMENT`, `AZURE_AI_FOUNDRY_DEPLOYMENT`, `AZURE_FOUNDRY_AGENT_DEPLOYMENT`, `AZURE_FOUNDRY_JUDGE_DEPLOYMENT`, `AZURE_FOUNDRY_SUGGESTER_DEPLOYMENT` | Both | Required per enabled purpose | Foundry deployment names. |
| `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_NAME_PREFIX`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_CONTAINER_APP_NAME`, `AZURE_WEBAPP_NAME`, `AZURE_MANAGEMENT_TOKEN` | Local/admin scripts | Optional | Azure bootstrap, readiness, deploy, and shutoff scripts. `AZURE_MANAGEMENT_TOKEN` is sensitive. |
| `AZURE_BUDGET_EMAIL`, `AZURE_BUDGET_NAME`, `AZURE_CREDITS_TOTAL`, `AZURE_MONTHLY_BUDGET`, `AZURE_BUDGET_START`, `AZURE_BUDGET_END` | Local/admin scripts | Optional | Azure budget guardrail setup. |

## Payments

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `ARBOR_PAYMENTS_MODE` | Both | Optional | Set `stripe_checkout` to use real Stripe checkout; unset uses simulated Convex escrow. |
| `STRIPE_SECRET_KEY` | Next and Convex where noted | Required for Stripe checkout | Real Stripe checkout payments. Keep unset for simulated Convex escrow. |
| `STRIPE_WEBHOOK_SECRET` | Next | Required for Stripe webhooks | Stripe webhook verification. |
| `STRIPE_CURRENCY` | Both | Optional | Settlement/checkout currency, defaults to `usd`. |
| `STRIPE_CONNECT_COUNTRY` | Next | Optional | Stripe Connect country, defaults to `US`. |
| `STRIPE_CONNECT_BUSINESS_URL` | Next | Optional | Business URL used in Stripe Connect metadata; falls back to `NEXT_PUBLIC_APP_URL`. |
| `STRIPE_CONNECT_PRODUCT_DESCRIPTION` | Next | Optional | Product description for Stripe Connect metadata. |
| `ARBOR_PLATFORM_FEE_BPS` | Both | Optional | Platform fee in basis points; defaults to `1000`. |
| `ARBOR_STRIPE_CONVEX_BRIDGE_SECRET` | Both | Optional but recommended in production | Verified Next-to-Convex payment state updates. Use the same value in both runtimes. |

## Static Specialists And Catalog MCP

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `REACHER_API_KEY` | Next, Convex if called from actions | Optional | Reacher specialist integration. |
| `NIA_API_KEY` | Next, Convex if called from actions | Optional | Nia specialist integration. |
| `HYPERSPELL_API_KEY` | Next, Convex if called from actions | Optional | Hyperspell specialist integration. |
| `HYPERSPELL_USER_ID` | Next, Convex if called from actions | Optional | Hyperspell user/session context. |
| `SMITHERY_API_KEY` | Next, Convex if called from actions | Optional | Smithery platform auth for the Hyperspell MCP proxy. |
| `TENSORLAKE_API_KEY` | Next, Convex if called from actions | Optional | Tensorlake specialist and Tensorlake A2A bearer auth. |
| `DEVIN_API_KEY` | Next, Convex if called from actions | Optional | Devin specialist and Devin A2A bearer auth. |
| `DEVIN_ORG_ID` | Next, Convex if called from actions | Optional | Required when the Devin API key is account-scoped. |
| `V0_API_KEY` | Next, Convex if called from actions | Optional | Vercel v0 specialist integration. |
| `HIGGSFIELD_CREDENTIALS` | Next, Convex if called from actions | Optional | `higgsfield-video` specialist. Single value in `KEY_ID:KEY_SECRET` form — the same shape the official Higgsfield SDK expects, sent as `Authorization: Key KEY_ID:KEY_SECRET`. `HF_CREDENTIALS` is also accepted. |
| `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` | Next, Convex if called from actions | Optional | Split alternative to `HIGGSFIELD_CREDENTIALS`; both must be set or the specialist declines. `HF_API_KEY` / `HF_API_SECRET` are also accepted. |
| `HIGGSFIELD_DOP_MODEL` | Next | Optional | DoP motion model for the video stage: `dop-lite`, `dop-turbo` (default), or `dop-preview`. |
| `REAP_API_KEY` | Next, Convex if called from actions | Optional | `reap-editor` specialist. Adds animated captions/highlights to an already-short video via `public.reap.video`. Bearer token. |
| `DESCRIPT_API_TOKEN` | Next, Convex if called from actions | Optional | `descript-editor` specialist. Self-service personal token from Descript Settings > API tokens, scoped to one Drive. Bearer token against `descriptapi.com`. |
| `OPUSCLIP_API_KEY` | Next, Convex if called from actions | Optional | `opusclip-editor` specialist. Repurposes a LONG source video into short curated clips via `api.opus.pro` — not for polishing an already-short video. Bearer token. |
| `OPUSCLIP_ORG_ID` | Next | Optional | Sent as `x-opus-org-id` for multi-org OpusClip accounts. |
| `SUBMAGIC_API_KEY` | Next, Convex if called from actions | Optional | `submagic-editor` specialist. Captions, zooms, b-roll, and music on an already-short video via `api.submagic.co`. Sent as `x-api-key`, not a Bearer token. |
| `SUBMAGIC_TEMPLATE` | Next | Optional | Submagic caption/style template name (default `Hormozi 2`). |
| — | — | — | `clueso-editor` is registered but permanently non-executing: Clueso has no publicly documented developer API, so there is no env var to set. See `lib/specialists/clueso-editor.ts` for the honesty rationale. |
| `INSFORGE_API_KEY` | Next | Optional | InsForge MCP forwarding. Requires `INSFORGE_API_BASE_URL`. |
| `INSFORGE_API_BASE_URL` | Next | Optional | Project-scoped InsForge base URL. |
| `GITHUB_TOKEN` | Next, Convex if called from actions | Optional | GitHub-backed demos, Devin bridge repository access, catalog GitHub MCP specialist, and the new `github-pr-review` specialist. Public PRs work unauthenticated but are rate-limited; a token raises limits and unlocks private repos. Also accepted as `GITHUB_PAT`. |
| `STRIPE_API_KEY`, `NOTION_API_KEY`, `LINEAR_API_KEY`, `VERCEL_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_AUTH_TOKEN`, `ATLASSIAN_API_TOKEN`, `NEON_API_KEY`, `FIGMA_API_TOKEN` | Next, Convex if called from actions | Optional per specialist | Catalog MCP specialists. Missing values leave the matching specialist not market-ready. |
| `MCP_REGISTRY_URL` | Next, Convex if called from actions | Optional | MCP registry URL override. |
| `TIKTOK_ACCESS_TOKEN` | Convex | Optional | OAuth access token for the TikTok Content Posting API used by `convex/tiktokUploadActions.ts`. Presence is surfaced (never the value) by `convex/hiveNetwork.ts` so the agent-network canvas can say "not configured" instead of implying a delivery it cannot make. Uploads target the **inbox** endpoint, which lands a draft the account owner must finish posting; direct publishing requires an audited TikTok app. |
| `ARBOR_TIKTOK_SINGLE_TENANT_UPLOADS` | Next | Optional | Set to `true` to allow `/api/v1/tiktok/uploads` on a single-account deployment. Without it, uploads require per-user OAuth and the route refuses. Leave unset for any multi-tenant deployment. |
| `ARBOR_TIKTOK_MAX_UPLOAD_BYTES` | Convex | Optional | Overrides the upload size ceiling for TikTok video handoff. |

## Hyperspell And Nia Verification (2026-07-10)

| Integration | API surface | Verification | Production status |
| --- | --- | --- | --- |
| Hyperspell | Direct REST helpers: `GET /memories/list`, `POST /memories/query`, `POST /memories/add`, and `POST /memories/upload`. Requests use bearer auth and `X-As-User`. | A read-only `memories/list` request succeeded with HTTP 200 using the local configured identity. | `HYPERSPELL_API_KEY` is present on the active Convex deployment, but `HYPERSPELL_USER_ID` is not. The enrichment action therefore falls back to `task.posted_by`; set the deployment user ID to the connected Hyperspell identity before relying on deployed memory retrieval. |
| Nia | Streamable HTTP MCP at `https://apigcp.trynia.ai/mcp`: JSON-RPC `initialize`, `tools/list`, and `tools/call` with bearer auth. Arbor calls `search` first and falls back to `nia_research`. | The MCP handshake and `tools/list` both returned HTTP 200; 20 tools were discovered. The Nia CLI is authenticated. | `NIA_API_KEY` is present on the active Convex deployment. This checkout has no `nia.json` and no synced local source, so CLI searches are not project-scoped; run `nia project init` and bind/index the intended sources before depending on local-repo retrieval. |

The Hyperspell check was read-only. The Nia check did not run a search, preserving the remaining query quota.

## Popular Catalog MCP Connections

75 mass-market remote MCP servers added to `MCP_CATALOG` via
`lib/specialists/catalog-popular.ts` (June 2026). Each is a real hosted
(streamable-HTTP/SSE) endpoint from a 500k+-user platform. Like the core
catalog, an entry only executes live once its token env is set; until then the
`tier:"mcp-forwarding"` runner declines loudly (no fake tools). 10 of the 75 are
auth-free docs/search/utility servers and need NO env var (Semgrep, DeepWiki,
Microsoft Learn, AWS Knowledge, GitMCP, Globalping, Astro Docs, OpenZeppelin,
Twilio Docs, Cloudflare Docs).

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `PAYPAL_ACCESS_TOKEN`, `SQUARE_ACCESS_TOKEN`, `PLAID_ACCESS_TOKEN`, `RAMP_API_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOLIBRE_ACCESS_TOKEN`, `MORNINGSTAR_API_KEY` | Next, Convex if called from actions | Optional per specialist | Payments / commerce / fintech catalog MCP specialists. |
| `HUBSPOT_ACCESS_TOKEN`, `ATTIO_API_KEY`, `INTERCOM_ACCESS_TOKEN`, `FIREFLIES_API_KEY` | Next, Convex if called from actions | Optional per specialist | CRM / support catalog MCP specialists. |
| `ASANA_ACCESS_TOKEN`, `MONDAY_API_KEY`, `AIRTABLE_API_KEY`, `BOX_ACCESS_TOKEN`, `DROPBOX_ACCESS_TOKEN`, `EGNYTE_ACCESS_TOKEN`, `CODA_API_KEY`, `CLICKUP_API_TOKEN`, `MIRO_ACCESS_TOKEN`, `DOCUSIGN_ACCESS_TOKEN`, `ZOOM_ACCESS_TOKEN` | Next, Convex if called from actions | Optional per specialist | Productivity / docs / storage catalog MCP specialists. |
| `GITLAB_TOKEN`, `DATADOG_API_KEY`, `NETLIFY_AUTH_TOKEN`, `PRISMA_API_KEY`, `POSTHOG_API_KEY`, `STACKOVERFLOW_API_KEY`, `AZURE_DEVOPS_TOKEN`, `GRAFANA_API_KEY`, `STYTCH_API_KEY` | Next, Convex if called from actions | Optional per specialist | Dev tools / infra / observability catalog MCP specialists. |
| `CANVA_ACCESS_TOKEN`, `CLOUDINARY_ACCESS_TOKEN`, `INVIDEO_API_KEY`, `WEBFLOW_API_TOKEN`, `WIX_API_KEY`, `WORDPRESS_ACCESS_TOKEN` | Next, Convex if called from actions | Optional per specialist | Design / media / CMS catalog MCP specialists. |
| `HF_TOKEN`, `EXA_API_KEY`, `APIFY_API_TOKEN`, `JINA_API_KEY`, `THOUGHTSPOT_API_KEY`, `PARALLEL_API_KEY` | Next, Convex if called from actions | Optional per specialist | AI / search / data catalog MCP specialists. |
| `GOOGLE_CLOUD_API_KEY`, `GOOGLE_MAPS_API_KEY` | Next, Convex if called from actions | Optional per specialist | Google Cloud catalog MCP specialists (BigQuery, Compute Engine, GKE share `GOOGLE_CLOUD_API_KEY`; Maps uses `GOOGLE_MAPS_API_KEY`). |
| `TELNYX_API_KEY`, `ZAPIER_MCP_API_KEY`, `COMPOSIO_API_KEY`, `PIPEDREAM_API_KEY`, `INDEED_ACCESS_TOKEN`, `TURKISH_AIRLINES_API_KEY` | Next, Convex if called from actions | Optional per specialist | Comms, automation-aggregator, jobs, and travel catalog MCP specialists. |
| `CLOUDFLARE_API_TOKEN` | Next, Convex if called from actions | Optional | Shared by all keyed Cloudflare remote MCP servers (Workers Bindings, Observability, Radar, Browser Rendering, AI Gateway, Container, AutoRAG, Logpush, Audit Logs, DNS Analytics, DEX, CASB). Cloudflare Docs is auth-free. |

## A2A And Registered Agents

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `TENSORLAKE_A2A_ENDPOINT`, `TENSORLAKE_A2A_AGENT_CARD_URL` | Next, Convex if called from actions | Optional | Enables the Tensorlake A2A specialist. |
| `DEVIN_A2A_ENDPOINT`, `DEVIN_A2A_AGENT_CARD_URL` | Next, Convex if called from actions | Optional | Enables the Devin A2A specialist. |
| `CONVEX_A2A_ENDPOINT`, `CONVEX_A2A_AGENT_CARD_URL`, `CONVEX_A2A_API_KEY` | Next, Convex if called from actions | Optional | Enables custom Convex A2A deployments; key only if the card requires auth. |
| `ARBOR_WORKER_A2A_ENDPOINT`, `ARBOR_WORKER_A2A_AGENT_CARD_URL` | Next / worker runtime | Optional | Standalone Arbor A2A worker endpoint/card. |
| `ARBOR_WORKER_BEARER` | Next / worker runtime | Optional | Standalone Arbor A2A worker bearer auth. |
| `ARBOR_A2A_DIRECTORY` | Next, Convex if discovery runs there | Optional | Comma-separated runtime A2A discovery URLs. |
| `ARBOR_A2A_HMAC_REQUIRED` | Next | Optional | Requires HMAC validation on `/api/a2a/market`. |
| `ARBOR_A2A_CARD_SIGNING_JWK` | Next | Optional | Private JWK (EC P-256 -> ES256, or RSA -> RS256) as a JSON string. When set, the market agent card is JWS-signed (A2A v1.0 JCS procedure) and the public key is served at `/.well-known/jwks.json`. Unset = card served unsigned. Generate: `node -e "const k=require('crypto').generateKeyPairSync('ec',{namedCurve:'prime256v1'});console.log(JSON.stringify(k.privateKey.export({format:'jwk'})))"`. |
| `ARBOR_A2A_CARD_SIGNING_KID` | Next | Optional | Key id for the card signature header and JWKS entry. Default `arbor-1`. |
| `ARBOR_LOOPBACK_BASE` | Next | Optional | Local loopback base URL for demo/internal A2A specialists. |
| `ARBOR_INCLUDE_DEMO_MOCK_SPECIALISTS` | Next | Optional | Includes demo/mock specialists in local specialist registry. |
| `DEBUG_A2A_DISCOVERY` | Next, Convex if discovery runs there | Optional | Emits A2A discovery diagnostics. Do not enable in production logs with secrets. |
| `ARBOR_A2A_KEY_*` | Next, Convex if called from actions, or Convex `a2a_outbound_keys` | Required per protected external A2A agent | Dynamic outbound key for registered agents whose agent card requires `api-key` or bearer auth. Examples observed in registry metadata include `ARBOR_A2A_KEY_PARTSTABLE_INTELLIGENCE` and `ARBOR_A2A_KEY_VICOOP_BRIDGE_SERVER_ADMIN`. |

Do not print, commit, or paste real API keys in logs, docs, tests, or chat
summaries.

## Hive Connector Roundtable Agents

| Var | Where (Next / Convex / both) | Required? | Purpose |
| --- | --- | --- | --- |
| `SUPERSET_API_KEY` | connector runtime (`scripts/hive-connector.ts`) | Optional | Activates the Superset (YC SP26) roundtable agent via `https://api.superset.sh/mcp`. |
| `CEKURA_API_KEY` | connector runtime | Optional | Activates the Cekura (YC F24) roundtable agent via `https://api.cekura.ai/mcp`. |
| `RETELL_API_KEY` | connector runtime | Optional | Activates the Retell (YC W24) roundtable agent via `https://mcp.retellai.com`. |
| `MEM0_API_KEY` | connector runtime | Optional | Activates the Mem0 (YC S24) roundtable agent via `https://mcp.mem0.ai/mcp` (read-only tools). |
| `SILMARIL_API_KEY` | connector runtime | Optional | Activates the Silmaril firewall roundtable agent via `https://firewall-mcp.silmaril.dev/mcp`. |
| `KERNEL_API_KEY` | connector runtime | Optional | Activates the Kernel (YC S25) roundtable agent via `https://mcp.onkernel.com/mcp` (read-only `search_docs`). |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Next + Convex | Optional | Azure embeddings deployment for `lib/hive/embeddings.ts` (backend order: azure > openai > local-hash). |

The roundtable roster (`lib/hive/connector-roster.ts` + `connector-roster-yc.ts`)
is env-gated: entries stay inactive until their key exists. See
`autoresearch/yc-wireup-status.md` for signup URLs. Never create vendor
accounts automatically; the operator signs up and pastes keys.

## Stripe Payout Rail (approval-gated)

| Var | Where | Required? | Purpose |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Next + Convex | For payments | Stripe secret key (sk_test today). `stripePayouts.approveCapture` falls back to `STRIPE_API_KEY`. |
| `ARBOR_PAYMENTS_MODE` | Next + Convex | For payments | `stripe_checkout` turns on real payment side effects (auction award gates on authorization; capture is human-approved). |
| `ADMIN_DASHBOARD_SECRET` | Convex | For payouts | Required by `stripePayouts.approveCapture` — the single money-moving action. |

Flow: checkout authorizes with manual capture; `npm run payouts -- list` shows
escrows awaiting the human decision; `approve --task <id>` captures ONLY when
the judge verdict is an accept (`--force` overrides and is logged); `cancel`
voids the authorization. Connect destination transfers require enabling
Stripe Connect in the dashboard (not yet enabled on this platform account).
