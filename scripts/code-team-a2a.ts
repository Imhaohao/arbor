// Arbor Code Team: an A2A v0.3.0 JSON-RPC server around solveWithTeam.
//
//   PORT=4100 npx tsx scripts/code-team-a2a.ts
//
// message/send takes a programming problem (Markdown text part, or a data part
// with {statement, examples, time_limit_s?, checker?}) and answers at once
// with a "working" task. The team runs in the background; poll tasks/get.
// Tasks live in memory, so run this on a long-lived host, not serverless.

import * as http from "node:http";
import { resolve } from "node:path";
import { solveWithTeam, type TeamAnswer } from "../lib/swarm/code-team";
import { parseProblem } from "../lib/swarm/problem-parse";
import type { PublicTask } from "../lib/swarm/bench-core";

const PORT = Number.parseInt(process.env.PORT ?? "4100", 10);
const PUBLIC_URL = process.env.CODE_TEAM_PUBLIC_URL ?? `http://localhost:${PORT}/`;
const BEARER_TOKEN = process.env.ARBOR_CODE_TEAM_BEARER ?? "";
const MAX_REQUEST_BODY_BYTES = 1_048_576;
const MAX_CONCURRENT_PROBLEMS = 2;
const ROOT = resolve(__dirname, "..");

type TaskState = "working" | "completed" | "failed";

