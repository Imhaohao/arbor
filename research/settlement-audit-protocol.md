# Settlement Audit Protocol (pre-registration)

Measurement protocol for: **How much of the variance in agent payment is caused
by judge error rather than agent quality — and does that error break the
incentive-compatibility of confidence elicitation?**

Status: DRAFT — becomes pre-registered at the commit that freezes Sections 3-6.
Record that commit hash here before the first counted golden run: `________`

Baseline state at drafting (dev deployment `valuable-axolotl-318`, 2026-08-04):
312 tasks (93 complete / 77 disputed / 81 failed), 1,810 bids, 28 seeded golden
tasks, **0 golden runs ever executed**, **0 bids carrying `confidence`**. The
audit lane (`convex/goldenTasks.ts`, `convex/goldenTaskAudit.ts`) is built and
cron-wired but has never fired (`ARBOR_GOLDEN_AUDIT_ENABLED` unset).

---

## 1. Questions and estimands

- **Q1 (primary).** On settled deliveries for golden tasks, estimate the
  judge's error against the stored reference:
  - FAR = P(judge accepts | reference audit fails)
  - FRR = P(judge rejects | reference audit passes)
  - Cohen's kappa between judge verdict and reference verdict. Kappa is
    pre-registered as the headline agreement number, not raw agreement
    (arXiv 2606.19544 measures 33-41pp inflation of raw agreement vs. kappa).
- **Q2.** Is judge error random or structured? Logistic regression of
  `judge_error` on pre-registered covariates: task class, log(price_paid),
  winning bid rank, delivery length (log chars), agent model family.
  Max 5 covariates — at an expected ~75 errors (500 x 0.15) the
  events-per-parameter floor of ~15 allows no more.
- **Q3a (analysis-only, no new data).** Under the shipped mechanism
  (`lib/bid-calibration.ts`: rank = reputation x blended P(accept) / price;
  slash = 0.1 x (0.5 + c); Brier calibration dimension; ramp = 5), compute the
  expected-utility-maximizing confidence report c* as a function of true accept
  probability p and measured judge noise (FAR, FRR from Q1). Report the
  incentive gap c* - p over a grid of p, market states, and ramp positions.
  Truthfulness holds iff c* = p everywhere; the docstring's dominant-strategy
  claim is the hypothesis under test.
- **Q3b (gated).** Empirical calibration of real self-reports. BLOCKED until
  the bidding path actually solicits and stores `confidence` (0/1,810 today).
  If not unblocked by the Phase 1 midpoint, Q3b is dropped and the paper ships
  with Q1 + Q2 + Q3a. Do not let this gate the rest.

Estimand scope, stated in the paper: judge error **on objectively checkable
tasks, measured on auction winners** — the deployed settlement distribution.
Golden tasks are more checkable than organic tasks, so Q1 plausibly
underestimates organic-task judge error; the estimate is a floor, and the
paper says so.

## 2. Why the reference is trustworthy (ground-truth argument)

Three legs, in trust order:

1. **Deterministic substrings** (`checkRequiredSubstrings`) — model-free.
   Every counted golden task MUST carry decisive `required_substrings`.
2. **Reference grader** (`GOLDEN_AUDIT_SYSTEM_PROMPT`) — sees the known
   answer. MUST run on a different model family than the settlement judge
   (correlated-failure control). Record both model ids per run.
3. **Human adjudication** — every judge-vs-reference disagreement is
   hand-labeled by the author, blind to which system produced which verdict
   (expected ~75 cases at N=500; budget 2 min each ≈ 2.5 hours). The human
   label is final for error classification. Cases where the human overrules
   the *reference* are reported separately as reference-error rate — this
   number keeps the study honest and is publishable either way.

## 3. Sampling design

- **Frame.** Golden tasks posted unmarked through the normal auction
  (`GOLDEN_BUYER_ID = "buyer:default"`, internal-only linkage — bidders and
  the settlement judge cannot see golden status by construction; verify by
  code inspection and record in the paper).
- **Templating (required pre-launch work).** The 28 seeded tasks have fixed
  constants; repeat exposure lets agents memorize answers. Each golden_id
  becomes a parameterized template (fresh numbers/names per post, reference
  and substrings computed from the drawn parameters). No agent sees the same
  parameterization twice.
- **Stratification.** Post in equal proportion across the golden task types,
  mapped to `TASK_CLASSES` (lib/bid-calibration.ts). Randomize posting time
  of day. Interleave with whatever organic flow exists.
- **Detectability check (pre-launch gate).** Before counting any run, an LLM
  classifier given 20 golden + 20 organic prompts must not exceed 65%
  discrimination accuracy (chance = 50%). If it does, rewrite prompts until
  it doesn't, and report the final discrimination score in the paper.
- **Unit of analysis.** One settled golden run = one observation. Runs that
  expire unsettled (`GOLDEN_RUN_EXPIRY_MS`) are logged and reported as
  attrition, not silently dropped.

## 4. Sample size (fixed before unblinding)

