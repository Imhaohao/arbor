import { NextResponse, type NextRequest } from "next/server";
import { publicDemoMode } from "@/lib/public-demo";

export function middleware(_request: NextRequest) {
  if (!publicDemoMode()) return NextResponse.next();
  return NextResponse.json(
    {
      error: "API access is disabled in the public Arbor demo.",
      code: "public_demo_api_disabled",
    },
    { status: 403 },
  );
}

export const config = { matcher: "/api/:path*" };
