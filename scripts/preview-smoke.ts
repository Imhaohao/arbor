import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  PUBLIC_DEMO_AGENT_ID,
  PUBLIC_DEMO_SMOKE_BUDGET,
  PUBLIC_DEMO_SMOKE_POSTED_BY,
  PUBLIC_DEMO_SMOKE_PROMPT,
} from "../lib/public-demo";

const TERMINAL = new Set(["complete", "disputed", "failed"]);

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  assert.ok(url, "NEXT_PUBLIC_CONVEX_URL is required");
  const client = new ConvexHttpClient(url);

  const posted = await client.mutation(api.tasks.post, {
    posted_by: PUBLIC_DEMO_SMOKE_POSTED_BY,
    prompt: PUBLIC_DEMO_SMOKE_PROMPT,
    max_budget: PUBLIC_DEMO_SMOKE_BUDGET,
    workflow_mode: "hive",
  });
  const taskId = posted.task_id as Id<"tasks">;
  console.log(`preview-smoke: task=${taskId}`);

  const deadline = Date.now() + 5 * 60_000;
  let lastStatus = "";
  let task = await client.query(api.tasks.get, { task_id: taskId });
  while (task && !TERMINAL.has(task.status) && Date.now() < deadline) {
    if (task.status !== lastStatus) {
      lastStatus = task.status;
      console.log(`preview-smoke: status=${lastStatus}`);
    }
    await sleep(2_000);
    task = await client.query(api.tasks.get, { task_id: taskId });
  }

  assert.ok(task, "smoke task disappeared");
  assert.equal(task.status, "complete");
  const result = task.result as {
    text?: string;
    agent_id?: string;
    provenance?: {
      live_tools_called?: boolean;
      transport?: string;
      proof_level?: string;
    };
  };
  assert.ok(
    result.agent_id === "hive-evaluator" || result.agent_id === PUBLIC_DEMO_AGENT_ID,
    `unexpected root delivery agent ${result.agent_id ?? "missing"}`,
  );
  assert.match(result.text ?? "", /Arbor preview smoke test passed safely\./);

  const lifecycle = await client.query(api.lifecycle.forTask, { task_id: taskId });
  const events = lifecycle.map((event) => event.event_type);
  for (const required of [
    "hive_plan_decided",
    "hive_node_routed",
    "hive_node_settled",
    "hive_evaluated",
  ]) {
    assert.ok(events.includes(required), `missing lifecycle event ${required}`);
  }

  const dag = await client.query(api.hiveData.dagForRootTask, { task_id: taskId });
  assert.ok(dag, "smoke task has no Hive DAG");
  const nodes = await client.query(api.hiveData.nodesForDag, { dag_id: dag._id });
  assert.ok(nodes.length > 0, "smoke DAG has no nodes");
  assert.ok(nodes.every((node) => node.status === "complete"));
  assert.ok(nodes.every((node) => node.assigned_agent_id === PUBLIC_DEMO_AGENT_ID));

  for (const node of nodes) {
    assert.ok(node.task_id, `node ${node.node_id} has no child task`);
    const child = await client.query(api.tasks.get, { task_id: node.task_id });
    assert.ok(child, `node ${node.node_id} child task is missing`);
    const childResult = child.result as {
      agent_id?: string;
      provenance?: {
        live_tools_called?: boolean;
        transport?: string;
        proof_level?: string;
      };
    };
    assert.equal(childResult.agent_id, PUBLIC_DEMO_AGENT_ID);
    assert.equal(childResult.provenance?.live_tools_called, false);
    assert.equal(childResult.provenance?.transport, "mock");
    assert.equal(childResult.provenance?.proof_level, "none");
    const escrow = await client.query(api.escrow.forTask, { task_id: node.task_id });
    assert.ok(escrow, `node ${node.node_id} has no simulated escrow record`);
    assert.equal(escrow.status, "released");
    assert.equal(escrow.payment_processor, undefined);
    assert.equal(escrow.payment_status, undefined);
  }

  console.log(
    `preview-smoke: passed (${nodes.length} node, deterministic demo agent, simulated escrow only, no external tools or real-money payment)`,
  );
}

main().catch((error) => {
  console.error("preview-smoke failed:", error);
  process.exit(1);
});
