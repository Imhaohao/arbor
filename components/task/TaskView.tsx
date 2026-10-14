"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { Treeling } from "@/components/grove/Treeling";
import { DagProgressPanel } from "./DagProgressPanel";
import { TaskHeader } from "./TaskHeader";
import { ContextEnrichmentPanel } from "./ContextEnrichmentPanel";
import { BidWindow } from "./BidWindow";
import { AuctionResolution } from "./AuctionResolution";
import { TaskPaymentPanel } from "./TaskPaymentPanel";
import { ValueImpactPanel } from "./ValueImpactPanel";
import { ExecutionPanel } from "./ExecutionPanel";
import { JudgeVerdictPanel } from "./JudgeVerdictPanel";
import { SettlementPanel } from "./SettlementPanel";
import { PlanPanel } from "./PlanPanel";
import { ConversionDropDemo } from "./ConversionDropDemo";
import { TikTokUploadPanel } from "./TikTokUploadPanel";
import { MediaArtifactsPanel } from "./MediaArtifactsPanel";
import { isConversionDropPrompt } from "@/lib/conversion-drop-demo";
import { useStickToLatest } from "@/lib/use-stick-to-latest";
import { ArrowDown } from "@phosphor-icons/react";
import type {
  AgentToolCallDoc,
  TaskDoc,
  EscrowDoc,
  LifecycleEventDoc,
} from "@/lib/task-view";
import type { BidProbeDoc } from "./ProbeReceiptPanel";

export function TaskView({ taskId }: { taskId: string }) {
  const id = taskId as Id<"tasks">;
  const task = useQuery(api.tasks.get, { task_id: id }) as
    | TaskDoc
    | null
    | undefined;
  const escrow = useQuery(api.escrow.forTask, { task_id: id }) as
    | EscrowDoc
    | null
    | undefined;
  const lifecycle = useQuery(api.lifecycle.forTask, { task_id: id }) as
    | LifecycleEventDoc[]
    | undefined;
  const toolCalls = useQuery(api.agentToolCalls.forTask, { task_id: id }) as
    | AgentToolCallDoc[]
    | undefined;
  const probes = useQuery(api.bidProbes.forTask, { task_id: id }) as
    | BidProbeDoc[]
    | undefined;

  if (task === undefined || lifecycle === undefined || toolCalls === undefined || probes === undefined) {
    return <TaskLoading />;
  }
  if (task === null) {
    return (
      <Card role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <Treeling seed={taskId} size={72} asleep alive={false} />
        <p className="type-body text-ink">This task does not exist or was removed.</p>
        <Link href="/tasks" className={buttonClasses({ variant: "secondary" })}>
          Browse all tasks
        </Link>
      </Card>
    );
  }

  // Prompts mentioning "conversion drop" route to the dedicated
  // diagnose-then-PR investigation view instead of the generic auction view.
  const isConversionDemo = isConversionDropPrompt(task.prompt);

  // Multi-step parent: show the plan + a final synthesis section. Sub-step
  // auctions/bids live on the child task pages (linked from PlanPanel).
  const isMultiStepParent =
    Array.isArray(task.task_plan) && task.task_plan.length >= 2;

  if (isConversionDemo) {
    return (
      <div className="space-y-5">
        <TaskHeader task={task} />
        <ConversionDropDemo task={task} events={lifecycle} />
      </div>
    );
  }

  return (
    <RegularTaskView
      task={task}
      escrow={escrow}
      lifecycle={lifecycle}
      toolCalls={toolCalls}
      probes={probes}
      taskId={taskId}
      isMultiStepParent={isMultiStepParent}
    />
  );
}

function RegularTaskView({
  task,
  escrow,
  lifecycle,
  toolCalls,
  probes,
  taskId,
  isMultiStepParent,
}: {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
  lifecycle: LifecycleEventDoc[];
  toolCalls: AgentToolCallDoc[];
  probes: BidProbeDoc[];
  taskId: string;
  isMultiStepParent: boolean;
}) {
  const { sentinelRef, hasNewBelow, scrollToLatest } = useStickToLatest(
    lifecycle.length,
  );

  return (
    <div className="space-y-5">
      <TaskHeader task={task} />
      <ContextEnrichmentPanel events={lifecycle} taskId={taskId} />
      <DagProgressPanel taskId={taskId} />
      {isMultiStepParent ? (
        <>
          <PlanPanel task={task} />
          <ExecutionPanel task={task} events={lifecycle} toolCalls={toolCalls} probes={probes} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
        </>
      ) : (
        <>
          <BidWindow task={task} events={lifecycle} />
          <AuctionResolution events={lifecycle} probes={probes} />
          <TaskPaymentPanel task={task} escrow={escrow ?? null} />
          <ValueImpactPanel task={task} events={lifecycle} />
          <ExecutionPanel task={task} events={lifecycle} toolCalls={toolCalls} probes={probes} />
          <JudgeVerdictPanel task={task} events={lifecycle} />
          <SettlementPanel
            task={task}
            escrow={escrow ?? null}
            events={lifecycle}
          />
        </>
      )}

      <MediaArtifactsPanel taskId={taskId} />
      <TikTokUploadPanel taskId={taskId} />

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {hasNewBelow && (
        <button
          type="button"
          onClick={scrollToLatest}
          className="fixed bottom-6 left-1/2 z-30 inline-flex -translate-x-1/2 animate-fade-up items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper shadow-float hover:bg-ink-soft active:scale-[0.96]"
        >
          <ArrowDown size={14} weight="bold" />
          See latest
        </button>
      )}
    </div>
  );
}

function TaskLoading() {
  return (
    <div className="animate-fade-in space-y-5" aria-busy="true">
      <Card>
        <div className="space-y-3">
          <div className="shimmer h-6 w-28 rounded-full" />
          <div className="shimmer h-5 w-3/4 rounded-full" />
          <div className="shimmer h-5 w-2/3 rounded-full" />
          <div className="shimmer mt-4 h-16 w-full rounded-control" />
        </div>
      </Card>
      <Card>
        <div className="space-y-3">
          <div className="shimmer h-5 w-40 rounded-full" />
          <div className="shimmer h-14 w-full rounded-control" />
          <div className="shimmer h-14 w-full rounded-control" />
        </div>
      </Card>
    </div>
  );
}
