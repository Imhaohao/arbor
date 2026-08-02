# Model/Agent Routing — Research and Implementation Handoff

Portable methodology for routing requests across many models or agents. Written to
be reused outside Arbor: sections 1–5 and 9–10 are system-agnostic; section 6–8
use Arbor numbers as worked examples.

Everything numeric here was measured on 26,492 real labels, not estimated. Where a
result is negative it is kept, because the negative results are the most
transferable part.

---

## 1. The one-line thesis

**Measured behavioural rates beat learned features under distribution shift, and a
routing weight is not a routing signal until you have measured what it
discriminates.**

Two concrete consequences, both counterintuitive, both validated below:

- A 38-feature logistic regression scored **worse** on an honest holdout (0.8978
  AUC) than a single unfitted smoothed rate (0.9344).
- A nominally 4-dimensional router was empirically ~1.4-dimensional: 30% of its
  weight was mathematically incapable of reordering any candidate.

---

## 2. Source research (verified, with the numbers that matter)

**arXiv:2603.20895** — "LLM Router: Prefill is All You Need" (NVIDIA; Varshney,
Surla, Xu, Krishnan, Jeblick, Austin, Vaidya, Onofrio). v1 21 Mar 2026; v2 31 Mar
2026 retitled "Rethinking Routing with Prefill Activations".
The gingerlabs.ai/blog/prefill-activation-routing post is a derivative writeup —
every figure traces back to this paper's tables.

Method: read hidden states from the upper half of a transformer's layers (L/2..L)
on the *query only*, before generation. Select the layer by Fisher separability
`J = ||mu1-mu0||^2 / (tr(S0)+tr(S1))`, sanity-check with effective dimensionality
(participation ratio) and anisotropy (mean pairwise cosine). PCA to 50–300 dims.
Feed concatenated per-target features to a shared-trunk MLP with one head per
candidate model; train with BCE, then Platt-scale on out-of-fold samples.

**The routing objective — adopt this verbatim, it is the reusable part:**

```
score_k = lambda * P_hat(success_k | query) - (1 - lambda) * normalized_cost_k
```

**Encoder-target decoupling** — the paper's key idea: the model producing the
predictive signal need not be the model being predicted. An open-weight encoder
predicts a closed model's correctness. This is what makes the method usable at all
against proprietary APIs.

Results, and the number you must not quote out of context:

| Pool | Oracle | Best single | Gain | Headroom captured | Cost savings | Mean AUC |
|---|---|---|---|---|---|---|
| Frontier (11 models) | 89.3% | 65.4% | +10.9pp | 45.6% | 74.3% | 0.856 |
| Small (20x 7–9B) | 92.0% | 71.2% | +4.2pp | 20.4% | 64.2% | 0.826 |
| Mixed (9 models) | 89.4% | 82.2% | **+1.2pp** | 17.3% | **29.3%** | 0.882 |

The 74.3% is savings *relative to the single most expensive model in the pool* on
MMLU-Pro / HLE / LiveCodeBench. The **mixed pool is the realistic configuration**
(one strong model plus cheaper alternatives) and it yields +1.2pp accuracy and
29.3% savings. Semantic-embedding baselines reached 0.804 AUC vs 0.856 for
activations — activations buy roughly 5 AUC points, not an order of magnitude.

Two stated limits that constrain any reimplementation:
- Output-token prediction is **deferred**; cost uses each model's *median training
  output length*. Even the paper's cost model is a proxy.
- Observed output sequence length is **deliberately excluded** from correctness
  features to avoid ground-truth leakage. Generation-time observables are treated
  as contaminated.

---

## 3. Provider reality — what you can and cannot observe

**Tier 1, true activations: unavailable from Anthropic and OpenAI. Permanently.**
No hidden states; no logprobs on reasoning models. The only route to the paper's
method against closed models is encoder-target decoupling with a locally hosted
open-weight encoder.

**Tier 2, prefill-phase billing telemetry: precise, free, returned on every call.**

