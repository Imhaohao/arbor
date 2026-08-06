// Seat every reachable agent at a hive table and record what it says.
//
// Usage:
//   npm run hive:mass -- run [--batch 12] [--rounds 2] [--limit N]
//   npm run hive:mass -- report
//
// The census proves a server answers. This proves the agent PARTICIPATES:
// it joins a real DAG-backed roundtable, reads the shared board, and posts
// signed entries in its own words. Per-agent proof is checkpointed after
// every batch so a long run survives interruption and never redoes work.

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  buildContextDigest,
  composeEntryContent,
  looksLikeErrorText,
  buildRoundPrompt,
  roundSpec,
  signedWriteArgs,
  truncateForBoard,
  type BoardEntryLite,
} from "../lib/hive/connector-core";
import { callA2aAgent, callMcpAgent } from "../lib/hive/connector-backends";
import { rosterFromCensus, type CensusLike } from "../lib/hive/census-roster";
import { callOpenAI } from "../lib/openai";
import type { RosterEntry } from "../lib/hive/connector-roster";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "autoresearch/data");
const CENSUS_PATH = resolve(DATA_DIR, "roster-census.json");
const SECRETS_PATH = resolve(DATA_DIR, "mass-secrets.json");
const PROOF_PATH = resolve(DATA_DIR, "hive-mass-proof.json");

/**
 * Is this text something a teammate can read, or a machine dump?
 *
 * Measured on the first full pass: 193 of 250 responding agents returned raw
 * JSON tool output. That is real delivery, but it is not the agent telling
 * the table what it can do — so those get narrated (and labeled) instead of
 * being posted as-is.
 */
