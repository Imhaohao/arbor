"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CheckCircle,
  CircleNotch,
  Circle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  elapsedLabel,
  headlineFor,
  isActive,
  nodeLabel,
  presentStatus,
  progressLevels,
  summarizeProgress,
  totalSpend,
  type ProgressNode,
} from "@/lib/hive/dag-progress-core";
import { formatMoney } from "@/lib/utils";

interface Props {
  taskId: string;
}

const TONE_STYLES = {
  done: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rail: "bg-emerald-500",
  },
  running: {
    chip: "bg-brand-50 text-brand-700 ring-brand-200",
    rail: "bg-brand-500",
  },
  waiting: {
    chip: "bg-slate-50 text-slate-500 ring-slate-200",
    rail: "bg-slate-200",
  },
  error: {
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    rail: "bg-rose-500",
  },
} as const;

function StatusIcon({ tone }: { tone: keyof typeof TONE_STYLES }) {
  if (tone === "done") {
    return <CheckCircle size={16} weight="fill" className="text-emerald-600" />;
  }
  if (tone === "error") {
    return <WarningCircle size={16} weight="fill" className="text-rose-600" />;
  }
  if (tone === "running") {
    return (
      <CircleNotch size={16} weight="bold" className="animate-spin text-brand-600" />
    );
  }
  return <Circle size={16} weight="regular" className="text-slate-300" />;
}

/**
 * Live per-agent progress for a hive DAG.
 *
 * Renders nothing when the task has no DAG — most tasks are single-node and this
 * panel would just be an empty box. Both queries it uses (`dagForRootTask`,
 * `nodesForDag`) are already public, and Convex's useQuery is reactive, so node
 * status updates stream in without polling.
 *
 * Nodes are grouped into dependency levels so parallel work reads as parallel:
 * in the media pipeline, video generation and music sit side by side under the
 * creative brief rather than appearing as a misleading sequential list.
 */
export function DagProgressPanel({ taskId }: Props) {
  const dag = useQuery(api.hiveData.dagForRootTask, {
    task_id: taskId as Id<"tasks">,
  });
  const nodes = useQuery(
    api.hiveData.nodesForDag,
    dag ? { dag_id: dag._id } : "skip",
  ) as ProgressNode[] | undefined;

  // Local clock so the elapsed timer advances without a server round-trip.
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    // Set on mount rather than during render: Date.now() at render time differs
    // between server and client and trips hydration.
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (dag === undefined || nodes === undefined) return null;
  if (dag === null || nodes.length === 0) return null;

  const levels = progressLevels(nodes);
  const progress = summarizeProgress(nodes);
  const spend = totalSpend(nodes);
  const elapsed = elapsedLabel(dag.created_at, now ?? dag.created_at);

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Agent pipeline"
        meta={
          <span
            className={
              progress.hasFailure
                ? "text-rose-700"
                : progress.settled
                  ? "text-emerald-700"
                  : "text-brand-700"
            }
          >
            {progress.complete}/{progress.total} steps
          </span>
        }
      />

      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">
          {headlineFor(progress)}
        </span>
        <span className="shrink-0 font-mono text-xs text-ink-muted">
          {progress.percent}%
        </span>
      </div>

      {/* Segmented rail: one segment per node, so a failed step stays visible
          instead of being averaged into a single green bar. */}
      <div className="mb-4 flex gap-1" aria-hidden>
        {nodes.map((node) => (
          <div
            key={node.node_id}
            className={`h-1.5 flex-1 rounded-full ${
              TONE_STYLES[presentStatus(node.status).tone].rail
            } ${isActive(node.status) ? "animate-pulse" : ""}`}
          />
        ))}
      </div>

      <ol className="space-y-3">
        {levels.map((level, levelIndex) => (
          <li key={levelIndex}>
            {level.length > 1 && (
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                In parallel
              </div>
            )}
            <div
              className={
                level.length > 1
                  ? "grid gap-2 sm:grid-cols-2"
                  : "grid gap-2"
              }
            >
              {level.map((node) => {
                const presentation = presentStatus(node.status);
                const styles = TONE_STYLES[presentation.tone];
                return (
                  <div
                    key={node.node_id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">
                        <StatusIcon tone={presentation.tone} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">
                            {nodeLabel(node.node_id)}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${styles.chip}`}
                          >
                            {presentation.label}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                          {node.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                          {node.assigned_agent_id && (
                            <span className="font-mono">
                              {node.assigned_agent_id}
                            </span>
                          )}
                          {typeof node.eval_score === "number" && (
                            <span>judge {node.eval_score.toFixed(2)}</span>
                          )}
                          {typeof node.cost_paid === "number" && (
                            <span>{formatMoney(node.cost_paid)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-ink-muted">
        {/* Elapsed is only meaningful while work is in flight. On a settled DAG
            it measures time since the DAG row was created, which for an old task
            reads as a nonsense "Running 961h 3m". */}
        {!progress.settled && elapsed ? `Running ${elapsed}. ` : null}
        Steps on the same row run in parallel.
        {spend !== undefined
          ? ` Settled spend ${formatMoney(spend)} across ${progress.complete} completed step${progress.complete === 1 ? "" : "s"}.`
          : " Spend appears as steps settle."}
      </p>
    </Card>
  );
}
