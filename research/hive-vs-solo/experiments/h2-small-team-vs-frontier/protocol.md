# H2 pre-registration: small-model team vs frontier solo

Written 2026-10-09 before any test-split task was run. The test split is
run once, after this file and the arm roster in `scripts/bench.ts` are
committed. Any change after that is reported as a deviation.

## Question

Can a team of small models beat Opus 5.5 and GPT-6-Astra working alone, and
beat a Fugu-style router that uses the same small models, on fresh
programming problems graded by hidden tests?

## Arms

| Arm | What it is |
|---|---|
| `claude:claude-opus-5-5` | Frontier solo |
| `codex:gpt-6-astra` | Frontier solo |
| `claude:claude-haiku-5-5`, `claude:claude-sonnet-5-5`, `cursor:grok-4.7-high`, `antigravity:gemini-3.8-flash-high`, `ollama:deepseek-r1:14b` | Small solo (the team's members) |
| `router` | Fugu-style conductor: Gemini 3.8 Flash reads the statement and each member's dev-split record, picks ONE member, and that member's solo program is submitted |
| `hive` | The team: all 5 member programs, plus test tools (input generator and literal brute force) written independently by Sonnet and Grok; candidates are ranked by statement examples, agreement with brute-force answers on which BOTH testers agree, finishing on large generated inputs, then cluster size; Sonnet repairs the leader up to twice when that evidence shows a concrete flaw |

Every arm, solo or team, gets the same execution feedback: its program is run
on the statement's examples and it may repair once. No arm sees hidden tests.
Solo arms do not get the team's generated tests; that difference is the
orchestration being measured.

## Primary metric

Pass@1 per task: the arm's single submitted program passes every hidden test
(40 small, 10 medium, 5 large inputs from the sealed generator, expected
outputs from the sealed reference, small-input expectations double-checked
against the sealed brute force). All arms on a task are graded against the
same tests: one seed per task, drawn after every arm has submitted.

## Hypotheses and decision rule

- **H2a** hive > Opus 5.5 solo.
- **H2b** hive > GPT-6-Astra solo.
- **H2c** hive > router (the Fugu-style technique on the same pool).

Each is tested with a one-sided exact McNemar test on the paired per-task
outcomes, alpha 0.05, no correction (three pre-named comparisons; the
Holm-adjusted result is also reported). "Beats" is claimed only when
p < 0.05 and the point difference is positive. A non-significant result is
reported as "not shown", never as a tie or a win.

## Secondary (descriptive, no claims)

- Each member's solo rate; oracle coverage (any member solved it), the ceiling for any selector.
- hive vs the best single small member (chosen by dev-split rate, before the test run).
- Cost: Claude-reported API-equivalent dollars and call counts per arm. Cursor reports no cost; Codex and Antigravity report tokens only; local DeepSeek is $0. Cost coverage is reported per arm, not imputed.
- Results by author topic.

## Task bank

Problems are written for this run by 8 Claude Sonnet authoring agents
(one per topic: DP, graphs, greedy, combinatorics, strings, data
structures, rule-precise simulations, games and geometry), so no model can
have seen them in training. Each task ships a statement, examples, an input
generator, a brute force and a reference solution. A task enters the bank
only if, in a fresh process: the reference matches every statement example,
the reference and brute force agree on 300 random small inputs, small
outputs are not near-constant, and the reference handles the largest inputs
in under 10 s. The time limit is max(2 s, 4 x the reference's worst large-input
time).

Split: tasks are shuffled with seed 20261009 at sealing time; the first 12
form the dev split, the rest the test split (`bank/split.json`). Tasks are
never filtered on how any arm performs.

## Bank as sealed (2026-10-09 09:51 UTC)

78 tasks sealed, 2 rejected (`a3-t09`, `a3-t10`: unfinished when authoring
stopped at the 09:50 UTC deadline). Two authors (greedy `a3`, simulations
`a7`) were stopped at the deadline; every task they finished was validated
by the grader like any other. Split: 12 dev, 66 test. `bank/manifest.json`
holds each task's oracle SHA-256 (commitment); the plaintext oracles are an
encrypted archive outside the repo (SHA-256
cd5352b566a3fc6c05a9e7222ee8731ed96a0be7d72cd2f06bf8a332dba54d55) and are
revealed after the test run.

## What dev may change

Only on the dev split, and only before the test run: the team's prompts, the
number of generated inputs, repair rounds, and the tester/repairer
assignment. The arm roster and every metric above are fixed now.

## Reward-hacking and leakage controls

1. Oracles (generator, brute force, reference) are AES-256 encrypted at rest; plaintext exists only inside a private temp dir during one grading call.
2. Submitted programs and team helpers run under `sandbox-exec` with no network, no read access to the bank, the key, the oracle temp dir or `~/Documents`, and no writes in `$HOME`. Verified with a cheating program that searched for the reference and the key: it errored on all 55 tests.
3. Agents run in empty temp directories with prompts that contain only the public statement and examples.
4. One hidden-test seed per task, drawn after submission, shared by all arms.
5. No LLM judges anywhere in scoring.
6. The model that actually served each Claude call is recorded from the CLI's `modelUsage` (checked: `claude-haiku-5-5` really is Haiku 5.5).
7. Grading tasks where the sealed reference and brute force disagree on a hidden small input (`oracle_conflicts > 0`) are excluded for every arm. This depends only on the oracle, never on an arm's result.
8. Infrastructure failures (CLI error, auth, rate limit) are retried twice; a call that still fails counts as no program for that arm, and counts are reported.

## Known asymmetries (stated, not fixed)

- Codex's read-only sandbox can run commands, so GPT-6-Astra can execute its own code while it thinks. Other CLIs run with shell denied. This favours a frontier arm, which makes a team win harder, not easier.
- All tasks are authored by one model family (Claude Sonnet), which is also a team member. Per-author and per-topic results are reported so this can be inspected.
- Fugu itself is not run: it is a paid API, its workers are frontier models, and its published scores are on benchmarks every model here may have seen in training. The `router` arm tests Fugu's technique (one learned-ish choice of worker per query) on the same small pool. It is not Sakana's trained conductor.

## Prior evidence (research/hive-vs-solo/literature/orchestration-frontier-2026-10.json)

The verified literature does not show any small-model team beating a frontier
solo model on fresh hidden-test code at matched cost. Multi-model search
helps only with a reliable scorer. Scoring on public tests alone rewards
programs that pass the examples and fail hidden tests. A null result is
therefore the expected outcome, and the analysis must be able to report one.
