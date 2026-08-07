# Arbor feature audit — 2026-08-07 (overnight run, Phase 1)

Method: dev server on `http://localhost:3000` (Convex dev `valuable-axolotl-318`),
every route walked in the in-app Browser pane at 1440x900 and 1440x1600, plus
source reading and direct Convex queries to check whether on-screen claims are
backed by stored data. Grades are honest and default low: a surface only earns
an A if it is correct, legible to a non-expert, and every number on it is
measured.

Baseline at audit time: `npm run typecheck` exit 0, `npm test` exit 0.

Grade key: A = ship it. B = correct but rough. C = works, real usability or
honesty gap. F = broken, misleading, or unusable.

---

## Summary of the queue

| # | Item | Surface | Grade | Kind |
|---|---|---|---|---|
| 1 | Delivered work is never shown on multi-step tasks | `/task/[id]` | F | correctness |
| 2 | Dashboard stat cards are hard-coded fiction | `/dashboard` | F | honesty |
| 3 | Review queue dumps raw provider 429 JSON | `/dashboard` | F | honesty/UX |
| 4 | Replay index is 25 identical rows | `/replay` | F | usability |
| 5 | Signed-in identity is a hard-coded placeholder | sidebar | F | honesty |
| 6 | Specialist directory: 21 of 1,233, no search | `/agents` | C | usability |
| 7 | Task list has no filters and leaks jargon | `/tasks` | C | usability |
| 8 | A2A console shows a uniform "LISTED" badge | `/admin` | C | honesty |
| 9 | Landing page | `/` | B | onboarding |
| 10 | Pitch deck | `/present` | B | polish |
| 11 | Task detail (single-step path) | `/task/[id]` | B | polish |
| 12 | Dark mode is configured but unreachable | sitewide | C | scope call |

---

## 1. Delivered work is never shown on multi-step tasks — F

**What it does.** `/task/[id]` is the buyer's receipt: the brief, the plan, the
auction, the judge's verdict, and the work that was actually delivered.

**How it works underneath.** `TaskView` picks a panel set based on whether the
task is a multi-step parent (`components/task/TaskView.tsx:120`). Either branch
renders `ExecutionPanel`, which is the only component that prints
`task.result.text` — the deliverable itself.

**The defect.** `ExecutionPanel` bails out on the presence of a single lifecycle
event:

- `components/task/ExecutionPanel.tsx:174` — `const started = events.find(e => e.event_type === "execution_started")`
- `components/task/ExecutionPanel.tsx:181` — `if (!started) return null;`

Multi-step parent tasks never emit `execution_started`. They emit
`plan_decided`, then one `step_started` per child, then `execution_complete`.
So the gate fails and the panel returns null — while the finished deliverable
sits in `task.result.text`, unread.

**Measured, not assumed.** Direct Convex query against `valuable-axolotl-318`:

- Task `js7cjxn2jxas0ggjcj7jqt35v98c1thj`: `status: "complete"`,
  `result.text` is 1,396 characters, event types are
  `[task_posted, context_enriched, arbitrator_agent_discovery_started,
  plan_decided, step_started, arbitrator_agent_discovery_failed, step_started,
  execution_complete, judge_verdict, settled]` — no `execution_started`.
- Sampling the 60 most recent tasks that hold a non-empty `result.text`:
  **10 of 60 (17%) render none of it.** Every one of the 10 is a multi-step
  parent. Single-step tasks are unaffected.

**Why this is the worst item on the list.** The buyer pays, sees a green
"Accepted" verdict and a 74% quality score, and cannot read the answer they
bought. The judge quotes the work; the buyer cannot see it.

**Correction to an earlier read:** I first measured this as 319/319 tasks. That
was wrong — my query used a table name (`task_lifecycle_events`) that does not
exist, so the "has an execution_started event" set was empty and every task
looked broken. The real table is `lifecycle_events`. The 10/60 figure above is
from the corrected query.

## 2. Dashboard stat cards are hard-coded fiction — F

**What it does.** Four hero metrics at the top of `/dashboard`: Active tasks 3
(+1 today), Credits 2,400 (+200 this week), Win acceptance 92% (+4 pts), Avg
turnaround 2m 14s (-18s).

**How it works underneath.** It does not. `app/dashboard/page.tsx:36-41` is a
literal array. The trend deltas are literals too — the green up-arrows are
decoration, not measurement.

**The defect.** Below them, `app/dashboard/page.tsx:43-48` hard-codes four
"Recent tasks" with invented specialist names (Conversion Copy AI, Vercel v0).
There is a one-line disclaimer at `app/dashboard/page.tsx:99` and an
"Illustrative" badge at `:142`, but the numbers are rendered at 40px in the
primary visual position and the disclaimer is 13px grey. A first-time visitor
reads "92% win acceptance" as this marketplace's real acceptance rate.

The real number is knowable and much less flattering: of 728 tasks in the dev
deployment, 364 are `complete`, 144 `disputed`, 108 `failed`. Showing a measured
50% completion rate is more credible than an invented 92%.

## 3. Review queue dumps raw provider 429 JSON — F

**What it does.** The Hive "Needs review" panel is meant to be a human review
queue for low-confidence agent output.

**The defect.** It renders raw upstream error bodies verbatim, eight times in a
row, each one an unescaped OpenAI quota error including the provider's docs URL:
`hive_backstop_failed: Model API error 429: { "error": { "message": "You
exceeded your current quota, please check your plan and billing details...`.

