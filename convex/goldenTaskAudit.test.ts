/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("golden audit reputation settlement", () => {
  test("atomically replaces the judge row and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const taskId = await ctx.db.insert("tasks", {
        posted_by: "buyer:default",
        task_type: "general",
        prompt: "Compute the reference answer.",
        max_budget: 0.3,
        status: "complete",
        bid_window_seconds: 30,
        bid_window_closes_at: now + 30_000,
      });
      const goldenTaskId = await ctx.db.insert("golden_tasks", {
        golden_id: "golden-test",
        title: "Test golden",
        prompt: "Compute the reference answer.",
        task_type: "general",
        max_budget: 0.3,
        reference_answer: "42",
        success_criteria: "Answer 42.",
        required_substrings: ["42"],
        enabled: true,
        run_count: 1,
        created_at: now,
        updated_at: now,
      });
      const runId = await ctx.db.insert("golden_task_runs", {
        golden_task_id: goldenTaskId,
        task_id: taskId,
        status: "posted",
        posted_at: now,
      });
      await ctx.db.insert("reputation_dimensions", {
        agent_id: "agent:test",
        task_id: taskId,
        actual_seconds: 8,
        estimated_seconds: 10,
        speed_score: 1,
        estimate_accuracy: 0.84,
        quality_score: 0.9,
        value_score: 1,
        confidence: 0.9,
        calibration_score: 0.99,
        task_class: "reasoning",
        overall: 0.93,
        accepted: true,
        bid_price: 0.2,
        price_paid: 0.2,
        created_at: now,
      });
      return { taskId, runId };
    });

    const args = {
      run_id: ids.runId,
      agent_id: "agent:test",
      task_id: ids.taskId,
      actual_seconds: 8,
      estimated_seconds: 10,
      quality_score: 0.1,
      accepted: false,
      bid_price: 0.2,
      price_paid: 0.2,
      confidence: 0.9,
      task_class: "reasoning",
      judge_accepted: true,
      audit_reasoning: "Reference answer was wrong.",
      substring_misses: ["42"],
      grader_used: true,
    };
    await expect(
      t.mutation(internal.reputationDimensions._recordGoldenAudit, args),
    ).resolves.toMatchObject({ claimed: true, replaced: true });

    const afterFirst = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("reputation_dimensions")
        .withIndex("by_task", (q) => q.eq("task_id", ids.taskId))
        .collect();
      const run = await ctx.db.get(ids.runId);
      return { rows, run };
    });
    expect(afterFirst.rows).toHaveLength(1);
    expect(afterFirst.rows[0]).toMatchObject({
      agent_id: "agent:test",
      accepted: false,
      quality_score: 0.1,
      confidence: 0.9,
    });
    expect(afterFirst.rows[0].calibration_score).toBeCloseTo(0.19);
    expect(afterFirst.run).toMatchObject({
      status: "audited",
      judge_accepted: true,
      audit_passed: false,
      audit_quality: 0.1,
      substring_misses: ["42"],
    });

    await expect(
      t.mutation(internal.reputationDimensions._recordGoldenAudit, {
        ...args,
        quality_score: 1,
        accepted: true,
      }),
    ).resolves.toEqual({ claimed: false });
    const rowsAfterRetry = await t.run(async (ctx) =>
      ctx.db
        .query("reputation_dimensions")
        .withIndex("by_task", (q) => q.eq("task_id", ids.taskId))
        .collect(),
    );
    expect(rowsAfterRetry).toHaveLength(1);
    expect(rowsAfterRetry[0]).toMatchObject({
      accepted: false,
      quality_score: 0.1,
    });
  });
});
