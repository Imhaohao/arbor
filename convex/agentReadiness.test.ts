/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("agent smoke roster reconciliation", () => {
  test("reopens a prematurely completed capped run when the roster is larger", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("agent_smoke_runs", {
        run_id: "smoke-capped",
        mode: "probe",
        status: "complete",
        total_agents: 1000,
        processed_agents: 1000,
        ready_agents: 100,
        started_at: now - 60_000,
        completed_at: now - 1_000,
        updated_at: now - 1_000,
      });
    });

    await expect(
      t.mutation(internal.agentReadiness._setRunTotalAgents, {
        run_id: "smoke-capped",
        total_agents: 1233,
      }),
    ).resolves.toEqual({
      total_agents: 1233,
      processed_agents: 1000,
      status: "running",
    });

    const reopened = await t.run(async (ctx) =>
      ctx.db
        .query("agent_smoke_runs")
        .withIndex("by_run_id", (q) => q.eq("run_id", "smoke-capped"))
        .unique(),
    );
    expect(reopened).toMatchObject({
      status: "running",
      total_agents: 1233,
      processed_agents: 1000,
    });
    expect(reopened?.completed_at).toBeUndefined();
  });
});
