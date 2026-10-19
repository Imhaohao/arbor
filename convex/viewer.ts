// Who is calling, derived only from the verified Clerk JWT. Never trust a
// user id passed as a function argument for authorization.
//
// ARBOR_REQUIRE_AUTH=true (production) makes every buyer action need a signed-in
// identity. Unset (local dev, scripts, the public demo), anonymous callers keep
// the old behavior of naming their own poster id.

import type { Auth } from "convex/server";

type AuthCtx = { auth: Auth };

export function authRequired(): boolean {
  return process.env.ARBOR_REQUIRE_AUTH === "true";
}

export async function viewerId(ctx: AuthCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? null;
}

export async function requireViewerId(ctx: AuthCtx): Promise<string> {
  const id = await viewerId(ctx);
  if (!id) throw new Error("Sign in to continue.");
  return id;
}

function adminEmails(): string[] {
  return (process.env.ARBOR_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function viewerIsAdmin(ctx: AuthCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.toLowerCase();
  return Boolean(email && adminEmails().includes(email));
}

/**
 * The owner id to record for a new task or intake. A signed-in caller is
 * always recorded as themselves; the claimed id is honored only for anonymous
 * callers when auth is not required.
 */
export async function resolveOwnerId(
  ctx: AuthCtx,
  claimedOwnerId: string | undefined,
): Promise<string> {
  const id = await viewerId(ctx);
  if (id) return id;
  if (authRequired()) throw new Error("Sign in to continue.");
  const claimed = claimedOwnerId?.trim();
  if (!claimed) throw new Error("Owner is required.");
  return claimed;
}

/**
 * Throws unless the caller may act on a record owned by `ownerId`: its owner,
 * an admin, or anyone when auth is not required.
 */
export async function assertCanActOn(ctx: AuthCtx, ownerId: string): Promise<void> {
  if (!authRequired()) return;
  const id = await requireViewerId(ctx);
  if (id === ownerId) return;
  if (await viewerIsAdmin(ctx)) return;
  throw new Error("You can only change your own tasks.");
}

/** Read-side twin of assertCanActOn: false instead of throwing. */
export async function canView(ctx: AuthCtx, ownerId: string): Promise<boolean> {
  if (!authRequired()) return true;
  const id = await viewerId(ctx);
  if (!id) return false;
  return id === ownerId || (await viewerIsAdmin(ctx));
}

/**
 * The poster id a listing query should be scoped to: the caller's own id, or
 * null for "every poster" (admins, or anyone when auth is not required).
 * Returns undefined when the caller may see nothing (signed out under auth).
 */
export async function listingScope(ctx: AuthCtx): Promise<string | null | undefined> {
  if (!authRequired()) return null;
  const id = await viewerId(ctx);
  if (!id) return undefined;
  if (await viewerIsAdmin(ctx)) return null;
  return id;
}
