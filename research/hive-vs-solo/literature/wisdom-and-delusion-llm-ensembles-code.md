# Wisdom and Delusion of LLM Ensembles for Code Generation and Repair

**Authors:** Fernando Vallecillos-Ruiz, Max Hort, Leon Moonen
**Year:** 2025 (Oct 2025)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2510.21513

## Key findings

- Empirically compares 10 individual LLMs (from 5 model families) and 3 ensembles of these LLMs, across 3 software-engineering benchmarks covering code generation and program repair, to measure genuine complementarity (not just raw accuracy) between coding models.
- The **theoretical upper bound** for an ensemble's performance — i.e., if you had a perfect oracle selecting the correct candidate whenever *any* ensemble member produced it — is up to **83% above the best single model**. This is the complementarity ceiling, analogous to "1 - beta" in the co-failure-ceiling framing but measured directly for code tasks.
- In practice, **consensus-based selection strategies fall into a "popularity trap"**: they amplify common-but-incorrect outputs, since a wrong answer shared by several models outvotes a rare-but-correct one — directly costing most of that theoretical headroom.
- A **diversity-based selection strategy** (favoring less-common/complementary outputs rather than majority answers) realizes up to 95% of the theoretical potential, and remains effective even in small two-model ensembles — offering a cost-efficient path to real gains.
- The paper's framing explicitly criticizes the "pursuit of a single LLM for all software-engineering tasks" as resource-intensive and blind to complementary strengths across models.

## Measured numbers

- Theoretical ensemble upper bound: up to +83% over best single model (oracle selection).
- Diversity-based selection heuristic: realizes up to 95% of that theoretical potential; consensus/majority-based selection realizes much less due to the "popularity trap."
- Works with as few as 2 models in the ensemble.

## Relevance to "when does a team beat the best solo agent"

Important nuance to the negative-results literature: a large complementarity gap *does* exist between the best single model and what an ensemble could achieve in code tasks — but naive consensus/majority aggregation squanders most of it by amplifying shared wrong answers. The team only beats the single best model if the *selection mechanism* is diversity-aware rather than popularity-based — reinforces that aggregation-method choice, not team size, is usually the binding constraint.
