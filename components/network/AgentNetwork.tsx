"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
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
  type AgentNetwork as NetworkModel,
  type AgentRole,
  type NetworkAgent,
  type NetworkFrame,
  type Timeline,
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

type AgentTone = "neutral" | "good" | "bad";

const TONE_RING: Record<AgentTone, string> = {
  neutral: "shadow-hairline-strong",
  good: "shadow-[0_0_0_1.5px_oklch(var(--moss-400))]",
  bad: "shadow-[0_0_0_1.5px_oklch(var(--danger-400))]",
};

const TONE_ICON: Record<AgentTone, string> = {
  neutral: "text-brand-700",
  good: "text-moss-700",
  bad: "text-danger-700",
};

const STROKE_IDLE = "oklch(var(--line-strong))";
const STROKE_HOT = "oklch(var(--glow))";
const STROKE_REJECT = "oklch(var(--danger-500))";

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

function AgentCard({
  agent,
  label,
  tone = "neutral",
  active,
  idle,
}: {
  agent: NetworkAgent;
  label?: string;
  tone?: AgentTone;
  active: boolean;
  idle: boolean;
}) {
  const Icon = ROLE_ICON[agent.role];
  const ring = idle ? "shadow-hairline" : TONE_RING[tone];

  return (
    <div
      className="absolute w-[9.5rem] -translate-x-1/2 -translate-y-1/2"
      style={{ left: pct(agent.x, CANVAS.width), top: pct(agent.y, CANVAS.height) }}
    >
      <div
        className={`flex items-start gap-2 rounded-control bg-surface p-2 transition-[box-shadow,opacity,scale] duration-300 ${ring} ${
          active ? "scale-[1.04] shadow-card-hover" : ""
        } ${idle ? "opacity-60" : "opacity-100"}`}
      >
        <Treeling
          seed={agent.agent_id}
          species={agent.role === "judge" ? "birch" : undefined}
          size={40}
          asleep={idle}
          pose={active && agent.role === "worker" ? "raised" : "rest"}
          lantern={active && tone === "good"}
          alive={active}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Icon size={12} weight="fill" aria-hidden className={idle ? "text-ink-subtle" : TONE_ICON[tone]} />
            <span className="text-xs text-ink-muted">{ROLE_LABEL[agent.role]}</span>
          </div>
          <code className="type-data block truncate text-xs font-semibold text-ink" title={agent.agent_id}>
            {agent.agent_id}
          </code>
          <p className="line-clamp-2 text-xs leading-snug text-ink-soft">
            {idle ? "waiting" : (label ?? "")}
          </p>
        </div>
      </div>
      {active && (
        <span className="absolute -right-1 -top-1 size-2.5 animate-soft-pulse rounded-full bg-glow shadow-lantern" />
      )}
    </div>
  );
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="5"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: color }} />
    </marker>
  );
}

const EDGE_DASH: Record<string, string | undefined> = {
  verdict: "5 4",
  plan: "1 5",
};

function edgeLook(hot: boolean, rejected: boolean) {
  if (!hot) return { stroke: STROKE_IDLE, marker: "url(#arrow-cool)" };
  if (rejected) return { stroke: STROKE_REJECT, marker: "url(#arrow-reject)" };
  return { stroke: STROKE_HOT, marker: "url(#arrow-hot)" };
}

function PlaybackControls({
  playing,
  play,
  playDuration,
  onToggle,
  onScrub,
}: {
  playing: boolean;
  play: number;
  playDuration: number;
  onToggle: () => void;
  onScrub: (value: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={playing}
        aria-label={playing ? "Pause playback" : "Play run"}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper outline-none transition-[background-color,scale] hover:bg-ink-soft focus-visible:shadow-ring active:scale-[0.96]"
      >
        {playing ? <Pause size={16} weight="fill" aria-hidden /> : <Play size={16} weight="fill" aria-hidden />}
      </button>
      <input
        type="range"
        min={0}
        max={playDuration}
        value={play}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-brand-600"
        aria-label="Run timeline"
      />
    </div>
  );
}

function NetworkMessage({ children, asleep = false }: { children: string; asleep?: boolean }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <Treeling seed="agent-network" asleep={asleep} alive={false} size={72} />
      <p className="type-body text-ink-muted">{children}</p>
    </Card>
  );
}

