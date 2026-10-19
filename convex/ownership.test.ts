/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "user_alice", issuer: "https://clerk.test", email: "alice@example.com" };
const BOB = { subject: "user_bob", issuer: "https://clerk.test", email: "bob@example.com" };
const OPERATOR = { subject: "user_op", issuer: "https://clerk.test", email: "op@example.com" };

const TASK = { prompt: "Rewrite our pricing page.", max_budget: 20 } as const;

const saved: Record<string, string | undefined> = {};
function setEnv(name: string, value: string | undefined) {
  saved[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("buyer ownership under ARBOR_REQUIRE_AUTH", () => {
  beforeEach(() => {
    setEnv("ARBOR_REQUIRE_AUTH", "true");
    setEnv("ARBOR_ADMIN_EMAILS", "op@example.com");
  });

  test("refuses anonymous posts and records the signed-in poster, not the claimed one", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.tasks.post, { ...TASK, posted_by: "buyer:web" })).rejects.toThrow(
      /Sign in/,
    );
    const alice = t.withIdentity(ALICE);
    const { task_id } = await alice.mutation(api.tasks.post, { ...TASK, posted_by: "someone-else" });
    const task = await t.run(async (ctx) => await ctx.db.get(task_id));
    expect(task?.posted_by).toBe("https://clerk.test|user_alice");
  });

  test("lists and payment rights are scoped to the owner, with admins seeing everything", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const { task_id } = await alice.mutation(api.tasks.post, TASK);

    expect(await alice.query(api.taskList.recentTasks, {})).toHaveLength(1);
    expect(await t.withIdentity(BOB).query(api.taskList.recentTasks, {})).toHaveLength(0);
    expect(await t.query(api.taskList.recentTasks, {})).toHaveLength(0);
    expect(await t.withIdentity(OPERATOR).query(api.taskList.recentTasks, {})).toHaveLength(1);

    expect(await alice.query(api.tasks.viewerCanAct, { task_id })).toBe(true);
    expect(await t.withIdentity(BOB).query(api.tasks.viewerCanAct, { task_id })).toBe(false);
    expect(await t.withIdentity(OPERATOR).query(api.tasks.viewerCanAct, { task_id })).toBe(true);
    expect(await alice.query(api.tasks.viewerCanAct, { task_id: "not-an-id" })).toBe(false);
  });

  test("blocks another buyer from overriding the judge on someone else's task", async () => {
    const t = convexTest(schema, modules);
    const { task_id } = await t.withIdentity(ALICE).mutation(api.tasks.post, TASK);
    await expect(
      t.withIdentity(BOB).action(api.disputes.override, {
        task_id,
        verdict: "reject",
        reason: "not mine",
      }),
    ).rejects.toThrow(/only change your own tasks/);
  });

  test("keeps each buyer's company profile private", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.productContext.save, {
      company_name: "Alice Co",
      business_context: "We sell kites.",
    });
    expect((await t.withIdentity(ALICE).query(api.productContext.latest, {}))?.company_name).toBe(
      "Alice Co",
    );
    expect(await t.withIdentity(BOB).query(api.productContext.latest, {})).toBeNull();
    expect(await t.query(api.productContext.latest, { owner_id: "https://clerk.test|user_alice" })).toBeNull();
  });
});

describe("unauthenticated deployments keep the old behavior", () => {
  test("anonymous callers name their own poster id", async () => {
    setEnv("ARBOR_REQUIRE_AUTH", undefined);
    const t = convexTest(schema, modules);
    const { task_id } = await t.mutation(api.tasks.post, { ...TASK, posted_by: "buyer:web" });
    const task = await t.run(async (ctx) => await ctx.db.get(task_id));
    expect(task?.posted_by).toBe("buyer:web");
    expect(await t.query(api.taskList.recentTasks, {})).toHaveLength(1);
  });
});
