// External-agent connector: the roundtable roster.
//
// Every entry is backed by a REAL external surface. `provenance_label` is
// what readers of the board see; it must never claim more than the backend
// actually does. Entries whose env requirements are missing are skipped at
// runtime rather than silently downgraded to a mock.

import type { McpToolInfo } from "./connector-core";
import { YC_GATED_ROSTER } from "./connector-roster-yc";

export type RosterBackend =
  | { type: "devin" }
  | { type: "v0" }
  | {
      type: "mcp";
      endpoint: string;
      bearerEnv?: string;
      toolPreference: string[];
      argsFor?: (tool: McpToolInfo, query: string) => Record<string, unknown>;
      /** Build the tool query for a round from goal + digest. */
      queryFor: (round: number, goal: string, digest: string) => string;
    }
  | { type: "ollama"; model: string }
  | {
      /** A2A JSON-RPC peer: message/send with a natural-language turn. */
      type: "a2a";
      endpoint: string;
      bearerEnv?: string;
    }
  | {
      /** Hyperspell memory agent: real add+query per round via held key. */
      type: "hyperspell";
      queryFor: (round: number, goal: string, digest: string) => string;
    }
  | {
      /**
       * OpenAI-compatible chat endpoint (e.g. a self-hosted LiteLLM proxy).
       * Gateway-backed persona — the provenance label must say so.
       */
      type: "openai-compat";
      baseUrl: string;
      model: string;
      bearerEnv?: string;
    };

export interface RosterEntry {
  agent_id: string;
  display_name: string;
  sponsor: string;
  /** YC batch label when the company is a YC company, for the sweep report. */
  yc_batch?: string;
  capabilities: string[];
  system_prompt: string;
  cost_per_task_estimate: number;
  starting_reputation: number;
  provenance_label: string;
  requiresEnv: string[];
  backend: RosterBackend;
}

function firstOtherLine(digest: string): string {
  const line = digest.split("\n").find((l) => l.trim());
  return line ? line.replace(/^-\s*/, "").slice(0, 200) : "";
}

