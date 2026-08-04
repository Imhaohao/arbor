# Arbor Hive Host

A minimal Electron desktop app that hosts the external-agent hive connector
(`scripts/hive-connector.ts`) on this machine, so the hive's external agents
(Devin, v0, Nia, DeepWiki, Context7, Airweave, Vellum) have a real device to
work on and a human-visible control panel for the roundtable session.

Plain Electron: no bundler, no framework. `main.js` (Node/Electron main
process) + `preload.js` (contextBridge) + `renderer/` (HTML/CSS/JS UI).
`contextIsolation` is on and `nodeIntegration` is off — the renderer never
touches Node or `.env.local` directly; all filesystem, process-spawn, and
network work happens in the main process behind `ipcMain.handle`.

## Run it

```
cd desktop
npm install
npm start
```

This app is a client for the main repo, not a standalone product: it shells
out to `npm run hive:connector -- <command>` in the repo root, so it needs
the repo's `.env.local` (one directory up) to have the relevant provider
keys set (`DEVIN_API_KEY`, `V0_API_KEY`, `NIA_API_KEY`, `NEXT_PUBLIC_CONVEX_URL`,
etc. — see `docs/api-keys.md`). Agents whose keys are missing still get a
workspace directory but show as "gated" in the roster panel.

## What it does

- **Roster panel** — runs `npx tsx -e "... import connector-roster ..."` in
  the repo root to read the live roster, cross-references each agent's
  `requiresEnv` against the repo's `.env.local`, and shows active/gated
  status. On startup (and whenever the roster is read) it creates
  `~/ArborHive/workspaces/<agent_id>/` for every roster agent — that
  directory is the "device" each agent gets on this machine — and shows the
  path.
- **Session panel** — shows the current session's goal/dag/task id from
  `autoresearch/data/connector-session.json`. Buttons run the connector CLI
  (`npm run hive:connector -- ...`, via a `child_process` spawned in the
  repo root) and stream stdout/stderr live into the log pane:
  - New session (goal text input) → `session --goal "..."`
  - Run discussion (3 rounds) → `discuss --rounds 3` (this also runs
    `verify` at the end, same as the CLI itself)
  - Verify → `verify`
- **Live board panel** — while a discussion is running, polls the Convex
  board every 5 seconds via `POST {NEXT_PUBLIC_CONVEX_URL}/api/query` with
  `{"path":"scratchpad:forDag","args":{"dag_id":...}}` (no auth needed) and
  renders entries chronologically: agent id, kind, first 200 characters.
- **Azure VM host panel** — display-only. Shows the `az` CLI commands to
  provision a `Standard_B2s` Ubuntu VM and run the connector there on a
  cron schedule, as an alternative always-on host to this desktop app. The
  app never executes these commands.

## Known limitations

- Only one connector command can run at a time; the UI disables the action
  buttons while a run is in flight (tracked by a single `activeRun` in the
  main process).
- The roster probe shells out to `npx tsx`, which is slower than a native
  parse; if it fails (e.g. no network on a cold `npx` cache) the app falls
  back to a hardcoded copy of the roster kept in `main.js`, which can drift
  from `lib/hive/connector-roster.ts` if the roster changes.
- No packaging/signing — this is a dev-mode `npm start` app only, not built
  into a distributable `.app`/`.exe`.
- The Azure panel is reference text; setting up the VM (installing the
  Azure CLI, `az login`, running the commands, copying `.env.local`) is a
  manual, separate operation.