| Provider | Fields | Notes |
|---|---|---|
| Anthropic | `usage.input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` | Cache writes 1.25x (5-min) / 2x (1-hr) base input; **cache reads 0.1x**. Total input = sum of all three. |
| OpenAI | `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens` | Reasoning tokens **billed as output**, traces not exposed (summaries only). |

The providers bill the prefill phase on structurally different terms: Anthropic's
lever is cache-read economics on a large reused prefix; OpenAI's is invisible
reasoning tokens at output rates. For any system that re-sends near-identical
system prompts, the 0.1x cache-read multiplier is usually the largest recoverable
cost line. **This is a cost asymmetry, not an accuracy signal.**

**Tier 3, wall-clock TTFT: do not use as a quality signal.**
- For reasoning models TTFT *is* the thinking phase, not prefill. Measured
  (Artificial Analysis): Claude Opus 5 65.1s TTFT / 54 tok/s / ~$3.85 per Mtok /
  intelligence 61; GPT-5.2 xhigh 130.5s / 72 tok/s / ~$1.87 / 42. Note the
  direction: at max effort the OpenAI model was slower *and* lower-scoring, so
  never hardcode a per-vendor latency assumption — re-measure per model version.
- For non-reasoning calls TTFT is dominated by prompt length, queueing and
  network, not task difficulty.
- No paper proposes observed TTFT as a *correctness* feature. The literature uses
  TTFT only as a cost term (typically `TTFT + predicted_len * TPOT` with
  pre-calibrated per-model constants).

**The one genuine black-box difficulty signal:** `reasoning_tokens` (OpenAI) or
thinking-token count (Anthropic extended thinking) is the model's own revealed
difficulty estimate. But it arrives *after* prefill, so it cannot route — only
explain cost after the fact, or trigger mid-flight escalation. Its relation to
correctness is non-monotonic (overthinking). Validate before trusting.

---

## 4. Evaluation methodology — the highest-value section

These protocols are what actually transfer. Each one caught a real error.

**4.1 Temporal holdout, never in-period cross-validation.**
Group-5-fold CV inside the training period reported **0.988** AUC. The honest
temporal holdout on the next batch reported **0.898**. A 9-point gap, entirely
distribution shift. If your traffic mix changes (new provider tier, new agent
cohort, new pricing), in-period CV will lie to you by roughly that much.

**4.2 Leakage taxonomy.** Exclude three distinct classes:
- *Post-hoc observables* of the event being predicted: duration, error message,
  response length. (Same reason the paper excludes output sequence length.)
- *Roll-up fields derived from the target*: a status column that is itself
  computed from the outcomes you are predicting. In Arbor,
  `agent_readiness.latest_probe_status` / `last_bid_status` / `failure_bucket` /
  `readiness_status` all fell here and all had to go.
- *Acausal history*: every history feature must be computed strictly from rows
  with `created_at <` the current event.

**4.3 AUC, not accuracy, on skewed base rates.** At a 6.26% positive rate,
predicting all-negative scores 94% accuracy. Report AUC for ranking, PR-AUC for
precision behaviour, Brier for calibration — and always alongside the base-rate
predictor's Brier.

**4.4 Hyperparameter selection must never touch test.** I caught myself doing
this: `C=3.0` looked best at 0.9482, but that was chosen *by reading test*.
Legitimate selection (validation slice / grouped CV on train only) gave 0.8978.
The 0.9482 was not a result, it was a leak.

**4.5 Prequential (online) evaluation for calibration.** Walk the test stream in
order; refit the calibrator only on already-observed outcomes; never look ahead.
This is both the honest protocol and a simulation of production.

**4.6 Family holdout when items share templated text.** 40 agents in the corpus
had byte-identical descriptor text. A random split lets the model memorise a
template family from train members and score its test siblings. Holding out whole
families dropped AUC only 0.9450 -> 0.9390, proving genuine generalisation. Had
it collapsed, the random-split number would have been meaningless.

