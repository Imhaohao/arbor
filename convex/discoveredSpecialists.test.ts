/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const candidate = {
  agent_id: "parallel-search",
  display_name: "parallel-search",
  sponsor: "Parallel",
  capabilities: [
    "web-search",
    "deep-research",
    "extract-answer",
    "rank-sources",
    "summarize",
  ],
  system_prompt: "Catalog-backed search specialist.",
  cost_baseline: 0.4,
  starting_reputation: 0.55,
  one_liner: "Search and research.",
  tier: "mcp-forwarding" as const,
  discovered_for: "multi-agent research",
  discovery_source: "catalog" as const,
  mcp_endpoint: "https://search-mcp.parallel.ai/mcp",
  mcp_api_key_env: "PARALLEL_API_KEY",
};

describe("discovered specialist mirror adoption", () => {
  test("adopts an identity-matching orphan agents mirror", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("agents", {
        agent_id: candidate.agent_id,
        display_name: candidate.display_name,
        sponsor: candidate.sponsor,
        capabilities: candidate.capabilities,
        system_prompt: "Legacy catalog prompt.",
        cost_per_task_estimate: 0.4,
        reputation_score: 0.55,
        total_tasks_completed: 0,
        total_disputes_lost: 0,
      });
    });

    await expect(
      t.mutation(api.discoveredSpecialists.upsert, candidate),
    ).resolves.toMatchObject({
      agent_id: candidate.agent_id,
      updated: false,
    });
    const state = await t.run(async (ctx) => ({
      agents: await ctx.db.query("agents").collect(),
      discovered: await ctx.db.query("discovered_specialists").collect(),
    }));
    expect(state.agents).toHaveLength(1);
    expect(state.discovered).toHaveLength(1);
    expect(state.agents[0]).toMatchObject({
      agent_id: candidate.agent_id,
      system_prompt: candidate.system_prompt,
    });
  });

  test("still rejects a real sponsor identity collision", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("agents", {
        agent_id: candidate.agent_id,
        display_name: candidate.display_name,
        sponsor: "Different Sponsor",
        capabilities: candidate.capabilities,
        system_prompt: "Unrelated agent.",
        cost_per_task_estimate: 0.4,
        reputation_score: 0.55,
        total_tasks_completed: 0,
        total_disputes_lost: 0,
      });
    });

    await expect(
      t.mutation(api.discoveredSpecialists.upsert, candidate),
    ).rejects.toThrow("collides with a sponsor");
  });

  test("marks only unkeyed A2A specialists as verified keyless", async () => {
    const t = convexTest(schema, modules);
    const {
      mcp_endpoint: _mcpEndpoint,
      mcp_api_key_env: _mcpApiKeyEnv,
      ...baseCandidate
    } = candidate;
    const a2aCandidate = {
      ...baseCandidate,
      agent_id: "verified-keyless-a2a",
      display_name: "Verified Keyless A2A",
      tier: "a2a" as const,
      discovery_source: "a2a" as const,
      a2a_endpoint: "https://example.test/a2a",
    };
    await t.mutation(api.discoveredSpecialists.upsert, a2aCandidate);

    await expect(
      t.mutation(internal.discoveredSpecialists._markA2aAuthNone, {
        agent_id: a2aCandidate.agent_id,
      }),
    ).resolves.toEqual({ updated: true });
    const row = await t.query(api.discoveredSpecialists.list, {});
    expect(row[0]).toMatchObject({
      agent_id: a2aCandidate.agent_id,
      a2a_auth_mode: "none",
    });
  });
});
