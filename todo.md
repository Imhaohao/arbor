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

## Demo run-sheet (measured 2026-08-06, post receipt fix)

The flow works end to end on the Azure lane. Latest full 22-task batch with
`ARBOR_MAX_SOLICITED_AGENTS=40` (`scripts/data/post-receipt-fix-22.json`):

| | Uncapped | + roster cap | + receipt fix |
|---|---|---|---|
| Reached a judged delivery | 9/22 | 11/22 | **21/22 (95.5%)** |
| Judge accepted | 5/22 | 5/22 | **11/22 (50%)** |
| Hard failures | — | 4/22 | **1/22** |
| Blocked on a failed child | — | 6/22 | **0** |
| Timed out incomplete | 12/22 | 1/22 | **0** |
| Auction failed outright | — | 0/22 | **0/22** |

Median time to judged delivery rose 128s -> 252s. That is the expected cost
of the fix, not a regression: tasks that used to die at step 0 now execute to
completion, so the median covers full multi-step chains instead of early
failures.

**Compound tasks now work** — the earlier "do not demo a multi-step task"
warning is obsolete. Five multi-step tasks delivered accepted this run
(`quickstart-stripe-connect`, `quickstart-tiktok-shop`,
`organic-stripe-codebase`, `organic-youtube-short`,
`startup-launch-plan-electrolyte`), though they take 4-12 min end to end, so
prefer a single-step task if the demo is time-boxed.

Fastest single-step tasks accepted in BOTH the last two runs — the safest
picks, ~2 min each:

| Task | Winner (varies) | Time |
|---|---|---|
| `organic-trip-planning` | arbor-hive-backstop | 131s |
| `organic-pr-review` | arbor-baseline | 158s |

Also accepted this run, all previously failing: `organic-rubric-compare`
(137s, aws-knowledge), `docs-convex-scheduled-fn` (153s, nia-context),
`docs-nextjs-streaming` (159s, nia-context).

Winners are decided by a live auction and shift between runs — do not promise
a specific agent on stage. `copy-water-bottle` was on the previous run-sheet
and failed this run when nia-context outbid reacher-social and then made no
successful tool calls.

Prompts are in `scripts/demo-reliability.ts`. Re-measure with:
`npx tsx scripts/demo-reliability.ts`
Single task: `npx tsx scripts/demo-reliability.ts --only organic-pr-review`

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
  Confirmed on the full batch: nia-context now wins and completes, taking
  `docs-convex-scheduled-fn` (accepted, 153s) and `docs-nextjs-streaming`
  (accepted, 159s) — the exact tasks it previously lost — plus two compound
  steps. `aws-knowledge` and `microsoft-learn` also delivered.
- ~~`openzeppelin-contracts` won an auction with no registered runner
  ("No specialist runner registered")~~ FIXED 2026-08-06. Applied to all 87
  MCP_CATALOG entries, not just this one. Catalog agents are enrolled as
  bidders by `solicitBids` into a module-scope registry and are never
  persisted to `discovered_specialists`; that registration dies with the
  Convex isolate, so the separate execute action threw whenever it landed on
  a cold one — intermittent only because a warm isolate still held the
  registration from bidding. Execute now rebuilds from `MCP_CATALOG` via
  `lib/specialists/catalog-config.ts`, shared with the bid path so the two
  cannot drift.
- The one remaining hard failure is the receipt rule working as designed:
  nia-context won `copy-water-bottle` (a copywriting task, not its
  specialty), made zero successful tool calls, and was failed with
  `partial_receipt: missing successful_tool_calls` rather than being paid for
  unproven work.

The run-sheet above is the post-fix measurement — no longer a stale floor.

## Verification caveats

- Media artifacts panel (`components/task/MediaArtifactsPanel.tsx`) ships
  fail-soft and typechecks, but the dev deployment has zero `media_artifacts`
  rows, so it has not been seen with real files. Run a media DAG (or upload)
  to confirm players render.
- The in-app browser pane's click injection is unreliable on deeply scrolled
  pages; handlers there were verified by DOM-dispatched clicks plus
  `elementFromPoint` hit-testing rather than injected pointer events.
