"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import type {
  TaskDoc,
  LifecycleEventDoc,
  BidReceivedPayload,
} from "@/lib/task-view";
import { useEffect, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

export function BidWindow({ task, events }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, task.bid_window_closes_at - now);
  const remainingSec = (remainingMs / 1000).toFixed(1);
  const totalMs = task.bid_window_seconds * 1000;
  const progressPct = Math.min(100, (1 - remainingMs / totalMs) * 100);
  const closed = remainingMs <= 0;

  const bidEvents = events
    .filter((e) => e.event_type === "bid_received")
    .map((e) => e.payload as unknown as BidReceivedPayload);
  const declineEvents = events
    .filter((e) => e.event_type === "bid_declined")
    .map((e) => e.payload as { agent_id: string; reason: string });

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Specialists responding"
        meta={
          closed ? (
            <Pill>Closed</Pill>
          ) : (
            <Pill tone="live">
              <span className="type-data">{remainingSec}s</span> left
            </Pill>
          )
        }
      />
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-200 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mb-5 text-sm text-ink-muted">
        Each specialist quotes privately. Prices stay hidden, even from this
        view, until the window closes, so nobody can undercut someone
        else&rsquo;s offer.
      </p>
      {bidEvents.length === 0 && !closed && (
        <div className="flex items-center gap-3 rounded-control bg-surface-muted p-4 text-sm text-ink-muted">
          <Treeling seed={task._id} size={44} asleep alive={false} />
          Waiting for offers
        </div>
      )}
      {bidEvents.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {bidEvents.map((bid) => (
            <BidderTile key={bid.bid_id} bid={bid} />
          ))}
        </ul>
      )}
      {declineEvents.length > 0 && <DeclinedList declines={declineEvents} />}
    </Card>
  );
}

function BidderTile({ bid }: { bid: BidReceivedPayload }) {
  return (
    <li
      className="flex animate-fade-up flex-col items-center rounded-control bg-surface-subtle px-2 pb-3 pt-4 text-center"
      title={`${bid.sponsor}: ${bid.capability_claim}`}
    >
      <Treeling seed={bid.agent_id} name={bid.agent_id} pose="raised" size={56} alive={false} />
      <span className="type-data mt-2 w-full truncate text-[0.8125rem] text-ink">{bid.agent_id}</span>
      <span className="w-full truncate text-xs text-ink-muted">{bid.sponsor}</span>
      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-soft">
        Sealed
        <span className="type-data text-ink-muted">~{bid.estimated_seconds}s</span>
      </span>
    </li>
  );
}

function DeclinedList({ declines }: { declines: Array<{ agent_id: string; reason: string }> }) {
  return (
    <details className="group mt-4 rounded-control bg-surface-muted">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <CaretRight size={14} weight="bold" className="transition-transform group-open:rotate-90" />
        {declines.length} declined to quote
      </summary>
      <ul className="space-y-2 px-4 pb-4">
        {declines.map((decline, index) => (
          <li key={`${decline.agent_id}-${index}`} className="flex items-start gap-3 text-[0.8125rem]">
            <Treeling seed={decline.agent_id} name={decline.agent_id} size={28} asleep alive={false} />
            <div className="min-w-0">
              <span className="type-data text-ink-soft">{decline.agent_id}</span>
              <p className="break-words text-ink-muted">{decline.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
