"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { CheckCircle, CircleNotch, XCircle } from "@phosphor-icons/react";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type {
  AgentToolCallDoc,
  TaskDoc,
  LifecycleEventDoc,
} from "@/lib/task-view";
import { MarkdownLite } from "./MarkdownLite";
import { LaunchProduct } from "./LaunchProduct";
import type { ExecutionArtifact, SpecialistProvenance } from "@/lib/types";
import ProbeReceiptPanel, { type BidProbeDoc } from "./ProbeReceiptPanel";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
  toolCalls: AgentToolCallDoc[];
  probes: BidProbeDoc[];
}

interface ResultShape {
  text: string;
  agent_id: string;
  artifact?: ExecutionArtifact;
  provenance?: SpecialistProvenance;
}

interface TierPresentation {
  label: string;
  tone: PillTone;
}

function tierPresentation(provenance: SpecialistProvenance): TierPresentation {
  const { tier, live_tools_called } = provenance;
  const count = provenance.successful_tool_call_count ?? 0;
  if (tier === "model-backed") return { label: "Model backed", tone: "info" };
  if (tier === "a2a-bridge") return { label: "A2A bridge", tone: "info" };
  if (provenance.transport === "mcp" && count > 0) {
    return { label: "Live MCP", tone: "success" };
  }
  if (tier === "not-a2a-yet") {
    return live_tools_called
      ? { label: "Live API", tone: "success" }
      : { label: "MCP fallback", tone: "warning" };
  }
  if (tier === "native-a2a") return { label: "A2A live", tone: "info" };
  return { label: "Mock", tone: "neutral" };
}

function TierBadge({ provenance }: { provenance?: SpecialistProvenance }) {
  if (!provenance) return null;
  const { label, tone } = tierPresentation(provenance);
  return <Pill tone={tone}>{label}</Pill>;
}

const CALL_STATUS_STYLE: Record<string, string> = {
  succeeded: "text-moss-700",
  failed: "text-danger-700",
};

function ToolCallRow({ call }: { call: AgentToolCallDoc }) {
  const StatusIcon = call.status === "succeeded" ? CheckCircle : call.status === "failed" ? XCircle : CircleNotch;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
      <span
        className={`inline-flex items-center gap-1 font-medium ${CALL_STATUS_STYLE[call.status] ?? "text-ink-muted"}`}
      >
        <StatusIcon size={14} weight="fill" aria-hidden="true" />
        {call.status}
      </span>
      <span className="type-data text-[0.8125rem] text-ink">
        {call.tool_name ?? call.method}
      </span>
      <span className="text-ink-muted">{call.endpoint_host}</span>
      {call.duration_ms !== undefined ? (
        <span className="type-data text-xs text-ink-muted">{call.duration_ms}ms</span>
      ) : null}
      {call.error_message ? (
        <span className="min-w-0 flex-1 truncate text-danger-700">
          {call.error_message}
        </span>
      ) : null}
    </li>
  );
}

