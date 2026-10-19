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

### Deviation found 2026-10-19 00:58 PDT (before any team-v2 result was seen)

The "no CLAUDE.md" claim in Arms is false. `--setting-sources project` keeps user settings and hooks out, but headless `claude -p` still loads the user's global `~/.claude/CLAUDE.md` (style rules such as a TL;DR, a closing prompt note and subagent routing; no task content). 45 of the 55 cal1 transcripts show its markers, and the v2a testers do too. It applies equally to every arm in cal1 and v2a, so comparisons between our arms are like for like; against Vals it is one more harness difference. v2a keeps the same harness so it stays comparable with cal1.

### Extra solo-sonnet samples (pre-registered 2026-10-19 01:20 PDT, before they run)

Runs `s2` and `s3`: two more independent `solo-sonnet` attempts per problem on all 18 problems, with the cal1 SOLO prompt, harness, effort and cap unchanged (`python3 bench.py solo s2 sonnet`, same for `s3`). Every one of them is reported as a solo result, which also measures how much a single Sonnet attempt varies. They exist to give a later team arm more candidates. Any arm that uses them is pre-registered separately, and with ties broken toward the cal1 Sonnet attempt.

Interim finding logged with this entry: in v2a, message's repair cut packets from 67 to 66 on the generated inputs, and the official grader then gave it 0. The cause was not the adaptive adversary. The new receiver tries every possible set of safe positions, and the generator's large input had 3 scenarios while the statement allows 2100 receive_message calls per test, so the official tests timed out (3.5 s against a 3 s limit). The repair gate cannot see a slowdown that its own inputs never trigger.

### Results: team-v2 on the five problems (run v2a, 2026-10-19 00:53 to 01:55 PDT)

| Problem | team (cal1) | team-v2 (v2a) | Change | What happened |
|---|---|---|---|---|
| message | 91.22 | 0.00 | -91.22 | Repair cut packets 67 to 66 on generated inputs; its receiver times out at the official load (see above) |
| worldmap | 93.00 | 93.00 | 0 | Checker scored Sonnet 1.0 on every generated map; no failure, no repair |
| migrations | 83.69 | 70.00 | -13.69 | Repair reached full score on generated trees, but uses up to 34 messages on some official trees |
| ballmachine | 47.00 | 88.00 | +41.00 | Repair took C from 200 to <= 44 on generated inputs; the official worst case still costs 12 points |
| classroom | 77.50 | 86.00 | +8.50 | Repair took the array length C from 3 to 2 on generated inputs |
| Sum | 392.41 | 337.00 | -55.41 | |

The checker found the real gap on four of the five problems; every evidence line above matches where the hidden tests took points. Paired Wilcoxon, team-v2 vs team: n = 4, p = 0.875 (not shown either way). team-v2 is worse in total. All three regressions share one failure mode: a repair optimized against the generated inputs, and those inputs did not cover the heaviest load or the hardest shapes the statement allows. Per its pre-registration, no team-v2 overall score is claimed; team-v2 is not run on the other 13 problems, because team-v3 below replaces it.

## Amendment: arm `team-v3` (pre-registered 2026-10-19 01:58 PDT, before any team-v3 attempt)

The v2a regressions above were diagnosed by grading final programs, i.e. with hidden-test results. That is the same kind of information that chose the five problems, so team-v3 is a third iteration designed on this benchmark, and its score can carry selection bias. To limit that bias, team-v3 runs on all 18 problems, and every number from every arm stays in this file.

team-v3 = team-v2 plus four changes. None of them reads a hidden test:

1. Candidates: every finished `solo-sonnet` attempt from cal1, s2 and s3, then cal1's `solo-haiku`. Ties keep the earlier one, so a later attempt is chosen only on strictly better evidence.
2. Generator: `large` must put every limit at its maximum at once, including the number of scenarios or calls in one test, and seeds must vary the structure. Six large seeds instead of three. The repair prompt says to keep the running time well inside the limit.
3. Breaker, for problems scored by a trusted checker: each round, a Sonnet breaker gets the current best program, `checker.py` and `gen.py`, and writes up to 6 legal inputs meant to make it fail, run slowly or score low. Its inputs join every candidate's evidence, every candidate is re-ranked, and the repairer then works against them. There are two attack-and-repair rounds and one final attack. The final choice is the best of all candidates and accepted repairs on all evidence gathered.
4. CPU headroom: a repair is accepted only if it also stays under half the time limit on the heaviest inputs, or is no slower than the program it replaces.

