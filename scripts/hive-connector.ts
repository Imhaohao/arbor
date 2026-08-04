// External-agent connector driver.
//
// Usage:
//   npm run hive:connector -- provision                # register roster agents + HMAC keys
//   npm run hive:connector -- session --goal "..."     # create a roundtable task/DAG
//   npm run hive:connector -- discuss [--rounds 3]     # run the discussion rounds
//   npm run hive:connector -- verify                   # count per-agent hive messages
//   npm run hive:connector -- complete                 # mark the session complete
//
// The connector drives REAL external agents (Devin sessions API, v0 Platform
// API, hosted MCP servers) through the hive's signed public blackboard write.
// A backend failure is recorded in the transcript and never posted to the
// board, so every board message is a genuine agent utterance.

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  buildContextDigest,
  buildRoundPrompt,
  composeEntryContent,
  countAgentMessages,
  meetsBar,
  roundSpec,
  signedWriteArgs,
  truncateForBoard,
  type BoardEntryLite,
} from "../lib/hive/connector-core";
import {
  callDevin,
  callHyperspell,
  callMcpAgent,
  callOllamaPersona,
  callOpenAICompat,
  callV0,
  type BackendReply,
} from "../lib/hive/connector-backends";
import {
  activeRoster,
  CONNECTOR_ROSTER,
  type RosterEntry,
} from "../lib/hive/connector-roster";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "autoresearch/data");
const SECRETS_PATH = resolve(DATA_DIR, "connector-secrets.json");
const SESSION_PATH = resolve(DATA_DIR, "connector-session.json");
const TRANSCRIPT_PATH = resolve(DATA_DIR, "connector-transcript.json");

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

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Run a deployed Convex function via the CLI and parse its JSON result. */
function convexRun(fn: string, args: Record<string, unknown>): unknown {
  const stdout = execFileSync(
    "npx",
    ["convex", "run", fn, JSON.stringify(args)],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  // The CLI pretty-prints the return value over multiple lines, with
  // warnings possibly before it. Parse from the first JSON-looking char.
  const start = stdout.search(/[{["\d]/);
  if (start >= 0) {
    try {
      return JSON.parse(stdout.slice(start).trim());
    } catch {
      // fall through to line scan
    }
  }
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // keep scanning
    }
  }
  return null;
}

function convexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

interface SessionState {
  dag_id: string;
  task_id: string;
  goal: string;
  agent_ids: string[];
  devin_session_id?: string;
  v0_chat_id?: string;
  created_at: string;
}

interface TranscriptRow {
  at: string;
  round: number;
  agent_id: string;
  ok: boolean;
  entry_id?: string;
  provenance?: string;
  chars?: number;
  error?: string;
}

function appendTranscript(rows: TranscriptRow[]): void {
  const existing = readJson<TranscriptRow[]>(TRANSCRIPT_PATH, []);
  writeJson(TRANSCRIPT_PATH, [...existing, ...rows]);
}

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

// ── commands ────────────────────────────────────────────────────────────────

function provision(roster: RosterEntry[]): void {
  const secrets = readJson<Record<string, string>>(SECRETS_PATH, {});
  for (const entry of roster) {
    const ensured = convexRun("agents:_ensureAgent", {
      agent_id: entry.agent_id,
      display_name: entry.display_name,
      sponsor: entry.sponsor,
      capabilities: entry.capabilities,
      system_prompt: entry.system_prompt,
      cost_per_task_estimate: entry.cost_per_task_estimate,
      starting_reputation: entry.starting_reputation,
    }) as { created?: boolean } | null;
    if (!secrets[entry.agent_id]) {
      const secret_b64 = randomBytes(32).toString("base64");
      convexRun("agentKeys:_rotate", {
        agent_id: entry.agent_id,
        secret_b64,
        created_at: Date.now(),
      });
      secrets[entry.agent_id] = secret_b64;
    }
    console.log(
      `provisioned ${entry.agent_id} (agent row ${ensured?.created ? "created" : "existing"}, key ready)`,
    );
  }
  writeJson(SECRETS_PATH, secrets);
  console.log(`secrets stored in ${SECRETS_PATH} (gitignored)`);
}

function createSession(roster: RosterEntry[], goal: string): void {
  const result = convexRun("hiveConnector:_createDiscussionSession", {
    goal,
    posted_by: "hive-connector",
    max_budget: 25,
    agent_ids: roster.map((r) => r.agent_id),
  }) as { task_id: string; dag_id: string } | null;
  if (!result?.dag_id) throw new Error("session creation returned no dag_id");
  const state: SessionState = {
    dag_id: result.dag_id,
    task_id: result.task_id,
    goal,
    agent_ids: roster.map((r) => r.agent_id),
    created_at: new Date().toISOString(),
  };
  writeJson(SESSION_PATH, state);
  console.log(`session ready: dag ${result.dag_id} task ${result.task_id}`);
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

async function callBackend(
  entry: RosterEntry,
  session: SessionState,
  round: number,
  digest: string,
): Promise<BackendReply> {
  const goal = session.goal;
  if (entry.backend.type === "devin") {
    const reply = await callDevin({
      apiKey: process.env.DEVIN_API_KEY ?? "",
      message: buildRoundPrompt({
        goal,
        agentId: entry.agent_id,
        displayName: entry.display_name,
        sponsor: entry.sponsor,
        capabilities: entry.capabilities,
        memberIds: session.agent_ids,
        round,
        digest,
      }),
      sessionId: session.devin_session_id,
    });
    session.devin_session_id = reply.sessionId;
    writeJson(SESSION_PATH, session);
    return reply;
  }
  if (entry.backend.type === "v0") {
    const reply = await callV0({
      apiKey: process.env.V0_API_KEY ?? "",
      message: buildRoundPrompt({
        goal,
        agentId: entry.agent_id,
        displayName: entry.display_name,
        sponsor: entry.sponsor,
        capabilities: entry.capabilities,
        memberIds: session.agent_ids,
        round,
        digest,
      }),
      chatId: session.v0_chat_id,
    });
    session.v0_chat_id = reply.chatId;
    writeJson(SESSION_PATH, session);
    return reply;
  }
  if (entry.backend.type === "mcp") {
    return await callMcpAgent({
      endpoint: entry.backend.endpoint,
      bearer: entry.backend.bearerEnv
        ? process.env[entry.backend.bearerEnv]
        : undefined,
      toolPreference: entry.backend.toolPreference,
      argsFor: entry.backend.argsFor,
      query: entry.backend.queryFor(round, goal, digest),
    });
  }
  if (entry.backend.type === "hyperspell") {
    return await callHyperspell({
      round,
      goal,
      digest,
      query: entry.backend.queryFor(round, goal, digest),
    });
  }
  if (entry.backend.type === "openai-compat") {
    return await callOpenAICompat({
      baseUrl: entry.backend.baseUrl,
      model: entry.backend.model,
      bearer: entry.backend.bearerEnv
        ? process.env[entry.backend.bearerEnv]
        : undefined,
      system: entry.system_prompt,
      prompt: buildRoundPrompt({
        goal,
        agentId: entry.agent_id,
        displayName: entry.display_name,
        sponsor: entry.sponsor,
        capabilities: entry.capabilities,
        memberIds: session.agent_ids,
        round,
        digest,
      }),
    });
  }
  return await callOllamaPersona({
    model: entry.backend.model,
    system: entry.system_prompt,
    prompt: buildRoundPrompt({
      goal,
      agentId: entry.agent_id,
      displayName: entry.display_name,
      sponsor: entry.sponsor,
      capabilities: entry.capabilities,
      memberIds: session.agent_ids,
      round,
      digest,
    }),
  });
}

async function discuss(roster: RosterEntry[], rounds: number): Promise<void> {
  const session = readJson<SessionState | null>(SESSION_PATH, null);
  if (!session) throw new Error("no session — run `session --goal ...` first");
  const secrets = readJson<Record<string, string>>(SECRETS_PATH, {});
  const client = convexClient();
  const active = roster.filter((r) => session.agent_ids.includes(r.agent_id));

  for (let round = 1; round <= rounds; round += 1) {
    const spec = roundSpec(round);
    console.log(`\n── round ${round} (${spec.phase}) ──`);
    const board = await fetchBoard(client, session.dag_id);

    const results = await Promise.allSettled(
      active.map(async (entry) => {
        const secret = secrets[entry.agent_id];
        if (!secret) throw new Error(`no HMAC secret for ${entry.agent_id}`);
        const digest = buildContextDigest(board, entry.agent_id);
        const reply = await callBackend(entry, session, round, digest);
        const payload = {
          dag_id: session.dag_id,
          node_id: `${spec.phase}:${entry.agent_id}`,
          kind: spec.kind,
          content: composeEntryContent({
            message: truncateForBoard(reply.text),
            provenance: `${entry.provenance_label}${
              reply.external_id ? `, id ${reply.external_id}` : ""
            }`,
          }),
          confidence: round === 3 ? 0.8 : 0.65,
        };
        const args = signedWriteArgs({
          payload,
          agentId: entry.agent_id,
          secretB64: secret,
          nowMs: Date.now(),
          nonce: randomUUID(),
        });
        const written = (await client.action(
          api.scratchpadActions.writeSigned,
          args as never,
        )) as { ok: boolean; entry_id?: string; error?: string };
        if (!written.ok) {
          throw new Error(`writeSigned rejected: ${written.error}`);
        }
        return { entry, reply, entry_id: written.entry_id };
      }),
    );

    const rows: TranscriptRow[] = results.map((res, i) => {
      const entry = active[i];
      if (res.status === "fulfilled") {
        console.log(
          `  ${entry.agent_id}: posted ${res.value.entry_id} (${res.value.reply.provenance})`,
        );
        return {
          at: new Date().toISOString(),
          round,
          agent_id: entry.agent_id,
          ok: true,
          entry_id: res.value.entry_id,
          provenance: res.value.reply.provenance,
          chars: res.value.reply.text.length,
        };
      }
      const message =
        res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.log(`  ${entry.agent_id}: FAILED — ${message}`);
      return {
        at: new Date().toISOString(),
        round,
        agent_id: entry.agent_id,
        ok: false,
        error: message.slice(0, 300),
      };
    });
    appendTranscript(rows);
  }
  await verify(roster);
}

async function verify(roster: RosterEntry[]): Promise<void> {
  const session = readJson<SessionState | null>(SESSION_PATH, null);
  if (!session) throw new Error("no session recorded");
  const client = convexClient();
  const board = await fetchBoard(client, session.dag_id);
  const counts = countAgentMessages(board, session.agent_ids);
  console.log(`\nboard ${session.dag_id}: ${board.length} entries`);
  for (const c of counts) {
    const errs = c.error_messages > 0 ? `  (+${c.error_messages} error-text)` : "";
    console.log(`  ${c.agent_id.padEnd(20)} ${c.messages} non-error messages${errs}`);
  }
  const ok = meetsBar(counts, 5, 2);
  console.log(
    ok
      ? "BAR MET: >=5 agents with >=2 hive messages each"
      : "bar not met yet",
  );
  if (!ok) process.exitCode = 1;
  void roster;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const command = process.argv[2];
  const roster = activeRoster(process.env, CONNECTOR_ROSTER);
  if (command === "provision") {
    provision(roster);
  } else if (command === "session") {
    const goal = flag("goal");
    if (!goal) throw new Error("--goal is required");
    createSession(roster, goal);
  } else if (command === "discuss") {
    await discuss(roster, Number(flag("rounds") ?? 3));
  } else if (command === "verify") {
    await verify(roster);
  } else if (command === "board") {
    const dagId = flag("dag") ?? readJson<SessionState | null>(SESSION_PATH, null)?.dag_id;
    if (!dagId) throw new Error("no session recorded and no --dag given");
    const board = await fetchBoard(convexClient(), dagId);
    for (const e of board.sort((a, b) => a.created_at - b.created_at)) {
      const { looksLikeErrorText } = await import("../lib/hive/connector-core");
      const err = looksLikeErrorText(e.content) ? " [ERROR-TEXT]" : "";
      const first = e.content.split("\n")[0].slice(0, 120);
      console.log(`${new Date(e.created_at).toISOString()} ${e.agent_id} [${e.kind}]${err}: ${first}`);
    }
  } else if (command === "complete") {
    const session = readJson<SessionState | null>(SESSION_PATH, null);
    if (!session) throw new Error("no session recorded");
    convexRun("hiveConnector:_completeSession", { dag_id: session.dag_id });
    console.log(`session ${session.dag_id} marked complete`);
  } else {
    console.log(
      "usage: hive-connector <provision|session|discuss|verify|complete>",
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
