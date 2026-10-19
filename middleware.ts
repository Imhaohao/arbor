import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { publicDemoMode } from "@/lib/public-demo";
import { authRequired, clerkEnabled } from "@/lib/clerk-config";

const needsSignIn = createRouteMatcher([
  "/dashboard(.*)",
  "/tasks(.*)",
  "/task/(.*)",
  "/admin(.*)",
  "/replay(.*)",
]);

function demoApiBlock(request: NextRequest): NextResponse | undefined {
  if (!publicDemoMode() || !request.nextUrl.pathname.startsWith("/api/")) return undefined;
  return NextResponse.json(
    {
      error: "API access is disabled in the public Arbor demo.",
      code: "public_demo_api_disabled",
    },
    { status: 403 },
  );
}

const withClerk = clerkMiddleware(async (auth, request) => {
  const blocked = demoApiBlock(request);
  if (blocked) return blocked;
  if (authRequired() && needsSignIn(request)) await auth.protect();
});

function withoutClerk(request: NextRequest) {
  return demoApiBlock(request) ?? NextResponse.next();
}

export default clerkEnabled() ? withClerk : withoutClerk;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
