"use client";

import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Bold one-liner above the spinner. e.g. "Selecting your specialist". */
  label: string;
  /** Live sub-status under the label. e.g. "Calculating Vickrey winner..." */
  status?: string;
  /** Optional detail rows ("3/10 specialists responded", "tool: nia_research"). */
  details?: string[];
  /** Wall-clock seconds since the wait began. Renders an "elapsed" chip if set. */
  elapsedSeconds?: number;
  /** Optional 0..1 indeterminate-progress hint; renders a thin bar. */
  progress?: number;
  /** Tone of the spinner / accent color. */
  tone?: "brand" | "warning" | "info";
}

const TONES = {
  brand: "text-brand-600",
  warning: "text-warning-600",
  info: "text-brand-600",
} as const;

const BAR_TONES = {
  brand: "bg-brand-500",
  warning: "bg-warning-500",
  info: "bg-brand-500",
} as const;

/**
 * Spinner + live status block for any "user is waiting on a backend phase"
 * panel. Reports concrete progress (elapsed seconds, sub-status) instead of a
 * lonely "In progress" label.
 */
export function LoadingProgress({
  label,
  status,
  details = [],
  elapsedSeconds,
  progress,
  tone = "brand",
}: Props) {
  return (
    <div>
      <div className="flex items-center gap-3 text-sm text-ink">
        <CircleNotch
          size={16}
          weight="bold"
          className={cn("shrink-0 animate-spin", TONES[tone])}
        />
        <span className="font-medium">{label}</span>
        {elapsedSeconds !== undefined && (
          <span className="type-data ml-auto text-xs text-ink-muted">
            {elapsedSeconds.toFixed(1)}s elapsed
          </span>
        )}
      </div>

      {status && <p className="mt-2 pl-7 text-[0.8125rem] text-ink-muted">{status}</p>}

      {details.length > 0 && (
        <ul className="mt-2 space-y-1 pl-7 text-[0.8125rem] text-ink-muted">
          {details.map((d, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-subtle" />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}

      {progress !== undefined && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              BAR_TONES[tone],
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Re-renders every 200ms so a wait counter ticks live. Pass `undefined` for
 * the start time to stay frozen at 0.
 */
export function useElapsedSeconds(startTimestamp: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startTimestamp === undefined) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [startTimestamp]);
  if (startTimestamp === undefined) return 0;
  return Math.max(0, (now - startTimestamp) / 1000);
}
