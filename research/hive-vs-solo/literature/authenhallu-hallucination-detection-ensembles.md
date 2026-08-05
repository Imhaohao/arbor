# Detecting Hallucinations in Authentic LLM-Human Interactions (AuthenHallu)

**Authors:** Yujie Ren, Niklas Gruhlke, Anne Lauscher
**Year:** 2025 (Oct 2025)
**Venue:** LREC 2026 (accepted)
**URL / arXiv ID:** https://arxiv.org/abs/2510.10539

## Key findings

- Introduces AuthenHallu, the first hallucination-detection benchmark built entirely from *genuine* LLM-human dialogue transcripts (not artificially induced or simulated hallucinations), to better reflect real-world hallucination characteristics.
- Hallucinations occur in 31.4% of query-response pairs in the benchmark overall, rising sharply to 60.0% in challenging domains such as Math & Number Problems.
- Explores using vanilla LLMs themselves as hallucination detectors, including ensemble configurations of multiple detector LLMs.
- **None of the tested ensemble configurations outperform the single best individual model** on any detection metric — the paper attributes this to the evaluated LLMs making correlated errors specifically on hallucination detection: when a stronger model makes a mistake, other ensemble members tend to reinforce rather than correct it.
- Concludes that current LLM-based hallucination detectors (solo or ensembled) remain insufficiently reliable for real-world deployment in sensitive domains (medicine, law).

## Measured numbers

- 31.4% overall hallucination rate in genuine dialogues; 60.0% in Math & Number Problems domain.
- Ensemble detector configurations: 0 out of tested configurations beat the single best model on any metric (explicit negative result).

## Relevance to "when does a team beat the best solo agent"

A concrete, task-specific negative case study directly on point: in hallucination detection specifically, ensembling detector LLMs provides no benefit over using the single best detector, because detector errors are correlated — mirrors the mechanism identified in `correlated-errors-in-llms.md` and `consensus-is-not-verification.md` but in an applied benchmark setting rather than a theoretical one.
