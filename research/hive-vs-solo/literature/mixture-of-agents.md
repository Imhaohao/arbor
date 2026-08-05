# Mixture-of-Agents Enhances Large Language Model Capabilities

**Authors:** Junlin Wang, Jue Wang, Ben Athiwaratkun, Ce Zhang, James Zou
**Year:** 2024 (Jun 2024)
**Venue:** ICLR 2025
**URL / arXiv ID:** https://arxiv.org/abs/2406.04692 (code: https://github.com/togethercomputer/moa)

## Key findings

- Proposes Mixture-of-Agents (MoA): a layered architecture where each layer has multiple LLM "proposer" agents, and each agent in layer L+1 sees all outputs from layer L as auxiliary context before generating its own response; a final aggregator layer produces the answer.
- Identifies and names the "collaborativeness of LLMs" phenomenon — models tend to produce better responses when shown other models' outputs as context, even models weaker than themselves.
- MoA built purely from open-source LLMs achieves state-of-the-art on AlpacaEval 2.0 (65.1% length-controlled win rate), MT-Bench, and FLASK — beating GPT-4 Omni (57.5% on AlpacaEval 2.0) despite using no proprietary frontier model as a component.
- Ablations with smaller open models (gemma-2-9b, llama-3.1-8b, mistral-7b-instruct-v0.3, qwen-1.5-7b) as proposers show up to 12% improvement over the best individual model; using gemma-2-9b as aggregator alone reaches 56.83% LC win rate — comparable to GPT-4o despite the components all being much smaller.
- Natural-language intermediate outputs (vs. numeric ensembling) improve interpretability of the aggregation process.

## Measured numbers

- AlpacaEval 2.0 LC win rate: MoA (open-source only) 65.1% vs. GPT-4 Omni 57.5%.
- Up to +12% over best individual small model when combining 4 ~7-9B open models via MoA.
- Small-model aggregator (gemma-2-9b) reaches 56.83% LC win rate, on par with/above GPT-4 and comparable to GPT-4o.

## Relevance to "when does a team beat the best solo agent"

Central positive-result architecture for this survey: shows a structured multi-layer team of weaker open models can exceed a single frontier proprietary model, provided the architecture lets later agents condition on earlier agents' full outputs (not just vote on final answers). Later critical work (correlated-errors, co-failure-ceiling papers) specifically tests whether MoA-style gains hold up when proposer models are highly correlated — worth reading together with `co-failure-ceiling-combining-language-models.md`.
