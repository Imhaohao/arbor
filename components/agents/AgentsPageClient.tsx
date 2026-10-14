"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { SpecialistConfig } from "@/lib/types";
import { MCP_CATALOG } from "@/lib/specialists/catalog";
import { specialistConfigFromCatalog } from "@/lib/specialists/catalog-config";
import { SpecialistCard } from "@/components/agents/SpecialistCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Treeling } from "@/components/grove/Treeling";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";
import { Pill } from "@/components/ui/Pill";
import { ArrowRight, Check, MagnifyingGlass, X } from "@phosphor-icons/react";

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

const CENSUS_STATS = [
  { value: "250", label: "first-pass cohort" },
  { value: "193", label: "returned structured JSON" },
  { value: "1,248", label: "rows in the tracked snapshot" },
  { value: "560", label: "live in that snapshot" },
];

const A2A_PATH_STEPS = [
  "message/send, kind:text",
  "legacy type:text",
  "tasks/send",
  "/a2a endpoint fallback",
  "tasks/get polling",
];

function CensusEvidence() {
  return (
    <Card className="mb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-subheading text-ink">Roster census evidence</h2>
            <Pill tone="info">Frozen research cohort</Pill>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            The “250-agent census” is the first measured cohort, not the current
            network size. The tracked snapshot later expanded to 1,248 rows:
            556 live open endpoints, 4 live keyed endpoints, and 688 entries
            that were paywalled, dead, house-owned, or missing a transport.
          </p>
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:min-w-[480px]">
          {CENSUS_STATS.map((stat) => (
            <div key={stat.label}>
              <dd className="type-data text-xl text-ink">{stat.value}</dd>
              <dt className="mt-0.5 text-[0.8125rem] leading-tight text-ink-muted">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 rounded-control bg-surface-subtle p-4">
        <p className="text-sm font-medium text-ink">A2A compatibility path</p>
        <ol className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {A2A_PATH_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              {index > 0 && (
                <ArrowRight size={12} aria-hidden="true" className="text-ink-subtle" />
              )}
              <code className="type-data rounded-full bg-surface px-2.5 py-1 text-ink-soft shadow-hairline">
                {step}
              </code>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.8125rem] text-ink-muted">
          Regression-tested against local HTTP fixtures. This protected preview
          does not invoke external agents or expose A2A credentials.
        </p>
      </div>
    </Card>
  );
}

function FilterChip({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-medium outline-none transition-[box-shadow,background-color] duration-150 focus-visible:shadow-ring active:scale-[0.96]",
        active
          ? "bg-brand-50 text-brand-700 ring-2 ring-brand-500"
          : "bg-surface text-ink-soft shadow-hairline hover:bg-surface-subtle hover:shadow-hairline-strong",
      )}
    >
      {active && <Check size={13} weight="bold" aria-hidden="true" />}
      {label}
      <span className="type-data text-xs text-ink-muted">{count}</span>
    </button>
  );
}

function SearchField({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative w-full">
      <label htmlFor="specialist-search" className="sr-only">
        Search specialists
      </label>
      <MagnifyingGlass
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        id="specialist-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="text"
        inputMode="search"
        placeholder="Search by name, provider, or capability"
        className="h-11 w-full rounded-control border border-line-control/60 bg-surface pl-10 pr-10 text-sm text-ink outline-none placeholder:text-ink-subtle focus-visible:shadow-ring"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-subtle outline-none hover:text-ink focus-visible:shadow-ring"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function EmptyDirectory({
  searchInput,
  transport,
  hasActiveFilter,
  onClear,
}: {
  searchInput: string;
  transport: TransportFilter;
  hasActiveFilter: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-6 py-14 text-center shadow-card">
      <Treeling seed="empty-directory" asleep alive={false} size={96} />
      <p className="type-subheading mt-5 text-ink">
        {searchInput
          ? `No specialists match "${searchInput}".`
          : "No specialists match this filter."}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Try a different name, provider, or capability
        {transport !== "all" ? ", or clear the filter." : "."}
      </p>
      {hasActiveFilter && (
        <Button variant="secondary" className="mt-5" onClick={onClear}>
          Clear search and filters
        </Button>
      )}
    </div>
  );
}

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
      subtitle={`${directory.length.toLocaleString()} registered agents. Search by name, provider or skill. Reputation comes only from judged work, and it decides who gets picked next.`}
    >
      <CensusEvidence />

      <div className="mb-6 flex flex-col gap-4 rounded-card bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="sm:max-w-md sm:flex-1">
            <SearchField
              value={searchInput}
              onChange={(next) => {
                setSearchInput(next);
                resetPaging();
              }}
              onClear={() => {
                setSearchInput("");
                resetPaging();
              }}
            />
          </div>
          <p className="text-[0.8125rem] text-ink-muted sm:text-right" aria-live="polite">
            Showing {visible.length.toLocaleString()} of{" "}
            {filtered.length.toLocaleString()} matching specialist
            {filtered.length === 1 ? "" : "s"}
            {filtered.length !== directory.length &&
              ` (out of ${directory.length.toLocaleString()} total)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by integration type">
          {TRANSPORT_FILTERS.map((item) => (
            <FilterChip
              key={item.key}
              label={item.label}
              count={item.key === "all" ? searchMatches.length : transportCounts[item.key]}
              active={transport === item.key}
              onSelect={() => {
                setTransport(item.key);
                resetPaging();
              }}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyDirectory
          searchInput={searchInput}
          transport={transport}
          hasActiveFilter={hasActiveFilter}
          onClear={() => {
            setSearchInput("");
            setTransport("all");
            resetPaging();
          }}
        />
      ) : (
        <>
          <div className="stagger-children grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((specialist) => (
              <SpecialistCard
                key={specialist.agent_id}
                spec={specialist}
                live={liveById.get(specialist.agent_id)}
              />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
              </Button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
