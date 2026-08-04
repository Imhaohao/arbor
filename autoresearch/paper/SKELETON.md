# Paper skeleton — "Audit the Auditor: Instrument Error Dominates Apparent
# Market Failure in a Deployed Agent Marketplace"

Target: 4-page workshop paper (NeurIPS/ICLR workshop). Sibling to (not a
replacement for) research/settlement-audit-protocol.md — this is the
routing-loop evidence; that protocol is the confirmatory follow-up study.

## Abstract (draft)
In a deployed agent marketplace with reference-graded audit tasks, we made
cost-per-settled-task measurable, then optimized it. Selection (route to the
dominant agent) and tiering (escalate only where capability pays) produced a
$0.001/settled frontier at 88.8% judge-accept across 28 task classes. The
surprise was the residual: of three task classes our pre-registered pipeline
declared unservable, two were manufactured by our own instruments — an
over-narrow reference that failed valid work, and a grading pipe that
truncated deliveries before the grader saw them — and one was a genuine,
purchasable capability gap. A cheap, pre-registered rubric (read failures
against written criteria, blind to the reference's specific answer)
discriminated all three endpoints correctly. We argue apparent market
failure in agent marketplaces decomposes into capability gaps, reference
error, and pipeline error; the latter two dominated here and are invisible
to simulation testbeds, whose instruments are correct by construction.

## Sections -> evidence map
1. Setting: ST-SR-IA marketplace (Gerkey-Mataric framing), Vickrey settle,
   reference-graded battery. [E1-E2 setup; 2006 "few robots" gap quote]
2. Making the metric measurable: cost telemetry, mispricing bug, honest
   savings vs headroom (wrong in both directions case). [E0-E1, E4; Table:
   headroom $3.73 vs measured $0.0017]
3. Routing gains: dominance (Table: E3' 4-prediction panel), tiering
   (E3 A/B), final policy (E5c: 28/28, zero declines, $0.001248 @ 88.8%).
4. THE RESULT — instrument error: E5/E5b/E5c scoreboard (Table: class x
   {before, after, defect}), the two defect classes, the rubric, the
   violated-expectation clause working as designed.
5. Implications: audits need reference-error + pipeline-error reporting
   (bridge to settlement-audit protocol as registered follow-up);
   limitations: n=1 deployment, same-family grader, 28 curated classes,
   reworded-reference comparability footnotes.

## Claims requiring pre-submission re-verification
- Novelty check #2 from the protocol (LLM-judge audited inside a live
  market) — rerun forward-citation sweep at writing time.
- All dollar figures against list-price sources (pricing drift).

## Decision: CONCLUDE recommended for this project (outer loop 3).
Rationale: story test passes; every queued efficiency experiment now has
either no live target (decline mechanics) or requires roster growth
(probe-gating H3-original) — i.e., the next unit of work is a different
project. DEEPEN alternative recorded: grow live roster past 2 agents to
unlock auction-layer experiments; that is Arbor product work as much as
research, and the user should choose its priority.
