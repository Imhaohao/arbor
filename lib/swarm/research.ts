// Autoresearch lab: runs the research blackboard against an autoresearch
// checkout. Agents propose in their own detached worktrees; the lab trains
// one experiment at a time (one GPU), advances the board branch when val_bpb
// drops, and posts every outcome so the next proposer can build on it.
// Decisions live in board-core.ts; this file only does I/O.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, totalmem, tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASELINE_AUTHOR,
  RESULTS_TSV_HEADER,
  abandonUnfinished,
  benchMs,
  judgeRun,
  leadPrompt,
  needsAgenda,
  newBoard,
  nextAuthor,
  nextExperimentId,
  parseAgenda,
  parseProposal,
  parseTrainingSummary,
  renderBoard,
  researchPrompt,
  resultsTsvRow,
  judgedCount,
  type Board,
  type Experiment,
} from "./board-core";
import { ensureCodexHome, runProcess, swarmPaths, syncCodexAuth, type Log } from "./orchestrate";
import { buildInvocation, headlessToolNote, parseWorkerOutput, type FailureKind, type WorkerSpec } from "./worker-core";

export interface ResearchAgent {
  spec: WorkerSpec;
  weight: number;
}

export interface ResearchOptions {
  repo: string;
  agents: ResearchAgent[];
  /** Reads the board every `leadEvery` judged runs and rewrites the team's direction; never edits train.py. */
  lead?: WorkerSpec;
  leadEvery: number;
  branch: string;
  queueDepth: number;
  proposeTimeoutMs: number;
  trainTimeoutMs: number;
  /** Stop after this many experiments have been judged (useful for a smoke run). */
  maxExperiments?: number;
  log: Log;
}

interface LabPaths {
  dir: string;
  board: string;
  boardMarkdown: string;
  results: string;
  patches: string;
  logs: string;
  stopFile: string;
}

function labPaths(repo: string): LabPaths {
  const dir = join(repo, ".board");
  return {
    dir,
    board: join(dir, "board.json"),
    boardMarkdown: join(dir, "board.md"),
    results: join(dir, "results.tsv"),
    patches: join(dir, "patches"),
    logs: join(dir, "logs"),
    stopFile: join(dir, "STOP"),
  };
}

const POLL_MS = 10_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

function hardwareLabel(): string {
  return `${cpus()[0]?.model ?? "unknown chip"}, ${Math.round(totalmem() / 2 ** 30)} GB unified memory`;
}

// ── board persistence ───────────────────────────────────────────────────────

function excludeFromGit(repo: string): void {
  const exclude = join(git(repo, ["rev-parse", "--git-common-dir"]), "info", "exclude");
  const absolute = exclude.startsWith("/") ? exclude : join(repo, exclude);
  const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
  if (!current.split("\n").includes(".board/")) appendFileSync(absolute, `${current.endsWith("\n") || !current ? "" : "\n"}.board/\n`);
}

function branchTip(repo: string, branch: string): string | undefined {
  try {
    return git(repo, ["rev-parse", "--verify", `refs/heads/${branch}`]);
  } catch {
    return undefined;
  }
}

function openBoard(options: ResearchOptions, paths: LabPaths): Board {
  mkdirSync(paths.patches, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
  excludeFromGit(options.repo);
  if (!existsSync(paths.results)) writeFileSync(paths.results, `${RESULTS_TSV_HEADER}\n`);
  if (existsSync(paths.board)) return abandonUnfinished(JSON.parse(readFileSync(paths.board, "utf8")) as Board);
  const tip = branchTip(options.repo, options.branch) ?? git(options.repo, ["rev-parse", "HEAD"]);
  git(options.repo, ["update-ref", `refs/heads/${options.branch}`, tip]);
  return newBoard(options.branch, tip);
}

function saveBoard(paths: LabPaths, board: Board): void {
  writeFileSync(paths.board, JSON.stringify(board, null, 2) + "\n");
  writeFileSync(paths.boardMarkdown, renderBoard(board) + "\n");
}

// ── worktrees ───────────────────────────────────────────────────────────────

function openWorktree(repo: string, commit: string, name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "arbor-lab-")), name);
  git(repo, ["worktree", "add", "--detach", path, commit]);
  return path;
}

