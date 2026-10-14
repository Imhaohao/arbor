"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
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
  done: { text: "text-moss-700", rail: "bg-moss-500" },
  running: { text: "text-ink", rail: "bg-glow" },
  waiting: { text: "text-ink-muted", rail: "bg-line-strong" },
  error: { text: "text-danger-700", rail: "bg-danger-500" },
} as const;

type Tone = keyof typeof TONE_STYLES;

function StatusIcon({ tone }: { tone: Tone }) {
  if (tone === "done") {
    return <CheckCircle size={16} weight="fill" className="text-moss-600" aria-hidden="true" />;
  }
  if (tone === "error") {
    return <WarningCircle size={16} weight="fill" className="text-danger-600" aria-hidden="true" />;
  }
  if (tone === "running") {
    return <CircleNotch size={16} weight="bold" className="animate-spin text-ink" aria-hidden="true" />;
  }
  return <Circle size={16} weight="regular" className="text-ink-subtle" aria-hidden="true" />;
}

function NodeStateLabel({ tone, label }: { tone: Tone; label: string }) {
  if (tone === "running") return <Pill tone="live">{label}</Pill>;
  return (
    <span className={`inline-flex items-center gap-1 text-[0.8125rem] font-medium ${TONE_STYLES[tone].text}`}>
      <StatusIcon tone={tone} />
      {label}
    </span>
  );
}

function NodeRow({ node }: { node: ProgressNode }) {
  const presentation = presentStatus(node.status);
  return (
    <div className="flex items-start gap-3 rounded-control bg-surface-muted p-3">
      {node.assigned_agent_id ? (
        <Treeling
          seed={node.assigned_agent_id}
          size={36}
          alive={false}
          lantern={presentation.tone === "running"}
          asleep={presentation.tone === "waiting"}
        />
      ) : (
        <span className="mt-0.5 shrink-0">
          <StatusIcon tone={presentation.tone} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-ink">
            {nodeLabel(node.node_id)}
          </span>
          <NodeStateLabel tone={presentation.tone} label={presentation.label} />
        </div>
        <p className="mt-1 line-clamp-2 text-[0.8125rem] text-ink-muted">
          {node.description}
        </p>
        <NodeMeta node={node} />
      </div>
    </div>
  );
}

function NodeMeta({ node }: { node: ProgressNode }) {
  const hasScore = typeof node.eval_score === "number";
  const hasCost = typeof node.cost_paid === "number";
  if (!node.assigned_agent_id && !hasScore && !hasCost) return null;
  return (
    <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
      {node.assigned_agent_id && (
        <dd className="type-data text-ink-soft">{node.assigned_agent_id}</dd>
      )}
      {hasScore && (
        <div className="flex gap-1">
          <dt>Judge</dt>
          <dd className="type-data text-ink-soft">{node.eval_score!.toFixed(2)}</dd>
        </div>
      )}
      {hasCost && (
        <dd className="type-data text-ink-soft">{formatMoney(node.cost_paid!)}</dd>
      )}
    </dl>
  );
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

  const progress = summarizeProgress(nodes);
  const elapsed = elapsedLabel(dag.created_at, now ?? dag.created_at);

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Agent pipeline"
        meta={<PipelineMeta progress={progress} dagId={dag._id} />}
      />

      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">
          {headlineFor(progress)}
        </span>
        <span className="type-data shrink-0 text-xs text-ink-muted">
          {progress.percent}%
        </span>
      </div>

      <SegmentedRail nodes={nodes} />

      <LevelList levels={progressLevels(nodes)} />

      <PipelineFootnote
        progress={progress}
        elapsed={elapsed}
        spend={totalSpend(nodes)}
      />
    </Card>
  );
}

type Progress = ReturnType<typeof summarizeProgress>;

function progressCountClass(progress: Progress) {
  if (progress.hasFailure) return "text-danger-700";
  if (progress.settled) return "text-moss-700";
  return "text-ink";
}

function PipelineMeta({
  progress,
  dagId,
}: {
  progress: Progress;
  dagId: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className={progressCountClass(progress)}>
        {progress.complete}/{progress.total} steps
      </span>
      <Link
        href={`/replay/${dagId}`}
        className="font-medium text-brand-700 underline underline-offset-2"
      >
        View replay
      </Link>
    </span>
  );
}

function SegmentedRail({ nodes }: { nodes: ProgressNode[] }) {
  return (
    <div className="mb-4 flex gap-1" aria-hidden>
      {nodes.map((node) => (
        <div
          key={node.node_id}
          className={`h-1.5 flex-1 rounded-full ${
            TONE_STYLES[presentStatus(node.status).tone].rail
          } ${isActive(node.status) ? "animate-soft-pulse" : ""}`}
        />
      ))}
    </div>
  );
}

function LevelList({ levels }: { levels: ProgressNode[][] }) {
  return (
    <ol className="space-y-3">
      {levels.map((level, levelIndex) => (
        <li key={levelIndex}>
          {level.length > 1 && (
            <div className="mb-1.5 text-[0.8125rem] font-medium text-ink-muted">
              In parallel
            </div>
          )}
          <div className={level.length > 1 ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
            {level.map((node) => (
              <NodeRow key={node.node_id} node={node} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function spendSentence(spend: number | undefined, completed: number) {
  if (spend === undefined) return " Spend appears as steps settle.";
  return ` Settled spend ${formatMoney(spend)} across ${completed} completed step${completed === 1 ? "" : "s"}.`;
}

function PipelineFootnote({
  progress,
  elapsed,
  spend,
}: {
  progress: Progress;
  elapsed: string | undefined;
  spend: number | undefined;
}) {
  return (
    <p className="mt-4 text-[0.8125rem] text-ink-muted">
      {/* Elapsed is only meaningful while work is in flight. On a settled DAG
          it measures time since the DAG row was created, which for an old task
          reads as a nonsense "Running 961h 3m". */}
      {!progress.settled && elapsed ? `Running ${elapsed}. ` : null}
      Steps on the same row run in parallel.
      {spendSentence(spend, progress.complete)}
    </p>
  );
}
