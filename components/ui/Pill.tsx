import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export type PillTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "live";

const TONES: Record<PillTone, string> = {
  neutral: "bg-surface-muted text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-moss-50 text-moss-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  info: "bg-brand-50 text-brand-700",
  // Live work carries the ember light: a glowing dot, never an ember fill.
  live: "bg-surface-muted text-ink before:size-1.5 before:animate-soft-pulse before:rounded-full before:bg-glow before:shadow-lantern",
};

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  pulse?: boolean;
}

export function Pill({ className, tone = "neutral", pulse = false, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium before:content-['']",
        tone !== "live" && "before:hidden",
        TONES[tone],
        pulse && "animate-soft-pulse",
        className,
      )}
      {...props}
    />
  );
}
