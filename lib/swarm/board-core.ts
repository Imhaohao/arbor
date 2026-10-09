// Research blackboard for autoresearch. Several subscription agents take
// turns proposing one train.py change each; the lab runs them one at a time
// on the single GPU and posts every outcome back to the shared board, so each
// agent plans its next idea from everyone's results. Pure — the loop that
// spawns agents and runs training lives in research.ts.

import { lastJsonWith } from "./json-reply";
import { COOLDOWN_MS } from "./router-core";
import type { FailureKind } from "./worker-core";

export type ExperimentStatus = "queued" | "running" | "kept" | "discarded" | "crashed" | "stale" | "abandoned";

export interface Experiment {
  id: string;
  author: string;
  hypothesis: string;
  status: ExperimentStatus;
  proposedAt: number;
  valBpb?: number;
  /** Best val_bpb on the board when this experiment was judged. */
  bestBefore?: number;
  peakMemoryGb?: number;
  detail?: string;
}

export interface BoardNote {
  at: number;
  author: string;
  text: string;
}

export interface Board {
  branch: string;
  best: { commit: string; valBpb: number | null; experiment?: string };
  experiments: Experiment[];
  notes: BoardNote[];
}

export const BASELINE_AUTHOR = "lab";

export function newBoard(branch: string, commit: string): Board {
  return { branch, best: { commit, valBpb: null }, experiments: [], notes: [] };
}

export function nextExperimentId(board: Board): string {
  return `e${String(board.experiments.length + 1).padStart(3, "0")}`;
}

/** A restart cannot resume a half-run experiment, so it is marked, not retried. */
export function abandonUnfinished(board: Board): Board {
  const experiments = board.experiments.map((experiment) =>
    experiment.status === "queued" || experiment.status === "running"
      ? { ...experiment, status: "abandoned" as const, detail: "lab restarted before it ran" }
      : experiment,
  );
  return { ...board, experiments };
}

// ── choosing who proposes next ──────────────────────────────────────────────

/** The available agent with the fewest proposals so far, so turns stay fair. */
export function nextAuthor(
  board: Board,
  agents: readonly string[],
  unavailable: ReadonlySet<string>,
): string | undefined {
  const counts = new Map(agents.map((agent) => [agent, 0]));
  for (const experiment of board.experiments) {
    if (counts.has(experiment.author)) counts.set(experiment.author, (counts.get(experiment.author) ?? 0) + 1);
  }
  return agents
    .filter((agent) => !unavailable.has(agent))
    .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
}

const BASE_BENCH_MS = 60 * 1000;
export const MAX_BENCH_MS = 60 * 60 * 1000;

/**
 * How long an agent sits out after its Nth consecutive failure. Doubling
 * stops a broken agent from being retried every minute all night.
 */
export function benchMs(failure: FailureKind | "no_change", consecutiveFailures: number): number {
  const base = (failure === "no_change" ? undefined : COOLDOWN_MS[failure]) ?? BASE_BENCH_MS;
  const doubled = base * 2 ** Math.max(0, consecutiveFailures - 1);
  return Math.min(doubled, MAX_BENCH_MS);
}

// ── judging a finished run ──────────────────────────────────────────────────

export interface TrainingSummary {
  valBpb?: number;
  peakMemoryGb?: number;
}

