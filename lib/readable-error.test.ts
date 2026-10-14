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

// Plain messages and non-Errors pass through.
assert.equal(readableError(new Error("Final brief cannot be empty.")), "Final brief cannot be empty.");
assert.equal(readableError("timeout"), "timeout");

console.log("readable-error tests passed");
