# When Does Combining Language Models Help? A Co-Failure Ceiling on Routing, Voting, and Mixture-of-Agents Across 67 Frontier Models

**Author:** Josef Chen
**Year:** 2026 (posted Jun 2026)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2606.27288

## Key findings

- Formalizes a hard ceiling: for *any* multi-model policy whose final output must equal one member model's answer (this covers routing, voting, cascades, fusion-by-selection, and MoA-style selection), accuracy cannot exceed `1 - beta`, where beta is the "all-wrong" co-failure rate — the fraction of queries where *every* model in the pool is simultaneously wrong.
- Shows the commonly-reported diagnostic, average pairwise error correlation (rho), **cannot identify beta**: error distributions with identical marginals and identical pairwise correlations can have very different all-wrong tail rates — so "low correlation" numbers reported elsewhere don't guarantee large ensemble headroom.
- Empirically, across 67 models from 21 providers, a tetrachoric-calibrated single-factor correlation model still *underprices* the all-wrong tail: on open-ended math, observed beta = 0.052 vs. 0.023 predicted by a full 67-model Gaussian-copula model (~2.5x underpricing, 90% CI 1.7-3.4x).
- Similar tail effect on execution-graded code (beta = 0.079); re-asking GPQA-Diamond questions in free-response (vs. multiple-choice) format reopens a larger co-failure tail (beta = 0.127) — so *answer format*, not just subject matter, can hide or expose correlated failure.
- Bottom line: at matched quality, low-correlation heterogeneous ensembles beat high-correlation homogeneous ensembles (e.g., Self-MoA) — but on checkable tasks in this study, **combining models rarely beat the single best model without a strong query-level routing signal**. Gains come specifically from models failing on *different* questions, not from adding more models per se.

## Measured numbers

- beta (all-wrong co-failure rate): 0.052 (math, observed) vs. 0.023 (math, naive copula prediction) — ~2.5x underpricing (90% CI 1.7-3.4x, k=17).
- beta = 0.079 on execution-graded code; beta = 0.127 on free-response GPQA-Diamond (vs. lower in multiple-choice format).
- 67 models, 21 providers tested.

## Relevance to "when does a team beat the best solo agent"

This is the clearest theoretical-plus-empirical account of *why* ensembling underdelivers: it names and measures the specific quantity (co-failure rate beta) that caps any selection-based ensemble's accuracy, shows the standard correlation metric people report is the wrong one to check, and states plainly that without a genuine per-query routing signal, combining models rarely beats the single best model on checkable tasks.
