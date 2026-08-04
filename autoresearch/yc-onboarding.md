# YC last-12-batches AI-agent sweep and hive onboarding

Sweep: workflow `wf_5ccbea2a-cd0`, 13 agents over the 12 batches S26 back to
W23. 101 AI-agent companies identified; every batch placed at least one
company in the ranked top 20. Full raw data: workflow output file referenced
in `research-state.yaml`.

## Onboarded now (active in the connector roster)

| Agent | YC batch | Surface | Auth |
|---|---|---|---|
| nia-context (Nia / Nozomio) | S24 | hosted MCP, 20 tools | NIA_API_KEY (held) |
| airweave-context (Airweave) | X25 | docs MCP `searchDocs` | none |
| vellum-workflows (Vellum) | W23 | docs MCP `searchDocs` | none |

Plus non-YC external agents: Devin (Cognition sessions API), v0 (Vercel
Platform API), DeepWiki (Cognition MCP), Context7 (Upstash MCP).

Caveat, honestly labeled: the Airweave and Vellum surfaces reachable without
auth are their DOCS search servers — real MCP tool calls against their own
infrastructure, but docs-scoped. Their full product APIs are account-gated.

## Key-required tier (user action: create account / issue key, paste into
admin A2A key vault, then add a roster entry)

- Superset (SP26) — best protocol fit: public A2A agent card at
  `https://superset.sh/.well-known/agent-card.json` + MCP + OpenAPI; MCP 401
  without bearer.
- Context.dev (S26) — scrape/crawl/extract API + MCP; key required.
- Browser Use (W25) — cloud API v4 + MCP; self-serve key.
- Mem0 (S24), Retell (W24), Cekura (F24), Golpo (S25), Coval (S24),
  Langfuse (S23, self-hostable), Helicone (W23, self-hostable), Kernel (S25),
  Blaxel (X25), Dedalus (S25), Cua (X25), Salus (W26), Bolna (F25).
- Hyperspell (F25) — HYPERSPELL_API_KEY already held; API is a memory layer,
  connector backend not yet written (candidate next slice).
- LiteLLM (W23) — self-hosted MCP+A2A gateway; no vendor account exists at
  all, but its LLM passthrough needs provider credit we do not have.

Account creation was NOT performed for any of these (operator-level policy:
no new external accounts). Superset is the highest-value follow-up: it is the
only company in 12 batches publishing a live A2A agent card.

## Azure hosting note (user action)

The connector currently runs locally (`npm run hive:connector`). To host it
on Azure credits: install Azure CLI (`brew install azure-cli`), `az login`,
then a container-apps deploy of a Node runner executing
`scripts/hive-connector.ts discuss` on a schedule, with `NEXT_PUBLIC_CONVEX_URL`
and the agent HMAC secrets as Container Apps secrets. No Azure credentials
exist on this machine, so this step was documented rather than executed.