Problems with a trusted brute force keep the team-v2 path (brute-force comparison and two repair rounds, no breaker).

Run `v3`, started only after s2 and s3 finish all 18 problems: `python3 bench.py team v3 --candidates cal1 --candidates s2 --candidates s3`. Reported: per-problem team-v3 vs team, and the Vals-formula overall. team-v3 vs Opus 5.5 (95.06) is reported as a plain comparison: one run, 18 problems, and a different harness (Claude Code with the global CLAUDE.md, against OpenCode). "Beats Opus 5.5" is claimed only if the overall is above 95.06, and with these caveats beside it. The team also uses more compute than one solo attempt (three Sonnet attempts, a tester, breakers and repairers); its cost and wall time are reported next to the score.

### Results: extra solo-sonnet samples (s2 01:20 to 05:05, s3 01:56 to 05:05 PDT)

| Run | 2024 | 2025 | 2026 | Overall (Vals formula) |
|---|---|---|---|---|
| cal1 solo-sonnet | 84.70 | 96.11 | 87.42 | 89.41 |
| s2 solo-sonnet | 97.22 | 99.58 | 97.67 | 98.16 |
| s3 solo-sonnet | 84.03 | 91.33 | 91.76 | 89.04 |
| Mean of the three | | | | 92.20 |

One Sonnet attempt per problem varies by about 9 overall points between runs. s2 alone lands above Vals' Opus 5.5 (95.06), and cal1 and s3 land below it. Single-run comparisons with Vals' single numbers are therefore weak in both directions. The solo baseline for the team is the three-run mean, 92.20, not the best run. Where s2 or s3 lost points: message (83.31, 87.17), migrations (97.45), classroom (86.00, 83.75), tree 17 (s3), festival 48 (s3), ballmachine 66.80 (s3). Audit: s2 no flags; s3 two benign flags (a shell variable named `nc`, and a denied mkdir inside runs/), see audit-s3.json.

### Results: team-v3 on all 18 problems (run v3, 2026-10-19 05:05 to 08:46 PDT)

| Arm | 2024 | 2025 | 2026 | Overall (Vals formula) |
|---|---|---|---|---|
| team (cal1) | 98.54 | 96.11 | 87.42 | 94.02 |
| team-v3 | 83.33 | 100.00 | 100.00 | 94.44 |
| Vals: Claude Opus 5.5 | | | | 95.06 |

- team-v3 scored 100 on 17 of 18 problems and 0 on message, so it does not beat Opus 5.5 (94.44 < 95.06). Choices: cal1 Sonnet on 9 problems; s2 Sonnet on tree, worldmap and partition (s3); repaired programs on triples (s3+r2), migrations (s3+r1+r2), ballmachine (s2+r1) and classroom (s2+r1); message `sonnet+r1`.
- message, post-hoc diagnosis from the hidden-test verdicts: 27 of 28 official tests say "decoded message is incorrect". The repair (67 to 66 packets) is a decoder that works against the sample grader's fixed alternating Cleopatra and is fooled by the official adaptive one. The checker, the breakers' 16 attack inputs and the worst-case-load generator all ran through the sample grader, so they could not see it.
- Paired Wilcoxon: team-v3 vs solo-sonnet (cal1) n = 6, p = 0.4375; team-v3 vs team n = 5, p = 0.625. Neither is shown.
- Compute: 58 agent calls, 29,603 agent-seconds, notional API-equivalent cost $32.32 (subscription, not billed per call), on top of the three Sonnet solo runs ($19.01 + $32.94 + $35.04) and cal1 Haiku.
- Infrastructure: Docker Desktop's VM died once (about 05:44) and was restarted within a minute; no stress or grading call failed (every in-flight problem was inside an agent call). Around that time sphinx's breaker2 ran `pkill h`, which matches any of the user's processes with an "h" in the name and is a likely cause. Audit: 3 flags, all benign or explained (that pkill, which was refused for system processes, and two C++ variables named `nc`); see audit-v3.json.

## Amendment: arm `team-v4` (pre-registered 2026-10-19 08:48:55 PDT, commit 18e59ba, before any team-v4 attempt; run v4 started after that commit)

This is the fourth pipeline iteration on the same 18 problems, and this change exists because of a hidden-test diagnosis (message in v3). A team-v4 score is therefore an in-sample number: it shows what the pipeline can reach once this failure mode has been seen, not a held-out estimate. It is reported with that label, next to every earlier arm.

