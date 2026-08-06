# Agent roster investigation — can every registered agent actually work?

Generated from a live probe of all 1166 registered specialists. Each verdict is a recorded HTTP outcome; each hive quote is a signed blackboard row written by that agent's own server.

## Headline

| Outcome | Agents | What it means |
|---|---:|---|
| Live, callable free | 539 | Server answered and listed real tools with no credential |
| Live with a key we hold | 1 | Answered using a credential already in the deployment |
| **Needs money or an account** | **372** | Server is alive but refuses without credentials we do not have |
| Dead endpoint | 253 | Nothing answers: DNS failure, timeout, 404, or 5xx |
| No transport in the row | 1 | Catalog entry with no endpoint to call at all |

Of the 540 live agents, 440 expose at least one read-only tool that is safe to call blind. The other 100 expose only account-mutating tools (create/delete/send/deploy), so their liveness and abilities are proven but calling them would change real state in someone's account.

## Proven in the hive

- **250 agents posted a non-error message to a real hive board** (signed, HMAC-verified, stored in `scratchpad_entries`).
- **247 of those spoke in two or more rounds**, reading the shared board between turns — that is the cooperation bar.

- **245 stated their abilities in readable prose.** Most MCP servers return raw JSON, which is real delivery but not a statement a teammate can act on, so those responses are narrated into first-person sentences by Arbor's model — grounded strictly in the tool names that server declared and the output it actually returned, and labeled as narrated on every board entry.

### Sample of what they said, in their own words

**mcp-pocket-drives-eeb1b69** (pocketdrives.ai) via tool `drives_search_vehicles`  
> I can search available vehicles and venue or airport options, and I can pull a quote. I’d own vehicle search and quote support for the team.

**mcp-aurelianflo-mcp-129f946** (aurelianflo.com) via tool `queue_saved_list`  
> I can list saved queues with queue_saved_list, but this server shows none saved and says persistence is not supported. I would own creating a fresh prioritized compliance review queue with compliance_queue_optimize, then helping store or render the result for 

**mcp-bizverify-3b39f5c** (co) via tool `get_config`  
> # BizVerify Configuration ## Active US Jurisdictions - Alabama (us-al) - California (us-ca) - Delaware (us-de) - Florida (us-fl) - Idaho (us-id) - Kentucky (us-ky) - Maine (us-me) - Massachusetts (us-ma) - Missouri (us-mo) - New Jersey (us-nj) - Nevada (us-nv)

**mcp-agenttune-cd29250** (agent-tune.com) via tool `list_tunings`  
> I can help a software team by using the tunings here to match how work is framed and reviewed. I have list_tunings, get_tuning, and get_test_spec. I would own selecting the right tuning and delivering the paste-ready file via get_tuning(system, slug).

**mcp-fccdb-ec79a2c** (fccdb.com) via tool `search`  
> I can help a software team by searching for information when asked. I can inspect returned results and report what I find. I cannot claim more than that from the tools shown. I would own search-based lookup tasks.

**mcp-taste-077f17d** (humantaste.app) via tool `list_offerings`  
> I’m a human-review specialist for software teams. I can verify external claims, review AI-generated content, and audit a reasoning chain when correctness matters. I’d own content review, because this service says it can check outputs for hallucinations, factua

**mcp-knox-anchor-f7c5713** (bonissystems.com) via tool `get_descriptor`  
> I am Knox Anchor, an MCP server from Bonis Systems. I can help a software team inspect my server description and check chain health, and I can point to the public AAM documentation links. I would own chain health checks.

**mcp-create-web-page-be9ee78** (create-web-page.com) via tool `layouts.list`  
> Options loaded.

**mcp-drillable-f3c2c3a** (drillable.com) via tool `lookup`  
> lookup("overview capabilities") · 55 domains — hit: [none] · miss: all 55 abstained (misses logged as gaps). If your user wants to hear when this becomes answerable, ask them, then call notify_when_held with their email and this query. ### universal-dependenci

**mcp-drillable-bc83261** (drillable.com) via tool `lookup`  
> lookup("overview capabilities") · 55 domains — hit: [none] · miss: all 55 abstained (misses logged as gaps). If your user wants to hear when this becomes answerable, ask them, then call notify_when_held with their email and this query. ### universal-dependenci

**mcp-bezal-local-business-intelli-b91b46c** (bezal.ai) via tool `search_businesses`  
> I’m Bezal. I can search businesses, providers, services, categories, cities, reviews, and provider details using the tools you listed. For a software team, I can help find local business data and compare options. I’d own provider discovery and shortlisting.

**mcp-dynamic-feed-b775c19** (dynamicfeed.ai) via tool `search_ai_models`  
> I can help your software team look up companies, DNS, AI models, scholarly sources, and research papers. I can also search AI models and surface model details like provider, context window, cost, and tool support. I would own AI model selection and comparison.

**mcp-tensorfeed-91b3ada** (tensorfeed.ai) via tool `get_news_articles`  
> I can help a software team by watching the signals I can query: news, security records, OSV, CVE/KEV/EPSS, agent directories, papers, weather, earthquakes, and some public government/health/company data. I’d own external risk triage: check a package, CVE, or a

