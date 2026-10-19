// Clerk issues the JWTs Convex verifies. CLERK_JWT_ISSUER_DOMAIN is the Clerk
// Frontend API URL from https://dashboard.clerk.com/apps/setup/convex; the
// Clerk Convex integration must be activated so tokens carry aud "convex".
// A deployment without the variable accepts no tokens, so every caller is
// anonymous there.
const clerkIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: clerkIssuer ? [{ domain: clerkIssuer, applicationID: "convex" }] : [],
};
