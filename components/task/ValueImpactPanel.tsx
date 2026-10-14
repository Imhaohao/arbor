"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { savingsDisplay } from "@/lib/honest-savings";
import { formatMoney } from "@/lib/utils";
import {
  executionElapsedMs,
  type AuctionResolvedPayload,
  type LifecycleEventDoc,
  type TaskDoc,
} from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

/** Measured routing savings are routinely sub-cent; two-decimal money
 * formatting renders them all as $0.00 and hides the entire metric. */
function formatUsdFine(n: number): string {
  if (!Number.isFinite(n)) return "Not measured";
  if (Math.abs(n) >= 0.01) return formatMoney(n);
  return `$${n.toFixed(4)}`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 90_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

export function ValueImpactPanel({ task, events }: Props) {
  const resolved = events.find((e) => e.event_type === "auction_resolved");
  if (!resolved || typeof task.price_paid !== "number") return null;

  const payload = resolved.payload as unknown as AuctionResolvedPayload;
  const display = savingsDisplay(task);
  const estimatedSeconds = Math.max(1, payload.winner.estimated_seconds);
  const elapsedMs = executionElapsedMs(events);

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Specialist impact"
        meta="ROI estimate"
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
                : "Not measured"
            }
            sub="not a savings figure; execution cost not measured for this run"
          />
        )}
        <Metric
          label="Execution time (measured)"
          value={elapsedMs !== undefined ? formatElapsed(elapsedMs) : "Not measured"}
          sub={`specialist quoted ${estimatedSeconds}s`}
        />
        <Metric
          label="Specialized agent"
          value={payload.winner.agent_id}
          sub={`Estimated ${estimatedSeconds}s to first output`}
        />
      </div>

      <p className="mt-4 max-w-[70ch] text-[0.8125rem] text-ink-muted">
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
        Execution time is measured from lifecycle events; the quoted figure is
        the specialist&apos;s own pre-award estimate.
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
    <dl className="rounded-control bg-surface-muted p-4">
      <dt className="text-[0.8125rem] font-medium text-ink-muted">{label}</dt>
      <dd className="type-data mt-2 truncate text-2xl font-semibold text-ink">
        {value}
      </dd>
      <dd className="mt-1 text-[0.8125rem] text-ink-muted">{sub}</dd>
    </dl>
  );
}
