# Minority Sentinel: When to Overturn Majority Voting in Multi-Agent LLM Debates

**Authors:** Chuan He, Zebin Chen, Zhengyi Yang, Shaobo Qiao, Mingchen Ju, Jiate Liu, Dong Wen, Guanfeng Liu
**Year:** 2026 (posted Jun 2026)
**Venue:** AgentSearch Workshop @ SIGIR 2026 (accepted)
**URL / arXiv ID:** https://arxiv.org/abs/2606.29270

## Key findings

- Diagnoses why Multi-Agent Debate + Majority Voting underperforms its theoretical justification: majority voting's guarantee rests on the Condorcet Jury Theorem, which assumes *independent* errors across agents — but because contemporary LLMs share similar pretraining corpora, their errors are strongly correlated, so the majority can systematically suppress a correct minority ("Minority Truth" phenomenon).
- Across debates among 3 heterogeneous LLM agents on 6 benchmarks, roughly **1 in 4 divergent cases** (cases where agents disagree) has the *minority* holding the correct answer — implying a **10-percentage-point theoretical recovery margin** if the correct minority could be identified and promoted instead of outvoted.
- Proposes Minority Sentinel: a lightweight, non-LLM meta-classifier (LightGBM) trained on a multi-dimensional "debate fingerprint" extracted from debate logs, deciding when to overturn the majority vote in favor of the minority.
- Minority Sentinel achieves 81.2% Flip Precision (i.e., when it decides to overturn the majority, it's right 81.2% of the time) and positive Net Gain across all 6 datasets and all 20 random seeds tested — a stable, reliable correction mechanism.
- Notably, an **LLM-as-Judge baseline for the same overturn decision yields *negative* Net Gain** despite higher recall — meaning an LLM judge is not a good tool for detecting when the majority is wrong; a purpose-built lightweight classifier on debate metadata does better. Flip *safety* (precision), not raw recovery volume (recall), determines whether the intervention is net positive.

## Measured numbers

- ~25% of divergent (disagreement) cases have the correct answer in the minority.
- 10-percentage-point theoretical accuracy recovery margin if minority-truth cases could be perfectly identified.
- Minority Sentinel: 81.2% Flip Precision, positive Net Gain on all 6 datasets x 20 seeds.
- LLM-as-Judge overturn baseline: negative Net Gain despite higher recall than Minority Sentinel.

## Relevance to "when does a team beat the best solo agent"

Gives a quantitative account of exactly how much accuracy a naive majority-vote team loses to correlated errors (~10pp headroom suppressed), and shows this is partially recoverable — but only with a carefully engineered, non-LLM correction mechanism, not by simply adding an LLM judge on top (which makes things worse). Reinforces that plain majority voting among correlated agents actively discards useful minority signal rather than merely failing to use it.