function summaryNumber(log: string, key: string): number | undefined {
  const match = log.match(new RegExp(`^${key}:\\s*([0-9.]+)`, "m"));
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

export function parseTrainingSummary(log: string): TrainingSummary {
  const peakMb = summaryNumber(log, "peak_vram_mb");
  return {
    valBpb: summaryNumber(log, "val_bpb"),
    peakMemoryGb: peakMb === undefined ? undefined : Math.round(peakMb / 102.4) / 10,
  };
}

/** Same rule as program.md: keep only a strictly lower val_bpb. */
export function judgeRun(bestValBpb: number | null, valBpb: number | undefined): "kept" | "discarded" | "crashed" {
  if (valBpb === undefined || valBpb <= 0) return "crashed";
  if (bestValBpb === null || valBpb < bestValBpb) return "kept";
  return "discarded";
}

export function resultsTsvRow(commit: string, experiment: Experiment): string {
  const status = experiment.status === "kept" ? "keep" : experiment.status === "crashed" ? "crash" : "discard";
  const bpb = (experiment.valBpb ?? 0).toFixed(6);
  const memory = (experiment.peakMemoryGb ?? 0).toFixed(1);
  const description = `${experiment.author}: ${experiment.hypothesis}`.replace(/[\t\n]+/g, " ");
  return [commit.slice(0, 7), bpb, memory, status, description].join("\t");
}

export const RESULTS_TSV_HEADER = "commit\tval_bpb\tmemory_gb\tstatus\tdescription";

// ── what agents read ────────────────────────────────────────────────────────

const NOTES_SHOWN = 30;

function formatDelta(experiment: Experiment): string {
  if (experiment.valBpb === undefined || experiment.bestBefore === undefined) return "";
  const delta = experiment.valBpb - experiment.bestBefore;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(4)}`;
}

function experimentRow(experiment: Experiment): string {
  const bpb = experiment.valBpb === undefined ? "" : experiment.valBpb.toFixed(4);
  const what = experiment.detail ? `${experiment.hypothesis} (${experiment.detail})` : experiment.hypothesis;
  return `| ${experiment.id} | ${experiment.author} | ${experiment.status} | ${bpb} | ${formatDelta(experiment)} | ${what.replace(/\|/g, "/")} |`;
}

export function renderBoard(board: Board): string {
  const best =
    board.best.valBpb === null
      ? "No baseline yet: the lab is measuring the unmodified train.py first."
      : `Best so far: val_bpb ${board.best.valBpb.toFixed(4)} (${board.best.experiment ?? "baseline"}, commit ${board.best.commit.slice(0, 7)}). Your change is applied on top of this.`;
  const rows = board.experiments.map(experimentRow);
  const notes = board.notes.slice(-NOTES_SHOWN).map((note) => `- ${note.author}: ${note.text}`);
  return [
    "# Research board",
    best,
    "## Experiments (delta is against the best at the time it ran; negative is better)",
    "| id | author | status | val_bpb | delta | change |",
    "|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| - | - | - | - | - | nothing yet |"]),
    "## Notes from teammates",
    ...(notes.length ? notes : ["- none yet"]),
  ].join("\n");
}

export function researchPrompt(author: string, boardMarkdown: string, hardware: string): string {
  return [
    `You are ${author}, one of several AI researchers taking turns on one shared GPU (${hardware}).`,
    "Together you are trying to get the lowest val_bpb (validation bits per byte; lower is better) from train.py within a fixed 5-minute training budget on this machine.",
    "The research board below is shared by every researcher. It lists every experiment so far, who proposed it, and what happened. Read it before choosing.",
    [
      "Rules:",
      "- Propose ONE experiment that no one has tried or queued. Build on what was kept, learn from what was discarded or crashed, and follow up on near-misses rather than repeating them.",
      "- Edit only train.py in the current directory. Do not modify prepare.py and do not add dependencies.",
      "- Do not run training or any other long command. The lab runs your change and posts the result to the board.",
      "- Simpler is better: a small readable change beats a hack for a tiny gain.",
      "- For background you may read README.md, prepare.py and program.md (ignore program.md's git and logging steps; the lab handles those).",
    ].join("\n"),
    boardMarkdown,
    'When you have finished editing, end your reply with one line of JSON: {"hypothesis":"<one sentence: what you changed and why it should lower val_bpb>","note":"<a lesson for teammates, or empty>"}',
  ].join("\n\n");
}

export interface Proposal {
  hypothesis: string;
  note?: string;
}

const HYPOTHESIS_FALLBACK_CHARS = 200;

export function parseProposal(reply: string): Proposal {
  const parsed = lastJsonWith(reply, "hypothesis");
  const hypothesis = String(parsed?.hypothesis ?? "").trim();
  const note = String(parsed?.note ?? "").trim();
  return {
    hypothesis: hypothesis || reply.trim().slice(0, HYPOTHESIS_FALLBACK_CHARS) || "(no description given)",
    note: note || undefined,
  };
}
