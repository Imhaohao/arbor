# YC hive-connector wire-up: second sweep (2026-08-04)

Follow-up to `autoresearch/yc-onboarding.md`. Scope: verify hosted MCP
endpoints for a second list of YC-batch AI-agent companies and, where a real
endpoint + auth path exists, add an env-gated `RosterEntry` to
`lib/hive/connector-roster-yc.ts`. No accounts were created and no keys were
purchased; every entry stays inactive until the operator pastes a key into
`.env.local`.

## Added to the roster (`YC_GATED_ROSTER` in `lib/hive/connector-roster-yc.ts`)

| agent_id | Company | YC batch | MCP endpoint | Env var | Notes |
|---|---|---|---|---|---|
| `superset-tasks` | Superset | SP26 | `https://api.superset.sh/mcp` | `SUPERSET_API_KEY` | Bearer confirmed verbatim in docs. 31 real tool names confirmed (`tasks_*`, `workspaces_*`, `agents_*`, `terminals_*`, `automations_*`, `projects_list`, `hosts_list`, `organization_members_list`). Roster uses only the read-only `*_list` tools to avoid creating real tasks/workspaces as a side effect. |
| `cekura-voice-qa` | Cekura | F24 | `https://api.cekura.ai/mcp` | `CEKURA_API_KEY` | Endpoint confirmed real. Cekura's documented default MCP auth is OAuth browser sign-in; a static API-key path is mentioned for CI/headless use but its header format is not published, so this entry assumes standard `Authorization: Bearer`. Literal tool names confirmed: `scenarios_run_text`, `scenarios_run_voice`, `scenarios_run_sip`, `scenarios_run_vapi_webrtc`, `scenarios_run_retell_webrtc`. `scenarios_run_text` executes a real test scenario against an existing Cekura agent/scenario, so it needs a scenario already configured on the operator's account to return real text — otherwise it errors harmlessly and nothing gets posted. |
| `retell-voice-agents` | Retell | W24 | `https://mcp.retellai.com` | `RETELL_API_KEY` | Endpoint and `Authorization: Bearer <RETELL_API_KEY>` confirmed verbatim in docs. Literal tool names are not published (docs point integrators at `tools/list`); toolPreference lists plausible read-only names, backend falls back to the server's first tool otherwise. |
| `mem0-memory` | Mem0 | S24 | `https://mcp.mem0.ai/mcp` | `MEM0_API_KEY` | Endpoint and "use your API key as a bearer token" confirmed at `docs.mem0.ai/platform/mem0-mcp`. Literal tool names confirmed: `add_memory`, `search_memories`, `get_memories`, `get_memory`, `update_memory`, `delete_memory`, `delete_all_memories`, `delete_entities`, `list_entities`, `list_events`, `get_event_status`. Roster uses only `search_memories` / `get_memories` / `list_entities` (read-only) to avoid mutating the operator's real memory store. |
| `silmaril-firewall` | Silmaril | SP26/S26 | `https://firewall-mcp.silmaril.dev/mcp` | `SILMARIL_API_KEY` | Independently reconfirmed live: an unauthenticated POST returns 401. No public docs page enumerating tool names or the exact header form was found; toolPreference is a plausible guess (`scan_trace`, `classify_intent`, `check_context`) and the backend falls back to the server's first real tool. |
| `kernel-browser` | Kernel | S25 | `https://mcp.onkernel.com/mcp` | `KERNEL_API_KEY` | Endpoint confirmed in Kernel's own connector setup docs. Docs state the server supports "OAuth 2.1 and API key authentication" but don't publish the API-key header string, so bearerEnv assumes standard `Authorization: Bearer`. `search_docs` is a confirmed literal, read-only tool name; other confirmed literals (`computer_action`, `manage_browsers`, `execute_playwright_code`, `manage_replays`, `exec_command`) were left out of toolPreference because they mutate real browser sessions. Kernel was on the "also check" list, not the original 7 — added because verification turned up a clean hosted endpoint plus a genuinely fitting read-only tool. |

