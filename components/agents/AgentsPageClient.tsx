"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { SpecialistConfig } from "@/lib/types";
import { SpecialistCard } from "@/components/agents/SpecialistCard";
import { PageShell } from "@/components/ui/PageShell";

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
    <PageShell
      title="Every specialist in the network."
      subtitle="Arbor routes eligible tasks to available specialists. Cards distinguish configured, authenticated, and verified integrations; reputation accrues from completed work and informs future selection."
    >
      <div className="stagger-children grid gap-4 md:grid-cols-2">
        {specialists.map((specialist) => (
          <SpecialistCard
            key={specialist.agent_id}
            spec={specialist}
            live={liveById.get(specialist.agent_id)}
          />
        ))}
      </div>
    </PageShell>
  );
}
