// Roster census: can every registered agent actually answer?
//
// Usage:
//   npm run roster:census -- probe            # transport probe, whole roster
//   npm run roster:census -- probe --limit 50 # smoke subset
//   npm run roster:census -- deliver          # capability+delivery on reachable ones
//   npm run roster:census -- report           # markdown investigative output
//
// The question this answers is NOT "is the row registered" (all 1166 are) but
// "does a real server answer, name its abilities, and hand back real work".
// Every verdict below is a recorded HTTP outcome, never an inference from the
// catalog row. Agents blocked behind a paywall or an account are labeled as
// such rather than counted as failures — that distinction is the whole point.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseSseJson, extractMcpText } from "../lib/hive/connector-core";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "autoresearch/data");
const CENSUS_PATH = resolve(DATA_DIR, "roster-census.json");
const DELIVERY_PATH = resolve(DATA_DIR, "roster-delivery.json");

function loadEnvLocal(): void {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].replace(/\s+#.*$/, "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** Terminal verdict for one agent. */
export type Verdict =
  /** Server answered and named real tools/skills with no credential at all. */
  | "live_open"
  /** Server answered using a credential this deployment already holds. */
  | "live_keyed"
  /** Server is alive but demands a credential we do not have: money/account. */
  | "paywalled"
  /** Endpoint exists in the row but nothing answers (DNS, timeout, 5xx, 404). */
  | "dead"
  /** Catalog row carries no transport at all — nothing to call. */
  | "no_transport"
  /** Arbor-owned agent served by our own model lane, not an external server. */
  | "house";

export interface CensusRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  tier?: string;
  transport: "mcp" | "a2a" | "none";
  endpoint?: string;
  key_env?: string;
  key_present: boolean;
  verdict: Verdict;
  /** Tool/skill names the server itself declared. Proof it stated its ability. */
  abilities: string[];
  http_status?: number;
  detail?: string;
  latency_ms?: number;
}

const HOUSE_AGENTS = new Set([
  "arbor-hive-backstop",
  "arbor-baseline",
  "arbor-public-demo",
  "codebase-explainer",
]);

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/**
 * Read a response body under its own deadline.
 *
 * The fetch AbortController only covers headers. An MCP server that answers
 * 200 and then holds the SSE stream open with keepalive comments — several in
 * this roster do — makes `res.text()` hang forever after the abort timer has
 * already been cleared. That stalled the first full sweep at 1125/1166.
 */
