"use client";

import { ReactNode, useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk-config";

export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      // Render without Convex if not configured yet (foundation scaffold mode).
      return null;
    }
    return new ConvexReactClient(url);
  }, []);

  if (!client) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="type-page text-ink">
          Arbor backend is not configured
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Set NEXT_PUBLIC_CONVEX_URL in the app environment before opening the
          dashboard or specialist pages.
        </p>
      </main>
    );
  }
  if (!clerkEnabled()) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
  }
  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
