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
