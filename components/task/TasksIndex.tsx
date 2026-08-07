"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Card } from "@/components/ui/Card";
import { api } from "@/convex/_generated/api";
import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
      {children}
    </div>
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
  const rows = useQuery(api.taskList.recentTasks, {
    limit: ROW_LIMIT,
    bucket: bucket === "all" ? undefined : bucket,
    search: search || undefined,
  });

  const isFiltered = bucket !== "all" || search.length > 0;

  const clearFilters = () => {
    setBucket("all");
    setSearchInput("");
    setSearch("");
  };

  return (
    <div>
      <div className="mb-5 space-y-3">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search task prompts…"
            aria-label="Search task prompts"
            className="w-full rounded-xl bg-white py-2.5 pl-10 pr-3 text-sm text-ink shadow-hairline outline-none placeholder:text-ink-faint focus-visible:shadow-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const count = filter.key === "all" ? counts?.total : counts?.buckets[filter.key];
            const active = bucket === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setBucket(filter.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-tight transition-colors",
                  active
                    ? "bg-brand-600 text-white"
                    : "bg-surface-muted text-ink-soft hover:bg-surface-subtle",
                )}
              >
                {filter.label}
                <span className={cn("tabular-nums", active ? "text-white/70" : "text-ink-faint")}>
                  {count === undefined ? "…" : count}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-ink-muted">
          Paid is usually less than budget: Arbor pays the runner-up bidder&rsquo;s
          price, and only for work the judge accepted.
        </p>
      </div>

      {rows === undefined ? (
        <EmptyState>Loading tasks…</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>
          {isFiltered ? (
            <div className="space-y-2">
              <p>No tasks match this filter.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="font-medium text-brand-700 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            "No tasks posted yet."
          )}
        </EmptyState>
      ) : (
        <div className="stagger-children space-y-2">
          {rows.map((row) => (
            <Link key={row.task_id} href={`/task/${row.task_id}`} className="group block">
              <Card className="p-4 group-hover:shadow-card-hover">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} />
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
      )}
    </div>
  );
}
