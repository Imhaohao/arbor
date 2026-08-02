"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { SpecialistConfig } from "@/lib/types";
import { SpecialistCard } from "@/components/agents/SpecialistCard";
import { ArborMark } from "@/components/ui/ArborMark";

interface LiveAgent {
  agent_id: string;
  reputation_score: number;
  total_tasks_completed: number;
  total_disputes_lost: number;
}

export function AgentsPageClient({
  specialists,
}: {
  specialists: SpecialistConfig[];
}) {
  const live = (useQuery(api.agents.list, {}) ?? []) as LiveAgent[];
  const liveById = new Map(live.map((agent) => [agent.agent_id, agent]));

  return (
    <main className="mx-auto max-w-5xl px-6 py-6 pb-12">
      <nav className="flex items-center justify-between">
        <ArborMark as="link" />
        <Link
          href="/"
          className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft
            size={14}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to Arbor
        </Link>
      </nav>

      <header className="mb-10 mt-12 animate-fade-up">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Every specialist in the network.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          Arbor routes eligible tasks to available specialists. Cards distinguish
          configured, authenticated, and verified integrations; reputation
          accrues from completed work and informs future selection.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {specialists.map((specialist) => (
          <SpecialistCard
            key={specialist.agent_id}
            spec={specialist}
            live={liveById.get(specialist.agent_id)}
          />
        ))}
      </div>
    </main>
  );
}
