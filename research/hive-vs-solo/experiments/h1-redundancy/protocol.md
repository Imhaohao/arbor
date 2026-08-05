# H1 — Redundancy: a hive beats a solo agent when members are unreliable and independent

**Status:** LOCKED before execution. Committed prior to any result.
**Date:** 2026-07-30

## The question I am actually answering

The request was "get a 10-sample test showing a 90% hive-win rate." That is a
target on an outcome, not a research question, and it is trivially riggable —
handicap the solo arm, pick tasks no single agent can do, or grade on length.
Any of those produce 9/10 and measure nothing.

So the question here is **under what conditions does a hive beat the best solo
agent**, and 90% is a *prediction to be tested*, not a number to reach. If the
prediction fails, that is the result.

## Mechanism

For members failing independently:

```
P(team delivers) = 1 - prod(1 - p_i)
```

This is arithmetic, not a heuristic, and it is the only rigorous reason a team
can beat its best member. It makes a sharp, non-obvious prediction: **the lift
is largest at MIDDLING reliability and collapses when members are individually
reliable.**

Computed from the shipped `teamReliability` (3 independent members):

| member p | solo | hive-3 | lift |
|---|---|---|---|
| 0.20 | 0.200 | 0.488 | +0.288 |
| 0.30 | 0.300 | 0.657 | +0.357 |
| **0.37** | **0.370** | **0.750** | **+0.380** |
| 0.50 | 0.500 | 0.875 | +0.375 |
| 0.70 | 0.700 | 0.973 | +0.273 |
| 0.90 | 0.900 | 0.999 | +0.099 |

The measured live-A2A rate is **0.375** (45 of 120 endpoints alive, probed
2026-07-30), which sits almost exactly on the peak of the lift curve.

## Hypothesis

**H1.** On a 10-task paired battery run against the live A2A roster, a 3-member
hive achieves a materially higher DELIVERY rate than the best solo agent,
because member failures are largely independent (distinct vendors, hosts, and
runtimes).

**Primary metric — delivery rate.** Fraction of tasks returning a usable answer.
This is what the redundancy mechanism predicts, and it is measured, not graded.
- Predicted solo: ~0.37
- Predicted hive-3: ~0.75
- Predicted lift: ~+0.38

**Secondary metric — graded quality.** Mean accuracy from the reference grader.
The mechanism makes NO strong prediction here; a hive only wins on quality if
members contribute complementary content or effective critique. Reported
separately and NOT combined with delivery.

## Why the earlier pilots showed 0/4 and 0/3

Those ran general reasoning tasks (escrow math, unit conversion) against niche
infrastructure agents. Quality was 0.00-0.02 for every arm, so there was no
headroom for either arm to win — an undefined comparison, not evidence against
H1. This run uses the 8 `golden-dom-*` tasks, which are matched to the roster's
declared skills and carry no required substrings (so the 0.30 substring cap
cannot bind).

## Design

- **Pairing:** every task runs BOTH arms. Solo baseline is chosen by the same
  scoring that composes the hive, so the solo arm is not handicapped.
- **N = 10** paired tasks (8 domain tasks + 2 seeds re-drawn with `--explore`).
- **Exploration on** (`--explore`), so team composition varies and no agent
  dominates — otherwise agent effects are unidentifiable.
- **Same grader both arms** (local Ollama; recorded per row).
- **Cost:** $0. External A2A agents run on their own infrastructure.

## Falsification

H1 is **refuted** if hive delivery rate does not exceed solo delivery rate by at
least +0.15 across 10 paired tasks. A null or negative result is recorded as the
finding; it would indicate member failures are correlated (shared hosting,
shared upstream model, or a common protocol fault) rather than independent.

## Pre-committed analysis

- Report delivery lift and quality lift SEPARATELY. Never average them.
- Report the exact win count out of 10 for each metric.
- With n=10 the confidence interval is wide; report it rather than claiming a
  point estimate is precise.
- Any post-hoc slice is labelled EXPLORATORY.

---

# H1.1 — Corrected roster (LOCKED before execution, after H1's null)

## What H1 actually measured

46/46 runs completed. Zero errors. **Delivery rate was 100% for both arms**, so
the redundancy mechanism had nothing to act on and the primary metric was
undefined — not refuted, *untestable in that design*.

**The error was mine.** I drew the roster from the 10 healthiest agents, putting
member reliability at p≈1.0. My own lift table predicts +0.099 at p=0.9 and 0 at
p=1.0. I selected on the exact variable the mechanism operates on, which
guaranteed a null. This is a selection effect, not evidence against H1.

Quality was also ~0 (41 of 46 runs at 0.00), so the secondary metric had no
headroom either. Domain-matching the tasks was not sufficient.

## The corrected design

Draw the roster from the **full A2A population**, which is the actual routing
condition: 120 registered endpoints, 45 alive (p = 0.375). Excluding the dead
ones was the unrealistic choice — a real router must pick from the population
that exists, and that population is where redundancy pays.

**H1.1.** With a roster mixing live and dead endpoints (p ≈ 0.375), a 3-member
hive achieves a materially higher DELIVERY rate than the best solo agent.

- Predicted solo delivery: ~0.37
- Predicted hive-3 delivery: ~0.75
- Predicted lift: ~+0.38

**Falsified** if delivery lift is under +0.15 across 10 paired tasks, which would
indicate failures are correlated (shared hosting or a common protocol fault)
rather than independent.

Quality remains secondary and is expected to stay near zero for this roster; it
is reported but no claim is made on it.
