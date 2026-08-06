"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
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

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EntryRow({ entry }: { entry: BlackboardEntry }) {
  const [open, setOpen] = useState(false);
  const gist = entry.gist?.trim() || entry.content.slice(0, 240);
  const truncated = entry.content.length > gist.length;

  return (
    <li className="rounded-xl bg-surface-subtle p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={KIND_TONE[entry.kind] ?? "neutral"}>{entry.kind}</Pill>
        {entry.namespace && <Pill tone="neutral">{entry.namespace}</Pill>}
        {entry.verification === "evidence_backed" && (
          <Pill tone="success">evidence-backed</Pill>
        )}
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          {entry.agent_id}
          {entry.node_id ? ` · ${entry.node_id}` : ""} ·{" "}
          {timeLabel(entry.created_at)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
        {open ? entry.content : gist}
        {truncated && !open && "…"}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-brand-700 hover:underline"
        >
          {open ? "Show gist" : "Show full entry"}
        </button>
      )}
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
  const shown = showAll ? ordered : ordered.slice(0, 8);

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
      {ordered.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm font-medium text-brand-700 hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${ordered.length}`}
        </button>
      )}
    </Card>
  );
}