**4.7 Beat the single best feature, or ship the feature.** This single discipline
killed a 38-feature model. Always compute: best single raw feature, the incumbent
production signal, and your model — on the same honest split.

**4.8 Report decision utility, not only AUC.** AUC is threshold-free and abstract.
Also report the metric the system actually acts on — for a router that invites k
candidates, top-k recall versus random:

| k | live-agent recall | random | lift |
|---|---|---|---|
| 3 | 41.6% | 0.86% | 48x |
| 6 | 62.9% | 1.72% | 37x |
| 10 | 71.2% | 2.87% | 25x |

---

## 5. Negative results — keep these, they save the most time

| Approach | Honest temporal AUC | Verdict |
|---|---|---|
| Unfitted mean of two smoothed measured rates | **0.9590** | shipped |
| Single feature: smoke pass rate, unfitted | 0.9344 | strong baseline |
| Single feature: probe pass rate, unfitted | 0.9026 | — |
| Encoder activations + measured rates (fitted) | 0.9458 | **rejected — worse than baseline** |
| 38-feature logistic regression | 0.8978 | **rejected** |
| 6-feature forward-selected (grouped CV) | 0.8817 | **rejected** |
| Encoder activations alone | 0.8495 | cold-start only |
| Incumbent 3-bucket availability enum | 0.8205 | the thing being replaced |

**Why every fitted model lost:** coefficients were fitted on a period where the
positive rate was 55% and applied to one where it was 1.2%. A learned weight
encodes the base rate it was trained under. An unfitted *ranking* on a measured
rate carries no coefficient and cannot go stale that way.

**Corollary worth internalising:** when you expect distribution shift, prefer
monotone functions of directly measured quantities over fitted combinations.
Reserve fitting for the calibration layer, which you refit continuously anyway.

---

## 6. The routing-signal audit — run this before adding any model

The technique: for every dimension in your scoring function, compute the
**weighted standard deviation across your real candidate pool**, plus the number
of distinct values and the modal share. A dimension with near-zero weighted sd
cannot change any decision, regardless of its nominal weight.

Arbor's "4D" router (weights 0.40 capability / 0.30 reputation / 0.15 price /
0.15 availability), measured over the 1,233-agent corpus and the 119-agent
reachable pool:

| Dimension | Weight | Distinct values | Weighted sd | Finding |
|---|---|---|---|---|
| capability | 0.40 | 87 in pool | 0.0195 | real, but **missing for 89.4% of the corpus** |
| reputation | 0.30 | **1** | **0.0000** | constant 0.600 for 99.27% of agents — cannot reorder anything |
| price | 0.15 | 6–7 | 0.0090 | 71–78% tied at the modal value |
| availability | 0.15 | 3 | 0.0367 | real signal, but **60% factually stale** |

Four things this surfaced that no code review would have:

1. **Reputation was inert.** Only 9 of 1,233 agents had settled history; the rest
   received an identical default composite
   (`0.3*0.5 + 0.3*0.5 + 0.2*1.0 + 0.2*0.5 = 0.600`). 30% of the scoring weight,
   zero variance. Also: the `safety` sub-dimension is a hardcoded 1.0 for *every*
   agent, so 20% of the reputation composite is constant even for the 9.
2. **Discovery was gated on an embedding row.** Candidate search ran through
   `vectorSearch("hive_agent_embeddings")`, which had 119 rows for a 1,122-agent
   corpus. 174 of 219 *ready* agents (79%) were structurally invisible to routing.
3. **Availability was stale, not wrong.** Of 45 A2A agents marked
   `readiness=ready`, a live probe found only **18 (40%)** actually alive. Equal
   cardinality between two sets is not set identity — I briefly mistook 45 marked
   for 45 alive; they were different 45s.
4. **The weights were inverted in practice.** Availability (0.15) out-discriminated
   capability (0.40) by ~1.9x, so ranking was effectively "is it up, then noise."

