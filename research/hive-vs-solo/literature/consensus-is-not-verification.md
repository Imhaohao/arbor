# Consensus is Not Verification: Why Crowd Wisdom Strategies Fail for LLM Truthfulness

**Authors:** Yegor Denisov-Blanch, Joshua Kazdan, Jessica Chudnovsky, Rylan Schaeffer, Sheng Guan, Soji Adeshina, Sanmi Koyejo
**Year:** 2026 (posted Feb 2026)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2603.06612

## Key findings

- Asks whether scaling inference compute via polling/aggregation (which works for math/code, where an external verifier can filter candidates) also works for **truthfulness/factuality**, a domain without a convenient automated verifier.
- Answer across 5 benchmarks and multiple models: **no**. Even at 25x the inference cost of naive single-sampling, polling-style aggregation yields no consistent accuracy gains over single-sample baselines, and often *amplifies* shared misconceptions rather than correcting them.
- Mechanistic finding: under uncertainty, models are better at predicting *what other models will say* than at identifying *what is true* — a separation between social prediction (conformity) and genuine truth verification, which explains why aggregation converges on popular-but-wrong answers.
- Error correlation is deep, not superficial: even when models are asked to produce pseudo-random outputs on out-of-distribution random-string tasks (no semantic content to agree on), *different models still produce correlated outputs* — suggesting shared correlation isn't just about shared "knowledge" but something more structural in how models are trained/aligned.
- Confidence-based weighting does not help: self-reported confidence fails to reliably distinguish correct from incorrect answers, so weighting votes by stated confidence doesn't rescue aggregation.

## Measured numbers

- Up to 25x inference cost tested with no consistent accuracy gain over single-sample baseline, across 5 benchmarks.

## Relevance to "when does a team beat the best solo agent"

Sharpest negative result in this survey on the domain boundary for ensembling: draws a clean line between *verifiable* domains (math/code — where sampling+voting/filtering genuinely works, consistent with More-Agents-Is-All-You-Need) and *unverifiable* domains (truthfulness/factuality — where more samples just reinforce shared errors, no matter how much compute is spent). Directly explains a key "conditions under which ensembles do NOT help."
