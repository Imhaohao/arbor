"use client";

import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowBendDownRight,
  Scales,
  SealWarning,
  WarningDiamond,
} from "@phosphor-icons/react";
import {
  buildLedger,
  detectDisagreement,
  groupEvaluationsByNode,
  orderNodes,
  summarizeReplay,
  type NodeDisagreement,
  type ReplayEvaluation,
  type ReplayNode,
} from "@/lib/hive/replay-core";
import { formatMoney, formatScore } from "@/lib/utils";

interface Props {
  dagId: string;
}

function VerdictPill({ verdict }: { verdict: "accept" | "reject" }) {
  return (
    <Pill tone={verdict === "accept" ? "success" : "danger"}>
      {verdict === "accept" ? "accept" : "reject"}
    </Pill>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "success" | "warning";
  hint?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-700"
      : tone === "success"
        ? "text-emerald-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-ink";
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className={`font-display text-xl font-semibold ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-muted">{hint}</div>}
    </div>
  );
}

/**
 * The disagreement banner. This is the reason the page exists: a node where one
 * judge rubber-stamped work that the others rejected is the clearest evidence
 * that the verification layer is doing something, so it renders above the
 * individual verdicts rather than as a footnote under them.
 */
function DisagreementBanner({ d }: { d: NodeDisagreement }) {
  if (d.severity === "none") return null;

  if (d.optimisticOutlier) {
    return (
      <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
        <div className="flex items-start gap-2">
          <SealWarning
            size={16}
            weight="fill"
            className="mt-0.5 shrink-0 text-amber-600"
          />
          <div className="min-w-0 text-xs text-amber-900">
            <span className="font-semibold">Overruled rubber stamp.</span>{" "}
            <code className="font-mono">{d.highest.judge_model}</code> accepted
            this at {formatScore(d.highest.score)} while {d.rejects} other
            verdicts rejected it — a {formatScore(d.scoreSpread)} spread. The
            majority held.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl bg-surface-muted p-3 ring-1 ring-slate-200">
      <div className="flex items-start gap-2">
        <Scales size={16} weight="fill" className="mt-0.5 shrink-0 text-ink-muted" />
        <div className="min-w-0 text-xs text-ink-soft">
          <span className="font-semibold">
            {d.severity === "split" ? "Split verdict." : "Judges disagreed on margin."}
          </span>{" "}
          {d.accepts} accept / {d.rejects} reject, {formatScore(d.scoreSpread)}{" "}
          spread between{" "}
          <code className="font-mono">{d.highest.judge_model}</code> and{" "}
          <code className="font-mono">{d.lowest.judge_model}</code>.
        </div>
      </div>
    </div>
  );
}

function NodeCard({
  node,
  evaluations,
  disagreement,
}: {
  node: ReplayNode;
  evaluations: ReplayEvaluation[];
  disagreement: NodeDisagreement | null;
}) {
  const rejects = evaluations.filter((e) => e.verdict === "reject").length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
              {node.node_id}
            </code>
            {node.depends_on.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <ArrowBendDownRight size={12} weight="bold" />
                {node.depends_on.join(", ")}
              </span>
            )}
            {(node.revision_count ?? 0) > 0 && (
              <Pill tone="warning">{node.revision_count} revisions</Pill>
            )}
          </div>
          <p className="mt-1.5 text-sm text-ink">{node.description}</p>
          <div className="mt-1 text-xs text-ink-muted">
            {node.assigned_agent_id ?? "unassigned"}
            {node.cost_paid !== undefined && ` · ${formatMoney(node.cost_paid)}`}
            {node.bid_price !== undefined &&
              ` · bid ${formatMoney(node.bid_price)}`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-lg font-semibold text-ink">
            {node.eval_score !== undefined ? formatScore(node.eval_score) : "—"}
          </div>
          <div className="text-[11px] text-ink-muted">
            {rejects}/{evaluations.length} rejected
          </div>
        </div>
      </div>

      {disagreement && <DisagreementBanner d={disagreement} />}

      <div className="space-y-2">
        {evaluations.map((e, i) => (
          <div
            key={`${e.judge_model}-${e.created_at}-${i}`}
            className={`rounded-xl p-3 ring-1 ${
              e.verdict === "accept"
                ? "bg-emerald-50/50 ring-emerald-100"
                : "bg-rose-50/40 ring-rose-100"
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <VerdictPill verdict={e.verdict} />
                <code className="font-mono text-[11px] text-ink-soft">
                  {e.judge_model}
                </code>
              </div>
              <span className="font-mono text-xs font-semibold text-ink">
                {formatScore(e.score)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-soft">{e.reasoning}</p>
            {e.conflicts_with && e.conflicts_with.length > 0 && (
              <div className="mt-1.5 text-[11px] text-ink-muted">
                conflicts with: {e.conflicts_with.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ReplayView({ dagId }: Props) {
  const data = useQuery(api.hiveReplay.replay, {
    dag_id: dagId as Id<"hive_dags">,
  });

  if (data === undefined) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
        Loading replay…
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink-muted shadow-card">
        No DAG found for this id.
      </div>
    );
  }

  const nodes = orderNodes(data.nodes);
  const grouped = groupEvaluationsByNode(data.evaluations);
  const disagreements = nodes
    .map((n) => detectDisagreement(n.node_id, grouped.get(n.node_id) ?? []))
    .filter((d): d is NodeDisagreement => d !== null);
  const summary = summarizeReplay({
    status: data.dag.status,
    maxBudget: data.dag.max_budget,
    nodes: data.nodes,
    evaluations: data.evaluations,
    escalations: data.escalations,
    disagreements,
  });
  const ledger = buildLedger(data.nodes, data.evaluations);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill tone={summary.shipped ? "success" : "danger"}>
            {data.dag.status}
          </Pill>
          {!summary.shipped && (
            <Pill tone="warning">did not ship</Pill>
          )}
          <code className="font-mono text-[11px] text-ink-muted">
            planner {data.dag.planner_model}
          </code>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
          {data.dag.goal}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Verdicts"
            value={`${summary.rejects}/${summary.accepts + summary.rejects}`}
            tone={summary.rejects > summary.accepts ? "danger" : "neutral"}
            hint="rejected"
          />
          <Stat
            label="Disagreements"
            value={String(summary.disagreements)}
            tone={summary.disagreements > 0 ? "warning" : "neutral"}
            hint={`${summary.optimisticOutliers} overruled`}
          />
          <Stat label="Nodes" value={String(summary.nodeCount)} />
          <Stat
            label="Revisions"
            value={String(summary.revisionRounds)}
            tone={summary.revisionRounds > 0 ? "warning" : "neutral"}
          />
          <Stat
            label="Spend"
            value={formatMoney(summary.totalSpend)}
            hint={`of ${formatMoney(summary.maxBudget)} budget`}
          />
          <Stat
            label="Stranded"
            value={formatMoney(summary.strandedSpend)}
            tone={summary.strandedSpend > 0 ? "danger" : "success"}
            hint={summary.strandedSpend > 0 ? "bought nothing" : "shipped"}
          />
        </div>
      </Card>

      {data.escalations.length > 0 && (
        <Card className="bg-amber-50/60">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <WarningDiamond size={16} weight="fill" className="text-amber-600" />
                Escalated to a human
              </span>
            }
            size="subtle"
          />
          <div className="space-y-2">
            {data.escalations.map((e, i) => (
              <div key={i} className="text-xs text-amber-900">
                <span className="font-semibold">{e.kind.replace("_", " ")}</span>
                {" — "}
                {e.reason}
                {e.resolution && ` (${e.resolution})`}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold tracking-tight text-ink">
          Nodes and verdicts
        </h2>
        <div className="space-y-3">
          {nodes.map((node) => (
            <NodeCard
              key={node.node_id}
              node={node}
              evaluations={grouped.get(node.node_id) ?? []}
              disagreement={
                disagreements.find((d) => d.node_id === node.node_id) ?? null
              }
            />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Ledger"
          meta="verdicts received, not issued"
          size="subtle"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-muted">
              <tr className="border-b border-slate-100">
                <th className="pb-2 font-medium">Agent</th>
                <th className="pb-2 text-right font-medium">Nodes</th>
                <th className="pb-2 text-right font-medium">Accept</th>
                <th className="pb-2 text-right font-medium">Reject</th>
                <th className="pb-2 text-right font-medium">Mean</th>
                <th className="pb-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.agent_id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 font-mono text-[11px] text-ink">
                    {row.agent_id}
                  </td>
                  <td className="py-2 text-right text-ink-soft">{row.nodesWorked}</td>
                  <td className="py-2 text-right text-emerald-700">{row.accepts}</td>
                  <td className="py-2 text-right font-semibold text-rose-700">
                    {row.rejects}
                  </td>
                  <td className="py-2 text-right text-ink-soft">
                    {row.meanScore === null ? "—" : formatScore(row.meanScore)}
                  </td>
                  <td className="py-2 text-right text-ink">
                    {formatMoney(row.costPaid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
