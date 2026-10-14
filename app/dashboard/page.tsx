"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { ListChecks, Trophy, Timer, Activity, type LucideIcon } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar-primitive";
import AppSidebar from "@/components/ui/sidebar-one";
import { NeonButton } from "@/components/ui/neon-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { StatusBadge } from "@/components/task/StatusBadge";
import { formatDuration, formatMoney } from "@/lib/utils";
import { amountPaid } from "@/lib/task-view";
import { HivePayouts } from "@/components/dashboard/HivePayouts";
import { SpecialistReadiness } from "@/components/dashboard/SpecialistReadiness";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
}

type Overview = NonNullable<ReturnType<typeof useOverview>>;

interface Stat {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}

const RECENT_TASK_LIMIT = 4;

/** Only accepted work is paid; a rejected task's escrow was refunded. */
function paidAmount(task: { status: string; price_paid?: number }): string {
  const paid = amountPaid(task);
  return paid === undefined ? "" : formatMoney(paid);
}

function useOverview() {
  return useQuery(api.buyerAnalytics.overview, {});
}

/** Every figure is measured by buyerAnalytics.overview; nothing is a placeholder. */
function statsFrom(o: Overview): Stat[] {
  return [
    { label: "Tasks posted", value: o.total_tasks.toLocaleString(), detail: `${o.completed_tasks.toLocaleString()} delivered`, icon: ListChecks },
    { label: "In progress", value: o.active_tasks.toLocaleString(), detail: "bidding, running or being judged", icon: Activity },
    {
      label: "Delivery rate",
      value: o.completion_rate === null ? "No data" : `${Math.round(o.completion_rate * 100)}%`,
      detail: `${o.completed_tasks.toLocaleString()} of ${o.terminal_tasks.toLocaleString()} finished tasks`,
      icon: Trophy,
    },
    {
      label: "Avg turnaround",
      value: o.avg_turnaround_ms === null ? "No data" : formatDuration(o.avg_turnaround_ms),
      detail: `latest ${o.turnaround_sample_size} settled tasks`,
      icon: Timer,
    },
  ];
}

function prettyAgent(id: string) {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardPage() {
  const router = useRouter();
  const live = (useQuery(api.agents.list, {}) ?? []) as LiveAgent[];
  const overview = useOverview();
  const recentTasks = useQuery(api.taskList.recentTasks, { limit: RECENT_TASK_LIMIT });
  const topSpecialists = [...live]
    .sort((a, b) => b.reputation_score - a.reputation_score)
    .slice(0, 5);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="page-aurora min-w-0">
        {/* Topbar — same dark glass chrome as the rest of the product. */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-slate-950/85 px-4 shadow-lg shadow-slate-950/10 backdrop-blur-xl">
          <SidebarTrigger className="text-white/70 hover:bg-white/10 hover:text-white" />
          <span className="text-sm font-semibold tracking-tight text-white">
            Dashboard
          </span>
          <div className="ml-auto">
            <NeonButton
              variant="solid"
              size="sm"
              onClick={() => router.push("/#post-task")}
            >
              Post a task
            </NeonButton>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {/* Greeting */}
          <div className="animate-fade-up">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Marketplace overview
            </h1>
          </div>

          {/* Stat cards */}
          <div className="stagger-children mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(overview ? statsFrom(overview) : []).map((s) => {
              const Icon = s.icon;
              return (
                <Card
                  key={s.label}
                  className="bg-white shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-muted">
                        {s.label}
                      </span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <Icon size={15} />
                      </span>
                    </div>
                    <div className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
                      {s.value}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">{s.detail}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Two columns */}
          <div className="mt-6 grid grid-cols-1 gap-4 animate-fade-up [animation-delay:120ms] lg:grid-cols-5">
            {/* Recent tasks */}
            <Card className="bg-white shadow-card lg:col-span-3">
              <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-0">
                <CardTitle className="text-base font-semibold text-ink">
                  Recent tasks
                </CardTitle>
                <button
                  onClick={() => router.push("/tasks")}
                  className="text-xs font-medium text-brand-700 hover:text-brand-800"
                >
                  View all
                </button>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                {recentTasks?.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-muted">
                    No tasks posted yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {(recentTasks ?? []).map((t) => (
                      <li key={t.task_id}>
                        <Link
                          href={`/task/${t.task_id}`}
                          className="flex items-center justify-between gap-3 py-3 hover:text-brand-700"
                        >
                          <p className="min-w-0 truncate text-sm font-medium text-ink">
                            {t.prompt}
                          </p>
                          <div className="flex shrink-0 items-center gap-3">
                            <StatusBadge status={t.status} />
                            <span className="w-14 text-right font-mono text-sm text-ink">
                              {paidAmount(t)}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Top specialists (live) */}
            <Card className="bg-white shadow-card lg:col-span-2">
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-base font-semibold text-ink">
                  Top specialists
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                {topSpecialists.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-muted">
                    Reputation data loads from the live marketplace.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {topSpecialists.map((a, i) => (
                      <li key={a.agent_id} className="flex items-center gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-ink-muted">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-sm font-medium text-ink">
                              {prettyAgent(a.agent_id)}
                            </p>
                            <span className="font-mono text-xs text-ink-muted">
                              {a.reputation_score.toFixed(2)}
                            </span>
                          </div>
                          <div className="score-bar mt-1.5">
                            <span
                              style={{
                                width: `${Math.min(100, a.reputation_score * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <HivePayouts />

          <SpecialistReadiness />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
