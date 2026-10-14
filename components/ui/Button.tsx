import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "soft" | "danger";
type Size = "sm" | "md" | "lg";

/*
 * Shape rule for the whole product: buttons and chips are full pills, inputs
 * are radius-control (12px), cards and panels are radius-card (20px).
 * Primary actions fill with ink (the neutral ramp); the ember accent is light
 * and never a button fill.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-paper shadow-[0_1px_0_oklch(var(--paper)/0.12)_inset,0_6px_16px_-8px_oklch(var(--ink)/0.5)] hover:bg-ink-soft",
  secondary:
    "bg-surface text-ink shadow-hairline hover:shadow-hairline-strong hover:bg-surface-subtle",
  ghost: "bg-transparent text-ink-soft hover:bg-ink/[0.06] hover:text-ink",
  soft: "bg-surface-muted text-ink hover:bg-surface-sunken",
  danger: "bg-danger-600 text-paper hover:bg-danger-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[0.8125rem] gap-1.5",
  md: "h-10 px-[1.125rem] text-sm gap-2",
  lg: "h-12 px-6 text-[0.9375rem] gap-2",
};

/** Class string for anything that should look like a button (links too). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-medium outline-none active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45 focus-visible:shadow-ring",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
});
