import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const POLL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const TERMINAL = new Set(["complete", "disputed", "failed"]);

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function convexUrl(): string {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function pass(label: string, ok: boolean, detail?: string): boolean {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
  return ok;
}

async function main(): Promise<void> {
  const client = new ConvexHttpClient(convexUrl());
  const posted = await client.mutation(api.tasks.post, {
    posted_by: "hive-multi-e2e",
    prompt: [
      "Complete this work as a dependency-aware multi-agent project:",
      "1. Ask the Hello World external A2A specialist for a read-only acknowledgement containing the exact token ARBOR-A2A-ALPHA.",
      "2. Independently ask the Marginalia external A2A specialist for a read-only acknowledgement containing the exact token ARBOR-A2A-BETA.",
      "3. After both worksteps finish, combine their outputs into a concise interoperability report that contains both exact tokens.",
      "This is read-only: do not publish, purchase, transfer, charge, or mutate external state.",
      "The final report must explicitly quote or summarize evidence from both independent A2A worksteps and preserve both tokens.",
    ].join("\n"),
    // Discovered A2A specialists currently advertise a $3 baseline. Keep each
    // planned node above that floor so semantic routing can invite the live
    // workers instead of excluding them before the auction.
    max_budget: 20,
    workflow_mode: "hive",
  });
  const taskId = posted.task_id as Id<"tasks">;
  console.log(`hive-multi-e2e: posted ${taskId}`);

  const configuredTimeout = Number(
    process.env.HIVE_MULTI_E2E_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let task = await client.query(api.tasks.get, { task_id: taskId });
  while (task && !TERMINAL.has(task.status) && Date.now() < deadline) {
    await sleep(POLL_MS);
    task = await client.query(api.tasks.get, { task_id: taskId });
    console.log(`hive-multi-e2e: status=${task?.status ?? "missing"}`);
  }

  const lifecycle = await client.query(api.lifecycle.forTask, {
    task_id: taskId,
  });
  const dag = await client.query(api.hiveData.dagForRootTask, {
    task_id: taskId,
  });
  const nodes = dag
    ? await client.query(api.hiveData.nodesForDag, { dag_id: dag._id })
    : [];
  const scratchpad = dag
    ? await client.query(api.scratchpad.forDag, { dag_id: dag._id })
    : [];
  const discovered = await client.query(api.discoveredSpecialists.list, {});
  const events = lifecycle.map((event) => event.event_type);
  const entryNodes = nodes.filter((node) => node.depends_on.length === 0);
  const dependentNodes = nodes.filter((node) => node.depends_on.length > 0);
  const workerIds = new Set(
    nodes
      .map((node) => node.assigned_agent_id)
      .filter((agentId): agentId is string => Boolean(agentId)),
  );
  const materialNodes = nodes.filter(
    (node) => typeof node.output_text === "string" && node.output_text.trim(),
  );
  const a2aAgentIds = new Set(
    discovered
      .filter((row) => Boolean(row.a2a_endpoint))
      .map((row) => row.agent_id),
  );
  const externalA2aWorkers = new Set(
    Array.from(workerIds).filter((agentId) => a2aAgentIds.has(agentId)),
  );
  const assertions = [
    pass(
      "root task reached terminal status",
      Boolean(task && TERMINAL.has(task.status)),
    ),
    pass(
      "root task completed successfully",
      task?.status === "complete",
      `status=${task?.status ?? "missing"}`,
    ),
    pass("planner produced at least three nodes", nodes.length >= 3, `nodes=${nodes.length}`),
    pass(
      "DAG has at least two parallel entry worksteps",
      entryNodes.length >= 2,
      `entry_nodes=${entryNodes.length}`,
    ),
    pass(
      "DAG has a dependency-gated workstep",
      dependentNodes.length >= 1,
      `dependent_nodes=${dependentNodes.length}`,
    ),
    pass(
      "all worksteps completed",
      nodes.length >= 3 && nodes.every((node) => node.status === "complete"),
      nodes.map((node) => `${node.node_id}:${node.status}`).join(","),
    ),
    pass(
      "at least two distinct agents executed worksteps",
      workerIds.size >= 2,
      `agents=${Array.from(workerIds).join(",") || "none"}`,
    ),
    pass(
      "at least two distinct external A2A agents executed worksteps",
      externalA2aWorkers.size >= 2,
      `a2a_agents=${Array.from(externalA2aWorkers).join(",") || "none"}`,
    ),
    pass(
      "every workstep produced material output",
      materialNodes.length === nodes.length && nodes.length >= 3,
      `material=${materialNodes.length}/${nodes.length}`,
    ),
    pass(
      "every node was routed",
      events.filter((event) => event === "hive_node_routed").length >= nodes.length,
    ),
    pass(
      "every node settled",
      events.filter((event) => event === "hive_node_settled").length >= nodes.length,
    ),
    pass("DAG evaluator ran", events.includes("hive_evaluated")),
    pass(
      "shared scratchpad contains cross-workstep state",
      scratchpad.length >= nodes.length + 2,
      `entries=${scratchpad.length}`,
    ),
    pass(
      "root synthesis is non-empty",
      typeof task?.result === "object" &&
        task.result !== null &&
        "text" in task.result &&
        typeof task.result.text === "string" &&
        task.result.text.trim().length > 0,
    ),
  ];

  const passed = assertions.filter(Boolean).length;
  console.log(
    `hive-multi-e2e: ${passed}/${assertions.length} assertions passed ` +
      `(status=${task?.status ?? "missing"}, nodes=${nodes.length}, agents=${workerIds.size})`,
  );
  process.exit(passed === assertions.length ? 0 : 1);
}

main().catch((err) => {
  console.error(
    "hive-multi-e2e failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
