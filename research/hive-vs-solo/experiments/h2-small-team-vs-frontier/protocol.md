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

## Deviations (recorded before the test run)

1. **DeepSeek-R1 14B removed from the team and the solo arms.** On the first
   dev task it hit the 8-minute call limit on both calls on the M5 Pro
   laptop; the run then moved to compute-box (M1 Pro, slower) because the
   benchmark overloaded the laptop. One local request at a time at over 8
   minutes each would add roughly 9 hours to the test split while
   contributing no programs. The team is now 4 members: Haiku 5.5,
   Sonnet 5.5, Grok 4.7, Gemini 3.8 Flash.
2. **Grading machine is compute-box (M1 Pro)**, while time limits were
   measured on the laptop at sealing time (4x the reference). The tighter
   effective limit applies identically to every arm.
3. **Fix:** a model call that fails (timeout, auth) no longer triggers a
   second full solve; one failed call ends that solo attempt.

## Bank v1 result and bank v2 (decided 2026-10-09, before any test task ran)

Bank v1's dev split hit the ceiling: Opus 5.5, GPT-6-Astra, Haiku 5.5,
Sonnet 5.5, Gemini 3.8 Flash and the team each solved 12/12 (Wilson 95%
interval 0.76-1.00); Grok 4.7 High solved 5/12, mostly by exceeding the
8-minute limit (median 504 s). The cheapest member alone matched both
frontier models at about a fifth of Opus's Claude-reported cost ($0.47 vs
$2.53), so the v1 test split cannot separate the arms and is not run.

Bank v2 replaces it under the same hypotheses, metric and decision rule:

- **Authors:** Claude Fable 5.1 agents, the strongest available model and
  in no arm (v1 was written by Sonnet, a team member).
- **Brief:** Codeforces ~2600-3200, at least two non-obvious insights,
  hard by algorithm not by ambiguous wording.
- **Trap gate:** each task ships `naive.py`, the tempting wrong or too-slow
  approach; the grader rejects any task whose naive solution passes the
  brute-force and large-input checks. No model's score is consulted.
- **Grok** runs as `cursor:grok-4.7-medium` (solo and tester).
- **Cost** for the team now includes every member's attempts; the router's
  includes its chosen member's.
- Split: shuffled with the same seed; first 8 dev, rest test.

## Bank v2 authoring change (decided 2026-10-13, before any v2 task ran)

The Fable 5.1 authoring run stopped at the session limit with about 17 of
48 problems written, and those drafts and the v1 encryption key were lost
with that session's temporary directory. Nothing from them is used. Bank v2
is authored from scratch instead:

- **Authors:** 8 Codex CLI sessions on GPT-6.1-Sol (high reasoning), 6
  problems each, one topic per author: DP; graphs; greedy and exchange
  arguments; combinatorics and number theory; strings; data structures;
  trees; games, geometry and math puzzles. GPT-6.1-Sol is in no arm, but it
  shares a family with the GPT-6-Astra arm. If that matters, it favours a
  frontier arm and makes a team win harder. It does not touch H2c, because
  the router and the team draw on the same pool.
- **Brief:** Codeforces 2200-3000, spread across that range, with a
  required `naive.py` trap. The trap gate, validation and split rule are
  unchanged.
- **Storage:** the key and plaintext staging live in `~/.arbor-bench/v2`
  (mode 700) instead of a session temp directory, so they survive the run.
  The audit's leakage patterns already cover `bank-staging` and `bench-key`.

## Bank v2 as sealed (2026-10-13, before any v2 task ran)

The Codex account hit its usage limit after about an hour, so the authors
stopped at 30 validated tasks (1 rejected: `b1-t04`, left unfinished).
Bank v2 is sealed in `bank-v2/` with 8 dev and 22 test tasks (same
seed). Time limits come from this laptop, the same machine that grades.

- **Extension:** once Codex quota resets, the same 8 authors may add more
  tasks under the unchanged brief. New tasks go only to the test split and
  are sealed before any test task runs. The existing dev/test assignment
  never changes. Authors never see dev results. With Codex out of quota,
  the extension authors are 8 Cursor sessions on Gemini 4 Argon High
  (in no arm; ids `c1`-`c8`, 3 tasks each, same topics). Gemini 4 Argon
  shares a family with the Gemini 3.8 Flash team member, so per-author
  results are reported. The router and the team use the same pool, so
  the overlap cannot favour either side of H2c.