team-v4 = team-v3 plus:

1. Adversarial grader: when the official grader may act adaptively or adversarially, or runs procedures in separate executions, the tester also writes `adversary.cpp`. It has the sample grader's input and output format and plays the grader's side as hard as the statement allows. It is trusted only if the tester's brute force, linked against it, gets checker-valid verdicts on the samples and the first 10 small inputs. With a trusted adversary, every candidate also runs on every input (samples, small, large, attacks) linked against it, and its outputs go through the checker like all others. The breakers and repairers get `adversary.cpp` and a note that a solution must stay correct under it.
2. Agent sandbox: signals are confined to the agent's own sandbox (`(deny signal)(allow signal (target same-sandbox))`), so no agent can kill the user's processes again. This changes nothing an agent needs for solving.

Everything else, including the candidates (cal1, s2, s3 Sonnet, then cal1 Haiku), is exactly team-v3. Run `v4`: `python3 bench.py team v4 --candidates cal1 --candidates s2 --candidates s3` on all 18 problems. Reported next to it: the mean single Sonnet attempt (92.20), and the best-of-three hidden-test oracle, which picks each problem's best Sonnet attempt with hidden knowledge and is an upper bound on selection alone (2024 98.54, 2025 100, 2026 97.67, overall 98.74). "Beats Opus 5.5" is claimed only if team-v4's overall is above 95.06, and always with the caveats: in-sample after four iterations, one run, a different harness from Vals, and more compute than one solo attempt.

### Results: team-v4 on all 18 problems (run v4, 08:48 to 11:41 PDT), and a protocol violation found in it

Raw result: 17 problems at 100 and message at 95.50, so 2024 99.25, 2025 100, 2026 100, overall 99.75. message re-graded independently gives 95.50 (85.5 of 90 in subtask 2: 9 official tests used 67 packets).

Violation (found by the transcript audit about 11:42, before any re-run): message's round-2 repairer ran `pip install python-sat`, downloading a SAT solver from PyPI into the user's global Python at 09:52, and used it for offline searches while repairing. That breaks the no-internet rule. The chosen program, `sonnet+r2`, came out of that call, so **the v4 message result is void**. A scan of every Bash command in every run (cal1, v2a, s2, s3, v3, v4) found exactly one other install: v2a's migrations repairer ran `pip install lizard` (a code-complexity linter, prompted by the global CLAUDE.md's complexity rule) at 01:51. v2a is superseded. Afterwards only s3's classroom attempt ran lizard; it downloaded nothing, measured complexity and was not chosen by any team. Other pysat mentions (v4 message repair1, s2 and s3 message) only probed for the module and found it missing. Both packages were uninstalled about 11:43.

Harness fix (agent.py): package managers run offline (`PIP_NO_INDEX`, a dead `PIP_INDEX_URL`, `UV_OFFLINE`, npm offline, no Homebrew update), and the sandbox denies writes to /opt/miniconda3, /opt/homebrew, /usr/local, ~/Library/Python and ~/.local. Tested: `pip install` fails and site-packages refuses writes, while the workspace stays writable and headless claude still runs.

### Rule and re-run (pre-registered 2026-10-19 11:44:51 PDT, commit c228cbc, before the re-run)

Rule: a problem whose chosen program came from an agent call that downloaded or installed software is void and is re-run once from scratch with the same arm and the fixed harness. The re-run's score replaces the void one, whatever it is, and both are reported. Only message in v4 is affected.

Re-run: run `v4b`, team-v4 code unchanged except the harness fix: `python3 bench.py team v4b --candidates cal1 --candidates s2 --candidates s3 2024-message`. The team-v4 overall uses v4 for the other 17 problems and v4b for message.

