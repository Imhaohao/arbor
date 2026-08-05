# Rethinking the Bounds of LLM Reasoning: Are Multi-Agent Discussions the Key?

**Authors:** Qineng Wang, Zihao Wang, Ying Su, Hanghang Tong, Yangqiu Song
**Year:** 2024 (Feb 2024)
**Venue:** arXiv preprint (widely cited; ACL-family reasoning literature)
**URL / arXiv ID:** https://arxiv.org/abs/2402.18272

## Key findings

- Systematically reevaluates the claim (from prior multi-agent-discussion papers) that multi-agent discussion improves LLM reasoning, via a new group-discussion framework designed to cover a richer set of discussion mechanisms than prior single-protocol studies.
- Headline finding: **a single-agent LLM given a strong prompt achieves almost the same performance as the best existing multi-agent discussion approach**, across a wide range of reasoning tasks and backbone LLMs — i.e., most of the "multi-agent" gain reported elsewhere is recoverable with better solo prompting.
- Critically, multi-agent discussion outperforms a single agent **only when there is no in-context demonstration (no few-shot examples) in the prompt** — once you give the single agent good few-shot demonstrations, the multi-agent advantage largely disappears.
- Provides analysis of the common interaction mechanisms LLMs exhibit during discussion (useful for understanding *why* discussion sometimes helps: filling in what a good prompt/demonstration would otherwise supply).

## Measured numbers

- "Almost the same performance" between best single-agent (strong prompt) and best multi-agent discussion approach — abstract does not give a single percentage, but frames it as a near-parity result across a wide task/model sweep.

## Relevance to "when does a team beat the best solo agent"

One of the cleanest "ensembles do NOT help" conditions identified: multi-agent discussion's apparent benefit is largely a substitute for missing prompt engineering (few-shot demonstrations) on the solo baseline. When the single agent is given an equally strong prompt, the team's advantage collapses — a strong caution against comparing an elaborate multi-agent pipeline to an under-optimized single-agent baseline.
