import {
  commitFile,
  createBranch,
  getAuthenticatedUser,
  getRefSha,
  getRepo,
  openRepositoryPR,
  parseRepoUrl,
  type RepoRef,
} from "./github-pr";

export type ConnectorStatus =
  | "ready"
  | "needs_key"
  | "needs_user"
  | "needs_oauth"
  | "needs_http_endpoint"
  | "unverified"
  | "not_supported";

export type ActionMode =
  | "read_only"
  | "write_with_explicit_request"
  | "human_review_required"
  | "not_enabled";

export interface AccountConnector {
  id: string;
  label: string;
  category:
    | "memory"
    | "code"
    | "workspace"
    | "communications"
    | "social"
    | "commerce"
    | "browser"
    | "design"
    | "database"
    | "observability"
    | "automation"
    | "infrastructure"
    | "search"
    | "agent_runtime"
    | "project_management";
  status: ConnectorStatus;
  status_reason: string;
  context_channels: string[];
  action_channels: string[];
  env_keys: string[];
  mcp: {
    transport: "streamable-http" | "stdio" | "hosted-proxy" | "not-configured";
    endpoint?: string;
    endpoint_env?: string;
    api_key_env?: string;
    verified: boolean;
    note: string;
  };
  action_policy: {
    mode: ActionMode;
    risk: "low" | "medium" | "high";
    rule: string;
  };
}

export interface AgenticContextLayer {
  version: "agentic-context-layer-v1";
  user_id: string;
  repo?: RepoRef;
  summary: string;
  connectors: AccountConnector[];
  context_contract: string[];
  action_contract: string[];
  prompt_addendum: string;
}

export interface GithubAutonomyVerification {
  ok: boolean;
  mode: "read_only" | "smoke_branch" | "smoke_pr";
  authenticated_user?: string;
  repo?: RepoRef & {
    default_branch?: string;
    can_push?: boolean;
    can_admin?: boolean;
  };
  branch?: string;
  file_path?: string;
  pr_url?: string;
  pr_number?: number;
  error?: string;
  note: string;
}

function envSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function configuredEndpoint(envName: string): string | undefined {
  const value = process.env[envName]?.trim();
  return value || undefined;
}

function anyEnvSet(names: string[]): boolean {
  return names.some(envSet);
}

function statusFromEnv(
  requiredKeys: string[],
  ready: ConnectorStatus = "ready",
): ConnectorStatus {
  return requiredKeys.every(envSet) ? ready : "needs_key";
}

function providerViaHyperspell(provider: string): {
  status: ConnectorStatus;
  reason: string;
} {
  if (!envSet("HYPERSPELL_API_KEY")) {
    return {
      status: "needs_key",
      reason: `${provider} can be ingested through Hyperspell, but HYPERSPELL_API_KEY is not set.`,
    };
  }
  if (!envSet("HYPERSPELL_USER_ID")) {
    return {
      status: "needs_user",
      reason: `${provider} needs HYPERSPELL_USER_ID or a per-task user id before Arbor can query connected memories.`,
    };
  }
  return {
    status: "needs_oauth",
    reason: `${provider} is available through Hyperspell, but the user's OAuth connection must be verified with /connections/list.`,
  };
}

function githubStatus(): { status: ConnectorStatus; reason: string } {
  if (firstEnv(["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT"])) {
    return {
      status: "ready",
      reason: "A GitHub token env var is present; runtime verification still checks whether GitHub accepts it.",
    };
  }
  return {
    status: "needs_key",
    reason: "Set GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT with repo scope before GitHub write actions can run.",
  };
}