- **Dev without GPT-6-Astra:** the Astra arm runs through the same Codex
  quota. Dev may skip it (`--skip`, refused on the test split), because
  neither the team nor the router reads frontier dev results. The test
  split runs every arm.

## Bank v2 result and bank v3 (decided 2026-10-13, before any v2 test task ran)

Bank v2's dev split also hit the ceiling. Opus 5.5, Haiku 5.5, Sonnet 5.5,
Gemini 3.8 Flash and the team each solved 8/8; Grok 4.7 Medium solved
fewer. GPT-6-Astra was skipped (no Codex quota). The v2 test split is not
run. Model-written problems rated 2200-3000 by their authors are too easy
for these models, so an author's own difficulty claim is not enough.

Bank v3 adds a difficulty screen, the standard construction for
adversarial benchmarks:

- **Pool:** the 22 unseen v2 test tasks, the 24 Gemini 4 Argon extension
  tasks (`c1`-`c8`, v2 brief), and new tasks from 8 Argon authors on a
  harder brief (`d1`-`d8`: Codeforces 2800-3500, two insights, examples
  that do not reveal the trick), plus 8 more Argon authors on the same
  hard brief (`e1`-`e8`, 6 tasks each), added once pass 1 of the screen
  showed which authors' tasks survive. v2 dev tasks are excluded because
  every arm has seen them.
- **Screen:** `bench screen` gives each pool task one solo attempt, with
  the same example feedback and single repair every solo arm gets, by
  Gemini 3.7 Flash High (via Cursor). That model is in no arm. Tasks it
  solves on hidden tests are dropped. The command refuses any screener
  that is an arm, tester, repairer or conductor. Screen results are kept in
  `~/.arbor-bench/v3/screen/screen.jsonl` and published with the run.
- **Bias:** the screener is an older sibling of the Gemini 3.8 Flash
  member, so surviving tasks may be harder for that member. That affects
  the router and the team equally, because both draw on the same pool.
- **Seal:** survivors are sealed fresh into `bank-v3/` under a new key,
  with the same seed and an 8-task dev split. Hypotheses, metric, arms and
  decision rule are unchanged.

### Screen log (kept current until bank v3 is sealed)

- Passes 1-2 (75 tasks): Codex v2 tasks 0/22 survive, Argon v2-brief
  tasks 7/24, Argon hard-brief tasks 2/29. The harder brief did not raise
  survival.
- `d8-t01` is excluded: its generator crashes on medium seeds, which
  validation never drew. The grader now checks 20 medium and 10 large
  seeds (commit ebece71), and every survivor passes it.
- Because a harder brief alone did not help, further authors use
  `author-loop.sh` (kept with the run): Codex GPT-6.1-Sol writes one task,
  `bench probe` runs the screener on it, and if the screener solves it the
  same session gets the screener's program and up to 3 rounds to make the
  task harder. Every task still passes the formal `bench screen` before it
  can be sealed; probe runs never admit a task.

## Bank v3 dev result and bank v4 (decided 2026-10-14, before any v3 or v4 test task ran)

v3 dev (8 tasks, Astra skipped): Sonnet 5.5 7/8, Opus 5.5 7/8, team 7/8,
Haiku 5.5 5/8, Gemini 3.8 Flash 5/8, Grok 4.7 Medium 0/8 (every call hit
the 8-minute limit). Sonnet alone solved everything the team solved, so a
router that picks Sonnet ties the team on tasks like these. The v3 test
split is not run. Re-screening the v3 candidates with a stronger model
dropped 12 of 17, so Gemini 3.7 Flash, which is older and weaker than the
team members, does not select tasks that are hard for the members.

Bank v4:

- **Screener:** Gemini 4 Argon Medium (Cursor). It is in no arm and is a
  newer generation than every member. A task enters only if Argon Medium
  fails it on hidden tests in `bench screen`. A screen row whose call
  failed (`no_code` from a timeout or provider error) is re-screened, never
  kept.
