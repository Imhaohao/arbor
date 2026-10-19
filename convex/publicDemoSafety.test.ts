/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  PUBLIC_DEMO_SMOKE_BUDGET,
  PUBLIC_DEMO_SMOKE_POSTED_BY,
  PUBLIC_DEMO_SMOKE_PROMPT,
} from "../lib/public-demo";

const modules = import.meta.glob("./**/*.ts");

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

describe("public demo Convex safety boundary", () => {
  test("allows exactly one idempotent fixed Hive smoke task", async () => {
    const previousDemo = process.env.ARBOR_PUBLIC_DEMO_MODE;
    process.env.ARBOR_PUBLIC_DEMO_MODE = "true";
    try {
      const t = convexTest(schema, modules);
      const request = {
        posted_by: PUBLIC_DEMO_SMOKE_POSTED_BY,
        prompt: PUBLIC_DEMO_SMOKE_PROMPT,
        max_budget: PUBLIC_DEMO_SMOKE_BUDGET,
        workflow_mode: "hive",
      } as const;
      const first = await t.mutation(api.tasks.post, request);
      const second = await t.mutation(api.tasks.post, request);
      expect(second.task_id).toBe(first.task_id);
      await expect(
        t.mutation(api.tasks.post, {
          ...request,
          prompt: "Call a remote agent.",
        }),
      ).rejects.toThrow(/restricted to the fixed preview smoke task/);
    } finally {
      restoreEnv("ARBOR_PUBLIC_DEMO_MODE", previousDemo);
    }
  });

  test("blocks A2A key APIs and dispute overrides before reading or mutating state", async () => {
    const previousDemo = process.env.ARBOR_PUBLIC_DEMO_MODE;
    process.env.ARBOR_PUBLIC_DEMO_MODE = "true";
    try {
      const t = convexTest(schema, modules);
      const task_id = await t.run(async (ctx) =>
        await ctx.db.insert("tasks", {
          posted_by: "buyer:test",
          task_type: "general",
          prompt: "Test public demo isolation.",
          max_budget: 1,
          status: "open",
          bid_window_seconds: 30,
          bid_window_closes_at: Date.now() + 30_000,
        }),
      );
      const disabled = /A2A outbound key access is disabled in public demo mode/;

      await expect(t.query(api.a2aOutboundKeys.listMasked, {})).rejects.toThrow(
        disabled,
      );
      await expect(
        t.query(api.a2aOutboundKeys.getForAgent, { agent_id: "agent:test" }),
      ).rejects.toThrow(disabled);
      await expect(
        t.mutation(api.a2aOutboundKeys.setKey, {
          agent_id: "agent:test",
          api_key: "secret",
          source: "test",
        }),
      ).rejects.toThrow(disabled);
      await expect(
        t.mutation(api.a2aOutboundKeys.removeKey, { agent_id: "agent:test" }),
      ).rejects.toThrow(disabled);
      await expect(
        t.query(internal.a2aOutboundKeys._getAll, {}),
      ).rejects.toThrow(disabled);
      await expect(
        t.action(api.disputes.override, {
          task_id,
          verdict: "accept",
          reason: "test",
        }),
      ).rejects.toThrow(/Dispute overrides are disabled in public demo mode/);
    } finally {
      restoreEnv("ARBOR_PUBLIC_DEMO_MODE", previousDemo);
    }
  });
});
