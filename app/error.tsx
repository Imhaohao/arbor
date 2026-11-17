"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-24 sm:px-6">
      <div className="max-w-[44ch] text-center">
        <h1 className="type-title text-ink">Unable to load this page</h1>
        <p className="type-lead mt-4 text-ink-muted">
          Arbor could not reach its backend. Check your connection and try again in a moment.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <a href="/" className="inline-flex h-10 items-center rounded-full px-[1.125rem] text-sm font-medium text-ink-soft hover:text-ink">
            Go to the home page
          </a>
        </div>
      </div>
    </main>
  );
}