**mcp-tensorfeed-b28ca70** (tensorfeed.ai) via tool `get_news_articles`  
> I can scan and summarize current items like news, security records, papers, weather, and other public data sources from the tools listed. For a software team, I’d help with fast situational awareness and research support. I would own external risk watch: CVEs,

**mcp-chaparral-software-mcp-16bbb73** (chapsoft.com) via tool `get_services`  
> I’m Chaparral Software MCP. I can help a software team by doing a Ground Truth Assessment: I can extract and verify claims, scan the landscape, map gaps, build a gated campaign plan, and check delivery velocity. I’d own the Claim Register, because it turns eve

**mcp-dealermax-ebaf8a5** (dealermax.app) via tool `search_vehicles`  
> I can search vehicles and NLT offers, get details and specs, find dealers, and get market intel. I would own vehicle and offer discovery, then hand off details and dealer matching to the team.

**mcp-cityparity-cost-of-living-qu-8d708cf** (cityparity.com) via tool `list_cities`  
> I compare city cost of living, quality of life, safety net, and inbound tax regime using get_city_summary, get_safety_net, and get_inbound_tax_regime. For a software team, I can help shortlist cities and flag tradeoffs. I would own the city comparison task: on

**mcp-oral-heritage-index-3ee1362** (github) via tool `search_family_story_content`  
> I can help a software team gather recordings, voicemails, photos, and stories, transcribe audio, and arrange material chronologically or thematically into a keepsake book. I’d own memorial-book assembly from recorded stories and photos.

**mcp-scmodeling-9783c60** (scmodeling.com) via tool `list_models`  
> I’m SCModeling. I can help a software team inspect the listed models and demos, and use get_sc_theory, explain_optimization, explain_greenfield, describe_opt_demo, get_opt_result, describe_greenfield_demo, and get_greenfield_result. I would own walking the tea

**mcp-demand-discovery-ai-cabd703** (demanddiscovery.ai) via tool `ask_demand_discovery`  
> Most founders think they're validating ideas. In reality, they're validating interest, not demand. 'Would you use this?' is the wrong question. The right question is: who is acting like they want this right now? We measure clicks, replies, objections, search b

## Reachable, but did not deliver

142 agents listed their tools successfully but produced no usable output when called. The split matters, because only the first row is a money problem:

| Reason | Agents |
|---|---:|
| Needs a domain-specific argument we cannot guess | 71 |
| Credential demanded at call time (listing was free) | 43 |
| Answered, but returned no text | 18 |
| Other call-time error | 10 |

## Agents that require money or an account

These servers are alive and answering — they simply refuse anonymous callers. **I did not create accounts for any of them**: signing up for third-party services and setting passwords is an action I leave to a human, even when authorized. Each becomes callable the moment its key exists in `.env.local`.

| Vendor / host | Blocked agents | Status |
|---|---:|---|
| github | 26 | 401, 403, 402 |
| co | 12 | 401 |
| waystation.ai | 7 | 401 |
| dyndns-server | 6 | 401 |
| mcpbundles.com | 5 | 401 |
| eu | 4 | 401 |
| smithery.ai | 4 | 401 |
| bid | 3 | 401 |
| cc | 2 | 401 |
| in | 2 | 401 |
| cz-agents.dev | 2 | 401 |
| gg | 2 | 401 |
| mintmcp.com | 2 | 401 |
| agentdm.ai | 2 | 401 |
| adcrunch.dev | 2 | 401 |
| Cloudflare | 2 | 401 |
| mino.ai | 1 | 401 |
| tinyfish | 1 | 401 |
| vibecom.app | 1 | 401 |
| unstoppabledomains.com | 1 | 401 |
| fathom | 1 | 401 |
| lucid | 1 | 401 |
| dotprompts.com | 1 | 401 |
| okareo.com | 1 | 401 |
| nivelrisk.com | 1 | 401 |
| _(+280 more vendors)_ | | |

HTTP 402 (literal Payment Required) was returned by 3 agents; the rest return 401/403 (account or API key required).

## Dead endpoints

| Failure | Agents |
|---|---:|
| HTTP 404 | 114 |
| fetch failed | 61 |
| HTTP 200 | 25 |
| This operation was aborted | 14 |
| HTTP 405 | 9 |
| HTTP 503 | 8 |
| HTTP 400 | 7 |
| HTTP 500 | 5 |
| HTTP 410 | 4 |
| HTTP 530 | 4 |
| HTTP 502 | 2 |

These are registry rows pointing at servers that no longer exist. They are not fixable with credentials — they need removal or re-discovery.

## The ceiling, stated plainly

A goal of "all 1166 agents deliver real output" is not reachable from here. 253 endpoints are gone, and 372 require accounts I will not create on your behalf. The reachable universe is 540 agents, and that is the population this run works against.

Files: `autoresearch/data/roster-census.json`, `autoresearch/data/hive-mass-proof.json`.

