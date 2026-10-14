"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { ReputationChart } from "@/components/agents/ReputationChart";
import { Check } from "@phosphor-icons/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { EmptyState, SkeletonRows, prettyAgent } from "@/components/dashboard/DashboardParts";
import { statureFromReputation } from "@/lib/grove/treeling";
import { currentPeriod } from "@/lib/hive/settlement-core";
import { formatMoney, formatScore } from "@/lib/utils";
import { readableError } from "@/lib/readable-error";

interface PayoutRow {
  owner_id: string;
  agent_id: string;
  tasks_won: number;
  tasks_lost: number;
  tasks_accepted: number;
  gross_volume: number;
  estimated_payout: number;
  reputation_end: number;
}

interface EscalationRow {
  _id: string;
  task_id: string;
  kind: "low_confidence" | "conflict_tie";
  reason: string;
  created_at: number;
}

interface RepEvent {
  new_score: number;
}

function formatDate(ms: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

const PAYOUT_COLUMNS = ["Won", "Accepted", "Lost", "Gross", "Payout", "Rep"];

function OwnerPicker({
  owners,
  owner,
  onPick,
}: {
  owners: string[];
  owner: string;
  onPick: (id: string) => void;
}) {
  if (owners.length === 0) {
    return <Pill className="type-data">{owner}</Pill>;
  }
  return (
    <div
      role="group"
      aria-label="Payout owner"
      className="flex max-w-full flex-wrap items-center gap-1 rounded-full bg-surface-muted p-1"
    >
      {owners.map((id) => {
        const selected = id === owner;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(id)}
            className={`type-data inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] active:scale-[0.96] ${
              selected
                ? "bg-surface font-medium text-ink shadow-hairline-strong"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {selected && <Check size={12} weight="bold" />}
            {id}
          </button>
        );
      })}
    </div>
  );
}

function PayoutRowView({ row }: { row: PayoutRow }) {
  const figures = [
    row.tasks_won,
    row.tasks_accepted,
    row.tasks_lost,
    formatMoney(row.gross_volume),
    formatMoney(row.estimated_payout),
    formatScore(row.reputation_end),
  ];
  return (
    <tr>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5">
          <Treeling
            seed={row.agent_id}
            stature={statureFromReputation(row.reputation_end)}
            alive={false}
            size={32}
          />
          <span className="font-medium text-ink">{prettyAgent(row.agent_id)}</span>
        </div>
      </td>
      {figures.map((value, i) => (
        <td key={PAYOUT_COLUMNS[i]} className="type-data py-2.5 pl-3 text-right text-ink">
          {value}
        </td>
      ))}
    </tr>
  );
}

function PayoutsTable({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-[0.8125rem] text-ink-muted">
          <tr>
            <th className="pb-2 font-medium">Agent</th>
            {PAYOUT_COLUMNS.map((column) => (
              <th key={column} className="pb-2 pl-3 text-right font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {payouts.map((row) => (
            <PayoutRowView key={row.agent_id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopAgentTrend({ topAgent, events }: { topAgent: PayoutRow; events: RepEvent[] }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{prettyAgent(topAgent.agent_id)}</span>
        <span className="type-data text-ink-muted">{formatMoney(topAgent.gross_volume)}</span>
      </div>
      <ReputationChart startingScore={topAgent.reputation_end} events={events} />
    </div>
  );
}

function PayoutsCard({
  payouts,
  topAgent,
  events,
  period,
}: {
  payouts: PayoutRow[] | undefined;
  topAgent: PayoutRow | undefined;
  events: RepEvent[];
  period: string;
}) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader title="Hive payouts" meta={`${period} accrual, estimated`} />
      {payouts === undefined ? (
        <SkeletonRows count={4} />
      ) : payouts.length === 0 ? (
        <EmptyState
          seed="hive-no-payouts"
          message="No settled tasks this period yet. Payouts accrue when a delivery is accepted."
          action={
            <Link href="/tasks" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              See tasks
            </Link>
          }
        />
      ) : (
        <PayoutsTable payouts={payouts} />
      )}
      {topAgent && <TopAgentTrend topAgent={topAgent} events={events} />}
    </Card>
  );
}

function EscalationItem({ row }: { row: EscalationRow }) {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <Pill tone="warning">{row.kind.replace("_", " ")}</Pill>
        <span className="shrink-0 text-xs text-ink-muted">{formatDate(row.created_at)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[0.8125rem] text-ink-muted">{readableError(row.reason)}</p>
      <Link
        href={`/task/${row.task_id}`}
        className="type-data mt-2 inline-block rounded-full text-xs font-medium text-brand-700 hover:text-brand-800"
      >
        {row.task_id}
      </Link>
    </li>
  );
}

const REVIEW_PREVIEW = 5;

function ReviewQueueCard({ escalations }: { escalations: EscalationRow[] | undefined }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Needs review"
        meta={escalations?.length ? <span className="type-data">{escalations.length}</span> : undefined}
      />
      <ReviewQueueBody escalations={escalations} />
    </Card>
  );
}

function ReviewQueueBody({ escalations }: { escalations: EscalationRow[] | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (escalations === undefined) return <SkeletonRows count={3} className="h-16" />;
  if (escalations.length === 0) {
    return (
      <EmptyState
        seed="hive-empty-review"
        message="Nothing awaiting review. Low-confidence and tied judgments land here."
      />
    );
  }
  const shown = expanded ? escalations : escalations.slice(0, REVIEW_PREVIEW);
  const hidden = escalations.length - shown.length;
  return (
    <>
      <ul className="divide-y divide-line">
        {shown.map((row) => (
          <EscalationItem key={row._id} row={row} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={buttonClasses({ variant: "soft", size: "sm", className: "mt-3 w-full" })}
        >
          Show {hidden} more
        </button>
      )}
    </>
  );
}

export function HivePayouts({ ownerId }: { ownerId?: string }) {
  const period = useMemo(() => currentPeriod(Date.now()), []);
  // No auth system in this app (no Clerk/session), so payouts are scoped by
  // owner_id selection rather than a signed-in user. Owners are derived from
  // the period's accrual; the default is the highest-volume owner.
  const summary = useQuery(api.settlement.payoutSummary, { period }) as
    | PayoutRow[]
    | undefined;
  const owners = useMemo(() => {
    if (!summary) return [] as string[];
    const gross = new Map<string, number>();
    for (const row of summary) {
      gross.set(row.owner_id, (gross.get(row.owner_id) ?? 0) + row.gross_volume);
    }
    return [...gross.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [summary]);
  const [picked, setPicked] = useState<string | null>(null);
  const owner = picked ?? ownerId ?? owners[0] ?? "agent:mcp";
  const payouts = useQuery(api.settlement.payoutsForOwner, {
    owner_id: owner,
    period,
  }) as PayoutRow[] | undefined;
  const escalations = useQuery(api.escalations.listOpen, {
    limit: 10,
  }) as EscalationRow[] | undefined;

  const topAgent = payouts
    ? [...payouts].sort((a, b) => b.gross_volume - a.gross_volume)[0]
    : undefined;
  const events = (useQuery(api.reputation.history, {
    agent_id: topAgent?.agent_id ?? "",
  }) ?? []) as RepEvent[];

  return (
    <section className="animate-fade-up [animation-delay:180ms]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="type-heading text-ink">Hive</h2>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            {period} payout accrual and human review queue.
          </p>
        </div>
        <OwnerPicker owners={owners} owner={owner} onPick={setPicked} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <PayoutsCard payouts={payouts} topAgent={topAgent} events={events} period={period} />
        <ReviewQueueCard escalations={escalations} />
      </div>
    </section>
  );
}