function deliveryCaption(
  delivery: { configured: boolean; draftOnly?: boolean },
  delivered: boolean,
): string {
  if (!delivery.configured) return "not configured";
  if (!delivered) return "no artifact";
  return delivery.draftOnly ? "draft in inbox" : "posted";
}

function DeliveryNode({
  deliveryLive,
  caption,
}: {
  deliveryLive: boolean;
  caption: string;
}) {
  return (
    <div
      className="absolute w-[120px] -translate-x-1/2 -translate-y-1/2 text-center"
      style={{
        left: pct(DELIVERY_POS.x, CANVAS.width),
        top: pct(DELIVERY_POS.y, CANVAS.height),
      }}
    >
      <div
        className={`rounded-control p-2.5 ${
          deliveryLive ? "bg-moss-50 shadow-hairline-strong" : "bg-surface shadow-hairline"
        }`}
      >
        <TiktokLogo
          size={18}
          weight="fill"
          aria-hidden
          className={`mx-auto ${deliveryLive ? "text-moss-700" : "text-ink-subtle"}`}
        />
        <div className="mt-1 text-xs font-semibold text-ink">TikTok</div>
        <div className="mt-0.5 text-xs leading-tight text-ink-muted">{caption}</div>
      </div>
    </div>
  );
}

function NetworkEdges({
  network,
  frame,
  deliveryLive,
}: {
  network: NetworkModel;
  frame: NetworkFrame;
  deliveryLive: boolean;
}) {
  const posOf = (id: string) => network.agents.find((a) => a.agent_id === id);

  return (
    <svg
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <ArrowMarker id="arrow-cool" color={STROKE_IDLE} />
        <ArrowMarker id="arrow-hot" color={STROKE_HOT} />
        <ArrowMarker id="arrow-reject" color={STROKE_REJECT} />
      </defs>

      {network.edges.map((edge) => {
        const from = posOf(edge.from);
        const to = posOf(edge.to);
        if (!from || !to) return null;
        const hot = frame.hotEdges.has(edge.id);
        const look = edgeLook(hot, Boolean(edge.rejected));
        return (
          <path
            key={edge.id}
            d={edgePath(from, to)}
            fill="none"
            style={{ stroke: look.stroke }}
            className="transition-[stroke,stroke-width] duration-500"
            strokeWidth={hot ? 2.4 : 1}
            strokeDasharray={EDGE_DASH[edge.kind]}
            markerEnd={look.marker}
            opacity={hot ? 1 : 0.8}
          />
        );
      })}

      {/* Delivery leg. Dashed and muted because no recorded row backs it
          until an artifact exists, so the canvas must not imply a handoff
          that never happened. */}
      <path
        d={edgePath(
          { x: 860, y: CANVAS.height / 2 },
          DELIVERY_POS,
        )}
        fill="none"
        style={{ stroke: deliveryLive ? STROKE_HOT : STROKE_IDLE }}
        strokeWidth={deliveryLive ? 2.4 : 1}
        strokeDasharray="3 6"
        markerEnd={deliveryLive ? "url(#arrow-hot)" : "url(#arrow-cool)"}
      />
    </svg>
  );
}

function NetworkAgentCards({
  network,
  frame,
  at,
}: {
  network: NetworkModel;
  frame: NetworkFrame;
  at: number;
}) {
  return (
    <>
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
    </>
  );
}

