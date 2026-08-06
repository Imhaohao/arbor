"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";
import { CaretRight } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/utils";

type TaskStatus =
  | "open"
  | "planning"
  | "plan_review"
  | "bidding"
  | "awarded"
  | "requires_payment"
  | "executing"
  | "judging"
  | "synthesizing"
  | "complete"
  | "disputed"
  | "cancelled"
  | "failed";

function statusTone(status: TaskStatus): PillTone {
  if (status === "complete") return "success";
  if (status === "disputed" || status === "failed" || status === "cancelled") {
    return "danger";
  }
  if (
    status === "bidding" ||
    status === "awarded" ||
    status === "requires_payment" ||
    status === "executing" ||
    status === "judging" ||
    status === "synthesizing"
  ) {
    return "brand";
  }
  return "neutral";
}

function statusLabel(status: TaskStatus): string {
  return status.replace(/_/g, " ");
}

/** Index of recently posted tasks, backed by live Convex data. Sub-steps
 * created by the planner are excluded — see convex/taskList.ts. */
export function TasksIndex() {
  const rows = useQuery(api.taskList.recentTasks, { limit: 25 });

  if (rows === undefined) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
        Loading tasks…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
        No tasks posted yet.
      </div>
    );
  }

  return (
    <div className="stagger-children space-y-2">
      {rows.map((row) => (
        <Link key={row.task_id} href={`/task/${row.task_id}`} className="group block">
          <Card className="p-4 group-hover:shadow-card-hover">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Pill tone={statusTone(row.status)} className="capitalize">
                    {statusLabel(row.status)}
                  </Pill>
                  <span className="text-[11px] text-ink-muted">
                    {row.task_type} · budget {formatMoney(row.max_budget)}
                    {row.price_paid !== undefined
                      ? ` · paid ${formatMoney(row.price_paid)}`
                      : ""}
                  </span>
                </div>
                <p className="truncate text-sm text-ink">{row.prompt}</p>
              </div>
              <CaretRight
                size={16}
                weight="bold"
                className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-700"
              />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
