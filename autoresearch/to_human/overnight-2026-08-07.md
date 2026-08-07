# Overnight run — 2026-08-07

## Read this first, in plain language

Arbor works. I walked every screen as a first-time visitor would, found a
handful of things that were either broken or quietly dishonest, and fixed most
of them. Nine commits landed on `research/hive-vs-solo`. Nothing was pushed,
nothing was deployed, no money was spent.

The two worst things I found were not cosmetic. First, the home page **crashed
to an error screen** on any computer without modern 3D graphics support — an
older laptop, a virtual machine, a locked-down work browser. Not slow, not
ugly: a dead page. Second, when you gave Arbor a job that took more than one
step, you paid for it, you saw a green "Accepted" stamp and a quality score —
and **you could never actually read the answer you bought**. It was sitting in
the database the whole time; the screen just refused to show it. Both are fixed
and I have screenshots proving it.

The rest was honesty work. The operator dashboard was showing invented numbers
("92% win acceptance", "2,400 credits", a fake signed-in user called Jamie
Sole). The replay page promised "most-contested first" and then showed
twenty-five identical rows all claiming "$0.00". The specialist directory was
titled "Every specialist in the network" while showing 21 out of 1,248, with no
way to search. Most of that is now either measured or honestly labelled.

**The run ended early and I need to be straight with you about it.** At roughly
03:20 the account hit its monthly spend limit. Every background helper I had
running died at once, mid-sentence, and I could not start any more. That killed
the entire quality-control stage: not one of the three independent reviewers
finished, and the blind side-by-side against Codex, Cowork and OpenClaw never
ran. So the work below is done and self-checked, but it has **not** been
adversarially reviewed the way you asked for. The dashboard — the single
biggest honesty problem — is still showing fake numbers, because the helper
fixing it died halfway through.

---

## Feature-by-feature

Grades are mine. "Critic verdict" is empty almost everywhere because the critic
stage never ran — I am not going to invent verdicts to fill a column.

| # | Feature | Before | After | Critic verdict | Evidence |
|---|---|---|---|---|---|
| 0 | Landing hero (WebGL crash) | F | A | none — critics never ran | VERIFIED by screenshot |
| 1 | Task delivery visible (multi-step) | F | A | none — critic died mid-run | VERIFIED by screenshot |
| 2 | Dashboard fake stats / fake user / 429 dump | F | **F, unfixed** | n/a | Query written, UI never wired |
| 3 | Replay index | F | A | none — critic died mid-run | VERIFIED by screenshot |
| 4 | Specialist directory | C | B | none | VERIFIED by screenshot |
| 5 | Task list | C | A | none — critic died mid-run | VERIFIED by screenshot |
| 6 | A2A console | C | C | REJECTED by me, round 1 | Fix attempt never started |
| 7 | Landing copy / jargon | B | A | none | VERIFIED by screenshot |
| 8 | Mobile 390px | C | B (partial) | none | Landing + task VERIFIED; others unswept |
| 9 | Dark mode | C | C | n/a | PARKED by scope call, see below |
| 10 | Pitch deck `/present` | B | B | n/a | Untouched |
| 11 | Post-a-task intake flow | — | A | none | VERIFIED end to end on a live task |

---

## VERIFIED — I looked at it, or a gate passed

- `npm run typecheck` exits 0 and `npm test` exits 0 on the final tree. Run at
  09:50 after every change landed.
- **The WebGL crash is real and is fixed.** `canvas.getContext("webgl2")` was
  non-null-asserted at `components/ui/animated-shader-hero.tsx:65`. With no
  WebGL2 the page threw `Cannot read properties of null (reading 'viewport')`
  and rendered a Next.js error overlay instead of the product. I reproduced it,
  then fixed it, then re-shot the page and watched the blue gradient fallback
  render correctly.
- **The hidden-deliverable bug is real and is fixed.** Task
  `js7cjxn2jxas0ggjcj7jqt35v98c1thj` is `status: complete` with 1,396
  characters in `result.text` and no `execution_started` event. `ExecutionPanel`
  returned null on that gate. Measured across the 60 most recent tasks holding a
  deliverable: 10 rendered nothing. After the fix, that task renders a "Final
  deliverable — Combined from 2 steps" card containing the full answer.
