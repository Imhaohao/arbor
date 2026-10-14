"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { statureFromReputation } from "@/lib/grove/treeling";
import { formatMoney, formatScore } from "@/lib/utils";
import { Check, Sparkle, CircleNotch, Lightning } from "@phosphor-icons/react";

type DiscoverySource =
  | "google"
  | "catalog"
  | "registry"
  | "a2a"
  | "synthesized";

interface SuggestionItem {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  fit_score: number;
  fit_reasoning: string;
  discovered: boolean;
  discovery_source?: DiscoverySource;
  mcp_endpoint?: string;
  homepage_url?: string;
}

interface SuggestResponse {
  query: string;
  suggestions: SuggestionItem[];
  best_fit_score: number;
  low_confidence: boolean;
  recommend_discovery: boolean;
}

interface DiscoverResponse {
  specialist: SuggestionItem & {
    system_prompt: string;
    discovered_for?: string;
    discovery_source?: DiscoverySource;
    mcp_endpoint?: string;
    homepage_url?: string;
  };
  source: DiscoverySource;
  rationale: string;
  verified_tools: string[];
  persisted: boolean;
}

interface Props {
  prompt: string;
  taskType: string;
}

const DEBOUNCE_MS = 600;
const MIN_PROMPT_LEN = 12;

function postJson(url: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isPromptTooShort(prompt: string): boolean {
  return prompt.trim().length < MIN_PROMPT_LEN;
}

export function AgentSuggestions({ prompt, taskType }: Props) {
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoverResponse | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    setDiscovered(null);
    setRefreshWarning(null);
    if (isPromptTooShort(prompt)) {
      setData(null);
      setError(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    const isCurrent = () => myReq === reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await postJson("/api/v1/suggest", {
          prompt,
          task_type: taskType,
          top_n: 3,
        });
        const json = await res.json();
        if (!isCurrent()) return;
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "suggest failed");
        }
        setData(json as SuggestResponse);
      } catch (e) {
        if (!isCurrent()) return;
        setError(errorMessage(e));
        setData(null);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [prompt, taskType]);

  async function refreshAfterDiscovery() {
    reqIdRef.current += 1;
    const reReq = reqIdRef.current;
    const refresh = await postJson("/api/v1/suggest", {
      prompt,
      task_type: taskType,
      top_n: 3,
    });
    const refreshJson = await refresh.json();
    if (reReq !== reqIdRef.current) return;
    if (refresh.ok) {
      setData(refreshJson as SuggestResponse);
      return;
    }
    setRefreshWarning(
      refreshJson?.error?.message ??
        "Specialist was added, but refreshing recommendations failed.",
    );
  }

  async function onDiscover() {
    setDiscovering(true);
    setError(null);
    setRefreshWarning(null);
    try {
      const res = await postJson("/api/v1/discover", {
        prompt,
        task_type: taskType,
        persist: true,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "discover failed");
      setDiscovered(json as DiscoverResponse);
      await refreshAfterDiscovery();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDiscovering(false);
    }
  }

  if (isPromptTooShort(prompt)) return null;

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Recommended specialists"
        meta={<SuggestionMeta loading={loading} data={data} />}
      />

      <SuggestionBody
        loading={loading}
        error={error}
        refreshWarning={refreshWarning}
        data={data}
      />

      {data && data.recommend_discovery && (
        <DiscoveryPrompt discovering={discovering} onDiscover={onDiscover} />
      )}

      {discovered && <DiscoveredSpecialist discovered={discovered} />}
    </Card>
  );
}

function SuggestionBody({
  loading,
  error,
  refreshWarning,
  data,
}: {
  loading: boolean;
  error: string | null;
  refreshWarning: string | null;
  data: SuggestResponse | null;
}) {
  return (
    <>
      {error && (
        <p
          className="mb-2 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {refreshWarning && (
        <p className="mb-2 rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-700">
          {refreshWarning}
        </p>
      )}

      <SuggestionResults loading={loading} error={error} data={data} />
    </>
  );
}

function SuggestionResults({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: SuggestResponse | null;
}) {
  return (
    <>
      {loading && !data && <SuggestionSkeleton />}

      {!loading && !error && data && data.suggestions.length === 0 && (
        <p className="text-sm text-ink-muted">
          No specialist matched yet. Try discovery to spawn one.
        </p>
      )}

      {data && data.suggestions.length > 0 && (
        <ul className="divide-y divide-line">
          {data.suggestions.map((s) => (
            <SuggestionRow key={s.agent_id} item={s} />
          ))}
        </ul>
      )}
    </>
  );
}

function SuggestionMeta({
  loading,
  data,
}: {
  loading: boolean;
  data: SuggestResponse | null;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <CircleNotch size={12} className="animate-spin" />
        Scoring
      </span>
    );
  }
  if (!data) return null;
  if (data.low_confidence) {
    return <span className="text-warning-700">Weak match</span>;
  }
  return (
    <span>
      Top fit{" "}
      <span className="type-data text-ink">
        {formatScore(data.best_fit_score)}
      </span>
    </span>
  );
}