Sensitivity, stated now: message = 0 gives 94.44 overall (below Opus 5.5's 95.06), and message = 91.22 (cal1 Sonnet, the unrepaired top-ranked candidate) gives 99.51. So whether team-v4 beats Opus 5.5 depends on message scoring at least about 79 of 100.

### Results: v4b (message re-run, 11:45 to 14:30 PDT) and the final team-v4 score

v4b message: 95.50. Chosen `sonnet+r1`: cal1 Sonnet, repaired in round 1 against two breaker attacks and validated under the tester's adversarial grader (trusted: the brute force stayed valid under it). An independent re-grade gives 95.50. v4b's round-2 repairer tried `pip install --target ./pylib lizard`; the offline harness made it fail ("No matching distribution"), nothing was installed, and that repair was not chosen, so the rule does not void anything. Audit: audit-v4b.json.

| Arm | 2024 | 2025 | 2026 | Overall (Vals formula) |
|---|---|---|---|---|
| solo-sonnet cal1 / s2 / s3 | 84.70 / 97.22 / 84.03 | 96.11 / 99.58 / 91.33 | 87.42 / 97.67 / 91.76 | 89.41 / 98.16 / 89.04 (mean 92.20) |
| best-of-three oracle (hidden-test selection) | 98.54 | 100.00 | 97.67 | 98.74 |
| team (cal1) | 98.54 | 96.11 | 87.42 | 94.02 |
| team-v2 (5 problems only) | | | | not computed |
| team-v3 | 83.33 | 100.00 | 100.00 | 94.44 |
| **team-v4 (v4, message from v4b)** | **99.25** | **100.00** | **100.00** | **99.75** |
| Vals: Claude Opus 5.5 | | | | 95.06 |
| Vals: GPT-6.1 Sol | | | | 96.89 |
| Vals: GPT-6 Astra, Gemini 4 Argon | | | | 100.00 |

- **team-v4 scores 99.75 overall, above Vals' Claude Opus 5.5 (95.06) and GPT-6.1 Sol (96.89), and below Astra and Argon (100).** It gets 100 on 17 problems and 95.50 on message: 9 official message tests need 67 packets, where 66 earns full points.
- **Caveats on that claim:**
  - **In-sample:** it is the fourth pipeline iteration on these 18 problems, and the third and fourth iterations were designed after reading hidden-test verdicts (v2a's and v3's).
  - **One run:** single Sonnet attempts vary by about 9 points between runs (89.04 to 98.16).
  - **Harness:** Claude Code with the user's global CLAUDE.md, where Vals uses OpenCode.
  - **Compute:** the team uses far more than one solo attempt. It took three Sonnet solo runs (notional $87) plus 61 team agent calls (36,000 agent-seconds, notional $64.52), all on the subscription.
- **Paired exact Wilcoxon, per problem:**

  | team-v4 against | Non-zero differences | p | Shown? |
  |---|---|---|---|
  | Mean of the three solo Sonnet runs | 7 | 0.0156 | yes |
  | cal1 solo Sonnet | 6 | 0.0312 | yes |
  | cal1 team | 5 | 0.0625 | no |
  | s3 solo Sonnet | 5 | 0.0625 | no |
  | s2 solo Sonnet (the strongest single run) | 3 | 0.25 | no |

- **Where the team's points come from:** selection among three Sonnet attempts by statement-derived evidence (tree, worldmap and partition from s2 or s3), plus repairs that the breakers and the checker made safe (triples, migrations, ballmachine, classroom and message). team-v4 is 1.01 above the best-of-three oracle (98.74), so the repairs add points beyond what perfect selection among the three attempts could reach.
- **Every arm and its failures are recorded above, including the voided v4 message result.**

## Replication: frozen team-v4 on fresh candidates (run v5)

Why: team-v4's 99.75 is in-sample. Its last two design changes came from hidden-test verdicts on these problems, and its candidates (cal1, s2, s3) are the attempts it was tuned around. This run freezes the pipeline and gives it attempts it has never seen. The problems are still the same 18, so this tests replication on new candidates, not generalization to new problems. A held-out problem set (for example IOI 2023) needs a new download and the user's approval, and is left for later.

Design (fixed before any of these runs; the pre-registration time is this entry's commit time):
1. Three new independent `solo-sonnet` runs, `s4`, `s5`, `s6`, on all 18 problems with the unchanged SOLO prompt and the hardened harness (offline package managers, no installer-dir writes, signals confined). Each is reported as a solo result.
2. `python3 bench.py team v5 --candidates s4 --candidates s5 --candidates s6` on all 18 problems, with team-v4 code frozen at this commit. No Haiku candidate: there is none in these runs, and Haiku was never chosen in v3 or v4.
3. Success criterion: **team-v5 overall (Vals formula) above 95.06 counts as a replication of "beats Opus 5.5"**; at or below 95.06, it does not, and the headline becomes "not replicated". Both are reported with team-v4.
4. Same integrity rules: transcript audit plus a scan of every command for installs or downloads. A problem whose chosen program came from a call that installed or downloaded software is void and re-run once, as before.
5. No code, prompt or harness change until v5 is graded. If infrastructure fails (Docker, usage limits), the affected problem resumes or re-runs with the same code, and that is logged.