**Worked example of the failure mode.** Prompt: *"make me a video about a kid
jumping in joy after getting into stanford."* Top-ranked candidates: a human-state
agent, a **Korean news agent**, a spatial atlas, a pulse monitor, a short-term
rental search. Top capability similarity: **0.1649** — noise. Only 4 of 119
reachable agents matched video keywords at all, and just 1 of 20 corpus-wide
video agents was alive. The router cannot answer the question, and nothing in its
score reveals that.

**Portable lesson:** add a "can anything in the pool actually do this?" floor.
Absolute capability match below a threshold should produce *no recommendation*,
not a confidently-ranked irrelevant one.

---

## 7. Cheapest viable encoder

**Winner: `sentence-transformers/all-MiniLM-L6-v2`.** 22.7M params, 6 layers,
384-dim hidden, loads in ~0.8s.

| Property | Value |
|---|---|
| Cost | **$0** (local weights) |
| Latency | 66ms single text; **0.8ms/text batched (64)** |
| Per-layer hidden states | **Yes** — `transformers`, `output_hidden_states=True` |
| Cost per routing pass (1 query + 1000 agent texts) | $0 vs $0.000801 for `text-embedding-3-small` |

Practical notes:
- **Ollama cannot do this.** It returns only final-layer pooled vectors, and needs
  `--embeddings` to serve them at all (default server rejects the call). Per-layer
  activations, and therefore Fisher layer selection, require
  transformers/vLLM.
- Encoder *capacity* matters in the paper (Qwen3.5-122B 0.906 AUC vs
  Nemotron-Nano-30B 0.850 on the same target), but with few labels the PCA
  dimension is the binding constraint, which erases most of that advantage.
- **Precompute static text offline.** Agent/model descriptors are static: encode
  once, cache the reduced vector. Only the query is per-request.
- Fisher J selected **layer 2 of 6** here, below the paper's L/2..L guidance —
  worth checking empirically rather than assuming upper layers.
- Label choice dominates: Fisher J was 0.017 against one label definition and
  0.434 against another on identical activations. If J is near zero, suspect the
  label before the encoder.

---

## 8. What shipped (two-head architecture)

`P(useful) = P(responds) x P(quality | responds)`

**Head 1 — measured-rate (`lib/hive/probe-success-core.ts`).** Authoritative
whenever evidence exists. Unfitted mean of two additively-smoothed rates:

```
smoothedRate(passes, attempts) = (passes + prior * strength) / (attempts + strength)
```

with `strength = 5` toward the corpus prior. Smoothing is what stops 1/1 from
outranking 40/50. Ranking AUC 0.9590, prequential 0.9126, Brier 0.00795 vs
0.01152 base-rate.

**Head 2 — encoder cold-start (`lib/hive/encoder-head-core.ts`).** Used *only*
when a candidate has no history, where head 1 returns the flat prior for everyone
and ordering becomes arbitrary. Family-holdout AUC 0.9390. Ranking-only: its Brier
(0.01210) does **not** beat base-rate (0.01152), so it must not be presented as a
calibrated probability.

**Calibration: rolling Platt, window 6000, refit every 250 observations.** Fitted
by Newton-Raphson with a ridge term; returns `undefined` on a degenerate
(all-pass/all-fail) window so the caller keeps its previous parameters rather than
adopting an invented calibration. Shipped constants are an explicitly-labelled
cold-start bootstrap, not the evaluated calibrator.

**Cross-head ranking rule.** The two heads are not on a common scale. Rank
*within* head, then interleave by tier (measured > encoder > prior). Never compare
raw scores across heads — `rankWithHeads()` enforces this so callers cannot lose
the distinction.

---

## 9. Implementation recipe for another system

1. **Instrument cost first.** Capture `usage` on every call, including cache and
   reasoning fields. Without per-call token accounting every downstream saving
   number is fiction. This was Arbor's blocking gap: the LLM clients sent
   `max_tokens` and never read `usage`.
2. **Audit your existing scoring function** (section 6) before adding anything.
   Expect to find at least one inert dimension.