function connectorCatalog(): AccountConnector[] {
  const github = githubStatus();
  const googleDrive = providerViaHyperspell("Google Drive");
  const gmail = providerViaHyperspell("Gmail");
  const googleCalendar = providerViaHyperspell("Google Calendar");
  const notion = providerViaHyperspell("Notion");
  const slack = providerViaHyperspell("Slack");
  const discord = providerViaHyperspell("Discord");
  const githubMcpEndpoint = configuredEndpoint("GITHUB_MCP_ENDPOINT");
  const mcpConnector = (args: {
    id: string;
    label: string;
    category: AccountConnector["category"];
    endpointEnv: string;
    keyEnvs?: string[];
    defaultEndpoint?: string;
    contextChannels: string[];
    actionChannels: string[];
    actionMode?: ActionMode;
    risk?: "low" | "medium" | "high";
    rule: string;
    note: string;
  }): AccountConnector => {
    const endpoint = configuredEndpoint(args.endpointEnv) ?? args.defaultEndpoint;
    const keyEnvs = args.keyEnvs ?? [];
    const keySatisfied = keyEnvs.length === 0 || anyEnvSet(keyEnvs);
    const status: ConnectorStatus = endpoint
      ? keySatisfied
        ? "ready"
        : "needs_key"
      : "needs_http_endpoint";
    return {
      id: args.id,
      label: args.label,
      category: args.category,
      status,
      status_reason: endpoint
        ? keySatisfied
          ? `${args.label} MCP endpoint is configured; tools/list still needs runtime verification.`
          : `${args.label} MCP endpoint is configured, but one of ${keyEnvs.join(", ")} is required.`
        : `Set ${args.endpointEnv} to a streamable HTTP MCP endpoint before Arbor can call this connector.`,
      context_channels: args.contextChannels,
      action_channels: args.actionChannels,
      env_keys: [args.endpointEnv, ...keyEnvs],
      mcp: {
        transport: endpoint ? "streamable-http" : "not-configured",
        endpoint,
        endpoint_env: args.endpointEnv,
        api_key_env: keyEnvs[0],
        verified: false,
        note: args.note,
      },
      action_policy: {
        mode: args.actionMode ?? "read_only",
        risk: args.risk ?? "medium",
        rule: args.rule,
      },
    };
  };

  return [
    {
      id: "openai",
      label: "OpenAI model runtime",
      category: "agent_runtime",
      status: envSet("OPENAI_API_KEY") ? "ready" : "needs_key",
      status_reason: envSet("OPENAI_API_KEY")
        ? "OPENAI_API_KEY is configured; Arbor's native model runtime and hive fallback can use OpenAI credits."
        : "OPENAI_API_KEY is not set.",
      context_channels: ["model reasoning", "planning", "judging", "tool-loop orchestration"],
      action_channels: ["model calls through Arbor's callOpenAI/callClaude adapters"],
      env_keys: ["OPENAI_API_KEY", "OPENAI_MODEL", "ARBOR_MODEL_PROVIDER", "ARBOR_HIVE_MODEL_PROVIDER"],
      mcp: {
        transport: "not-configured",
        verified: false,
        note: "This is Arbor's model runtime connection, not an external MCP server.",
      },
      action_policy: {
        mode: "read_only",
        risk: "low",
        rule: "Use for reasoning/planning/judging; never treat model output as permission to mutate external systems.",
      },
    },
    {
      id: "hyperspell",
      label: "Hyperspell memory",
      category: "memory",
      status: envSet("HYPERSPELL_API_KEY") ? "ready" : "needs_key",
      status_reason: envSet("HYPERSPELL_API_KEY")
        ? "Hyperspell API key is configured; connection-specific providers still need OAuth verification."
        : "HYPERSPELL_API_KEY is not set.",
      context_channels: [
        "business memory",
        "workspace search",
        "connected account memories",
        "procedural memory",
      ],
      action_channels: ["Gmail draft/send actions when gmail_actions is connected"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID"],
      mcp: {
        transport: envSet("HYPERSPELL_API_KEY") ? "hosted-proxy" : "not-configured",
        endpoint: envSet("HYPERSPELL_API_KEY")
          ? "https://server.smithery.ai/@hyperspell/hyperspell-mcp"
          : undefined,
        api_key_env: "HYPERSPELL_API_KEY",
        verified: false,
        note: "Arbor also uses direct Hyperspell REST helpers for memory add/upload/list/search.",
      },
      action_policy: {
        mode: "human_review_required",
        risk: "high",
        rule: "Sending email or messages requires explicit user intent and should prefer drafts before sends.",
      },
    },
    {
      id: "nia",
      label: "Nia source intelligence",
      category: "memory",
      status: statusFromEnv(["NIA_API_KEY"]),
      status_reason: envSet("NIA_API_KEY")
        ? "NIA_API_KEY is configured for the remote Nia MCP server."
        : "NIA_API_KEY is not set.",
      context_channels: [
        "indexed repo search",
        "docs and papers",
        "local/project sources",
        "vault memory",
      ],
      action_channels: ["index sources", "search sources", "read indexed files"],
      env_keys: ["NIA_API_KEY"],
      mcp: {
        transport: "streamable-http",
        endpoint: "https://apigcp.trynia.ai/mcp",
        api_key_env: "NIA_API_KEY",
        verified: envSet("NIA_API_KEY"),
        note: "Nia is the source-of-truth context layer when project sources are indexed or bound with nia.json.",
      },
      action_policy: {
        mode: "read_only",
        risk: "low",
        rule: "Use Nia for retrieval and indexing; do not treat search results as permission to mutate source systems.",
      },
    },
    {
      id: "github",
      label: "GitHub",
      category: "code",
      status: github.status,
      status_reason: github.reason,
      context_channels: ["repositories", "issues", "pull requests", "code search"],
      action_channels: ["create branch", "commit file", "open pull request"],
      env_keys: ["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT", "GITHUB_MCP_ENDPOINT"],
      mcp: {
        transport: githubMcpEndpoint ? "streamable-http" : "stdio",
        endpoint: githubMcpEndpoint,
        endpoint_env: "GITHUB_MCP_ENDPOINT",
        api_key_env: "GITHUB_TOKEN",
        verified: false,
        note: githubMcpEndpoint
          ? "HTTP MCP endpoint is configured but still needs tools/list verification."
          : "Official GitHub MCP is usually stdio/local; Arbor uses REST for verified write actions unless an HTTP endpoint is supplied.",
      },
      action_policy: {
        mode: "write_with_explicit_request",
        risk: "high",
        rule: "Write only to an explicit repo/branch path and return a branch or PR receipt.",
      },
    },
    {
      id: "google_drive",
      label: "Google Drive",
      category: "workspace",
      status: googleDrive.status,
      status_reason: googleDrive.reason,
      context_channels: ["documents", "folders", "workspace files"],
      action_channels: ["read/search through Hyperspell or Google Drive connector"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID"],
      mcp: {
        transport: "not-configured",
        verified: false,
        note: "Preliminary connector is represented through Hyperspell and optional app/MCP connectors.",
      },
      action_policy: {
        mode: "read_only",
        risk: "medium",
        rule: "Read/search only until a write-capable Google connector and user OAuth scopes are verified.",
      },
    },
    {
      id: "gmail",
      label: "Gmail",
      category: "communications",
      status: gmail.status,
      status_reason: gmail.reason,
      context_channels: ["email search", "threads", "attachments"],
      action_channels: ["draft email", "send email", "modify labels"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID"],
      mcp: {
        transport: "not-configured",
        verified: false,
        note: "Hyperspell exposes Gmail and gmail_actions providers when the user connects them.",
      },
      action_policy: {
        mode: "human_review_required",
        risk: "high",
        rule: "Prefer draft creation; sending requires explicit user confirmation and an audited recipient/body.",
      },
    },
    {
      id: "google_calendar",
      label: "Google Calendar",
      category: "workspace",
      status: googleCalendar.status,
      status_reason: googleCalendar.reason,
      context_channels: ["calendar events", "availability"],
      action_channels: ["read availability; writes require future connector verification"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID"],
      mcp: {
        transport: "not-configured",
        verified: false,
        note: "Context is available through Hyperspell once the user's Google Calendar connection is present.",
      },
      action_policy: {
        mode: "human_review_required",
        risk: "medium",
        rule: "Calendar writes need explicit time, attendees, and confirmation.",
      },
    },
    {
      id: "notion",
      label: "Notion",
      category: "workspace",
      status: notion.status,
      status_reason: notion.reason,
      context_channels: ["pages", "databases", "workspace notes"],
      action_channels: ["read/search through connected memory"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID", "NOTION_MCP_ENDPOINT"],
      mcp: {
        transport: configuredEndpoint("NOTION_MCP_ENDPOINT")
          ? "streamable-http"
          : "not-configured",
        endpoint: configuredEndpoint("NOTION_MCP_ENDPOINT"),
        endpoint_env: "NOTION_MCP_ENDPOINT",
        verified: false,
        note: "No Notion HTTP MCP endpoint is configured in Arbor yet.",
      },
      action_policy: {
        mode: "read_only",
        risk: "medium",
        rule: "Do not write workspace pages until an OAuth-scoped write connector is verified.",
      },
    },
    {
      id: "slack",
      label: "Slack",
      category: "communications",
      status: slack.status,
      status_reason: slack.reason,
      context_channels: ["channels", "threads", "messages"],
      action_channels: ["send message when an actions connector is verified"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID", "SLACK_MCP_ENDPOINT"],
      mcp: {
        transport: configuredEndpoint("SLACK_MCP_ENDPOINT")
          ? "streamable-http"
          : "not-configured",
        endpoint: configuredEndpoint("SLACK_MCP_ENDPOINT"),
        endpoint_env: "SLACK_MCP_ENDPOINT",
        verified: false,
        note: "Nia CLI can also install Slack tokens for indexed context outside Arbor runtime.",
      },
      action_policy: {
        mode: "human_review_required",
        risk: "high",
        rule: "Message sending requires explicit channel, audience, and final text confirmation.",
      },
    },
    {
      id: "discord",
      label: "Discord",
      category: "communications",
      status: discord.status,
      status_reason: discord.reason,
      context_channels: ["server messages", "channels"],
      action_channels: ["not enabled"],
      env_keys: ["HYPERSPELL_API_KEY", "HYPERSPELL_USER_ID", "DISCORD_MCP_ENDPOINT"],
      mcp: {
        transport: configuredEndpoint("DISCORD_MCP_ENDPOINT")
          ? "streamable-http"
          : "not-configured",
        endpoint: configuredEndpoint("DISCORD_MCP_ENDPOINT"),
        endpoint_env: "DISCORD_MCP_ENDPOINT",
        verified: false,
        note: "Discord is preliminary only; no Arbor-verified Discord action connector is present.",
      },
      action_policy: {
        mode: "not_enabled",
        risk: "high",
        rule: "Do not send or moderate Discord content until a scoped connector is verified.",
      },
    },
    {
      id: "tiktok",
      label: "TikTok / social commerce",
      category: "social",
      status: envSet("REACHER_API_KEY") ? "ready" : "needs_key",
      status_reason: envSet("REACHER_API_KEY")
        ? "REACHER_API_KEY is configured for social/creator research."
        : "REACHER_API_KEY is not set; no TikTok/social context connector is verified.",
      context_channels: ["creator discovery", "social commerce research"],
      action_channels: ["research only"],
      env_keys: ["REACHER_API_KEY", "TIKTOK_MCP_ENDPOINT"],
      mcp: {
        transport: configuredEndpoint("TIKTOK_MCP_ENDPOINT")
          ? "streamable-http"
          : "not-configured",
        endpoint: configuredEndpoint("TIKTOK_MCP_ENDPOINT"),
        endpoint_env: "TIKTOK_MCP_ENDPOINT",
        verified: false,
        note: "TikTok is represented as social research today, not a verified posting/buying action connector.",
      },
      action_policy: {
        mode: "read_only",
        risk: "medium",
        rule: "Use for research and candidate lists only until official posting/commerce scopes are verified.",
      },
    },
    mcpConnector({
      id: "context7",
      label: "Context7 docs",
      category: "memory",
      endpointEnv: "CONTEXT7_MCP_ENDPOINT",
      defaultEndpoint: "https://mcp.context7.com/mcp",
      contextChannels: ["fresh library docs", "API examples", "framework references"],
      actionChannels: ["read documentation"],
      actionMode: "read_only",
      risk: "low",
      rule: "Use for documentation lookup and cite retrieved docs; it does not grant source-system write access.",
      note: "Public remote docs MCP often works without a per-user token, but runtime tools/list is still the real verifier.",
    }),
    mcpConnector({
      id: "playwright_browser",
      label: "Playwright browser",
      category: "browser",
      endpointEnv: "PLAYWRIGHT_MCP_ENDPOINT",
      contextChannels: ["web page state", "screenshots", "browser automation"],
      actionChannels: ["navigate", "click", "fill forms", "inspect UI"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Browser actions that submit forms, buy, publish, or send messages require explicit user approval.",
      note: "Usually runs as a local/hosted browser MCP; Arbor needs an HTTP endpoint to call it remotely.",
    }),
    mcpConnector({
      id: "figma",
      label: "Figma",
      category: "design",
      endpointEnv: "FIGMA_MCP_ENDPOINT",
      keyEnvs: ["FIGMA_ACCESS_TOKEN"],
      contextChannels: ["design files", "components", "tokens", "frames"],
      actionChannels: ["inspect designs", "export assets"],
      actionMode: "read_only",
      risk: "medium",
      rule: "Read/inspect by default; modifying design files requires a separate write-scoped connector and user confirmation.",
      note: "Popular design-context MCP; token scope must match the target Figma workspace.",
    }),
    mcpConnector({
      id: "supabase",
      label: "Supabase",
      category: "database",
      endpointEnv: "SUPABASE_MCP_ENDPOINT",
      keyEnvs: ["SUPABASE_ACCESS_TOKEN"],
      contextChannels: ["schema", "SQL", "edge functions", "auth config"],
      actionChannels: ["inspect projects", "run scoped database operations"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Schema/data writes require an explicit target project, SQL preview, backup/rollback plan, and user approval.",
      note: "Database MCP connections are high-impact even when tool discovery passes.",
    }),
    mcpConnector({
      id: "postgres",
      label: "Postgres",
      category: "database",
      endpointEnv: "POSTGRES_MCP_ENDPOINT",
      keyEnvs: ["DATABASE_URL", "POSTGRES_URL"],
      contextChannels: ["schema", "query plans", "tables", "migrations"],
      actionChannels: ["read/query database", "controlled migrations"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Default to read-only; write queries/migrations require explicit SQL and approval.",
      note: "Use a read-only database credential unless a task explicitly needs mutation.",
    }),
    mcpConnector({
      id: "neon",
      label: "Neon database",
      category: "database",
      endpointEnv: "NEON_MCP_ENDPOINT",
      keyEnvs: ["NEON_API_KEY"],
      contextChannels: ["Postgres branches", "schema", "query data"],
      actionChannels: ["branch/database operations"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Branch, schema, or data mutation needs explicit user approval and a rollback path.",
      note: "Useful for branchable Postgres workflows and database-aware agents.",
    }),
    mcpConnector({
      id: "linear",
      label: "Linear",
      category: "project_management",
      endpointEnv: "LINEAR_MCP_ENDPOINT",
      keyEnvs: ["LINEAR_API_KEY"],
      contextChannels: ["issues", "projects", "cycles", "roadmaps"],
      actionChannels: ["create/update issues"],
      actionMode: "human_review_required",
      risk: "medium",
      rule: "Creating or updating issues requires explicit project/team and final issue text.",
      note: "Project-management context is safe to read but noisy writes need approval.",
    }),
    mcpConnector({
      id: "sentry",
      label: "Sentry",
      category: "observability",
      endpointEnv: "SENTRY_MCP_ENDPOINT",
      keyEnvs: ["SENTRY_AUTH_TOKEN"],
      contextChannels: ["errors", "traces", "releases", "performance"],
      actionChannels: ["read incidents", "annotate or resolve issues"],
      actionMode: "human_review_required",
      risk: "medium",
      rule: "Resolving, ignoring, or mutating incidents needs explicit issue IDs and approval.",
      note: "High-value debugging context for coding agents.",
    }),
    mcpConnector({
      id: "stripe",
      label: "Stripe",
      category: "commerce",
      endpointEnv: "STRIPE_MCP_ENDPOINT",
      keyEnvs: ["STRIPE_API_KEY", "STRIPE_SECRET_KEY"],
      contextChannels: ["customers", "subscriptions", "payments", "connect accounts"],
      actionChannels: ["inspect billing", "prepare payment operations"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Charges, refunds, subscription changes, and Connect actions require explicit user approval.",
      note: "Arbor has Stripe escrow helpers, but external Stripe MCP actions remain high-impact.",
    }),
    mcpConnector({
      id: "vercel",
      label: "Vercel",
      category: "infrastructure",
      endpointEnv: "VERCEL_MCP_ENDPOINT",
      keyEnvs: ["VERCEL_TOKEN"],
      contextChannels: ["projects", "deployments", "logs", "domains"],
      actionChannels: ["deploy", "inspect logs", "manage project settings"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Deployments and production setting changes require explicit project/environment approval.",
      note: "Useful for closing the code-to-deploy loop when the Vercel connector is installed.",
    }),
    mcpConnector({
      id: "docker",
      label: "Docker",
      category: "infrastructure",
      endpointEnv: "DOCKER_MCP_ENDPOINT",
      contextChannels: ["containers", "images", "compose services"],
      actionChannels: ["inspect or control local containers"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Starting/stopping/removing containers or images requires explicit user approval.",
      note: "Local infrastructure MCP; remote Arbor needs an HTTP bridge endpoint.",
    }),
    mcpConnector({
      id: "kubernetes",
      label: "Kubernetes",
      category: "infrastructure",
      endpointEnv: "KUBERNETES_MCP_ENDPOINT",
      keyEnvs: ["KUBECONFIG"],
      contextChannels: ["clusters", "pods", "deployments", "events"],
      actionChannels: ["inspect cluster state", "apply manifests"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Cluster mutations require namespace/resource scope, manifest diff, and explicit approval.",
      note: "Treat Kubernetes as production-impacting unless the connector proves a sandbox context.",
    }),
    mcpConnector({
      id: "firecrawl",
      label: "Firecrawl",
      category: "search",
      endpointEnv: "FIRECRAWL_MCP_ENDPOINT",
      keyEnvs: ["FIRECRAWL_API_KEY"],
      contextChannels: ["web crawling", "site extraction", "markdown pages"],
      actionChannels: ["crawl/search public pages"],
      actionMode: "read_only",
      risk: "low",
      rule: "Use for retrieval only; respect robots, rate limits, and source attribution.",
      note: "Common MCP for web extraction and research workflows.",
    }),
    mcpConnector({
      id: "exa",
      label: "Exa search",
      category: "search",
      endpointEnv: "EXA_MCP_ENDPOINT",
      keyEnvs: ["EXA_API_KEY"],
      contextChannels: ["semantic web search", "company/person research", "URL contents"],
      actionChannels: ["search/read public web"],
      actionMode: "read_only",
      risk: "low",
      rule: "Use as external research context; cite sources and avoid treating search as private account memory.",
      note: "Popular neural-search MCP for agent research.",
    }),
    mcpConnector({
      id: "zapier",
      label: "Zapier",
      category: "automation",
      endpointEnv: "ZAPIER_MCP_ENDPOINT",
      keyEnvs: ["ZAPIER_MCP_API_KEY"],
      contextChannels: ["connected SaaS actions", "automation catalog"],
      actionChannels: ["cross-app automations"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Any cross-app write action requires explicit app, account, payload, and approval.",
      note: "Broad action connector; high leverage and high blast radius.",
    }),
    mcpConnector({
      id: "pipedream",
      label: "Pipedream",
      category: "automation",
      endpointEnv: "PIPEDREAM_MCP_ENDPOINT",
      keyEnvs: ["PIPEDREAM_API_KEY"],
      contextChannels: ["connected apps", "workflow actions"],
      actionChannels: ["run workflows", "call app APIs"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Workflow execution requires explicit workflow/app, payload, and user approval.",
      note: "Useful for long-tail SaaS integrations through a single MCP surface.",
    }),
    mcpConnector({
      id: "composio",
      label: "Composio",
      category: "automation",
      endpointEnv: "COMPOSIO_MCP_ENDPOINT",
      keyEnvs: ["COMPOSIO_API_KEY"],
      contextChannels: ["tool catalog", "connected app auth", "agent actions"],
      actionChannels: ["execute app actions"],
      actionMode: "human_review_required",
      risk: "high",
      rule: "Connected-app mutations require explicit app/action/payload and user approval.",
      note: "Broad agent-actions platform; use only verified scoped connections.",
    }),
    {
      id: "commerce",
      label: "Purchasing and payments",
      category: "commerce",
      status: "unverified",
      status_reason: "Stripe escrow exists for Arbor marketplace payments, but end-user purchasing mandates are not implemented.",
      context_channels: ["price and vendor research through future connectors"],
      action_channels: ["no autonomous purchase execution"],
      env_keys: ["STRIPE_API_KEY", "PAYMENT_SERVER_SECRET"],
      mcp: {
        transport: "not-configured",
        verified: false,
        note: "Purchases need signed intent/payment mandates before autonomous checkout.",
      },
      action_policy: {
        mode: "human_review_required",
        risk: "high",
        rule: "Never buy without explicit item, seller, max price, payment instrument, shipping, and final approval.",
      },
    },
  ];
}

export function buildAgenticContextLayer(input: {
  userId?: string;
  repoUrl?: string;
} = {}): AgenticContextLayer {
  const repo = input.repoUrl ? parseRepoUrl(input.repoUrl) ?? undefined : undefined;
  const connectors = connectorCatalog();
  const ready = connectors
    .filter((connector) => connector.status === "ready")
    .map((connector) => connector.id);
  const needs = connectors
    .filter((connector) => connector.status !== "ready")
    .map((connector) => `${connector.id}:${connector.status}`);

  const context_contract = [
    "Retrieve durable memory before executing: Hyperspell for user/workspace memory, Nia for repo/docs/source evidence.",
    "Attach source and account readiness to every handoff so downstream agents know what is real, missing, or unverified.",
    "Prefer indexed/private sources over public web when they exist; mark public-web fallbacks explicitly.",
  ];
  const action_contract = [
    "Use read-only connectors freely for context, but treat write, message, calendar, code, and commerce actions as permissioned capabilities.",
    "For GitHub, write only to an explicit repo and branch, and return a branch/PR receipt.",
    "For commerce, require a signed user mandate before checkout; research and cart preparation are not purchase authorization.",
  ];

  const prompt_addendum = [
    "Agentic context layer:",
    `- user: ${input.userId ?? process.env.HYPERSPELL_USER_ID ?? "unknown"}`,
    `- target repo: ${repo ? `${repo.owner}/${repo.repo}` : "not supplied"}`,
    `- ready connectors: ${ready.join(", ") || "none"}`,
    `- unavailable/unverified connectors: ${needs.join(", ") || "none"}`,
    "- context contract:",
    ...context_contract.map((line) => `  - ${line}`),
    "- action contract:",
    ...action_contract.map((line) => `  - ${line}`),
  ].join("\n");

  return {
    version: "agentic-context-layer-v1",
    user_id: input.userId ?? process.env.HYPERSPELL_USER_ID ?? "unknown",
    repo,
    summary:
      "Durable context and permissioned action layer for Arbor: memory retrieval, source grounding, connector readiness, and auditable user-authorized actions.",
    connectors,
    context_contract,
    action_contract,
    prompt_addendum,
  };
}

function uniqueBranch(prefix: string): string {
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${safe || "arbor-agentic-context"}/${Date.now()}`;
}

export async function verifyGithubAutonomy(args: {
  repoUrl?: string;
  owner?: string;
  repo?: string;
  mode?: "read_only" | "smoke_branch" | "smoke_pr";
  branchPrefix?: string;
  filePath?: string;
  title?: string;
  token?: string;
} = {}): Promise<GithubAutonomyVerification> {
  const token = args.token ?? firstEnv(["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT"]);
  const mode = args.mode ?? "read_only";
  const parsed = args.repoUrl ? parseRepoUrl(args.repoUrl) : null;
  const ref =
    parsed ??
    (args.owner && args.repo ? { owner: args.owner, repo: args.repo } : null);

  if (!token) {
    return {
      ok: false,
      mode,
      repo: ref ?? undefined,
      error: "missing GitHub token",
      note: "Set GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT with repo scope.",
    };
  }
  if (!ref) {
    return {
      ok: false,
      mode,
      error: "missing repo",
      note: "Pass repo_url or owner/repo.",
    };
  }

  try {
    const [authenticatedUser, repoInfo] = await Promise.all([
      getAuthenticatedUser(token),
      getRepo(ref, token),
    ]);
    const base = repoInfo.default_branch;
    const repoResult = {
      ...ref,
      default_branch: base,
      can_push: repoInfo.permissions.push === true,
      can_admin: repoInfo.permissions.admin === true,
    };

    if (mode === "read_only") {
      return {
        ok: true,
        mode,
        authenticated_user: authenticatedUser,
        repo: repoResult,
        note: repoInfo.permissions.push
          ? "GitHub auth and repo push permission verified."
          : "GitHub auth verified, but repo push permission is not present.",
      };
    }

    if (!repoInfo.permissions.push) {
      return {
        ok: false,
        mode,
        authenticated_user: authenticatedUser,
        repo: repoResult,
        error: "authenticated user lacks push permission",
        note: "GitHub accepted the token, but this repo cannot be written by that account.",
      };
    }

    const branch = uniqueBranch(args.branchPrefix ?? "arbor-agentic-context");
    const sha = await getRefSha(ref, base, token);
    await createBranch(ref, branch, sha, token);
    const filePath = args.filePath ?? ".arbor/agentic-github-smoke.txt";
    const content = [
      "Arbor GitHub autonomy smoke test",
      `repo: ${ref.owner}/${ref.repo}`,
      `actor: ${authenticatedUser}`,
      `created_at: ${new Date().toISOString()}`,
      "purpose: verify Arbor can create a branch, commit a file, and optionally open a PR with an authenticated GitHub account.",
      "",
    ].join("\n");
    await commitFile({
      ref,
      branch,
      path: filePath,
      content,
      message: "Verify Arbor GitHub autonomy",
      token,
    });

    if (mode === "smoke_branch") {
      return {
        ok: true,
        mode,
        authenticated_user: authenticatedUser,
        repo: repoResult,
        branch,
        file_path: filePath,
        note: "Created a smoke branch and committed a verification file.",
      };
    }

    const pr = await openRepositoryPR({
      ref,
      branch,
      base,
      title: args.title ?? "Verify Arbor GitHub autonomy",
      body: [
        "Automated Arbor smoke test.",
        "",
        "This PR verifies that Arbor can act on an authenticated GitHub account by creating a branch, committing a file, and opening a PR.",
      ].join("\n"),
      token,
    });

    return {
      ok: true,
      mode,
      authenticated_user: authenticatedUser,
      repo: repoResult,
      branch,
      file_path: filePath,
      pr_url: pr.url,
      pr_number: pr.number,
      note: "Created a smoke branch, committed a verification file, and opened a PR.",
    };
  } catch (err) {
    return {
      ok: false,
      mode,
      repo: ref,
      error: err instanceof Error ? err.message : String(err),
      note: "GitHub autonomy verification failed.",
    };
  }
}
