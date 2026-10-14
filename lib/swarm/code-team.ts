// The small-model team as a product: the same solve, test-tool and
// selection pipeline the benchmark's hive arm runs, minus grading. There are
// no hidden tests here; the answer is chosen by the team's own evidence.

import { tmpdir } from "node:os";
import { hiveAttempt, prepareTeamTools, soloAttempt, type BenchConfig, type CallRecord, type HiveResult } from "./bench";
import type { PublicTask } from "./bench-core";
import { REPAIRER, SMALL_TEAM, TESTERS } from "./team-roster";
import { parseWorker } from "./worker-core";

const DEFAULT_CALL_TIMEOUT_MS = 8 * 60 * 1000;

export interface TeamOptions {
  root: string;
  callTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface UncostedCall {
  label: string;
  role: CallRecord["role"];
}

export interface TeamAnswer extends Omit<HiveResult, "calls"> {
  calls: CallRecord[];
  /** Sum of the costUsd that calls reported; calls listed in uncostedCalls reported none. */
  costUsd: number;
  uncostedCalls: UncostedCall[];
}

function teamConfig(options: TeamOptions): BenchConfig {
  return {
    root: options.root,
    denyReads: [],
    outDir: tmpdir(),
    callTimeoutMs: options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS,
    log: options.log ?? (() => undefined),
  };
}

function totalCost(calls: readonly CallRecord[]): Pick<TeamAnswer, "costUsd" | "uncostedCalls"> {
  const costUsd = calls.reduce((total, call) => total + (call.costUsd ?? 0), 0);
  const uncostedCalls = calls.filter((call) => typeof call.costUsd !== "number").map(({ label, role }) => ({ label, role }));
  return { costUsd, uncostedCalls };
}

export async function solveWithTeam(task: PublicTask, options: TeamOptions): Promise<TeamAnswer> {
  const config = teamConfig(options);
  const [solos, tools] = await Promise.all([
    Promise.all(SMALL_TEAM.map(parseWorker).map((spec) => soloAttempt(config, spec, task))),
    prepareTeamTools(config, task, TESTERS.map(parseWorker)),
  ]);
  const hive = await hiveAttempt(config, task, solos, tools, parseWorker(REPAIRER));
  const calls = [...solos.flatMap((solo) => solo.calls), ...hive.calls];
  return { ...hive, calls, ...totalCost(calls) };
}
