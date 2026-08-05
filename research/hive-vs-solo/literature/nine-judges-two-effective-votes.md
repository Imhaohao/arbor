# Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels

**Author:** Guneet Kohli
**Year:** 2026 (posted May 2026)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2605.29800

## Key findings

- Tests a panel of 9 frontier LLMs from 7 model families as an LLM-as-judge ensemble on 3 natural language inference datasets, each with 100 human annotations per item as ground truth for calibration.
- The 9 judges collectively provide only about **2 independent votes' worth of information** (measured via Kish effective sample size, n_eff), because ~three-quarters of the panel's nominal independence is lost to shared mistakes on the same items.
- Panel accuracy falls **8-22 percentage points short** of what truly independent voting (the Condorcet-theorem ideal) would achieve at the same panel size.
- **The best single judge matches or outperforms the full 9-judge panel across all tested conditions** — direct evidence that a well-chosen single agent can beat a large "democratic" team.
- Neither adding more judges nor smarter aggregation algorithms fix this: tested aggregation methods close at most 11% of the independence gap, even when given access to correct answers during aggregation-method design. The bottleneck is judge correlation, not the voting/aggregation rule.
- Robust across prompt variants, temperature settings, chain-of-thought use, and an additional pairwise-preference task (RewardBench).

## Measured numbers

- 9 judges -> ~2 effective independent votes (Kish n_eff).
- Panel accuracy 8-22 percentage points below the independent-voting ideal.
- Best single judge >= full panel, in all conditions tested.
- Best aggregation method recovers <=11% of the theoretical independence gap.

## Relevance to "when does a team beat the best solo agent"

One of the single most decision-relevant papers in this survey: it directly and quantitatively shows a large multi-agent panel losing to the single best agent, isolates the cause (correlated judge errors, not a bad voting rule), and shows the failure is *not fixable* by scaling panel size or aggregation sophistication — only by reducing judge correlation itself.