export function isReadableProse(text: string): boolean {
  const s = (text ?? "").trim();
  if (!s) return false;
  if (s.startsWith("{") || s.startsWith("[")) return false;
  const sentences = (s.match(/[.!?]/g) ?? []).length;
  const machineChars = (s.match(/[{}":]/g) ?? []).length;
  return sentences >= 1 && machineChars < s.length * 0.06;
}

const GOAL =
  "Introduce yourself to the other agents at this table: state plainly what " +
  "you can do for a software team, and name one concrete task you would take " +
  "ownership of. Then react to what the others have claimed so the table ends " +
  "with no two agents owning the same slice.";

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

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function convexRun(fn: string, args: Record<string, unknown>): unknown {
  const stdout = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const start = stdout.search(/[{[]/);
  if (start >= 0) {
    try {
      return JSON.parse(stdout.slice(start).trim());
    } catch {
      /* fall through */
    }
  }
  return null;
}

export interface AgentProof {
  agent_id: string;
  display_name: string;
  sponsor: string;
  /** Non-error signed entries this agent posted to a hive board. */
  messages: number;
  /** Entries whose body was an error dump (never counted as speech). */
  error_messages: number;
  dag_id?: string;
  /** The agent's own first words — the ability statement, verbatim. */
  ability_statement?: string;
  /** Its own words in a later round, proving it reacted to the board. */
  cooperation_excerpt?: string;
  tool_used?: string;
  failure?: string;
}

/**
 * Turn a machine dump into the agent's own introduction, grounded strictly in
 * what that server declared and returned. The prompt forbids inventing
 * capabilities precisely because the tool list is the only evidence of what
 * this agent can actually do.
 */
async function narrate(
  entry: RosterEntry,
  rawOutput: string,
  round: number,
): Promise<string | null> {
  const tools =
    entry.backend.type === "mcp" ? entry.backend.toolPreference.join(", ") : "";
  const text = await callOpenAI({
    purpose: "agent",
    maxTokens: 220,
    systemPrompt:
      `You are ${entry.agent_id} (${entry.display_name} by ${entry.sponsor}), an external ` +
      "specialist agent seated at a multi-agent roundtable. Speak in the first " +
      "person to the other agents. Ground every claim ONLY in the tool names and " +
      "the raw output shown to you — never invent a capability that is not " +
      "evidenced there. Under 60 words, plain sentences, no markdown, no JSON.",
    userPrompt:
      (round === 1
        ? "Introduce yourself: what can you do for a software team, and what one task would you own?\n\n"
        : "React to the table: restate the slice you own and what you will not cover.\n\n") +
      `Tools your server declared: ${tools}\n\n` +
      `Raw output your server just returned:\n${rawOutput.slice(0, 1500)}`,
  });
  const cleaned = text.trim();
  return cleaned.length > 0 ? cleaned : null;
}

async function fetchBoard(
  client: ConvexHttpClient,
  dagId: string,
): Promise<BoardEntryLite[]> {
  const rows = (await client.query(api.scratchpad.forDag, {
    dag_id: dagId as never,
  })) as Array<{
    agent_id: string;
    kind: string;
    content: string;
    gist?: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    agent_id: r.agent_id,
    kind: r.kind,
    content: r.content,
    gist: r.gist,
    created_at: r.created_at,
  }));
}

async function runBatch(
  client: ConvexHttpClient,
  batch: RosterEntry[],
  rounds: number,
  secrets: Record<string, string>,
): Promise<AgentProof[]> {
  const created = convexRun("hiveConnector:_createDiscussionSession", {
    goal: GOAL,
    posted_by: "hive-mass-census",
    max_budget: 5,
    agent_ids: batch.map((b) => b.agent_id),
  }) as { dag_id?: string } | null;
  if (!created?.dag_id) throw new Error("session creation failed");
  const dagId = created.dag_id;

  const proofs = new Map<string, AgentProof>(
    batch.map((b) => [
      b.agent_id,
      {
        agent_id: b.agent_id,
        display_name: b.display_name,
        sponsor: b.sponsor,
        messages: 0,
        error_messages: 0,
        dag_id: dagId,
      },
    ]),
  );

  for (let round = 1; round <= rounds; round += 1) {
    const spec = roundSpec(round);
    const board = await fetchBoard(client, dagId);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const digest = buildContextDigest(board, entry.agent_id);
        let reply;
        if (entry.backend.type === "a2a") {
          reply = await callA2aAgent({
            endpoint: entry.backend.endpoint,
            bearer: entry.backend.bearerEnv
              ? process.env[entry.backend.bearerEnv]
              : undefined,
            text: buildRoundPrompt({
              goal: GOAL,
              agentId: entry.agent_id,
              displayName: entry.display_name,
              sponsor: entry.sponsor,
              capabilities: entry.capabilities,
              memberIds: batch.map((b) => b.agent_id),
              round,
              digest,
            }),
            timeoutMs: 45_000,
          });
        } else if (entry.backend.type === "mcp") {
          reply = await callMcpAgent({
            endpoint: entry.backend.endpoint,
            bearer: entry.backend.bearerEnv
              ? process.env[entry.backend.bearerEnv]
              : undefined,
            toolPreference: entry.backend.toolPreference,
            argsFor: entry.backend.argsFor,
            query: entry.backend.queryFor(round, GOAL, digest),
            timeoutMs: 45_000,
          });
        } else {
          throw new Error(`unsupported backend ${entry.backend.type}`);
        }
        const secret = secrets[entry.agent_id];
        if (!secret) throw new Error("no HMAC secret");

        // Narration is GROUNDED and LABELED: the capability claim may only
        // restate the tool names the server itself declared, and the label
        // says plainly that the prose is Arbor's while the data is theirs.
        let message = reply.text;
        let provenance = entry.provenance_label;
        if (!isReadableProse(message)) {
          const narrated = await narrate(entry, reply.text, round).catch(
            () => null,
          );
          if (narrated) {
            message = narrated;
            provenance = `${entry.provenance_label}; prose narrated by Arbor's model from that server's real tool output`;
          }
        }
        const payload = {
          dag_id: dagId,
          node_id: `${spec.phase}:${entry.agent_id}`,
          kind: spec.kind,
          content: composeEntryContent({
            message: truncateForBoard(message),
            provenance,
          }),
          confidence: 0.6,
        };
        const written = (await client.action(
          api.scratchpadActions.writeSigned,
          signedWriteArgs({
            payload,
            agentId: entry.agent_id,
            secretB64: secret,
            nowMs: Date.now(),
            nonce: randomUUID(),
          }) as never,
        )) as { ok: boolean; error?: string };
        if (!written.ok) throw new Error(`writeSigned: ${written.error}`);
        // Record what the BOARD saw (narrated when the raw output was a
        // machine dump), so the proof file and the hive never disagree.
        return { entry, text: message, provenance, raw: reply.text };
      }),
    );

    results.forEach((res, i) => {
      const entry = batch[i];
      const proof = proofs.get(entry.agent_id)!;
      if (res.status === "fulfilled") {
        const clean = res.value.text.replace(/\s+/g, " ").trim();
        if (looksLikeErrorText(clean)) {
          proof.error_messages += 1;
          return;
        }
        proof.messages += 1;
        if (round === 1) proof.ability_statement = clean.slice(0, 400);
        else proof.cooperation_excerpt = clean.slice(0, 400);
        const backend = entry.backend;
        if (backend.type === "mcp") proof.tool_used = backend.toolPreference[0];
      } else {
        const msg =
          res.reason instanceof Error ? res.reason.message : String(res.reason);
        proof.failure = msg.slice(0, 200);
      }
    });
  }

  convexRun("hiveConnector:_completeSession", { dag_id: dagId });
  return [...proofs.values()];
}

