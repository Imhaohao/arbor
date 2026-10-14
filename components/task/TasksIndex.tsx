"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Card } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Treeling } from "@/components/grove/Treeling";
import { api } from "@/convex/_generated/api";
import { CaretRight, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { cn, formatMoney } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

// Mirrors the StatusBucket union + STATUS_BUCKETS grouping in
// convex/taskList.ts. Kept as a plain literal union here (rather than
// importing the convex module) to match how the rest of this surface
// consumes Convex-shaped data — through the generated `api` client, not by
// reaching into convex/*.ts from a client component.
type StatusBucket = "active" | "complete" | "rejected" | "failed" | "cancelled";

const FILTERS: Array<{ key: StatusBucket | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "complete", label: "Delivered" },
  { key: "rejected", label: "Rejected by judge" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

const ROW_LIMIT = 25;
const SEARCH_DEBOUNCE_MS = 300;

function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-surface px-6 py-12 text-center shadow-card">
      <Treeling seed="tasks-index-empty" size={80} asleep alive={false} />
      <div className="type-body max-w-[40ch] text-ink-muted">{children}</div>
      {action}
    </div>
  );
}

function TaskRowSkeleton() {
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="shimmer mb-3 h-6 w-28 rounded-full" />
      <div className="shimmer h-4 w-5/6 rounded-full" />
    </div>
  );
}

function TasksLoading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading tasks">
      {[0, 1, 2, 3, 4].map((i) => (
        <TaskRowSkeleton key={i} />
      ))}
    </div>
  );
}

type TaskRow = NonNullable<ReturnType<typeof useTaskRows>>[number];

function useTaskRows(bucket: StatusBucket | "all", search: string) {
  return useQuery(api.taskList.recentTasks, {
    limit: ROW_LIMIT,
    bucket: bucket === "all" ? undefined : bucket,
    search: search || undefined,
  });
}

function TaskRowLink({ row }: { row: TaskRow }) {
  return (
    <Link href={`/task/${row.task_id}`} className="group block rounded-card outline-none focus-visible:shadow-ring">
      <Card className="p-4 transition-[box-shadow] duration-200 group-hover:shadow-card-hover sm:p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={row.status} />
              <dl className="type-data flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                <div className="flex gap-1.5">
                  <dt className="font-sans">Budget</dt>
                  <dd>{formatMoney(row.max_budget)}</dd>
                </div>
                {row.price_paid !== undefined && (
                  <div className="flex gap-1.5">
                    <dt className="font-sans">Paid</dt>
                    <dd className="text-ink">{formatMoney(row.price_paid)}</dd>
                  </div>
                )}
              </dl>
            </div>
            <p className="truncate text-sm text-ink" title={row.prompt}>
              {row.prompt}
            </p>
          </div>
          <CaretRight
            size={16}
            weight="bold"
            className="shrink-0 text-ink-muted transition-[translate,color] group-hover:translate-x-1 group-hover:text-brand-700"
          />
        </div>
      </Card>
    </Link>
  );
}

function FilterChip({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[0.8125rem] font-medium transition-[box-shadow,background-color] duration-150 active:scale-[0.96]",
        active
          ? "bg-surface text-ink shadow-hairline-strong"
          : "bg-surface-muted text-ink-soft hover:bg-surface-sunken",
      )}
    >
      {active && <Check size={13} weight="bold" aria-hidden="true" />}
      {label}
      <span className={cn("type-data text-xs", active ? "text-ink-soft" : "text-ink-muted")}>
        {count === undefined ? "…" : count}
      </span>
    </button>
  );
}

/** Index of recently posted tasks, backed by live Convex data. Sub-steps
 * created by the planner are excluded — see convex/taskList.ts. Supports a
 * plain-language status filter and a prompt search, both evaluated
 * server-side over the full recent window (not just the rows on screen). */
export function TasksIndex() {
  const [bucket, setBucket] = useState<StatusBucket | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce search so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const counts = useQuery(api.taskList.taskStatusCounts, {});
  const rows = useTaskRows(bucket, search);

  const isFiltered = bucket !== "all" || search.length > 0;

  const clearFilters = () => {
    setBucket("all");
    setSearchInput("");
    setSearch("");
  };

  return (
    <div>
      <div className="mb-6 space-y-4">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search task prompts"
            aria-label="Search task prompts"
            className="h-11 w-full rounded-control border border-line-control/60 bg-surface pl-10 pr-3 text-sm text-ink outline-none transition-[box-shadow] placeholder:text-ink-subtle focus-visible:shadow-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((filter) => (
            <FilterChip
              key={filter.key}
              label={filter.label}
              count={filter.key === "all" ? counts?.total : counts?.buckets[filter.key]}
              active={bucket === filter.key}
              onSelect={() => setBucket(filter.key)}
            />
          ))}
        </div>

        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          Paid is usually less than budget: Arbor pays the runner-up bidder&rsquo;s
          price, and only for work the judge accepted.
        </p>
      </div>

      {rows === undefined ? (
        <TasksLoading />
      ) : rows.length === 0 ? (
        isFiltered ? (
          <EmptyState action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}>
            No tasks match this filter.
          </EmptyState>
        ) : (
          <EmptyState
            action={
              <Link href="/#post-task" className={buttonClasses({ variant: "primary" })}>
                Post a task
              </Link>
            }
          >
            No tasks have been posted yet. Post one and specialists will start quoting.
          </EmptyState>
        )
      ) : (
        <div className="stagger-children space-y-2">
          {rows.map((row) => (
            <TaskRowLink key={row.task_id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
