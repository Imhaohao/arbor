"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { SpecialistConfig } from "@/lib/types";
import { MCP_CATALOG } from "@/lib/specialists/catalog";
import { specialistConfigFromCatalog } from "@/lib/specialists/catalog-config";
import { SpecialistCard } from "@/components/agents/SpecialistCard";
import { PageShell } from "@/components/ui/PageShell";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

interface LiveAgent {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_per_task_estimate: number;
  reputation_score: number;
  total_tasks_completed: number;
  total_disputes_lost: number;
}

type TransportFilter =
  | "all"
  | "mcp"
  | "mcp_auth"
  | "a2a"
  | "model"
  | "directory"
  | "other";

const TRANSPORT_FILTERS: Array<{ key: TransportFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "mcp", label: "Live MCP tools" },
  { key: "mcp_auth", label: "MCP, needs a key" },
  { key: "a2a", label: "A2A" },
  { key: "model", label: "Model-backed" },
  { key: "directory", label: "Directory only" },
  { key: "other", label: "Other" },
];

function classifyTransport(spec: SpecialistConfig): TransportFilter {
  const hasMcp = !!spec.mcp_endpoint;
  const hasA2a = !hasMcp && !!spec.a2a_endpoint;
  if (hasMcp) return spec.is_verified ? "mcp" : "mcp_auth";
  if (hasA2a) return "a2a";
  if (spec.tier === "openrouter") return "model";
  if (spec.discovered === true && !spec.discovery_source) return "directory";
  return "other";
}

/** Short, honest description for agents we only know about from their live
 * roster row (no hand-authored one-liner exists for them). Takes the first
 * sentence of the agent's own system prompt rather than inventing copy. */
function oneLinerFromSystemPrompt(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() || text.trim();
  if (!firstSentence) return "No description on file yet.";
  return firstSentence.length > 160
    ? `${firstSentence.slice(0, 157)}...`
    : firstSentence;
}

function specialistHaystack(spec: SpecialistConfig): string {
  return [spec.display_name, spec.sponsor, spec.one_liner, spec.capabilities.join(" ")]
    .join(" ")
    .toLowerCase();
}

const PAGE_SIZE = 24;

export function AgentsPageClient({
  specialists,
}: {
  specialists: SpecialistConfig[];
}) {
  const live = (useQuery(api.agents.list, {}) ?? []) as LiveAgent[];
  const liveById = useMemo(
    () => new Map(live.map((agent) => [agent.agent_id, agent])),
    [live],
  );

  const [searchInput, setSearchInput] = useState("");
  const [transport, setTransport] = useState<TransportFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const resetPaging = () => setVisibleCount(PAGE_SIZE);

  // The full, de-duplicated directory: hand-authored sponsor configs win,
  // then the curated MCP catalog (real endpoints, just not sponsor-authored),
  // then a plain fallback built from every other agent that only exists as a
  // live roster row (discovered agents with no richer config on file).
  const directory = useMemo(() => {
    const byId = new Map<string, SpecialistConfig>();
    for (const entry of MCP_CATALOG) {
      byId.set(entry.agent_id, specialistConfigFromCatalog(entry));
    }
    for (const spec of specialists) {
      byId.set(spec.agent_id, spec);
    }
    for (const agent of live) {
      if (byId.has(agent.agent_id)) continue;
      byId.set(agent.agent_id, {
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        sponsor: agent.sponsor,
        capabilities: agent.capabilities,
        system_prompt: agent.system_prompt,
        cost_baseline: agent.cost_per_task_estimate,
        starting_reputation: agent.reputation_score,
        one_liner: oneLinerFromSystemPrompt(agent.system_prompt),
        tier: "mock",
        discovered: true,
      });
    }
    return Array.from(byId.values());
  }, [specialists, live]);

  const searchMatches = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((spec) => specialistHaystack(spec).includes(q));
  }, [directory, searchInput]);

  const transportCounts = useMemo(() => {
    const counts: Record<TransportFilter, number> = {
      all: searchMatches.length,
      mcp: 0,
      mcp_auth: 0,
      a2a: 0,
      model: 0,
      directory: 0,
      other: 0,
    };
    for (const spec of searchMatches) counts[classifyTransport(spec)]++;
    return counts;
  }, [searchMatches]);

  const filtered = useMemo(() => {
    if (transport === "all") return searchMatches;
    return searchMatches.filter((spec) => classifyTransport(spec) === transport);
  }, [searchMatches, transport]);

  const visible = filtered.slice(0, visibleCount);
  const hasActiveFilter = searchInput.trim() !== "" || transport !== "all";

  return (
    <PageShell
      title="Find a specialist"
      subtitle={`Arbor's specialist network has ${directory.length.toLocaleString()} registered agents. Search by name, provider, or capability, or filter by integration type. Cards distinguish configured, authenticated, and verified integrations; reputation accrues from completed work and informs future selection.`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetPaging();
            }}
            type="text"
            inputMode="search"
            placeholder="Search by name, provider, or capability"
            aria-label="Search specialists"
            className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-9 text-sm text-ink outline-none focus:border-brand-700"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                resetPaging();
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p className="text-xs text-ink-muted sm:text-right">
          Showing {visible.length.toLocaleString()} of{" "}
          {filtered.length.toLocaleString()} matching specialist
          {filtered.length === 1 ? "" : "s"}
          {filtered.length !== directory.length &&
            ` (out of ${directory.length.toLocaleString()} total)`}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TRANSPORT_FILTERS.map((item) => {
          const active = transport === item.key;
          const count =
            item.key === "all" ? searchMatches.length : transportCounts[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTransport(item.key);
                resetPaging();
              }}
              className={
                active
                  ? "inline-flex items-center gap-1.5 rounded-full border border-brand-600 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition"
                  : "inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-muted"
              }
            >
              {item.label}
              <span className="font-mono text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-medium text-ink">
            {searchInput
              ? `No specialists match "${searchInput}".`
              : "No specialists match this filter."}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Try a different name, provider, or capability
            {transport !== "all" ? ", or clear the filter." : "."}
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setTransport("all");
                resetPaging();
              }}
              className="mt-4 inline-flex items-center rounded-full border border-line bg-white px-4 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-muted"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="stagger-children grid gap-4 md:grid-cols-2">
            {visible.map((specialist) => (
              <SpecialistCard
                key={specialist.agent_id}
                spec={specialist}
                live={liveById.get(specialist.agent_id)}
              />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted"
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
              </button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
