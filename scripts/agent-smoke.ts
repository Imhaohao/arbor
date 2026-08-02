import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || line.trim().startsWith("#")) continue;
    if (process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function convexUrl(): string {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));
  const value = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return value;
}

function runId(): string {
  return (
    argValue("--run-id") ??
    `agent-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const mode = process.argv.includes("--probe-only") ? "probe" : "full";
  const requestedBatch = Number(argValue("--batch-size") ?? "6");
  const batchSize = Number.isFinite(requestedBatch)
    ? Math.min(8, Math.max(1, Math.trunc(requestedBatch)))
    : 6;
  const run_id = runId();
  const agentId = argValue("--agent-id");
  const client = new ConvexHttpClient(convexUrl());
  const started = await client.mutation(api.agentReadiness.startSmokeRun, {
    run_id,
    mode,
  });
  if (!json) {
    console.log(
      `agent-smoke: run=${run_id} mode=${mode} total=${
        started.total_agents > 0 ? started.total_agents : "discovering"
      } batch=${batchSize}${agentId ? ` agent=${agentId}` : ""}`,
    );
  }

  let cursor = 0;
  for (;;) {
    const batch = await client.action(api.agentReadinessActions.runSmokeBatch, {
      run_id,
      cursor,
      batch_size: batchSize,
      agent_id: agentId,
    });
    cursor += batch.processed;
    if (!json) {
      console.log(
        `agent-smoke: ${cursor}/${batch.total} ${JSON.stringify(batch.by_readiness)}`,
      );
    }
    if (batch.next_cursor === null) break;
    cursor = batch.next_cursor;
  }

  const [summary, results] = await Promise.all([
    client.query(api.agentReadiness.runSummary, { run_id }),
    client.query(api.agentReadiness.resultsForRun, { run_id }),
  ]);
  const scratchpadEntries = summary.run?.scratchpad_dag_id
    ? await client.query(api.scratchpad.forDag, {
        dag_id: summary.run.scratchpad_dag_id as Id<"hive_dags">,
        namespace: "readiness-smoke",
      })
    : [];
  const expectedScratchpadEntries = results.filter(
    (row) => row.scratchpad_status === "pass",
  ).length;
  const slowest = [...results]
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 10)
    .map((row) => ({
      agent_id: row.agent_id,
      duration_ms: row.duration_ms,
      failure_bucket: row.failure_bucket,
    }));
  const output = {
    run_id,
    mode,
    run: summary.run,
    by_readiness: summary.by_readiness,
    by_failure: summary.by_failure,
    scratchpad: {
      expected: expectedScratchpadEntries,
      persisted: scratchpadEntries.length,
    },
    slowest,
  };
  console.log(json ? JSON.stringify(output) : JSON.stringify(output, null, 2));
  if (!summary.run || summary.run.processed_agents !== summary.run.total_agents) {
    process.exitCode = 1;
  }
  if (scratchpadEntries.length !== expectedScratchpadEntries) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("agent-smoke failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
