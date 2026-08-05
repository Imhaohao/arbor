# Wisdom of LLM Crowds: Aggregation and Contamination in Language Model Ensembles

**Author:** Igor Douven
**Year:** 2026 (posted May 2026)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2607.18269

## Key findings

- Tests whether the human "wisdom of crowds" effect (aggregate judgment beats best individual) replicates for LLM crowds, using 15 LLMs giving probability estimates on 254 binary real-world prediction-market questions.
- Learned aggregators (a small MLP and, separately, logistic regression) outperform every individual model and all classical (non-learned) aggregation methods; the two learned methods perform similarly, suggesting the gain comes from learning a *linear combination* of diverse outputs, not from complex nonlinear interactions.
- Symbolic regression on the learned aggregator recovers "model disagreement" as the simplest useful signal on the accuracy/complexity Pareto frontier — i.e., knowing when models disagree is itself informative.
- Major confound identified: **training-cutoff contamination**. The apparent accuracy gap between frontier cloud models and smaller local models shrinks from 35.8% to 8.9% once restricted to questions that resolved *after* every model's training cutoff (i.e., true forecasting, not memorized outcomes).
- Even on this contamination-clean subset, LLMs remain substantially less accurate than at the (contaminated) full-question level — a genuine capability gap in collective forecasting persists, not just a training-leakage artifact.

## Measured numbers

- Frontier-vs-small-model apparent gap: 35.8% (full/contaminated set) -> 8.9% (clean, post-cutoff-only subset).
- 15-LLM crowd, 254 prediction-market questions; learned aggregators beat all individual models and classical aggregation.

## Relevance to "when does a team beat the best solo agent"

Positive for aggregation (learned combiners beat every single model here), but the contamination finding is a critical methodological warning: much of the apparent "ensemble/crowd wins" literature on forecasting/QA benchmarks may be partly an artifact of training-data leakage rather than genuine aggregation benefit, and the true (post-cutoff) gap is much smaller than naive benchmark numbers suggest.
