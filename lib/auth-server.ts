// Server-side identity helpers for Next.js route handlers and server
// components. Convex functions do their own checks in convex/viewer.ts; this
// file only gets the caller's Clerk session to Convex and gates operator pages.

import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { notFound } from "next/navigation";
import { authRequired, clerkEnabled } from "@/lib/clerk-config";

function adminEmails(): string[] {
  return (process.env.ARBOR_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Operator pages and routes: open on unauthenticated dev deployments only. */
export async function isAdmin(): Promise<boolean> {
  if (!authRequired()) return true;
  if (!clerkEnabled()) return false;
  const user = await currentUser();
  const allowed = adminEmails();
  return Boolean(
    user?.emailAddresses.some((address) =>
      allowed.includes(address.emailAddress.toLowerCase()),
    ),
  );
}

/** Wraps an operator-only route handler: a 404 unless the caller is an admin. */
export function adminOnly<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) =>
    (await isAdmin()) ? handler(...args) : Response.json({ error: "Not found" }, { status: 404 });
}

/** The signed-in user's primary email, for receipts and notifications. */
export async function callerEmail(): Promise<string | undefined> {
  if (!clerkEnabled()) return undefined;
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? undefined;
}

async function convexToken(): Promise<string | null> {
  if (!clerkEnabled()) return null;
  try {
    const { getToken, sessionClaims } = await auth();
    return sessionClaims?.aud === "convex"
      ? await getToken()
      : await getToken({ template: "convex" });
  } catch {
    return null;
  }
}

/** A Convex client that calls functions as the signed-in user, if any. */
export async function convexForCaller(): Promise<ConvexHttpClient> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  const client = new ConvexHttpClient(url);
  const token = await convexToken();
  if (token) client.setAuth(token);
  return client;
}

/** For operator-only pages: render a 404 unless the caller is an admin. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) notFound();
}
