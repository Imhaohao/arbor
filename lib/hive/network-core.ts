// Graph + playback model for the agent network canvas.
//
// The canvas is meant to look like a network of agents working together, and the
// one rule that keeps it from being decoration is: **no arrow without a row
// behind it**. Every node is an agent that actually wrote something, every edge
// is either a real task dependency (hive_nodes.depends_on) or a real verdict
// (hive_evaluations), and every label is that agent's own recorded text at that
// timestamp. Nothing here synthesizes activity to fill space.
//
// Layout is deterministic and pure so the arrangement is testable and stable
// across renders — a graph that reshuffles on every tick reads as noise.

export type AgentRole = "planner" | "worker" | "judge" | "control";

export interface NetworkAgent {
  agent_id: string;
  role: AgentRole;
  x: number;
  y: number;
  firstAt: number;
  lastAt: number;
  eventCount: number;
}

export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  kind: "handoff" | "verdict" | "plan";
  /** How many recorded rows back this edge. Never zero. */
  count: number;
  /** Verdict edges carry the worst verdict seen, so rejections stay visible. */
  rejected?: boolean;
}

export type EventTone = "neutral" | "good" | "bad";

export interface NetworkEvent {
  at: number;
  agent_id: string;
  /** Present when the row names a counterparty (a verdict names who it judged). */
  to_agent_id?: string;
  kind: string;
  node_id?: string;
  label: string;
  tone: EventTone;
  score?: number;
}

export interface AgentNetwork {
  agents: NetworkAgent[];
  edges: NetworkEdge[];
  events: NetworkEvent[];
  startAt: number;
  endAt: number;
}

export interface ScratchpadRow {
  agent_id: string;
  node_id?: string;
  kind: string;
  content: string;
  gist?: string;
  confidence: number;
  created_at: number;
}

export interface NetworkNodeRow {
  node_id: string;
  depends_on: string[];
  assigned_agent_id?: string;
}

export interface NetworkEvaluationRow {
  node_id?: string;
  agent_id: string;
  judge_model: string;
  score: number;
  verdict: "accept" | "reject";
  reasoning: string;
  created_at: number;
}

/** SVG user-space canvas. Rendered with preserveAspectRatio, so units are arbitrary. */
export const CANVAS = { width: 960, height: 440 } as const;

const LANE_X: Record<AgentRole, number> = {
  planner: 100,
  worker: 355,
  judge: 600,
  control: 780,
};

/**
 * Where the delivery terminus sits. It is not an agent — nothing in the record
 * "is" TikTok — so it lives outside the agent lanes and is drawn distinctly.
 */
export const DELIVERY_POS = { x: 935, y: CANVAS.height / 2 } as const;

/**
 * Role is inferred from where an agent appears in the record, not from a
 * hardcoded roster — the agent pool changes per run and a stale roster would
 * silently mislabel new agents.
 */
export function inferRole(agent_id: string, judgeIds: Set<string>): AgentRole {
  if (judgeIds.has(agent_id)) return "judge";
  const id = agent_id.toLowerCase();
  if (id.includes("planner")) return "planner";
  if (id.includes("control")) return "control";
  if (id.includes("judge") || id.includes("evaluator")) return "judge";
  return "worker";
}

/** First non-empty line, trimmed to a label length the canvas can show. */
export function eventLabel(row: { gist?: string; content: string }, max = 90): string {
  const source =
    row.gist && row.gist.trim() && row.gist.trim() !== "{"
      ? row.gist
      : row.content;
  const line =
    source
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && l !== "{") ?? "";
  if (!line) return "(no text recorded)";
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

function toneForKind(kind: string): EventTone {
  if (kind === "critique") return "bad";
  if (kind === "consensus" || kind === "result") return "good";
  return "neutral";
}

