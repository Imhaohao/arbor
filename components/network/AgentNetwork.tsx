"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Compass,
  Flag,
  Pause,
  Play,
  Robot,
  Scales,
  TiktokLogo,
} from "@phosphor-icons/react";
import {
  buildNetwork,
  CANVAS,
  compressTimeline,
  DELIVERY_POS,
  edgePath,
  frameAt,
  networkDurationMs,
  realAt,
  type AgentRole,
  type NetworkAgent,
} from "@/lib/hive/network-core";

interface Props {
  dagId: string;
}

/** Real runs take minutes; playback compresses the whole span into this window. */
const PLAYBACK_SECONDS = 26;
const TICK_MS = 80;

const ROLE_ICON: Record<AgentRole, typeof Robot> = {
  planner: Compass,
  worker: Robot,
  judge: Scales,
  control: Flag,
};

const ROLE_LABEL: Record<AgentRole, string> = {
  planner: "planner",
  worker: "worker",
  judge: "judge",
  control: "control",
};

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

function AgentCard({
  agent,
  label,
  tone,
  active,
  idle,
}: {
  agent: NetworkAgent;
  label?: string;
  tone?: "neutral" | "good" | "bad";
  active: boolean;
  idle: boolean;
}) {
  const Icon = ROLE_ICON[agent.role];
  const ring = idle
    ? "ring-slate-200"
    : tone === "bad"
      ? "ring-rose-300"
      : tone === "good"
        ? "ring-emerald-300"
        : "ring-brand-300";
  const iconTone = idle
    ? "text-slate-300"
    : tone === "bad"
      ? "text-rose-600"
      : tone === "good"
        ? "text-emerald-600"
        : "text-brand-600";

  return (
    <div
      className="absolute w-[150px] -translate-x-1/2 -translate-y-1/2"
      style={{ left: pct(agent.x, CANVAS.width), top: pct(agent.y, CANVAS.height) }}
    >
      <div
        className={`rounded-xl bg-white p-2.5 shadow-card ring-1 transition-all duration-300 ${ring} ${
          active ? "scale-[1.04] shadow-card-hover" : ""
        } ${idle ? "opacity-55" : "opacity-100"}`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`shrink-0 transition-colors ${iconTone}`}>
            <Icon size={15} weight="fill" />
          </span>
          <code className="truncate font-mono text-[10px] font-semibold text-ink">
            {agent.agent_id}
          </code>
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-muted">
          {ROLE_LABEL[agent.role]}
        </div>
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-soft">
          {idle ? "waiting" : (label ?? "—")}
        </p>
      </div>
      {active && (
        <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
        </span>
      )}
    </div>
  );
}

