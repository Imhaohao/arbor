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
- `ValueImpactPanel` claims "you saved $X / improved efficiency N%" against a
  hardcoded 30-minute baseline; PROGRESS.md flags this as unmeasured. Needs a
  measured control arm (`golden_task_runs` currently ~0 rows) before the claim
  is defensible.
- Task execution currently fails live with provider 429s — both OpenRouter and
  OpenAI accounts have zero credit. UI degrades honestly (refund + error), but
  no judged deliverable can be produced until credit exists.

## Features still lacking a UI surface (backend exists)

- Bid calibration (`bids.p_accept`, reject-slash): deliberately not surfaced —
  BidWindow renders sealed bids from lifecycle events pre-close, so showing
  calibrated confidence needs a post-close design in AuctionResolution.
- Golden-task / battery lane (`convex/battery.ts`, `goldenTaskAudit.ts`): all
  queries are internal-only and `battery_runs` is empty; add a public admin
  query + table once a funded battery run exists.
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

## Verification caveats

- Media artifacts panel (`components/task/MediaArtifactsPanel.tsx`) ships
  fail-soft and typechecks, but the dev deployment has zero `media_artifacts`
  rows, so it has not been seen with real files. Run a media DAG (or upload)
  to confirm players render.
- The in-app browser pane's click injection is unreliable on deeply scrolled
  pages; handlers there were verified by DOM-dispatched clicks plus
  `elementFromPoint` hit-testing rather than injected pointer events.
