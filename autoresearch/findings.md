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