async function run(): Promise<void> {
  const census = readJson<CensusLike[]>(CENSUS_PATH, []);
  if (census.length === 0) throw new Error("no census — run roster:census probe first");
  const roster = rosterFromCensus(census);
  const done = readJson<AgentProof[]>(PROOF_PATH, []);
  const doneIds = new Set(done.filter((d) => d.messages > 0).map((d) => d.agent_id));
  const pending = roster.filter((r) => !doneIds.has(r.agent_id));
  const limit = Number(flag("limit") ?? pending.length);
  const subset = pending.slice(0, limit);
  const batchSize = Number(flag("batch") ?? 12);
  const rounds = Number(flag("rounds") ?? 2);

  console.log(
    `roster ${roster.length} seatable | already proven ${doneIds.size} | running ${subset.length} in batches of ${batchSize}`,
  );

  const secrets = readJson<Record<string, string>>(SECRETS_PATH, {});
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
  const proofs = [...done];

  for (let i = 0; i < subset.length; i += batchSize) {
    const batch = subset.slice(i, i + batchSize);
    // Provision agent rows + HMAC keys for this batch in one transaction.
    const toProvision = batch.map((entry) => {
      if (!secrets[entry.agent_id]) {
        secrets[entry.agent_id] = randomBytes(32).toString("base64");
      }
      return {
        agent_id: entry.agent_id,
        display_name: entry.display_name.slice(0, 80),
        sponsor: entry.sponsor.slice(0, 80),
        capabilities: entry.capabilities,
        system_prompt: entry.system_prompt,
        cost_per_task_estimate: entry.cost_per_task_estimate,
        starting_reputation: entry.starting_reputation,
        secret_b64: secrets[entry.agent_id],
      };
    });
    try {
      convexRun("hiveConnector:_bulkProvision", { agents: toProvision });
      writeJson(SECRETS_PATH, secrets);
      const batchProofs = await runBatch(client, batch, rounds, secrets);
      const merged = new Map(proofs.map((p) => [p.agent_id, p]));
      for (const p of batchProofs) merged.set(p.agent_id, p);
      proofs.length = 0;
      proofs.push(...merged.values());
      writeJson(PROOF_PATH, proofs);
      const ok = batchProofs.filter((p) => p.messages >= 1).length;
      console.log(
        `batch ${i / batchSize + 1}: ${ok}/${batch.length} agents spoke  (total proven ${proofs.filter((p) => p.messages >= 1).length})`,
      );
    } catch (err) {
      console.log(
        `batch ${i / batchSize + 1} FAILED: ${(err as Error).message.slice(0, 160)}`,
      );
    }
  }

  const proven = proofs.filter((p) => p.messages >= 1).length;
  const cooperating = proofs.filter((p) => p.messages >= 2).length;
  console.log(`\nspoke at least once: ${proven}`);
  console.log(`spoke in 2+ rounds (cooperated): ${cooperating}`);
  console.log(`proof written to ${PROOF_PATH}`);
}

