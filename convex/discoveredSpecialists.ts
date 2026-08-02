import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

const MIN_AGENT_ID = /^[a-z0-9][a-z0-9-]{2,40}$/;

function sameAgentIdentity(
  mirror: {
    display_name: string;
    sponsor: string;
    capabilities: string[];
  },
  candidate: {
    display_name: string;
    sponsor: string;
    capabilities: string[];
  },
): boolean {
  if (
    mirror.display_name.trim().toLowerCase() !==
      candidate.display_name.trim().toLowerCase() ||
    mirror.sponsor.trim().toLowerCase() !==
      candidate.sponsor.trim().toLowerCase()
  ) {
    return false;
  }
  const existingCapabilities = [...mirror.capabilities]
    .map((value) => value.trim().toLowerCase())
    .sort();
  const candidateCapabilities = [...candidate.capabilities]
    .map((value) => value.trim().toLowerCase())
    .sort();
  return (
    existingCapabilities.length === candidateCapabilities.length &&
    existingCapabilities.every(
      (value, index) => value === candidateCapabilities[index],
    )
  );
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("discovered_specialists").collect();
    return rows.sort((a, b) => b.created_at - a.created_at);
  },
});

/** Paginated discovered roster access for long-running maintenance actions. */
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("discovered_specialists")
      .paginate(args.paginationOpts);
  },
});

export const _getByAgentId = internalQuery({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
  },
});

/**
 * Persist a keyless A2A auth shortcut only after a full live smoke proves that
 * the endpoint can execute without credentials. Key-configured specialists
 * are never downgraded to keyless by this maintenance path.
 */
export const _markA2aAuthNone = internalMutation({
  args: { agent_id: v.string() },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const specialist = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (
      !specialist?.a2a_endpoint ||
      specialist.a2a_api_key_env ||
      specialist.a2a_auth_mode === "none"
    ) {
      return { updated: false };
    }
    await ctx.db.patch(specialist._id, { a2a_auth_mode: "none" });
    return { updated: true };
  },
});

const SPECIALIST_FIELDS = {
  agent_id: v.string(),
  display_name: v.string(),
  sponsor: v.string(),
  capabilities: v.array(v.string()),
  system_prompt: v.string(),
  cost_baseline: v.number(),
  starting_reputation: v.number(),
  one_liner: v.string(),
  tier: v.optional(
    v.union(
      v.literal("real"),
      v.literal("mcp-forwarding"),
      v.literal("a2a"),
      v.literal("a2a-bridge"),
      v.literal("openrouter"),
      v.literal("mock"),
      v.literal("disabled"),
    ),
  ),
  openrouter_model_id: v.optional(v.string()),
  openrouter_api_key_env: v.optional(v.string()),
  discovered_for: v.string(),
  discovery_source: v.optional(
    v.union(
      v.literal("google"),
      v.literal("catalog"),
      v.literal("registry"),
      v.literal("synthesized"),
      v.literal("a2a"),
    ),
  ),
  mcp_endpoint: v.optional(v.string()),
  mcp_api_key_env: v.optional(v.string()),
  homepage_url: v.optional(v.string()),
  rationale: v.optional(v.string()),
  a2a_endpoint: v.optional(v.string()),
  a2a_agent_card_url: v.optional(v.string()),
  a2a_api_key_env: v.optional(v.string()),
  a2a_auth_mode: v.optional(v.union(v.literal("none"), v.literal("card"))),
};

export const create = mutation({
  args: SPECIALIST_FIELDS,
  handler: async (ctx, args) => {
    if (!MIN_AGENT_ID.test(args.agent_id)) {
      throw new Error(
        `Invalid agent_id "${args.agent_id}" — must be kebab-case, 3-40 chars`,
      );
    }

    const existing = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (existing) {
      throw new Error(`agent_id "${args.agent_id}" already exists`);
    }
    const conflictingSponsor = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (conflictingSponsor) {
      throw new Error(`agent_id "${args.agent_id}" collides with a sponsor`);
    }

    const created_at = Date.now();
    const id = await ctx.db.insert("discovered_specialists", {
      ...args,
      created_at,
    });

    await ctx.db.insert("agents", {
      agent_id: args.agent_id,
      display_name: args.display_name,
      sponsor: args.sponsor,
      capabilities: args.capabilities,
      system_prompt: args.system_prompt,
      cost_per_task_estimate: args.cost_baseline,
      reputation_score: args.starting_reputation,
      total_tasks_completed: 0,
      total_disputes_lost: 0,
    });

    return { id, agent_id: args.agent_id, created_at };
  },
});

export const upsert = mutation({
  args: SPECIALIST_FIELDS,
  handler: async (ctx, args) => {
    if (!MIN_AGENT_ID.test(args.agent_id)) {
      throw new Error(
        `Invalid agent_id "${args.agent_id}" — must be kebab-case, 3-40 chars`,
      );
    }

    const existing = await ctx.db
      .query("discovered_specialists")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();

    const mirror = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();

    // Older catalog imports created the agents mirror before the
    // discovered_specialists row. Adopt that orphan only when its stable
    // identity matches exactly; a different sponsor/display/capability set is
    // still a real collision and must never be overwritten.
    if (
      mirror &&
      !existing &&
      !sameAgentIdentity(mirror, args)
    ) {
      throw new Error(`agent_id "${args.agent_id}" collides with a sponsor`);
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        created_at: existing.created_at,
      });

      if (mirror) {
        await ctx.db.patch(mirror._id, {
          display_name: args.display_name,
          sponsor: args.sponsor,
          capabilities: args.capabilities,
          system_prompt: args.system_prompt,
          cost_per_task_estimate: args.cost_baseline,
        });
      }

      return {
        id: existing._id,
        agent_id: args.agent_id,
        created_at: existing.created_at,
        updated: true,
      };
    }

    const created_at = Date.now();
    const id = await ctx.db.insert("discovered_specialists", {
      ...args,
      created_at,
    });

    if (mirror) {
      await ctx.db.patch(mirror._id, {
        display_name: args.display_name,
        sponsor: args.sponsor,
        capabilities: args.capabilities,
        system_prompt: args.system_prompt,
        cost_per_task_estimate: args.cost_baseline,
      });
    } else {
      await ctx.db.insert("agents", {
        agent_id: args.agent_id,
        display_name: args.display_name,
        sponsor: args.sponsor,
        capabilities: args.capabilities,
        system_prompt: args.system_prompt,
        cost_per_task_estimate: args.cost_baseline,
        reputation_score: args.starting_reputation,
        total_tasks_completed: 0,
        total_disputes_lost: 0,
      });
    }

    return { id, agent_id: args.agent_id, created_at, updated: false };
  },
});
