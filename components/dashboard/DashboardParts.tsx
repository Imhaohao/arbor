import type { ReactNode } from "react";
import { Treeling } from "@/components/grove/Treeling";
import { cn } from "@/lib/utils";

export function prettyAgent(id: string) {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EmptyState({
  seed,
  message,
  action,
}: {
  seed: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <Treeling seed={seed} asleep alive={false} size={56} />
      <p className="type-body max-w-[40ch] text-ink-muted">{message}</p>
      {action}
    </div>
  );
}

export function SkeletonRows({ count, className }: { count: number; className?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("shimmer h-10 rounded-control", className)} />
      ))}
    </div>
  );
}
