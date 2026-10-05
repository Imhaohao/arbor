// Local swarm selection. A verifiable check (tests, typecheck) decides first;
// only when several candidates survive does a judge model break the tie. The
// judge sees anonymous letters, never model names, and is drawn from a model
// family that wrote none of the finalists so it cannot favour its own work.

import { familyOf, supportsMode, type Family, type WorkerSpec } from "./worker-core";

export interface Candidate {
  worker: string;
  family: Family;
  ok: boolean;
  text: string;
  /** null when no check command was run. */
  passed: boolean | null;
  /** Diff body for code tasks; empty for ask tasks. */
  patch: string;
  changedLines: number;
}

export type Preselection =
  | { kind: "winner"; worker: string; reason: string }
  | { kind: "judge"; finalists: Candidate[] }
  | { kind: "none"; reason: string };

function usable(candidate: Candidate, isCode: boolean): boolean {
  return candidate.ok && (!isCode || candidate.changedLines > 0);
}

export function preselect(candidates: readonly Candidate[], isCode: boolean): Preselection {
  const alive = candidates.filter((candidate) => usable(candidate, isCode));
  if (alive.length === 0) {
    return { kind: "none", reason: isCode ? "no worker produced a change" : "no worker answered" };
  }
  const checked = alive.some((candidate) => candidate.passed !== null);
  const finalists = checked ? alive.filter((candidate) => candidate.passed === true) : alive;
  if (finalists.length === 0) return { kind: "none", reason: "no candidate passed the check" };
  if (finalists.length === 1) {
    const reason = checked ? "only candidate that passed the check" : "only worker that answered";
    return { kind: "winner", worker: finalists[0].worker, reason };
  }
  return { kind: "judge", finalists };
}

export function pickJudge(
  finalists: readonly Candidate[],
  available: readonly WorkerSpec[],
): WorkerSpec | undefined {
  const authorFamilies = new Set(finalists.map((candidate) => candidate.family));
  const capable = available.filter((spec) => supportsMode(spec, "ask") && familyOf(spec) !== "local");
  return capable.find((spec) => !authorFamilies.has(familyOf(spec))) ?? capable[0];
}

export const JUDGE_EXCERPT_CHARS = 8000;

export function judgeLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

function excerpt(text: string): string {
  if (text.length <= JUDGE_EXCERPT_CHARS) return text;
  return `${text.slice(0, JUDGE_EXCERPT_CHARS)}\n[... ${text.length - JUDGE_EXCERPT_CHARS} more characters cut]`;
}

function candidateBlock(label: string, candidate: Candidate, isCode: boolean): string {
  const body = isCode
    ? `Summary from its author:\n${excerpt(candidate.text)}\n\nDiff:\n${excerpt(candidate.patch)}`
    : excerpt(candidate.text);
  return `=== Candidate ${label} ===\n${body}`;
}

export function buildJudgePrompt(
  task: string,
  finalists: readonly Candidate[],
  isCode: boolean,
): string {
  const labels = judgeLabels(finalists.length);
  const blocks = finalists.map((candidate, index) => candidateBlock(labels[index], candidate, isCode));
  const criterion = isCode
    ? "All candidates passed the automated check. Pick the change a careful senior engineer would merge: correct, minimal, and readable."
    : "Pick the answer that is most correct and most useful to the person who asked.";
  return [
    "You are judging independent attempts at the same task. Do not use any tools.",
    `Task:\n${task}`,
    criterion,
    ...blocks,
    `Reply with one line of JSON and nothing else: {"winner":"<one of ${labels.join(", ")}>","reason":"<one sentence>"}`,
  ].join("\n\n");
}

export interface Verdict {
  label: string;
  reason: string;
}

// Judges quote code in their reasons ("uses \p{M}"), so a verdict can hold
// braces of its own; find objects by trying JSON.parse, not by regex.
const VERDICT_SEARCH_CHARS = 4000;

function parseObjectAt(text: string, start: number): unknown {
  for (let end = text.indexOf("}", start); end !== -1; end = text.indexOf("}", end + 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // not closed yet; try the next brace
    }
  }
  return undefined;
}

function jsonObjectsIn(text: string): unknown[] {
  const objects: unknown[] = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const parsed = parseObjectAt(text, start);
    if (parsed && typeof parsed === "object") objects.push(parsed);
  }
  return objects;
}

export function parseVerdict(text: string, labels: readonly string[]): Verdict | undefined {
  const objects = jsonObjectsIn(text.slice(-VERDICT_SEARCH_CHARS)) as Array<{ winner?: unknown; reason?: unknown }>;
  for (const parsed of objects.reverse()) {
    const label = String(parsed.winner ?? "").trim().toUpperCase();
    if (labels.includes(label)) return { label, reason: String(parsed.reason ?? "").trim() };
  }
  return undefined;
}

// Used only when the judge fails: the smallest passing change is the least
// likely to carry unrelated edits.
export function fallbackWinner(finalists: readonly Candidate[], isCode: boolean): Candidate {
  if (!isCode) return finalists[0];
  return [...finalists].sort((a, b) => a.changedLines - b.changedLines)[0];
}
