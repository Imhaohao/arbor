# Roster action list — what needs a human

Everything reachable without credentials has been wired and proven. These three lists are the remainder, and each needs a decision this agent does not make on its own: creating vendor accounts, approving calls that change real account state, and deleting rows.

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

Leverage note: there is NO shortcut here — the 410 blocked agents are spread across 379 distinct vendors, and the top 10 unlock only 36 between them. Most are single-agent long-tail servers where the signup cost likely exceeds the value; pick deliberately rather than working down the list.

## 2. Agents awaiting your go-ahead (one decision from delivering)

57 agents are alive and published their tool list — they responded and stated their abilities — but every tool they expose changes real state in an account (create, send, deploy, charge). Nothing was invoked on them, deliberately. Review the tools below and tell me which agents are safe to call, or approve specific tool names.

| Agent | Vendor | Tools it exposes |
|---|---|---|
| postalform | postalform.com | Connect an agent to PostalForm MCP, Plan a reviewable physic |
| proofof-ai-meok-compliance-attestation-ag | proofof.ai | ProofOf.ai |
| aurelius-agent | rpc.aureliusagent.dev | Strategic Planning, Implementation Coordination, Build, Smok |
| iwant-marketplace | iwant.fyi | iwant.fyi demand-side protocol v1.0, Browse Wants, Post a Wa |
| hivebank | hivebank.onrender.com | USDC Vault, Streaming Payments, Budget Management, Performan |
| hiveclear | hiveclear.onrender.com | Settlement, Validator Network |
| algovoi-payment-agent | api.algovoi.co.uk | Verify On-Chain Payment, Create Hosted Checkout, Check Payme |
| hivelaw | hivelaw.onrender.com | Compliance Certification, Hallucination Audit, Dispute Resol |
| nefesh-human-state-agent | mcp.nefesh.ai | Get Human State, Ingest Biometric Signals, Get Trigger Memor |
| acc-airspace | acc-web3.onrender.com | Cross-platform Review Collaboration, Merchant-Consumer Match |
| agent-approval-gateway-base-sepolia-testn | claim-verification-agent-sepolia.muhammandahmad158609.worker | Agent Approval |
| clix-agent | api.clix.so | Send Push Notification, Trigger Campaign, Create or Update U |
| agent-approval-gateway | claim-verification-agent-mvp.muhammandahmad158609.workers.de | Agent Approval |
| neva | neva.dt-agent.co.uk | Build Together |
| tooloracle | tooloracle.io | NOMOS Cross-Border Preflight, OracleNet Intent Router, Multi |
| prea | prea-backend-f064af73127b.herokuapp.com | Strategic Operational Consultation, Discover PREA, Barter Pr |
| andru-operational-empathy-for-b2b | hs-andru-test.onrender.com | Buyer Understanding & ICP Intelligence, Tech-to-Value Transl |
| strata | strata-dig.vercel.app | Dig for fragments, Interpret fragments, Connect fragments, C |
| air-express-hvac-agent-manifest-entry-poi | airexpressutah.com | Air Express HVAC agent manifest entry point |
| assaf-buskila | www.assafweb.com | Assaf Buskila, פתרונות AI לעסקים |
| nate-the-grait | nate-agent-699.vercel.app | Code Generation, Web Design, Security Audit, System Design,  |
| dc-hub-intelligence | dchub.cloud | DC Hub MCP Server |
| blue-venture-studios-profile | blueventurestudios.com | Retrieve canonical profile |
| sentimentalpha-ai-social-arbitrage-oracle | sentimentalpha.ai | SentimentAlpha.ai — Social Arbitrage Oracle Suite |
| thinkneo-control-plane-agent | agent.thinkneo.ai | Customer Support, Meeting Scheduling, Quotes & Proposals, Te |
| agentmother | 43.160.236.79 | Cloud Deployment, Order Fulfillment, Refund Processing |
| agentcrush | agentcrush.xyz | Find payable counterparty agents, Trust evaluation, Ghost In |
| featherless | featherless-orchestrator.inf3ctious007.workers.dev | Featherless visit closure |
| insideout | insideout.luthersystems.com | Cloud architecture design, Terraform generation, and deploym |
| ask-jody | jodybrewster.dev | Discuss Jody's writing, Discuss Jody's practice and collabor |
| pico | pico-a2a.amdal-dev.workers.dev | Smart Contract Security Audit, Answer Engine Optimization (A |
| streaming-test-agent | streaming-test-agent-4v3icjzqxq-uc.a.run.app | comprehensive_response_generator |
| vicoop-bridge-server-admin | vicoop-bridge-server.fly.dev | Client Management |
| ydb-qdrant | ydb-qdrant.tech | YDB-Qdrant REST API, YDB Qdrant Code Indexer MCP |
| slickrock-dev | www.slickrock.dev | SaaS TCO Calculation, Agentic Integration Assessment, Indust |
| graham-paasch-s-site-agent | www.grahampaasch.com | Site Chat, Graffiti Tag |
| mcp-artidrop-d14bd91 | artidrop.ai | publish, publish_site, get, versions |
| mcp-broker-safety-352d18e | mcp.brokerchooser.com | is-broker-scam-tool |
| mcp-prince-pdf-converter-a78db50 | prince.cloud | url_to_pdf, markdown_to_pdf, html_to_pdf |
| mcp-boolsai-scan-e82ecc8 | boolsai.ai | boolsai_scan, boolsai_scan_paths |
| mcp-cool-property-search-server-54f19a1 | sub1.find-me.casa | send_email |
| mcp-linkedin-mcp-server-a106ba0 | linkedin.run.mcp.com.ai | createSharePost, getSharePosts, getPersonProfile |
| mcp-occam-ed2e5fc | occam.fit | feature_request, sindy_run, pysr_run, pysr_uncertainty |
| mcp-coachsync-4a2f005 | mcp.coachsync.io | warmup_calculator, plate_loader, novice_lp_generator |
| mcp-pdf-kit-0320fc8 | mcp.hellobasestation.com | basestation.create_autofill_job |
| mcp-mcp-registry-server-b013389 | registry.run.mcp.com.ai | getV01Servers, getV01ServersServerNameVersions, getV01Server |
| mcp-hapi-strava-mcp-server-72774e1 | strava.run.mcp.com.ai | getStats, getLoggedInAthlete, getLoggedInAthleteStarredSegme |
| mcp-ivisa-mcp-server-379bd16 | www.ivisa.com | visa_availability |
| mcp-tracepass-8fe0e6d | ai.tracepass.eu | tracepass_products, tracepass_passports, tracepass_passport_ |
| mcp-adis-22d668c | adis.cz-agents.dev | check_dph_payer, check_bulk_dph_payer, list_unreliable_payer |
| _(+7 more)_ | | |

## 3. Rows to prune (nothing answers)

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