- **Pool:** survivors of the 3.7 screen that also fail Argon, plus new
  tasks from the authoring loop, which now probes against Argon Medium (4
  Argon authors `g1`-`g4`, 4 Codex authors `f5`-`f8`).
- **Dev:** v4 has no dev split of its own. The router's member profiles
  come from the v3 dev results (`runs-v3/results-dev.jsonl`), and every
  v4 task is a test task. Tasks that ran in v3 dev are excluded from v4.
- **Run conditions:** the test split runs with no authoring or screening
  jobs on the machine and at most 2 tasks at a time, because v3 dev showed
  call timeouts under load (`no_code` for Haiku, Gemini and Grok on
  `d2-t01`; both repair calls on `e8-t01`). Failed calls now record the
  CLI's error text.
- **Size:** the test run starts once at least 40 tasks have survived, or
  stops at whatever has survived by 2026-10-14 12:00 PDT, whichever comes
  first. That count is fixed before any test task runs.

### Amendment, 2026-10-14 11:30 PDT (no v4 test task has run)

The noon cutoff would leave about 6-8 tasks: the machine was idle for most
of the night, Codex hit its quota again, and half of the Argon screen calls
fail on Cursor connection stalls or timeouts (all re-screened, never kept).
With 8 tasks even a perfect team record cannot reach p < 0.05, so the test
could not answer the question. The size rule becomes: run once 30 tasks
have survived, or at 2026-10-14 20:00 PDT with whatever has survived,
whichever comes first. A run below 15 tasks is reported as underpowered
and makes no claim either way. New loop authors use Gemini 4 Argon High
(`g5`-`g8`) and Grok 4.7 High (`h1`-`h4`) through Cursor. Author identity
cannot favour either side of H2c, because the team and the router use the
same pool.

### Dev change before the v4 test: tester assignment

The team's second tester changes from Grok 4.7 Medium to Gemini 3.8 Flash
(both are team members, so the roster is unchanged). Across v2 and v3 dev,
Sonnet's tester calls were usable 16/16 with a median of 17-39 s, while
Grok's were usable 11/16 with a median of 745-970 s. When the Grok tester
failed, the team's reference outputs rested on Sonnet's brute force alone.
Gemini is a different model family from Sonnet, so agreement between the
two is the more independent check. The tester/repairer assignment is one of
the knobs dev may change, and this change is made before any v4 test task
runs.

### Deviation, 2026-10-14 20:40 PDT: call limit raised from 8 to 20 minutes

The first v4 test run was stopped after 5 of 10 tasks. On every one, every
solve call from every arm (Haiku, Sonnet, Grok, Gemini, Opus, Astra) hit
the 8-minute call limit and returned no program. Gemini, for example,
produced 4,400 output tokens in 469 s and was cut at 481 s. The 8-minute
limit was set for bank v1, whose tasks every model solved in a few
minutes. The Argon-screened tasks make every model think longer, so under
that limit all 10 tasks would end as all-arm ties, which says nothing about
H2a-c. The outcome that prompted the change (all arms timing out) carries
no information about which arm is better. The limit is raised to 20
minutes for every arm, tester, repairer and the conductor, and the same 10
tasks are run again from scratch. The aborted run's records are kept in
`runs-v4/aborted-8min/`. Nothing else changes.

### Harness crash on g2-t01 during the v4 test (2026-10-14 21:57 PDT)

The run crashed on `g2-t01` before writing any result: its author wrote
`topic` as a string, and the router's prompt builder expected a list.
`loadTasks` now turns a string topic into a one-item list. No arm's result
for that task was recorded or seen. The task is run again from scratch
after the other nine finish.

## Bank v5: confirmatory run (pre-registered 2026-10-14 23:50 PDT, before any v5 task exists)

v4 (10 tasks) is reported as an underpowered pilot: team vs router 1-0,
p = 0.5, no claim. v5 is a separate confirmatory test. It is never pooled
with v4, because adding data after seeing a result inflates false
positives.

