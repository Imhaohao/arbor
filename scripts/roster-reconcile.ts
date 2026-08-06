// Complete roster reconciliation: every registered agent in exactly one bucket.
//
// Usage: npm run roster:reconcile
//
// The per-run proof files only know about the run that wrote them, so an
// agent proven in an earlier connector session looked "unaccounted" in the
// mass-run tally. This walks EVERY hive board in the deployment and derives
// participation from the stored rows themselves, then joins that against the
// census so the buckets sum exactly to the registered roster.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { looksLikeErrorText } from "../lib/hive/connector-core";
import { readOnlyAbilities } from "../lib/hive/census-roster";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "autoresearch/data");
const CENSUS_PATH = resolve(DATA_DIR, "roster-census.json");
const OUT_PATH = resolve(DATA_DIR, "roster-reconciliation.json");

function loadEnvLocal(): void {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].replace(/\s+#.*$/, "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

interface CensusRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  verdict: string;
  abilities: string[];
  endpoint?: string;
  http_status?: number;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");

  const agents = (await client.query(api.agents.list, {})) as Array<{
    agent_id: string;
    display_name: string;
    sponsor: string;
  }>;
  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8")) as CensusRow[];
  const censusById = new Map(census.map((r) => [r.agent_id, r]));

  const dagIds = (process.argv.slice(2).filter((a) => a.startsWith("qd"))) as string[];
  if (dagIds.length === 0) {
    throw new Error("pass hive dag ids as arguments (see hive_dags)");
  }

  // Participation, derived from the boards themselves.
  const messages = new Map<string, number>();
  const declaredOnly = new Set<string>();
  await mapWithConcurrency(dagIds, 8, async (dagId) => {
    const rows = (await client
      .query(api.scratchpad.forDag, { dag_id: dagId as never })
      .catch(() => [])) as Array<{ agent_id: string; content: string }>;
    for (const row of rows) {
      if (looksLikeErrorText(row.content)) continue;
      messages.set(row.agent_id, (messages.get(row.agent_id) ?? 0) + 1);
      if (row.content.includes("NO tool invoked")) declaredOnly.add(row.agent_id);
    }
  });

  const buckets = {
    delivered: [] as string[],
    declared_only: [] as string[],
    live_no_delivery: [] as string[],
    paywalled: [] as string[],
    dead: [] as string[],
    no_transport: [] as string[],
    house: [] as string[],
    unprobed: [] as string[],
  };

  for (const agent of agents) {
    const id = agent.agent_id;
    const spoke = (messages.get(id) ?? 0) > 0;
    const row = censusById.get(id);
    if (spoke && declaredOnly.has(id)) buckets.declared_only.push(id);
    else if (spoke) buckets.delivered.push(id);
    else if (!row) buckets.unprobed.push(id);
    else if (row.verdict === "house") buckets.house.push(id);
    else if (row.verdict === "paywalled") buckets.paywalled.push(id);
    else if (row.verdict === "dead") buckets.dead.push(id);
    else if (row.verdict === "no_transport") buckets.no_transport.push(id);
    else buckets.live_no_delivery.push(id);
  }

  const total = Object.values(buckets).reduce((a, b) => a + b.length, 0);
  const cooperated = [...messages.entries()].filter(([, n]) => n >= 2).length;

  // Why the live-but-silent agents stayed silent, from the census itself.
  const mutatingOnly = buckets.live_no_delivery.filter((id) => {
    const row = censusById.get(id);
    return row ? readOnlyAbilities(row.abilities).length === 0 : false;
  }).length;

  const summary = {
    registered_agents: agents.length,
    reconciled_total: total,
    balanced: total === agents.length,
    cooperated_2plus_rounds: cooperated,
    buckets: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, v.length]),
    ),
    live_no_delivery_detail: {
      mutating_tools_only_not_called: mutatingOnly,
      call_failed_or_empty: buckets.live_no_delivery.length - mutatingOnly,
    },
  };

  writeFileSync(OUT_PATH, `${JSON.stringify({ summary, buckets }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwritten to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