- **The whole marketplace pipeline works.** I posted a real task through the
  public form and watched it run: intake turned my one-line prompt into a brief
  with success criteria, ranked three specialists with plain-language reasons,
  ran context enrichment (Hyperspell and Nia both honestly reported they found
  nothing useful), ran a sealed auction, and returned a judge verdict of
  **rejected**. Task `js728twqvbvye6xse4q9e9x8f18c08s2`. The judge rejecting it
  is good news, not bad — the marketplace is not rubber-stamping work.
- `/replay` now ranks genuinely contested runs first (11/12, 5/10, 5/15, 4/6
  rejected) with real spend ($18.39, $19.55, $12.38) and relative dates, and the
  203 duplicate roundtable runs collapse into one row reading "+202 more with
  this same goal".
- `/tasks` has working search and status filters with live counts
  (All 522 / In progress 99 / Delivered 300 / Rejected by judge 77 / Failed 45 /
  Cancelled 1) and no longer calls a judge rejection a "Dispute".
- `/agents` now says "Showing 24 of 1,248 matching specialists" instead of
  claiming to show every specialist, and has search plus transport filters.
- The task header no longer clips the budget at 390px. Before and after shots.
- The A2A loopback endpoint answers HTTP 200 — I tested it with curl. This
  matters because the console now claims it is down (see below).

## BELIEVED — plausible, but I did not confirm it

- That the five surface reworks have no regressions beyond what I spot-checked.
  Typecheck and tests pass, and each implementer reported its own browser check,
  but **no independent reviewer confirmed any of it**. Implementers marking
  their own homework is exactly what the critic stage existed to prevent.
- That `/agents`, `/replay`, `/tasks` and `/admin` are clean at 390px. Their
  implementers each claim to have checked; I only verified the landing page and
  the task page myself.
- That the bounded scans introduced this run (`take(2000)` in `taskList.ts`, a
  400-DAG window in `hiveReplay.ts`) stay correct as the tables grow. I flagged
  this for the critics precisely because a silent cap would make an on-screen
  count quietly false, and that review never happened.
- That the "Directory only 1,140" bucket on `/agents` is the right call. It is
  honest — we genuinely know nothing about 91% of the roster — but I never got a
  second opinion on whether surfacing them at all is right.

## Things I found and did NOT fix

- **`/agents` shows two different scores with no explanation.** A card reads
  "Reputation 0.55" at the top and "Overall · 0.91" at the bottom. A reader
  cannot tell which is the real one.
- **`/agents` contradicts itself on `stripe-payments`**: "1 task measured" next
  to "Accepted 0 / Disputed 0". One of those is wrong.
- **The task-recommendation list surfaces junk.** My live task was offered
  "Pythondev Pro Egw Writings Server" and "Motorboy1 My Server" at 0.90 fit,
  with byte-identical descriptions. They are real registry entries, so this is
  not fabricated — but it is not something you would put in front of a customer.
- **A dead critic left a lead I could not chase**: it reported finding tasks
  that have both a `failed` event and a full deliverable, and was checking
  whether my ExecutionPanel change now renders a deliverable on a failed task.
  I could not confirm or refute this. Worth checking first thing.

## Parked — awaiting you

- **Everything behind the hard boundaries**, untouched as instructed: no push,
  no PR, no deploy, no spending, no account/OAuth/webhook creation, no data
  deletion. Dev deployment `valuable-axolotl-318` only; prod never touched.
- **The spend limit itself.** This is the blocker. Raising it is a billing
  decision and yours alone — I did not and will not act on it.
- **Item 2, the dashboard.** Still renders four hard-coded stat cards
  (`app/dashboard/page.tsx:36-41`), four invented "Recent tasks"
  (`:43-48`), a fake signed-in user "Jamie Sole / Stackform"
  (`components/ui/nav-user.tsx:17-18`), and a review queue that pastes raw
  OpenAI 429 error bodies eight times over. The measured replacement query is
  written, committed and correct (`convex/buyerAnalytics.ts`) — it just needs
  the UI swapped onto it. This is the highest-value remaining work.
- **Item 6, the A2A console — I rejected it and the fix never ran.** The
  readiness badges are a real improvement, but the change introduced a *new*
  false statement: it shows an amber warning saying the Arbor Market loopback is
  "endpoint down" when that endpoint answers 200. It also badges agents "ready"
  while the line beneath says "no direct A2A endpoint". Replacing a vague wrong
  claim with a confident wrong claim is worse, not better. Committed as `e4cc0a3`
  with the defect named in the commit message so it cannot be lost.
