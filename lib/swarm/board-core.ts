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

/** The lead's current research direction, rewritten every few experiments. */
export interface Agenda {
  at: number;
  author: string;
  /** How many experiments had been judged when the lead wrote it. */
  afterJudged: number;
  text: string;
}

export interface Board {
  branch: string;
  best: { commit: string; valBpb: number | null; experiment?: string };
  experiments: Experiment[];
  notes: BoardNote[];
  agenda?: Agenda;
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

export interface TurnShare {
  label: string;
  /** Relative share of proposals: weight 3 proposes three times as often as weight 1. */
  weight: number;
}

const WEIGHT_SUFFIX = /@(\d+(?:\.\d+)?)$/;

/** Splits `backend:model@3` into the worker text and its turn weight (default 1). */
export function splitTurnWeight(raw: string): { worker: string; weight: number } {
  const trimmed = raw.trim();
  const match = trimmed.match(WEIGHT_SUFFIX);
  const weight = match ? Number(match[1]) : 1;
  if (!(weight > 0)) throw new Error(`turn weight must be positive in "${trimmed}"`);
  return { worker: match ? trimmed.slice(0, match.index) : trimmed, weight };
}

/**
 * The available agent furthest behind its share: lowest proposals / weight.
 * Ties go to the heavier agent, then to list order.
 */
export function nextAuthor(
  board: Board,
  agents: readonly TurnShare[],
  unavailable: ReadonlySet<string>,
): string | undefined {
  const counts = new Map(agents.map((agent) => [agent.label, 0]));
  for (const experiment of board.experiments) {
    if (counts.has(experiment.author)) counts.set(experiment.author, (counts.get(experiment.author) ?? 0) + 1);
  }
  const load = (agent: TurnShare) => (counts.get(agent.label) ?? 0) / agent.weight;
  return agents
    .filter((agent) => !unavailable.has(agent.label))
    .sort((a, b) => load(a) - load(b) || b.weight - a.weight)[0]?.label;
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

const JUDGED_STATUSES: ReadonlySet<ExperimentStatus> = new Set(["kept", "discarded", "crashed"]);

export function judgedCount(board: Board): number {
  return board.experiments.filter((experiment) => JUDGED_STATUSES.has(experiment.status)).length;
}

/** The lead writes its first agenda once the baseline is in, then every `every` judged runs. */
export function needsAgenda(board: Board, every: number): boolean {
  const judged = judgedCount(board);
  if (!board.agenda) return judged > 0;
  return judged - board.agenda.afterJudged >= every;
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
  const agenda = board.agenda
    ? [`## Research direction from the lead (${board.agenda.author}, after ${board.agenda.afterJudged} judged runs)`, board.agenda.text]
    : [];
  return [
    "# Research board",
    best,
    ...agenda,
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
      "- If the board has a research direction from the lead, choose your experiment from it, preferring anything addressed to you, unless the results give you a concrete reason not to.",
      "- Simpler is better: a small readable change beats a hack for a tiny gain.",
      "- For background you may read README.md, prepare.py and program.md (ignore program.md's git and logging steps; the lab handles those).",
    ].join("\n"),
    boardMarkdown,
    'When you have finished editing, end your reply with one line of JSON: {"hypothesis":"<one sentence: what you changed and why it should lower val_bpb>","note":"<a lesson for teammates, or empty>"}',
  ].join("\n\n");
}

export function leadPrompt(author: string, boardMarkdown: string, hardware: string): string {
  return [
    `You are ${author}, the research lead for a team of AI researchers sharing one GPU (${hardware}).`,
    "The team is trying to get the lowest val_bpb (validation bits per byte; lower is better) from train.py within a fixed 5-minute training budget. Researchers take turns proposing one train.py change each; the lab trains it and keeps it only if val_bpb drops.",
    "You do not edit files. Read train.py, program.md and the board below, then write the team's research direction for the next several experiments:",
    [
      "- What the results so far show, including which directions look exhausted and should stop.",
      "- Three to six concrete experiments, most promising first, each specific enough to implement as one small train.py change.",
      "- Optionally assign directions to researchers by name, matching bolder ideas to stronger models.",
    ].join("\n"),
    boardMarkdown,
    'Keep it under 300 words. End your reply with one line of JSON: {"agenda":"<the full direction, as plain text>"}',
  ].join("\n\n");
}

const AGENDA_MAX_CHARS = 3000;

export function parseAgenda(reply: string): string {
  const parsed = lastJsonWith(reply, "agenda");
  const agenda = String(parsed?.agenda ?? "").trim() || reply.trim();
  return agenda.slice(0, AGENDA_MAX_CHARS);
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
