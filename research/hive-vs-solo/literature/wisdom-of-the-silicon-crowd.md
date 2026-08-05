# Wisdom of the Silicon Crowd: LLM Ensemble Prediction Capabilities Rival Human Crowd Accuracy

**Authors:** Philipp Schoenegger, Indre Tuminauskaite, Peter S. Park, Rafael Valdece Sousa Bastos, Philip E. Tetlock
**Year:** 2024 (arXiv Feb 2024); journal version 2024
**Venue:** Science Advances 10(45):eadp1528, 2024 (arXiv preprint also available)
**URL / arXiv ID:** https://arxiv.org/abs/2402.19379

## Key findings

- Tests whether classical human "wisdom of crowds" (aggregating independent forecasts beats best individual) transfers to a crowd of 12 LLMs making probabilistic forecasts on 31 binary questions from a real forecasting tournament.
- Simple median aggregation of the 12-LLM crowd was statistically indistinguishable from a crowd of 925 human forecasters on the same questions.
- Builds on a prior negative finding (Schoenegger & Park 2023): a single frontier model (GPT-4) alone performed poorly against the human tournament crowd, not significantly beating a no-information 50% baseline — i.e., the *single* model was weak, but the *aggregate* of many LLMs was competitive with human-crowd-level accuracy.
- The LLM crowd exhibited human-like collective biases (acquiescence effect, preference for round numbers) even in aggregate, suggesting some bias is preserved rather than averaged out.
- Preregistered analysis: LLM crowd beat the no-information benchmark and was not statistically different from the human crowd (though not shown to *beat* the human crowd either).

## Measured numbers

- 12-LLM crowd (median aggregation) vs. 925-person human crowd: statistically indistinguishable on 31 forecasting questions.
- A single GPT-4 alone: not significantly better than a flat 50% no-information baseline (from the earlier Schoenegger & Park 2023 result cited here).

## Relevance to "when does a team beat the best solo agent"

Important early positive case specifically for *ensemble-of-many-weak-forecasters beating a single strong-but-uncalibrated model*, in a domain (probabilistic forecasting) where a single model's own uncertainty is a real limitation. But it does not test the team against the *single best* individual LLM in the pool — only against a single frontier model and a no-information baseline — so it's a weaker "beats-the-best" data point than the later contamination-controlled follow-up (`wisdom-of-llm-crowds-aggregation-contamination.md`).
