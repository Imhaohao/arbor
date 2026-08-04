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
- E1 DONE (protocol 6766901, results 8a98d89): H1 supported, 100% of battery
  rows priced. Found+fixed prefix-match mispricing (5.4-mini 3.3-4.4x high,
  terra 2x low, silent). First real datapoint: $0.000776/settled at smoke
  scale. Roster gap found: specialist runners bypass Azure lane (nia-context
  429 on direct OpenAI) — E2 constraint. Task-class spread hint: same model
  0.98 escrow vs 0.08 unit-conversion.
- E2 DONE (protocol 1298954, results 643bd4f): all 4 predictions pass.
  BASELINES SET: $/settled 0.001026, accept 0.580 (n=112, 0 errors, $0.0667).
  Exploratory: backstop dominates baseline on both axes (75% accept @
  $0.00098/settled vs 41% @ $0.00111); task classes bimodal (9/28 at 4/4,
  6/28 at 0/4, failures concentrated in dom-*). Queued E3' dominance check
  ahead of probe-gating E3. HTML report -> to_human/.
- E3' DONE (protocol bf73c7f, results 675c182): 4/4 predictions pass, n=336.
  Route-all-to-backstop ADOPTED: +22.9pp accept, -12.2% $/settled vs 50/50
  mix (simulated on pooled real runs). Sign test 19W/5T/1L over 25 eligible
  classes. Three classes unservable by cheap lane entirely (0/12): the
  escalation targets for reshaped E3. Baseline-agent drift noted (41%->29%
  across sweep pairs) — pooled claims only.
- E3 DONE (protocol f2adccc, results bf1ed4b): 4/4 predictions pass, rule
  fired. Structure: spatial RESCUED (4/4 @ 12x frontier), governance 1/4 @
  105x (poor economics), incident 0/4 both tiers (golden-task review queued
  as E5). Grader purpose isolation verified pre-lock (agent vs default).
  Mean-accuracy inversion below pass line: pass rate, not mean acc, is the
  escalation signal. --golden-ids flag landed in battery. Spend: $0.212.
- OUTER LOOP (after 5 experiments): see findings.md reflection.
- E4 DONE (protocol d35771e, results 5fffe41): all 3 parts pass. Blended
  frontier $0.000986/settled @ 88.3% accept (26/28 coverage); honest metric
  mean $0.001692/settled run (132/132 positive, 4.25x ratio); organic e2e
  task recorded $0.000679 cost and panel now shows measured savings, with
  headroom demoted to "Budget unspent". Demonstration case: full-budget task
  where headroom showed $0.00 saved vs measured $0.0018 — headroom is wrong
  in BOTH directions. Sub-cent formatMoney bug caught in browser verify.
  Decline-with-refund finalized for governance+incident.
- E5 DONE (protocol 8564f95, results b5d35d0): rubric fired (a) — the
  incident-recovery reference enforced its own step ordering against valid
  alternatives; no substrings anchored it. Fix (equivalence language,
  criteria unchanged) flips the class: terra 0/4 -> 3/3, mini 0/10 -> 1/4.
  E3's unservable verdict for this class was an instrument error, not a
  capability fact. Governance verdict now suspect -> E5b. Coverage 27/28
  pending. THE research finding so far: reference error manufactured a
  false market conclusion; audits need reference-error reporting.
- E5b DONE (protocol 5f01294, results 639d537): TWO instrument defects.
  (1) rubric (a) again on the reference; (2) NEW: MAX_OUTPUT_CHARS=4000
  truncated deliveries BEFORE grading — grader failed verbose (terra-style)
  answers for content the model wrote. Both fixed (cap -> 6000 aligned to
  audit window; equivalence language). Governance 0/12 -> 8/8; MINI alone
  4/4 @ ~$0.0025 (2.7x frontier, not 105x). Decline bucket EMPTY. Substring
  audit: 7/28 anchor-free = the dom-* set. E5c queued.
