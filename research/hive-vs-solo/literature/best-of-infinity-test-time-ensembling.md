# Best-of-Infinity: Asymptotic Performance of Test-Time LLM Ensembling

**Authors:** Junpei Komiyama, Daisuke Oba, Masafumi Oyamada
**Year:** 2025 (Sep 2025), to appear ICLR 2026
**Venue:** ICLR 2026 (accepted)
**URL / arXiv ID:** https://arxiv.org/abs/2509.21091

## Key findings

- Studies best-of-N with majority-vote selection in the limit N -> infinity ("Bo-Inf") for a single model, characterizing the ceiling performance achievable with unlimited sampling budget.
- Because infinite budget is impractical, proposes an adaptive scheme that picks N per-query based on answer agreement, so easy queries stop sampling early and hard ones get more budget — efficient allocation of inference-time compute.
- Extends single-model best-of-N to **weighted ensembles of multiple distinct LLMs**, showing such mixtures can outperform any individual model — but the optimal weighting is a non-trivial mixed-integer linear program, not naive equal-weight voting.
- The existence of a finite Bo-Inf asymptote (rather than convergence to 100%) implies there is a hard ceiling on how much sampling-based ensembling can buy for a single model, even at infinite budget — errors that persist under infinite resampling are, by construction, not resolved by voting.

## Measured numbers

- No single headline accuracy number reported here (theory + adaptive-N framework paper); contribution is the asymptotic-limit formalization and the adaptive/weighted-ensemble algorithms, validated by "extensive experiments" per abstract.

## Relevance to "when does a team beat the best solo agent"

Provides the theoretical ceiling concept that complements the empirical "co-failure ceiling" work: even with unlimited resampling of one model, there's an asymptotic accuracy limit determined by the fraction of queries the model can never get right no matter how many times it's asked (its irreducible failure mode) — directly explaining why a "team of clones" cannot always beat a single strong model, and motivating cross-model mixtures instead.
