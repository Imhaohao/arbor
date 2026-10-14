import assert from "node:assert/strict";
import { amountPaid, executionElapsedMs } from "./task-view";

const ev = (event_type: string, timestamp: number) => ({ event_type, timestamp });

// Normal path: complete - started.
assert.equal(
  executionElapsedMs([
    ev("task_posted", 1000),
    ev("execution_started", 5000),
    ev("execution_complete", 17400),
    ev("settled", 20000),
  ]),
  12400,
);

// Missing either endpoint -> undefined, never a guess.
assert.equal(executionElapsedMs([ev("execution_started", 5000)]), undefined);
assert.equal(executionElapsedMs([ev("execution_complete", 5000)]), undefined);
assert.equal(executionElapsedMs([]), undefined);

// Clock skew (complete before start) -> undefined, never negative.
assert.equal(
  executionElapsedMs([
    ev("execution_started", 9000),
    ev("execution_complete", 8000),
  ]),
  undefined,
);

// Zero elapsed is a valid measurement, distinct from unmeasured.
assert.equal(
  executionElapsedMs([
    ev("execution_started", 7000),
    ev("execution_complete", 7000),
  ]),
  0,
);

// Escrow on dev, 2026-10-14: judge-rejected and failed tasks were refunded,
// yet /tasks labelled their locked price "paid". Only accepted work is paid.
{
  assert.equal(amountPaid({ status: "complete", price_paid: 0.35 }), 0.35);
  assert.equal(amountPaid({ status: "disputed", price_paid: 0.82 }), undefined);
  assert.equal(amountPaid({ status: "failed", price_paid: 0.4 }), undefined);
  assert.equal(amountPaid({ status: "complete" }), undefined);
}

console.log("task-view.test.ts: all assertions passed");
