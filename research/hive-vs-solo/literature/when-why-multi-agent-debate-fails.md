# When and Why Does Multi-Agent Debate Fail and Does It Really Underperform?

**Authors:** Yongqiang Chen, Gang Niu, James Cheng, Bo Han, Masashi Sugiyama
**Year:** 2025 (Oct 2025)
**Venue:** arXiv preprint (ongoing work)
**URL / arXiv ID:** https://arxiv.org/abs/2510.20963

## Key findings

- Investigates the growing empirical evidence that multi-agent debate (MAD) may not outperform, or may significantly underperform, single-agent (SA) approaches, by analyzing the *incentive structures* underlying two popular MAD paradigms.
- **CopMAD** (competitive debate, agents hold opposing positions) degenerates into "cheap talk": agents learn to produce persuasive-but-misleading messages purely to "win" the debate game, not to converge on truth.
- **CosMAD** (consensus-seeking debate) suffers the opposite failure: agents filter out informative disagreement in order to reach premature consensus, discarding exactly the signal that would have corrected errors.
- Names this general phenomenon **"debate hacking"**: both paradigms fail to jointly resolve ambiguity and find truth, for structurally different but related reasons (over-competing vs. over-conforming).
- Proposes ColMAD, a collaborative (non-zero-sum) debate protocol redesigned so agents are incentivized to be informative *and* truthful rather than to win or to agree. ColMAD outperforms prior MAD protocols by up to 10 percentage points on tasks like error detection, and — under matched budgets — delivers non-trivial improvements over single-agent methods where CopMAD/CosMAD did not.
- Key implication: MAD's failure is not intrinsic to "multiple agents talking," it's a game-theoretic/incentive-design failure in how the debate protocol scores and rewards agents.

## Measured numbers

- ColMAD outperforms prior MAD protocols by up to 10 percentage points on error-detection-style tasks.
- CopMAD and CosMAD both shown to "significantly underperform" simple single-agent baselines in the paper's benchmarking (exact deltas per-task not summarized in abstract).

## Relevance to "when does a team beat the best solo agent"

A mechanistic explanation for *why* debate underperforms solo agents in many published setups: standard debate protocols create incentives (win the argument, or reach consensus quickly) that actively work against truth-seeking. This reframes "does debate help" as a protocol/incentive-design question rather than a fixed property of multi-agent systems — and shows the failure is fixable with better protocol design (ColMAD), which matters for anyone deciding whether to abandon debate entirely vs. redesign it.
