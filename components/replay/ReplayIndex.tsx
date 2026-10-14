"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { api } from "@/convex/_generated/api";
import { CaretRight, SealWarning } from "@phosphor-icons/react";
import { goalHeadline } from "@/lib/hive/replay-core";
import { formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, PillTone> = {
  complete: "success",
  failed: "danger",
  escalated: "warning",
};

/**
 * Coarse "how long ago" label. Good enough for a list where rows need to be
 * tellable apart at a glance: the exact second doesn't matter, only that two
 * rows a day apart don't look identical.
 */
function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.round(diff / DAY)}d ago`;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

function IndexMessage({ children, asleep = false }: { children: string; asleep?: boolean }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <Treeling seed="replay-index" asleep={asleep} alive={false} size={72} />
      <p className="type-body text-ink-muted">{children}</p>
    </Card>
  );
}

function RejectCount({ rejects, total }: { rejects: number; total: number }) {
  if (rejects === 0) {
    return (
      <div className="w-20 shrink-0 text-center sm:w-24">
        <div className="type-data text-2xl font-semibold text-ink-subtle">0</div>
        <div className="text-xs text-ink-muted">rejected</div>
      </div>
    );
  }
  return (
    <div className="w-20 shrink-0 text-center sm:w-24">
      <div className="type-data flex items-center justify-center gap-1.5 text-3xl font-semibold text-danger-700">
        <SealWarning size={20} weight="fill" aria-hidden />
        {rejects}
      </div>
      <div className="text-xs text-danger-700">of {total} rejected</div>
    </div>
  );
}

export function ReplayIndex() {
  const rows = useQuery(api.hiveReplay.recentReplays, { limit: 25 });

  if (rows === undefined) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading replays">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer h-24 rounded-card" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <IndexMessage asleep>No finished runs recorded yet. Post a task and its replay will show up here.</IndexMessage>;
  }

  return (
    <ul className="stagger-children space-y-3">
      {rows.map((row) => {
        const total = row.accepts + row.rejects;
        return (
          <li key={row.dag_id}>
            <Link href={`/replay/${row.dag_id}`} className="group block rounded-card outline-none focus-visible:shadow-ring">
              <Card interactive className="p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <RejectCount rejects={row.rejects} total={total} />
                  <div className="min-w-0 flex-1">
                    <p className="type-subheading line-clamp-2 text-ink">{goalHeadline(row.goal)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Pill tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Pill>
                      {row.goalRepeatCount > 1 && (
                        <Pill tone="neutral">+{row.goalRepeatCount - 1} more with this goal</Pill>
                      )}
                      <span className="text-[0.8125rem] text-ink-muted">
                        {row.nodeCount} {row.nodeCount === 1 ? "step" : "steps"}, {formatRelativeTime(row.created_at)}
                      </span>
                      {row.spend !== null && (
                        <span className="type-data text-[0.8125rem] text-ink-soft">{formatMoney(row.spend)}</span>
                      )}
                    </div>
                  </div>
                  <CaretRight
                    size={16}
                    weight="bold"
                    aria-hidden
                    className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-700"
                  />
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
