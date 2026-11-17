import { cn } from "@/lib/utils";

/*
 * One agent's identity mark: its initials on a soft tint picked from the
 * agent id, so the same agent always looks the same in every list. The tints
 * carry identity only, never status; status lives in the row's own text.
 */
const TINTS = [
  "bg-brand-100 text-brand-800",
  "bg-moss-100 text-moss-800",
  "bg-warn-100 text-warn-800",
  "bg-ember-100 text-ember-800",
  "bg-surface-sunken text-ink-soft",
] as const;

function hash(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return value;
}

export function initials(name: string): string {
  const words = name
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export interface AgentAvatarProps {
  /** Stable agent id; the same seed always gets the same tint. */
  seed: string;
  /** Shown as initials; falls back to the seed. */
  name?: string;
  /** Diameter in px. */
  size?: number;
  /** Dims the mark for agents that are offline or not ready. */
  muted?: boolean;
  className?: string;
  /** Accessible name. Omit when the agent's name is already visible beside it. */
  label?: string;
}

export function AgentAvatar({ seed, name, size = 32, muted = false, className, label }: AgentAvatarProps) {
  const tint = TINTS[hash(seed) % TINTS.length];
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        tint,
        muted && "opacity-50",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials(name ?? seed)}
    </span>
  );
}
