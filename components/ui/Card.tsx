import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lift on hover. Only for cards that are themselves a link or button. */
  interactive?: boolean;
}

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card bg-surface p-5 shadow-card sm:p-6",
        interactive &&
          "transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  /** Smaller title for headers nested inside other cards. */
  size?: "default" | "subtle";
}

export function CardHeader({ title, meta, className, size = "default" }: CardHeaderProps) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", className)}>
      <h3 className={size === "subtle" ? "text-sm font-semibold text-ink" : "type-subheading text-ink"}>
        {title}
      </h3>
      {meta !== undefined && <div className="text-[0.8125rem] text-ink-muted">{meta}</div>}
    </div>
  );
}
