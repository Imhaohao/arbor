"use client";

import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowBendDownRight,
  CheckCircle,
  Scales,
  SealWarning,
  XCircle,
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
  if (verdict === "accept") {
    return (
      <Pill tone="success">
        <CheckCircle size={12} weight="fill" aria-hidden />
        accept
      </Pill>
    );
  }
  return (
    <Pill tone="danger">
      <XCircle size={12} weight="fill" aria-hidden />
      reject
    </Pill>
  );
}

const STAT_TONE_CLASS = {
  neutral: "text-ink",
  danger: "text-danger-700",
  success: "text-moss-700",
  warning: "text-warning-700",
} as const;

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: keyof typeof STAT_TONE_CLASS;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-ink-muted">{label}</dt>
      <dd className={`type-data text-xl font-semibold ${STAT_TONE_CLASS[tone]}`}>{value}</dd>
      {hint && <dd className="text-xs text-ink-muted">{hint}</dd>}
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
      <div className="mb-3 rounded-control bg-warning-50 p-3">
        <div className="flex items-start gap-2">
          <SealWarning size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-warning-700" />
          <div className="min-w-0 text-[0.8125rem] text-warning-900">
            <span className="font-semibold">Overruled rubber stamp.</span>{" "}
            <code className="type-data">{d.highest.judge_model}</code> accepted
            this at {formatScore(d.highest.score)} while {d.rejects} other
            verdicts rejected it, a {formatScore(d.scoreSpread)} spread. The
            majority held.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-control bg-surface-muted p-3">
      <div className="flex items-start gap-2">
        <Scales size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-ink-muted" />
        <div className="min-w-0 text-[0.8125rem] text-ink-soft">
          <span className="font-semibold">
            {d.severity === "split" ? "Split verdict." : "Judges disagreed on margin."}
          </span>{" "}
          {d.accepts} accept, {d.rejects} reject, {formatScore(d.scoreSpread)}{" "}
          spread between{" "}
          <code className="type-data">{d.highest.judge_model}</code> and{" "}
          <code className="type-data">{d.lowest.judge_model}</code>.
        </div>
      </div>
    </div>
  );
}

