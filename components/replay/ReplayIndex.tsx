"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";
import { CaretRight } from "@phosphor-icons/react";
import { goalHeadline } from "@/lib/hive/replay-core";
import { formatMoney } from "@/lib/utils";

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
        No recorded DAGs yet.
      </div>
    );
  }

  return (
    <div className="stagger-children space-y-2">
      {rows.map((row) => {
        const total = row.accepts + row.rejects;
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
                    <Pill tone={row.status === "complete" ? "success" : "danger"}>
                      {row.status}
                    </Pill>
                    {row.rejects > 0 && (
                      <Pill tone="warning">
                        {row.rejects}/{total} rejected
                      </Pill>
                    )}
                    <span className="text-[11px] text-ink-muted">
                      {row.nodeCount} nodes · {formatMoney(row.spend)}
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