function closeWorktree(repo: string, path: string): void {
  try {
    git(repo, ["worktree", "remove", "--force", path]);
  } catch {
    rmSync(path, { recursive: true, force: true });
    git(repo, ["worktree", "prune"]);
  }
}

// ── the lab ─────────────────────────────────────────────────────────────────

interface Queued {
  experiment: Experiment;
  patch: string;
}

class Lab {
  private board: Board;
  private readonly paths: LabPaths;
  private readonly queue: Queued[] = [];
  private readonly cooling = new Map<string, number>();
  private readonly failureStreak = new Map<string, number>();
  private stopping = false;
  private judged = 0;

  constructor(private readonly options: ResearchOptions) {
    this.paths = labPaths(options.repo);
    this.board = openBoard(options, this.paths);
    saveBoard(this.paths, this.board);
  }

  async run(): Promise<void> {
    process.once("SIGINT", () => this.requestStop("interrupted"));
    process.once("SIGTERM", () => this.requestStop("terminated"));
    ensureCodexHome(swarmPaths(this.options.repo));
    if (this.board.best.valBpb === null) this.enqueue(BASELINE_AUTHOR, "baseline: train.py as checked in", "");
    this.options.log(`lab open on ${this.options.repo} (branch ${this.board.branch}); touch ${this.paths.stopFile} to stop`);
    await Promise.all([this.proposeLoop(), this.trainLoop(), this.leadLoop()]);
    this.options.log("lab closed");
  }

  private requestStop(reason: string): void {
    if (!this.stopping) this.options.log(`stopping after the current run (${reason})`);
    this.stopping = true;
  }

  private checkStop(): boolean {
    if (existsSync(this.paths.stopFile)) this.requestStop("STOP file");
    const reachedMax = this.options.maxExperiments !== undefined && this.judged >= this.options.maxExperiments;
    if (reachedMax) this.requestStop(`reached ${this.options.maxExperiments} experiments`);
    return this.stopping;
  }

  private enqueue(author: string, hypothesis: string, patch: string): Experiment {
    const experiment: Experiment = {
      id: nextExperimentId(this.board),
      author,
      hypothesis,
      status: "queued",
      proposedAt: Date.now(),
    };
    this.board.experiments.push(experiment);
    if (patch) writeFileSync(join(this.paths.patches, `${experiment.id}.patch`), patch);
    this.queue.push({ experiment, patch });
    saveBoard(this.paths, this.board);
    return experiment;
  }

  private benchedAgents(): Set<string> {
    const now = Date.now();
    return new Set([...this.cooling].filter(([, until]) => until > now).map(([label]) => label));
  }

  // ── proposing ─────────────────────────────────────────────────────────────

  private async proposeLoop(): Promise<void> {
    const shares = this.options.agents.map(({ spec, weight }) => ({ label: spec.label, weight }));
    while (!this.checkStop()) {
      const author = this.queue.length < this.options.queueDepth ? nextAuthor(this.board, shares, this.benchedAgents()) : undefined;
      if (!author) {
        await sleep(POLL_MS);
        continue;
      }
      await this.propose(this.options.agents.find(({ spec }) => spec.label === author)!.spec);
    }
  }

  // ── leading ───────────────────────────────────────────────────────────────

  private async leadLoop(): Promise<void> {
    const lead = this.options.lead;
    if (!lead) return;
    while (!this.checkStop()) {
      const due = needsAgenda(this.board, this.options.leadEvery) && !this.benchedAgents().has(lead.label);
      if (due) await this.writeAgenda(lead);
      else await sleep(POLL_MS);
    }
  }

