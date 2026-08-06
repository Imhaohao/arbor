"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";

/* ------------------------------------------------------------------ */
/* Agent-to-agent negotiations                                         */
/* ------------------------------------------------------------------ */

interface NegotiationContext {
  context_id: string;
  turn_count: number;
  last_role: "counterparty" | "agent";
  last_text: string;
  last_intent?: string;
  requester_agent_id?: string;
  last_created_at: number;
}

interface NegotiationTurn {
  role: "counterparty" | "agent";
  text: string;
  intent?: string;
  created_at: number;
}

function when(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NegotiationTranscript({ contextId }: { contextId: string }) {
  const turns = useQuery(api.a2aNegotiations.listByContext, {
    context_id: contextId,
  }) as NegotiationTurn[] | undefined;

  if (!turns) {
    return <p className="px-1 py-2 text-xs text-ink-muted">Loading transcript…</p>;
  }
  return (
    <ul className="mt-2 space-y-2 border-t border-black/5 pt-2">
      {turns.map((turn, i) => (
        <li
          key={i}
          className={turn.role === "agent" ? "flex justify-end" : "flex justify-start"}
        >
          <div
            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
              turn.role === "agent"
                ? "bg-brand-50 text-brand-900"
                : "bg-surface-muted text-ink"
            }`}
          >
            <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wide text-ink-muted">
              {turn.role === "agent" ? "arbor arbitrator" : "counterparty"}
              {turn.intent ? ` · ${turn.intent}` : ""} · {when(turn.created_at)}
            </span>
            <p className="whitespace-pre-wrap break-words">{turn.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NegotiationsSection() {
  const contexts = useQuery(api.a2aNegotiations.recentContexts, {}) as
    | NegotiationContext[]
    | undefined;
  const [openContext, setOpenContext] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="Agent negotiations"
        meta="autonomous A2A threads on the market gateway"
      />
      {contexts === undefined && (
        <p className="text-sm text-ink-muted">Loading…</p>
      )}
      {contexts?.length === 0 && (
        <p className="text-sm text-ink-muted">
          No agent-to-agent negotiations recorded yet. Threads appear here when
          a foreign agent negotiates with the arbitrator over the A2A market
          gateway.
        </p>
      )}
      <ul className="space-y-2">
        {contexts?.map((c) => (
          <li key={c.context_id} className="rounded-xl bg-surface-subtle p-3">
            <button
              type="button"
              onClick={() =>
                setOpenContext(openContext === c.context_id ? null : c.context_id)
              }
              className="block w-full text-left"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Pill tone={c.last_role === "agent" ? "brand" : "neutral"}>
                  {c.turn_count} turn{c.turn_count === 1 ? "" : "s"}
                </Pill>
                {c.last_intent && <Pill tone="info">{c.last_intent}</Pill>}
                <span className="font-mono text-[11px] text-ink-muted">
                  {c.requester_agent_id ?? c.context_id.slice(0, 18)} ·{" "}
                  {when(c.last_created_at)}
                </span>
              </span>
              <span className="mt-1.5 block truncate text-sm text-ink">
                {c.last_text}
              </span>
            </button>
            {openContext === c.context_id && (
              <NegotiationTranscript contextId={c.context_id} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Trilemma / corpus telemetry                                         */
/* ------------------------------------------------------------------ */

interface CorpusCounts {
  eval_rows: number;
  distinct_nodes: number;
  distinct_agents: number;
  nodes_with_2plus_agents: number;
  comparable_pairs: number;
  golden_task_runs: number;
  labelled_bids: number;
  cost_accuracy_points: number;
}

const STAT_LABELS: Array<{ key: keyof CorpusCounts; label: string; need?: number }> = [
  { key: "eval_rows", label: "Judge evaluations" },
  { key: "distinct_agents", label: "Agents evaluated" },
  { key: "comparable_pairs", label: "Comparable pairs", need: 500 },
  { key: "golden_task_runs", label: "Golden task runs", need: 100 },
  { key: "labelled_bids", label: "Labelled bids", need: 200 },
  { key: "cost_accuracy_points", label: "Cost-accuracy points", need: 50 },
];

function TelemetrySection() {
  const counts = useQuery(api.trilemma.corpusCounts, {}) as
    | CorpusCounts
    | undefined;

  return (
    <Card>
      <CardHeader
        title="Routing telemetry corpus"
        meta="what the trilemma metrics can be trained on today"
      />
      {counts === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STAT_LABELS.map(({ key, label, need }) => {
            const value = counts[key] ?? 0;
            const short = need !== undefined && value < need;
            return (
              <div key={key} className="rounded-xl bg-surface-subtle p-3">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
                  {value.toLocaleString()}
                </dd>
                {need !== undefined && (
                  <dd
                    className={`text-[11px] ${short ? "text-amber-700" : "text-emerald-700"}`}
                  >
                    {short ? `needs ${need.toLocaleString()}` : "enough to train"}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Evolution archive                                                   */
/* ------------------------------------------------------------------ */

const GENOME_KINDS = [
  "prompt_template",
  "rubric_weights",
  "dag_prior",
  "role_spec",
  "tool_allowlist",
] as const;

interface Genome {
  _id: string;
  kind: string;
  status: string;
  lineage_id?: string;
  created_at?: number;
}

function GenomeKindRow({ kind }: { kind: (typeof GENOME_KINDS)[number] }) {
  const genomes = useQuery(api.evolutionArchive.promotedGenomes, { kind }) as
    | Genome[]
    | undefined;
  const count = genomes?.length ?? 0;
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-subtle px-3 py-2 text-sm">
      <span className="font-mono text-xs text-ink">{kind}</span>
      {genomes === undefined ? (
        <span className="text-xs text-ink-muted">…</span>
      ) : (
        <Pill tone={count > 0 ? "success" : "neutral"}>
          {count} promoted
        </Pill>
      )}
    </div>
  );
}

function EvolutionSection() {
  return (
    <Card>
      <CardHeader
        title="Evolution archive"
        meta="promoted genomes in live use (approval-only)"
      />
      <div className="space-y-1.5">
        {GENOME_KINDS.map((kind) => (
          <GenomeKindRow key={kind} kind={kind} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Genomes are proposed and evaluated automatically but only promoted by
        explicit approval. Zero rows means the marketplace is running entirely
        on hand-written artifacts.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** Admin-only readouts for backend systems that previously had no UI. */
export function AdminInsights() {
  return (
    <div className="stagger-children mt-8 space-y-6">
      <NegotiationsSection />
      <div className="grid gap-6 lg:grid-cols-2">
        <TelemetrySection />
        <EvolutionSection />
      </div>
    </div>
  );
}