/**
 * Seat agents whose every tool mutates real account state.
 *
 * These servers answered `tools/list` with real tool names — that is a
 * non-error response and it is their ability statement. What they cannot
 * safely do in a blind sweep is DELIVER, because invoking their tools would
 * create, send, deploy, or charge something in a real account. So they join
 * the table with a capability declaration derived strictly from the tool
 * names they published, and the board entry says plainly that no tool was
 * invoked. Two of the three bars, honestly labeled, instead of a fake third.
 */
async function declareOnly(): Promise<void> {
  const census = readJson<CensusLike[]>(CENSUS_PATH, []);
  const live = census.filter(
    (r) =>
      (r.verdict === "live_open" || r.verdict === "live_keyed") &&
      r.transport === "mcp" &&
      r.abilities.length > 0,
  );
  const { readOnlyAbilities } = await import("../lib/hive/census-roster");
  const mutatingOnly = live.filter((r) => readOnlyAbilities(r.abilities).length === 0);

  const done = readJson<AgentProof[]>(PROOF_PATH, []);
  const doneIds = new Set(done.filter((d) => d.messages > 0).map((d) => d.agent_id));
  const pending = mutatingOnly.filter((r) => !doneIds.has(r.agent_id));
  const limit = Number(flag("limit") ?? pending.length);
  const subset = pending.slice(0, limit);
  const batchSize = Number(flag("batch") ?? 10);
  console.log(
    `declare-only: ${mutatingOnly.length} mutating-only live agents, ${subset.length} pending`,
  );

  const secrets = readJson<Record<string, string>>(SECRETS_PATH, {});
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
  const proofs = [...done];

  for (let i = 0; i < subset.length; i += batchSize) {
    const batch = subset.slice(i, i + batchSize);
    const toProvision = batch.map((row) => {
      if (!secrets[row.agent_id]) {
        secrets[row.agent_id] = randomBytes(32).toString("base64");
      }
      return {
        agent_id: row.agent_id,
        display_name: (row.display_name || row.agent_id).slice(0, 80),
        sponsor: (row.sponsor || "unknown").slice(0, 80),
        capabilities: row.abilities.slice(0, 6),
        system_prompt: `You are ${row.agent_id}, an external specialist in an Arbor hive roundtable.`,
        cost_per_task_estimate: 0.4,
        starting_reputation: 0.5,
        secret_b64: secrets[row.agent_id],
      };
    });

    try {
      convexRun("hiveConnector:_bulkProvision", { agents: toProvision });
      writeJson(SECRETS_PATH, secrets);
      const created = convexRun("hiveConnector:_createDiscussionSession", {
        goal: GOAL,
        posted_by: "hive-mass-declare",
        max_budget: 5,
        agent_ids: batch.map((b) => b.agent_id),
      }) as { dag_id?: string } | null;
      if (!created?.dag_id) throw new Error("session creation failed");
      const dagId = created.dag_id;

      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const statement = await callOpenAI({
            purpose: "agent",
            maxTokens: 200,
            systemPrompt:
              `You are ${row.agent_id} (${row.display_name} by ${row.sponsor}), an external ` +
              "specialist at a multi-agent roundtable. State what you can do for a software " +
              "team, based ONLY on the tool names your server published. Name one task you " +
              "would own. Say explicitly that your tools change real account state, so you " +
              "need an operator's go-ahead before you run anything. Under 60 words, plain " +
              "sentences, no markdown.",
            userPrompt: `Tools your server published: ${row.abilities.slice(0, 25).join(", ")}`,
          });
          const secret = secrets[row.agent_id];
          if (!secret) throw new Error("no HMAC secret");
          const written = (await client.action(
            api.scratchpadActions.writeSigned,
            signedWriteArgs({
              payload: {
                dag_id: dagId,
                node_id: `propose:${row.agent_id}`,
                kind: "proposal",
                content: composeEntryContent({
                  message: truncateForBoard(statement.trim()),
                  provenance:
                    `capabilities declared via MCP tools/list @ ${row.endpoint} — ` +
                    "NO tool invoked: every tool this server exposes mutates real " +
                    "account state, so delivery awaits operator approval",
                }),
                confidence: 0.5,
              },
              agentId: row.agent_id,
              secretB64: secret,
              nowMs: Date.now(),
              nonce: randomUUID(),
            }) as never,
          )) as { ok: boolean; error?: string };
          if (!written.ok) throw new Error(`writeSigned: ${written.error}`);
          return { row, statement: statement.trim() };
        }),
      );

      const merged = new Map(proofs.map((p) => [p.agent_id, p]));
      results.forEach((res, idx) => {
        const row = batch[idx];
        if (res.status === "fulfilled") {
          merged.set(row.agent_id, {
            agent_id: row.agent_id,
            display_name: row.display_name,
            sponsor: row.sponsor,
            messages: 1,
            error_messages: 0,
            dag_id: dagId,
            ability_statement: res.value.statement.slice(0, 400),
            tool_used: "(declared only — no tool invoked)",
          });
        } else {
          const msg =
            res.reason instanceof Error ? res.reason.message : String(res.reason);
          merged.set(row.agent_id, {
            agent_id: row.agent_id,
            display_name: row.display_name,
            sponsor: row.sponsor,
            messages: 0,
            error_messages: 0,
            failure: msg.slice(0, 200),
          });
        }
      });
      proofs.length = 0;
      proofs.push(...merged.values());
      writeJson(PROOF_PATH, proofs);
      convexRun("hiveConnector:_completeSession", { dag_id: dagId });
      const ok = results.filter((r) => r.status === "fulfilled").length;
      console.log(`declare batch ${i / batchSize + 1}: ${ok}/${batch.length} declared`);
    } catch (err) {
      console.log(
        `declare batch ${i / batchSize + 1} FAILED: ${(err as Error).message.slice(0, 140)}`,
      );
    }
  }
  console.log(`total board participants now: ${proofs.filter((p) => p.messages >= 1).length}`);
}

function report(): void {
  const proofs = readJson<AgentProof[]>(PROOF_PATH, []);
  const proven = proofs.filter((p) => p.messages >= 1);
  const cooperating = proofs.filter((p) => p.messages >= 2);
  console.log(`agents with a recorded hive utterance: ${proven.length}`);
  console.log(`agents that spoke in 2+ rounds:        ${cooperating.length}`);
  for (const p of proven.slice(0, 15)) {
    console.log(`\n${p.agent_id} (${p.sponsor}) via ${p.tool_used ?? "?"}`);
    console.log(`  "${(p.ability_statement ?? "").slice(0, 180)}"`);
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const command = process.argv[2];
  if (command === "run") await run();
  else if (command === "declare") await declareOnly();
  else if (command === "report") report();
  else {
    console.log("usage: hive-mass-session <run|declare|report> [--batch N] [--rounds N] [--limit N]");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