- **Dark mode.** Deliberate scope call, made because you were asleep:
  `tailwind.config.ts:5` sets `darkMode: ["class"]` but nothing ever sets that
  class, there is no toggle, and there are 40 `dark:` utilities in the whole
  codebase. So dark mode is *unreachable*, not broken — nothing renders badly in
  it today because nobody can get to it. Building a real theme across 56
  components was several hours with high regression risk against a queue full of
  genuine defects. I chose the defects. Flagging it rather than burying it.
- **The blind comparison against Codex, Cowork and OpenClaw never ran.** I did
  capture all three reference screenshots successfully at 02:29 (they are in the
  session scratchpad), but the comparison itself was a critic job and no critic
  survived. I am not going to give you a winner I did not actually measure.

## Delegation and cost

| Agent | Model | Job | Tool calls | Output tokens | Outcome |
|---|---|---|---|---|---|
| Task delivery fix | Sonnet | Item 1 | 48 | 132,160 | Completed, committed |
| Replay index | Sonnet | Item 3 | 61 | 144,142 | Completed, committed |
| A2A console | Sonnet | Item 6 | 78 | 167,471 | Completed, then rejected by me |
| Task list | Sonnet | Item 5 | 103 | 183,190 | Completed, committed |
| Specialist directory | Sonnet | Item 4 | 110 | 192,947 | Completed, committed |
| Dashboard honesty | Sonnet | Item 2 | — | — | KILLED by spend limit mid-edit |
| Critic: task delivery | Opus | Phase 3 | — | minimal | KILLED before verdict |
| Critic: replay | Opus | Phase 3 | — | minimal | KILLED before verdict |
| Critic: task list | Opus | Phase 3 | — | minimal | KILLED before verdict |
| A2A console round 2 | Sonnet | Item 6 refix | — | — | KILLED before starting |

Roughly 820k output tokens across six Sonnet implementers. Six of ten spawned
agents died to the spend limit. Model routing followed the ladder: every
implementer was Sonnet (scoped, single-surface, clear spec), every critic was
Opus (judgment role), and I kept the cross-cutting and money-adjacent work
inline — the WebGL fix, the landing copy, the mobile header fix, all commits,
and every Convex data query used to check whether an on-screen claim was true.

## Assumptions I made on your behalf

Per the autopilot profile, resolved without asking:

1. **Dark mode deferred** rather than half-built. Smaller verifiable slice
   first; stated rather than silently dropped.
2. **Posted a real task** through the live form, on the reasoning that "walk
   every route as a real user, submit every form" authorises it and that running
   an LLM call on existing Azure credit is ordinary app operation, not a
   purchase. It cost cents and it proved the core pipeline works.
3. **Committed the unwired `buyerAnalytics.ts`** rather than deleting it or
   leaving it untracked, with "NOT YET WIRED UP" in the commit message. It is
   good work and the remaining step is small.
4. **Committed the A2A console despite rejecting it**, with the defect written
   into the commit message, so the improvement is preserved and the flaw is
   traceable rather than lost in an uncommitted tree.
5. **Installed puppeteer-core into the scratchpad, not the repo.** Plain headless
   Chrome returns loading skeletons for every Convex-backed page, which silently
   invalidated my first set of screenshots. `package.json` is untouched.

## One correction worth recording

Early on I measured this bug as affecting 319 of 319 tasks and nearly wrote that
into the audit. It was wrong: I had queried a table name that does not exist
(`task_lifecycle_events`; the real one is `lifecycle_events`), so the comparison
set was empty and every task looked broken. The true figure is 10 of 60 sampled.
I caught it before it reached the audit. Noting it because a silently-empty
query returning a dramatic number is a trap this codebase sets more than once —
it is now written into the checkpoint file.

## Where to pick up

`autoresearch/data/overnight/CHECKPOINT.md` has per-item status, the measured
facts worth not re-deriving, and the screenshot-harness instructions. In order:

1. Raise or confirm the spend limit — everything else is gated on it.
2. Wire `/dashboard` onto `convex/buyerAnalytics.ts` and kill the fake cards,
   the fake user, and the 429 dump. Highest remaining value.
3. Re-fix the A2A console's false "endpoint down" warning.
4. Run the critic loop and the blind comparison that never happened.