async function readBodyWithTimeout(res: Response, ms: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      res.text(),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`body read timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 401/402/403 mean a live server gating on credentials — not a dead one. */
function isAuthStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403;
}

async function probeMcp(
  endpoint: string,
  bearer: string | undefined,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  status?: number;
  abilities: string[];
  detail?: string;
}> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  const init = withTimeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: init.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "arbor-census", version: "1.0" },
        },
      }),
    });
  } catch (err) {
    init.done();
    return {
      ok: false,
      abilities: [],
      detail: (err as Error).message.slice(0, 120),
    };
  }
  const sessionId = res.headers.get("mcp-session-id");
  const text = await readBodyWithTimeout(res, timeoutMs).catch(() => "");
  init.done();
  if (!res.ok) {
    return { ok: false, status: res.status, abilities: [], detail: text.slice(0, 160) };
  }
  // Some servers answer initialize 200 but gate tools/list on auth.
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const listInit = withTimeout(timeoutMs);
  let listRes: Response;
  try {
    listRes = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: listInit.signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
  } catch (err) {
    listInit.done();
    return {
      ok: false,
      abilities: [],
      detail: `tools/list: ${(err as Error).message.slice(0, 100)}`,
    };
  }
  const listText = await readBodyWithTimeout(listRes, timeoutMs).catch(
    () => "",
  );
  listInit.done();
  if (!listRes.ok) {
    return {
      ok: false,
      status: listRes.status,
      abilities: [],
      detail: listText.slice(0, 160),
    };
  }
  try {
    const parsed = parseSseJson(listText) as {
      result?: { tools?: Array<{ name?: string }> };
      error?: { message?: string };
    };
    if (parsed.error) {
      return {
        ok: false,
        status: listRes.status,
        abilities: [],
        detail: parsed.error.message?.slice(0, 160),
      };
    }
    const abilities = (parsed.result?.tools ?? [])
      .map((t) => t.name ?? "")
      .filter(Boolean);
    if (abilities.length === 0) {
      return { ok: false, status: listRes.status, abilities: [], detail: "server declared zero tools" };
    }
    return { ok: true, status: listRes.status, abilities };
  } catch (err) {
    return {
      ok: false,
      status: listRes.status,
      abilities: [],
      detail: `unparseable: ${(err as Error).message.slice(0, 100)}`,
    };
  }
}

async function probeA2a(
  cardUrl: string,
  bearer: string | undefined,
  timeoutMs: number,
): Promise<{ ok: boolean; status?: number; abilities: string[]; detail?: string }> {
  const init = withTimeout(timeoutMs);
  try {
    const res = await fetch(cardUrl, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      signal: init.signal,
    });
    const text = await readBodyWithTimeout(res, timeoutMs).catch(() => "");
    init.done();
    if (!res.ok) {
      return { ok: false, status: res.status, abilities: [], detail: text.slice(0, 160) };
    }
    const card = JSON.parse(text) as {
      name?: string;
      skills?: Array<{ name?: string; id?: string }>;
      capabilities?: Record<string, unknown>;
    };
    const abilities = (card.skills ?? [])
      .map((s) => s.name ?? s.id ?? "")
      .filter(Boolean);
    return {
      ok: true,
      status: res.status,
      abilities: abilities.length > 0 ? abilities : [card.name ?? "agent-card"],
    };
  } catch (err) {
    init.done();
    return { ok: false, abilities: [], detail: (err as Error).message.slice(0, 120) };
  }
}

function cardUrlFor(row: { a2a_agent_card_url?: string; a2a_endpoint?: string }): string | undefined {
  if (row.a2a_agent_card_url) return row.a2a_agent_card_url;
  if (!row.a2a_endpoint) return undefined;
  try {
    const url = new URL(row.a2a_endpoint);
    return `${url.origin}/.well-known/agent.json`;
  } catch {
    return undefined;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  async function run(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done += 1;
      if (onProgress && done % 25 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

interface SpecialistRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  tier?: string;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
}

async function fetchRoster(client: ConvexHttpClient): Promise<SpecialistRow[]> {
  const rows: SpecialistRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 40; page += 1) {
    const result = (await client.query(api.discoveredSpecialists.listPage, {
      paginationOpts: { numItems: 200, cursor },
    })) as { page: SpecialistRow[]; isDone: boolean; continueCursor: string };
    rows.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  return rows;
}

async function probeAll(): Promise<void> {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
  const roster = await fetchRoster(client);
  const limit = Number(flag("limit") ?? roster.length);
  const subset = roster.slice(0, limit);
  const timeoutMs = Number(flag("timeout") ?? 12_000);
  console.log(`probing ${subset.length} of ${roster.length} registered specialists`);

  const rows = await mapWithConcurrency(
    subset,
    Number(flag("concurrency") ?? 24),
    async (row): Promise<CensusRow> => {
      const started = Date.now();
      const base: CensusRow = {
        agent_id: row.agent_id,
        display_name: row.display_name,
        sponsor: row.sponsor,
        tier: row.tier,
        transport: "none",
        key_present: false,
        verdict: "no_transport",
        abilities: [],
      };
      if (HOUSE_AGENTS.has(row.agent_id)) {
        return { ...base, verdict: "house", detail: "Arbor-owned, served by our model lane" };
      }

      if (row.mcp_endpoint) {
        const keyEnv = row.mcp_api_key_env;
        const key = keyEnv ? process.env[keyEnv]?.trim() : undefined;
        const probe = await probeMcp(row.mcp_endpoint, key, timeoutMs);
        const verdict: Verdict = probe.ok
          ? key
            ? "live_keyed"
            : "live_open"
          : probe.status && isAuthStatus(probe.status)
            ? "paywalled"
            : "dead";
        return {
          ...base,
          transport: "mcp",
          endpoint: row.mcp_endpoint,
          key_env: keyEnv,
          key_present: Boolean(key),
          verdict,
          abilities: probe.abilities,
          http_status: probe.status,
          detail: probe.detail,
          latency_ms: Date.now() - started,
        };
      }

      const cardUrl = cardUrlFor(row);
      if (cardUrl) {
        const keyEnv = row.a2a_api_key_env;
        const key = keyEnv ? process.env[keyEnv]?.trim() : undefined;
        const probe = await probeA2a(cardUrl, key, timeoutMs);
        const verdict: Verdict = probe.ok
          ? key
            ? "live_keyed"
            : "live_open"
          : probe.status && isAuthStatus(probe.status)
            ? "paywalled"
            : "dead";
        return {
          ...base,
          transport: "a2a",
          endpoint: row.a2a_endpoint ?? cardUrl,
          key_env: keyEnv,
          key_present: Boolean(key),
          verdict,
          abilities: probe.abilities,
          http_status: probe.status,
          detail: probe.detail,
          latency_ms: Date.now() - started,
        };
      }

      return base;
    },
    (done, total) => console.log(`  ${done}/${total}`),
  );

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CENSUS_PATH, `${JSON.stringify(rows, null, 2)}\n`);
  const tally: Record<string, number> = {};
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
  console.log(`\ncensus written to ${CENSUS_PATH}`);
  console.log(JSON.stringify(tally, null, 2));
}

/**
 * Stage 2: does a reachable agent hand back REAL WORK, not just a tool list?
 * Calls the server's own first read-only-looking tool with a concrete query and
 * records the returned text. Anything that errors or returns empty is not
 * counted as a delivery.
 */
const DELIVERY_QUERY =
  "Summarize what you can do for a software team in two sentences.";

const READ_ONLY_HINTS = [
  "search",
  "query",
  "get",
  "list",
  "read",
  "fetch",
  "ask",
  "docs",
  "lookup",
  "find",
  "describe",
  "info",
];

function pickDeliveryTool(abilities: string[]): string | null {
  const readOnly = abilities.find((name) =>
    READ_ONLY_HINTS.some((hint) => name.toLowerCase().includes(hint)),
  );
  return readOnly ?? null;
}

interface DeliveryRow {
  agent_id: string;
  tool: string;
  ok: boolean;
  chars?: number;
  excerpt?: string;
  error?: string;
}

async function deliverAll(): Promise<void> {
  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8")) as CensusRow[];
  const candidates = census.filter(
    (r) =>
      (r.verdict === "live_open" || r.verdict === "live_keyed") &&
      r.transport === "mcp" &&
      pickDeliveryTool(r.abilities),
  );
  const limit = Number(flag("limit") ?? candidates.length);
  const subset = candidates.slice(0, limit);
  console.log(`delivery-probing ${subset.length} reachable MCP agents`);

  const rows = await mapWithConcurrency(
    subset,
    Number(flag("concurrency") ?? 16),
    async (row): Promise<DeliveryRow> => {
      const tool = pickDeliveryTool(row.abilities)!;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      const key = row.key_env ? process.env[row.key_env]?.trim() : undefined;
      if (key) headers.authorization = `Bearer ${key}`;
      const init = withTimeout(30_000);
      try {
        // Handshake first: stateful servers reject a bare tools/call.
        const hs = await fetch(row.endpoint!, {
          method: "POST",
          headers,
          signal: init.signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "arbor-census", version: "1.0" },
            },
          }),
        });
        const sid = hs.headers.get("mcp-session-id");
        await readBodyWithTimeout(hs, 15_000).catch(() => "");
        if (sid) headers["mcp-session-id"] = sid;

        const res = await fetch(row.endpoint!, {
          method: "POST",
          headers,
          signal: init.signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: tool, arguments: { query: DELIVERY_QUERY } },
          }),
        });
        const text = await readBodyWithTimeout(res, 30_000);
        init.done();
        if (!res.ok) {
          return { agent_id: row.agent_id, tool, ok: false, error: `HTTP ${res.status}` };
        }
        const parsed = parseSseJson(text) as {
          result?: { isError?: boolean };
          error?: { message?: string };
        };
        if (parsed.error) {
          return {
            agent_id: row.agent_id,
            tool,
            ok: false,
            error: parsed.error.message?.slice(0, 140),
          };
        }
        const out = extractMcpText(parsed);
        if (!out || parsed.result?.isError) {
          return {
            agent_id: row.agent_id,
            tool,
            ok: false,
            error: out ? out.slice(0, 140) : "empty result",
          };
        }
        return {
          agent_id: row.agent_id,
          tool,
          ok: true,
          chars: out.length,
          excerpt: out.replace(/\s+/g, " ").slice(0, 220),
        };
      } catch (err) {
        init.done();
        return {
          agent_id: row.agent_id,
          tool,
          ok: false,
          error: (err as Error).message.slice(0, 140),
        };
      }
    },
    (done, total) => console.log(`  ${done}/${total}`),
  );

  writeFileSync(DELIVERY_PATH, `${JSON.stringify(rows, null, 2)}\n`);
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\ndelivery written to ${DELIVERY_PATH}`);
  console.log(`delivered real output: ${ok}/${rows.length}`);
}

