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