function NetworkLegend({
  network,
  tiktokConfigured,
}: {
  network: NetworkModel;
  tiktokConfigured: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 shadow-[0_-1px_0_oklch(var(--line))]">
      <Pill tone="neutral">{network.agents.length} agents</Pill>
      <Pill tone="neutral">{network.edges.length} edges</Pill>
      <Pill tone={tiktokConfigured ? "info" : "warning"}>
        {tiktokConfigured
          ? "TikTok configured"
          : "TIKTOK_ACCESS_TOKEN not set"}
      </Pill>
      <span className="text-[0.8125rem] text-ink-muted">
        Solid edges are task handoffs, dashed are verdicts, dotted is the plan.
        Every edge is backed by a recorded row.
      </span>
    </div>
  );
}

function usePlayback(dagId: string, playDuration: number) {
  const [play, setPlay] = useState(0);
  const [playing, setPlaying] = useState(true);

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

  function toggle() {
    if (!playing && play >= playDuration) setPlay(0);
    setPlaying(!playing);
  }

  function scrub(value: number) {
    setPlaying(false);
    setPlay(value);
  }

  return { play, playing, toggle, scrub };
}

type NetworkData = NonNullable<FunctionReturnType<typeof api.hiveNetwork.network>>;

function NetworkPlayer({
  data,
  network,
  timeline,
  playDuration,
  play,
  playing,
  onToggle,
  onScrub,
}: {
  data: NetworkData;
  network: NetworkModel;
  timeline: Timeline;
  playDuration: number;
  play: number;
  playing: boolean;
  onToggle: () => void;
  onScrub: (value: number) => void;
}) {
  const span = networkDurationMs(network);
  const at = realAt(timeline, play);
  const frame = frameAt(network, at);

  const delivered = data.delivery.artifacts.find((a) => a.status === "ready");
  const deliveryLive = Boolean(delivered) && data.delivery.configured;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Agent network"
        meta={
          <span className="flex items-center gap-2">
            <span className="type-data text-xs">
              {(frame.elapsedMs / 1000).toFixed(1)}s / {(span / 1000).toFixed(1)}s
            </span>
            <span className="text-xs">
              {frame.eventsSoFar}/{network.events.length} events
            </span>
          </span>
        }
      />

      <div
        className="relative w-full rounded-control bg-surface-subtle"
        style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}
      >
        <NetworkEdges network={network} frame={frame} deliveryLive={deliveryLive} />
        <NetworkAgentCards network={network} frame={frame} at={at} />
        <DeliveryNode
          deliveryLive={deliveryLive}
          caption={deliveryCaption(data.delivery, Boolean(delivered))}
        />
      </div>

      <PlaybackControls
        playing={playing}
        play={play}
        playDuration={playDuration}
        onToggle={onToggle}
        onScrub={onScrub}
      />

      <NetworkLegend network={network} tiktokConfigured={data.delivery.configured} />
    </Card>
  );
}

function useNetworkModel(data: NetworkData | null | undefined) {
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

  const playDuration = timeline?.playDuration ?? 0;
  return { network, timeline, playDuration };
}

export function AgentNetwork({ dagId }: Props) {
  const data = useQuery(api.hiveNetwork.network, {
    dag_id: dagId as Id<"hive_dags">,
  });
  const { network, timeline, playDuration } = useNetworkModel(data);

  // Both effects key off primitives, never off the derived objects. A Convex
  // subscription hands back a fresh result object on re-render, so depending on
  // `network`/`timeline` identity restarts the interval and re-fires the reset
  // every tick — playback crawls and never leaves the first event.
  const { play, playing, toggle, scrub } = usePlayback(dagId, playDuration);

  if (data === undefined || (data !== null && !timeline)) {
    return (
      <div className="shimmer h-80 rounded-card" role="status" aria-label="Loading network" />
    );
  }
  if (data === null || !network || !timeline) {
    return (
      <NetworkMessage asleep>No run found for this id.</NetworkMessage>
    );
  }
  if (network.agents.length === 0) {
    return (
      <NetworkMessage asleep>This run recorded no agent activity.</NetworkMessage>
    );
  }

  return (
    <NetworkPlayer
      data={data}
      network={network}
      timeline={timeline}
      playDuration={playDuration}
      play={play}
      playing={playing}
      onToggle={toggle}
      onScrub={scrub}
    />
  );
}
