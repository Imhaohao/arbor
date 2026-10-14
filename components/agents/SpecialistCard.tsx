"use client";

import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { statureFromReputation } from "@/lib/grove/treeling";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReputationChart } from "./ReputationChart";
import { formatMoney, formatScore, cn } from "@/lib/utils";
import type { SpecialistConfig } from "@/lib/types";
import {
  Broadcast,
  CheckCircle,
  Plug,
  ShieldWarning,
} from "@phosphor-icons/react";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
  total_disputes_lost: number;
}

interface RepEvent {
  _id: string;
  new_score: number;
  delta: number;
  event_type: string;
}

interface RepDimensionRow {
  speed_score: number;
  estimate_accuracy: number;
  quality_score: number;
  value_score: number;
  overall: number;
}

function averageDimensions(rows: RepDimensionRow[]) {
  if (rows.length === 0) return null;
  const acc = rows.reduce(
    (a, r) => ({
      speed: a.speed + r.speed_score,
      estimate: a.estimate + r.estimate_accuracy,
      quality: a.quality + r.quality_score,
      value: a.value + r.value_score,
      overall: a.overall + r.overall,
    }),
    { speed: 0, estimate: 0, quality: 0, value: 0, overall: 0 },
  );
  const n = rows.length;
  return {
    speed: acc.speed / n,
    estimate: acc.estimate / n,
    quality: acc.quality / n,
    value: acc.value / n,
    overall: acc.overall / n,
    tasks: n,
  };
}

type Integration = "mcp" | "mcp_auth" | "a2a" | "directory" | "soft";

function integrationOf(spec: SpecialistConfig): Integration {
  if (spec.mcp_endpoint) return spec.is_verified ? "mcp" : "mcp_auth";
  if (spec.a2a_endpoint) return "a2a";
  // A bare live-roster row has no hand-authored config and no catalog entry,
  // so its transport is unknown; distinct from an intentional "Soft" specialist.
  if (spec.discovered === true && !spec.discovery_source) return "directory";
  return "soft";
}

function IntegrationPill({ spec, kind }: { spec: SpecialistConfig; kind: Integration }) {
  switch (kind) {
    case "mcp":
      return (
        <Pill tone="success" title={`Verified MCP: ${spec.mcp_endpoint}`}>
          <CheckCircle size={12} weight="fill" />
          MCP
        </Pill>
      );
    case "mcp_auth":
      return (
        <Pill
          tone="warning"
          title={`MCP endpoint configured; set ${spec.mcp_api_key_env ?? "API key"} to use live tools`}
        >
          <ShieldWarning size={12} weight="fill" />
          Auth needed
        </Pill>
      );
    case "a2a":
      return (
        <Pill tone="info" title={`A2A endpoint: ${spec.a2a_endpoint}`}>
          <Broadcast size={12} weight="fill" />
          A2A
        </Pill>
      );
    case "directory":
      return (
        <Pill
          tone="neutral"
          title="Listed in the network directory; no integration details on file yet."
        >
          Directory only
        </Pill>
      );
    default:
      return (
        <Pill tone="neutral">
          <Plug size={12} />
          Soft
        </Pill>
      );
  }
}

function liveStanding(spec: SpecialistConfig, live: LiveAgent | undefined) {
  const score = live?.reputation_score ?? spec.starting_reputation;
  const completed = live?.total_tasks_completed ?? 0;
  const disputes = live?.total_disputes_lost ?? 0;
  return { score, completed, disputes, total: completed + disputes };
}

const SLEEPING: ReadonlySet<Integration> = new Set(["mcp_auth", "directory"]);
const VISIBLE_CAPABILITIES = 3;