function EvaluationRow({ e }: { e: ReplayEvaluation }) {
  const accepted = e.verdict === "accept";
  return (
    <div className={`rounded-control p-3 ${accepted ? "bg-moss-50" : "bg-danger-50"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Treeling seed={e.judge_model} species="birch" size={28} alive={false} />
          <VerdictPill verdict={e.verdict} />
          <code className="type-data break-all text-xs text-ink-soft">{e.judge_model}</code>
        </div>
        <span className="type-data text-sm font-semibold text-ink">{formatScore(e.score)}</span>
      </div>
      <p className="text-[0.8125rem] leading-relaxed text-ink-soft">{e.reasoning}</p>
      {e.conflicts_with && e.conflicts_with.length > 0 && (
        <div className="mt-1.5 text-xs text-ink-muted">
          Conflicts with: {e.conflicts_with.join(", ")}
        </div>
      )}
    </div>
  );
}

function NodeCostLine({ node }: { node: ReplayNode }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
      <span className="type-data break-all">{node.assigned_agent_id ?? "unassigned"}</span>
      {node.cost_paid !== undefined && <span className="type-data">{formatMoney(node.cost_paid)}</span>}
      {node.bid_price !== undefined && <span className="type-data">bid {formatMoney(node.bid_price)}</span>}
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
  const majorityRejected = rejects > 0 && rejects * 2 >= evaluations.length;

  return (
    <Card className={majorityRejected ? "bg-danger-50/50 p-4" : "p-4"}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {node.assigned_agent_id && (
            <Treeling seed={node.assigned_agent_id} size={44} alive={false} asleep={majorityRejected} className="shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="type-data rounded-control bg-surface-muted px-1.5 py-0.5 text-xs text-ink-soft">
                {node.node_id}
              </code>
              {node.depends_on.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                  <ArrowBendDownRight size={12} weight="bold" aria-hidden />
                  <span className="sr-only">Depends on</span>
                  {node.depends_on.join(", ")}
                </span>
              )}
              {(node.revision_count ?? 0) > 0 && (
                <Pill tone="warning">{node.revision_count} revisions</Pill>
              )}
            </div>
            <p className="type-body mt-1.5 text-ink">{node.description}</p>
            <NodeCostLine node={node} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="type-data text-lg font-semibold text-ink">
            {node.eval_score !== undefined ? formatScore(node.eval_score) : "n/a"}
          </div>
          {rejects > 0 ? (
            <div className="flex items-center justify-end gap-1 text-[0.8125rem] font-medium text-danger-700">
              <XCircle size={14} weight="fill" aria-hidden />
              {rejects}/{evaluations.length} rejected
            </div>
          ) : (
            <div className="text-[0.8125rem] text-ink-muted">0/{evaluations.length} rejected</div>
          )}
        </div>
      </div>

      {disagreement && <DisagreementBanner d={disagreement} />}

      <div className="space-y-2">
        {evaluations.map((e, i) => (
          <EvaluationRow key={`${e.judge_model}-${e.created_at}-${i}`} e={e} />
        ))}
      </div>
    </Card>
  );
}

function ReplayMessage({ children, asleep = false }: { children: string; asleep?: boolean }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <Treeling seed="replay-view" asleep={asleep} alive={false} size={72} />
      <p className="type-body text-ink-muted">{children}</p>
    </Card>
  );
}

function SummaryCard({
  data,
  summary,
}: {
  data: NonNullable<ReturnType<typeof useReplayData>>;
  summary: ReturnType<typeof summarizeReplay>;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone={summary.shipped ? "success" : "danger"}>{data.dag.status}</Pill>
        {!summary.shipped && <Pill tone="warning">did not ship</Pill>}
        <span className="text-[0.8125rem] text-ink-muted">
          Planner <code className="type-data text-xs">{data.dag.planner_model}</code>
        </span>
      </div>
      <p className="type-body whitespace-pre-line text-ink-soft">{data.dag.goal}</p>

      <dl className="mt-5 grid grid-cols-2 gap-4 pt-4 shadow-[0_-1px_0_oklch(var(--line))] sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Rejected verdicts"
          value={`${summary.rejects}/${summary.accepts + summary.rejects}`}
          tone={summary.rejects > summary.accepts ? "danger" : "neutral"}
        />
        <Stat
          label="Disagreements"
          value={String(summary.disagreements)}
          tone={summary.disagreements > 0 ? "warning" : "neutral"}
          hint={`${summary.optimisticOutliers} overruled`}
        />
        <Stat label="Steps" value={String(summary.nodeCount)} />
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
      </dl>
    </Card>
  );
}

function EscalationsCard({ escalations }: { escalations: NonNullable<ReturnType<typeof useReplayData>>["escalations"] }) {
  return (
    <Card className="bg-warning-50/60">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <WarningDiamond size={16} weight="fill" aria-hidden className="text-warning-700" />
            Escalated to a human
          </span>
        }
        size="subtle"
      />
      <ul className="space-y-2">
        {escalations.map((e, i) => (
          <li key={i} className="text-[0.8125rem] text-warning-900">
            <span className="font-semibold">{e.kind.replace("_", " ")}:</span> {e.reason}
            {e.resolution && ` (${e.resolution})`}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LedgerCard({ ledger }: { ledger: ReturnType<typeof buildLedger> }) {
  return (
    <Card>
      <CardHeader title="Ledger" meta="Verdicts received, not issued" size="subtle" />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-[0.8125rem]">
          <thead className="text-ink-muted">
            <tr className="shadow-[0_1px_0_oklch(var(--line))]">
              <th scope="col" className="pb-2 font-medium">Agent</th>
              <th scope="col" className="pb-2 text-right font-medium">Steps</th>
              <th scope="col" className="pb-2 text-right font-medium">Accepted</th>
              <th scope="col" className="pb-2 text-right font-medium">Rejected</th>
              <th scope="col" className="pb-2 text-right font-medium">Mean score</th>
              <th scope="col" className="pb-2 text-right font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.agent_id} className="shadow-[0_1px_0_oklch(var(--line)/0.5)] last:shadow-none">
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <Treeling seed={row.agent_id} size={28} alive={false} />
                    <span className="type-data break-all text-xs text-ink">{row.agent_id}</span>
                  </span>
                </td>
                <td className="type-data py-2 text-right text-ink-soft">{row.nodesWorked}</td>
                <td className="type-data py-2 text-right text-moss-700">{row.accepts}</td>
                <td className="type-data py-2 text-right font-semibold text-danger-700">{row.rejects}</td>
                <td className="type-data py-2 text-right text-ink-soft">
                  {row.meanScore === null ? "n/a" : formatScore(row.meanScore)}
                </td>
                <td className="type-data py-2 text-right text-ink">{formatMoney(row.costPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function useReplayData(dagId: string) {
  return useQuery(api.hiveReplay.replay, {
    dag_id: dagId as Id<"hive_dags">,
  });
}

export function ReplayView({ dagId }: Props) {
  const data = useReplayData(dagId);

  if (data === undefined) {
    return <div className="shimmer h-64 rounded-card" role="status" aria-label="Loading replay" />;
  }
  if (data === null) {
    return <ReplayMessage asleep>No run found for this id. Check the link or pick one from all replays.</ReplayMessage>;
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
      <SummaryCard data={data} summary={summary} />

      {data.escalations.length > 0 && <EscalationsCard escalations={data.escalations} />}

      <section>
        <h2 className="type-heading mb-3 px-1 text-ink">Steps and verdicts</h2>
        <div className="space-y-3">
          {nodes.map((node) => (
            <NodeCard
              key={node.node_id}
              node={node}
              evaluations={grouped.get(node.node_id) ?? []}
              disagreement={disagreements.find((d) => d.node_id === node.node_id) ?? null}
            />
          ))}
        </div>
      </section>

      <LedgerCard ledger={ledger} />
    </div>
  );
}
