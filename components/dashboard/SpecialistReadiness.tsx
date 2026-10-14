"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ComponentType } from "react";
import {
  ArrowsLeftRight,
  CheckCircle,
  Flask,
  Key,
  MinusCircle,
  Terminal,
  UserGear,
  WifiX,
  XCircle,
  type IconProps,
} from "@phosphor-icons/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { EmptyState, SkeletonRows } from "@/components/dashboard/DashboardParts";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ReadinessStatus =
  | "ready"
  | "needs_key"
  | "protocol_mismatch"
  | "endpoint_down"
  | "mock_only"
  | "needs_owner_action";

interface ReadinessRow {
  agent_id: string;
  source: string;
  transport: string;
  owner?: string;
  required_key_env?: string;
  transport_status: string;
  readiness_status?: string;
  latest_probe_status?: string;
  last_bid_status?: string;
  last_exec_status?: string;
  latest_judge_status?: string;
  latest_eval_status?: string;
  latest_scratchpad_status?: string;
  settlement_eligible?: boolean;
  failure_bucket?: string;
  latest_smoke_run_id?: string;
  note?: string;
  updated_at: number;
}

interface SmokeRun {
  run_id: string;
  mode: "probe" | "full";
  status: "running" | "complete" | "failed";
  total_agents: number;
  processed_agents: number;
  ready_agents: number;
  started_at: number;
}

interface HiveModelReadiness {
  status: "ready" | "fallback" | "blocked";
  provider: "anthropic" | "openrouter" | "openai" | "unavailable";
  model: string;
  missing_env: string[];
  message: string;
}

const FILTERS: Array<{ key: "all" | ReadinessStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "needs_key", label: "Needs key" },
  { key: "protocol_mismatch", label: "Protocol mismatch" },
  { key: "endpoint_down", label: "Endpoint down" },
  { key: "mock_only", label: "Mock only" },
  { key: "needs_owner_action", label: "Needs owner action" },
];

interface StatusMeta {
  tone: PillTone;
  Icon: ComponentType<IconProps>;
}

const STATUS_META: Record<string, StatusMeta> = {
  ready: { tone: "success", Icon: CheckCircle },
  pass: { tone: "success", Icon: CheckCircle },
  needs_key: { tone: "warning", Icon: Key },
  protocol_mismatch: { tone: "warning", Icon: ArrowsLeftRight },
  endpoint_down: { tone: "danger", Icon: WifiX },
  fail: { tone: "danger", Icon: XCircle },
  declined: { tone: "warning", Icon: XCircle },
  mock_only: { tone: "neutral", Icon: Flask },
  needs_owner_action: { tone: "info", Icon: UserGear },
  skipped: { tone: "neutral", Icon: MinusCircle },
  not_applicable: { tone: "neutral", Icon: MinusCircle },
};

const SKIPPED_META = STATUS_META.skipped;
const SMOKE_COMMAND = "npm run agents:smoke";

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function StatusPill({ status }: { status: string }) {
  const { tone, Icon } = STATUS_META[status] ?? SKIPPED_META;
  return (
    <Pill tone={tone}>
      <Icon size={14} weight="bold" aria-hidden />
      {statusLabel(status)}
    </Pill>
  );
}

const STAGE_TEXT_TONE: Record<PillTone, string> = {
  neutral: "text-ink-subtle",
  brand: "text-brand-700",
  success: "text-moss-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
  info: "text-brand-700",
  live: "text-ink",
};

function Stage({ label, status }: { label: string; status?: string }) {
  const resolved = status ?? "skipped";
  const { tone, Icon } = STATUS_META[resolved] ?? SKIPPED_META;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
      {label}
      <Icon size={14} weight="bold" className={STAGE_TEXT_TONE[tone]} aria-hidden />
      <span className="sr-only">{statusLabel(resolved)}</span>
    </span>
  );
}

function rowStatus(row: ReadinessRow) {
  return row.readiness_status ?? row.transport_status;
}

function modelBannerTone(model: HiveModelReadiness | undefined, failed: boolean) {
  if (failed || model?.status === "blocked") return "bg-danger-50 text-danger-700";
  if (model?.status === "fallback") return "bg-warning-50 text-warning-700";
  if (model) return "bg-moss-50 text-moss-700";
  return "bg-surface-muted text-ink-muted";
}

function modelBannerMessage(model: HiveModelReadiness | undefined, failed: boolean) {
  if (failed) return "Could not read model readiness from the Convex deployment. Check that the deployment is reachable and reload.";
  return model?.message ?? "Checking model keys in the Convex action runtime.";
}

function modelBannerLabel(model: HiveModelReadiness | undefined, failed: boolean) {
  if (model) return `${model.provider} / ${model.model}`;
  return failed ? "check failed" : "checking Convex...";
}

function HiveModelBanner({ model, failed }: { model?: HiveModelReadiness; failed: boolean }) {
  const urgent = failed || model?.status === "blocked";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn("mb-3 rounded-control px-4 py-3 text-[0.8125rem]", modelBannerTone(model, failed))}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Hive model runtime</span>
        <span className="type-data text-xs">{modelBannerLabel(model, failed)}</span>
      </div>
      <p className="mt-1">{modelBannerMessage(model, failed)}</p>
    </div>
  );
}

function SmokeSummary({ run }: { run: SmokeRun | null | undefined }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-muted px-4 py-3 text-[0.8125rem] text-ink-muted">
      <span>
        {run
          ? `Latest smoke: ${run.processed_agents}/${run.total_agents} processed, ${run.ready_agents} ready (${run.status})`
          : "No smoke run recorded."}
      </span>
      <code className="type-data inline-flex items-center gap-1.5 text-xs text-ink">
        <Terminal size={14} aria-hidden />
        {SMOKE_COMMAND}
      </code>
    </div>
  );
}

