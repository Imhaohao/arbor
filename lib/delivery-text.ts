// Arbor stamps its own provenance banner on some deliverables (today the hive
// backstop's "no external tools" honesty label). The banner is Arbor's, not the
// agent's answer, so evaluators must not read it as delivered content.
//
// Why this matters beyond tidiness: the banner is a separate leading paragraph,
// and graders count it. Measured on dev deployment 2026-08-05, golden run
// golden-policy-summary was rejected by the settlement judge for being "four
// sentences rather than the requested maximum of three" — the fourth sentence
// was the banner. The reference grader, scoring the same delivery against the
// known answer, passed it at quality 1.0 with zero substring misses.
//
// Left unstripped this penalizes the floor agent on every format-constrained
// task (that run took reputation delta -0.1), and in the settlement-audit study
// it would manufacture false judge-error observations on the 6 of 28 golden
// tasks that carry length or format limits.
//
// The banner stays in the stored deliverable — users must still see the honesty
// label. Only evaluator input is stripped.

/** Leading provenance banners Arbor prepends to its own deliverables. */
const PROVENANCE_BANNER_PATTERNS: RegExp[] = [
  // Hive backstop: "[Arbor hive backstop] Arbor-owned model floor — ...\n\n"
  /^\[Arbor hive backstop\][^\n]*\n\n/,
];

/**
 * Strip Arbor-authored provenance banners from a delivery string so evaluators
 * score the agent's answer rather than Arbor's own stamp.
 *
 * Only removes a banner at the very start of the text, and only one, so agent
 * content that happens to mention a label is untouched.
 */
export function stripProvenanceBanner(text: string): string {
  for (const pattern of PROVENANCE_BANNER_PATTERNS) {
    if (pattern.test(text)) {
      return text.replace(pattern, "").trimStart();
    }
  }
  return text;
}

/**
 * Normalize an arbitrary task result into the text an evaluator should read.
 * Mirrors the previous inline formatting in the judge and golden-audit paths,
 * with banner stripping applied to whichever string carries the delivery.
 */
export function deliveryTextForEvaluation(result: unknown): string {
  if (typeof result === "string") return stripProvenanceBanner(result);
  if (result && typeof result === "object") {
    const text = (result as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return stripProvenanceBanner(text);
    }
    const output = (result as { output?: unknown }).output;
    if (typeof output === "string" && output.trim().length > 0) {
      return stripProvenanceBanner(output);
    }
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result);
}
