/**
 * Golden-task audit lane: pure grading logic for auditing a marketplace
 * delivery against a curated reference answer.
 *
 * Why it exists: bids carry a Brier-scored confidence (lib/bid-calibration.ts),
 * so a strategic agent can protect its calibration and quality dimensions by
 * only bidding on tasks it is certain of. Golden tasks are ordinary-looking
 * tasks with a known expected outcome, posted through the normal auction
 * pipeline and graded against the stored reference at settle — keeping the
 * calibration and quality dimensions anchored to ground truth the agent
 * cannot self-select around.
 *
 * Convex wiring lives in convex/goldenTasks.ts (posting, seeds, frequency
 * caps) and convex/goldenTaskAudit.ts (the settle-time reference grader).
 */

/** Ceiling on any single golden task's max_budget (dollars) unless
 * ARBOR_GOLDEN_MAX_BUDGET raises/lowers it. Audits must stay cheap. */
export const GOLDEN_BUDGET_CAP_DEFAULT = 0.5;

/** Minimum hours between golden posts (global, across all golden tasks)
 * unless ARBOR_GOLDEN_MIN_INTERVAL_HOURS overrides. */
export const GOLDEN_MIN_INTERVAL_HOURS_DEFAULT = 24;

/** A posted golden run that never reaches settle (auction failed, execution
 * failed) is marked expired after this long so the run log stays honest. */
export const GOLDEN_RUN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function goldenBudgetCap(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
    return GOLDEN_BUDGET_CAP_DEFAULT;
  }
  return Math.max(0.05, Math.min(5, parsed));
}

export function goldenMinIntervalMs(raw: string | undefined): number {
  const parsed = Number(raw);
  const hours =
    !raw || !Number.isFinite(parsed) || parsed < 0
      ? GOLDEN_MIN_INTERVAL_HOURS_DEFAULT
      : Math.min(24 * 30, parsed);
  return hours * 60 * 60 * 1000;
}

/** Case- and thousands-separator-insensitive containment, so "$2,340.50" in a
 * delivery satisfies a "2340.50" criterion and vice versa. */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/,/g, "");
}

/** Returns the required substrings NOT found in the delivery (empty = all
 * present). Deterministic leg of the audit — no model involved. */
export function checkRequiredSubstrings(
  deliveryText: string,
  required: string[],
): string[] {
  const haystack = normalizeForMatch(deliveryText);
  return required.filter(
    (needle) => !haystack.includes(normalizeForMatch(needle)),
  );
}

export interface GoldenGraderVerdict {
  passed?: boolean;
  quality_score?: number;
  reasoning?: string;
}

export interface GoldenAuditOutcome {
  passed: boolean;
  /** 0..1 quality against the reference, feeds reputation_dimensions. */
  quality: number;
  reasoning: string;
  substring_misses: string[];
  /** False when the model grader was unreachable and the deterministic
   * substring checks decided the verdict alone. */
  grader_used: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Combine the deterministic substring checks with the model grader's verdict.
 * Missing required substrings always fail the audit and cap quality at 0.3 —
 * the reference facts are ground truth, not a matter of grader opinion. When
 * the grader is unreachable, substring criteria (if any) decide alone; with
 * no deterministic criteria either, returns null and the caller records an
 * audit error instead of guessing (never punish or reward on a grader outage).
 */
export function combineAuditVerdict(input: {
  substring_misses: string[];
  had_required_substrings: boolean;
  grader: GoldenGraderVerdict | null;
}): GoldenAuditOutcome | null {
  const { substring_misses, had_required_substrings, grader } = input;
  const substringsOk = substring_misses.length === 0;

  const graderUsable = grader !== null && typeof grader.passed === "boolean";
  if (!graderUsable) {
    if (!had_required_substrings) return null;
    return {
      passed: substringsOk,
      quality: substringsOk ? 0.7 : 0.1,
      reasoning: substringsOk
        ? "Reference grader unavailable; all required reference facts present in the delivery."
        : `Reference grader unavailable; delivery is missing required reference facts: ${substring_misses.join(", ")}.`,
      substring_misses,
      grader_used: false,
    };
  }

  const graderPassed = grader.passed === true;
  const passed = substringsOk && graderPassed;
  let quality = clamp01(
    typeof grader.quality_score === "number"
      ? grader.quality_score
      : graderPassed
        ? 0.7
        : 0.1,
  );
  if (!substringsOk) quality = Math.min(quality, 0.3);
  const reasoning = [
    grader.reasoning?.trim() || (graderPassed ? "Delivery matches the reference." : "Delivery does not match the reference."),
    substringsOk
      ? undefined
      : `Missing required reference facts: ${substring_misses.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { passed, quality, reasoning, substring_misses, grader_used: true };
}

export const GOLDEN_AUDIT_SYSTEM_PROMPT = `You are a reference-based auditor for an agent marketplace. Unlike the general judge, you are given the KNOWN correct answer (or checkable success criteria) for this task. Compare the agent's delivery strictly against that reference. Output JSON only:
{ "passed": true|false, "quality_score": <0.0-1.0>, "reasoning": "<one paragraph>" }

Rules:
- passed = true only if the delivery satisfies the reference answer / success criteria on the substance (exact wording does not matter; facts, numbers, and required fields do).
- Ground every claim in text literally present in the delivery; do not invent content.
- A confident, fluent delivery that gets the reference facts wrong must fail with a low quality_score.`;

export function goldenAuditUserPrompt(input: {
  taskPrompt: string;
  referenceAnswer: string;
  successCriteria: string;
  deliveryText: string;
}): string {
  return [
    `Task given to the agent:\n${input.taskPrompt.slice(0, 2000)}`,
    `Reference answer (known correct):\n${input.referenceAnswer.slice(0, 2000)}`,
    `Success criteria:\n${input.successCriteria.slice(0, 2000)}`,
    `Agent's delivery:\n${input.deliveryText.slice(0, 6000)}`,
  ].join("\n\n---\n\n");
}
