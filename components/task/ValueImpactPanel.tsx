"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { savingsDisplay } from "@/lib/honest-savings";
import { formatMoney } from "@/lib/utils";
import type {
  AuctionResolvedPayload,
  LifecycleEventDoc,
  TaskDoc,
} from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

const BASELINE_GENERALIST_SECONDS = 30 * 60;

/** Measured routing savings are routinely sub-cent; two-decimal money
 * formatting renders them all as $0.00 and hides the entire metric. */
function formatUsdFine(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 0.01) return formatMoney(n);
  return `$${n.toFixed(4)}`;
}

export function ValueImpactPanel({ task, events }: Props) {
  const resolved = events.find((e) => e.event_type === "auction_resolved");
  if (!resolved || typeof task.price_paid !== "number") return null;

  const payload = resolved.payload as unknown as AuctionResolvedPayload;
  const display = savingsDisplay(task);
  const estimatedSeconds = Math.max(1, payload.winner.estimated_seconds);
  const efficiencyLift = Math.max(
    0,
    Math.round(
      ((BASELINE_GENERALIST_SECONDS - estimatedSeconds) /
        BASELINE_GENERALIST_SECONDS) *
        100,
    ),
  );

  return (
    <Card className="animate-fade-up bg-brand-50">
      <CardHeader
        title="Specialist impact"
        meta={<span className="text-brand-700">ROI estimate</span>}
      />

      <div className="grid gap-3 md:grid-cols-3">
        {display.kind === "measured" ? (
          <Metric
            label="Routing saved you (measured)"
            value={formatUsdFine(display.saving_usd)}
            sub={`${formatUsdFine(display.frontier_cost_usd)} at frontier list vs ${formatUsdFine(display.actual_cost_usd)} actual`}
          />
        ) : (
          <Metric
            label="Budget unspent"
            value={
              display.budget_unspent_usd !== undefined
                ? formatMoney(display.budget_unspent_usd)
                : "—"
            }
            sub="not a savings figure; execution cost not measured for this run"
          />
        )}
        <Metric
          label="Efficiency improved"
          value={`${efficiencyLift}%`}
          sub={`vs. ${Math.round(BASELINE_GENERALIST_SECONDS / 60)} min generalist baseline`}
        />
        <Metric
          label="Specialized agent"
          value={payload.winner.agent_id}
          sub={`Estimated ${estimatedSeconds}s to first output`}
        />
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        {display.kind === "measured" ? (
          <>
            Savings are measured: the same tokens (
            {display.models.join(", ") || "routed model"}) priced at frontier
            list ({formatUsdFine(display.frontier_cost_usd)}) minus actual
            measured spend ({formatUsdFine(display.actual_cost_usd)}). List
            price, not an invoice.
          </>
        ) : (
          <>
            Unspent budget is your own headroom (max budget minus second-price
            payment), not a saving. A measured savings figure appears only when
            this run&apos;s execution cost was captured.
          </>
        )}{" "}
        Efficiency is an estimate from the winning specialist&apos;s quoted
        time.
      </p>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-2 truncate font-mono text-2xl font-semibold tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-1 text-xs text-ink-muted">{sub}</div>
    </div>
  );
}
