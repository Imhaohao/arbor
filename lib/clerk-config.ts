// Environment switches shared by middleware, server code and the client. Kept
// free of Clerk imports so the edge middleware can read them cheaply.

/** Clerk is wired in only when its publishable key is configured. */
export function clerkEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** Production: buyers must sign in; mirrors ARBOR_REQUIRE_AUTH in Convex. */
export function authRequired(): boolean {
  return process.env.ARBOR_REQUIRE_AUTH === "true";
}
