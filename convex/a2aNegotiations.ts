/**
 * Per-contextId conversation memory for the A2A market gateway.
 *
 * A2A clients never re-send prior turns, so the gateway persists each
 * negotiation turn here and reloads them on the next message/send that
 * carries the same contextId. One row per turn (never an array on a parent
 * doc) so long negotiations cannot hit the document size limit.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_TURNS_RETURNED = 32;
const MAX_TURN_TEXT = 8_000;

export const append = mutation({
  args: {
    context_id: v.string(),
    role: v.union(v.literal("counterparty"), v.literal("agent")),
    text: v.string(),
    requester_agent_id: v.optional(v.string()),
    intent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("a2a_negotiation_turns", {
      context_id: args.context_id,
      role: args.role,
      text: args.text.slice(0, MAX_TURN_TEXT),
      requester_agent_id: args.requester_agent_id,
      intent: args.intent,
      created_at: Date.now(),
    });
    return null;
  },
});

/**
 * Most recent negotiation contexts for the admin console: one row per
 * contextId with turn count and the latest turn's text as a preview. Reads a
 * bounded window of recent turns rather than the whole table.
 */
export const recentContexts = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      context_id: v.string(),
      turn_count: v.number(),
      last_role: v.union(v.literal("counterparty"), v.literal("agent")),
      last_text: v.string(),
      last_intent: v.optional(v.string()),
      requester_agent_id: v.optional(v.string()),
      last_created_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 50);
    const rows = await ctx.db
      .query("a2a_negotiation_turns")
      .order("desc")
      .take(500);
    const byContext = new Map<
      string,
      {
        context_id: string;
        turn_count: number;
        last_role: "counterparty" | "agent";
        last_text: string;
        last_intent?: string;
        requester_agent_id?: string;
        last_created_at: number;
      }
    >();
    for (const row of rows) {
      const existing = byContext.get(row.context_id);
      if (existing) {
        existing.turn_count += 1;
        if (!existing.requester_agent_id && row.requester_agent_id) {
          existing.requester_agent_id = row.requester_agent_id;
        }
      } else {
        byContext.set(row.context_id, {
          context_id: row.context_id,
          turn_count: 1,
          last_role: row.role,
          last_text: row.text.slice(0, 280),
          last_intent: row.intent,
          requester_agent_id: row.requester_agent_id,
          last_created_at: row.created_at,
        });
      }
    }
    return [...byContext.values()]
      .sort((a, b) => b.last_created_at - a.last_created_at)
      .slice(0, limit);
  },
});

/** Most recent turns for a context, returned oldest-first for prompt order. */
export const listByContext = query({
  args: { context_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("a2a_negotiation_turns")
      .withIndex("by_context_id", (q) => q.eq("context_id", args.context_id))
      .order("desc")
      .take(MAX_TURNS_RETURNED);
    return rows.reverse().map((row) => ({
      role: row.role,
      text: row.text,
      intent: row.intent,
      created_at: row.created_at,
    }));
  },
});
