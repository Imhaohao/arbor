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
