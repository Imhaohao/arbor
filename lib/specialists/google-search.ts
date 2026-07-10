import { discoverTools } from "../mcp-outbound";
import type { SpecialistConfig } from "../types";
import { fetchAgentCard, type AgentCard } from "./a2a-agent-card";

export interface GoogleSearchLead {
  title: string;
  link: string;
  snippet: string;
}

export interface GoogleSearchToolResult {
  query: string;
  leads: GoogleSearchLead[];
}

export interface GoogleDiscoveryHit {
  specialist: SpecialistConfig;
  rationale: string;
  verified_tools: string[];
  search: GoogleSearchToolResult;
}

export class GoogleSearchToolUnavailableError extends Error {
  constructor(readonly missing_env: string[]) {
    super(`Google Search tool missing env: ${missing_env.join(", ")}`);
  }
}

const GOOGLE_SEARCH_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const GOOGLE_SEARCH_TIMEOUT_MS = 8_000;
const MAX_GOOGLE_RESULTS = 6;
const MAX_PROBED_URLS = 5;

interface GoogleCustomSearchResponse {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    formattedUrl?: string;
  }>;
  error?: { message?: string };
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function googleSearchCredentials(): { key: string; cx: string } {
  const key = env("GOOGLE_SEARCH_API_KEY") ?? env("GOOGLE_API_KEY");
  const cx = env("GOOGLE_SEARCH_ENGINE_ID") ?? env("GOOGLE_CSE_ID");
  const missing = [
    key ? undefined : "GOOGLE_SEARCH_API_KEY",
    cx ? undefined : "GOOGLE_SEARCH_ENGINE_ID",
  ].filter((name): name is string => Boolean(name));
  if (!key || !cx) {
    throw new GoogleSearchToolUnavailableError(missing);
  }
  return { key, cx };
}

export function googleSearchToolMissingEnv(): string[] {
  const key = env("GOOGLE_SEARCH_API_KEY") ?? env("GOOGLE_API_KEY");
  const cx = env("GOOGLE_SEARCH_ENGINE_ID") ?? env("GOOGLE_CSE_ID");
  return [
    key ? undefined : "GOOGLE_SEARCH_API_KEY",
    cx ? undefined : "GOOGLE_SEARCH_ENGINE_ID",
  ].filter((name): name is string => Boolean(name));
}

function buildAgentSearchQuery(query: string, taskType: string | undefined): string {
  const goal = query.trim().replace(/\s+/g, " ").slice(0, 160);
  const hint = taskType?.trim() ? ` ${taskType.trim()}` : "";
  return `${goal}${hint} MCP server OR A2A agent OR agent-card.json OR Model Context Protocol`;
}

export async function googleSearchAgentTool(
  query: string,
  taskType?: string,
): Promise<GoogleSearchToolResult> {
  const { key, cx } = googleSearchCredentials();
  const searchQuery = buildAgentSearchQuery(query, taskType);
  const url = new URL(GOOGLE_SEARCH_ENDPOINT);
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("num", String(MAX_GOOGLE_RESULTS));

  const res = await withTimeout(
    fetch(url.toString(), { headers: { accept: "application/json" } }),
    GOOGLE_SEARCH_TIMEOUT_MS,
  );
  const json = (await res.json()) as GoogleCustomSearchResponse;
  if (!res.ok) {
    throw new Error(
      `Google Search tool HTTP ${res.status}: ${
        json.error?.message ?? "request failed"
      }`,
    );
  }

  return {
    query: searchQuery,
    leads: (json.items ?? [])
      .map((item) => ({
        title: item.title ?? "",
        link: item.link ?? item.formattedUrl ?? "",
        snippet: item.snippet ?? "",
      }))
      .filter((item) => item.link),
  };
}

export async function discoverViaGoogleSearch(args: {
  query: string;
  taskType?: string;
  taken: Set<string>;
}): Promise<GoogleDiscoveryHit | null> {
  const search = await googleSearchAgentTool(args.query, args.taskType);
  const urls = candidateUrls(search.leads);

  for (const url of urls.slice(0, MAX_PROBED_URLS)) {
    const a2a = await tryA2AUrl(url, args.query, args.taken, search);
    if (a2a) return a2a;

    const mcp = await tryMcpUrl(url, args.query, args.taken, search);
    if (mcp) return mcp;
  }

  return null;
}

function candidateUrls(leads: GoogleSearchLead[]): string[] {
  const urls = new Set<string>();
  for (const lead of leads) {
    urls.add(lead.link);
    for (const url of extractUrls(`${lead.link}\n${lead.snippet}`)) {
      urls.add(url);
    }
  }
  return Array.from(urls).filter(isHttpUrl);
}

