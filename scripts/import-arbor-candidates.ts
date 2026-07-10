import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const SOURCE_PATH = join(
  process.cwd(),
  "research/agent-corpus/arbor-candidate-records.json",
);
const CHECKPOINT_PATH = join(
  process.cwd(),
  "research/agent-corpus/arbor-candidate-import-progress.json",
);
const RETRY_DELAYS_MS = [500, 1_500, 4_000];
const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

type Tier =
  | "real"
  | "mcp-forwarding"
  | "a2a"
  | "a2a-bridge"
  | "openrouter"
  | "mock"
  | "disabled";

type DiscoverySource =
  | "google"
  | "catalog"
  | "registry"
  | "synthesized"
  | "a2a";

interface Candidate {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  tier?: Tier;
  discovered_for: string;
  discovery_source?: DiscoverySource;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  homepage_url?: string;
  rationale?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  a2a_auth_mode?: "none" | "card";
}

interface CandidateFile {
  generated: string;
  total: number;
  records: Candidate[];
}

interface Failure {
  agent_id: string;
  error: string;
}

interface Checkpoint {
  source_generated: string;
  started_at: string;
  updated_at: string;
  completed_agent_ids: string[];
  created: number;
  updated: number;
  failures: Failure[];
}

interface DiscoveredRow {
  agent_id: string;
}

interface AgentRow {
  agent_id: string;
}

function resolveConvexUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const match = line.match(
        /^\s*NEXT_PUBLIC_CONVEX_URL\s*=\s*(.*)\s*$/,
      );
      if (!match) continue;
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).trim();
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      if (value) return value;
    }
  } catch {
    // Fall through to the actionable error below.
  }

  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set and is missing from .env.local",
  );
}

function concurrencyFromArgs(): number {
  const arg = process.argv.find((value) => value.startsWith("--concurrency="));
  const parsed = Number(arg?.split("=")[1] ?? 8);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new Error("--concurrency must be an integer between 1 and 20");
  }
  return parsed;
}

function loadCandidates(): CandidateFile {
  const parsed = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as CandidateFile;
  if (!Array.isArray(parsed.records) || parsed.records.length !== parsed.total) {
    throw new Error("Candidate file total does not match records length");
  }

  const ids = new Set<string>();
  for (const candidate of parsed.records) {
    if (!AGENT_ID_RE.test(candidate.agent_id)) {
      throw new Error(`Invalid agent_id: ${candidate.agent_id}`);
    }
    if (ids.has(candidate.agent_id)) {
      throw new Error(`Duplicate agent_id: ${candidate.agent_id}`);
    }
    if (
      candidate.capabilities.length === 0 ||
      candidate.cost_baseline <= 0
    ) {
      throw new Error(`Invalid candidate fields: ${candidate.agent_id}`);
    }
    ids.add(candidate.agent_id);
  }
  return parsed;
}

function loadCheckpoint(sourceGenerated: string): Checkpoint {
  if (existsSync(CHECKPOINT_PATH)) {
    const checkpoint = JSON.parse(
      readFileSync(CHECKPOINT_PATH, "utf8"),
    ) as Checkpoint;
    if (checkpoint.source_generated === sourceGenerated) return checkpoint;
  }

  const now = new Date().toISOString();
  return {
    source_generated: sourceGenerated,
    started_at: now,
    updated_at: now,
    completed_agent_ids: [],
    created: 0,
    updated: 0,
    failures: [],
  };
}

function writeCheckpoint(checkpoint: Checkpoint): void {
  checkpoint.updated_at = new Date().toISOString();
  const temporaryPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  renameSync(temporaryPath, CHECKPOINT_PATH);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertWithRetry(
  client: ConvexHttpClient,
  candidate: Candidate,
): Promise<{ updated: boolean }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await client.mutation(api.discoveredSpecialists.upsert, candidate);
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const source = loadCandidates();
  const concurrency = concurrencyFromArgs();
  const convexUrl = resolveConvexUrl();
  const client = new ConvexHttpClient(convexUrl);
  const checkpoint = loadCheckpoint(source.generated);
  const completed = new Set(checkpoint.completed_agent_ids);
  const worklist = source.records.filter(
    (candidate) => !completed.has(candidate.agent_id),
  );

  console.log(
    `Importing ${source.records.length} Arbor candidates (${worklist.length} remaining, concurrency ${concurrency})`,
  );

  let cursor = 0;
  let settled = completed.size;
  const failures: Failure[] = [];

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const candidate = worklist[index];
      if (!candidate) return;

      try {
        const result = await upsertWithRetry(client, candidate);
        completed.add(candidate.agent_id);
        checkpoint.completed_agent_ids.push(candidate.agent_id);
        if (result.updated) checkpoint.updated += 1;
        else checkpoint.created += 1;
      } catch (error) {
        failures.push({
          agent_id: candidate.agent_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      settled += 1;
      if (settled % 25 === 0 || settled === source.records.length) {
        checkpoint.failures = failures;
        writeCheckpoint(checkpoint);
      }
      if (settled % 50 === 0 || settled === source.records.length) {
        console.log(
          `  ${settled}/${source.records.length} processed, ${completed.size} succeeded, ${failures.length} failed`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, worklist.length) }, () =>
      worker(),
    ),
  );
  checkpoint.failures = failures;
  writeCheckpoint(checkpoint);

  const [discoveredRows, agentRows] = await Promise.all([
    client.query(api.discoveredSpecialists.list, {}) as Promise<
      DiscoveredRow[]
    >,
    client.query(api.agents.list, {}) as Promise<AgentRow[]>,
  ]);
  const candidateIds = new Set(source.records.map((row) => row.agent_id));
  const discoveredCount = discoveredRows.filter((row) =>
    candidateIds.has(row.agent_id),
  ).length;
  const mirroredCount = agentRows.filter((row) =>
    candidateIds.has(row.agent_id),
  ).length;

  console.log("Summary");
  console.log(`  checkpoint created: ${checkpoint.created}`);
  console.log(`  checkpoint updated: ${checkpoint.updated}`);
  console.log(`  failures:         ${failures.length}`);
  console.log(`  discovered rows:  ${discoveredCount}/${source.records.length}`);
  console.log(`  mirrored agents:  ${mirroredCount}/${source.records.length}`);

  if (
    failures.length > 0 ||
    discoveredCount !== source.records.length ||
    mirroredCount !== source.records.length
  ) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
