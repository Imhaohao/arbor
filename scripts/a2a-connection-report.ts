import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    if (process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function convexUrl(): string {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));
  const value = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return value;
}

function isA2aRow(row: { transport: string; agent_id: string }): boolean {
  const transport = row.transport.toLowerCase();
  return (
    transport === "a2a" ||
    transport === "a2a-bridge" ||
    row.agent_id.toLowerCase().includes("a2a")
  );
}

async function main(): Promise<void> {
  const client = new ConvexHttpClient(convexUrl());
  const latest = await client.query(api.agentReadiness.latestCompleteRun, {});
  if (!latest) {
    console.log(JSON.stringify({ ok: false, reason: "no completed smoke run" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const results = await client.query(api.agentReadiness.resultsForRun, {
    run_id: latest.run_id,
  });
  const a2a = results.filter(isA2aRow).sort((a, b) =>
    a.agent_id.localeCompare(b.agent_id),
  );
  const rows = a2a.map((row) => {
    const evidence = row.evidence?.trim() ?? "";
    const verifiable_response =
      row.transport_status === "ready" &&
      row.probe_status === "pass" &&
      evidence.length > 0;
    return {
      agent_id: row.agent_id,
      owner: row.owner,
      source: row.source,
      transport: row.transport,
      endpoint: row.endpoint,
      readiness_status: row.readiness_status,
      transport_status: row.transport_status,
      probe_status: row.probe_status,
      bid_status: row.bid_status,
      execution_status: row.execution_status,
      verifiable_response,
      evidence: evidence.slice(0, 300),
      error_message: row.error_message?.slice(0, 500),
      duration_ms: row.duration_ms,
    };
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.verifiable_response) acc.verifiable += 1;
      else acc.not_verifiable += 1;
      acc.by_status[row.readiness_status] =
        (acc.by_status[row.readiness_status] ?? 0) + 1;
      return acc;
    },
    {
      total: 0,
      verifiable: 0,
      not_verifiable: 0,
      by_status: {} as Record<string, number>,
    },
  );

  console.log(
    JSON.stringify(
      {
        ok: summary.not_verifiable === 0,
        run_id: latest.run_id,
        run_completed_at: latest.completed_at,
        summary,
        rows,
      },
      null,
      2,
    ),
  );
  if (summary.not_verifiable > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
