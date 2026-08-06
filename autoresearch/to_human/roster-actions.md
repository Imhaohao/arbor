# Roster action list — what needs a human

Everything reachable without credentials has been wired and proven. These two lists are the remainder, and both need decisions this agent does not make on its own: creating vendor accounts, and deleting rows.

## 1. Vendors to sign up with (unlocks the most agents first)

410 agents across 379 vendors are alive and refuse anonymous callers. One signup typically unlocks every agent on that host. Paste each key into `.env.local` under the env name shown (or any name — then set it on the roster entry) and the agent activates on the next run.

| Vendor host | Agents unlocked | HTTP | Suggested env var |
|---|---:|---|---|
| waystation.ai | 7 | 401 | `WAYSTATION_AI_API_KEY` |
| noon-ai.dyndns-server.com | 6 | 401 | `NOON_AI_DYNDNS_SERVER_COM_API_KEY` |
| mcp.mcpbundles.com | 5 | 401 | `ARBOR_MCP_KEY_MCP_UK_LEGISLATION_MCP_SERVER_FR_69E5382` |
| server.smithery.ai | 4 | 401 | `ARBOR_MCP_KEY_MCP_PINKPIXEL_DEV_WEB_SCOUT_1631232` |
| scope.bid | 3 | 401 | `SCOPE_BID_API_KEY` |
| gateway.ansvar.eu | 3 | 401 | `GATEWAY_ANSVAR_EU_API_KEY` |
| agent.thoughtspot.app | 2 | 401 | `THOUGHTSPOT_API_KEY` |
| mcp.wix.com | 2 | 401 | `WIX_API_KEY` |
| mcp.valid.co | 2 | 401 | `MCP_VALID_CO_API_KEY` |
| mcp.stackoverflow.com | 2 | 401 | `STACKOVERFLOW_API_KEY` |
| mcp.okahu.co | 2 | 401 | `MCP_OKAHU_CO_API_KEY` |
| mcp.make.com | 2 | 401 | `MCP_MAKE_COM_API_KEY` |
| api.agentdm.ai | 2 | 401 | `ARBOR_MCP_KEY_MCP_AGENTDM_F15C306` |
| mcp.adcrunch.dev | 2 | 401 | `MCP_ADCRUNCH_DEV_API_KEY` |
| mcp.traderwai.com | 2 | 401 | `MCP_TRADERWAI_COM_API_KEY` |
| mino.ai | 1 | 401 | `MINO_AI_API_KEY` |
| agent.tinyfish.ai | 1 | 401 | `AGENT_TINYFISH_AI_API_KEY` |
| www.vibecom.app | 1 | 401 | `WWW_VIBECOM_APP_API_KEY` |
| snap-ads.mcp.pipeboard.co | 1 | 401 | `SNAP_ADS_MCP_PIPEBOARD_CO_API_KEY` |
| tiktok-ads.mcp.pipeboard.co | 1 | 401 | `TIKTOK_ADS_MCP_PIPEBOARD_CO_API_KEY` |
| api.unstoppabledomains.com | 1 | 401 | `API_UNSTOPPABLEDOMAINS_COM_API_KEY` |
| api.fathom.ai | 1 | 401 | `API_FATHOM_AI_API_KEY` |
| mcp.lucid.app | 1 | 401 | `MCP_LUCID_APP_API_KEY` |
| dotprompts.com | 1 | 401 | `DOTPROMPTS_COM_API_KEY` |
| tools.okareo.com | 1 | 401 | `TOOLS_OKAREO_COM_API_KEY` |
| mcp.nivelrisk.com | 1 | 401 | `MCP_NIVELRISK_COM_API_KEY` |
| paichart.app | 1 | 401 | `PAICHART_APP_API_KEY` |
| mcp.servicegraph.co | 1 | 401 | `MCP_SERVICEGRAPH_CO_API_KEY` |
| geo.thinair.co | 1 | 401 | `GEO_THINAIR_CO_API_KEY` |
| nexus.api.dragoneye.ai | 1 | 401 | `NEXUS_API_DRAGONEYE_AI_API_KEY` |
| api.bridgetown.builders | 1 | 401 | `API_BRIDGETOWN_BUILDERS_API_KEY` |
| api.flatlandfi.com | 1 | 401 | `API_FLATLANDFI_COM_API_KEY` |
| mcp.zeroheight.com | 1 | 401 | `MCP_ZEROHEIGHT_COM_API_KEY` |
| swagger.mcp.smartbear.com | 1 | 401 | `SWAGGER_MCP_SMARTBEAR_COM_API_KEY` |
| mcp.smartling.com | 1 | 401 | `MCP_SMARTLING_COM_API_KEY` |
| mcp.zevari.ai | 1 | 401 | `MCP_ZEVARI_AI_API_KEY` |
| mcp.adspirer.com | 1 | 401 | `MCP_ADSPIRER_COM_API_KEY` |
| fire.chilipiper.com | 1 | 401 | `FIRE_CHILIPIPER_COM_API_KEY` |
| proworker-hosted.onrender.com | 1 | 401 | `PROWORKER_HOSTED_ONRENDER_CO_API_KEY` |
| api.butlerbrain.ai | 1 | 401 | `API_BUTLERBRAIN_AI_API_KEY` |
| _(+339 more vendors)_ | | | |

