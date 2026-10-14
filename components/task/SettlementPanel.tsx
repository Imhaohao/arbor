"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import { formatMoney, cn } from "@/lib/utils";
import type {
  EscrowDoc,
  LifecycleEventDoc,
  SettledPayload,
  TaskDoc,
} from "@/lib/task-view";
import { Treeling } from "@/components/grove/Treeling";
import { ArrowRight, ArrowLeft } from "@phosphor-icons/react/dist/ssr";

interface Props {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
  events: LifecycleEventDoc[];
}

function latestSettledEvent(events: LifecycleEventDoc[]) {
  return events
    .filter((e) => e.event_type === "settled")
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

function SettlingCard({ elapsed }: { elapsed: number }) {
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Settlement"
        meta={<Pill tone="live">Settling</Pill>}
      />
      <LoadingProgress
        label="Releasing escrow and applying reputation"
        status="Updating the escrow ledger and writing the reputation delta to the agent's record."
        elapsedSeconds={elapsed}
        tone="info"
      />
    </Card>
  );
}

function ReputationUpdate({ payload }: { payload: SettledPayload }) {
  return (
    <dl className="flex items-center justify-between gap-4 rounded-control bg-surface-subtle p-4">
      <div className="min-w-0">
        <dt className="text-[0.8125rem] text-ink-muted">Reputation update</dt>
        <dd className="type-data mt-0.5 truncate text-sm text-ink">{payload.seller_id}</dd>
      </div>
      <div className="shrink-0">
        <dt className="sr-only">Reputation change</dt>
        <dd className="type-data flex shrink-0 items-center gap-3">
        <span
          className={cn(
            "animate-value-pop text-lg font-semibold",
            payload.delta >= 0 ? "text-moss-700" : "text-danger-600",
          )}
        >
          {payload.delta >= 0 ? "+" : ""}
          {payload.delta.toFixed(3)}
        </span>
        <ArrowRight size={14} weight="bold" className="text-ink-subtle" />
        <span className="text-ink">{payload.new_score.toFixed(2)}</span>
        </dd>
      </div>
    </dl>
  );
}

function SettlementFlow({
  amount,
  buyerId,
  payload,
}: {
  amount: number;
  buyerId: string;
  payload: SettledPayload;
}) {
  const released = payload.escrow === "released";
  return (
      <div className="mb-5 grid grid-cols-1 items-center gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Stop label="Buyer" sub={buyerId} />
        <Arrow amount={amount} direction={released ? "forward" : "backward"} />
        <Stop
          label={released ? "Seller" : "Buyer (refund)"}
          sub={released ? payload.seller_id : buyerId}
          highlight={released}
          seed={released ? payload.seller_id : undefined}
        />
      </div>
  );
}

function SettledCard({
  task,
  escrow,
  payload,
}: {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
  payload: SettledPayload;
}) {
  const released = payload.escrow === "released";
  const amount = payload.price_paid ?? task.price_paid ?? escrow?.locked_amount ?? 0;
  const buyerId = escrow?.buyer_id ?? "none";

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Settlement"
        meta={
          <Pill tone={released ? "success" : "danger"}>
            {released ? "Released" : "Refunded"}
          </Pill>
        }
      />

      <SettlementFlow amount={amount} buyerId={buyerId} payload={payload} />

      <ReputationUpdate payload={payload} />
    </Card>
  );
}

export function SettlementPanel({ task, escrow, events }: Props) {
  const settled = latestSettledEvent(events);
  // Settlement runs after the verdict lands. Show a brief spinner during
  // that gap so the page never sits silently.
  const verdictLanded = events.find((e) => e.event_type === "judge_verdict");
  const elapsed = useElapsedSeconds(
    verdictLanded && !settled ? verdictLanded.timestamp : undefined,
  );

  if (!settled) {
    return verdictLanded ? <SettlingCard elapsed={elapsed} /> : null;
  }

  return (
    <SettledCard
      task={task}
      escrow={escrow}
      payload={settled.payload as unknown as SettledPayload}
    />
  );
}

function Stop({
  label,
  sub,
  highlight = false,
  seed,
}: {
  label: string;
  sub: string;
  highlight?: boolean;
  seed?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-control p-3 text-left",
        highlight ? "bg-brand-50" : "bg-surface-subtle",
      )}
    >
      {seed && <Treeling seed={seed} size={40} alive={false} />}
      <dl className="min-w-0">
        <dt className="text-[0.8125rem] text-ink-muted">{label}</dt>
        <dd className="type-data mt-0.5 truncate text-sm text-ink">{sub}</dd>
      </dl>
    </div>
  );
}

function Arrow({
  amount,
  direction,
}: {
  amount: number;
  direction: "forward" | "backward";
}) {
  const Icon = direction === "forward" ? ArrowRight : ArrowLeft;
  return (
    <div className="flex flex-col items-center justify-center text-[0.8125rem] text-ink-muted">
      <div className="type-data text-sm font-semibold text-ink">{formatMoney(amount)}</div>
      <Icon size={20} weight="bold" className="my-1 rotate-90 text-brand-600 sm:rotate-0" />
      <div>{direction === "forward" ? "Released" : "Refunded"}</div>
    </div>
  );
}