- **Primary N = 500 settled golden runs.**
  - Q1 precision: at judge error 15%, 95% CI half-width ±3.1pp (n=544 gives
    ±3.0pp; 500 accepted as ±3.1pp).
  - Q2 power: 80% power, alpha=.05 two-sided, to detect a 10pp error-rate
    difference (10% vs 20%) between two balanced strata (~200/group).
- **Minimum viable N = 200** (if throughput or spend forces it): ±5pp
  precision at p=15%; detects only 15pp strata differences. The paper then
  reports Q2 as exploratory.
- **Interim look at n=100: operational only.** Check run-completion rate,
  cost per run, disagreement volume. No hypothesis tests, no early stop for
  significance, no protocol edits after this point except throughput knobs.

## 5. Operational plan

Throughput: default `ARBOR_GOLDEN_MIN_INTERVAL_HOURS` = 24 → 500 runs would
take 16 months. Set to 1-2h (12-24 runs/day) → **N=500 in 3-6 weeks.**

| Phase | Work | Gate to next |
|---|---|---|
| 0. Unblock | Fund provider accounts (both at $0 per 2026-06 audit). Set `ARBOR_GOLDEN_AUDIT_ENABLED=true`, interval 1-2h. Point reference grader at a different model family than the judge. | one manual `goldenTasks:postNow` settles end-to-end and writes a `golden_task_runs` row |
| 1. Pre-launch | Template-ize goldens; pass detectability gate; freeze this file (commit hash above); dry run n=10 (not counted) | dry-run completion rate ≥ 70% |
| 2. Collect | 500 counted runs; operational interim at n=100 | N reached or 6 weeks elapsed |
| 3. Analyze | Tables T1-T3; human adjudication of disagreements; Q3a computation | — |

Spend ceiling: winner payouts ≤ $0.30-0.50/task cap → ≤ $250 at N=500
(second-price, so realized cost lower) + judge/grader calls (~2 small-model
calls per run). Hard stop at $400 total; log actual spend per run.

Q3b unblock (parallel, optional): wire confidence solicitation into
`solicitBids` so bids store `confidence`; from then on every settled bid
accrues calibration data at zero marginal cost.

## 6. Analysis plan and deliverable tables

- **T1.** 2x2 confusion matrix (judge accept/reject x reference pass/fail),
  FAR, FRR, kappa, Wilson 95% CIs. Plus reference-error rate from human
  adjudication.
- **T2.** Q2 logistic regression: odds ratio per covariate with 95% CI;
  pre-registered covariates only; no stepwise selection.
- **T3.** Q3a incentive map: heatmap of c* - p over (p, calibration-history
  length); the region where overstatement pays, under measured (FAR, FRR)
  and under a hypothetical perfect judge (FAR=FRR=0) — the delta between
  those two panels is the paper's headline: what judge noise does to the
  honesty of the mechanism.
- Payment-variance decomposition (headline number): share of settled-payment
  variance attributable to judge error vs. delivery quality, via the
  adjudicated labels.

Robustness (pre-registered): repeat T1 excluding grader-outage runs
(`grader_used=false`); repeat excluding any golden_id with a >30% expiry
rate; repeat T2 with agent fixed effects if any agent wins >50 runs.

## 7. Threats to validity (stated in the paper)

- Golden tasks easier than organic → Q1 is a floor estimate. Scope claim.
- Judge and grader are both LLMs → different families + deterministic
  substrings + human adjudication of all disagreements.
- Agents detecting/memorizing goldens → templating + detectability gate +
  per-agent exposure cap.
- Winner-only observation → estimand is explicitly "on settled deliveries."
- Thin organic market → golden posts may dominate flow during collection;
  report the golden:organic ratio in the paper.
- Single deployment, single time window, n=1 system → external validity
  paragraph; frame as measurement + mechanism analysis, not a universal law.

## 8. Novelty checks (must complete before writing the intro)

1. Peer prediction / scoring rules used as the *payment-determining* rule in
   a deployed agent market: forward-cite GEM (arXiv 2411.07127), Kong &
   Schoenebeck lineage, Lu et al. 2024. (Lit review verdict 2026-08-04:
   ported to scoring LLM text, no deployed-payment use found — reconfirm.)
2. LLM-judge audited against ground truth inside a live market: forward-cite
   arXiv 2606.19544 and MAST (2503.13657).

If (2) is taken, the paper narrows to Q3: mechanism honesty under measured
judge noise. That half is not taken by any known work.

## Novelty checks — resolved 2026-08-04 (session web sweep)

1. Peer prediction as payment-determining rule in a deployed market: OPEN.
   Closest: arXiv 2607.04382 (settlement factorization THEORY for agent
   marketplaces, incl. payment-label contamination) and arXiv 2601.20299
   (ICLR 2026, Berkeley CHAI: peer prediction beats LLM-judge for honesty,
   OFFLINE). Neither measures a deployed payment path. Cite both; keep the
   claim narrowed to "measured in deployment with payment attached".
2. LLM judge audited against ground truth inside a live market: OPEN.
   Offline audits exist (approve-wrong-answer rates 7% with reference /
   32% without; judge-vs-gold accuracies 80-84%); the JUDGe 2026 workshop
   ("Can We Trust the Judge?") tracks judge failure cascades and has no
   deployed-market measurement. VENUE CANDIDATE for both papers.
