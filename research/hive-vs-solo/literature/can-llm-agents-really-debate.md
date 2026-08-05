# Can LLM Agents Really Debate? A Controlled Study of Multi-Agent Debate in Logical Reasoning

**Authors:** Haolun Wu, Zhenkun Li, Lingyao Li
**Year:** 2025 (Nov 2025)
**Venue:** arXiv preprint
**URL / arXiv ID:** https://arxiv.org/abs/2511.07784

## Key findings

- Uses the Knight-Knave-Spy logic puzzle domain (verifiable ground truth, precise step-wise evaluation) to run a controlled study asking whether LLM debate involves genuine deliberative reasoning, or is effectively just ensembling/majority voting dressed up as "discussion."
- Systematically varies six structural/cognitive factors: agent team size, team composition (capability mix), confidence visibility, debate order, debate depth, and task difficulty — to isolate which actually drive debate success.
- Finding: **intrinsic reasoning strength and group diversity are the dominant drivers** of debate success; structural/procedural parameters (speaking order, whether confidence is visible to peers) offer only limited gains.
- Process-level analysis: **majority pressure suppresses independent correction** (agents conform to the group's wrong answer rather than sticking with their own correct reasoning); however, effective teams are characterized by being able to overturn an incorrect consensus when it arises.
- Rational, validity-aligned reasoning (reasoning that tracks logical validity rather than social signals) is the strongest within-debate predictor of whether the team's answer improves.

## Measured numbers

- No single topline accuracy delta highlighted in the abstract; the contribution is the controlled factorial decomposition of what does/doesn't drive debate success, using a puzzle domain with exact ground truth.

## Relevance to "when does a team beat the best solo agent"

Complements the "debate hacking" and "conformity" negative results by identifying what a team needs to succeed rather than just documenting failure: agent capability and genuine diversity of reasoning matter far more than debate protocol mechanics (order, confidence display), and majority pressure is the specific mechanism by which a team can suppress a correct minority opinion — directly relevant to designing any voting/consensus scheme.
