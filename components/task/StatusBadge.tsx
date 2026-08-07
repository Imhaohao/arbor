import { Pill, type PillTone } from "@/components/ui/Pill";
import type { TaskStatus } from "@/lib/types";

// Labels are written for a first-time, non-technical visitor — not a
// developer reading the raw status enum. In particular "disputed" is Arbor's
// internal name for "the LLM judge rejected the delivery," which reads to a
// normal person as a legal dispute; the label below says what actually
// happened instead. This is presentation only — the underlying `status`
// value on the task row is never changed.
const META: Record<string, { label: string; tone: PillTone; pulse?: boolean }> = {
  open: { label: "Open", tone: "neutral" },
  planning: { label: "Planning", tone: "info", pulse: true },
  plan_review: { label: "Reviewing plan", tone: "info", pulse: true },
  bidding: { label: "Bidding", tone: "warning", pulse: true },
  awarded: { label: "Awarded", tone: "info" },
  requires_payment: { label: "Awaiting payment", tone: "warning", pulse: true },
  executing: { label: "In progress", tone: "brand", pulse: true },
  judging: { label: "Judge reviewing", tone: "info", pulse: true },
  synthesizing: { label: "Finalizing", tone: "brand", pulse: true },
  complete: { label: "Complete", tone: "success" },
  disputed: { label: "Rejected by judge", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Couldn't complete", tone: "danger" },
};

const FALLBACK = { label: "Unknown", tone: "neutral" as PillTone, pulse: false };

export function StatusBadge({ status }: { status: TaskStatus | string | undefined }) {
  // Defensive: status can be undefined briefly during reactive load, or hold
  // a legacy value from a row written before the current union. Render a
  // muted "Unknown" pill instead of crashing the page.
  const m = (status && META[status as TaskStatus]) || {
    ...FALLBACK,
    label: status ? String(status) : FALLBACK.label,
  };
  return (
    <Pill tone={m.tone} pulse={m.pulse}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {m.label}
    </Pill>
  );
}
