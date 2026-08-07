"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";
import { CaretRight } from "@phosphor-icons/react";
import { goalHeadline } from "@/lib/hive/replay-core";
import { formatMoney } from "@/lib/utils";

const STATUS_TONE: Record<string, PillTone> = {
  complete: "success",
  failed: "danger",
  escalated: "warning",
};

/**
 * Coarse "how long ago" label. Good enough for a list where rows need to be
 * tellable apart at a glance — the exact second doesn't matter, only that two
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

export function ReplayIndex() {
  const rows = useQuery(api.hiveReplay.recentReplays, { limit: 25 });

  if (rows === undefined) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
        Loading replays…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
        No finished runs recorded yet.
      </div>
    );
  }

  return (
    <div className="stagger-children space-y-2">
      {rows.map((row) => {
        const total = row.accepts + row.rejects;
        const metaParts = [
          `${row.nodeCount} ${row.nodeCount === 1 ? "step" : "steps"}`,
          formatRelativeTime(row.created_at),
        ];
        if (row.spend !== null) metaParts.push(formatMoney(row.spend));

        return (
          <Link
            key={row.dag_id}
            href={`/replay/${row.dag_id}`}
            className="group block"
          >
            <Card className="p-4 group-hover:shadow-card-hover">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Pill tone={STATUS_TONE[row.status] ?? "neutral"}>
                      {row.status}
                    </Pill>
                    {row.rejects > 0 && (
                      <Pill tone="danger">
                        {row.rejects}/{total} rejected
                      </Pill>
                    )}
                    {row.goalRepeatCount > 1 && (
                      <Pill tone="neutral">
                        +{row.goalRepeatCount - 1} more with this same goal
                      </Pill>
                    )}
                    <span className="text-[11px] text-ink-muted">
                      {metaParts.join(" · ")}
                    </span>
                  </div>
                  <p className="truncate text-sm text-ink">
                    {goalHeadline(row.goal)}
                  </p>
                </div>
                <CaretRight
                  size={16}
                  weight="bold"
                  className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-700"
                />
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
