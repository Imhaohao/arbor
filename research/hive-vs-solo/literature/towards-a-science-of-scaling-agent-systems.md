# Towards a Science of Scaling Agent Systems

**Authors:** Yubin Kim, Ken Gu, Chanwoo Park, Chunjong Park, Samuel Schmidgall, A. Ali Heydari, Yao Yan, Zhihan Zhang, Yuchen Zhuang, Yun Liu, Mark Malhotra, Paul Pu Liang, Hae Won Park, Yuzhe Yang, Xuhai Xu, Yilun Du, Shwetak Patel, Tim Althoff, Daniel McDuff, Xin Liu (Google Research / Google DeepMind / MIT et al.)
**Year:** 2025 (Dec 2025)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2512.08296

## Key findings

- Controlled study across 260 configurations: 6 agentic benchmarks x 5 architectures (Single-Agent, Independent, Centralized, Decentralized, Hybrid multi-agent) x 3 LLM families, with tools/prompts/compute standardized to isolate architecture effects.
- Fits a quantitative scaling model (cross-validated R^2 = 0.373 overall, 0.413 with a task-grounded capability metric) predicting when coordination helps vs hurts.
- **Capability-saturation effect**: coordination yields diminishing or *negative* returns (beta = -0.408, p < 0.001) once the single-agent baseline already exceeds roughly 45% on a task — i.e., multi-agent coordination helps weak solo baselines, not strong ones.
- **Tool-coordination trade-off**: under fixed compute budgets, tool-heavy tasks suffer disproportionately from multi-agent overhead.
- **Topology-dependent error amplification**: architectures without centralized verification (independent agents) amplify errors ~17.2x through unchecked propagation vs ~4.4x for centralized coordination.
- Relative performance vs. single-agent baseline ranges from +80.8% (decomposable/parallelizable financial reasoning) to -70.0% (sequential planning) — architecture-task alignment, not agent count, determines whether the team wins.

## Measured numbers

- Coordination diminishing-returns coefficient: beta = -0.408 (p < 0.001) once solo baseline > ~45%.
- Error amplification: 17.2x (independent/no verification) vs 4.4x (centralized coordination).
- Task-dependent swing: +80.8% (parallelizable financial reasoning) to -70.0% (sequential planning), all multi-agent variants degraded on sequential tasks by 39-70%.
- Framework predicts best architecture for 87% of held-out configurations.

## Relevance to "when does a team beat the best solo agent"

Directly on-topic: this is the most systematic negative/conditional result available. It gives an explicit threshold (~45% single-agent accuracy) above which adding agents stops helping and starts hurting, and shows task structure (parallelizable vs. sequential) is the dominant factor, not team size. Strongest citation for "ensembles do NOT help" conditions.