export function AgentNetwork({ dagId }: Props) {
  const data = useQuery(api.hiveNetwork.network, {
    dag_id: dagId as Id<"hive_dags">,
  });

  const network = useMemo(
    () =>
      data
        ? buildNetwork({
            nodes: data.nodes,
            evaluations: data.evaluations,
            entries: data.entries,
          })
        : null,
    [data],
  );

  // Playback runs on compressed time so the long idle gaps between agent bursts
  // do not freeze the canvas; the clock below still reports real elapsed time.
  const timeline = useMemo(
    () => (network ? compressTimeline(network) : null),
    [network],
  );

  const [play, setPlay] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Both effects key off primitives, never off the derived objects. A Convex
  // subscription hands back a fresh result object on re-render, so depending on
  // `network`/`timeline` identity restarts the interval and re-fires the reset
  // every tick — playback crawls and never leaves the first event.
  const playDuration = timeline?.playDuration ?? 0;

  useEffect(() => {
    setPlay(0);
    setPlaying(true);
  }, [dagId]);

  useEffect(() => {
    if (!playing || playDuration <= 0) return;
    const step = (playDuration / (PLAYBACK_SECONDS * 1000)) * TICK_MS;
    const timer = setInterval(() => {
      setPlay((prev) => {
        const next = prev + step;
        if (next >= playDuration) {
          setPlaying(false);
          return playDuration;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, playDuration]);

  if (data === undefined || (data !== null && !timeline)) {
    return (
      <Card className="p-8 text-center text-sm text-ink-muted">
        Loading network…
      </Card>
    );
  }
  if (data === null || !network || !timeline) {
    return (
      <Card className="p-8 text-center text-sm text-ink-muted">
        No run found for this id.
      </Card>
    );
  }
  if (network.agents.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-ink-muted">
        This run recorded no agent activity.
      </Card>
    );
  }

  const span = networkDurationMs(network);
  const at = realAt(timeline, play);
  const frame = frameAt(network, at);
  const posOf = (id: string) => network.agents.find((a) => a.agent_id === id);

  const delivered = data.delivery.artifacts.find((a) => a.status === "ready");
  const deliveryLive = Boolean(delivered) && data.delivery.configured;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Agent network"
        meta={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px]">
              {(frame.elapsedMs / 1000).toFixed(1)}s / {(span / 1000).toFixed(1)}s
            </span>
            <span className="text-[11px]">
              {frame.eventsSoFar}/{network.events.length} events
            </span>
          </span>
        }
      />

      <div
        className="relative w-full rounded-xl bg-surface-muted/40"
        style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}
      >
        <svg
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id="arrow-cool"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-300" />
            </marker>
            <marker
              id="arrow-hot"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-brand-500" />
            </marker>
            <marker
              id="arrow-reject"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-rose-400" />
            </marker>
          </defs>

          {network.edges.map((edge) => {
            const from = posOf(edge.from);
            const to = posOf(edge.to);
            if (!from || !to) return null;
            const hot = frame.hotEdges.has(edge.id);
            const stroke = hot
              ? edge.rejected
                ? "stroke-rose-400"
                : "stroke-brand-500"
              : "stroke-slate-200";
            const marker = hot
              ? edge.rejected
                ? "url(#arrow-reject)"
                : "url(#arrow-hot)"
              : "url(#arrow-cool)";
            return (
              <path
                key={edge.id}
                d={edgePath(from, to)}
                fill="none"
                className={`transition-all duration-500 ${stroke}`}
                strokeWidth={hot ? 2.4 : 1.2}
                strokeDasharray={
                  edge.kind === "verdict"
                    ? "5 4"
                    : edge.kind === "plan"
                      ? "1 5"
                      : undefined
                }
                markerEnd={marker}
                opacity={hot ? 1 : 0.7}
              />
            );
          })}

          {/* Delivery leg. Dashed and muted because no recorded row backs it
              until an artifact exists — the canvas must not imply a handoff
              that never happened. */}
          <path
            d={edgePath(
              { x: 860, y: CANVAS.height / 2 },
              DELIVERY_POS,
            )}
            fill="none"
            className={deliveryLive ? "stroke-emerald-400" : "stroke-slate-200"}
            strokeWidth={deliveryLive ? 2.4 : 1.2}
            strokeDasharray="3 6"
            markerEnd={deliveryLive ? "url(#arrow-hot)" : "url(#arrow-cool)"}
          />
        </svg>

        {network.agents.map((agent) => {
          const current = frame.perAgent.get(agent.agent_id);
          return (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              label={current?.label}
              tone={current?.tone}
              active={Boolean(current) && at - current!.at <= 6000}
              idle={frame.idle.has(agent.agent_id)}
            />
          );
        })}

        <div
          className="absolute w-[120px] -translate-x-1/2 -translate-y-1/2 text-center"
          style={{
            left: pct(DELIVERY_POS.x, CANVAS.width),
            top: pct(DELIVERY_POS.y, CANVAS.height),
          }}
        >
          <div
            className={`rounded-xl border-2 border-dashed p-2.5 ${
              deliveryLive
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-white/70"
            }`}
          >
            <TiktokLogo
              size={18}
              weight="fill"
              className={`mx-auto ${deliveryLive ? "text-emerald-600" : "text-slate-300"}`}
            />
            <div className="mt-1 text-[10px] font-semibold text-ink">TikTok</div>
            <div className="mt-0.5 text-[9px] leading-tight text-ink-muted">
              {!data.delivery.configured
                ? "not configured"
                : delivered
                  ? data.delivery.draftOnly
                    ? "draft in inbox"
                    : "posted"
                  : "no artifact"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!playing && play >= playDuration) setPlay(0);
            setPlaying(!playing);
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause size={14} weight="fill" />
          ) : (
            <Play size={14} weight="fill" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={playDuration}
          value={play}
          onChange={(e) => {
            setPlaying(false);
            setPlay(Number(e.target.value));
          }}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600"
          aria-label="Scrub run timeline"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Pill tone="neutral">{network.agents.length} agents</Pill>
        <Pill tone="neutral">{network.edges.length} edges</Pill>
        <Pill tone={data.delivery.configured ? "info" : "warning"}>
          {data.delivery.configured
            ? "TikTok configured"
            : "TIKTOK_ACCESS_TOKEN not set"}
        </Pill>
        <span className="text-[11px] text-ink-muted">
          Solid edges are task handoffs, dashed are verdicts, dotted is the plan.
          Every edge is backed by a recorded row.
        </span>
      </div>
    </Card>
  );
}