This is the first thing below the fold on the operator's home screen. It leaks
provider internals, it is identical eight times, and it tells the operator
nothing actionable. A review queue should say "8 runs failed: provider quota
exhausted" with one entry and a retry, not paste the stack.

## 4. Replay index is 25 identical rows — F

**What it does.** `/replay` lists recorded DAG runs. Subtitle: "Settled runs,
most-contested first. The rejections are the point."

**The defect.** Two claims in that one sentence are false.

- *Most-contested first*: `components/replay/ReplayIndex.tsx:13` calls
  `api.hiveReplay.recentReplays` — recency order, not contention order.
- *The rejections are the point*: the rejected pill at
  `components/replay/ReplayIndex.tsx:47` only renders when `row.rejects > 0`.
  No visible row has one.

Confirmed against Convex: the 25 most recent `hive_dags` all share the goal
"Introduce yourself to the other agents at this table...", all `complete`, all
with null spend rendered as `$0.00`. The page is 25 visually identical rows with
no date, no winner, and no way to tell them apart. The genuinely interesting
runs are buried behind the roundtable spam.

## 5. Signed-in identity is a hard-coded placeholder — F

`components/ui/nav-user.tsx:17-18` defaults to `name = "Jamie Sole"`,
`org = "Stackform"`. The sidebar presents an invented person as the signed-in
user. It is also visually broken: the avatar overlaps the name, so it renders as
"amie Sole" at 1440x900.

## 6. Specialist directory — C

`/agents` is titled "Every specialist in the network" and renders 21 cards. The
network has 1,233 agents (the dashboard readiness matrix counts them: 219 ready,
518 needs key, 293 endpoint down). There is no search, no filter, no sort, and
the cards are not clickable — `read_page` finds 7 interactive elements on the
entire page, all of them nav. You cannot find a specialist in a specialist
directory.

Card internals are good and honest: live MCP endpoint URLs, per-axis reputation
sub-scores, "N tasks measured", cost baseline. Reputation charts do render (I
initially misread them as empty — recharts animates in after the screenshot;
the SVG paths are present with real point data).

One incoherence: `reacher-social` shows "Completed 1 / Disputes 4 / Dispute rate
80%". Four disputes against one completed task needs explaining or the
denominators are wrong.

## 7. Task list — C

`/tasks` is real live data, correctly ordered, and every row links to a working
detail page. Three gaps: no status filter or search over 728 tasks; the primary
status word is "Disputed", which reads as a legal dispute rather than "the judge
rejected this"; and rows show "budget $2.00 · paid $0.82" with no explanation of
why those differ. Six of the first nine rows are Disputed or Failed, which is
honest but makes the marketplace look broken with no framing.

## 8. A2A console — C

`/admin` is the strongest engineering surface: it talks to real agent endpoints
and the "Agent negotiations" section at the bottom shows genuine multi-turn A2A
threads with context ids and timestamps.

Two gaps. Every one of the 20+ specialists carries the same grey "LISTED" badge,
even though the app knows the real per-agent state (ready / needs key /
protocol mismatch / endpoint down) and shows it on the dashboard — so the
console invites you to message an agent that cannot answer. And the chat pane is
~1,100px of empty white with a single sentence in it.

## 9. Landing page — B

Genuinely good: the shader hero is striking, the copy is plain-language ("Post
in plain language, get sealed bids in seconds, and pay only for what actually
ships"), and the bid demo is explicitly labelled "ILLUSTRATIVE WORKFLOW" with
the footnote "Illustrative second-price outcome — actual price and result depend
on eligible supply." That is the honesty standard the dashboard should meet.

Gaps: "you pay the runner-up's price, not the winner's" is second-price-auction
jargon presented without explanation; and the hero occupies a full viewport
before any explanation of what an agent marketplace is.

## 10. Pitch deck — B

`/present` is a clean 6-slide deck with working prev/next, a slide counter, and
a fullscreen control. At tall viewports the fixed-height slide leaves large dead
space. Low priority — it is an internal surface.

## 11. Task detail, single-step path — B

Everything except item 1 works well: plan decomposition with per-step specialist
hints and honest "delivered by X" attribution when the hint and the actual
winner differ; judge verdict with full reasoning; a quality score; and a human
override with both accept and reject. The override framing — "The judge is
advisory. A buyer/operator can override it with an explicit reason" — is exactly
right. The floating "See latest" pill overlaps content.

## 12. Dark mode — C, and a scope call

`tailwind.config.ts:5` sets `darkMode: ["class"]`, but nothing in the app ever
sets that class, there is no toggle, and there are only 40 `dark:` utilities in
the entire codebase — 13 of them concentrated in two task panels. There is no
`prefers-color-scheme` handling in `app/globals.css`.

So dark mode is currently unreachable rather than broken. Building a real dark
theme across 56 components is a multi-hour job with high regression risk against
the rest of this queue. **Autopilot scope call: dark mode is deferred to the end
of the night and only attempted if the queue clears.** Recorded here rather than
silently dropped.

---

## What is deliberately NOT in the queue

- Bid calibration, golden-task lane, reputation cold-start prior, learned
  delegation head, stock media module. `todo.md` lists these as backend-only
  with no UI. They are new features, not repairs, and the queue above is repairs
  and honesty first.
- Anything requiring spend, deploys, account creation, or pushes — parked per
  the run's hard boundaries.
