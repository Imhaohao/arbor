# Scoring, Reasoning, and Selecting the Best! Ensembling Large Language Models via a Peer-Review Process

**Authors:** Zhijun Chen, Zeyu Ji, Qianren Mao, Hao Wu, Jinhuan Song, Junhang Cheng, Bangjie Qin, Zhuoran Li, Jingzheng Li, Kai Sun, Zizhe Wang, Yikun Ban, Zhu Sun, Xiangyang Ji, Hailong Sun
**Year:** 2025 (Dec 2025)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2512.23213

## Key findings

- Proposes LLM-PeerReview: an unsupervised ensemble method that generates multiple candidate responses (from diverse LLMs), has multiple LLMs score every candidate ("peer review" via LLM-as-judge), then aggregates scores (simple averaging, or a graphical-model-based truth-inference algorithm) to pick the single best response.
- Framed explicitly as selecting "the best" from a candidate pool rather than fusing/synthesizing a new answer — a selection-based ensemble, contrasted with generative aggregation (MoA-style).
- Fully unsupervised (no labeled training data needed for the selection mechanism), which the authors position as a practical advantage over learned aggregators/routers.
- Outperforms the prior state-of-the-art selection baseline "Smoothie-Global" by 6.9-7.3 percentage points across four datasets spanning factual QA, math reasoning, and instruction following.

## Measured numbers

- +6.9pp and +7.3pp over Smoothie-Global (two LLM-PeerReview variants), averaged/aggregated across 4 diverse benchmarks.

## Relevance to "when does a team beat the best solo agent"

A positive result for team-based selection, but it is worth flagging that peer-review/LLM-as-judge aggregation is exactly the mechanism shown to be vulnerable to correlated errors in `nine-judges-two-effective-votes.md` and `consensus-is-not-verification.md` — i.e., its gains over a weaker selection baseline don't resolve the question of whether it beats the *single best* underlying model when judges share systematic blind spots.
