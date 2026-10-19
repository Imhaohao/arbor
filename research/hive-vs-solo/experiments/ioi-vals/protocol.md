# IOI on the Vals IOI v2 problem set: Arbor team vs solo models

Pre-registered 2026-10-18, before any model attempt.

## Question

Does Arbor's small-model team pipeline (H2 team, Claude-only: Haiku 5.5 + Sonnet 5.5) reach frontier scores on the 18 IOI problems Vals uses for IOI v2?

Reference scores reported by Vals (IOI v2, 2026-10-14, OpenCode harness): Gemini 4 Argon 100.00, GPT-6 Astra 100.00, GPT-6.1 Sol 96.89, Claude Opus 5.5 95.06, Claude Sonnet 5.5 83.06 (2024: 85.00, 2025: 88.33, 2026: 75.83).

## Problems and grading

- IOI 2024 (nile, message, tree, hieroglyphs, mosaic, sphinx), 2025 (souvenirs, triples, worldmap, festival, migrations, obstacles), 2026 (ballmachine, monuments, tiling, classroom, magiccity, partition).
- Official CMS packages: 2024 from github.com/ioi-2024/tasks, 2025 and 2026 from github.com/ioi/task-archive. Official time and memory limits from each problem.json.
- `judge.py` in a Linux GCC 14 container (`--network none`): per-process CPU-time and address-space limits, Batch, BatchAndOutput and Communication (1, 2 and 64 processes) task types, subtask score = points x min test score.
- Grader validation before any run: every official model solution scores 100.00 on all 18 problems; an official subtask-1-only solution (souvenirs) earns exactly subtask 1; an official O(n^2) solution (nile) earns only the subtasks it finishes in time.
- Score per year = mean of its six problems; overall = mean of the three years (Vals' formula).

## Arms

All model calls are headless Claude Code (`claude -p`) on the user's Claude subscription, effort `high`, 90-minute wall cap per agent call, no user settings, hooks, CLAUDE.md or MCP servers.

1. `solo-sonnet`: Claude Sonnet 5.5 alone, one attempt per problem. Calibration arm and team member.
2. `solo-haiku`: Claude Haiku 5.5 alone, one attempt per problem. Team member.
3. `team`: the H2 pipeline adapted to IOI. Candidates are the two solo attempts. A Sonnet tester writes a brute-force solution and an input generator from the statement only. Candidates run against the brute force on small generated inputs and on large inputs through the public sample grader; the best-evidenced candidate is chosen; a Sonnet repairer gets up to two rounds with concrete failing inputs and is kept only if the evidence improves. Hidden tests are never consulted.

## Harness differences from Vals

- Claude Code instead of OpenCode. The agent compiles with Homebrew GCC 13 on macOS (a `g++` shim drops `-static`); grading uses Linux GCC 14.
- No internet is enforced by disabling WebFetch/WebSearch and by sandbox-exec read denial of every judge package, not by a network block; transcripts are audited for network commands and hidden-path access.
- Official time limits are used (Vals' public ioi-agent copy lists message at 30 s; the official package says 3 s).
- 90-minute cap per agent call; Vals states no cap.

## Calibration rule

If `solo-sonnet` overall lands within 10 points of Vals' 83.06, the harness is treated as comparable and the team is compared with Vals' published numbers. Otherwise results are reported only against our own solo arms.

## Claims

18 problems allow descriptive results only. Team vs `solo-sonnet` is reported per problem with a paired Wilcoxon signed-rank test; p >= 0.05 is reported as "not shown". "Matches Astra" is claimed only if the team scores 100.00 overall. No prompt or pipeline change after the first team attempt; any deviation is logged here with a timestamp before rerunning.

## Results (run cal1, 2026-10-18 20:55 to 23:54 PDT)

| Arm | 2024 | 2025 | 2026 | Overall (Vals formula) |
|---|---|---|---|---|
| solo-sonnet | 84.70 | 96.11 | 87.42 | 89.41 |
| solo-haiku | 6.75 | 3.14 | 0.83 | 3.57 |
| team | 98.54 | 96.11 | 87.42 | 94.02 |
| Vals: Claude Sonnet 5.5 | 85.00 | 88.33 | 75.83 | 83.06 |
| Vals: Claude Opus 5.5 | | | | 95.06 |
| Vals: GPT-6 Astra, Gemini 4 Argon | | | | 100.00 |

- Calibration: solo-sonnet 89.41 is 6.35 above Vals' 83.06, inside the pre-registered 10-point band, so the harness counts as comparable. 2024 matches Vals almost exactly (84.70 vs 85.00); 2025 and 2026 are higher (+7.78, +11.59). One attempt per problem, so single-problem swings (ballmachine 47) dominate.
- Team vs solo-sonnet: the team chose Sonnet's program on 17 of 18 problems. On tree, Haiku's program agreed with the brute force on 40/40 small inputs but timed out on 3/3 large ones, Sonnet's was fast but wrong on 3/40; the Sonnet repairer fixed Haiku's program from the timeout evidence (17 -> 100). Wilcoxon signed-rank: n = 1 non-zero difference, p = 1.0, so an improvement is not shown.
- Where the team was blind: all five problems Sonnet did not finish (message, worldmap, migrations, ballmachine, classroom) have non-unique or scored outputs. The tester correctly marked them non-unique, so no brute-force comparison existed, no failure was found and no repair ran.
- "Matches Astra": not claimed (94.02 < 100).
- partition (Sonnet) hit the 90-minute cap; solution.cpp was already written and scored 100, which the rules count.
- Audit: 5 flags, all benign (a run script's `ulimit -s`, `git commit` walking into the denied runs/ folder, and C++ variables named `nc`). See audit-cal1.json.

## Amendment: arm `team-v2` (pre-registered 2026-10-19 00:50 PDT, before any team-v2 attempt)

Why: in cal1 the team found no evidence on message, worldmap, migrations, ballmachine and classroom. Their outputs are non-unique or scored, so the tester marked them non-unique, no brute-force comparison existed, no failure was found and no repair ran. Those five problems hold every point the team lost.

Change (everything else is the `team` arm unchanged: same cal1 candidates, Sonnet tester and repairer, effort high, 90-minute cap, two repair rounds, repair kept only if the evidence ranking improves, hidden tests never consulted before the final grade):

1. The tester also writes `checker.py`: `python3 checker.py <input> <output>` reads a test input and what the sample grader printed for it, and prints `{"valid": bool, "score": 0..1, "detail": str}`. `valid` means every answer is legal and correct for that input, checked independently of the candidate. `score` is the fraction of points the statement's scoring rule gives that output in the most general subtask, computed from the counts the sample grader prints (packets, map size, message values, resources, list lengths).
2. The checker is trusted only if it marks every `examples/*.out` valid and rejects an empty output for every sample input. It is used only when the brute force is not trusted (non-unique or scored outputs), so the 13 problems with a trusted brute force keep the cal1 evidence.
3. With a trusted checker, every candidate output on the samples, the 40 small and the 3 large generated inputs is checked. Invalid outputs and crashes or timeouts are failures; valid outputs below full score are added as the three lowest-scoring cases. The repairer gets these cases (input, the candidate's output, the checker's verdict) plus `checker.py` and `gen.py`.
4. Ranking: compiled, samples clean, brute-force agreement, number of checker-valid outputs, mean checker score (invalid = 0), large inputs within the limit, Sonnet before Haiku. Without a trusted checker the last two keys tie, so the ranking equals cal1's.

Option considered and not used alone: parsing the counts the sample graders already print. They print raw counts, not scores (message prints the packet count K, ballmachine K B C, classroom C and H, worldmap the map, migrations the raw messages), and a count says nothing about whether the answer is correct, so a cheap wrong output would rank first. The checker reads those counts and also verifies the answer.

Known limits: the sample graders are not the official ones. message's sample Cleopatra alternates bits where the official grader is adaptive, and message and migrations run both communication phases in one process. The checker can only score what the sample grader shows.

Run and claims: run `v2a`, `python3 bench.py team v2a --candidates cal1` on the five problems first (code at the commit after this amendment). The five were chosen after seeing cal1 hidden-test scores, so the five-problem result is descriptive only: team-v2 vs team per problem; with n <= 5 non-zero differences the exact Wilcoxon p cannot fall below 0.0625, so no significance is claimed. A team-v2 overall score (Vals formula) is reported only after the same code runs on all 18 problems.