- **Method:** identical to v4. Gemini 4 Argon Medium screen with no_code
  re-screened, 20-minute call limit, testers Sonnet + Gemini Flash,
  repairer Sonnet, router profiles from v3 dev, test run alone on the
  machine at 2 tasks at a time.
- **Pool:** only new tasks from authors `k*` (Cursor Argon/Grok) and `m*`
  (Codex), written through `author-loop.sh`. Tasks used in v3 dev or v4 are
  excluded, as is every task screened before this point.
- **Size:** the run starts at 40 surviving tasks, or at 2026-10-18 20:00
  PDT with whatever has survived. Below 25 it is reported as underpowered
  and makes no claim.
- **Hypotheses and decision rule:** unchanged. H2c (team > router) is the
  question this run is sized for.

### v5 amendment, 2026-10-15 05:24 PDT (no v5 test task has run)

Model-written problems survive the Argon screen too rarely: 1 survivor in
the first 6 hours of v5. The v5 pool may also include **adapted
Codeforces problems**: every problem rated 2300 or higher from contests
that started on or after 2026-07-15 and had finished by 2026-10-15 (38
problems from 15 contests, listed in `cf-selected.json`). Opus 5.5's
training cutoff is June 2026; the other models' cutoffs are not published.

- **Adaptation:** an author rewrites each statement in its own words with
  the same semantics, keeps the official examples, and writes the
  generator, brute force, reference and naive trap. The reference may
  follow the official editorial. Constraints may shrink so the reference
  runs in CPython within the time rule. Original statements and
  editorials stay outside the repository.
- **Same gates:** each adapted task passes the same validation and the
  same Argon Medium screen as every other task. Human ratings do not
  replace the screen.
- **Contamination check:** results are also reported split by contest
  date (before and after 2026-09-01). A model that saw a problem in
  training would do better on the earlier split.
- Size, deadline, hypotheses and decision rule are unchanged.

### v5 Codeforces adaptation log (2026-10-15 05:36 PDT, no v5 test task has run)

Of the 38 listed problems, 30 were taken forward. Excluded before any
adaptation, for reasons independent of any arm: interactive (`2245G`),
constructive or program output that an exact-match checker cannot grade
(`2249D`, `2262D`, `2264F`, `2268F`), and no editorial for a 2900-3500
problem (`2245H`, `2247E`, `2247F`). Problems that accept several outputs
are adapted to print a uniquely determined value (`2249F` prints the path
length; `2262F` prints the minimum number of moves). Adapted tasks use
author ids `x<problem>` and enter the same Argon screen.

### v5 amendment, 2026-10-15 07:41 PDT (no v5 test task has run)

All 30 Codeforces adaptations are screened and 5 survived. The loop
authors have produced 1 survivor. At that rate v5 stays far below 25
tasks, so the pool is widened once more. The rule below was fixed before
any new problem was fetched or screened:

- **AtCoder:** every problem from ARC, AGC and ABC contests that started on
  or after 2026-07-15 and finished by 2026-10-15, with an estimated
  difficulty of 2000 or more on kenkoooo's AtCoder Problems. AtCoder's
  scale runs lower than Codeforces ratings; 2000 is roughly Codeforces
  2300. That gives 42 problems.
- **Codeforces:** problems from the same window rated 2100-2299 as of
  2026-10-15 07:40 PDT. Of 8, `2255C` (interactive) and `2264E1` (easy
  version of the pooled `2264E2`) are excluded, leaving 6.
- The list is `v5-extension-selected.json` (committed at 07:41).
  Adaptation, exclusion rules, author ids (`x<problem>`), the Argon Medium
  screen, the size rule, the deadline and the decision rule are unchanged.
  The contamination split by contest date covers these problems too.
- The screen stays with a model in no arm. Keeping tasks that an arm model
  fails (for example Sonnet, the router's usual pick) would select on the
  router's own choice, so it is not allowed.

Extension adaptation log (2026-10-15 08:05 PDT, no v5 test task has run): of
the 42 AtCoder problems, `arc226_d` and `arc231_d` are interactive and
`arc226_e` takes no input and asks for a constructed output, so all three
are excluded under the existing rules. The remaining 39 and the 6
Codeforces problems go to adaptation on Cursor (Gemini 4 Argon High).

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
