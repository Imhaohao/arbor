"use client";

import { useMemo } from "react";
import { SealCheck, WarningCircle } from "@phosphor-icons/react";
import { Pill, type PillTone } from "@/components/ui/Pill";
import type { AgentToolCallDoc } from "@/lib/task-view";
import type { SpecialistProvenance } from "@/lib/types";

export interface BidProbeDoc {
  _id: string;
  _creationTime: number;
  task_id: string;
  bid_id?: string;
  agent_id: string;
  public_tier: string; // "native-a2a" | "a2a-bridge" | "model-backed" | "not-a2a-yet"
  probe_status: "pass" | "fail" | "demo_lane";
  duration_ms: number;
  response_excerpt?: string;
  error_message?: string;
  created_at: number;
}

export interface ProbeReceiptPanelProps {
  probes: BidProbeDoc[];
  toolCalls: AgentToolCallDoc[];
  provenance?: SpecialistProvenance;
  winnerAgentId?: string;
}

const TIER_TONES: Record<string, PillTone> = {
  "native-a2a": "info",
  "a2a-bridge": "brand",
  "model-backed": "neutral",
};

function TierPill({ tier }: { tier: string }) {
  return <Pill tone={TIER_TONES[tier] ?? "neutral"}>{tier}</Pill>;
}

const STATUS_PILLS: Record<BidProbeDoc["probe_status"], { label: string; tone: PillTone }> = {
  pass: { label: "Pass", tone: "success" },
  fail: { label: "Fail", tone: "danger" },
  demo_lane: { label: "Demo lane", tone: "neutral" },
};

function ProbeStatus({ status }: { status: BidProbeDoc["probe_status"] }) {
  const { label, tone } = STATUS_PILLS[status];
  return <Pill tone={tone}>{label}</Pill>;
}

const ABSENT = <span className="italic text-ink-muted">none</span>;

export default function ProbeReceiptPanel({
  probes,
  toolCalls,
  provenance,
  winnerAgentId,
}: ProbeReceiptPanelProps) {
  const winnerCalls = useMemo(
    () =>
      winnerAgentId
        ? toolCalls.filter((tc) => tc.agent_id === winnerAgentId)
        : [],
    [toolCalls, winnerAgentId],
  );

  const receipt = useMemo(() => {
    if (!winnerAgentId) return null;
    const reversed = [...winnerCalls].reverse();
    const external_session_id =
      reversed.find((tc) => tc.external_session_id)?.external_session_id ??
      provenance?.external_session_id;
    const events_observed = winnerCalls.reduce(
      (sum, tc) => sum + (tc.events_observed ?? 0),
      0,
    );
    const artifact_present = winnerCalls.some((tc) => tc.artifact_present === true);
    const pr_url = reversed.find((tc) => tc.pr_url)?.pr_url;
    const artifact_hash = reversed.find((tc) => tc.artifact_hash)?.artifact_hash;
    return { external_session_id, events_observed, artifact_present, pr_url, artifact_hash };
  }, [winnerCalls, winnerAgentId, provenance]);

  const banner = useMemo(() => {
    if (!receipt) return null;
    const missing: string[] = [];
    if (!receipt.external_session_id) missing.push("session_id");
    if (!receipt.events_observed) missing.push("events_observed");
    if (!receipt.artifact_present) missing.push("artifact");
    if (missing.length === 0) {
      return { ok: true, label: "Fulfilled: receipt complete" };
    }
    return { ok: false, label: `Partial receipt, missing: ${missing.join(", ")}` };
  }, [receipt]);

  return (
    <div className="space-y-5 rounded-card bg-surface p-5 shadow-card">
      <h3 className="type-subheading text-ink">Capability probes</h3>

      {probes.length === 0 ? (
        <p className="text-[0.8125rem] text-ink-muted">No probes recorded.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[0.8125rem]">
            <thead className="text-ink-muted">
              <tr className="shadow-[0_1px_0_oklch(var(--line))]">
                <th scope="col" className="pb-2 pr-3 font-medium">Agent</th>
                <th scope="col" className="pb-2 pr-3 font-medium">Tier</th>
                <th scope="col" className="pb-2 pr-3 font-medium">Status</th>
                <th scope="col" className="pb-2 pr-3 font-medium">Duration</th>
                <th scope="col" className="pb-2 font-medium">Excerpt</th>
              </tr>
            </thead>
            <tbody>
              {probes.map((probe) => {
                const excerpt = probe.response_excerpt ?? probe.error_message ?? "";
                return (
                  <tr key={probe._id} className="align-top">
                    <td className="type-data max-w-[12rem] truncate py-2 pr-3 text-ink">{probe.agent_id}</td>
                    <td className="py-2 pr-3"><TierPill tier={probe.public_tier} /></td>
                    <td className="py-2 pr-3"><ProbeStatus status={probe.probe_status} /></td>
                    <td className="type-data whitespace-nowrap py-2 pr-3 text-ink-muted">{probe.duration_ms}ms</td>
                    <td className="type-data max-w-[16rem] truncate py-2 text-xs text-ink-muted" title={excerpt}>
                      {excerpt.length > 60 ? excerpt.slice(0, 60) + "…" : excerpt}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {receipt && <FulfillmentReceipt receipt={receipt} />}
      {banner && <ReceiptBanner ok={banner.ok} label={banner.label} />}
    </div>
  );
}

interface Receipt {
  external_session_id?: string;
  events_observed: number;
  artifact_present: boolean;
  pr_url?: string;
  artifact_hash?: string;
}

function FulfillmentReceipt({ receipt }: { receipt: Receipt }) {
  const hash = receipt.artifact_hash;
  return (
    <div className="space-y-2 pt-4 shadow-[0_-1px_0_oklch(var(--line))]">
      <h4 className="text-sm font-semibold text-ink">Fulfillment receipt</h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[0.8125rem]">
        <dt className="text-ink-muted">session_id</dt>
        <dd className="type-data min-w-0 break-all text-ink">{receipt.external_session_id ?? ABSENT}</dd>
        <dt className="text-ink-muted">events_observed</dt>
        <dd className="type-data text-ink">{receipt.events_observed}</dd>
        <dt className="text-ink-muted">artifact_present</dt>
        <dd className="type-data text-ink">{receipt.artifact_present ? "true" : "false"}</dd>
        <dt className="text-ink-muted">pr_url</dt>
        <dd className="type-data min-w-0 break-all text-ink">
          {receipt.pr_url ? (
            <a href={receipt.pr_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
              {receipt.pr_url}
            </a>
          ) : (
            ABSENT
          )}
        </dd>
        <dt className="text-ink-muted">artifact_hash</dt>
        <dd className="type-data min-w-0 truncate text-ink" title={hash ?? undefined}>
          {hash ? hash.slice(0, 32) + (hash.length > 32 ? "…" : "") : ABSENT}
        </dd>
      </dl>
    </div>
  );
}

function ReceiptBanner({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? SealCheck : WarningCircle;
  return (
    <div
      className={`flex items-center gap-2 rounded-control px-4 py-2.5 text-[0.8125rem] font-medium ${
        ok ? "bg-moss-50 text-moss-700" : "bg-warning-50 text-warning-700"
      }`}
    >
      <Icon size={16} weight="fill" aria-hidden="true" />
      {label}
    </div>
  );
}
