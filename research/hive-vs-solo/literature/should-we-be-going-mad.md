# Should we be going MAD? A Look at Multi-Agent Debate Strategies for LLMs

**Authors:** Andries Smit, Paul Duckworth, Nathan Grinsztajn, Thomas D. Barrett, Arnu Pretorius (InstaDeep)
**Year:** 2023 (Nov 2023)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2311.17371

## Key findings

- Benchmarks a range of multi-agent debate (MAD) protocols against other prompting/ensembling strategies, explicitly trading off cost, time, and accuracy.
- Headline negative result: **multi-agent debating systems, in their default/as-published form, do not reliably outperform simpler strategies** such as self-consistency and ensembling over multiple independent reasoning paths (i.e., a non-communicating ensemble can match or beat debate).
- However, with hyperparameter tuning, several MAD variants (e.g., Multi-Persona) do improve and can even surpass all evaluated non-debate protocols — so MAD is not inherently worse, but it is markedly **more sensitive to hyperparameter settings and harder to optimize** than simpler ensembling approaches.
- Identifies agent-agreement-level tuning (how readily agents concede to each other) as a lever that can significantly change outcomes, sometimes enough to flip debate from underperforming to leading.
- Releases an open-source benchmark repository with multiple state-of-the-art debate protocols plus evaluation scripts for reproducibility.

## Measured numbers

- No single headline accuracy delta reported in the abstract; contribution is a systematic multi-protocol benchmark (cost/time/accuracy trade-off curves) rather than one topline number.

## Relevance to "when does a team beat the best solo agent"

An early, influential negative/mixed result: default multi-agent debate configurations are not a free win over much cheaper independent-sampling ensembles, and untuned debate is a fragile technique — a useful caution against assuming "agents talking to each other" is automatically better than "agents voting independently."
