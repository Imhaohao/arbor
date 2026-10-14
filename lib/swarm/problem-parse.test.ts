import assert from "node:assert/strict";
import { parseJsonProblem, parseMarkdownProblem, parseProblem } from "./problem-parse";

function expectTask(result: ReturnType<typeof parseProblem>) {
  if (!result.ok) assert.fail(result.error);
  return result.task;
}

const SECTIONED = [
  "# Pair Sums",
  "",
  "Given `n` numbers, count pairs that sum to `k`.",
  "",
  "## Examples",
  "",
  "### Example 1",
  "",
  "Input",
  "",
  "```",
  "3 5",
  "1 4 2",
  "```",
  "",
  "Output",
  "",
  "```",
  "1",
  "```",
  "",
  "### Example 2",
  "",
  "Input",
  "```",
  "2 9",
  "1 1",
  "```",
  "Output",
  "```",
  "0",
  "```",
  "",
  "The second case has no valid pair.",
].join("\n");

{
  const task = expectTask(parseMarkdownProblem(SECTIONED));
  assert.equal(task.title, "Pair Sums");
  assert.equal(task.statement, "Given `n` numbers, count pairs that sum to `k`.");
  assert.deepEqual(task.examples, [
    { input: "3 5\n1 4 2\n", output: "1\n" },
    { input: "2 9\n1 1\n", output: "0\n" },
  ]);
  assert.equal(task.checker, "tokens");
  assert.equal(task.time_limit_s, 2);
  assert.deepEqual(task.topic, []);
  assert.equal(task.author, "buyer");
}

{
  const task = expectTask(parseMarkdownProblem("# Echo\n\nPrint the number.\n\nInput\n```\n7\n```\nOutput\n```\n7\n```\n"));
  assert.deepEqual(task.examples, [{ input: "7\n", output: "7\n" }]);
  assert.equal(task.statement, "Print the number.");
}

{
  const result = parseMarkdownProblem("# No examples\n\nSolve it.");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /at least one example/);
}

{
  const task = expectTask(
    parseJsonProblem({ statement: "Add two numbers.", examples: [{ input: "1 2", output: "3" }], time_limit_s: 5, checker: "float:1e-6" }),
  );
  assert.equal(task.time_limit_s, 5);
  assert.equal(task.checker, "float:1e-6");
  assert.deepEqual(task.examples, [{ input: "1 2\n", output: "3\n" }]);
}

{
  const task = expectTask(parseProblem(JSON.stringify({ statement: "Add.", examples: [{ input: "1", output: "1" }] })));
  assert.equal(task.time_limit_s, 2);
  assert.equal(task.checker, "tokens");
}

// The v1 strings author wrote examples as "Example N" plus two bare fences.
{
  const task = expectTask(
    parseMarkdownProblem("# Pairs\n\nCount pairs.\n\n## Examples\n\nExample 1\n\n```\n7 5 6\nabcdcba\n```\n\n```\n26\n```\n\nExample 2\n\n```\n1 1 1\na\n```\n\n```\n0\n```\n"),
  );
  assert.deepEqual(task.examples, [
    { input: "7 5 6\nabcdcba\n", output: "26\n" },
    { input: "1 1 1\na\n", output: "0\n" },
  ]);
  assert.equal(task.statement, "Count pairs.");
}

// An odd number of bare fences cannot be paired safely, so it is refused.
assert.equal(parseMarkdownProblem("# Odd\n\nText.\n\n## Examples\n\n```\n1\n```\n").ok, false);

assert.equal(parseJsonProblem({ statement: "No examples here.", examples: [] }).ok, false);
assert.equal(parseJsonProblem({ examples: [{ input: "1", output: "1" }] }).ok, false);
assert.equal(parseProblem("{ not json at all").ok, false);

console.log("problem-parse tests passed");
