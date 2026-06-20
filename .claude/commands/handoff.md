---
description: Hand off the current Arbor work to a strong cloud agent or a local Ollama agent
argument-hint: cloud|local [--task "..."] [--exec] [--full-auto] [--reasoning] [--model x]
allowed-tools: Bash(node scripts/handoff.mjs:*), Read
---

Continue the current Arbor task on another agent using the handoff engine.

Requested target and options: `$ARGUMENTS`

Do this:

1. If `$ARGUMENTS` is empty or doesn't start with `cloud` or `local`, run
   `node scripts/handoff.mjs --help`, show the usage, and stop.
2. Otherwise run `node scripts/handoff.mjs $ARGUMENTS`.
3. Read the generated brief file the script prints (path under `.claude/handoff/`)
   and confirm in one or two sentences that it captured the right task and the
   current repo/diff state.
4. Report the outcome:
   - If `--exec` was NOT passed: show the exact dispatch command the script
     printed and the brief path, so the user can launch it themselves.
   - If `--exec` WAS passed: summarize what the downstream agent did (cloud) or
     returned (local), including the saved response path for local runs.

Notes:
- `cloud` = full agentic continuation via `claude -p` (has tools, edits files).
  Use `--full-auto` to skip permission prompts in the spawned agent.
- `local` = advisory continuation via Ollama (plan/patch only, no file access);
  `--reasoning` switches it to `deepseek-r1:14b`.
- Default model: cloud=`opus`, local=`qwen2.5-coder:7b`. Override with `--model`.
