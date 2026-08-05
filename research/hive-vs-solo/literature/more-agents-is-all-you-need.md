# More Agents Is All You Need

**Authors:** Junyou Li, Qin Zhang, Yangbin Yu, Qiang Fu, Deheng Ye (Tencent AI Lab)
**Year:** 2024 (v1 Feb 2024, v2 Oct 2024)
**Venue:** Transactions on Machine Learning Research (TMLR)
**URL / arXiv ID:** https://arxiv.org/abs/2402.05120

## Key findings

- Simple sampling-and-voting ("Agent Forest"): run the *same* LLM on the *same* query N times independently (no cross-agent context sharing), then majority-vote the answers. Accuracy scales with N.
- The technique is orthogonal to (stacks with) other prompting/agentic methods (CoT, MAD, etc.) — it's a free multiplier on top of them.
- Degree of improvement is correlated with task difficulty: harder tasks benefit more from ensemble size, up to a point.
- At ensemble sizes of 15–20 samples, weaker/cheaper backbones (Llama2-70B, GPT-3.5-Turbo) reach accuracy comparable to a single GPT-4 call on some benchmarks.
- Performance gains saturate — they explicitly study "the properties that facilitate occurrence" of scaling benefit, implying it does not hold universally across all tasks/regimes.

## Measured numbers

- Ensemble size 15–20 needed for Llama2-70B / GPT-3.5-Turbo sampling-voting to match single-shot GPT-4 on benchmarks tested.
- No cross-agent communication is required for the effect — plain independent resampling + vote is sufficient.

## Relevance to "when does a team beat the best solo agent"

This is the foundational positive result: independent resampling of one model (a degenerate "team" of clones) reliably beats a single call, provided errors across samples are not perfectly correlated and voting can arbitrate. It sets the baseline that later "correlated-error" papers (see co-failure-ceiling, correlated-errors-in-llms) qualify — the benefit depends on how independent the per-sample errors actually are, which this paper does not directly measure.
