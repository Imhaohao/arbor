"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Plus } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { PageShell } from "@/components/ui/PageShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { Treeling } from "@/components/grove/Treeling";
import { StatusBadge } from "@/components/task/StatusBadge";
import { HivePayouts } from "@/components/dashboard/HivePayouts";
import { SpecialistReadiness } from "@/components/dashboard/SpecialistReadiness";
import { EmptyState, SkeletonRows, prettyAgent } from "@/components/dashboard/DashboardParts";
import { statureFromReputation } from "@/lib/grove/treeling";
import { formatDuration, formatMoney } from "@/lib/utils";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
}

type Overview = NonNullable<ReturnType<typeof useOverview>>;
type RecentTask = NonNullable<ReturnType<typeof useRecentTasks>>[number];

interface Stat {
  label: string;
  value: string | null;
  detail: string;
}

const RECENT_TASK_LIMIT = 4;
const TOP_SPECIALIST_LIMIT = 5;

function useOverview() {
  return useQuery(api.buyerAnalytics.overview, {});
}

function useRecentTasks() {
  return useQuery(api.taskList.recentTasks, { limit: RECENT_TASK_LIMIT });
}

/** Every figure is measured by buyerAnalytics.overview; nothing is a placeholder. A null value means no data yet. */
function statsFrom(o: Overview): Stat[] {
  return [
    { label: "Tasks posted", value: o.total_tasks.toLocaleString(), detail: `${o.completed_tasks.toLocaleString()} delivered` },
    { label: "In progress", value: o.active_tasks.toLocaleString(), detail: "bidding, running or being judged" },
    {
      label: "Delivery rate",
      value: o.completion_rate === null ? null : `${Math.round(o.completion_rate * 100)}%`,
      detail: `${o.completed_tasks.toLocaleString()} of ${o.terminal_tasks.toLocaleString()} finished tasks`,
    },
    {
      label: "Avg turnaround",
      value: o.avg_turnaround_ms === null ? null : formatDuration(o.avg_turnaround_ms),
      detail: `latest ${o.turnaround_sample_size} settled tasks`,
    },
  ];
}

function StatCell({ stat }: { stat: Stat }) {
  return (
    <div className="bg-surface p-5 sm:p-6">
      <p className="text-[0.8125rem] text-ink-muted">{stat.label}</p>
      {stat.value === null ? (
        <p className="type-subheading mt-2 text-ink-muted">No data yet</p>
      ) : (
        <p className="type-data mt-1 text-4xl font-semibold text-ink">{stat.value}</p>
      )}
      <p className="mt-2 text-[0.8125rem] text-ink-muted">{stat.detail}</p>
    </div>
  );
}

function StatRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4" aria-busy="true" aria-label="Loading figures">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-3 bg-surface p-5 sm:p-6">
          <div className="shimmer h-4 w-24 rounded-control" />
          <div className="shimmer h-10 w-20 rounded-control" />
          <div className="shimmer h-4 w-32 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function StatRow({ overview }: { overview: Overview | undefined }) {
  return (
    <Card className="animate-fade-up overflow-hidden p-0 sm:p-0">
      {overview ? (
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {statsFrom(overview).map((stat) => (
            <StatCell key={stat.label} stat={stat} />
          ))}
        </div>
      ) : (
        <StatRowSkeleton />
      )}
    </Card>
  );
}

function RecentTaskRow({ task }: { task: RecentTask }) {
  return (
    <li>
      <Link
        href={`/task/${task.task_id}`}
        className="flex items-center justify-between gap-3 rounded-control px-2 py-3 hover:bg-surface-muted"
      >
        <p className="min-w-0 truncate text-sm font-medium text-ink">{task.prompt}</p>
        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge status={task.status} />
          <span className="type-data w-16 text-right text-sm text-ink">
            {formatMoney(task.price_paid ?? task.max_budget)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function RecentTasksCard({ tasks }: { tasks: RecentTask[] | undefined }) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader
        title="Recent tasks"
        meta={
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1 rounded-full font-medium text-brand-700 hover:text-brand-800"
          >
            View all
            <ArrowRight size={14} weight="bold" />
          </Link>
        }
      />
      {tasks === undefined ? (
        <SkeletonRows count={RECENT_TASK_LIMIT} />
      ) : tasks.length === 0 ? (
        <EmptyState
          seed="dashboard-no-tasks"
          message="No tasks posted yet. Post one and specialists will start bidding."
          action={
            <Link href="/#post-task" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Post a task
            </Link>
          }
        />
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {tasks.map((task) => (
            <RecentTaskRow key={task.task_id} task={task} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SpecialistRow({ agent, rank }: { agent: LiveAgent; rank: number }) {
  return (
    <li className="flex items-center gap-3">
      <span className="type-data w-4 shrink-0 text-center text-[0.8125rem] text-ink-muted">{rank}</span>
      <Treeling
        seed={agent.agent_id}
        stature={statureFromReputation(agent.reputation_score)}
        alive={false}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">{prettyAgent(agent.agent_id)}</p>
          <span className="type-data text-sm text-ink">{agent.reputation_score.toFixed(2)}</span>
        </div>
        <div className="score-bar mt-1.5">
          <span style={{ width: `${Math.min(100, agent.reputation_score * 100)}%` }} />
        </div>
      </div>
    </li>
  );
}

function TopSpecialistsCard({ agents }: { agents: LiveAgent[] | undefined }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Top specialists" meta="by reputation" />
      {agents === undefined ? (
        <SkeletonRows count={TOP_SPECIALIST_LIMIT} />
      ) : agents.length === 0 ? (
        <EmptyState
          seed="dashboard-no-specialists"
          message="No specialists have a reputation yet."
          action={
            <Link href="/agents" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Browse specialists
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {agents.map((agent, i) => (
            <SpecialistRow key={agent.agent_id} agent={agent} rank={i + 1} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function topByReputation(agents: LiveAgent[] | undefined) {
  if (agents === undefined) return undefined;
  return [...agents].sort((a, b) => b.reputation_score - a.reputation_score).slice(0, TOP_SPECIALIST_LIMIT);
}

export default function DashboardPage() {
  const live = useQuery(api.agents.list, {}) as LiveAgent[] | undefined;
  const overview = useOverview();
  const recentTasks = useRecentTasks();

  return (
    <PageShell
      width="wide"
      title="Dashboard"
      subtitle="Measured activity across the marketplace: your tasks, the specialists doing the work, and payouts."
      meta={
        <Link href="/#post-task" className={buttonClasses({ variant: "primary" })}>
          <Plus size={16} weight="bold" />
          Post a task
        </Link>
      }
    >
      <div className="space-y-6">
        <StatRow overview={overview} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <RecentTasksCard tasks={recentTasks} />
          <TopSpecialistsCard agents={topByReputation(live)} />
        </div>
        <HivePayouts />
        <SpecialistReadiness />
      </div>
    </PageShell>
  );
}