function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/[^\s"'<>),]+/g)).map((m) => m[0]);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function tryA2AUrl(
  url: string,
  query: string,
  taken: Set<string>,
  search: GoogleSearchToolResult,
): Promise<GoogleDiscoveryHit | null> {
  try {
    const explicit = /\/\.well-known\/agent(?:-card)?\.json$/i.test(
      new URL(url).pathname,
    )
      ? url
      : undefined;
    const card = await fetchAgentCard(url, explicit);
    if (!card || typeof card !== "object") return null;
    return {
      specialist: a2aCardToGoogleConfig(card, url, query, taken),
      rationale: `Google Search found a fetchable A2A agent card at ${url}.`,
      verified_tools: [],
      search,
    };
  } catch {
    return null;
  }
}

async function tryMcpUrl(
  url: string,
  query: string,
  taken: Set<string>,
  search: GoogleSearchToolResult,
): Promise<GoogleDiscoveryHit | null> {
  if (!/\/(?:mcp|sse)(?:\/|\?|#|$)/i.test(url)) return null;
  let tools: Array<{ name?: string; description?: string }>;
  try {
    tools = await discoverTools(url);
  } catch {
    return null;
  }
  const toolNames = tools.map((tool) => tool.name).filter(Boolean) as string[];
  if (toolNames.length === 0) return null;

  return {
    specialist: mcpUrlToGoogleConfig(url, query, taken, tools),
    rationale: `Google Search found a public MCP endpoint at ${url}; tools/list returned ${toolNames.length} tool(s).`,
    verified_tools: toolNames,
    search,
  };
}

function a2aCardToGoogleConfig(
  card: AgentCard,
  sourceUrl: string,
  query: string,
  taken: Set<string>,
): SpecialistConfig {
  const name =
    typeof card.name === "string" && card.name.trim()
      ? card.name.trim()
      : "Google-discovered A2A agent";
  const provider = card.provider;
  const sponsor =
    provider &&
    typeof provider === "object" &&
    !Array.isArray(provider) &&
    typeof (provider as Record<string, unknown>).organization === "string"
      ? ((provider as Record<string, unknown>).organization as string)
      : name;
  const skills = Array.isArray(card.skills)
    ? (card.skills as Array<{ id?: string; name?: string }>)
    : [];
  const capabilities = skills
    .map((skill) => skill.id ?? skill.name ?? "")
    .filter(Boolean)
    .slice(0, 6);
  if (capabilities.length === 0) capabilities.push("a2a-task");

  const endpoint =
    typeof (card as Record<string, unknown>).url === "string"
      ? ((card as Record<string, unknown>).url as string)
      : sourceUrl;

  return {
    agent_id: uniqueAgentId(`${slugify(name)}-google-a2a`, taken),
    display_name: name,
    sponsor,
    capabilities,
    system_prompt:
      `You are ${name}, a real external A2A agent discovered through Google Search. ` +
      `Forward bids and execution to the remote agent at ${endpoint}; never invent remote results locally.`,
    cost_baseline: 0.5,
    starting_reputation: 0.5,
    one_liner:
      typeof card.description === "string" && card.description.trim()
        ? card.description.trim().slice(0, 160)
        : "A2A agent discovered by Google Search.",
    tier: "a2a",
    a2a_endpoint: endpoint,
    a2a_agent_card_url: sourceUrl,
    homepage_url: sourceUrl,
    discovered: true,
    discovery_source: "google",
    discovered_for: query.trim().slice(0, 240),
  };
}

function mcpUrlToGoogleConfig(
  url: string,
  query: string,
  taken: Set<string>,
  tools: Array<{ name?: string; description?: string }>,
): SpecialistConfig {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const base = slugify(host.split(".")[0] || "google-mcp");
  const capabilities = tools
    .map((tool) => tool.name ?? "")
    .filter(Boolean)
    .slice(0, 6);
  if (capabilities.length === 0) capabilities.push("mcp-tools");

  return {
    agent_id: uniqueAgentId(`${base}-google-mcp`, taken),
    display_name: `${host} MCP`,
    sponsor: host,
    capabilities,
    system_prompt:
      `You are ${host} MCP, a real MCP-backed specialist discovered through Google Search. ` +
      "Use the remote MCP tools as the source of truth and decline if the task is outside those tools.",
    cost_baseline: 0.55,
    starting_reputation: 0.5,
    one_liner: `Google-discovered MCP endpoint with ${tools.length} advertised tool(s).`,
    tier: "mcp-forwarding",
    mcp_endpoint: url,
    homepage_url: new URL(url).origin,
    discovered: true,
    discovery_source: "google",
    discovered_for: query.trim().slice(0, 240),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function uniqueAgentId(base: string, taken: Set<string>): string {
  let id = base || "google-discovered-agent";
  let i = 2;
  while (taken.has(id)) {
    id = `${base}-${i}`;
    i += 1;
  }
  return id;
}