All six entries: `provenance_label` is `"real tool-backed (<Company> MCP server)"`, `requiresEnv` gates the entry off until the operator supplies the key, and `bearerEnv` matches `requiresEnv` per the base roster's convention.

## Candidates NOT added (relegated — reasons, signup URLs, env var names)

| Company | YC batch | Why no entry | Signup / docs URL | Future env var |
|---|---|---|---|---|
| Context.dev | S26 | Real hosted MCP endpoint exists (`https://mcp.context.dev/mcp`, confirmed live), but auth is OAuth 2.0 Authorization-Code-with-PKCE ONLY — docs explicitly state no bearer token or API key header is accepted in client config. There is no static key an operator could paste into `.env.local`. | `https://docs.context.dev/install-mcp` | `CONTEXT_DEV_API_KEY` (placeholder only; would need a dedicated OAuth device/PKCE flow, not a pasted key, to actually use) |
| Browser Use | W25 | No hosted MCP server exists. Only a REST Cloud API v4 (`https://api.browser-use.com/api/v4/`, `X-Browser-Use-API-Key` header) for hosted agent runs and cloud browsers. Wiring this in would need a dedicated REST backend (like Devin/v0), not the generic `mcp` backend. | `https://docs.browser-use.com` / `https://cloud.browser-use.com` | `BROWSER_USE_API_KEY` |
| Golpo | S25 | The official `golpo-mcp` server is stdio-only (`uvx golpo-mcp`, launched locally via `claude mcp add --transport stdio`), not a hosted HTTP endpoint — doesn't fit the roster's `endpoint: string` streamable-HTTP model. API access is also plan-gated ($200-999/mo). | `https://www.ycombinator.com/companies/golpo`, repo `github.com/Golpo-AI/golpo-mcp` | `GOLPO_API_KEY` |
| Coval | S24 | Docs confirm an MCP integration exists ("Expose Coval as MCP tools to Claude Code, Cursor") but no hosted HTTP endpoint URL was found in `docs.coval.dev` or the `coval-ai/mcp-server` GitHub repo via search — it may also be CLI/skill-driven rather than a fixed public JSON-RPC URL. Could not verify a real endpoint, so no entry per the sweep's own bar. | `https://docs.coval.dev` | `COVAL_API_KEY` |
| Blaxel | X25 | Real hosted management endpoint exists (`https://api.blaxel.ai/v0/mcp`, `Authorization` header + API key), but (a) it also needs an `X-Blaxel-Workspace` header for any multi-workspace account, which the current `mcp` backend has no slot for beyond a single bearer header, and (b) its confirmed surface is deploy/sandbox/agent CRUD on the operator's own account — no confirmed query/search-style tool that would produce topical roundtable text. | `https://docs.blaxel.ai/MCP-server` | `BLAXEL_API_KEY` |
| Cua | X25 | `cua-mcp-server` is a local stdio MCP process (installed via pip/npx, driving local VMs or a cloud sandbox), not a fixed public hosted HTTP endpoint — same shape mismatch as Golpo. | `https://cua.ai/docs/libraries/mcp-server` | `CUA_API_KEY` |

## Verification method

Every endpoint above was checked with `WebFetch`/`WebSearch` against the vendor's own docs (not third-party MCP directories) before being written into the roster, except Silmaril, whose endpoint was independently reconfirmed live with a direct unauthenticated fetch returning 401. No account was created and no key was requested or purchased for any candidate, per the task's constraint.

## Test / typecheck status

- `npx tsc --noEmit` — clean, both immediately after creating `lib/hive/connector-roster-yc.ts` and again after wiring it into `lib/hive/connector-roster.ts`.
- `npx tsx lib/hive/connector-core.test.ts` — `connector-core tests passed` (includes the `CONNECTOR_ROSTER.length >= 5` gating assertion, now 13 entries total: 7 base + 6 YC-gated).
