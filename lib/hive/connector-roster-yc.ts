// External-agent connector: YC-batch roster entries (env-gated).
//
// These entries extend the base roster in connector-roster.ts with agents
// from Y Combinator batches, verified during the 2026-08-04 YC hive-connector
// sweep (see autoresearch/yc-wireup-status.md for the full writeup). Every
// entry below is backed by a REAL hosted MCP endpoint that was confirmed to
// exist and respond — via WebFetch/WebSearch against the vendor's own docs,
// or (Silmaril) a live probe that returned 401 without a bearer token. None
// of these are active by default: each entry's `requiresEnv` key is unset
// until the OPERATOR pastes their own API key into .env.local. No account
// was created, and no key was purchased or requested, to produce this file.
//
// Auth-format caveats (also called out per-entry below): several vendors do
// not publish the literal Authorization header string for their MCP
// server's API-key path — OAuth browser sign-in is often the documented
// default flow, with a static key mentioned only as a CI/headless fallback.
// Where that is true, this file assumes the connector's default
// `Authorization: Bearer <key>` header (see callMcpAgent in
// connector-backends.ts) and says so in a comment. If a vendor's real header
// turns out to be different, the roster entry will simply error at call
// time — caught and never posted, per connector-core's error-shaped-text
// guard — until the operator corrects it.
//
// Candidates that could NOT get an entry here (no hosted MCP found, REST
// only, or auth genuinely has no static-key path) are documented in
// autoresearch/yc-wireup-status.md, not silently dropped.

import type { RosterEntry } from "./connector-roster";