export function SpecialistCard({
  spec,
  live,
}: {
  spec: SpecialistConfig;
  live: LiveAgent | undefined;
}) {
  const events = (useQuery(api.reputation.history, {
    agent_id: spec.agent_id,
  }) ?? []) as RepEvent[];
  const dimensionRows = (useQuery(api.reputationDimensions.forAgent, {
    agent_id: spec.agent_id,
  }) ?? []) as RepDimensionRow[];
  const dims = averageDimensions(dimensionRows);

  const { score, completed, disputes, total } = liveStanding(spec, live);
  const kind = integrationOf(spec);
  const hasTrackRecord = completed > 0 || dims !== null;

  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-4">
        <Treeling
          seed={spec.agent_id}
          capabilities={spec.capabilities}
          name={spec.display_name}
          stature={statureFromReputation(score)}
          asleep={SLEEPING.has(kind)}
          alive={false}
          size={hasTrackRecord ? 76 : 64}
        />
        <div className="min-w-0 flex-1 pb-1">
          <h3 className="type-subheading break-words text-ink">{spec.display_name}</h3>
          <p className="truncate text-[0.8125rem] text-ink-muted" title={spec.sponsor}>
            {spec.sponsor}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <IntegrationPill spec={spec} kind={kind} />
        {spec.mcp_endpoint && (
          <code
            className="type-data min-w-0 truncate text-xs text-ink-muted"
            title={spec.mcp_endpoint}
          >
            {endpointHost(spec.mcp_endpoint)}
          </code>
        )}
      </div>

      <p className="text-sm text-ink-soft">{spec.one_liner}</p>

      {hasTrackRecord && (
        <TrackRecord
          spec={spec}
          dims={dims}
          events={events}
          completed={completed}
          disputes={disputes}
          total={total}
        />
      )}

      <div className="mt-auto flex flex-col gap-4 pt-1">
        <CapabilityChips capabilities={spec.capabilities} />
        <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-[0.8125rem]">
          <div>
            <dt className="text-ink-muted">Reputation</dt>
            <dd className="type-data text-base text-ink">{formatScore(score)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Cost baseline</dt>
            <dd className="type-data text-base text-ink">{formatMoney(spec.cost_baseline)}</dd>
          </div>
        </dl>
        {!hasTrackRecord && (
          <p className="-mt-2 text-[0.8125rem] text-ink-muted">No judged work yet</p>
        )}
      </div>
    </Card>
  );
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function CapabilityChips({ capabilities }: { capabilities: string[] }) {
  const shown = capabilities.slice(0, VISIBLE_CAPABILITIES);
  const hidden = capabilities.length - shown.length;
  return (
    <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
      {shown.map((c) => (
        <li key={c} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-ink-soft">
          {c}
        </li>
      ))}
      {hidden > 0 && (
        <li
          className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-ink-muted"
          title={capabilities.slice(VISIBLE_CAPABILITIES).join(", ")}
        >
          +{hidden}
        </li>
      )}
    </ul>
  );
}

interface TrackRecordProps {
  spec: SpecialistConfig;
  dims: ReturnType<typeof averageDimensions>;
  events: RepEvent[];
  completed: number;
  disputes: number;
  total: number;
}

function TrackRecord({ spec, dims, events, completed, disputes, total }: TrackRecordProps) {
  const disputeRate = total === 0 ? 0 : (disputes / total) * 100;
  return (
    <div className="flex flex-col gap-4">
      {dims && <DimensionPanel dims={dims} />}
      <ReputationChart startingScore={spec.starting_reputation} events={events} />
      <dl className="grid grid-cols-3 gap-3 text-[0.8125rem]">
        <Stat label="Accepted" value={String(completed)} />
        <Stat label="Disputed" value={String(disputes)} />
        <Stat
          label="Dispute rate"
          value={total === 0 ? "n/a" : `${disputeRate.toFixed(0)}%`}
          danger={disputeRate >= 25}
        />
      </dl>
      {total > 0 && (
        <p className="text-[0.8125rem] text-ink-muted">
          Every judged task ends as accepted or disputed: {completed} accepted and{" "}
          {disputes} disputed out of {total} judged.
        </p>
      )}
    </div>
  );
}

function DimensionPanel({ dims }: { dims: NonNullable<ReturnType<typeof averageDimensions>> }) {
  return (
    <div className="rounded-control bg-surface-subtle p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DimensionBar label="Quality" value={dims.quality} />
        <DimensionBar label="Speed" value={dims.speed} />
        <DimensionBar label="Estimate accuracy" value={dims.estimate} />
        <DimensionBar label="Value" value={dims.value} />
      </div>
      <p className="mt-3 flex items-center justify-between text-[0.8125rem] text-ink-muted">
        <span>
          Overall <span className="type-data text-ink">{formatScore(dims.overall)}</span>
        </span>
        <span>
          {dims.tasks} task{dims.tasks === 1 ? "" : "s"} measured
        </span>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn("type-data mt-0.5 text-base", danger ? "text-danger-700" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="text-ink-muted">{label}</span>
        <span className="type-data text-ink">{formatScore(value)}</span>
      </div>
      <div className="score-bar mt-1">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