function ProofSummary({
  provenance,
  toolCalls,
}: {
  provenance?: SpecialistProvenance;
  toolCalls: AgentToolCallDoc[];
}) {
  if (!provenance && toolCalls.length === 0) return null;
  const successful = toolCalls.filter((call) => call.status === "succeeded");
  const failed = toolCalls.filter((call) => call.status === "failed");
  const latest = [...toolCalls].slice(-6);
  const sessionId =
    provenance?.external_session_id ??
    [...toolCalls].reverse().find((call) => call.external_session_id)
      ?.external_session_id;
  const prUrl =
    provenance?.pr_url ?? [...toolCalls].reverse().find((call) => call.pr_url)?.pr_url;

  return (
    <div className="mt-5 pt-4 shadow-[0_-1px_0_0_oklch(var(--line))]">
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
        <div className="flex gap-1.5">
          <dt>Proof</dt>
          <dd className="text-ink">{provenance?.proof_level ?? "none"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Successful calls</dt>
          <dd className="type-data text-ink">{successful.length}</dd>
        </div>
        {failed.length > 0 ? (
          <div className="flex gap-1.5">
            <dt>Failed calls</dt>
            <dd className="type-data text-danger-700">{failed.length}</dd>
          </div>
        ) : null}
        {sessionId ? (
          <div className="flex gap-1.5">
            <dt>Session</dt>
            <dd className="type-data text-ink">{sessionId}</dd>
          </div>
        ) : null}
        {prUrl ? (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            PR opened
          </a>
        ) : provenance?.external_session_id ? (
          <span>PR missing</span>
        ) : null}
      </dl>
      {latest.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {latest.map((call) => (
            <ToolCallRow key={call._id} call={call} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isResult(v: unknown): v is ResultShape {
  return (
    !!v &&
      typeof v === "object" &&
      "text" in v &&
      typeof (v as Record<string, unknown>).text === "string"
  );
}

interface ExecutionEvents {
  started: LifecycleEventDoc | undefined;
  completed: LifecycleEventDoc | undefined;
  failed: LifecycleEventDoc | undefined;
}

function findExecutionEvents(events: LifecycleEventDoc[]): ExecutionEvents {
  return {
    started: events.find((e) => e.event_type === "execution_started"),
    completed: events.find((e) => e.event_type === "execution_complete"),
    failed: events.find((e) => e.event_type === "execution_failed"),
  };
}

function eventAgentId(event: LifecycleEventDoc | undefined) {
  return (event?.payload as { agent_id?: string } | undefined)?.agent_id;
}

function resolveAgentId(
  { started, completed, failed }: ExecutionEvents,
  result: ResultShape | undefined,
) {
  return (
    eventAgentId(failed) ??
    eventAgentId(completed) ??
    eventAgentId(started) ??
    result?.agent_id ??
    "winner"
  );
}

function runningSince({ started, completed, failed }: ExecutionEvents) {
  return started && !completed && !failed ? started.timestamp : undefined;
}

function hasExecutionEvidence(
  { started, completed, failed }: ExecutionEvents,
  hasDeliverable: boolean,
) {
  return Boolean(started || completed || failed || hasDeliverable);
}

function isSynthesizedResult(task: TaskDoc, agentId: string) {
  return (
    (Array.isArray(task.task_plan) && task.task_plan.length >= 2) ||
    agentId === "synthesizer"
  );
}

function resultText(result: ResultShape | undefined, rawResult: unknown) {
  if (result) return result.text;
  return rawResult ? JSON.stringify(rawResult, null, 2) : "";
}

const MCP_FORWARDER_AGENT_IDS = new Set([
  "reacher-social",
  "nia-context",
  "devin-engineer",
]);

interface RunningCopy {
  status: string;
  details: string[];
}

const DEVIN_RUNNING_COPY: RunningCopy = {
  status:
    "Creating a Devin bridge session and waiting for verifiable session or PR evidence.",
  details: [
    "Requires devin_session_create to return a session id.",
    "PR proof appears only after Arbor captures a verified PR URL.",
  ],
};

const MCP_RUNNING_COPY: RunningCopy = {
  status: "Forwarding to the live MCP server. Each tool call adds a few seconds.",
  details: [
    "Calling remote MCP tools and synthesizing the result.",
    "Will surface the final answer when the agent stops calling tools.",
  ],
};

const DEFAULT_RUNNING_COPY: RunningCopy = {
  status: "Generating the work product against the enriched context.",
  details: [
    "Reads the Hyperspell + Nia context packet from the prompt.",
    "Output streams in once execution_complete fires.",
  ],
};

function runningCopyFor(agentId: string): RunningCopy {
  if (agentId === "devin-engineer") return DEVIN_RUNNING_COPY;
  if (MCP_FORWARDER_AGENT_IDS.has(agentId)) return MCP_RUNNING_COPY;
  return DEFAULT_RUNNING_COPY;
}

function ExecutionFailed({
  agentId,
  failed,
}: {
  agentId: string;
  failed: LifecycleEventDoc;
}) {
  const reason =
    (failed.payload as { reason?: string }).reason ?? "unknown error";
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Execution"
        meta={<Pill tone="danger">Failed</Pill>}
      />
      <p role="alert" className="flex items-center gap-3 rounded-control bg-danger-50 p-3 text-sm text-danger-700">
        <Treeling seed={agentId} size={40} alive={false} asleep />
        <span className="min-w-0 [overflow-wrap:anywhere]"><span className="type-data text-ink">{agentId}</span> failed: {reason}.
        Escrow refunded.</span>
      </p>
    </Card>
  );
}

function ExecutionRunning({
  agentId,
  elapsed,
}: {
  agentId: string;
  elapsed: number;
}) {
  const { status, details } = runningCopyFor(agentId);
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Execution"
        meta={<Pill tone="live">Running</Pill>}
      />
      <LoadingProgress
        label={`${agentId} is working`}
        status={status}
        details={details}
        elapsedSeconds={elapsed}
        tone="brand"
      />
      <div className="mt-4 flex items-end gap-4">
        <Treeling seed={agentId} size={56} lantern pose="raised" label={`${agentId} is working`} />
        <div className="streaming-caret flex-1 space-y-2 pb-1">
          <div className="shimmer h-3 w-full rounded-full" />
          <div className="shimmer h-3 w-5/6 rounded-full" />
          <div className="shimmer h-3 w-2/3 rounded-full" />
        </div>
      </div>
    </Card>
  );
}

function CompleteMeta({
  task,
  agentId,
  isSynthesized,
  provenance,
}: {
  task: TaskDoc;
  agentId: string;
  isSynthesized: boolean;
  provenance: SpecialistProvenance | undefined;
}) {
  if (isSynthesized) {
    return (
      <Pill tone="success">
        Combined from {task.task_plan?.length ?? 0} steps
      </Pill>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <TierBadge provenance={provenance} />
      <Treeling seed={agentId} size={28} alive={false} />
      <span className="type-data text-ink">{agentId}</span>
    </span>
  );
}

function DeliverableBody({
  artifact,
  text,
}: {
  artifact: ExecutionArtifact | undefined;
  text: string;
}) {
  if (artifact?.kind === "campaign_launch") {
    return <LaunchProduct artifact={artifact} />;
  }
  if (text) return <MarkdownLite text={text} />;
  return <p className="text-sm text-ink-muted">No output captured</p>;
}

function ExecutionComplete({
  task,
  agentId,
  result,
  toolCalls,
  probes,
}: {
  task: TaskDoc;
  agentId: string;
  result: ResultShape | undefined;
  toolCalls: AgentToolCallDoc[];
  probes: BidProbeDoc[];
}) {
  const isSynthesized = isSynthesizedResult(task, agentId);
  const text = resultText(result, task.result);
  const provenance = result?.provenance;

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title={isSynthesized ? "Final deliverable" : "Execution complete"}
        meta={
          <CompleteMeta
            task={task}
            agentId={agentId}
            isSynthesized={isSynthesized}
            provenance={provenance}
          />
        }
      />
      {isSynthesized ? (
        <p className="type-body mb-4 text-ink-muted">
          This is the final answer to your request. It combines the work from
          every step of the plan above into one deliverable, not the raw
          output of a single specialist.
        </p>
      ) : null}
      <DeliverableBody artifact={result?.artifact} text={text} />
      {isSynthesized ? null : (
        <>
          <ProofSummary provenance={provenance} toolCalls={toolCalls} />
          <div className="mt-5">
            <ProbeReceiptPanel
              probes={probes}
              toolCalls={toolCalls}
              provenance={provenance}
              winnerAgentId={agentId}
            />
          </div>
        </>
      )}
    </Card>
  );
}

export function ExecutionPanel({ task, events, toolCalls, probes }: Props) {
  const executionEvents = findExecutionEvents(events);
  const elapsed = useElapsedSeconds(runningSince(executionEvents));

  const result = isResult(task.result) ? task.result : undefined;
  const hasDeliverable = !!result && result.text.trim().length > 0;

  // Multi-step parents never emit execution_started — their lifecycle is
  // task_posted -> plan_decided -> step_started (once per child) ->
  // execution_complete (from the synthesizer, once every child settles) ->
  // judge_verdict. Gating on `started` alone hid every finished multi-step
  // deliverable behind a null render. Render whenever there is any evidence
  // execution actually happened: a started/completed/failed event, or a
  // result the task is already holding.
  if (!hasExecutionEvidence(executionEvents, hasDeliverable)) return null;

  const agentId = resolveAgentId(executionEvents, result);

  if (executionEvents.failed) {
    return <ExecutionFailed agentId={agentId} failed={executionEvents.failed} />;
  }

  if (!executionEvents.completed && !hasDeliverable) {
    return <ExecutionRunning agentId={agentId} elapsed={elapsed} />;
  }

  return (
    <ExecutionComplete
      task={task}
      agentId={agentId}
      result={result}
      toolCalls={toolCalls}
      probes={probes}
    />
  );
}
