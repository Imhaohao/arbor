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
| 0 | Landing page CRASHED with no WebGL2 (F, found mid-run) | Opus inline | DONE, committed 5fe24ff | - | Verified by screenshot: gradient fallback renders |
| 1 | Delivered work invisible on multi-step tasks (F) | Sonnet | implemented, committed 9ba7ccc | critic running | - |
| 2 | Dashboard fake stats + fake recent tasks + fake user + 429 JSON review queue (F) | Sonnet | UNFIXED - agent KILLED by spend limit mid-edit | - | convex/buyerAnalytics.ts written+committed (b97f8e3) but UI never wired. HIGHEST REMAINING VALUE. |
| 3 | Replay index: 25 identical rows, false sort claim, $0.00 (F) | Sonnet | implemented, committed ec78b16 | critic running | Verified by screenshot: contested runs now rank first, spam collapsed to +202 |
| 4 | Specialist directory: 21/1233, no search (C) | Sonnet | done, committed 7ce810b | none - critics dead | Open: card shows Reputation 0.55 and Overall 0.91 with no explanation; stripe-payments says "1 task measured" but "Accepted 0 / Disputed 0". |
| 5 | Task list: no filters, "Disputed" jargon (C) | Sonnet | done, committed ed2bc2c | none - critic KILLED | - |
| 6 | A2A console (C) | Sonnet | committed e4cc0a3; ROUND 2 KILLED BEFORE STARTING | round 1 by me = REJECT | FALSE "endpoint down" warning for the loopback (answers HTTP 200). Badge says ready while subtitle says no A2A endpoint. Needs re-fix. |
| 7 | Landing onboarding / jargon pass (B) | Opus inline | implemented, committed 190ce8b | - | - |
| 8 | Mobile 390px sweep across all routes | Opus inline | partial: task header clipped $ at 390px, fixed + committed eeaa6bb | - | Landing verified clean at 390px. Remaining routes pending their implementers. |
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

## Screenshot harness (IMPORTANT — use this, not raw headless Chrome)

`/private/tmp/claude-501/-Users-yanzihao-Documents-miyohacks/5a9cec11-3a72-4422-8dbf-18eb92b47fb7/scratchpad/shot.mjs`

    cd <scratchpad> && node shot.mjs "<url>" out.png 1440 1000 "" true

puppeteer-core is installed IN THE SCRATCHPAD ONLY (repo package.json is
untouched). It waits for Convex websocket data and for shimmer skeletons to
clear before capturing.

Do NOT use `chrome --headless --virtual-time-budget` for any Convex-backed
page: virtual time fast-forwards past the websocket, so every capture comes
back as a "Loading tasks..." skeleton. I wasted a set of before-shots on this.
It is fine for the static landing page only.

`position: fixed` elements (the "See latest" pill) appear mid-page in fullPage
screenshots. That is a capture artifact, not a layout bug.

## Competitor reference shots for the blind comparison
`<scratchpad>/refs/codex.png`, `refs/cowork.png`, `refs/openclaw.png` —
captured 02:29 from openai.com/codex, claude.com/cowork, openclaw.ai.

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
- 5fe24ff fix(hero): survive missing WebGL2 instead of crashing the landing page
- 190ce8b copy(landing): remove auction jargon a first-time visitor cannot parse
- 9ba7ccc fix(task): show the delivered work on multi-step tasks
- ec78b16 fix(replay): rank by real contention and stop claiming $0.00
- eeaa6bb fix(task): stop the task header clipping the budget at 390px
- e4cc0a3 feat(admin): show real per-agent readiness in the A2A console (has a noted open defect)

## RUN ENDED EARLY - 2026-08-07 ~03:20

The account hit its MONTHLY SPEND LIMIT. All six in-flight subagents died at
once and no further agents could be spawned. Consequences:

- The entire Phase 3 critic loop never ran. ZERO critic verdicts exist. No
  surface in this run has been independently reviewed.
- The blind comparison vs Codex / Cowork / OpenClaw never ran. Reference shots
  were captured successfully and are in the scratchpad, but that scratchpad is
  session-scoped and will not survive.
- Item 2 (dashboard) and item 6 round 2 were left unfinished.

Final tree state verified at 09:50: `npm run typecheck` exit 0, `npm test`
exit 0. Nine commits on research/hive-vs-solo. Nothing pushed.

Unchased lead from a critic that died mid-thought: it reported finding tasks
carrying BOTH a `failed` lifecycle event AND a full deliverable, and was
checking whether the ExecutionPanel change now renders a deliverable on a
failed task. Neither confirmed nor refuted. Check this first.

Full write-up: autoresearch/to_human/overnight-2026-08-07.md
