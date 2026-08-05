# Don't Always Pick the Highest-Performing Model: An Information Theoretic View of LLM Ensemble Selection

**Authors:** Yigit Turkmen, Baturalp Buyukates, Melih Bastopcu
**Year:** 2026 (posted Feb 2026)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2602.08003

## Key findings

- Frames ensemble member selection as maximizing mutual information between the true label and the joint predictions of the selected model subset, under a query/compute budget — not simply picking the top-k models by individual accuracy.
- Explicitly targets the question this survey cares about: models are ensembled to improve reliability/robustness, but in practice models are strongly correlated, so naively picking the highest-accuracy individual models for the ensemble is often suboptimal.
- Models correlated errors with a Gaussian-copula formulation and derives an **information-theoretic error floor** — a hard lower bound on achievable ensemble error that explains why performance saturates (stops improving) even as more models are added, echoing the co-failure-ceiling result from a different (information-theoretic rather than combinatorial) angle.
- Proposes a simple greedy mutual-information selection algorithm, estimating the needed information terms directly from data, that iteratively builds an ensemble under a fixed query budget.
- Tested on MEDMCQA, MMLU, and IMDB sentiment classification: the greedy MI-selection method consistently outperforms strong baselines (presumably including top-k-by-accuracy selection) at the same query budget.

## Measured numbers

- Evaluated on 3 datasets (MEDMCQA, MMLU, IMDB); "consistently outperforms strong baselines under the same query budget" (no single headline percentage given in the abstract).

## Relevance to "when does a team beat the best solo agent"

Directly actionable for ensemble *design*: confirms that picking the individually-strongest models for a team is not the same as picking the team that beats the single best model, because correlation between the top performers can waste budget on redundant votes; the fix is selecting for complementary error patterns (information gain) rather than raw individual accuracy.
