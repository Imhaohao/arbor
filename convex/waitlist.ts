import { internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { isWaitlistRole, normalizeEmail } from "../lib/waitlist/core";

const roleValidator = v.union(v.literal("buyer"), v.literal("specialist"));

/**
 * Adds an email to the waitlist. A repeat join is a no-op that reports it.
 * Position (1-based join order) is stored for operators, never returned.
 */
export const join = mutation({
  args: {
    email: v.string(),
    role: roleValidator,
    source: v.optional(v.string()),
  },
  returns: v.object({ alreadyJoined: v.boolean() }),
  handler: async (ctx, args) => {
    const check = normalizeEmail(args.email);
    if (!check.ok) throw new Error(check.reason);
    if (!isWaitlistRole(args.role)) throw new Error("Unknown role.");

    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", check.email))
      .unique();
    if (existing) return { alreadyJoined: true };

    const last = await ctx.db.query("waitlist").withIndex("by_position").order("desc").first();
    const position = (last?.position ?? 0) + 1;
    await ctx.db.insert("waitlist", {
      email: check.email,
      role: args.role,
      source: args.source?.slice(0, 64),
      position,
      joined_at: Date.now(),
    });
    return { alreadyJoined: false };
  },
});

/** Operator export: `npx convex run waitlist:list`. Not callable from the browser. */
export const list = internalQuery({
  args: { role: v.optional(roleValidator) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("waitlist").withIndex("by_position").collect();
    const filtered = args.role ? rows.filter((row) => row.role === args.role) : rows;
    return filtered.map(({ position, email, role, source, joined_at }) => ({
      position,
      email,
      role,
      source,
      joined_at: new Date(joined_at).toISOString(),
    }));
  },
});