function DiscoveryPrompt({
  discovering,
  onDiscover,
}: {
  discovering: boolean;
  onDiscover: () => void;
}) {
  return (
    <div className="mt-4 flex animate-fade-up items-start gap-4 rounded-control bg-warning-50 p-4 text-sm text-ink">
      <Treeling seed="no-strong-match" asleep alive={false} size={56} />
      <div>
        <p className="font-medium">
          No strong match in the current roster.
        </p>
        <p className="mt-1 text-[0.8125rem] text-ink-soft">
          Spawn a tailor-made specialist for this task. It joins the
          registry and competes alongside the existing specialists.
        </p>
        <button
          type="button"
          onClick={onDiscover}
          disabled={discovering}
          className={buttonClasses({
            variant: "secondary",
            size: "sm",
            className: "mt-3",
          })}
        >
          {discovering ? (
            <>
              <CircleNotch size={12} className="animate-spin" />
              Synthesizing...
            </>
          ) : (
            <>
              <Sparkle size={12} weight="fill" />
              Discover a new specialist
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DiscoveredSpecialist({ discovered }: { discovered: DiscoverResponse }) {
  return (
    <div className="mt-4 animate-fade-up rounded-control bg-brand-50 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-medium text-brand-700">
          <Lightning size={14} weight="fill" />
          New specialist: {discovered.specialist.display_name}
        </p>
        <SourceBadge
          discovered
          source={discovered.source}
          hasEndpoint={!!discovered.specialist.mcp_endpoint}
        />
      </div>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">
        {discovered.specialist.sponsor}: {discovered.specialist.one_liner}
      </p>
      {discovered.specialist.mcp_endpoint && (
        <p className="type-data mt-1 truncate text-xs text-ink-soft">
          MCP: {discovered.specialist.mcp_endpoint}
        </p>
      )}
      <p className="mt-1 text-[0.8125rem] text-ink-soft">
        Capabilities: {discovered.specialist.capabilities.join(", ")}
      </p>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">
        {discovered.rationale}
      </p>
      {discovered.verified_tools.length > 0 && (
        <p className="mt-1 flex items-start gap-1 text-[0.8125rem] text-moss-700">
          <Check
            size={14}
            weight="bold"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          tools/list: {discovered.verified_tools.slice(0, 6).join(", ")}
          {discovered.verified_tools.length > 6 ? "…" : ""}
        </p>
      )}
      {discovered.source === "synthesized" && (
        <p className="mt-1 text-[0.8125rem] text-warning-700">
          No real MCP backend matched. This is an LLM-only fallback.
        </p>
      )}
    </div>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-1">
          <div className="shimmer size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="shimmer h-3.5 w-1/3 rounded-full" />
            <div className="shimmer h-3 w-3/4 rounded-full" />
          </div>
          <div className="shimmer h-8 w-16 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function SourceBadge({
  discovered,
  source,
  hasEndpoint,
}: {
  discovered: boolean;
  source?: DiscoverySource;
  hasEndpoint: boolean;
}) {
  if (!discovered) return null;
  const map: Record<DiscoverySource, { label: string; tone: PillTone }> = {
    google: { label: "Search, Google", tone: "success" },
    catalog: { label: "MCP, catalog", tone: "success" },
    registry: { label: "MCP, registry", tone: "success" },
    a2a: { label: "A2A", tone: "success" },
    synthesized: { label: "Synthesized", tone: "warning" },
  };
  const fallback: { label: string; tone: PillTone } = hasEndpoint
    ? { label: "MCP", tone: "success" }
    : { label: "Synthesized", tone: "warning" };
  const meta = source ? map[source] : fallback;
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

function SuggestionRow({ item }: { item: SuggestionItem }) {
  return (
    <li className="flex animate-fade-up items-start gap-3 py-3 text-sm">
      <Treeling
        seed={item.agent_id}
        capabilities={item.capabilities}
        name={item.display_name}
        alive={false}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-ink">
          <span className="font-medium">{item.display_name}</span>
          <SourceBadge
            discovered={item.discovered}
            source={item.discovery_source}
            hasEndpoint={!!item.mcp_endpoint}
          />
        </div>
        <p className="text-[0.8125rem] text-ink-muted">
          {item.sponsor}: {item.one_liner}
        </p>
        <p className="mt-1 text-[0.8125rem] text-ink-soft">
          {item.fit_reasoning}
        </p>
      </div>
      <dl className="shrink-0 text-right text-[0.8125rem]">
        <dt className="text-ink-muted">Fit</dt>
        <dd className="type-data text-ink">{formatScore(item.fit_score)}</dd>
        <dt className="mt-1 text-ink-muted">Cost</dt>
        <dd className="type-data text-ink">
          {formatMoney(item.cost_baseline)}
        </dd>
      </dl>
    </li>
  );
}