interface A2ATask {
  id: string;
  kind: "task";
  status: { state: TaskState; message?: { role: string; parts: Array<{ kind: "text"; text: string }> } };
  artifacts: Array<{ name: string; description: string; parts: Array<{ kind: "text"; text: string }> }>;
  metadata?: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

type RpcId = string | number | null;

const tasks = new Map<string, A2ATask>();
let activeProblems = 0;

const log = (line: string) => console.log(`[arbor-code-team] ${line}`);

function makeTaskId(): string {
  return `code-team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── agent card ──────────────────────────────────────────────────────────────

function buildAgentCard(): Record<string, unknown> {
  return {
    protocolVersion: "0.3.0",
    name: "Arbor Code Team",
    description:
      "A team of small models that each solve a stdin/stdout programming problem, with independent brute-force testers that check the candidates against each other. Returns one Python program and the evidence for choosing it.",
    url: PUBLIC_URL,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/markdown", "application/json"],
    defaultOutputModes: ["text/markdown"],
    skills: [
      {
        id: "solve-programming-problem",
        name: "Solve a programming problem",
        description:
          "Send a Markdown problem with Input and Output examples (or a JSON object with statement and examples). Returns a Python 3.12 program in a python code block plus which team member was chosen and how many brute-force checks it matched.",
        tags: ["algorithmic-programming", "competitive-programming", "verified-code-generation", "python"],
      },
    ],
    ...(BEARER_TOKEN
      ? { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, security: [{ bearer: [] }] }
      : { securitySchemes: {}, security: [] }),
  };
}

// ── task builders ───────────────────────────────────────────────────────────

function workingTask(id: string): A2ATask {
  return { id, kind: "task", status: { state: "working" }, artifacts: [] };
}

function failedTask(id: string, reason: string): A2ATask {
  return { id, kind: "task", status: { state: "failed", message: { role: "agent", parts: [{ kind: "text", text: reason }] } }, artifacts: [] };
}

function agreementLine(answer: TeamAnswer): string {
  const base = answer.ranking.find((entry) => entry.label === answer.chosen?.replace(/\+repair$/, ""));
  if (!base || base.trusted === 0) return "No brute-force reference outputs were available, so the choice rests on the statement examples and agreement between team members.";
  const when = answer.repaired ? " before repair" : "";
  return `The chosen program matched ${base.agreed} of ${base.trusted} brute-force reference outputs${when}.`;
}

function evidenceSummary(answer: TeamAnswer): string {
  const repair = answer.repaired ? "It was repaired after the testers found a concrete failure." : "It needed no repair.";
  const testers = answer.testers.length ? answer.testers.join(", ") : "none passed validation";
  return [
    `Chosen: ${answer.chosen}. ${repair}`,
    agreementLine(answer),
    `Trusted inputs (two testers agreed on the answer): ${answer.trustedInputs}. Testers: ${testers}.`,
    `Reported model cost: $${answer.costUsd.toFixed(4)} across ${answer.calls.length} calls; ${answer.uncostedCalls.length} calls reported no cost.`,
  ].join("\n");
}

function completedTask(id: string, answer: TeamAnswer & { code: string }): A2ATask {
  const text = `\`\`\`python\n${answer.code.trimEnd()}\n\`\`\`\n\n${evidenceSummary(answer)}`;
  return {
    id,
    kind: "task",
    status: { state: "completed", message: { role: "agent", parts: [{ kind: "text", text: evidenceSummary(answer).slice(0, 300) }] } },
    artifacts: [{ name: "solution.py", description: "Python program chosen by the team, with evidence", parts: [{ kind: "text", text }] }],
    metadata: { chosen: answer.chosen, repaired: answer.repaired, trustedInputs: answer.trustedInputs, costUsd: answer.costUsd, uncostedCalls: answer.uncostedCalls, completed_at: new Date().toISOString() },
  };
}

// ── running the team ────────────────────────────────────────────────────────

function finishTask(taskId: string, answer: TeamAnswer): void {
  if (!answer.code) {
    tasks.set(taskId, failedTask(taskId, "The team produced no program that could be evaluated."));
    return;
  }
  tasks.set(taskId, completedTask(taskId, { ...answer, code: answer.code }));
}

async function runTeam(taskId: string, problem: PublicTask): Promise<void> {
  activeProblems += 1;
  try {
    finishTask(taskId, await solveWithTeam(problem, { root: ROOT, log }));
    log(`task ${taskId} ${tasks.get(taskId)?.status.state}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    tasks.set(taskId, failedTask(taskId, reason));
    log(`task ${taskId} failed: ${reason}`);
  } finally {
    activeProblems -= 1;
  }
}

// ── JSON-RPC ────────────────────────────────────────────────────────────────

const rpcOk = (id: RpcId, result: unknown): string => JSON.stringify({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcId, code: number, message: string): string => JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });

function messageParts(params: unknown): Array<Record<string, unknown>> | undefined {
  if (!isRecord(params) || !isRecord(params.message) || !Array.isArray(params.message.parts)) return undefined;
  return params.message.parts.filter(isRecord);
}

/** A data part carries the JSON form; otherwise the text parts are the Markdown problem. */
function problemInput(parts: Array<Record<string, unknown>>): string | unknown {
  const dataPart = parts.find((part) => part.kind === "data" && part.data !== undefined);
  if (dataPart) return dataPart.data;
  return parts.filter((part) => part.kind === "text" && typeof part.text === "string").map((part) => part.text as string).join("\n");
}

function handleMessageSend(rpcId: RpcId, params: unknown): string {
  const parts = messageParts(params);
  if (!parts) return rpcError(rpcId, -32602, "message/send requires params.message.parts");
  const taskId = makeTaskId();
  const parsed = parseProblem(problemInput(parts));
  if (!parsed.ok) return rpcOk(rpcId, failedTask(taskId, parsed.error));
  if (activeProblems >= MAX_CONCURRENT_PROBLEMS) return rpcOk(rpcId, failedTask(taskId, "The team is busy with other problems. Try again shortly."));
  const working = workingTask(taskId);
  tasks.set(taskId, working);
  log(`task ${taskId} started: ${parsed.task.title}`);
  void runTeam(taskId, parsed.task);
  return rpcOk(rpcId, working);
}

function handleTasksGet(rpcId: RpcId, params: unknown): string {
  const taskId = isRecord(params) && typeof params.id === "string" ? params.id.trim() : "";
  if (!taskId) return rpcError(rpcId, -32602, "tasks/get requires params.id");
  const task = tasks.get(taskId);
  return task ? rpcOk(rpcId, task) : rpcError(rpcId, -32001, `task not found: ${taskId}`);
}

function dispatchRpc(request: JsonRpcRequest): string {
  const rpcId = request.id ?? null;
  if (request.jsonrpc !== undefined && request.jsonrpc !== "2.0") return rpcError(rpcId, -32600, 'jsonrpc must be "2.0"');
  if (request.method === "message/send" || request.method === "tasks/send") return handleMessageSend(rpcId, request.params);
  if (request.method === "tasks/get") return handleTasksGet(rpcId, request.params);
  return rpcError(rpcId, -32601, `method not found: ${request.method || "(missing)"}`);
}

// ── HTTP ────────────────────────────────────────────────────────────────────

class RequestBodyTooLargeError extends Error {}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BODY_BYTES) {
        reject(new RequestBodyTooLargeError(`request body exceeded ${MAX_REQUEST_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function isAuthorized(req: http.IncomingMessage): boolean {
  return !BEARER_TOKEN || req.headers.authorization === `Bearer ${BEARER_TOKEN}`;
}

function parseRequest(rawBody: string): JsonRpcRequest | undefined {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return isRecord(parsed) ? (parsed as JsonRpcRequest) : undefined;
  } catch {
    return undefined;
  }
}

async function handleRpc(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!isAuthorized(req)) return sendJson(res, 401, rpcError(null, -32000, "Unauthorized: valid Bearer token required"));
  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch (error) {
    const tooLarge = error instanceof RequestBodyTooLargeError;
    return sendJson(res, tooLarge ? 413 : 400, rpcError(null, tooLarge ? -32013 : -32700, tooLarge ? error.message : "failed to read request body"));
  }
  const request = parseRequest(rawBody);
  if (!request) return sendJson(res, 400, rpcError(null, -32700, "invalid JSON body"));
  try {
    sendJson(res, 200, dispatchRpc(request));
  } catch (error) {
    sendJson(res, 200, rpcError(request.id ?? null, -32603, error instanceof Error ? error.message : String(error)));
  }
}

const AGENT_CARD_PATHS = new Set(["/.well-known/agent-card.json", "/.well-known/agent.json"]);

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";
  if (method === "GET" && AGENT_CARD_PATHS.has(url)) return sendJson(res, 200, JSON.stringify(buildAgentCard()));
  if (method === "POST" && (url === "/" || url === "")) return handleRpc(req, res);
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  log(`listening on port ${PORT}; public url ${PUBLIC_URL}; bearer auth ${BEARER_TOKEN ? "enabled" : "disabled"}`);
});
