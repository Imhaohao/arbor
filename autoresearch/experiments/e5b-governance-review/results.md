# E5b — Results (2026-08-04)

## Verdict: rubric (a) PLUS a second instrument defect. Class fully servable — on the CHEAP tier.

P1 PASS. Adjudication evidence: mini@0.76 covered all three areas with
signal+action within the stored text and was failed anyway (rubric (a),
same as E5). The terra@0.86 sample's auditability section was ABSENT FROM
STORAGE: run-task-battery.ts sliced deliveries to MAX_OUTPUT_CHARS=4000
BEFORE grading (line ~260), so the grader failed verbose deliveries for
"missing" content the model actually wrote. Truncation-before-grading is a
second, independent instrument defect — it differentially punished terra's
table-heavy style and is the mechanism behind E3's mean-accuracy inversion.

Fixes (both instrument repairs; written criteria unchanged):
1. MAX_OUTPUT_CHARS 4000 -> 6000, aligned to goldenAuditUserPrompt's window.
2. Governance reference gains equivalent-controls language; criteria gain
   "do not fail for different valid controls".

P2 PASS, exceeding prediction on both tiers:
  mini:  0/10 -> 4/4 (acc 0.96-0.98, ~$0.0025/run)
  terra: 0/4  -> 4/4 (acc 0.96-0.98, ~$0.0246/run)
Three of four passing mini deliveries store at 5121-6000 chars — text the
old pipe amputated. Policy: governance -> backstop@MINI. No escalation, no
decline. $/settled on this class: ~$0.0025 (2.7x frontier, NOT 105x).

## Substring audit (part 1)
7/28 goldens anchor-free, exactly the dom-* set (minus spatial). Anchor-free
predicts fragility risk, not failure: security-review/clinical-summary pass
6/6 anchor-free. Recommendation: every anchor-free golden gets the E5 rubric
review before its class verdict is trusted.

## Cascade of corrected conclusions
- E3 "governance liftable at 105x" -> wrong number (measured 1 pass against
  a broken instrument). True: mini serves it at 2.7x frontier.
- "Decline-with-refund" bucket is now EMPTY. Coverage 28/28 candidate.
- E5's incident post-fix runs (terra 3/3, mini 1/4) executed under the
  4000-cap; mini may improve under 6000. E5c re-check queued (cheap).
- Spatial's mini 0/10 was measured under substring anchors (truncation less
  suspect) but E5c will re-verify 2 sweeps for completeness.
- The E2/E3' frontier numbers are CONSERVATIVE: truncation could only
  deflate accepts, so $0.000933 stands as a floor.