  private async writeAgenda(lead: WorkerSpec): Promise<void> {
    const worktree = openWorktree(this.options.repo, this.board.best.commit, `lead-${lead.label.replace(/[^a-zA-Z0-9._-]+/g, "_")}`);
    try {
      this.options.log(`  ${lead.label} (lead) is reviewing the board`);
      const afterJudged = judgedCount(this.board);
      const prompt = leadPrompt(lead.label, renderBoard(this.board), hardwareLabel());
      const invocation = buildInvocation(lead, "ask", prompt, { codexHome: swarmPaths(this.options.repo).codexHome });
      const result = await runProcess(invocation, worktree, this.options.proposeTimeoutMs);
      if (lead.backend === "codex") syncCodexAuth(swarmPaths(this.options.repo));
      const output = parseWorkerOutput(lead.backend, result);
      if (!output.ok) return this.agentFailed(lead, output.failure ?? "other", output.text);
      this.failureStreak.delete(lead.label);
      this.board.agenda = { at: Date.now(), author: lead.label, afterJudged, text: parseAgenda(output.text) };
      saveBoard(this.paths, this.board);
      this.options.log(`  ${lead.label} set a new direction after ${afterJudged} judged runs (${result.secs}s)`);
    } finally {
      closeWorktree(this.options.repo, worktree);
    }
  }

  private async propose(agent: WorkerSpec): Promise<void> {
    const worktree = openWorktree(this.options.repo, this.board.best.commit, `propose-${agent.label.replace(/[^a-zA-Z0-9._-]+/g, "_")}`);
    try {
      this.options.log(`  ${agent.label} is reading the board and editing train.py`);
      const prompt = researchPrompt(agent.label, renderBoard(this.board), hardwareLabel(), headlessToolNote(agent.backend));
      const invocation = buildInvocation(agent, "code", prompt, { codexHome: swarmPaths(this.options.repo).codexHome });
      const result = await runProcess(invocation, worktree, this.options.proposeTimeoutMs);
      if (agent.backend === "codex") syncCodexAuth(swarmPaths(this.options.repo));
      const output = parseWorkerOutput(agent.backend, result);
      if (!output.ok) return this.agentFailed(agent, output.failure ?? "other", output.text);
      this.acceptProposal(agent, output.text, git(worktree, ["diff", "--", "train.py"]), result.secs);
    } finally {
      closeWorktree(this.options.repo, worktree);
    }
  }

  private bench(agent: WorkerSpec, failure: FailureKind | "no_change"): number {
    const streak = (this.failureStreak.get(agent.label) ?? 0) + 1;
    this.failureStreak.set(agent.label, streak);
    const duration = benchMs(failure, streak);
    this.cooling.set(agent.label, Date.now() + duration);
    return duration;
  }

  private agentFailed(agent: WorkerSpec, failure: FailureKind, text: string): void {
    const duration = this.bench(agent, failure);
    this.options.log(`  ${agent.label} failed (${failure}); benched ${Math.round(duration / 60000)} min: ${text.slice(-160)}`);
  }

  private acceptProposal(agent: WorkerSpec, reply: string, patch: string, secs: number): void {
    const proposal = parseProposal(reply);
    if (proposal.note) this.board.notes.push({ at: Date.now(), author: agent.label, text: proposal.note });
    if (!patch) {
      this.board.notes.push({ at: Date.now(), author: "lab", text: `${agent.label} proposed "${proposal.hypothesis}" but did not change train.py` });
      this.bench(agent, "no_change");
      saveBoard(this.paths, this.board);
      return;
    }
    this.failureStreak.delete(agent.label);
    const experiment = this.enqueue(agent.label, proposal.hypothesis, `${patch}\n`);
    this.options.log(`  queued ${experiment.id} from ${agent.label} after ${secs}s: ${proposal.hypothesis}`);
  }

  // ── training ──────────────────────────────────────────────────────────────