export function buildNetwork(input: {
  nodes: NetworkNodeRow[];
  evaluations: NetworkEvaluationRow[];
  entries: ScratchpadRow[];
}): AgentNetwork {
  const judgeIds = new Set(input.evaluations.map((e) => e.judge_model));

  // ── events ───────────────────────────────────────────────────────────────
  const events: NetworkEvent[] = [];
  for (const row of input.entries) {
    events.push({
      at: row.created_at,
      agent_id: row.agent_id,
      kind: row.kind,
      node_id: row.node_id,
      label: eventLabel(row),
      tone: toneForKind(row.kind),
    });
  }
  for (const e of input.evaluations) {
    // DAG-level summary rows name no node and no counterparty worth drawing.
    if (!e.node_id) continue;
    events.push({
      at: e.created_at,
      agent_id: e.judge_model,
      to_agent_id: e.agent_id,
      kind: `verdict:${e.verdict}`,
      node_id: e.node_id,
      label: eventLabel({ content: e.reasoning }),
      tone: e.verdict === "accept" ? "good" : "bad",
      score: e.score,
    });
  }
  events.sort((a, b) => a.at - b.at || a.agent_id.localeCompare(b.agent_id));

  // ── agents ───────────────────────────────────────────────────────────────
  const stats = new Map<
    string,
    { firstAt: number; lastAt: number; eventCount: number }
  >();
  const touch = (agent_id: string, at: number) => {
    const prev = stats.get(agent_id);
    if (!prev) stats.set(agent_id, { firstAt: at, lastAt: at, eventCount: 1 });
    else {
      prev.firstAt = Math.min(prev.firstAt, at);
      prev.lastAt = Math.max(prev.lastAt, at);
      prev.eventCount += 1;
    }
  };
  for (const ev of events) touch(ev.agent_id, ev.at);
  // An agent assigned a node but silent in the record still belongs on the
  // canvas — omitting it would hide a participant that was paid.
  for (const n of input.nodes) {
    if (n.assigned_agent_id && !stats.has(n.assigned_agent_id)) {
      stats.set(n.assigned_agent_id, {
        firstAt: events[0]?.at ?? 0,
        lastAt: events[0]?.at ?? 0,
        eventCount: 0,
      });
    }
  }

  const byRole = new Map<AgentRole, string[]>();
  for (const agent_id of [...stats.keys()].sort((a, b) => {
    const sa = stats.get(a)!;
    const sb = stats.get(b)!;
    return sa.firstAt - sb.firstAt || a.localeCompare(b);
  })) {
    const role = inferRole(agent_id, judgeIds);
    const lane = byRole.get(role);
    if (lane) lane.push(agent_id);
    else byRole.set(role, [agent_id]);
  }

  const agents: NetworkAgent[] = [];
  for (const [role, ids] of byRole) {
    ids.forEach((agent_id, i) => {
      const slot = (i + 1) / (ids.length + 1);
      agents.push({
        agent_id,
        role,
        x: LANE_X[role],
        y: Math.round(CANVAS.height * slot),
        ...stats.get(agent_id)!,
      });
    });
  }
  agents.sort((a, b) => a.x - b.x || a.y - b.y);

  // ── edges ────────────────────────────────────────────────────────────────
  const known = new Set(agents.map((a) => a.agent_id));
  const edgeMap = new Map<string, NetworkEdge>();
  const addEdge = (
    from: string,
    to: string,
    kind: NetworkEdge["kind"],
    rejected?: boolean,
  ) => {
    if (from === to || !known.has(from) || !known.has(to)) return;
    const id = `${kind}:${from}->${to}`;
    const prev = edgeMap.get(id);
    if (prev) {
      prev.count += 1;
      if (rejected) prev.rejected = true;
    } else {
      const edge: NetworkEdge = { id, from, to, kind, count: 1 };
      // Left absent rather than false so a clean edge carries no rejection flag
      // at all — the canvas and the validator both treat presence as the signal.
      if (rejected) edge.rejected = true;
      edgeMap.set(id, edge);
    }
  };

  // Who actually produced output for each node. `assigned_agent_id` records the
  // final assignment after revisions and frequently collapses every node onto
  // one agent, which would erase the handoffs that really happened; the
  // scratchpad result rows name the agent that did the work at the time.
  const executorForNode = new Map<string, string>();
  for (const n of input.nodes) {
    if (n.assigned_agent_id) executorForNode.set(n.node_id, n.assigned_agent_id);
  }
  for (const row of input.entries) {
    if (!row.node_id) continue;
    if (row.kind !== "result") continue;
    executorForNode.set(row.node_id, row.agent_id);
  }

  for (const n of input.nodes) {
    const to = executorForNode.get(n.node_id);
    if (!to) continue;
    for (const dep of n.depends_on) {
      const from = executorForNode.get(dep);
      if (from) addEdge(from, to, "handoff");
    }
  }

  // The planner authored the decomposition, so it feeds the agents that executed
  // the root nodes. Backed by the planner's own proposal row plus those nodes'
  // result rows — not drawn when the planner never wrote a proposal.
  const planners = new Set(
    input.entries
      .filter((e) => e.kind === "proposal")
      .map((e) => e.agent_id)
      .filter((id) => inferRole(id, judgeIds) === "planner"),
  );
  for (const planner of planners) {
    for (const n of input.nodes) {
      if (n.depends_on.length > 0) continue;
      const to = executorForNode.get(n.node_id);
      if (to) addEdge(planner, to, "plan");
    }
  }

  for (const e of input.evaluations) {
    if (!e.node_id) continue;
    addEdge(e.judge_model, e.agent_id, "verdict", e.verdict === "reject");
  }

  // Critiques are the other recorded judgement channel — an evaluator that wrote
  // a critique about a node judged whoever executed it.
  for (const row of input.entries) {
    if (row.kind !== "critique" || !row.node_id) continue;
    const to = executorForNode.get(row.node_id);
    if (to) addEdge(row.agent_id, to, "verdict", true);
  }

  return {
    agents,
    edges: [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    events,
    startAt: events[0]?.at ?? 0,
    endAt: events[events.length - 1]?.at ?? 0,
  };
}

export interface NetworkFrame {
  /** Latest event per agent at or before the cursor. */
  perAgent: Map<string, NetworkEvent>;
  /** Edge ids carrying an event inside the recency window. */
  hotEdges: Set<string>;
  /** Agents that have not acted yet at this cursor. */
  idle: Set<string>;
  elapsedMs: number;
  eventsSoFar: number;
}

/** How long an edge stays lit after the event that fired it. */
export const HOT_WINDOW_MS = 6000;

/**
 * Reduce the network to what should be on screen at `cursor`. Pure so playback
 * is scrubbable in both directions and identical for a given cursor — the frame
 * must not depend on which frames were rendered before it.
 */
export function frameAt(
  network: AgentNetwork,
  cursor: number,
  hotWindowMs = HOT_WINDOW_MS,
): NetworkFrame {
  const perAgent = new Map<string, NetworkEvent>();
  const hotEdges = new Set<string>();
  let eventsSoFar = 0;

  for (const ev of network.events) {
    if (ev.at > cursor) break;
    eventsSoFar += 1;
    perAgent.set(ev.agent_id, ev);
    if (ev.to_agent_id && cursor - ev.at <= hotWindowMs) {
      const kind = ev.kind.startsWith("verdict") ? "verdict" : "handoff";
      hotEdges.add(`${kind}:${ev.agent_id}->${ev.to_agent_id}`);
    }
  }

  // A node completing lights the dependency edges leaving it, which is how the
  // canvas shows work moving forward rather than only being judged.
  for (const ev of network.events) {
    if (ev.at > cursor || cursor - ev.at > hotWindowMs) continue;
    const lights =
      ev.kind === "result" || ev.kind === "decision"
        ? "handoff"
        : ev.kind === "proposal"
          ? "plan"
          : null;
    if (!lights) continue;
    for (const edge of network.edges) {
      if (edge.kind === lights && edge.from === ev.agent_id) {
        hotEdges.add(edge.id);
      }
    }
  }

  const idle = new Set(
    network.agents.filter((a) => !perAgent.has(a.agent_id)).map((a) => a.agent_id),
  );

  return {
    perAgent,
    hotEdges,
    idle,
    elapsedMs: Math.max(0, cursor - network.startAt),
    eventsSoFar,
  };
}

/**
 * Longest stretch of dead air playback will render before skipping ahead.
 * Real runs idle for tens of seconds between bursts (planning, then a long wait
 * for the first agent to answer). Played back literally, that reads as a frozen
 * canvas, so gaps are capped — the clock still reports true elapsed time, so the
 * compression changes pacing without misreporting when anything happened.
 */
export const MAX_IDLE_GAP_MS = 3500;

export interface Timeline {
  /** Monotonic pairs mapping compressed playback time to real timestamps. */
  points: Array<{ play: number; real: number }>;
  playDuration: number;
}

export function compressTimeline(
  network: AgentNetwork,
  maxGapMs = MAX_IDLE_GAP_MS,
): Timeline {
  if (network.events.length === 0) {
    return { points: [{ play: 0, real: network.startAt }], playDuration: 0 };
  }

  const points: Array<{ play: number; real: number }> = [
    { play: 0, real: network.events[0].at },
  ];
  let play = 0;
  for (let i = 1; i < network.events.length; i++) {
    const realGap = network.events[i].at - network.events[i - 1].at;
    if (realGap <= 0) continue;
    play += Math.min(realGap, maxGapMs);
    points.push({ play, real: network.events[i].at });
  }
  return { points, playDuration: play };
}

/** Map a compressed playback position back to the real timestamp it represents. */
export function realAt(timeline: Timeline, play: number): number {
  const { points } = timeline;
  if (points.length === 0) return 0;
  if (play <= points[0].play) return points[0].real;
  const last = points[points.length - 1];
  if (play >= last.play) return last.real;

  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].play <= play) lo = mid;
    else hi = mid;
  }
  const span = points[hi].play - points[lo].play;
  if (span <= 0) return points[hi].real;
  const t = (play - points[lo].play) / span;
  return points[lo].real + t * (points[hi].real - points[lo].real);
}

/** Total wall-clock span of the run, in ms. Zero for a single-event run. */
export function networkDurationMs(network: AgentNetwork): number {
  return Math.max(0, network.endAt - network.startAt);
}

/** Cubic bezier between two agents, bowed so parallel edges stay distinguishable. */
export function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bow = 0.35,
): string {
  const dx = to.x - from.x;
  const c1x = from.x + dx * bow;
  const c2x = to.x - dx * bow;
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}
