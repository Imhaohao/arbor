#!/usr/bin/env node

/**
 * handoff.mjs — package the current Arbor working context into a self-contained
 * brief and continue the task on another agent.
 *
 *   node scripts/handoff.mjs <cloud|local> [options]
 *
 * Targets
 *   cloud   Full agentic continuation via the `claude` CLI (`claude -p`). The
 *           downstream agent has tool access and can edit files in this repo.
 *   local   Advisory continuation via Ollama. The local model reads the brief
 *           and returns a concrete plan / suggested changes. It has NO tool
 *           access, so it cannot edit files itself.
 *
 * Options
 *   --task "..."     What to continue. Defaults to the open item in PROGRESS.md.
 *   --model <name>   Override model (cloud default: opus, local default: qwen2.5-coder:7b).
 *   --reasoning      local only: use deepseek-r1:14b instead of the code model.
 *   --exec           Actually launch the downstream agent. Without this the
 *                    script only writes the brief and prints the dispatch command.
 *   --full-auto      cloud only: pass --permission-mode bypassPermissions (no prompts).
 *   --print-brief    Print the brief to stdout after writing it.
 *   -h, --help       Show this help.
 *
 * Artifacts are written to .claude/handoff/ (gitignored).
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(REPO_ROOT, ".claude", "handoff");
const DIFF_LINE_CAP = 1500; // truncate large diffs to keep prompts sane

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    target: null,
    task: null,
    model: null,
    reasoning: false,
    exec: false,
    fullAuto: false,
    printBrief: false,
    help: false,
  };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    switch (a) {
      case "cloud":
      case "local":
        args.target = a;
        break;
      case "--task":
        args.task = rest.shift() ?? null;
        break;
      case "--model":
        args.model = rest.shift() ?? null;
        break;
      case "--reasoning":
        args.reasoning = true;
        break;
      case "--exec":
        args.exec = true;
        break;
      case "--full-auto":
        args.fullAuto = true;
        break;
      case "--print-brief":
        args.printBrief = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        // Bare string with no recognized flag → treat as the task.
        if (!a.startsWith("-") && !args.task) args.task = a;
        else console.error(`warning: ignoring unrecognized argument "${a}"`);
    }
  }
  return args;
}

const HELP = `handoff.mjs — continue the current Arbor task on a cloud or local agent

Usage:
  node scripts/handoff.mjs <cloud|local> [options]

Targets:
  cloud   Agentic continuation via the claude CLI (has tools, edits files)
  local   Advisory continuation via Ollama (plan/patch only, no tools)

Options:
  --task "..."    What to continue (default: open item from PROGRESS.md)
  --model <name>  Override model (cloud=opus, local=qwen2.5-coder:7b)
  --reasoning     local only: use deepseek-r1:14b
  --exec          Launch the agent now (default: write brief + print command)
  --full-auto     cloud only: bypass permission prompts in the spawned agent
  --print-brief   Echo the brief to stdout
  -h, --help      This help

Examples:
  node scripts/handoff.mjs cloud --task "fix hive:e2e implausible_plan rejection"
  node scripts/handoff.mjs cloud --exec --full-auto
  node scripts/handoff.mjs local --reasoning --exec`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function cap(text, maxLines, label) {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}\n... [${label}: truncated ${lines.length - maxLines} more lines]`;
}

function readIfExists(path, maxBytes = 200_000) {
  try {
    const raw = readFileSync(path, "utf8");
    return raw.length > maxBytes ? raw.slice(0, maxBytes) + "\n... [truncated]" : raw;
  } catch {
    return "";
  }
}

/** Pull the "Next / open item" section from PROGRESS.md, falling back to its tail. */
function openItemsFromProgress() {
  const progress = readIfExists(join(REPO_ROOT, "PROGRESS.md"));
  if (!progress) return "";
  const idx = progress.search(/^##\s+Next\s*\/\s*open item/im);
  if (idx >= 0) return progress.slice(idx).trim();
  return progress.split("\n").slice(-30).join("\n");
}

function which(bin) {
  return sh(`command -v ${bin}`);
}

// ---------------------------------------------------------------------------
// context gathering
// ---------------------------------------------------------------------------

function gatherContext() {
  const branch = sh("git rev-parse --abbrev-ref HEAD") || "(unknown)";
  const status = sh("git status --short") || "(clean working tree)";
  const log = sh("git log --oneline -n 8");
  const diffStat = sh("git diff --stat");
  const stagedStat = sh("git diff --staged --stat");
  const unstaged = cap(sh("git diff"), DIFF_LINE_CAP, "unstaged diff");
  const staged = cap(sh("git diff --staged"), DIFF_LINE_CAP, "staged diff");
  return { branch, status, log, diffStat, stagedStat, unstaged, staged };
}

const ORIENTATION = `Arbor is an agent-specialist marketplace / hive-mind protocol app.
- Primary app: root Next.js app (\`npm run dev\`, port 3000 or fallback).
- Backend: Convex (\`npm run convex:dev\`); auth via Clerk; dev keys in .env.local.
- Read \`convex/_generated/ai/guidelines.md\` before touching any Convex code.
- \`my-app/\` is a SEPARATE Convex/Vite app — not the main site.
- Conventions: rg over grep, small targeted edits, no emojis, update docs/api-keys.md
  when adding a provider secret, verify with typecheck (\`npm run typecheck\`) + tests (\`npm test\`).
- Full agent guidance: AGENTS.md and CLAUDE.md in the repo root.`;

function buildBrief({ ctx, task, target, model }) {
  const stamp = new Date().toISOString();
  const continuation =
    target === "cloud"
      ? `You are a fresh coding agent picking up an in-flight task in this repository (cwd is the repo root). Read the context below, orient yourself with the listed files, then continue the work. Verify with \`npm run typecheck\` and \`npm test\` before declaring done. Make small, targeted edits that match existing conventions. Do not revert the user's uncommitted changes.`
      : `You are an expert engineer advising on an in-flight task. You do NOT have file access — read the context below and respond with: (1) a concrete step-by-step continuation plan, (2) the specific files/functions to change and why, and (3) suggested code or a unified diff where you are confident. Be specific and reference the provided diffs and open items.`;

  return `# Arbor task handoff brief
_Generated ${stamp} · target: ${target} · model: ${model}_

## Your job
${continuation}

## Task to continue
${task}

## Project orientation
${ORIENTATION}

## Current open item (from PROGRESS.md)
${openItemsFromProgress() || "(PROGRESS.md not found)"}

## Git state
- Branch: \`${ctx.branch}\`

### Working tree status (git status --short)
\`\`\`
${ctx.status}
\`\`\`

### Recent commits
\`\`\`
${ctx.log || "(none)"}
\`\`\`

### Changed files (unstaged / staged stat)
\`\`\`
${ctx.diffStat || "(no unstaged changes)"}

--- staged ---
${ctx.stagedStat || "(no staged changes)"}
\`\`\`

## Uncommitted diff (unstaged)
\`\`\`diff
${ctx.unstaged || "(none)"}
\`\`\`

## Uncommitted diff (staged)
\`\`\`diff
${ctx.staged || "(none)"}
\`\`\`

---
End of brief. Continue the task above.
`;
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

function dispatchCloud({ briefPath, model, exec, fullAuto }) {
  if (!which("claude")) {
    console.error("error: `claude` CLI not found on PATH. Install it or use the `local` target.");
    process.exit(1);
  }
  const permMode = fullAuto ? "bypassPermissions" : "acceptEdits";
  const cmd = `cat ${shq(briefPath)} | claude -p --model ${model} --permission-mode ${permMode}`;
  if (!exec) {
    console.log("\nReady to dispatch to CLOUD agent. Run:\n");
    console.log(`  ${cmd}\n`);
    console.log("Add --exec to launch it from this script, or copy the command above into a terminal.");
    return;
  }
  console.log(`\nLaunching cloud agent (claude -p, model=${model}, perms=${permMode})...\n`);
  const r = spawnSync("bash", ["-c", cmd], { cwd: REPO_ROOT, stdio: "inherit" });
  process.exit(r.status ?? 0);
}

function dispatchLocal({ briefPath, model, exec }) {
  if (!which("ollama")) {
    console.error("error: `ollama` not found on PATH. Install it or use the `cloud` target.");
    process.exit(1);
  }
  const responsePath = briefPath.replace(/brief-/, "response-");
  // ollama streams cursor-control ANSI codes even when piped; strip them so the
  // live output and the saved file are both clean text.
  const ESC = "\x1b";
  const stripAnsi = `sed -E 's/${ESC}\\[[0-9;?]*[a-zA-Z]//g'`;
  const cmd = `cat ${shq(briefPath)} | ollama run ${model} | ${stripAnsi} | tee ${shq(responsePath)}`;
  if (!exec) {
    console.log("\nReady to dispatch to LOCAL agent (advisory — no tool access). Run:\n");
    console.log(`  ${cmd}\n`);
    console.log(`Response will be saved to: ${responsePath}`);
    console.log("Add --exec to launch it from this script.");
    return;
  }
  console.log(`\nRunning local agent (ollama ${model}) — advisory, no file access...\n`);
  const r = spawnSync("bash", ["-c", cmd], { cwd: REPO_ROOT, stdio: "inherit" });
  if (r.status === 0) console.log(`\nSaved response to ${responsePath}`);
  process.exit(r.status ?? 0);
}

function shq(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    console.log(HELP);
    process.exit(args.target ? 0 : args.help ? 0 : 1);
  }

  const model =
    args.model ||
    (args.target === "cloud" ? "opus" : args.reasoning ? "deepseek-r1:14b" : "qwen2.5-coder:7b");

  const task =
    args.task ||
    "Continue the current Arbor work. The active open item is described under 'Current open item' below — pick it up and drive it to a verified, working state.";

  const ctx = gatherContext();
  const brief = buildBrief({ ctx, task, target: args.target, model });

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const briefPath = join(OUT_DIR, `brief-${stamp}.md`);
  writeFileSync(briefPath, brief, "utf8");

  console.log(`Wrote handoff brief: ${briefPath}`);
  console.log(`  target=${args.target} model=${model} exec=${args.exec}`);
  if (args.printBrief) {
    console.log("\n--- BRIEF ---\n");
    console.log(brief);
    console.log("--- END BRIEF ---");
  }

  if (args.target === "cloud") {
    dispatchCloud({ briefPath, model, exec: args.exec, fullAuto: args.fullAuto });
  } else {
    dispatchLocal({ briefPath, model, exec: args.exec });
  }
}

main();
