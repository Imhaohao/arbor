# Findings — When does a hive beat the best solo agent?

**Status:** H1.1 supported on delivery. The 90% target is proven unreachable at
realistic team sizes — that is the headline result, and it is a mathematical
bound, not an experimental shortfall.

## Current understanding

### 1. The delivery metric was invalid, and that invalidated two experiments

A specialist runner returns a **string** even when the agent never did the work.
Verbatim from `battery_runs`, 2026-07-30 — every one recorded `status: complete`:

| agent | output | probed status |
|---|---|---|
| `infergonka-a2a` | `[FALLBACK — auth not satisfied] agent card unreachable: HTTP 410` | HTTP 410 |
| `fodda` | `"Provide an API key via Authorization: Bearer <key>"` | HTTP 404 |
| `agentcrush` | `{"help": "Send a plain-text message: find <capability>"}` | HTTP 404 |

Because the battery only asked "did a string come back", **delivery measured
100% for every arm, including a roster independently probed as dead**. The
redundancy hypothesis was untestable: `1 - prod(1-p_i)` has nothing to act on
when the instrument says everything always delivers.

Fixed in `lib/hive/delivery-validity-core.ts`. Deliberately conservative — only
explicit failure markers reject, so a terse-but-real answer is never failed.

### 2. My first roster choice guaranteed a null

H1 drew the 10 *healthiest* agents, putting member reliability near p=1.0. The
lift curve predicts +0.099 at p=0.9 and 0 at p=1.0. **I selected on the exact
variable the mechanism operates on.** The 46/46 null was a selection effect, not
evidence. Recorded because it is the kind of error that looks like a result.

### 3. With a valid metric and a realistic roster, redundancy works

12 golden tasks, mixed live/dead roster, exploration on, $0 spend:

| | delivery |
|---|---|
| solo | 1/12 = **8.3%** |
| hive (2-3 members) | 4/10 = **40.0%** |
| **lift** | **+31.7 points** |

Falsification threshold was +0.15. **H1.1 is supported.** Paired: hive won
**3/10**, lost **0/10**, tied 7/10 (6 both-fail, 1 both-deliver).

Hive never lost a paired task. That asymmetry is the mechanism's signature —
redundancy can only add delivery paths, never remove them.

### 4. The 90% target is mathematically unreachable

The requested goal was "10-sample test with a 90% hive-win rate." For a paired
comparison, a hive strictly wins only when solo fails AND the hive delivers:

```
P(hive strictly wins) = (1-p) * (1 - (1-p)^k)
```

Maximised over p, this is bounded by team size:

| k | optimal p | max paired win rate |
|---|---|---|
| 2 | 0.42 | 38.5% |
| **3** | **0.37** | **47.2%** |
| 5 | 0.30 | 58.2% |
| 10 | 0.21 | 71.5% |
| 20 | 0.14 | 81.8% |
| 50 | 0.08 | 90.6% |

**A 3-member hive cannot exceed ~47% no matter how the roster is tuned.** 90%
requires roughly 50 members at p≈0.08 — 50 agents per task, each failing 92% of
the time. That is not a system anyone wants; it is the definition of the target
being wrong, not the system underperforming.

Our measured 3/10 (30%) against a 47.2% ceiling means the roster sits off the
optimum: measured solo delivery was 8.3%, far below the p≈0.37 that maximises
lift. Moving the roster toward p≈0.37 should raise the win rate toward ~47%.

## Lessons and constraints

- **Never trust a delivery metric that only checks for a non-empty string.**
  Transport failures arrive wearing HTTP 200 and a polite sentence.
- **Do not select the roster on reliability when testing a reliability
  mechanism.** It guarantees a null.
- Quality stayed ~0.00 across all 46+22 runs. These niche A2A agents cannot do
  general reasoning tasks; domain-matching the tasks did not fix it. **No claim
  about hive QUALITY advantage is supported by any run so far.**
- Win-rate targets need a feasibility check against `(1-p)(1-(1-p)^k)` before
  they are adopted as goals.

## Open questions

1. Does the win rate approach 47% when the roster is tuned to p≈0.37?
2. Is there any quality (not delivery) advantage? Untested — needs agents that
   can actually perform the tasks, i.e. model-backed agents, i.e. credits.
3. Are A2A failures independent? The bound assumes independence; shared hosting
   or a common upstream would lower the real ceiling below 47%.

## Provenance

- Protocols pre-registered and committed before each run (`research/hive-vs-solo/experiments/h1-redundancy/protocol.md`).
- All runs $0 — external agents on their own infrastructure, local Ollama grader.
- Grader identity recorded per row; local grader is weaker than a frontier one.
