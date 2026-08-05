# Literature Survey: When Does a Multi-Agent Ensemble/Team Outperform the Single Best Agent?

Scope: 21 papers retrieved and verified (title/authors/date confirmed against the live arXiv API) across five sub-topics: (1) ensembles vs. single best model, (2) "more agents" sampling/scaling, (3) correlated vs. independent failure, (4) multi-agent debate/critique, (5) mixture-of-agents architectures. All entries below have a real, checked arXiv ID. No paper is included that could not be verified.

Note on dates: several papers cited here (e.g., arXiv IDs in the 2602-2607 range) carry 2026 arXiv identifiers. The current date in this session is 2026-08-05, so these are legitimate recent postings, not errors — each was individually confirmed via `https://export.arxiv.org/api/query?id_list=<id>`.

## Papers by sub-topic

### 1. Ensembles vs. single best model (general)
- `nine-judges-two-effective-votes.md` (arXiv:2605.29800) — best single judge beats a 9-judge panel in every condition tested.
- `co-failure-ceiling-combining-language-models.md` (arXiv:2606.27288) — formal ceiling `acc <= 1 - beta`; combining rarely beats best single model without a real routing signal.
- `dont-always-pick-highest-performing-model.md` (arXiv:2602.08003) — information-theoretic error floor; top-k-by-accuracy selection is suboptimal.
- `correlated-errors-in-llms.md` (arXiv:2506.07962) — 350+ models, 60% same-item error agreement, correlation persists across architectures/providers.
- `authenhallu-hallucination-detection-ensembles.md` (arXiv:2510.10539) — zero tested ensemble configs beat the single best hallucination detector.
- `wisdom-and-delusion-llm-ensembles-code.md` (arXiv:2510.21513) — up to 83% theoretical headroom over best single model in code tasks, but naive consensus captures little of it.

### 2. "More agents is all you need" / sampling-scaling
- `more-agents-is-all-you-need.md` (arXiv:2402.05120) — independent resampling + majority vote scales accuracy with N; foundational positive result.
- `towards-a-science-of-scaling-agent-systems.md` (arXiv:2512.08296) — 260-configuration controlled study; coordination gains flip negative once solo baseline > ~45%; task structure (parallel vs. sequential) dominates.
- `best-of-infinity-test-time-ensembling.md` (arXiv:2509.21091) — formalizes the asymptotic ceiling of best-of-N voting as N -> infinity; extends to weighted cross-model ensembles.

### 3. Correlated vs. independent failure
- `correlated-errors-in-llms.md` (arXiv:2506.07962)
- `co-failure-ceiling-combining-language-models.md` (arXiv:2606.27288)
- `nine-judges-two-effective-votes.md` (arXiv:2605.29800)
- `dont-always-pick-highest-performing-model.md` (arXiv:2602.08003)
- `consensus-is-not-verification.md` (arXiv:2603.06612) — correlation is structural even on random-string tasks with no semantic content.
- `minority-sentinel-debate-majority-voting.md` (arXiv:2606.29270) — quantifies the Condorcet-theorem assumption violation directly (~25% of disagreements have correct answer in the minority).

### 4. Multi-agent debate / critique
- `should-we-be-going-mad.md` (arXiv:2311.17371) — untuned MAD doesn't beat self-consistency/independent-path ensembling.
- `rethinking-bounds-llm-reasoning-discussions.md` (arXiv:2402.18272) — single agent + strong prompt ~ matches best discussion method; MAD helps mainly when the solo baseline lacks few-shot demonstrations.
- `talk-isnt-always-cheap-debate-failure-modes.md` (arXiv:2509.05396) — debate can actively degrade a strong agent's accuracy via sycophancy/conformity, especially with heterogeneous capability mixes.
- `when-why-multi-agent-debate-fails.md` (arXiv:2510.20963) — "debate hacking": competitive debate -> cheap talk, consensus debate -> premature agreement; both underperform solo; fixable with incentive redesign (ColMAD).
- `can-llm-agents-really-debate.md` (arXiv:2511.07784) — controlled logic-puzzle study; intrinsic reasoning strength + genuine diversity drive success, not debate mechanics; majority pressure suppresses correct minorities.
- `minority-sentinel-debate-majority-voting.md` (arXiv:2606.29270) — measures and partially recovers the accuracy majority voting throws away.
- `infodelphi-diverse-evidence-better-forecasts.md` (arXiv:2607.01661) — identical-evidence deliberation collapses into herding; designed information asymmetry fixes it and beats single-agent + prior multi-agent baselines.

### 5. Mixture-of-agents architectures
- `mixture-of-agents.md` (arXiv:2406.04692) — layered MoA beats GPT-4 Omni on AlpacaEval 2.0 using only open-source components.
- `llm-peer-review-ensembling.md` (arXiv:2512.23213) — unsupervised peer-review-style selection ensemble, +6.9-7.3pp over prior selection SOTA.
- `wisdom-of-llm-crowds-aggregation-contamination.md` (arXiv:2607.18269) — learned aggregators beat every individual model, but apparent gains partly reflect training-cutoff contamination (35.8% -> 8.9% gap once controlled).
- `wisdom-of-the-silicon-crowd.md` (arXiv:2402.19379) — 12-LLM crowd matches 925-person human crowd in forecasting; earlier/weaker positive result (not tested against single best LLM).

