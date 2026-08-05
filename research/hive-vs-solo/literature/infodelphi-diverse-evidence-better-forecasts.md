# Diverse Evidence, Better Forecasts: Multi-Agent Deliberation Under Information Asymmetry

**Authors:** Yuante Li, Yicheng Tao, Kate Zhang, Taozhi Wang, Gefei Gu, Yaxin Zhou
**Year:** 2026 (posted Jul 2026)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2607.01661

## Key findings

- Identifies a specific design flaw behind weak multi-agent deliberation gains: when all agents in a forecasting/deliberation team are given **identical evidence**, deliberation collapses into herding (agents converge on shared priors/interpretation) rather than genuine belief revision — making the multi-agent system "little better than a single agent," consistent with the correlated-error findings elsewhere in this survey.
- Proposes the fix as **designed information asymmetry**: partition the available evidence into a shared public subset and disjoint private subsets, so each agent holds some exclusive information that can only reach the group through actual deliberation (not already baked into everyone's prompt).
- Theoretically shows this partitioning reduces inter-agent error correlation (directly addressing the mechanism identified as the root cause of ensemble underperformance in the correlated-errors/co-failure literature).
- Instantiates the idea in InfoDelphi: relevance-aware evidence routing + rationale-based iterative deliberation + confidence-weighted aggregation.
- On PolyGym (375 binary forecasting questions derived from real prediction markets), InfoDelphi outperforms the strongest single-agent and strongest prior multi-agent baselines by **12-18% in Brier score** and **4-8 percentage points in accuracy**.
- Ablation: removing the information asymmetry (giving all agents identical evidence again) eliminates most of the deliberation gain — confirming that evidence diversity, not agent count or debate mechanics, is the key enabler.

## Measured numbers

- 12-18% Brier score improvement, 4-8pp accuracy improvement over best single-agent and best multi-agent baseline, on 375-question PolyGym benchmark.
- Ablation (removing information asymmetry) eliminates most of the gain (exact residual not quantified in abstract).

## Relevance to "when does a team beat the best solo agent"

A rare paper that both diagnoses *why* naive multi-agent deliberation underdelivers (identical-evidence herding, i.e., artificially induced correlation) and demonstrates a concrete, measured fix (information partitioning) that reliably beats the single best agent. Strong positive-condition counterpart to the negative results: teams beat solo agents specifically when agents are given genuinely different information, not just different prompts/roles over the same information.
