// Specialist: github-pr-review (Agent Task 23).
//
// The genuinely live, tool-backed PR-review path. It fetches the REAL diff of a
// GitHub pull request via the GitHub REST API (a real external tool call, not a
// model guess), then reviews that diff with the model. Because it makes a real
// external call it produces a real receipt (external_session_id from GitHub's
// x-github-request-id, an observed event, and the diff as a captured artifact)
// and an honest live provenance (live_tools_called: true, pr_url set).
//
// Honest scoping: it bids ONLY when the task carries a GitHub pull-request URL
// it can actually fetch. If the task only has an inline diff (no URL, no real
// tool to call) it DECLINES, so a diff-only task falls to arbor-baseline rather
// than github-pr-review masquerading as "live" on work that used no live tool.
//
// Public PRs are readable without a token (rate-limited); GITHUB_TOKEN /
// GITHUB_PAT raises limits and unlocks private repos. Registered in SPECIALISTS
// (registry.ts) with a higher reputation + lower price than arbor-baseline, so
// it outscores the fallback whenever it qualifies.

import { callOpenAI } from "../openai";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  SpecialistExecuteResult,
  SpecialistProvenance,
  ProbeResult,
} from "../types";
import { buildTaskContext } from "../campaign-context";
import {
  isPrReviewTask,
  extractPullRequestRef,
  type PullRequestRef,
} from "./pr-review-detect";

const GITHUB_API = "https://api.github.com";
const MAX_DIFF_CHARS = 60_000;

function githubToken(): string | undefined {
  const t = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  return t && t.trim() ? t.trim() : undefined;
}

function githubHeaders(accept: string): Record<string, string> {
  const token = githubToken();
  return {
    Accept: accept,
    "User-Agent": "arbor-github-pr-review",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface FetchedDiff {
  diff: string;
  requestId?: string;
  truncated: boolean;
}

async function fetchPrDiff(
  ref: PullRequestRef,
  timeoutMs: number,
): Promise<FetchedDiff> {
  const url = `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
  const res = await fetchWithTimeout(
    url,
    { headers: githubHeaders("application/vnd.github.diff") },
    timeoutMs,
  );
  const requestId = res.headers.get("x-github-request-id") ?? undefined;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub API ${res.status} for ${ref.owner}/${ref.repo}#${ref.number}: ${body.slice(0, 200)}`,
    );
  }
  const full = await res.text();
  const truncated = full.length > MAX_DIFF_CHARS;
  return {
    diff: truncated ? full.slice(0, MAX_DIFF_CHARS) : full,
    requestId,
    truncated,
  };
}

export const GITHUB_PR_REVIEW_CONFIG: SpecialistConfig = {
  agent_id: "github-pr-review",
  tier: "real",
  display_name: "github-pr-review",
  sponsor: "GitHub",
  capabilities: [
    "pull-request-review",
    "code-review",
    "diff-analysis",
    "bug-detection",
    "github-api",
  ],
  cost_baseline: 0.6,
  // High relative to arbor-baseline (0.05) so reputation/price keeps it on top
  // whenever it qualifies; it only steps aside when it cannot fetch a real PR.
  starting_reputation: 0.75,
  one_liner:
    "Live PR code review — fetches the real diff of a GitHub pull request via the GitHub API and reviews it for correctness, security, and regressions.",
  system_prompt:
    "You are github-pr-review. You fetch the real diff of a GitHub pull request through the GitHub REST API and review it. You ground every finding in the actual changed files and lines.",
  homepage_url: "https://docs.github.com/rest",
};

const REVIEW_SYSTEM_PROMPT = `You are github-pr-review, a senior code reviewer. You are given the REAL unified diff of a GitHub pull request, fetched live from the GitHub API. Review it.

Produce a structured markdown review:
1. **Summary** — what the PR changes, naming the actual files in the diff.
2. **Blocking issues** — correctness bugs, security holes, regressions. For each, cite the exact file and line/hunk from the diff and explain the concrete failure mode. Explicitly flag logic errors, off-by-ones, wrong operators, swapped/missing arguments, missing awaits, unhandled errors, and injection risks.
3. **Non-blocking nits** — style, naming, tests, docs.
4. **Verdict** — exactly one of: "Approve", "Approve with nits", or "Request changes", with a one-line justification.

Reference only what is literally present in the diff. Be specific and actionable.`;

