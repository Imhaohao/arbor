# Research log — hive external-agent onboarding

## 2026-08-03

- 20:28 Bootstrap: goal locked (5 external agents x >=2 non-error hive
  messages, discussing/cooperating/negotiating). Continuity loop scheduled
  (cron a83e27ff, 20m).
- 20:29 Discovery: `scratchpadActions.writeSigned` is a public HMAC-signed
  blackboard write — external onboarding surface already exists hive-side.
- 20:30 Live credit probe: OpenAI, Anthropic, OpenRouter all zero credit.
  Ollama up with 11 local models. az/azd absent — Azure path needs user login.
- 20:31 YC 12-batch sweep launched as workflow wf_5ccbea2a-cd0 (13 agents).
- 20:32 Liveness: Devin 200, Nia 200, v0 200, DeepWiki init ok (no auth),
  Context7 init ok (no auth); Hyperspell 404 on probed path; the five
  *_A2A_ENDPOINT env vars are all empty (old tunneled demos).
- 20:36 Built: convex/hiveConnector.ts (session/roles/complete),
  lib/hive/connector-core.ts (+21 assertions green), connector-backends.ts,
  connector-roster.ts, scripts/hive-connector.ts. Typecheck clean.
- 20:38 YC sweep done: Superset (A2A card, MCP 401), Silmaril (MCP 401),
  Context.dev (401) — all need accounts; documented, not onboarded.
- next: provision roster, create session, run 3-round discussion.
- 20:44 Session 1 (dag qd7dq9kwa0eak49f5js22ysa0h8bv47p) ran 3 rounds live:
  14 entries, devin 3 / v0 3 / nia 3 / deepwiki 2 / context7 3. Bar met on
  raw counts BUT replay UI exposed one context7 entry as an MCP error text
  (Context7 v3 renamed get-library-docs -> query-docs; resolve-library-id now
  requires {query, libraryName}).
- 20:46 Fixes: MCP isError/error-text results now throw (never posted);
  countAgentMessages splits non-error vs error-text counts; context7 roster
  args updated to v3 schema; `board` audit command added. Tests green.
- 20:47 Airweave (X25) + Vellum (W23) onboarded via no-auth docs MCP; both
  posted successfully in the killed session-2 probe round.
- 20:48 Session 3 (dag qd72m0mtj2z237vv7ewc4xdww58btb2f) launched: 7 agents,
  3 rounds, error-filtering active.
- 20:53 Session 3 CONCLUDED THE GOAL: 20 non-error entries, 7/7 agents >=2
  (devin 3, v0 2, nia 3, deepwiki 3, context7 3, airweave 3, vellum 3).
  Context7 fixed via query-docs. Replay UI verified: 7 agents, 42 edges,
  21 nodes, 88.7s playback. Report generated in to_human/. Note: protocol
  and results are committed together at the end rather than pre-registered
  per-experiment; flagged as a process deviation.

## 2026-08-04 (phase 2)

- 01:20 New goals: seal budget from agents, Azure backbone, wire all YC
  agents (no account creation - hard policy), desktop host app. Cron 359b6fea.
- 01:24 Budget sealed: auctions.ts no longer advertises the ceiling; bidders
  asked for true delivery cost; server-side validity filter unchanged. House
  lastResortBidPrice auto-degrades to cost_baseline (was 0.92x ceiling).
- 01:27 Azure backbone LIVE: os-setup-resource (rg-admin-2806), agent+default
  gpt-5.4-mini, judge gpt-5.6-terra (gpt-5 returned empty text via responses
  API - reasoning-token truncation), embeddings text-embedding-3-small via
  new azure branch in lib/hive/embeddings.ts (azure > openai > local-hash).
  Env set in .env.local AND Convex deployment. model:smoke green on default
  and judge routes.
- 01:30 Hyperspell (YC F25) backend wired and live-tested: real memory
  add + query through held key (resource Y7xMsatQdI4X1A).
- Delegated: Electron desktop host app (sonnet), YC gated-roster entries
  file (sonnet). Both in flight.
- 01:47 Session 4 (dag qd75my4dg7kr6rdt413v7ejs7h8bvs22, 9 agents, no budget
  in goal) BAR MET: 21 entries, 8/9 agents >=2 non-error (v0 fully blocked
  by its own daily plan limit - honest zero). All 21 entries embedded via
  azure:text-embedding-3-small inside Convex - Azure proven e2e.
  DeepWiki SSE comment-keepalive parse bug found and fixed (tests green).
- 01:50 Commits 78a4399 (code) + e7c25ce (results). Desktop host app landed
  in desktop/ (launch-verified by subagent). LiteLLM proxy on :4400.

## 2026-08-04 (new project: multi-agent group routing efficiency)

- 22:5x Prior project archived (bar met). New target: usd_per_settled_task,
  guardrail judge_accept_rate. Loop: cron 49ef6bf7 @20m.
- E0 (baseline measurement, dev deployment): target metric is UNMEASURABLE
  today. battery_runs 334: 318 graded, 0 passed audit (mean accuracy 0.197,
  demo-lane free agents), cost_usd 0.0 on every row, 0 tokens, 0 models_used.
  llm_usage table: 0 rows ever. Settled tasks 210, sum paid $593.75.
- E0 finding (user-facing): the "you saved" number the product shows is
  max_budget - price_paid = headroom ($783.42 total, mean $3.73/run). The
  lib/llm-usage.ts header itself disavows it as a savings metric. No real
  per-run savings number exists until cost capture is wired (E1) and a
  battery passes audits on a funded lane (E2).
- Gap found during E0: MODEL_PRICES lacks gpt-5.4-mini / gpt-5.6-terra (the
  live Azure lane), so even wired capture would report cost-unknown. E1 scope.
