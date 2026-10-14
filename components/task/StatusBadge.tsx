import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import { Pill, type PillTone } from "@/components/ui/Pill";
import type { TaskStatus } from "@/lib/types";

// Labels are written for a first-time, non-technical visitor, not a
// developer reading the raw status enum. "disputed" is Arbor's internal name
// for "the judge rejected the delivery", which reads to a normal person as a
// legal dispute; the label says what actually happened instead. Presentation
// only: the task row's `status` value is never changed.
//
// In-flight states use the `live` tone: an ember dot, the grove's light for
// work that is happening right now.
type Icon = "done" | "rejected" | "action" | null;

const META: Record<string, { label: string; tone: PillTone; icon?: Icon }> = {
  open: { label: "Open", tone: "neutral" },
  planning: { label: "Planning", tone: "live" },
  plan_review: { label: "Reviewing plan", tone: "live" },
  bidding: { label: "Bidding", tone: "live" },
  awarded: { label: "Awarded", tone: "brand" },
  requires_payment: { label: "Awaiting payment", tone: "warning", icon: "action" },
  executing: { label: "In progress", tone: "live" },
  judging: { label: "Judge reviewing", tone: "live" },
  synthesizing: { label: "Finalizing", tone: "live" },
  complete: { label: "Complete", tone: "success", icon: "done" },
  disputed: { label: "Rejected by judge", tone: "danger", icon: "rejected" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Couldn't complete", tone: "danger", icon: "rejected" },
};

const ICONS = {
  done: CheckCircle,
  rejected: XCircle,
  action: WarningCircle,
} as const;

export function StatusBadge({ status }: { status: TaskStatus | string | undefined }) {
  // status can be undefined briefly during reactive load, or hold a legacy
  // value written before the current union. Render a muted pill, never crash.
  const meta = (status && META[status as TaskStatus]) || {
    label: status ? String(status) : "Unknown",
    tone: "neutral" as PillTone,
  };
  const IconGlyph = meta.icon ? ICONS[meta.icon] : null;
  return (
    <Pill tone={meta.tone}>
      {IconGlyph && <IconGlyph size={13} weight="fill" aria-hidden="true" />}
      {meta.label}
    </Pill>
  );
}