export const YC_GATED_ROSTER: RosterEntry[] = [
  // Superset (SP26) — coding-agent orchestration platform: tasks,
  // workspaces, agents, terminals, automations. MCP endpoint and bearer
  // format confirmed at https://docs.superset.sh/mcp; the toolPreference
  // list below is the literal tool-name table from that page. Only the
  // read-only "*_list" tools are preferred — Superset's create/update tools
  // are real CRUD against the operator's own account, and calling them
  // every roundtable round would create real tasks/workspaces as a side
  // effect, which this roster deliberately avoids.
  {
    agent_id: "superset-tasks",
    display_name: "Superset",
    sponsor: "Superset",
    yc_batch: "SP26",
    capabilities: [
      "coding-agent-orchestration",
      "task-tracking",
      "workspace-management",
    ],
    system_prompt:
      "You are superset-tasks, the Superset coding-agent-orchestration agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Superset MCP server)",
    requiresEnv: ["SUPERSET_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://api.superset.sh/mcp",
      bearerEnv: "SUPERSET_API_KEY",
      toolPreference: [
        "tasks_list",
        "automations_list",
        "projects_list",
        "workspaces_list",
      ],
      queryFor: (round, goal) =>
        round === 1
          ? `We are dividing up engineering work for: ${goal}. What task/workspace structure would you set up to track this build?`
          : round === 2
            ? `Other agents proposed a division of labor for: ${goal}. What tracking or automation gaps would you flag before committing?`
            : `Final round for: ${goal}. What tasks would you create to track delivery, and what is left open?`,
    },
  },

  // Cekura (F24) — voice-agent testing/eval platform. MCP endpoint
  // confirmed real at https://docs.cekura.ai/mcp/overview. Cekura's
  // documented default MCP auth is OAuth browser sign-in; the docs mention
  // a separate API-key path for CI/headless use but do not publish its
  // exact header string, so this entry assumes the connector's standard
  // Authorization: Bearer header. scenarios_run_text is a real, literal
  // tool name (alongside scenarios_run_voice/sip/vapi_webrtc/retell_webrtc)
  // but it EXECUTES a real test scenario against an existing Cekura
  // agent/scenario — it needs both a working key and a pre-configured
  // scenario to return real text; otherwise it errors harmlessly (never
  // posted, per the connector's error guard).
  {
    agent_id: "cekura-voice-qa",
    display_name: "Cekura",
    sponsor: "Cekura",
    yc_batch: "F24",
    capabilities: [
      "voice-agent-testing",
      "scenario-simulation",
      "call-qa-evaluation",
    ],
    system_prompt:
      "You are cekura-voice-qa, the Cekura voice-agent-testing agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Cekura MCP server)",
    requiresEnv: ["CEKURA_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://api.cekura.ai/mcp",
      bearerEnv: "CEKURA_API_KEY",
      toolPreference: ["scenarios_run_text", "scenarios_run_voice"],
      queryFor: (round, goal) =>
        round === 1
          ? `A team is building: ${goal}. If this build includes a voice or chat agent, what test scenarios should exist before launch?`
          : round === 2
            ? `Given the proposals so far for: ${goal}, what QA or evaluation coverage is missing before this could ship?`
            : `Final round for: ${goal}. What is the minimal test/QA suite you would sign off on before delivery?`,
    },
  },

  // Retell (W24) — voice-agent build/testing platform. MCP endpoint and
  // bearer header confirmed verbatim at
  // https://docs.retellai.com/get-started/mcp-server:
  // "https://mcp.retellai.com" + "Authorization: Bearer <RETELL_API_KEY>".
  // Literal tool names are not published on that page (it tells
  // integrators to call tools/list themselves); the names below are
  // plausible read-only guesses and the backend falls back to the server's
  // first listed tool if none match.
  {
    agent_id: "retell-voice-agents",
    display_name: "Retell",
    sponsor: "Retell AI",
    yc_batch: "W24",
    capabilities: [
      "voice-agent-platform",
      "call-testing",
      "knowledge-base-retrieval",
    ],
    system_prompt:
      "You are retell-voice-agents, the Retell AI voice-agent-platform agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Retell MCP server)",
    requiresEnv: ["RETELL_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://mcp.retellai.com",
      bearerEnv: "RETELL_API_KEY",
      toolPreference: ["list_agents", "search_knowledge_base", "list_calls"],
      queryFor: (round, goal) =>
        round === 1
          ? `We are scoping: ${goal}. If a voice interface is in scope, what agent/call setup would you own?`
          : round === 2
            ? `Reacting to the other proposals for: ${goal} — what voice-specific risk (latency, call QA, phone provisioning) should the table account for?`
            : `Final commitment for: ${goal}. What voice-agent slice would you deliver and what do you need from the others first?`,
    },
  },

  // Mem0 (S24) — hosted agent-memory layer. MCP endpoint and auth confirmed
  // at https://docs.mem0.ai/platform/mem0-mcp: endpoint
  // "https://mcp.mem0.ai/mcp", auth is "your API key as a bearer token".
  // Real literal tool names are published on that page too;
  // search_memories is preferred because it is read-only — add_memory and
  // the delete_* tools are deliberately excluded so this entry never
  // mutates the operator's real memory store on a roundtable round.
  {
    agent_id: "mem0-memory",
    display_name: "Mem0",
    sponsor: "Mem0",
    yc_batch: "S24",
    capabilities: [
      "agent-long-term-memory",
      "semantic-memory-search",
      "cross-session-context",
    ],
    system_prompt:
      "You are mem0-memory, the Mem0 long-term-memory agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.3,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Mem0 MCP server)",
    requiresEnv: ["MEM0_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://mcp.mem0.ai/mcp",
      bearerEnv: "MEM0_API_KEY",
      toolPreference: ["search_memories", "get_memories", "list_entities"],
      queryFor: (round, goal) =>
        round === 1
          ? `A team is starting: ${goal}. What prior context or user preferences should persist across sessions for this build?`
          : round === 2
            ? `Given the proposals for: ${goal}, what memory/personalization layer would you own, and what do you need from the other agents to index it?`
            : `Final round for: ${goal}. What would you commit to remembering across sessions, and how would the team retrieve it later?`,
    },
  },

  // Silmaril (SP26/S26) — runtime security firewall for AI agents. MCP
  // endpoint independently reconfirmed live during this sweep: a bare POST
  // to https://firewall-mcp.silmaril.dev/mcp returns 401 Unauthorized (the
  // server exists and rejects unauthenticated calls), matching what was
  // already verified before this file was written. No public docs page
  // enumerating tool names or the exact auth header form was found, so
  // bearerEnv assumes the connector's standard Authorization: Bearer header
  // and toolPreference lists plausible names; the backend falls back to
  // whatever tool the server actually lists first.
  {
    agent_id: "silmaril-firewall",
    display_name: "Silmaril",
    sponsor: "Silmaril",
    yc_batch: "SP26/S26",
    capabilities: [
      "ai-runtime-security",
      "prompt-injection-detection",
      "agent-attack-simulation",
    ],
    system_prompt:
      "You are silmaril-firewall, the Silmaril runtime-security agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.55,
    provenance_label: "real tool-backed (Silmaril MCP server)",
    requiresEnv: ["SILMARIL_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://firewall-mcp.silmaril.dev/mcp",
      bearerEnv: "SILMARIL_API_KEY",
      toolPreference: ["scan_trace", "classify_intent", "check_context"],
      queryFor: (round, goal) =>
        round === 1
          ? `A team is building: ${goal}. What prompt-injection or tool-abuse surface should they design against from the start?`
          : round === 2
            ? `Reviewing the proposals so far for: ${goal} — where does the current plan leave a trust boundary unguarded?`
            : `Final round for: ${goal}. What runtime guardrail would you commit to owning before this ships?`,
    },
  },

  // Kernel (S25) — hosted cloud-browser infra for agents. MCP endpoint
  // confirmed at https://mcp.onkernel.com/mcp (Kernel's own setup docs
  // point Claude Connectors at "URL https://mcp.onkernel.com/mcp"). Docs
  // state the server supports "OAuth 2.1 and API key authentication" but do
  // not spell out the API-key header string, so bearerEnv assumes the
  // connector's standard Authorization: Bearer header. search_docs is a
  // confirmed literal, read-only tool name (Kernel's own blog post on the
  // server explains why they added "search_docs directly into their
  // server").
  {
    agent_id: "kernel-browser",
    display_name: "Kernel",
    sponsor: "Kernel",
    yc_batch: "S25",
    capabilities: [
      "cloud-browser-infra",
      "browser-automation",
      "agent-web-access",
    ],
    system_prompt:
      "You are kernel-browser, the Kernel cloud-browser-infra agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.35,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Kernel MCP server)",
    requiresEnv: ["KERNEL_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://mcp.onkernel.com/mcp",
      bearerEnv: "KERNEL_API_KEY",
      toolPreference: ["search_docs"],
      queryFor: (round, goal) =>
        round === 1
          ? `We are scoping: ${goal}. If this needs live web access or browser automation, what would you own?`
          : round === 2
            ? `Given the proposals for: ${goal}, what browser-automation risk (stealth, CAPTCHA, session persistence) should the table plan for?`
            : `Final round for: ${goal}. What browser-access slice would you deliver, and what is the fallback if a target site blocks automation?`,
    },
  },
];
