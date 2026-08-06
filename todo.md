# UI/UX todo — remaining gaps from the 2026-08-03 audit

Full-site button sweep + two-month feature audit. Everything listed here was
verified non-functional or missing at audit time; everything not listed was
click-tested and works (landing post flow, dashboard filters, replay playback,
admin A2A console, present deck, footer/sidebar nav).

## Buttons that remain non-functional

None. The 2026-08-03 audit's four dead controls were closed on 2026-08-05:
Feedback, Help Center, and the Auctions/Credits/Analytics/Settings placeholder
nav were removed (no destination existed and none was in scope to build), and
`/tasks` was built on live Convex data with both the dashboard "View all"
control and the sidebar "Tasks" link pointed at it.

Note for whoever demos this: `convex/taskList.ts` deliberately excludes
golden-task audit runs. The audit lane posts up to 24/day through the normal
auction, and unfiltered it swamps the page with arithmetic and extraction
drills instead of real marketplace activity. The filter is UI-only — bidders
still see audit tasks as ordinary tasks in the auction.

## Honesty / data gaps behind visible UI

- Dashboard stat cards and "Recent tasks" rows are illustrative (labeled), not
  live buyer analytics.
- ~~ValueImpactPanel fake savings/efficiency claims~~ FIXED 2026-08-04: panel
  now shows measured counterfactual savings (`lib/honest-savings.ts`) and
  lifecycle-measured execution time; headroom is labeled "Budget unspent",
  the 30-minute baseline constant is deleted. Browser-verified on a live task.
- ~~Task execution fails live with provider 429s~~ RESOLVED 2026-08-04: the
  Azure lane (gpt-5.4-mini agent / gpt-5.6-terra judge) executes end-to-end;
  see the demo run-sheet below. Direct OpenRouter/OpenAI accounts remain at
  zero credit, so specialist runners that bypass the Azure lane still 429.

## Features still lacking a UI surface (backend exists)

- Bid calibration (`bids.p_accept`, reject-slash): deliberately not surfaced —
  BidWindow renders sealed bids from lifecycle events pre-close, so showing
  calibrated confidence needs a post-close design in AuctionResolution.
- Golden-task / battery lane (`convex/battery.ts`, `goldenTaskAudit.ts`): all
  queries are internal-only. Precondition met as of 2026-08-04 — `battery_runs`
  holds ~400 funded, graded rows (batteries e17aeedf..93d45119 and E3/E5
  sweeps) — so the public admin query + table is now buildable.
- Codebase-explainer lessons: rendered audio/video will appear in the new
  Media artifacts panel, but there is no transcript/lesson viewer for the
  two-host script itself.
- Reputation cold-start prior (`convex/reputationPrior.ts`): internal-only; a
  "cold start prior" badge on SpecialistCard needs a new public query.
- Learned delegation head: per-candidate `routing_score`/`learned_score` are
  written to `hive_node_routed` events but no "why this agent" panel reads
  them.
- Stock media module (`lib/stock/*`): not wired into any runtime path at all
  (only `scripts/render-video.ts` uses it) — integration before UI.

## Demo run-sheet (measured 2026-08-06, capped roster)

The flow works on the Azure lane. Measured over 22 realistic buyer tasks with
`ARBOR_MAX_SOLICITED_AGENTS=40`: 11/22 reach a judged deliverable, median
128s, 0 auctions fail outright, and 85.7% of wins go to a genuine specialist
rather than an Arbor floor agent.

Demo these four. All are single-step, accepted by the judge, and land in
about two minutes:

| Task | Winner | Time |
|---|---|---|
| `copy-water-bottle` (copywriting) | reacher-social | 111s |
| `organic-pr-review` | arbor-baseline | 116s |
| `campaign-electrolyte-full` | reacher-social | 128s |
| `organic-trip-planning` | reacher-social | 132s |

Prompts are in `scripts/demo-reliability.ts`. Re-measure any time with:
`npx tsx scripts/demo-reliability.ts --timeout-ms 600000`

Do NOT demo a compound/multi-step task. Child auctions run sequentially at
~2 min each, and 6/22 parents ended `blocked_on_failed_child`.

## Known-bad agents

- ~~`nia-context` / `aws-knowledge` / `twilio-docs` fail on
  `partial_receipt: missing external_session_id`~~ FIXED 2026-08-06. Not an
  agent bug: the receipt rule demanded a session id that MCP has no concept
  of, so *every* `mcp-forwarding` specialist (~1,000 catalog + discovered)
  could win an auction but never complete one. The rule is now
  transport-aware — MCP proves fulfilment with audited tool calls, A2A still
  requires a session id. See `lib/receipt-rule.ts`. Verified by reposting the
  three failed tasks: 3/3 judged, 0 receipt failures, and the MCP agent
  `twilio-docs` ran `execution_started -> execution_complete ->
  judge_verdict -> settled`.
- `openzeppelin-contracts` won an auction with no registered runner at all
  ("No specialist runner registered"). A discovered specialist can bid
  without being executable — still open, worth a registry-level guard.

Note the 11/22 figure in the run-sheet above predates the receipt fix and is
now a floor, not a current measurement — MCP winners that previously failed
outright can now settle. Re-run the harness for a current number.

## Verification caveats

- Media artifacts panel (`components/task/MediaArtifactsPanel.tsx`) ships
  fail-soft and typechecks, but the dev deployment has zero `media_artifacts`
  rows, so it has not been seen with real files. Run a media DAG (or upload)
  to confirm players render.
- The in-app browser pane's click injection is unreliable on deeply scrolled
  pages; handlers there were verified by DOM-dispatched clicks plus
  `elementFromPoint` hit-testing rather than injected pointer events.
