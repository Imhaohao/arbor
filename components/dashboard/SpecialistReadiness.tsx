"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";

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

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pass: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  needs_key: "bg-amber-50 text-amber-700 ring-amber-600/20",
  protocol_mismatch: "bg-orange-50 text-orange-700 ring-orange-600/20",
  endpoint_down: "bg-rose-50 text-rose-700 ring-rose-600/20",
  fail: "bg-rose-50 text-rose-700 ring-rose-600/20",
  declined: "bg-orange-50 text-orange-700 ring-orange-600/20",
  mock_only: "bg-slate-100 text-slate-600 ring-slate-500/20",
  needs_owner_action: "bg-violet-50 text-violet-700 ring-violet-600/20",
  skipped: "bg-slate-100 text-slate-500 ring-slate-500/20",
  not_applicable: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.skipped;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Stage({ label, status }: { label: string; status?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
      {label}
      <StatusPill status={status ?? "skipped"} />
    </span>
  );
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
      const status = row.readiness_status ?? row.transport_status;
      value[status] = (value[status] ?? 0) + 1;
    }
    return value;
  }, [rows]);

  const visible = (rows ?? []).filter((row) => {
    const status = row.readiness_status ?? row.transport_status;
    return filter === "all" || status === filter;
  });

  return (
    <Card className="mt-6 bg-white shadow-card">
      <CardHeader className="p-5 pb-0">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base font-semibold text-ink">
          <span>Agent readiness matrix</span>
          <span className="text-xs font-normal text-ink-muted">
            transport and per-agent smoke fitness
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-3">
        <div
          role={hiveModel?.status === "blocked" || hiveModelError ? "alert" : "status"}
          className={`mb-3 rounded-lg border px-3 py-2.5 text-xs ${
            hiveModelError || hiveModel?.status === "blocked"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : hiveModel?.status === "fallback"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : hiveModel
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-line bg-surface-muted text-ink-muted"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Hive model runtime</span>
            <span className="font-mono text-[11px]">
              {hiveModel
                ? `${hiveModel.provider} / ${hiveModel.model}`
                : hiveModelError
                  ? "check failed"
                  : "checking Convex..."}
            </span>
          </div>
          <p className="mt-1">
            {hiveModelError
              ? "Could not read model readiness from the Convex deployment."
              : hiveModel?.message ?? "Checking model keys in the Convex action runtime."}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          <span>
            {latestRun
              ? `Latest smoke: ${latestRun.processed_agents}/${latestRun.total_agents} processed, ${latestRun.ready_agents} ready (${latestRun.status})`
              : "No smoke run recorded."}
          </span>
          <code className="font-mono text-[10px]">npm run agents:smoke</code>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            const count = item.key === "all" ? (rows?.length ?? 0) : (counts[item.key] ?? 0);
            return (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-ink-muted hover:bg-surface-muted"
                }`}
              >
                {item.label}
                <span className="font-mono text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>

        {rows === undefined ? (
          <p className="py-6 text-center text-xs text-ink-muted">Loading readiness...</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-muted">
            No readiness data. Run <code className="font-mono">npm run agents:smoke</code>.
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-muted">No agents in this bucket.</p>
        ) : (
          <div className="max-h-[38rem] overflow-auto rounded-lg border border-line">
            <table className="min-w-[980px] w-full text-left">
              <thead className="sticky top-0 bg-surface-muted text-[10px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Owner / source</th>
                  <th className="px-3 py-2 font-medium">Transport</th>
                  <th className="px-3 py-2 font-medium">Smoke stages</th>
                  <th className="px-3 py-2 font-medium">Settlement</th>
                  <th className="px-3 py-2 font-medium">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => (
                  <tr key={row.agent_id} className="align-top text-xs">
                    <td className="max-w-48 px-3 py-3">
                      <p className="truncate font-medium text-ink">{row.agent_id}</p>
                      <p className="mt-1 truncate text-[10px] text-ink-muted">
                        {row.failure_bucket ?? "not run"}
                      </p>
                    </td>
                    <td className="max-w-48 px-3 py-3 text-ink-muted">
                      <p className="truncate">{row.owner ?? "unassigned"}</p>
                      <p className="mt-1 text-[10px]">{row.source}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-[11px] text-ink">{row.transport}</p>
                      <div className="mt-1"><StatusPill status={row.transport_status} /></div>
                      {row.required_key_env && (
                        <p className="mt-1 max-w-40 truncate font-mono text-[9px] text-ink-muted">
                          {row.required_key_env}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[360px] px-3 py-3">
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        <Stage label="probe" status={row.latest_probe_status} />
                        <Stage label="bid" status={row.last_bid_status} />
                        <Stage label="exec" status={row.last_exec_status} />
                        <Stage label="judge" status={row.latest_judge_status} />
                        <Stage label="eval" status={row.latest_eval_status} />
                        <Stage label="scratch" status={row.latest_scratchpad_status} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.settlement_eligible ? "pass" : "skipped"} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.readiness_status ?? row.transport_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