function FilterBar({
  filter,
  onChange,
  countFor,
}: {
  filter: "all" | ReadinessStatus;
  onChange: (key: "all" | ReadinessStatus) => void;
  countFor: (key: "all" | ReadinessStatus) => number;
}) {
  return (
    <div role="group" aria-label="Filter by readiness" className="mb-5 flex flex-wrap gap-1 rounded-[1.5rem] bg-surface-muted p-1">
      {FILTERS.map((item) => {
        const selected = filter === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] active:scale-[0.96]",
              selected ? "bg-surface font-medium text-ink shadow-hairline-strong" : "text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
            <span className="type-data text-xs">{countFor(item.key)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ReadinessTableRow({ row }: { row: ReadinessRow }) {
  const status = rowStatus(row);
  return (
    <tr className="align-top text-[0.8125rem]">
      <td className="max-w-56 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Treeling seed={row.agent_id} asleep={status !== "ready"} alive={false} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.agent_id}</p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">{row.failure_bucket ?? "not run"}</p>
          </div>
        </div>
      </td>
      <td className="max-w-48 px-4 py-3 text-ink-muted">
        <p className="truncate">{row.owner ?? "unassigned"}</p>
        <p className="mt-0.5 text-xs">{row.source}</p>
      </td>
      <td className="px-4 py-3">
        <p className="type-data text-xs text-ink">{row.transport}</p>
        <div className="mt-1.5">
          <StatusPill status={row.transport_status} />
        </div>
        {row.required_key_env && (
          <p className="type-data mt-1.5 max-w-40 truncate text-xs text-ink-muted">{row.required_key_env}</p>
        )}
      </td>
      <td className="max-w-[360px] px-4 py-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          <Stage label="probe" status={row.latest_probe_status} />
          <Stage label="bid" status={row.last_bid_status} />
          <Stage label="exec" status={row.last_exec_status} />
          <Stage label="judge" status={row.latest_judge_status} />
          <Stage label="eval" status={row.latest_eval_status} />
          <Stage label="scratch" status={row.latest_scratchpad_status} />
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusPill status={row.settlement_eligible ? "pass" : "skipped"} />
      </td>
      <td className="px-4 py-3">
        <StatusPill status={status} />
      </td>
    </tr>
  );
}

function ReadinessTable({ rows }: { rows: ReadinessRow[] }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Agent readiness table, scrollable"
      className="relative max-h-[38rem] overflow-auto rounded-control shadow-hairline outline-none focus-visible:shadow-ring"
    >
      <table className="w-full min-w-[980px] text-left">
        <thead className="sticky top-0 bg-surface-muted text-[0.8125rem] text-ink-muted">
          <tr>
            {["Agent", "Owner and source", "Transport", "Smoke stages", "Settlement", "Readiness"].map((heading) => (
              <th key={heading} className="px-4 py-2.5 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <ReadinessTableRow key={row.agent_id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessBody({
  rows,
  visible,
  onShowAll,
}: {
  rows: ReadinessRow[] | undefined;
  visible: ReadinessRow[];
  onShowAll: () => void;
}) {
  if (rows === undefined) return <SkeletonRows count={5} className="h-14" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        seed="readiness-no-data"
        message={`No readiness data yet. Run ${SMOKE_COMMAND} to probe every agent.`}
      />
    );
  }
  if (visible.length === 0) {
    return (
      <EmptyState
        seed="readiness-empty-bucket"
        message="No agents in this bucket."
        action={
          <Button variant="secondary" size="sm" onClick={onShowAll}>
            Show all agents
          </Button>
        }
      />
    );
  }
  return <ReadinessTable rows={visible} />;
}

export function SpecialistReadiness() {
  const rows = useQuery(api.agentReadiness.list, {}) as ReadinessRow[] | undefined;
  const latestRun = useQuery(api.agentReadiness.latestRun, {}) as
    | SmokeRun
    | null
    | undefined;
  const [filter, setFilter] = useState<"all" | ReadinessStatus>("all");
  const checkHiveModel = useAction(api.agentReadinessActions.getHiveModelReadiness);
  const [hiveModel, setHiveModel] = useState<HiveModelReadiness>();
  const [hiveModelError, setHiveModelError] = useState(false);

  useEffect(() => {
    let active = true;
    void checkHiveModel({})
      .then((result) => {
        if (active) setHiveModel(result as HiveModelReadiness);
      })
      .catch(() => {
        if (active) setHiveModelError(true);
      });
    return () => {
      active = false;
    };
  }, [checkHiveModel]);

  const counts = useMemo(() => {
    const value: Record<string, number> = {};
    for (const row of rows ?? []) {
      const status = rowStatus(row);
      value[status] = (value[status] ?? 0) + 1;
    }
    return value;
  }, [rows]);

  const visible = (rows ?? []).filter((row) => {
    const status = rowStatus(row);
    return filter === "all" || status === filter;
  });

  const countFor = (key: "all" | ReadinessStatus) =>
    key === "all" ? (rows?.length ?? 0) : (counts[key] ?? 0);

  return (
    <Card>
      <CardHeader title="Agent readiness matrix" meta="transport and per-agent smoke fitness" />
      <HiveModelBanner model={hiveModel} failed={hiveModelError} />
      <SmokeSummary run={latestRun} />
      <FilterBar filter={filter} onChange={setFilter} countFor={countFor} />
      <ReadinessBody rows={rows} visible={visible} onShowAll={() => setFilter("all")} />
    </Card>
  );
}