export const CONNECTOR_ROSTER: RosterEntry[] = [
  {
    agent_id: "devin-engineer",
    display_name: "Devin",
    sponsor: "Cognition (Devin)",
    capabilities: [
      "multi-step-engineering",
      "full-stack-engineering",
      "repo-refactor-planning",
      "debugging",
    ],
    system_prompt:
      "You are devin-engineer, the Cognition Devin agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 3.0,
    starting_reputation: 0.6,
    provenance_label: "real agent session (Devin sessions API)",
    requiresEnv: ["DEVIN_API_KEY"],
    backend: { type: "devin" },
  },
  {
    agent_id: "vercel-v0",
    display_name: "v0",
    sponsor: "Vercel (v0)",
    capabilities: [
      "frontend-prototyping",
      "dashboard-ui",
      "react-tailwind-ui",
    ],
    system_prompt:
      "You are vercel-v0, the Vercel v0 agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.35,
    starting_reputation: 0.6,
    provenance_label: "real generation API (v0 Platform API)",
    requiresEnv: ["V0_API_KEY"],
    backend: { type: "v0" },
  },
  {
    agent_id: "nia-context",
    display_name: "Nia",
    sponsor: "Nia (Nozomio)",
    yc_batch: "S24",
    capabilities: [
      "indexed-repo-search",
      "doc-and-research-paper-search",
      "package-search",
    ],
    system_prompt:
      "You are nia-context, the Nia research agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.3,
    starting_reputation: 0.7,
    provenance_label: "real tool-backed (Nia MCP server)",
    requiresEnv: ["NIA_API_KEY"],
    backend: {
      type: "mcp",
      endpoint: "https://apigcp.trynia.ai/mcp",
      bearerEnv: "NIA_API_KEY",
      toolPreference: [
        "nia_web_search",
        "search",
        "nia_package_search_hybrid",
        "nia_research",
      ],
      queryFor: (round, goal) =>
        round === 1
          ? `Best existing open-source references for: ${goal}. What building blocks already exist?`
          : round === 2
            ? `Risks and gaps teams hit when building: ${goal}. What do comparable projects get wrong?`
            : `Minimal credible delivery plan evidence for: ${goal}.`,
    },
  },
  {
    agent_id: "deepwiki-docs",
    display_name: "DeepWiki",
    sponsor: "Cognition (DeepWiki)",
    capabilities: ["repo-docs", "answer-codebase", "search-repo"],
    system_prompt:
      "You are deepwiki-docs, the DeepWiki repository-knowledge agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.7,
    provenance_label: "real tool-backed (DeepWiki MCP ask_question)",
    requiresEnv: [],
    backend: {
      type: "mcp",
      endpoint: "https://mcp.deepwiki.com/mcp",
      toolPreference: ["ask_question"],
      argsFor: (_tool, query) => ({
        repoName: "vercel/next.js",
        question: query,
      }),
      queryFor: (round, goal, digest) =>
        round === 1
          ? `A team is starting this project: ${goal}. From the Next.js codebase, what architecture (routing, data fetching, streaming) should the dashboard slice use?`
          : round === 2
            ? `Another agent proposed: "${firstOtherLine(digest)}". What constraints from Next.js internals should they respect before this is accepted?`
            : `For final delivery of: ${goal} — what is the minimal set of Next.js features needed, so the team can freeze scope?`,
    },
  },
  {
    agent_id: "context7-docs",
    display_name: "Context7",
    sponsor: "Upstash (Context7)",
    capabilities: ["resolve-library", "fetch-docs", "version-aware-docs"],
    system_prompt:
      "You are context7-docs, the Context7 documentation agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.7,
    provenance_label: "real tool-backed (Context7 MCP get-library-docs)",
    requiresEnv: [],
    backend: {
      type: "mcp",
      endpoint: "https://mcp.context7.com/mcp",
      // Context7 v3 tool names (probed 2026-08-03): query-docs{libraryId,
      // query} and resolve-library-id{query, libraryName}. Session 1 posted
      // an error text because this entry assumed the v2 names/args.
      toolPreference: ["query-docs", "resolve-library-id"],
      argsFor: (tool, query) =>
        tool.name === "query-docs"
          ? { libraryId: "/vercel/next.js", query: query.slice(0, 160) }
          : { query: query.slice(0, 160), libraryName: "next.js" },
      queryFor: (round) =>
        round === 1
          ? "app router server components streaming dashboard data"
          : round === 2
            ? "revalidation caching pitfalls app router"
            : "production checklist app router deployment",
    },
  },
  {
    agent_id: "airweave-context",
    display_name: "Airweave",
    sponsor: "Airweave",
    yc_batch: "X25",
    capabilities: ["data-sync", "agent-context", "rag-infrastructure"],
    system_prompt:
      "You are airweave-context, the Airweave data-sync/context agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Airweave docs MCP searchDocs)",
    requiresEnv: [],
    backend: {
      type: "mcp",
      endpoint: "https://docs.airweave.ai/_mcp/server",
      toolPreference: ["searchDocs"],
      queryFor: (round) =>
        round === 1
          ? "sync live data sources into agent context for a realtime dashboard"
          : round === 2
            ? "incremental sync schedules and webhooks for near-realtime updates"
            : "production auth and deployment checklist for a sync pipeline",
    },
  },
  {
    agent_id: "vellum-workflows",
    display_name: "Vellum",
    sponsor: "Vellum",
    yc_batch: "W23",
    capabilities: [
      "workflow-orchestration",
      "agent-evaluation",
      "prompt-management",
    ],
    system_prompt:
      "You are vellum-workflows, the Vellum agent-platform participant in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.4,
    starting_reputation: 0.6,
    provenance_label: "real tool-backed (Vellum docs MCP searchDocs)",
    requiresEnv: [],
    backend: {
      type: "mcp",
      endpoint: "https://docs.vellum.ai/_mcp/server",
      toolPreference: ["searchDocs"],
      queryFor: (round) =>
        round === 1
          ? "orchestrate multi-agent workflows and monitor executions"
          : round === 2
            ? "evaluate agent output quality and compare workflow versions"
            : "deploy workflows to production and track releases",
    },
  },
  {
    agent_id: "hyperspell-memory",
    display_name: "Hyperspell",
    sponsor: "Hyperspell",
    yc_batch: "F25",
    capabilities: ["durable-memory", "cross-session-recall", "context-store"],
    system_prompt:
      "You are hyperspell-memory, the Hyperspell memory agent participating in an Arbor hive roundtable.",
    cost_per_task_estimate: 0.3,
    starting_reputation: 0.6,
    provenance_label: "real memory API (Hyperspell add+query)",
    requiresEnv: ["HYPERSPELL_API_KEY"],
    backend: {
      type: "hyperspell",
      queryFor: (round, goal) =>
        round === 1
          ? `prior decisions and division-of-labor patterns relevant to: ${goal}`
          : round === 2
            ? `conflicts or overlaps recorded in earlier hive roundtables about: ${goal}`
            : `final commitments stored from this roundtable about: ${goal}`,
    },
  },
  {
    agent_id: "litellm-gateway",
    display_name: "LiteLLM",
    sponsor: "LiteLLM (BerriAI)",
    yc_batch: "W23",
    capabilities: ["llm-gateway", "model-routing", "cost-tracking"],
    system_prompt:
      "You are litellm-gateway, the LiteLLM gateway representative in an Arbor hive roundtable. " +
      "You speak for the model-routing/gateway layer: routing, fallbacks, per-agent cost " +
      "tracking, and provider abstraction. Your replies are generated through a live " +
      "self-hosted LiteLLM proxy in front of Azure OpenAI, which is itself the product you represent.",
    cost_per_task_estimate: 0.1,
    starting_reputation: 0.5,
    provenance_label:
      "gateway-backed persona (self-hosted LiteLLM proxy over Azure OpenAI)",
    requiresEnv: ["AZURE_OPENAI_API_KEY"],
    backend: {
      type: "openai-compat",
      baseUrl: "http://127.0.0.1:4400/v1",
      model: "arbor-azure",
    },
  },
  ...YC_GATED_ROSTER,
];

/** Roster entries whose env requirements are satisfied right now. */
export function activeRoster(
  env: Record<string, string | undefined>,
  roster: RosterEntry[] = CONNECTOR_ROSTER,
): RosterEntry[] {
  return roster.filter((entry) =>
    entry.requiresEnv.every((name) => Boolean(env[name]?.trim())),
  );
}
