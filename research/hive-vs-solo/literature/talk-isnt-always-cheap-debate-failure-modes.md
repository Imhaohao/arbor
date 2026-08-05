# Talk Isn't Always Cheap: Understanding Failure Modes in Multi-Agent Debate

**Authors:** Andrea Wynn, Harsh Satija, Gillian Hadfield
**Year:** 2025 (Sep 2025)
**Venue:** ICML MAS (Multi-Agent Systems) Workshop 2025
**URL / arXiv ID:** https://arxiv.org/abs/2509.05396

## Key findings

- Directly tests whether multi-agent debate can actively *degrade* performance below what a single agent achieves alone — and finds yes, this happens systematically, not as a rare edge case.
- Studies **heterogeneous** debate groups (mixed model capability), unlike most prior debate work which studies homogeneous agent groups — this is the key novel axis.
- Finds debate accuracy can *decrease over time* (across debate rounds) even in settings where stronger/more capable models numerically outnumber weaker ones in the group.
- Mechanism: models frequently flip from a correct answer to an incorrect one in response to a peer's (wrong) reasoning — agents favor agreement/consensus over challenging flawed reasoning from a peer.
- Investigates contributing factors: sycophancy, social conformity, and model/task type all implicated as drivers of these harmful answer-flips.
- Key practical warning: **introducing even one weak agent into a debate with a strong agent can drag the strong agent down**, producing a worse final answer than if the strong agent had simply answered alone with no debate.

## Measured numbers

- No single aggregate accuracy delta highlighted in the abstract; the core evidence is the *directional* finding (accuracy decreasing across debate rounds) replicated across multiple experimental conditions varying agent capability mix.

## Relevance to "when does a team beat the best solo agent"

Directly answers "when does the team fail": debate degrades when weaker agents are mixed with stronger ones and the interaction dynamic rewards agreement over correction (sycophancy/conformity) — meaning naive multi-agent debate can make a strong solo agent's answer *worse*, not just fail to improve it. Important for any design that assumes "more voices, more accuracy."
