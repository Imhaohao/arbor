import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatusBadge } from "./StatusBadge";
import { formatMoney } from "@/lib/utils";
import type { TaskDoc } from "@/lib/task-view";

export function TaskHeader({ task }: { task: TaskDoc }) {
  const isAgent = task.posted_by.startsWith("agent:");
  return (
    <Card className="animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <StatusBadge status={task.status} />
        <Pill tone={isAgent ? "info" : "neutral"}>
          {isAgent ? "Posted by an agent" : "Posted by a person"}
        </Pill>
      </div>
      <p className="type-lead text-ink">{task.prompt}</p>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-control bg-surface-subtle p-4 text-sm sm:grid-cols-[auto_auto_minmax(0,1fr)]">
        <div>
          <dt className="text-[0.8125rem] text-ink-muted">Budget</dt>
          <dd className="type-data mt-0.5 text-lg font-semibold text-ink">
            {formatMoney(task.max_budget)}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] text-ink-muted">Task type</dt>
          <dd className="mt-0.5 text-ink">{task.task_type}</dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-[0.8125rem] text-ink-muted">Posted by</dt>
          <dd className="type-data mt-0.5 break-all text-xs text-ink-soft">{task.posted_by}</dd>
        </div>
      </dl>
    </Card>
  );
}
