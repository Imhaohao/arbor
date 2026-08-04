"use strict";

const rosterListEl = document.getElementById("roster-list");
const sessionSummaryEl = document.getElementById("session-summary");
const goalInputEl = document.getElementById("goal-input");
const btnNewSession = document.getElementById("btn-new-session");
const btnDiscuss = document.getElementById("btn-discuss");
const btnVerify = document.getElementById("btn-verify");
const logPaneEl = document.getElementById("log-pane");
const boardStatusEl = document.getElementById("board-status");
const boardListEl = document.getElementById("board-list");
const azureCommandsEl = document.getElementById("azure-commands");

let currentSession = null;
let boardPollTimer = null;
let running = false;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendLog(text) {
  logPaneEl.textContent += text;
  logPaneEl.scrollTop = logPaneEl.scrollHeight;
}

function setRunning(isRunning) {
  running = isRunning;
  btnNewSession.disabled = isRunning;
  btnDiscuss.disabled = isRunning;
  btnVerify.disabled = isRunning;
}

async function loadRoster() {
  const roster = await window.hive.getRoster();
  rosterListEl.innerHTML = "";
  for (const entry of roster) {
    const row = document.createElement("div");
    row.className = "roster-row";
    const missing = entry.missingEnv.length
      ? `missing: ${entry.missingEnv.join(", ")}`
      : "all required keys present";
    row.innerHTML = `
      <div class="row-top">
        <span class="name">${escapeHtml(entry.display_name)}${
          entry.yc_batch ? ` <span class="hint">(${escapeHtml(entry.yc_batch)})</span>` : ""
        }</span>
        <span class="badge ${entry.active ? "active" : "gated"}">${
          entry.active ? "active" : "gated"
        }</span>
      </div>
      <div class="meta">${escapeHtml(entry.sponsor)} — ${escapeHtml(entry.provenance_label)}</div>
      <div class="meta">${escapeHtml(missing)}</div>
      <div class="workspace">${escapeHtml(entry.workspace)}</div>
    `;
    rosterListEl.appendChild(row);
  }
}

function renderSessionSummary(session) {
  currentSession = session;
  if (!session) {
    sessionSummaryEl.innerHTML = `<div class="hint">No session recorded yet. Create one below.</div>`;
    return;
  }
  sessionSummaryEl.innerHTML = `
    <div class="goal">${escapeHtml(session.goal)}</div>
    <div class="ids">dag ${escapeHtml(session.dag_id)} · task ${escapeHtml(session.task_id)}</div>
    <div class="ids">${session.agent_ids.length} agents · created ${escapeHtml(session.created_at)}</div>
  `;
}

async function loadSession() {
  const session = await window.hive.getSession();
  renderSessionSummary(session);
}

function renderBoard(entries) {
  boardListEl.innerHTML = "";
  const sorted = [...entries].sort((a, b) => a.created_at - b.created_at);
  for (const e of sorted) {
    const row = document.createElement("div");
    row.className = "board-row";
    const excerpt = (e.content || "").slice(0, 200);
    row.innerHTML = `
      <div class="row-top">
        <span class="agent">${escapeHtml(e.agent_id)}</span>
        <span>${escapeHtml(e.kind)} · ${new Date(e.created_at).toLocaleTimeString()}</span>
      </div>
      <div class="content">${escapeHtml(excerpt)}${e.content && e.content.length > 200 ? "…" : ""}</div>
    `;
    boardListEl.appendChild(row);
  }
  boardStatusEl.textContent = `${entries.length} entries`;
}

async function pollBoardOnce() {
  if (!currentSession) return;
  try {
    const entries = await window.hive.getBoard(currentSession.dag_id);
    renderBoard(entries);
  } catch (err) {
    boardStatusEl.textContent = `board error: ${err.message || err}`;
  }
}

function startBoardPolling() {
  stopBoardPolling();
  pollBoardOnce();
  boardPollTimer = setInterval(pollBoardOnce, 5000);
  boardStatusEl.textContent = "polling every 5s...";
}

function stopBoardPolling() {
  if (boardPollTimer) {
    clearInterval(boardPollTimer);
    boardPollTimer = null;
  }
}

async function runCommand(command, args) {
  if (running) return;
  setRunning(true);
  appendLog(`\n$ hive-connector ${command} ${(args || []).join(" ")}\n`);
  try {
    await window.hive.run(command, args || []);
  } catch (err) {
    appendLog(`error: ${err.message || err}\n`);
    setRunning(false);
  }
}

btnNewSession.addEventListener("click", async () => {
  const goal = goalInputEl.value.trim();
  if (!goal) {
    appendLog("enter a goal before creating a session\n");
    return;
  }
  await runCommand("session", ["--goal", goal]);
});

btnDiscuss.addEventListener("click", async () => {
  startBoardPolling();
  await runCommand("discuss", ["--rounds", "3"]);
});

btnVerify.addEventListener("click", async () => {
  await runCommand("verify", []);
});

window.hive.onLog(({ chunk }) => appendLog(chunk));

window.hive.onRunDone(async ({ command, code }) => {
  appendLog(`\n[${command} exited with code ${code}]\n`);
  setRunning(false);
  await loadSession();
  if (command === "session" || command === "discuss") {
    await pollBoardOnce();
  }
  if (command === "discuss") {
    // Discussion (and the verify it triggers) is over; stop polling but
    // leave the last board state visible.
    stopBoardPolling();
    boardStatusEl.textContent += " (discussion finished)";
  }
});

const AZURE_COMMANDS = `# Provision a small always-on VM to run the connector on a schedule
# instead of (or in addition to) this desktop app. Displayed for reference
# only -- nothing on this panel is ever executed by Arbor Hive Host.

az group create --name arbor-hive-rg --location eastus

az vm create \\
  --resource-group arbor-hive-rg \\
  --name arbor-hive-vm \\
  --image Ubuntu2204 \\
  --size Standard_B2s \\
  --admin-username arbor \\
  --generate-ssh-keys

# Only SSH needs to be reachable -- the connector only makes outbound calls
# to Convex and the roster backends (Devin, v0, MCP servers).
az vm open-port --resource-group arbor-hive-rg --name arbor-hive-vm --port 22

# On the VM: clone the repo, install deps, copy .env.local out-of-band
# (scp -- never commit it), then schedule the connector via cron.
ssh arbor@<vm-public-ip> <<'REMOTE'
  sudo apt-get update && sudo apt-get install -y git nodejs npm
  git clone <repo-url> ~/miyohacks
  cd ~/miyohacks && npm install
  (crontab -l 2>/dev/null; echo "*/30 * * * * cd ~/miyohacks && npm run hive:connector -- discuss --rounds 3 >> ~/hive-connector.log 2>&1") | crontab -
REMOTE

# Tear down when done
az group delete --name arbor-hive-rg --yes --no-wait
`;

azureCommandsEl.textContent = AZURE_COMMANDS;

(async function init() {
  setRunning(await window.hive.isBusy());
  await loadRoster();
  await loadSession();
  if (currentSession) {
    await pollBoardOnce();
  }
})();
