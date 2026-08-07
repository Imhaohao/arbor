# Overnight run checkpoint — 2026-08-07

Purpose: if this session dies, a fresh agent reads THIS FILE and continues
without redoing work. Update after every state change.

Run window: 02:15 -> 08:00 PDT, unattended.
Branch: research/hive-vs-solo. Convex dev deployment: valuable-axolotl-318.
Dev server: already running on http://localhost:3000 (started via preview_start
name "arbor"). Do not start a second one.

## Baseline (measured 02:16)
- `npm run typecheck` exit 0
- `npm test` exit 0
Both must still be 0 at every commit.

## Phase 1 — DONE
`autoresearch/to_human/feature-audit.md` written. 12 graded items with
file:line citations. That file is the work queue; nothing outside it gets built.

## Phase 2/3 queue

Legend: status = queued / implementing / critic-round-N / PASSED / PARKED

| # | Item | Owner model | Status | Critic round | Verdict / blocking reasons |
|---|---|---|---|---|---|
| 1 | Delivered work invisible on multi-step tasks (F) | Sonnet | implementing | - | - |
| 2 | Dashboard fake stats + fake recent tasks + fake user + 429 JSON review queue (F) | Sonnet | implementing | - | - |
| 3 | Replay index: 25 identical rows, false sort claim, $0.00 (F) | Sonnet | implementing | - | - |
| 4 | Specialist directory: 21/1233, no search (C) | Sonnet | implementing | - | - |
| 5 | Task list: no filters, "Disputed" jargon (C) | Sonnet | implementing | - | - |
| 6 | A2A console: uniform LISTED badge, dead empty state (C) | Sonnet | implementing | - | - |
| 7 | Landing onboarding / jargon pass (B) | Opus inline | queued | - | - |
| 8 | Mobile 390px sweep across all routes | TBD | queued | - | - |
| 9 | Dark mode | - | PARKED by scope call | - | See audit item 12: unreachable today (no toggle, 40 dark: utilities total). Deferred unless queue clears. |

## Key measured facts (do not re-derive)

- The lifecycle table is `lifecycle_events` (fields task_id, event_type,
  payload, timestamp). NOT `task_lifecycle_events` — that name does not exist
  and querying it silently returns empty, which produces false "everything is
  broken" readings. I made this mistake once; do not repeat it.
- Multi-step parent tasks emit: task_posted, context_enriched, plan_decided,
  step_started (per child), execution_complete, judge_verdict, settled.
  They never emit `execution_started`. That is the root cause of item 1.
- tasks table: 728 rows — 364 complete, 144 disputed, 108 failed, 40 judging,
  31 planning, 31 requires_payment, 3 awarded, 3 cancelled, 1 bidding,
  1 executing.
- Roster readiness: 1,233 agents — 219 ready, 518 needs key, 13 protocol
  mismatch, 293 endpoint down, 17 mock only, 173 needs owner action.
- The 25 most recent hive_dags all share the "Introduce yourself to the other
  agents at this table" roundtable goal, all complete, all null spend.
- Reputation sparklines on /agents DO render — recharts animates in after the
  screenshot fires. Do not report them as dead charts.

## Browser pane gotcha (confirmed again this run)
Screenshots of a scrolled page come back corrupted — huge white voids with the
sticky nav floating mid-page. Do NOT diagnose layout bugs from a scrolled
screenshot. Use a tall viewport (1440x1600+) at scrollY 0, or DOM-dispatched
verification.

## Hard boundaries (parked, list as "awaiting you")
No git push, no PRs, no deploys. No spending. No account creation, OAuth, or
webhooks. No data deletion, no dropping Convex tables. Dev deployment only.
Do not overwrite the user's uncommitted changes. Commits: current branch,
default git user, never Claude as author, no emojis, no new .md outside
autoresearch/.

Note: `.claude/worktrees/clever-northcutt-3cff48` and
`.claude/worktrees/flamboyant-mcnulty-16abd8` were already modified in the
working tree at session start. Those are the user's — leave them alone.

## Commit log this run
(none yet)