3. **Build the honest harness before the model**: temporal split, leakage
   exclusion list, base-rate Brier, incumbent-signal AUC, best-single-feature AUC.
4. **Ship the simplest monotone function of measured rates that clears your bar.**
   Additive smoothing toward the prior. No coefficients.
5. **Add rolling calibration**, refit on recent outcomes, degenerate-window guard.
6. **Add an encoder head for cold start only**, gated on an evidence threshold,
   validated by family holdout. Precompute static vectors offline.
7. **Adopt the paper's objective** `lambda * P_hat - (1-lambda) * cost_norm` once
   both terms are measured rather than assumed.
8. **Only then consider true activations**, and only if the ~5-point AUC gap over
   embeddings justifies GPU hosting. Measure on your own data first.

**When encoder-target decoupling will NOT work** — check the data shape before
building. The method needs a query x model matrix with independent variation on
both axes. Three failure shapes, all encountered here:
- Outcome determined by infrastructure, not semantics (endpoint down, missing
  key). Activations over query text cannot predict a 503.
- Query and candidate perfectly collinear (231 labels across 73 agents x 73
  prompts, 1:1). The encoder can only recover identity, which a lookup does better.
- Real crossing but too few queries (17 nodes x 12 agents, 14.7% fill). The paper
  used ~10,000 labelled pairs *per model*.

The fix is a data-collection change, not a modelling one: run a **shared diverse
task battery across many candidates** and grade it. That converts an existing
fan-out harness into a decoupling dataset generator.

---

## 10. Honesty guards worth copying

- **Gate display on sample size.** Below a threshold, render "baseline not yet
  established" rather than a number.
- **Never report cost savings without quality parity.** Cheaper at lower quality
  is not a saving. Report both deltas, as the paper does.
- **Label every figure measured vs estimated.**
- **Encode claims as test assertions.** Both shipped models have tests asserting
  metrics clear their stated bar, that Brier beats base-rate, that top-k recall
  beats random by >5x, and — importantly — an assertion that the encoder head
  does *not* claim to beat the measured head. A metric claim that isn't a test
  will drift.
- **Ban silent constants.** Hardcoded baselines (`BASELINE_GENERALIST_SECONDS =
  30 * 60`) and self-reported estimates (ranking on an agent's own quoted time)
  are the two most common sources of fake numbers. A test that greps for them is
  cheap.

---

## Reproduction

Offline training/eval scripts used for the numbers above were run from a scratch
directory against a Convex snapshot export (`npx convex export`), with
`numpy`/`scikit-learn`/`torch`/`transformers`. Shipped artifacts:

- `lib/hive/probe-success-core.ts` + `probe-success-model.json` (+ tests)
- `lib/hive/encoder-head-core.ts` + `encoder-head-model.json` (+ tests)

Both model JSONs embed their own `metrics`, `training.excluded_as_leakage` list,
and parity fixtures so the TS implementation is provably identical to the
validated offline model.

## Sources

- [arXiv:2603.20895 — LLM Router: Prefill is All You Need](https://arxiv.org/abs/2603.20895) ([v2 HTML](https://arxiv.org/html/2603.20895v2))
- [gingerlabs — Prefill Activation Routing](https://gingerlabs.ai/blog/prefill-activation-routing) (derivative writeup)
- [Anthropic prompt caching / usage fields](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [OpenAI reasoning models — usage and reasoning tokens](https://developers.openai.com/api/docs/guides/reasoning)
- [Artificial Analysis — Claude Opus 5 vs GPT-5.2](https://artificialanalysis.ai/models/comparisons/claude-opus-5-vs-gpt-5-2)
- [MixLLM: Dynamic Routing in Mixed LLMs](https://arxiv.org/pdf/2502.18482) (TTFT as cost term)
- [Breaking Model Lock-in: Zero-Shot LLM Routing via a Universal Latent Space](https://arxiv.org/pdf/2601.06220) (pre-calibrated TTFT/TPOT)
