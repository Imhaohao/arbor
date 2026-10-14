"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface Props {
  dagId: string;
}

interface BlackboardEntry {
  _id: string;
  node_id?: string;
  agent_id: string;
  kind: string;
  namespace?: string;
  content: string;
  gist?: string;
  verification?: "evidence_backed" | "unverified";
  revision?: number;
  created_at: number;
}

const KIND_TONE: Record<string, "brand" | "success" | "info" | "neutral"> = {
  result: "success",
  decision: "brand",
  artifact: "info",
};

const COLLAPSED_COUNT = 8;

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EntryBadges({ entry }: { entry: BlackboardEntry }) {
  return (
    <>
      <Pill tone={KIND_TONE[entry.kind] ?? "neutral"}>{entry.kind}</Pill>
      {entry.namespace && <Pill tone="neutral">{entry.namespace}</Pill>}
      {entry.verification === "evidence_backed" && (
        <Pill tone="success">evidence-backed</Pill>
      )}
    </>
  );
}

function EntryAttribution({ entry }: { entry: BlackboardEntry }) {
  return (
    <dl className="type-data mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
      <dt className="sr-only">Agent</dt>
      <dd className="break-all">{entry.agent_id}</dd>
      {entry.node_id && (
        <>
          <dt className="sr-only">Step</dt>
          <dd className="break-all">{entry.node_id}</dd>
        </>
      )}
    </dl>
  );
}

function EntryRow({ entry }: { entry: BlackboardEntry }) {
  const [open, setOpen] = useState(false);
  const gist = entry.gist?.trim() || entry.content.slice(0, 240);
  const truncated = entry.content.length > gist.length;

  return (
    <li className="flex gap-3 rounded-control bg-surface-subtle p-3">
      <Treeling seed={entry.agent_id} size={36} alive={false} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <EntryBadges entry={entry} />
          <span className="ml-auto text-xs text-ink-muted">{timeLabel(entry.created_at)}</span>
        </div>
        <EntryAttribution entry={entry} />
        <p className="type-body mt-2 whitespace-pre-wrap break-words text-ink">
          {open ? entry.content : gist}
          {truncated && !open && "…"}
        </p>
        {truncated && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1 min-h-8 rounded-full text-[0.8125rem] font-medium text-brand-700 outline-none hover:underline focus-visible:shadow-ring"
          >
            {open ? "Show gist" : "Show full entry"}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Read-only view of the shared blackboard the agents wrote during this run:
 * every result, decision, and artifact pointer, in write order. This is the
 * coordination record behind the replay above it.
 */
export function BlackboardPanel({ dagId }: Props) {
  const entries = useQuery(api.scratchpad.forDag, {
    dag_id: dagId as Id<"hive_dags">,
  }) as BlackboardEntry[] | undefined;
  const [showAll, setShowAll] = useState(false);

  if (!entries || entries.length === 0) return null;

  const ordered = [...entries].sort((a, b) => a.created_at - b.created_at);
  const shown = showAll ? ordered : ordered.slice(0, COLLAPSED_COUNT);

  return (
    <Card>
      <CardHeader
        title="Agent blackboard"
        meta={`${entries.length} entr${entries.length === 1 ? "y" : "ies"} written during this run`}
      />
      <ul className="space-y-2">
        {shown.map((entry) => (
          <EntryRow key={entry._id} entry={entry} />
        ))}
      </ul>
      {ordered.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 min-h-10 rounded-full px-1 text-sm font-medium text-brand-700 outline-none hover:underline focus-visible:shadow-ring"
        >
          {showAll ? "Show fewer" : `Show all ${ordered.length}`}
        </button>
      )}
    </Card>
  );
}
