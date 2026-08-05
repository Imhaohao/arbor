# Correlated Errors in Large Language Models

**Authors:** Elliot Kim, Avi Garg, Kenny Peng, Nikhil Garg
**Year:** 2025 (Jun 2025)
**Venue:** ICML 2025
**URL / arXiv ID:** https://arxiv.org/abs/2506.07962

## Key findings

- Large-scale empirical study of error correlation across 350+ LLMs, using two popular leaderboards plus a real resume-screening task.
- Substantial correlation in model errors: on one leaderboard dataset, two models agree on being wrong 60% of the time when both err — far above what independent-error assumptions would predict.
- Shared architecture and shared providers drive some correlation, as expected — but critically, **larger and more accurate models have highly correlated errors even across distinct architectures and distinct providers**, i.e., correlation is not just a "same lineage" artifact; capability itself seems to induce convergent failure modes.
- Demonstrates downstream consequences in two applied settings: LLM-as-judge evaluation (correlated judges give a false sense of independent confirmation) and algorithmic hiring/resume screening (correlated errors across "different" model-based screeners reflect real-world "algorithmic monoculture" risk — many employers using different LLM tools end up rejecting the same candidates for the same reasons).

## Measured numbers

- ~60% same-item error agreement rate between model pairs (conditional on both erring), on one leaderboard dataset.
- Evaluated on 350+ LLMs total across two leaderboards + one applied resume-screening task.

## Relevance to "when does a team beat the best solo agent"

This is a core mechanistic paper for the "ensembles fail" side: it directly measures and explains *why* redundancy underdelivers — the diversity assumption behind ensembling (different training data/architecture/provider -> independent errors) does not hold empirically, especially among the strongest models, which is exactly the regime where you'd most want an ensemble to help.
