import assert from "node:assert/strict";
import { readableError } from "./readable-error";

// Verbatim from the landing page on 2026-10-13: a visitor posting a task saw
// the transport prefix, request id and two stack frames.
assert.equal(
  readableError(
    new Error(
      "[CONVEX A(intake:approveAndPost)] [Request ID: 08f8c8dbdfffb09f] Server Error Uncaught Error: Public demo task posting is restricted to the fixed preview smoke task at handler (../../convex/tasks.ts:99:10) at async handler (../convex/intake.ts:278:6) Called by client",
    ),
  ),
  "Public demo task posting is restricted to the fixed preview smoke task",
);

// The same error as stored by the action after runMutation, with newlines.
assert.equal(
  readableError(new Error("Uncaught Error: Budget must be positive\n    at handler (../../convex/tasks.ts:12:3)")),
  "Budget must be positive",
);

// A provider's JSON error body collapses to its own message (dashboard review queue, 2026-10-13).
assert.equal(
  readableError(
    'hive_backstop_failed: Model API error 429: { "error": { "message": "You exceeded your current quota, please check your plan and billing details.", "type": "insufficient_quota", "param": null } }',
  ),
  "hive_backstop_failed: Model API error 429: You exceeded your current quota, please check your plan and billing details.",
);

// A body truncated in storage still yields the provider's sentence.
assert.equal(
  readableError('Model API error 429: { "error": { "message": "You exceeded your current quota.", "type": "insuff'),
  "Model API error 429: You exceeded your current quota.",
);

// Braces that are not JSON are left alone.
assert.equal(readableError("expected {n} items"), "expected {n} items");

// Plain messages and non-Errors pass through.
assert.equal(readableError(new Error("Final brief cannot be empty.")), "Final brief cannot be empty.");
assert.equal(readableError("timeout"), "timeout");

console.log("readable-error tests passed");