export const githubPrReview: SpecialistRunner = {
  config: GITHUB_PR_REVIEW_CONFIG,

  async probe(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(
        `${GITHUB_API}/rate_limit`,
        { headers: githubHeaders("application/vnd.github+json") },
        8_000,
      );
      const duration_ms = Date.now() - start;
      if (res.ok) {
        return {
          status: "pass",
          duration_ms,
          response_excerpt: githubToken()
            ? "github api reachable (authenticated)"
            : "github api reachable (unauthenticated — public PRs only)",
        };
      }
      return {
        status: "fail",
        duration_ms,
        error_message: `github rate_limit returned ${res.status}`,
      };
    } catch (err) {
      return {
        status: "fail",
        duration_ms: Date.now() - start,
        error_message: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async bid(prompt, taskType): Promise<SpecialistDecision> {
    if (!isPrReviewTask(prompt, taskType)) {
      return {
        decline: true,
        reason: "github-pr-review only bids on PR code-review tasks",
      };
    }
    const pr = extractPullRequestRef(prompt);
    if (!pr) {
      return {
        decline: true,
        reason:
          "github-pr-review needs a GitHub pull-request URL to fetch the real diff; declining so a diff-only task routes to a model reviewer instead of a fake-live bid",
      };
    }

    const capability_claim =
      `1. Fetch the real diff of ${pr.owner}/${pr.repo}#${pr.number} via the GitHub REST API. ` +
      `2. Review every changed file and hunk for correctness bugs, security issues, and regressions, citing file:line. ` +
      `3. Return a structured review with blocking issues, nits, and an Approve/Request-changes verdict grounded in the live diff.`;

    return {
      bid_price: GITHUB_PR_REVIEW_CONFIG.cost_baseline,
      capability_claim,
      estimated_seconds: 40,
      plan_source: "llm",
    };
  },

  async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
    const pr = extractPullRequestRef(prompt);
    if (!pr) {
      // Should never happen (bid declines without a URL), but fail loudly so
      // the auctioneer fails over to arbor-baseline rather than faking a result.
      throw new Error(
        "github-pr-review execute called without a GitHub pull-request URL",
      );
    }

    const recorder = context?.toolRecorder;
    const fetchDiff = () => fetchPrDiff(pr, 20_000);

    const fetched: FetchedDiff = recorder
      ? await recorder.record(
          {
            agent_id: context?.agent_id ?? GITHUB_PR_REVIEW_CONFIG.agent_id,
            phase: "execute",
            transport: "api",
            provider: "github",
            endpoint: GITHUB_API,
            method: "GET",
            tool_name: "pulls.get.diff",
            arguments: {
              owner: pr.owner,
              repo: pr.repo,
              number: pr.number,
            },
          },
          fetchDiff,
          (r) => ({
            ok: r.diff.trim().length > 0,
            result_preview: r.diff.slice(0, 300),
            external_session_id: r.requestId ?? `github:${pr.owner}/${pr.repo}#${pr.number}`,
            pr_url: pr.url,
            pr_number: pr.number,
          }),
        )
      : await fetchDiff();

    const userPrompt =
      `${buildTaskContext(prompt, taskType)}\n\n---\n` +
      `Pull request: ${pr.url}\n` +
      `Live diff fetched from the GitHub API${fetched.truncated ? " (truncated to the first 60k chars)" : ""}:\n\n` +
      "```diff\n" +
      fetched.diff +
      "\n```";

    const review = await callOpenAI({
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1800,
      timeoutMs: 90_000,
      retries: 1,
      purpose: "agent",
    });

    const sessionId =
      fetched.requestId ?? `github:${pr.owner}/${pr.repo}#${pr.number}`;
    const output =
      `Live GitHub PR review of ${pr.url} — diff fetched via the GitHub REST API` +
      `${fetched.truncated ? " (diff truncated to 60k chars for review)" : ""}.\n\n` +
      review.trim();

    const provenance: SpecialistProvenance = {
      tier: "a2a-bridge",
      live_tools_called: true,
      transport: "api",
      proof_level: "tool_call",
      successful_tool_call_count: recorder ? 1 : 0,
      external_session_id: sessionId,
      endpoint: GITHUB_API,
      pr_url: pr.url,
      pr_number: pr.number,
    };

    return { output, provenance };
  },
};
