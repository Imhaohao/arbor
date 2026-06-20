# PR-Review Reliability Eval

## What this measures

End-to-end reliability of the Arbor hive-mind for the `pr-review` task class.
Each run posts a hive task containing an embedded unified diff with one clearly
planted bug (a missing `await` in `TtlCache.getOrFetch`), polls to terminal,
and evaluates the 9 standard hive-mind assertions plus a seeded-bug-catch check.

The harness distinguishes live runs (delivered by `github-pr-review` or any
specialist with `provenance.live_tools_called === true`) from fallback runs
(delivered by `arbor-baseline`, result text begins with `[Arbor baseline]`).

## Metrics

| Metric | Target | Result |
|---|---|---|
| Pass rate (9/9 assertions) | 100% | PENDING live 20-run (env not provisioned this session) |
| Assertions pass rate | 100% | PENDING live 20-run (env not provisioned this session) |
| Live specialist fraction | >= 50% | PENDING live 20-run (env not provisioned this session) |
| Fallback fraction | informational | PENDING live 20-run (env not provisioned this session) |
| Seeded-bug catch rate | 100% | PENDING live 20-run (env not provisioned this session) |
| p50 latency (ms) | < 60 000 | PENDING live 20-run (env not provisioned this session) |
| p95 latency (ms) | < 300 000 | PENDING live 20-run (env not provisioned this session) |

## The 9 Hive Assertions (verbatim from scripts/hive-e2e.ts lines 96-119)

1. Root task reached terminal status.
2. Root task status is not "failed".
3. DAG exists with at least one node.
4. Lifecycle includes `hive_plan_decided`.
5. Lifecycle includes at least one `hive_node_routed` event.
6. Lifecycle includes at least one `hive_node_settled` event.
7. Lifecycle includes `hive_evaluated`.
8. Scratchpad has at least one entry.
9. Root `result.text` is a non-empty string.

## Seeded-bug detection

The planted diff introduces a missing `await` before `fetch()` in
`TtlCache.getOrFetch` (`lib/cache/ttlCache.ts`). A reviewer MUST mention all
three tokens (case-insensitive) to count as catching the bug:

- `await`
- `fetch`
- `getorfetch`

"ALL tokens present" is the strict policy. The harness documents this in
`fixtures.ts` and in the `RunResult.seeded_bug_caught` field of `report.json`.

## How to run

Live (requires `NEXT_PUBLIC_CONVEX_URL` in `.env.local` or environment):

```
npx tsx eval/pr-review-reliability/run.ts
```

Override run count or timeout:

```
PR_REVIEW_RUNS=5 PR_REVIEW_TIMEOUT_MS=120000 npx tsx eval/pr-review-reliability/run.ts
```

Offline dry-run (no Convex required):

```
npx tsx eval/pr-review-reliability/run.ts --dry-run
```

or:

```
PR_REVIEW_DRY_RUN=1 npx tsx eval/pr-review-reliability/run.ts
```

## Dry-run validation

The harness splits all logic into pure functions (`evaluateAssertions`,
`computeReport`, `checkBugCaught`) shared between the live and dry-run paths.
The dry-run path constructs two synthetic in-memory run results (one live
specialist, one arbor-baseline fallback) and exercises every assertion and
report-computation code path without touching Convex.

Both synthetic runs pass 9/9 assertions and catch the seeded bug, confirming
the harness logic is correct before any live deployment is available.

Running `--dry-run` exits 0 when the synthetic runs validate and writes a
`report.json` clearly labeled `"dry_run": true`.