  // Checks for a stop before every dequeue, so a STOP file or --max never
  // lets one more queued experiment start; leftovers are marked abandoned.
  private async trainLoop(): Promise<void> {
    for (;;) {
      const stopping = this.checkStop();
      const next = this.queue.shift();
      if (!next && stopping) return;
      if (!next) {
        await sleep(POLL_MS);
        continue;
      }
      if (stopping) this.finish(next.experiment, { status: "abandoned", detail: "lab stopped before it ran" });
      else await this.train(next);
    }
  }

  private async train({ experiment, patch }: Queued): Promise<void> {
    const worktree = openWorktree(this.options.repo, this.board.best.commit, `train-${experiment.id}`);
    try {
      if (patch && !this.applyPatch(worktree, experiment)) return;
      this.finish(experiment, { status: "running" });
      this.options.log(`  training ${experiment.id} (${experiment.author}): ${experiment.hypothesis}`);
      const env = { UV_PROJECT_ENVIRONMENT: join(this.options.repo, ".venv") };
      const run = await runProcess({ bin: "uv", args: ["run", "train.py"], env }, worktree, this.options.trainTimeoutMs);
      const log = `${run.stdout}\n${run.stderr}`;
      writeFileSync(join(this.paths.logs, `${experiment.id}.log`), log);
      this.record(experiment, worktree, log, run.timedOut);
    } finally {
      closeWorktree(this.options.repo, worktree);
    }
  }

  private applyPatch(worktree: string, experiment: Experiment): boolean {
    try {
      git(worktree, ["apply", "--3way", join(this.paths.patches, `${experiment.id}.patch`)]);
      return true;
    } catch {
      this.finish(experiment, { status: "stale", detail: "no longer applies to the current best train.py" });
      return false;
    }
  }

  private record(experiment: Experiment, worktree: string, log: string, timedOut: boolean): void {
    const summary = parseTrainingSummary(log);
    const bestBefore = this.board.best.valBpb ?? undefined;
    const status = judgeRun(this.board.best.valBpb, summary.valBpb);
    const detail = status === "crashed" ? (timedOut ? "ran past the time limit" : crashExcerpt(log)) : undefined;
    let commit = git(worktree, ["rev-parse", "HEAD"]);
    if (status === "kept") commit = this.advanceBest(experiment, worktree, summary.valBpb!);
    this.judged += 1;
    this.finish(experiment, { status, valBpb: summary.valBpb, bestBefore, peakMemoryGb: summary.peakMemoryGb, detail });
    appendFileSync(this.paths.results, resultsTsvRow(commit, experiment) + "\n");
    this.options.log(`  ${experiment.id} ${status}: val_bpb ${summary.valBpb?.toFixed(4) ?? "none"} (best before ${bestBefore?.toFixed(4) ?? "none"})`);
  }

  private advanceBest(experiment: Experiment, worktree: string, valBpb: number): string {
    if (experiment.author !== BASELINE_AUTHOR) {
      git(worktree, ["commit", "-am", `${experiment.id} (${experiment.author}): ${experiment.hypothesis}`]);
    }
    const commit = git(worktree, ["rev-parse", "HEAD"]);
    git(this.options.repo, ["update-ref", `refs/heads/${this.board.branch}`, commit, this.board.best.commit]);
    this.board.best = { commit, valBpb, experiment: experiment.author === BASELINE_AUTHOR ? undefined : experiment.id };
    return commit;
  }

  private finish(experiment: Experiment, changes: Partial<Experiment>): void {
    Object.assign(experiment, changes);
    saveBoard(this.paths, this.board);
  }
}

const CRASH_EXCERPT_CHARS = 300;

function crashExcerpt(log: string): string {
  const lines = log.trim().split("\n").filter((line) => line.trim());
  return (lines.slice(-3).join(" / ") || "no output").slice(-CRASH_EXCERPT_CHARS);
}

export async function runResearch(options: ResearchOptions): Promise<void> {
  await new Lab(options).run();
}
