# Arbitrator Agent Discovery Report

## Implemented

- Every top-level `tasks.post` schedules `internal.taskAgentDiscovery.discoverForPostedTask`.
- The background action searches real connectable sources only: MCP registry, A2A directory, then curated catalog.
- Synthesized/mock agents are disabled for this automatic path.
- Discovered candidates are persisted with `discoveredSpecialists.upsert` and mirrored into `agents`.
- Task lifecycle logs now record:
  - `arbitrator_agent_discovery_started`
  - `arbitrator_agent_discovery_persisted`
  - `arbitrator_agent_discovery_no_match`
  - `arbitrator_agent_discovery_failed`
  - `arbitrator_agent_discovery_skipped`

## Verification Honesty

- MCP verification is labeled `tools_list_returned_tools` only when tool names are actually returned.
- Empty or failed MCP `tools/list` is labeled `tools_list_no_evidence`, not success.
- A2A discovery is labeled `agent_card_fetched`; it does not claim a successful task/message loop.
- `ARBOR_AUTO_AGENT_DISCOVERY=false` disables the background run.
- `ARBOR_AUTO_AGENT_DISCOVERY_VERIFY=false` skips MCP `tools/list` verification.

## What Does Not Work Yet / Not Proven

- Raw Google Custom Search was not added. The repo has no configured Google Search API key/search-engine env, so this uses connectable agent registries instead of scraping Google.
- I did not run a live deployed Convex `post_task` end-to-end. I verified codegen, typecheck, and tests locally.
- The background discovery is scheduled alongside the planner. It will run on every post, but Convex does not guarantee it finishes before the current task's first routing pass.
- A2A candidates are discovered by agent card fetch only. A live `message/send` or `tasks/send` probe is still future work.
- `tools_list_no_evidence` currently combines empty tool lists and failed `tools/list` calls because `discoverSpecialist` returns only `verified_tools: []` for both cases.

## Checks Run

- `npx convex codegen --typecheck=disable` passed.
- `npx tsx lib/specialists/post-task-discovery.test.ts` passed.
- `npm run typecheck` passed.
- `npm test` passed.

Non-failing warnings observed: Node `DEP0205` from `tsx`, and the existing mock-specialist warning for `hyperspell-brain`.
