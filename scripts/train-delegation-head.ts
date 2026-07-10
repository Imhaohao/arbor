import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { ROUTER_TASKS } from "../eval/router-bench/tasks";
import { POOL } from "../eval/router-bench/strategies";
import {
  trainDelegationHead,
  type DelegationTrainingExample,
} from "../lib/hive/delegation-head-core";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputPath = resolve(
  arg("output") ?? "lib/hive/delegation-head-model.json",
);
const dataPath = arg("data");

function proxyTrainingExamples(): DelegationTrainingExample[] {
  const agentIds = POOL.map((entry) => entry.agent_id);
  return ROUTER_TASKS.map((task) => {
    const gold = new Set(task.gold_specialist_ids);
    return {
      query: task.goal,
      worker_rewards: Object.fromEntries(
        agentIds.map((agentId) => [agentId, gold.has(agentId) ? 1 : 0]),
      ),
    };
  });
}

async function loadTrainingExamples(): Promise<{
  examples: DelegationTrainingExample[];
  source: string;
}> {
  if (!dataPath) {
    return {
      examples: proxyTrainingExamples(),
      source: "router-bench-curated-gold-proxy",
    };
  }
  const raw = await readFile(resolve(dataPath), "utf8");
  const parsed = raw.trim().startsWith("[")
    ? JSON.parse(raw)
    : raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  if (!Array.isArray(parsed)) throw new Error("delegation data must be JSON/JSONL");
  const examples = parsed.filter(
    (item): item is DelegationTrainingExample =>
      item !== null &&
      typeof item === "object" &&
      typeof item.query === "string" &&
      item.worker_rewards !== null &&
      typeof item.worker_rewards === "object",
  );
  if (examples.length !== parsed.length || examples.length === 0) {
    throw new Error("every row needs query and worker_rewards");
  }
  return { examples, source: `external:${basename(dataPath)}` };
}

async function main(): Promise<void> {
  const { examples, source } = await loadTrainingExamples();
  const model = trainDelegationHead(examples, { trainingSource: source });
  await writeFile(outputPath, `${JSON.stringify(model)}\n`, "utf8");
  console.log(
    JSON.stringify({
      output: outputPath,
      training_examples: model.training_examples,
      training_source: model.training_source,
      learned_agents: Object.keys(model.agents).length,
      parameters: Object.values(model.agents).reduce(
        (sum, agent) => sum + agent.centroid.length,
        0,
      ),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
