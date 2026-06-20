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
| `INSFORGE_API_KEY` | Next | Optional | InsForge MCP forwarding. Requires `INSFORGE_API_BASE_URL`. |
| `INSFORGE_API_BASE_URL` | Next | Optional | Project-scoped InsForge base URL. |
| `GITHUB_TOKEN` | Next, Convex if called from actions | Optional | GitHub-backed demos, Devin bridge repository access, catalog GitHub MCP specialist, and the new `github-pr-review` specialist. Public PRs work unauthenticated but are rate-limited; a token raises limits and unlocks private repos. Also accepted as `GITHUB_PAT`. |
| `STRIPE_API_KEY`, `NOTION_API_KEY`, `LINEAR_API_KEY`, `VERCEL_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_AUTH_TOKEN`, `ATLASSIAN_API_TOKEN`, `NEON_API_KEY`, `FIGMA_API_TOKEN` | Next, Convex if called from actions | Optional per specialist | Catalog MCP specialists. Missing values leave the matching specialist not market-ready. |
| `MCP_REGISTRY_URL` | Next, Convex if called from actions | Optional | MCP registry URL override. |

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
| `ARBOR_LOOPBACK_BASE` | Next | Optional | Local loopback base URL for demo/internal A2A specialists. |
| `ARBOR_INCLUDE_DEMO_MOCK_SPECIALISTS` | Next | Optional | Includes demo/mock specialists in local specialist registry. |
| `DEBUG_A2A_DISCOVERY` | Next, Convex if discovery runs there | Optional | Emits A2A discovery diagnostics. Do not enable in production logs with secrets. |
| `ARBOR_A2A_KEY_*` | Next, Convex if called from actions, or Convex `a2a_outbound_keys` | Required per protected external A2A agent | Dynamic outbound key for registered agents whose agent card requires `api-key` or bearer auth. Examples observed in registry metadata include `ARBOR_A2A_KEY_PARTSTABLE_INTELLIGENCE` and `ARBOR_A2A_KEY_VICOOP_BRIDGE_SERVER_ADMIN`. |

Do not print, commit, or paste real API keys in logs, docs, tests, or chat
summaries.