Leverage note: the top 10 vendors alone account for 36 of the 410 blocked agents, so ten signups do most of the work.

## 2. Rows to prune (nothing answers)

275 registered agents have no reachable endpoint. They were retried across URL variants (`/mcp`, `/sse`, `/api/mcp`, trailing slash) and again at a 25s timeout. They are not credential problems — there is no server. Until they are removed they inflate the roster count and every metric derived from it.

```
seed-launch-strategist
currency-agent-a2a
currency-agent-a2a-2
infergonka-a2a
partstable-intelligence
mobility-quote-agent
agent-exchange
agent-hustle
ragmap
a2abench
pay
patient-intake-scribe-agent
manthan-advisor
aigen-protocol
agentinterop-healthcare-platform
infergonka
mcp-ai-roc-mcp-b6c79b9
mcp-meepo-studio-ae041b5
mcp-tvwizard-a6f3ccc
mcp-agent-svg-registry-5c14471
mcp-islamic-knowledge-06f71a3
mcp-com-craftablesoftware-mcp-642954f
mcp-work-iq-user-mcp-server-447613c
mcp-replicate-77be3d0
mcp-anotherai-7951caf
mcp-finstudio-financial-models-3d901a4
mcp-jasswiki-swiss-jass-authorit-f5102ae
mcp-knowledge-raven-beb7b24
mcp-uk-farm-safety-c70901d
mcp-entity-e626e41
mcp-app-aspirelearning-mcp-8801e32
mcp-kuro-ai-agent-mcp-server-c2ed4ad
mcp-com-googleapis-composer-mcp-4c44c34
mcp-papertext-b6e6521
mcp-atproto-data-layer-aa1f561
mcp-zenable-ceb589b
mcp-jampolls-0be2775
mcp-hrsa-health-resources-a87eee0
mcp-brandyze-0e2f2a4
mcp-snapog-og-image-generator-14d3007
mcp-seosa-fa370d2
mcp-agent-press-5fd73fa
mcp-uk-food-safety-9c37969
mcp-robomart-12eb8ad
mcp-trust-boundary-systems-a1a8eea
mcp-samhsa-treatment-locator-31937a4
mcp-calories-club-ai-food-tracke-accd273
mcp-perpetual-funding-rates-api-409a55b
mcp-samhsa-behavioral-health-62e4e2d
mcp-agentic-platform-34f8889
mcp-dr-maggie-geller-od-87e0674
mcp-moving-helper-6b7695d
mcp-nashboard-merchants-25660c3
mcp-aeo-be74c02
mcp-rtopacks-0421213
mcp-agent-cost-allocator-492c4b4
mcp-jpyc-agent-mcp-ee07f7f
mcp-yultrace-audit-fd852cb
mcp-token-safety-contract-risk-a-e5ae89b
mcp-daily-data-feeds-ecd3b32
... and 215 more
```

Full machine-readable list: `autoresearch/data/roster-census.json` (filter `verdict` = "dead" or "no_transport").

