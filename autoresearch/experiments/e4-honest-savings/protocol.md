# E4 — Blended frontier + honest savings, end to end (protocol)

H4: an honest per-run savings metric — counterfactual frontier cost on the
SAME tokens minus actual measured cost, settled runs only — can replace the
headroom number without fabricating value.

Parts and locked predictions:

P1 (frontier math, pooled data, no new runs): the class-conditional policy
   (25 classes -> backstop@mini; spatial -> terra; governance+incident ->
   declined) yields, on pooled E2+E3'+E3 rows:
   $/settled <= $0.0015 AND accept-on-attempted >= 0.78 AND coverage 26/28.
   Decline-with-refund is FINALIZED for governance+incident on pass
   (incident carries the E5 golden-review caveat).

P2 (metric behavior): counterfactualSavings() (new lib/honest-savings.ts,
   frontier = gpt-5.2 list) is positive on >= 95% of settled backstop@mini
   battery rows, with mean per-settled saving in [$0.001, $0.02].

P3 (organic wiring): after wrapping runner execution in collectUsage inside
   convex/auctions.ts execute and adding optional task fields
   (execution_cost_usd/input_tokens/output_tokens/models), driving
   internal.auctions.execute on a synthetic awarded task (winner
   arbor-baseline, Azure lane) writes execution_cost_usd > 0 onto the task
   row; ValueImpactPanel then (a) shows measured routing savings ONLY for
   tasks carrying measured cost, (b) relabels budget headroom as
   "budget unspent", never "saved", for all others.

Sanity: typecheck + full test suite + convex codegen green before P3 verify.
Out of scope: judge-call cost attribution to tasks (recorded but follow-up),
probe-gating, E5 golden review.
