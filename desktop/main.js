// Arbor Hive Host — main process.
//
// Hosts the external-agent hive connector (scripts/hive-connector.ts) on
// this machine: gives every roster agent a workspace directory, runs the
// connector CLI, and reads the live Convex board.

"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");
const https = require("node:https");
const http = require("node:http");

const REPO_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.join(os.homedir(), "ArborHive", "workspaces");
const ENV_PATH = path.join(REPO_ROOT, ".env.local");
const SESSION_PATH = path.join(
  REPO_ROOT,
  "autoresearch",
  "data",
  "connector-session.json",
);

// Fallback used only if the tsx roster probe fails (e.g. no network for npx
// on a first run with an empty module cache). Kept in sync by hand with
// lib/hive/connector-roster.ts; the live probe is always tried first.
const FALLBACK_ROSTER = [
  { agent_id: "devin-engineer", display_name: "Devin", sponsor: "Cognition (Devin)", provenance_label: "real agent session (Devin sessions API)", requiresEnv: ["DEVIN_API_KEY"] },
  { agent_id: "vercel-v0", display_name: "v0", sponsor: "Vercel (v0)", provenance_label: "real generation API (v0 Platform API)", requiresEnv: ["V0_API_KEY"] },
  { agent_id: "nia-context", display_name: "Nia", sponsor: "Nia (Nozomio)", yc_batch: "S24", provenance_label: "real tool-backed (Nia MCP server)", requiresEnv: ["NIA_API_KEY"] },
  { agent_id: "deepwiki-docs", display_name: "DeepWiki", sponsor: "Cognition (DeepWiki)", provenance_label: "real tool-backed (DeepWiki MCP ask_question)", requiresEnv: [] },
  { agent_id: "context7-docs", display_name: "Context7", sponsor: "Upstash (Context7)", provenance_label: "real tool-backed (Context7 MCP get-library-docs)", requiresEnv: [] },
  { agent_id: "airweave-context", display_name: "Airweave", sponsor: "Airweave", yc_batch: "X25", provenance_label: "real tool-backed (Airweave docs MCP searchDocs)", requiresEnv: [] },
  { agent_id: "vellum-workflows", display_name: "Vellum", sponsor: "Vellum", yc_batch: "W23", provenance_label: "real tool-backed (Vellum docs MCP searchDocs)", requiresEnv: [] },
];

let mainWindow = null;
let activeRun = null; // { child, command }

function loadEnvLocal() {
  const env = {};
  if (!fs.existsSync(ENV_PATH)) return env;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].replace(/\s+#.*$/, "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

function ensureWorkspace(agentId) {
  const dir = path.join(WORKSPACE_ROOT, agentId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Ask the repo itself for the roster (source of truth) rather than
// re-parsing the TypeScript file here.
function fetchRosterViaTsx() {
  return new Promise((resolve) => {
    const code =
      "import { CONNECTOR_ROSTER } from './lib/hive/connector-roster';" +
      "console.log(JSON.stringify(CONNECTOR_ROSTER.map((r) => ({" +
      "agent_id: r.agent_id, display_name: r.display_name, sponsor: r.sponsor," +
      "yc_batch: r.yc_batch, provenance_label: r.provenance_label, requiresEnv: r.requiresEnv" +
      "}))));";
    execFile(
      "npx",
      ["tsx", "-e", code],
      { cwd: REPO_ROOT, timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        try {
          const start = stdout.indexOf("[");
          resolve(JSON.parse(stdout.slice(start)));
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function getRosterStatus() {
  const env = loadEnvLocal();
  const roster = (await fetchRosterViaTsx()) || FALLBACK_ROSTER;
  return roster.map((entry) => {
    const missing = (entry.requiresEnv || []).filter(
      (name) => !env[name] || !env[name].trim(),
    );
    return {
      agent_id: entry.agent_id,
      display_name: entry.display_name,
      sponsor: entry.sponsor,
      yc_batch: entry.yc_batch || null,
      provenance_label: entry.provenance_label,
      requiresEnv: entry.requiresEnv || [],
      active: missing.length === 0,
      missingEnv: missing,
      workspace: ensureWorkspace(entry.agent_id),
    };
  });
}

function readSession() {
  if (!fs.existsSync(SESSION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_PATH, "utf8"));
  } catch {
    return null;
  }
}

function httpPostJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const data = JSON.stringify(body);
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        protocol: u.protocol,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let chunks = "";
        res.on("data", (d) => {
          chunks += d;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(chunks) });
          } catch {
            reject(
              new Error(`bad response (${res.statusCode}): ${chunks.slice(0, 300)}`),
            );
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function fetchBoard(dagId) {
  const env = loadEnvLocal();
  const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL missing from .env.local");
  const res = await httpPostJson(`${convexUrl}/api/query`, {
    path: "scratchpad:forDag",
    args: { dag_id: dagId },
    format: "json",
  });
  if (res.body.status !== "success") {
    throw new Error(res.body.errorMessage || "convex query failed");
  }
  return res.body.value || [];
}

function runConnector(command, extraArgs) {
  if (activeRun) {
    return Promise.reject(new Error(`already running: ${activeRun.command}`));
  }
  return new Promise((resolve) => {
    const argv = ["tsx", "scripts/hive-connector.ts", command, ...(extraArgs || [])];
    const child = spawn("npx", argv, { cwd: REPO_ROOT });
    activeRun = { child, command };

    const send = (stream, chunk) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("hive:log", { stream, chunk: chunk.toString() });
      }
    };
    child.stdout.on("data", (d) => send("stdout", d));
    child.stderr.on("data", (d) => send("stderr", d));
    child.on("close", (code) => {
      activeRun = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("hive:run-done", { command, code });
      }
      resolve({ code });
    });
    child.on("error", (err) => {
      activeRun = null;
      send("stderr", `spawn error: ${err.message}\n`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("hive:run-done", { command, code: -1 });
      }
      resolve({ code: -1 });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// Guarded so this file can also be `require()`d under plain node (syntax /
// smoke check) without throwing — under plain node the "electron" package
// exports a binary path string, not the app/BrowserWindow/ipcMain API.
if (app && typeof app.whenReady === "function") {
  ipcMain.handle("hive:get-roster", async () => getRosterStatus());
  ipcMain.handle("hive:get-session", async () => readSession());
  ipcMain.handle("hive:get-board", async (_evt, dagId) => fetchBoard(dagId));
  ipcMain.handle("hive:run", async (_evt, { command, args }) => runConnector(command, args));
  ipcMain.handle("hive:is-busy", async () => Boolean(activeRun));
  ipcMain.handle("hive:workspace-root", async () => WORKSPACE_ROOT);

  app.whenReady().then(async () => {
    createWindow();
    // Pre-create workspaces on startup so every roster agent has a device
    // directory even before the roster panel is opened.
    await getRosterStatus();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

module.exports = { REPO_ROOT, WORKSPACE_ROOT };
