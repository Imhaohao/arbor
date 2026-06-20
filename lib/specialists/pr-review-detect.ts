// Shared helpers for the PR-code-review task class (Agent Task 23).
//
// This module is the single source of truth for "is this node a PR code-review
// task?" so the arbor-baseline fallback and the live github-pr-review specialist
// agree on what they bid on, and so the orchestrator backstop and the eval
// harness classify the same way. Pure string logic — no I/O, no model calls —
// so it is cheap to call inside every bid() and trivially unit-testable.

/** A GitHub pull request reference parsed out of free text. */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  /** Canonical https URL to the PR (without any /files or #discussion suffix). */
  url: string;
}

const PR_URL_RE =
  /https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/i;

// Phrases that, on their own, unambiguously mark a pull-request code-review task.
const STRONG_PHRASES = [
  "pull request review",
  "pull-request review",
  "pr review",
  "pr code review",
  "code review",
  "review this pr",
  "review this pull request",
  "review the pr",
  "review the pull request",
  "review the diff",
  "review this diff",
  "review the following diff",
  "review the following changes",
  "review the changes in",
  "review the code changes",
  "review these code changes",
  "automated pr review",
  "automated code review",
];

// Weaker signals that only count as PR-review when a review verb is also present.
const REVIEW_VERB_RE =
  /\b(review|reviews|reviewing|audit|critique|assess|evaluate|inspect)\b/i;
const PR_CONTEXT_RE =
  /\b(pull request|pull-request|pr #?\d+|diff|changed files|code change|code changes|merge request)\b/i;

/** True when `text` contains a unified-diff body (fenced or raw). */
export function hasDiffBlock(text: string): boolean {
  if (/```+\s*diff/i.test(text)) return true;
  // A raw unified diff: a `diff --git` header, or the +++/--- file-marker pair.
  if (/^diff --git /m.test(text)) return true;
  if (/^---\s.+\n^\+\+\+\s.+/m.test(text)) return true;
  return false;
}

/**
 * Classify a task as PR code review. Combines task_type and prompt so a caller
 * can pass either or both. Conservative: a bare "review" without code/PR context
 * does NOT match (so research/marketing "review" tasks are never captured).
 */
export function isPrReviewTask(prompt: string, taskType?: string): boolean {
  const text = `${taskType ?? ""}\n${prompt ?? ""}`.toLowerCase();

  if (taskType && /pr[-_ ]?review|code[-_ ]?review/.test(taskType.toLowerCase())) {
    return true;
  }
  if (STRONG_PHRASES.some((p) => text.includes(p))) return true;
  if (hasDiffBlock(prompt ?? "")) return true;
  if (PR_URL_RE.test(prompt ?? "") && REVIEW_VERB_RE.test(text)) return true;
  if (REVIEW_VERB_RE.test(text) && PR_CONTEXT_RE.test(text)) return true;
  return false;
}

/** Extract the first GitHub PR reference from free text, or null. */
export function extractPullRequestRef(text: string): PullRequestRef | null {
  const m = PR_URL_RE.exec(text ?? "");
  if (!m) return null;
  const [, owner, repo, num] = m;
  const number = Number(num);
  if (!Number.isInteger(number) || number <= 0) return null;
  return {
    owner,
    repo: repo.replace(/\.git$/i, ""),
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

/**
 * Extract an inline unified diff from the prompt, or null. Prefers a fenced
 * ```diff block; falls back to the region from the first `diff --git` to the end.
 */
export function extractInlineDiff(text: string): string | null {
  if (!text) return null;
  const fenced = /```+\s*diff\s*\n([\s\S]*?)```/i.exec(text);
  if (fenced && fenced[1].trim()) return fenced[1].trim();
  const rawStart = text.search(/^diff --git /m);
  if (rawStart !== -1) {
    const body = text.slice(rawStart).trim();
    if (body.length > 0) return body;
  }
  return null;
}

/** Parse the "Budget ceiling: $X" line the auctioneer injects into bid prompts. */
export function parseBudgetCeiling(text: string): number | null {
  const m = /budget ceiling:\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(text ?? "");
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Last-resort bid price for arbor-baseline: sit just under the budget ceiling so
 * its Vickrey score (reputation / price) stays the lowest of any live bidder,
 * yet it always remains a valid bid (price <= budget). Falls back to the
 * specialist's cost baseline when no ceiling is advertised.
 */
export function lastResortBidPrice(
  promptOrBudget: string | number | null,
  costBaseline: number,
): number {
  const budget =
    typeof promptOrBudget === "number"
      ? promptOrBudget
      : parseBudgetCeiling(promptOrBudget ?? "");
  if (budget && budget > 0) {
    // 0.92 of ceiling, but never below the cost baseline and never above budget.
    const price = Math.max(costBaseline, Number((budget * 0.92).toFixed(2)));
    return Math.min(price, Number(budget.toFixed(2)));
  }
  return Number(costBaseline.toFixed(2));
}
