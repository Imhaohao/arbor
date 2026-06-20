import assert from "node:assert/strict";
import {
  extractInlineDiff,
  extractPullRequestRef,
  hasDiffBlock,
  isPrReviewTask,
  lastResortBidPrice,
  parseBudgetCeiling,
} from "./pr-review-detect";

function testHasDiffBlock() {
  assert.equal(hasDiffBlock("```diff\n- a\n+ b\n```"), true);
  assert.equal(hasDiffBlock("preamble\ndiff --git a/x.ts b/x.ts\n"), true);
  assert.equal(hasDiffBlock("--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@"), true);
  assert.equal(hasDiffBlock("there is no diff here, just prose"), false);
}

function testIsPrReviewTask() {
  // Strong phrases stand alone.
  assert.equal(isPrReviewTask("Please review this PR before merge"), true);
  assert.equal(isPrReviewTask("can you do an automated code review"), true);
  // task_type alone classifies, regardless of prompt wording.
  assert.equal(isPrReviewTask("take a look", "pr-review"), true);
  assert.equal(isPrReviewTask("here are the edits", "code_review"), true);
  // An inline diff is sufficient on its own.
  assert.equal(isPrReviewTask("look at this:\n```diff\n- a\n+ b\n```"), true);
  // A PR URL only counts with a review verb present.
  assert.equal(
    isPrReviewTask("Review https://github.com/foo/bar/pull/12"),
    true,
  );
  // Weak signal pairs (review verb + PR context) classify.
  assert.equal(isPrReviewTask("evaluate the changed files"), true);
  // Conservative: bare "review" with no code/PR context does NOT match.
  assert.equal(isPrReviewTask("review my marketing essay"), false);
  // A bare PR URL with no review verb does NOT match.
  assert.equal(isPrReviewTask("see https://github.com/foo/bar/pull/12"), false);
  assert.equal(isPrReviewTask("Summarize the latest sales numbers"), false);
}

function testExtractPullRequestRef() {
  assert.deepEqual(
    extractPullRequestRef("https://github.com/octocat/Hello-World/pull/42"),
    {
      owner: "octocat",
      repo: "Hello-World",
      number: 42,
      url: "https://github.com/octocat/Hello-World/pull/42",
    },
  );
  // The /files suffix is dropped from the canonical url.
  assert.equal(
    extractPullRequestRef("see https://github.com/o/r/pull/7/files")?.url,
    "https://github.com/o/r/pull/7",
  );
  // A non-PR github URL yields null.
  assert.equal(
    extractPullRequestRef("https://github.com/octocat/Hello-World/issues/42"),
    null,
  );
  assert.equal(extractPullRequestRef("no url present"), null);
}

function testExtractInlineDiff() {
  assert.equal(
    extractInlineDiff("intro\n```diff\n- a\n+ b\n```\ntail"),
    "- a\n+ b",
  );
  assert.equal(
    extractInlineDiff("note\ndiff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b"),
    "diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b",
  );
  assert.equal(extractInlineDiff("just prose, no diff"), null);
  assert.equal(extractInlineDiff(""), null);
}

function testParseBudgetCeiling() {
  assert.equal(parseBudgetCeiling("Budget ceiling: $5.00 per node"), 5);
  assert.equal(parseBudgetCeiling("budget ceiling: 12"), 12);
  assert.equal(parseBudgetCeiling("no budget advertised"), null);
  // Zero / non-positive ceilings are rejected.
  assert.equal(parseBudgetCeiling("Budget ceiling: $0"), null);
}

function testLastResortBidPrice() {
  // 0.92 of the advertised ceiling when it clears the cost baseline.
  assert.equal(lastResortBidPrice("Budget ceiling: $10", 1), 9.2);
  assert.equal(lastResortBidPrice(20, 3), 18.4);
  // Never exceed the budget even when the cost baseline is higher.
  assert.equal(lastResortBidPrice("Budget ceiling: $2", 5), 2);
  // No ceiling advertised falls back to the cost baseline.
  assert.equal(lastResortBidPrice("no budget", 4), 4);
  assert.equal(lastResortBidPrice(null, 7), 7);
}

testHasDiffBlock();
testIsPrReviewTask();
testExtractPullRequestRef();
testExtractInlineDiff();
testParseBudgetCeiling();
testLastResortBidPrice();
console.log("pr-review-detect tests passed");
