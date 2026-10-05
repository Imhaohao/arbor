// Local swarm router. Picks which workers attempt a task from measured
// outcomes in the ledger: smoothed win rate first, then the least-used
// worker in the current subscription window, one model family at a time so
// the swarm stays diverse. Workers that just hit a rate limit or an auth
// failure sit out a cooldown instead of burning another attempt.

import {
  familyOf,
  supportsMode,
  type Family,
  type FailureKind,
  type Mode,
  type WorkerSpec,
} from "./worker-core";

export type LedgerMode = Mode | "doctor" | "judge";

export interface LedgerEntry {
  at: number;
  runId: string;
  mode: LedgerMode;
  worker: string;
  family: Family;
  ok: boolean;
  failure?: FailureKind;
  passed?: boolean | null;
  won: boolean;
  secs: number;
}

export interface WorkerStats {
  worker: string;
  attempts: number;
  wins: number;
  failures: number;
  winRate: number;
  recentRuns: number;
  lastFailure?: FailureKind;
}

export const SUBSCRIPTION_WINDOW_MS = 5 * 60 * 60 * 1000;

const COOLDOWN_MS: Partial<Record<FailureKind, number>> = {
  rate_limit: 30 * 60 * 1000,
  auth: 60 * 60 * 1000,
};

const COMPETITIVE_MODES: ReadonlySet<LedgerMode> = new Set(["ask", "code"]);

function emptyStats(worker: string): WorkerStats {
  return { worker, attempts: 0, wins: 0, failures: 0, winRate: 0.5, recentRuns: 0 };
}

function accumulate(stats: WorkerStats, entry: LedgerEntry, now: number): void {
  if (now - entry.at <= SUBSCRIPTION_WINDOW_MS) stats.recentRuns += 1;
  stats.lastFailure = entry.ok ? undefined : entry.failure;
  if (!entry.ok) stats.failures += 1;
  if (!COMPETITIVE_MODES.has(entry.mode)) return;
  stats.attempts += 1;
  if (entry.won) stats.wins += 1;
}

// Laplace-smoothed so an untried worker starts at 0.5, not 0 or 1.
export function summarize(entries: readonly LedgerEntry[], now: number): Map<string, WorkerStats> {
  const byWorker = new Map<string, WorkerStats>();
  const ordered = [...entries].sort((a, b) => a.at - b.at);
  for (const entry of ordered) {
    const stats = byWorker.get(entry.worker) ?? emptyStats(entry.worker);
    accumulate(stats, entry, now);
    byWorker.set(entry.worker, stats);
  }
  for (const stats of byWorker.values()) {
    stats.winRate = (stats.wins + 1) / (stats.attempts + 2);
  }
  return byWorker;
}

export function cooldownRemainingMs(
  entries: readonly LedgerEntry[],
  worker: string,
  now: number,
): number {
  const last = entries
    .filter((entry) => entry.worker === worker)
    .reduce<LedgerEntry | undefined>((latest, entry) => (!latest || entry.at > latest.at ? entry : latest), undefined);
  if (!last || last.ok || !last.failure) return 0;
  const cooldown = COOLDOWN_MS[last.failure] ?? 0;
  return Math.max(0, last.at + cooldown - now);
}

export interface SkippedWorker {
  worker: string;
  reason: string;
}

export interface WorkerChoice {
  chosen: WorkerSpec[];
  skipped: SkippedWorker[];
}

function skipReason(
  spec: WorkerSpec,
  mode: Mode,
  entries: readonly LedgerEntry[],
  now: number,
): string | undefined {
  if (!supportsMode(spec, mode)) return `cannot run ${mode} tasks`;
  const remaining = cooldownRemainingMs(entries, spec.label, now);
  if (remaining > 0) return `cooling down for ${Math.ceil(remaining / 60000)} more min`;
  return undefined;
}

function rankKey(stats: WorkerStats | undefined): [number, number] {
  return [stats?.winRate ?? 0.5, stats?.recentRuns ?? 0];
}

function byRank(stats: Map<string, WorkerStats>) {
  return (a: WorkerSpec, b: WorkerSpec): number => {
    const [rateA, usedA] = rankKey(stats.get(a.label));
    const [rateB, usedB] = rankKey(stats.get(b.label));
    return rateB - rateA || usedA - usedB;
  };
}

// One worker per family first, then fill from whatever is left.
function pickDiverse(ranked: readonly WorkerSpec[], count: number): WorkerSpec[] {
  const chosen: WorkerSpec[] = [];
  const families = new Set<Family>();
  for (const spec of ranked) {
    if (chosen.length >= count) break;
    if (families.has(familyOf(spec))) continue;
    chosen.push(spec);
    families.add(familyOf(spec));
  }
  for (const spec of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.includes(spec)) chosen.push(spec);
  }
  return chosen;
}

export function chooseWorkers(
  pool: readonly WorkerSpec[],
  entries: readonly LedgerEntry[],
  options: { count: number; mode: Mode; now: number },
): WorkerChoice {
  const skipped: SkippedWorker[] = [];
  const eligible: WorkerSpec[] = [];
  for (const spec of pool) {
    const reason = skipReason(spec, options.mode, entries, options.now);
    if (reason) skipped.push({ worker: spec.label, reason });
    else eligible.push(spec);
  }
  const ranked = [...eligible].sort(byRank(summarize(entries, options.now)));
  return { chosen: pickDiverse(ranked, options.count), skipped };
}