/**
 * Second chance for endpoints recorded as dead.
 *
 * A registry row can be one path segment away from working: MCP servers are
 * published variously at `/`, `/mcp`, `/sse`, and `/api/mcp`, and some rows
 * carry a trailing slash the server rejects. Retrying those variants
 * separates "this vendor is gone" from "our stored URL was wrong", which are
 * very different problems for the operator.
 */
function urlVariants(endpoint: string): string[] {
  const trimmed = endpoint.replace(/\/+$/, "");
  const out = new Set<string>();
  const alreadyMcp = /\/(mcp|sse|api\/mcp)$/i.test(trimmed);
  if (!alreadyMcp) {
    out.add(`${trimmed}/mcp`);
    out.add(`${trimmed}/sse`);
    out.add(`${trimmed}/api/mcp`);
  } else {
    // Strip the suffix in case the base itself is the server.
    out.add(trimmed.replace(/\/(mcp|sse|api\/mcp)$/i, ""));
  }
  out.add(`${trimmed}/`);
  out.delete(trimmed);
  return [...out].filter((u) => u.length > 8);
}

async function repairDead(): Promise<void> {
  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8")) as CensusRow[];
  const dead = census.filter((r) => r.verdict === "dead" && r.endpoint);
  const limit = Number(flag("limit") ?? dead.length);
  const subset = dead.slice(0, limit);
  const timeoutMs = Number(flag("timeout") ?? 8_000);
  console.log(`repair-probing ${subset.length} dead endpoints across URL variants`);

  let recovered = 0;
  const updates = await mapWithConcurrency(
    subset,
    Number(flag("concurrency") ?? 20),
    async (row): Promise<CensusRow> => {
      for (const candidate of urlVariants(row.endpoint!)) {
        const key = row.key_env ? process.env[row.key_env]?.trim() : undefined;
        const probe = await probeMcp(candidate, key, timeoutMs);
        if (probe.ok) {
          recovered += 1;
          return {
            ...row,
            endpoint: candidate,
            verdict: key ? "live_keyed" : "live_open",
            abilities: probe.abilities,
            http_status: probe.status,
            detail: `recovered by URL repair from ${row.endpoint}`,
          };
        }
        if (probe.status && isAuthStatus(probe.status)) {
          return {
            ...row,
            endpoint: candidate,
            verdict: "paywalled",
            http_status: probe.status,
            detail: `URL repaired from ${row.endpoint}; server demands credentials`,
          };
        }
      }
      return row;
    },
    (done, total) => console.log(`  ${done}/${total}`),
  );

  const byId = new Map(updates.map((u) => [u.agent_id, u]));
  const merged = census.map((r) => byId.get(r.agent_id) ?? r);
  writeFileSync(CENSUS_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  const tally: Record<string, number> = {};
  for (const r of merged) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
  console.log(`\nrecovered ${recovered} previously-dead endpoints`);
  console.log(JSON.stringify(tally, null, 2));
}

/**
 * Probe the agents that live in the `agents` table but NOT in
 * discovered_specialists — the static registry and the MCP catalog.
 *
 * The first sweep only walked discovered_specialists and therefore missed 82
 * registered agents entirely, including several already proven in earlier
 * connector sessions. A census that silently omits rows is not a census, so
 * this closes the roster to a complete accounting.
 */
async function probeStatic(): Promise<void> {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
  const agents = (await client.query(api.agents.list, {})) as Array<{
    agent_id: string;
    display_name: string;
    sponsor: string;
  }>;
  const existing = JSON.parse(readFileSync(CENSUS_PATH, "utf8")) as CensusRow[];
  const known = new Set(existing.map((r) => r.agent_id));
  const missing = agents.filter((a) => !known.has(a.agent_id));
  console.log(`${missing.length} registered agents were never probed`);

  // Endpoints come from the static registry and the MCP catalog.
  const { getSpecialists } = await import("../lib/specialists/registry");
  const { MCP_CATALOG } = await import("../lib/specialists/catalog");
  const endpointById = new Map<
    string,
    { endpoint?: string; keyEnv?: string; tier?: string }
  >();
  for (const s of getSpecialists() as Array<Record<string, string>>) {
    endpointById.set(s.agent_id, {
      endpoint: s.mcp_endpoint ?? s.a2a_endpoint,
      keyEnv: s.mcp_api_key_env ?? s.a2a_api_key_env,
      tier: s.tier,
    });
  }
  for (const c of (MCP_CATALOG ?? []) as Array<Record<string, string>>) {
    if (!endpointById.has(c.agent_id)) {
      endpointById.set(c.agent_id, {
        endpoint: c.mcp_endpoint,
        keyEnv: c.mcp_api_key_env,
        tier: "mcp-forwarding",
      });
    }
  }

  const timeoutMs = Number(flag("timeout") ?? 10_000);
  const rows = await mapWithConcurrency(
    missing,
    Number(flag("concurrency") ?? 16),
    async (agent): Promise<CensusRow> => {
      const meta = endpointById.get(agent.agent_id);
      const base: CensusRow = {
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        sponsor: agent.sponsor,
        tier: meta?.tier,
        transport: "none",
        key_present: false,
        verdict: "no_transport",
        abilities: [],
      };
      if (HOUSE_AGENTS.has(agent.agent_id)) {
        return { ...base, verdict: "house", detail: "Arbor-owned model lane" };
      }
      if (!meta?.endpoint) {
        return {
          ...base,
          detail: "registered agent with no endpoint in registry or catalog",
        };
      }
      const key = meta.keyEnv ? process.env[meta.keyEnv]?.trim() : undefined;
      const probe = await probeMcp(meta.endpoint, key, timeoutMs);
      const verdict: Verdict = probe.ok
        ? key
          ? "live_keyed"
          : "live_open"
        : probe.status && isAuthStatus(probe.status)
          ? "paywalled"
          : "dead";
      return {
        ...base,
        transport: "mcp",
        endpoint: meta.endpoint,
        key_env: meta.keyEnv,
        key_present: Boolean(key),
        verdict,
        abilities: probe.abilities,
        http_status: probe.status,
        detail: probe.detail,
      };
    },
    (done, total) => console.log(`  ${done}/${total}`),
  );

  writeFileSync(CENSUS_PATH, `${JSON.stringify([...existing, ...rows], null, 2)}\n`);
  const tally: Record<string, number> = {};
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
  console.log(`\nadded ${rows.length} previously-unprobed agents`);
  console.log(JSON.stringify(tally, null, 2));
}

async function main(): Promise<void> {
  loadEnvLocal();
  const command = process.argv[2];
  if (command === "probe") await probeAll();
  else if (command === "static") await probeStatic();
  else if (command === "repair") await repairDead();
  else if (command === "deliver") await deliverAll();
  else {
    console.log("usage: roster-census <probe|deliver> [--limit N] [--concurrency N]");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
