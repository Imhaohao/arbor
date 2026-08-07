import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatusBadge } from "./StatusBadge";
import { formatMoney } from "@/lib/utils";
import type { TaskDoc } from "@/lib/task-view";

export function TaskHeader({ task }: { task: TaskDoc }) {
  const isAgent = task.posted_by.startsWith("agent:");
  return (
    <Card className="animate-fade-up">
      {/* Stacks on phones: the metadata row and the budget column together
       * overflowed 390px and clipped the amount off the right edge. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <Pill tone={isAgent ? "info" : "neutral"}>
              {isAgent ? "Agent" : "Human"}
            </Pill>
            <span className="break-all font-mono">{task.posted_by}</span>
            <span className="text-ink-faint">·</span>
            <span>{task.task_type}</span>
          </div>
          <p className="text-base leading-relaxed text-ink">{task.prompt}</p>
        </div>
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
          <StatusBadge status={task.status} />
          <div className="text-right">
            <div className="text-xs text-ink-muted">Budget</div>
            <div className="font-mono text-lg font-semibold tracking-tight text-ink">
              {formatMoney(task.max_budget)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