## Conditions under which ensembles do NOT help

This is the load-bearing section. Across the retrieved literature, five recurring conditions predict when a team fails to beat (or actively underperforms) the single best agent:

1. **High error correlation among ensemble members, which is the empirical default, not the exception.** `correlated-errors-in-llms.md` finds ~60% same-item error agreement between model pairs, and — critically — correlation is *highest* among the strongest, most accurate models, exactly where you'd most want ensembling to add value. `consensus-is-not-verification.md` shows this correlation is structural enough to appear even on meaningless random-string tasks with no semantic content to agree on.

2. **The "co-failure ceiling" / effective-vote collapse.** Any selection-based ensemble (routing, voting, MoA-style selection) is mathematically capped at `1 - beta`, where beta is the all-models-simultaneously-wrong rate — and `co-failure-ceiling-combining-language-models.md` shows the standard diagnostic (pairwise error correlation, rho) systematically underestimates beta by ~2.5x. `nine-judges-two-effective-votes.md` gives the sharpest concrete instance: 9 correlated judges carry the statistical information of only ~2 independent votes, and the single best judge beats the full panel in every tested condition, with the gap not closeable by adding more judges or smarter aggregation (best method recovers <=11% of the theoretical loss).

3. **High task difficulty / strong solo baseline.** `towards-a-science-of-scaling-agent-systems.md` finds a clean threshold: once a single agent already scores above ~45% on a task, adding coordination produces diminishing or *negative* returns (beta = -0.408, p<0.001). Multi-agent value is concentrated in the regime where the solo baseline is weak — not where it's already strong, which is the opposite of the situation where teams are typically deployed to "push further."

4. **Sequential / non-decomposable tasks, and unverified domains.** The same scaling-agent-systems paper shows multi-agent variants degrade performance by 39-70% on sequential planning tasks, vs. +80.8% gains on decomposable/parallelizable tasks — architecture-task mismatch, not agent count, drives the sign of the effect. `consensus-is-not-verification.md` draws an analogous domain line for compute scaling: verifiable domains (math/code, where an external filter can select correct candidates) benefit from more samples, but truthfulness/factuality tasks (no convenient verifier) show *no consistent gain* even at 25x inference cost, and aggregation often amplifies shared misconceptions instead.

5. **Debate/consensus protocols with the wrong incentive structure, or agents given identical evidence.** `when-why-multi-agent-debate-fails.md` names "debate hacking": competitive debate collapses into persuasive cheap talk, consensus-seeking debate collapses into premature agreement that discards real disagreement — both underperform single-agent baselines. `talk-isnt-always-cheap-debate-failure-modes.md` shows a single weak agent mixed into a debate with a strong agent can drag the strong agent's accuracy down via sycophancy/conformity. `infodelphi-diverse-evidence-better-forecasts.md` pinpoints a root cause applicable across several of these papers: when every agent sees the same evidence, deliberation is just herding around a shared prior, and the team is "little better than a single agent" — the fix (information asymmetry across agents) is a *design* condition, not an inherent property of multi-agent systems, which cuts the other way: teams beat solo agents specifically when members hold genuinely different information, not just different roles/prompts over the same information.

A secondary, more subtle negative-adjacent finding: apparent "ensemble/crowd beats individuals" results in forecasting/QA settings can be partly a training-data-contamination artifact — `wisdom-of-llm-crowds-aggregation-contamination.md` shows the frontier-vs-small-model gap shrinks from 35.8% to 8.9% once restricted to genuinely out-of-training-window questions, meaning some published ensemble-benefit numbers may not replicate cleanly out of sample.

## What this implies for team-vs-solo design (synthesis)

- Independent resampling of one strong model (More-Agents-style) is the safest default gain, but it is bounded by that model's own irreducible/asymptotic error floor (Best-of-Infinity) — it cannot fix systematic (non-random) errors.
- Cross-model ensembles only reliably beat the single best model when (a) member errors are measurably decorrelated (verify via co-failure rate beta, not pairwise rho), (b) the task is decomposable/parallelizable rather than sequential, (c) the solo baseline isn't already strong (<~45% accuracy on the target task is the empirical regime where coordination helps), and (d) the aggregation mechanism is diversity-aware (weighted by information gain, or minority-preserving) rather than naive majority/consensus voting, which actively amplifies shared wrong answers ("popularity trap").
- For debate specifically: protocol/incentive design (ColMAD-style non-zero-sum framing, or Minority-Sentinel-style overturn mechanisms) can convert a losing debate setup into a winning one — so "debate doesn't help" findings are largely about specific implementations, not an intrinsic ceiling, but the *default*/naive implementations in wide use today frequently do underperform a well-prompted single agent.

## Omitted / could not verify

No papers were dropped for failing verification — every arXiv ID cited above was confirmed live against `export.arxiv.org/api/query`. Two papers mentioned only in passing during initial web search (a "Choi et al." debate-aggregation critique, and a Dirichlet-Categorical martingale theory result for MAD) were **not** included as standalone files because their exact arXiv IDs / full citations could not be independently confirmed within this survey's search — they are omitted rather than guessed. If needed, follow-up search specifically for "Choi multi-agent debate aggregation strategy independent answering" and "Dirichlet-Categorical martingale multi-agent debate belief model" could locate and verify them.
