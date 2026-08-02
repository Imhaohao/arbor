// Presentation logic for the DAG progress view (Layer 5 pure helpers).
//
// Kept out of the React component so the arithmetic that users read as "how far
// along is my video" is unit-testable. A progress bar that lies is worse than no
// progress bar, and the failure modes here are all silent ones: counting a failed
// node as done, showing 100% while work is still running, or rendering a stalled
// pipeline as healthy.

/** Mirrors the `status` union on the hive_nodes table. */
export type NodeStatus =
  | "pending"
  | "ready"
  | "auctioned"
  | "executing"
  | "complete"
  | "failed";

export interface ProgressNode {
  node_id: string;
  description: string;
  depends_on: string[];
  status: NodeStatus;
  assigned_agent_id?: string;
  eval_score?: number;
  cost_paid?: number;
  settled_at?: number;
  task_class?: string;
}

/** Terminal states — a node in one of these will not change again. */
const TERMINAL: readonly NodeStatus[] = ["complete", "failed"];
/** States where an agent is actively working. */
const ACTIVE: readonly NodeStatus[] = ["ready", "auctioned", "executing"];

export function isTerminal(status: NodeStatus): boolean {
  return TERMINAL.includes(status);
}

export function isActive(status: NodeStatus): boolean {
  return ACTIVE.includes(status);
}

/**
 * Group nodes into dependency levels. Nodes in the same level have no
 * dependency between them and run in parallel — which is exactly what the media
 * pipeline does with generate_video and generate_music.
 *
 * Unlike `topologicalLevels` in dag.ts, this tolerates malformed input: a node
 * naming a dependency that is not present is placed at the root rather than
 * dropped, because hiding a node from a progress view is worse than showing it
 * slightly out of order. A dependency cycle terminates instead of looping, with
 * the unresolved nodes appended as a final level.
 */
export function progressLevels(nodes: ProgressNode[]): ProgressNode[][] {
  const present = new Set(nodes.map((n) => n.node_id));
  const remaining = new Map(nodes.map((n) => [n.node_id, n]));
  const placed = new Set<string>();
  const levels: ProgressNode[][] = [];

  while (remaining.size > 0) {
    const level: ProgressNode[] = [];
    for (const node of remaining.values()) {
      // Dependencies that do not exist in this DAG cannot gate anything.
      const blockers = node.depends_on.filter(
        (d) => present.has(d) && !placed.has(d),
      );
      if (blockers.length === 0) level.push(node);
    }
    if (level.length === 0) {
      // Cycle or unsatisfiable dependency: emit what is left and stop rather
      // than spinning forever.
      levels.push([...remaining.values()]);
      break;
    }
    for (const node of level) {
      remaining.delete(node.node_id);
      placed.add(node.node_id);
    }
    levels.push(level);
  }
  return levels;
}

export interface DagProgress {
  total: number;
  complete: number;
  failed: number;
  active: number;
  pending: number;
  /** Fraction of nodes in a terminal state, 0..1. */
  fraction: number;
  /** Whole-percent form for display. */
  percent: number;
  /** True when every node has reached a terminal state. */
  settled: boolean;
  /** True when at least one node failed. */
  hasFailure: boolean;
  /** Node currently being worked, for a one-line status. */
  currentNodeId?: string;
}

/**
 * Summarise a DAG for the header line.
 *
 * `fraction` counts TERMINAL nodes, so a failed node counts as resolved — it is
 * not coming back. `settled` and `hasFailure` are reported separately so the UI
 * can show "5/5 · 1 failed" rather than a green 100% over a broken pipeline.
 */
export function summarizeProgress(nodes: ProgressNode[]): DagProgress {
  const total = nodes.length;
  let complete = 0;
  let failed = 0;
  let active = 0;
  for (const n of nodes) {
    if (n.status === "complete") complete += 1;
    else if (n.status === "failed") failed += 1;
    else if (isActive(n.status)) active += 1;
  }
  const terminal = complete + failed;
  const pending = total - terminal - active;
  // An empty DAG is 0%, not NaN and not 100% — there is nothing to be done with.
  const fraction = total === 0 ? 0 : terminal / total;
  const firstActive = nodes.find((n) => isActive(n.status));
  return {
    total,
    complete,
    failed,
    active,
    pending,
    fraction,
    percent: Math.round(fraction * 100),
    settled: total > 0 && terminal === total,
    hasFailure: failed > 0,
    currentNodeId: firstActive?.node_id,
  };
}

/** Visual treatment for one node status. `tone` maps to the palette in the UI. */
export interface StatusPresentation {
  label: string;
  tone: "done" | "running" | "waiting" | "error";
}

export function presentStatus(status: NodeStatus): StatusPresentation {
  switch (status) {
    case "complete":
      return { label: "Complete", tone: "done" };
    case "failed":
      return { label: "Failed", tone: "error" };
    case "executing":
      return { label: "Running", tone: "running" };
    case "auctioned":
      return { label: "Agent selected", tone: "running" };
    case "ready":
      return { label: "Awaiting agent", tone: "running" };
    case "pending":
      return { label: "Waiting", tone: "waiting" };
    default: {
      // Exhaustiveness guard: a new status added to the schema surfaces here
      // rather than rendering as a blank chip.
      const exhaustive: never = status;
      return { label: String(exhaustive), tone: "waiting" };
    }
  }
}

/** Human label for a node id. Falls back to the raw id when unmapped. */
const NODE_LABELS: Record<string, string> = {
  creative_brief: "Creative brief",
  generate_video: "Video generation",
  generate_music: "Music",
  edit_video: "Editing",
  media_review: "Review",
  main: "Task",
};

export function nodeLabel(nodeId: string): string {
  return (
    NODE_LABELS[nodeId] ??
    nodeId.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Compact elapsed string. Returns undefined when there is no usable start. */
export function elapsedLabel(
  startedAtMs: number | undefined,
  nowMs: number,
): string | undefined {
  if (
    startedAtMs === undefined ||
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(nowMs)
  ) {
    return undefined;
  }
  const seconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Total settled spend across nodes. Undefined when nothing has settled. */
export function totalSpend(nodes: ProgressNode[]): number | undefined {
  const paid = nodes
    .map((n) => n.cost_paid)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  if (paid.length === 0) return undefined;
  return Number(paid.reduce((a, b) => a + b, 0).toFixed(4));
}

/**
 * One-line status for the panel header.
 *
 * Deliberately never claims success while a failure exists: a pipeline that
 * finished with a failed node reads as "finished with 1 failed step", not
 * "complete".
 */
export function headlineFor(progress: DagProgress): string {
  if (progress.total === 0) return "No steps planned yet";
  if (progress.settled) {
    return progress.hasFailure
      ? `Finished with ${progress.failed} failed step${progress.failed === 1 ? "" : "s"}`
      : "All steps complete";
  }
  if (progress.active > 0) {
    const current = progress.currentNodeId
      ? nodeLabel(progress.currentNodeId)
      : "a step";
    return `Running ${current} — ${progress.complete}/${progress.total} done`;
  }
  if (progress.hasFailure) {
    return `Stalled after ${progress.failed} failed step${progress.failed === 1 ? "" : "s"}`;
  }
  return `Queued — ${progress.complete}/${progress.total} done`;
}
