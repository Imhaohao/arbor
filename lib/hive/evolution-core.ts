// Evolution archive for the Arbor hive (Sakana ShinkaEvolve / Darwin-Godel /
// CycleQD pattern, arXiv refs in ARBOR_FRONTIER_BUILD_PLAN.md §6).
//
// Sakana evolves candidates by mutating them, evaluating against an immutable
// signal, preserving lineage, and reusing successful variants as parents. The
// report is explicit that Arbor should evolve *reversible* artifacts first —
// prompt templates, rubric weights, DAG priors, role specs, tool allowlists —
// never model weights, and NEVER auto-promote: every promotion needs approval,
// and a candidate must never be allowed to edit its own scoring harness.
//
// This module is the archive discipline: lineage bookkeeping, quality-diversity
// parent selection, and the admission gate that enforces those safety rules. The
// mutation *content* itself is produced elsewhere (by a model); here we only
// record it safely. Pure and runtime-agnostic — all live use is gated behind
// ARBOR_HIVE_EVOLUTION_ENABLED (default off).

import { stableOutputHash } from "./judge-core";

export type GenomeKind =
  | "prompt_template"
  | "rubric_weights"
  | "dag_prior"
  | "role_spec"
  | "tool_allowlist";

export type GenomeStatus = "proposed" | "evaluated" | "promoted" | "rejected";

export type MutationOp = "tweak" | "fuse" | "add" | "eliminate";

export interface ArtifactGenome {
  id: string;
  kind: GenomeKind;
  // Serialized artifact content (string for prompts/roles, JSON for weights/
  // allowlists/priors). The archive is content-agnostic; callers serialize.
  content: string;
  lineage_parent_ids: string[];
  generation: number;
  op?: MutationOp;
  // Quality-diversity behavior descriptor (CycleQD): a coarse bucket key so the
  // archive keeps a diverse elite set instead of collapsing to one lineage.
  behavior_descriptor?: string;
  // Score from the IMMUTABLE evaluator, [0,1]. Undefined until evaluated.
  score?: number;
  status: GenomeStatus;
  approved_by?: string;
  created_at?: number;
}

// ─── Master switch ───────────────────────────────────────────────────────────

/**
 * Evolution-archive master switch (ARBOR_HIVE_EVOLUTION_ENABLED). Default off.
 * Even when on, promotion still requires explicit approval — the switch only
 * enables *proposing and evaluating* evolved artifacts.
 */
export function evolutionEnabled(): boolean {
  const value = (process.env.ARBOR_HIVE_EVOLUTION_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

// ─── Deterministic genome id (lineage-aware provenance) ──────────────────────

/**
 * Genome id = hash of (kind, content, sorted parents, generation). Deterministic
 * so re-proposing the exact same artifact from the same parents is idempotent
 * and the archive never stores accidental duplicates.
 */
export function genomeId(input: {
  kind: GenomeKind;
  content: string;
  lineage_parent_ids: string[];
  generation: number;
}): string {
  const parents = [...input.lineage_parent_ids].sort().join(",");
  return `gen-${stableOutputHash(
    `${input.kind}|${input.generation}|${parents}|${input.content}`,
  )}`;
}

// ─── Mutation (never mutates the parent; produces a proposed child) ──────────

/**
 * Record a single-parent mutation as a NEW proposed genome. The parent object
 * is never modified (reversibility): the child gets a fresh id, generation+1,
 * and a lineage link back. `content` is the already-mutated artifact (produced
 * by the caller/model); this function only does the safe bookkeeping.
 */
export function mutateArtifact(
  parent: ArtifactGenome,
  op: MutationOp,
  content: string,
  behavior_descriptor?: string,
): ArtifactGenome {
  const generation = parent.generation + 1;
  const lineage_parent_ids = [parent.id];
  return {
    id: genomeId({ kind: parent.kind, content, lineage_parent_ids, generation }),
    kind: parent.kind,
    content,
    lineage_parent_ids,
    generation,
    op,
    behavior_descriptor: behavior_descriptor ?? parent.behavior_descriptor,
    status: "proposed",
  };
}

/**
 * Record a two-parent fusion (CycleQD/model-merge analogue at the artifact
 * level). Both parents are preserved; the child's generation is one past the
 * deeper parent.
 */
export function fuseArtifacts(
  parentA: ArtifactGenome,
  parentB: ArtifactGenome,
  content: string,
  behavior_descriptor?: string,
): ArtifactGenome {
  if (parentA.kind !== parentB.kind) {
    throw new Error(
      `cannot fuse genomes of different kinds: ${parentA.kind} vs ${parentB.kind}`,
    );
  }
  const generation = Math.max(parentA.generation, parentB.generation) + 1;
  const lineage_parent_ids = [parentA.id, parentB.id];
  return {
    id: genomeId({ kind: parentA.kind, content, lineage_parent_ids, generation }),
    kind: parentA.kind,
    content,
    lineage_parent_ids,
    generation,
    op: "fuse",
    behavior_descriptor:
      behavior_descriptor ?? parentA.behavior_descriptor ?? parentB.behavior_descriptor,
    status: "proposed",
  };
}

// ─── Quality-diversity parent selection (CycleQD) ────────────────────────────

/**
 * Select up to `k` parents for the next generation. Elites are chosen per
 * behavior-descriptor bucket first (diversity), then the remaining slots are
 * filled by global score (quality). Only evaluated/promoted genomes with a score
 * are eligible — you cannot breed from an unevaluated proposal. Deterministic
 * ordering (score desc, then id) so selection is replayable.
 */
export function selectParents(
  archive: ArtifactGenome[],
  k: number,
): ArtifactGenome[] {
  const eligible = archive.filter(
    (g) =>
      (g.status === "evaluated" || g.status === "promoted") &&
      typeof g.score === "number" &&
      Number.isFinite(g.score),
  );
  if (eligible.length === 0 || k <= 0) return [];

  const byScore = (a: ArtifactGenome, b: ArtifactGenome): number => {
    if ((b.score as number) !== (a.score as number)) {
      return (b.score as number) - (a.score as number);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  // One elite per bucket first (diversity).
  const buckets = new Map<string, ArtifactGenome[]>();
  for (const g of eligible) {
    const key = g.behavior_descriptor ?? "_default";
    const list = buckets.get(key) ?? [];
    list.push(g);
    buckets.set(key, list);
  }
  const selected: ArtifactGenome[] = [];
  const chosen = new Set<string>();
  for (const list of buckets.values()) {
    const elite = [...list].sort(byScore)[0];
    if (elite && !chosen.has(elite.id)) {
      selected.push(elite);
      chosen.add(elite.id);
    }
  }

  // Fill remaining slots by global score (quality), skipping already-chosen.
  if (selected.length < k) {
    for (const g of [...eligible].sort(byScore)) {
      if (selected.length >= k) break;
      if (chosen.has(g.id)) continue;
      selected.push(g);
      chosen.add(g.id);
    }
  }

  return selected.sort(byScore).slice(0, k);
}

// ─── Admission gate (admit-on-verify + immutable harness + no auto-promote) ──

export interface AdmissionInput {
  candidate: ArtifactGenome;
  // Score of the candidate from the immutable evaluator.
  evaluatorScore: number;
  // Best score among the candidate's lineage parents (what it must beat).
  parentScore?: number;
  // The harness id the candidate was scored with, and the expected canonical
  // one. A mismatch means the candidate tampered with its own scoring — hard
  // reject (Sakana AI CUDA Engineer lesson: evaluators must be immutable and
  // ungameable).
  harnessId: string;
  expectedHarnessId: string;
  // Explicit human approval. Required for promotion — never auto-promote.
  approved?: boolean;
  // Minimum improvement over the parent to count as a real gain (guards against
  // noise-driven promotion).
  minImprovement?: number;
}

export interface AdmissionResult {
  status: GenomeStatus;
  reason: string;
}

/**
 * Decide what happens to an evaluated candidate genome. Hard rules, in order:
 *  1. Harness tampering (scored with a non-canonical harness) → rejected.
 *  2. Did not beat its parent by the required margin → rejected/evaluated.
 *  3. Beat the parent but lacks approval → stays "evaluated" (awaits approval).
 *  4. Beat the parent AND approved → "promoted".
 * Never returns "promoted" without approval — the report's non-negotiable rule.
 */
export function admitGenome(input: AdmissionInput): AdmissionResult {
  if (input.harnessId !== input.expectedHarnessId) {
    return {
      status: "rejected",
      reason: `scoring harness mismatch (${input.harnessId} != ${input.expectedHarnessId}); candidate may have tampered with its evaluator`,
    };
  }

  const minImprovement = Math.max(0, input.minImprovement ?? 0);
  const parentScore = input.parentScore ?? 0;
  const beatsParent = input.evaluatorScore >= parentScore + minImprovement;

  if (!beatsParent) {
    return {
      status: "rejected",
      reason: `did not beat parent (${input.evaluatorScore.toFixed(3)} < ${(
        parentScore + minImprovement
      ).toFixed(3)})`,
    };
  }

  if (!input.approved) {
    return {
      status: "evaluated",
      reason: "beats parent but awaits human approval before promotion",
    };
  }

  return {
    status: "promoted",
    reason: `promoted: beat parent by ${(input.evaluatorScore - parentScore).toFixed(
      3,
    )} and approved by ${input.candidate.approved_by ?? "operator"}`,
  };
}

/**
 * All evolvable artifact kinds change future hive behavior, so every promotion
 * requires approval. Explicit function so the rule is testable and callers can't
 * silently opt a kind out.
 */
export function promotionRequiresApproval(_kind: GenomeKind): boolean {
  return true;
}

// ─── Lineage / replay ────────────────────────────────────────────────────────

/**
 * Walk a genome's lineage back to its root(s). Returns the chain from the given
 * genome up through ancestors (first parent followed at each fork), stopping at
 * a genome with no known parent in the archive or when a cycle is detected.
 */
export function lineageOf(
  archive: ArtifactGenome[],
  genomeId: string,
): ArtifactGenome[] {
  const byId = new Map(archive.map((g) => [g.id, g]));
  const chain: ArtifactGenome[] = [];
  const seen = new Set<string>();
  let current = byId.get(genomeId);
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    const parentId = current.lineage_parent_ids[0];
    current = parentId ? byId.get(parentId) : undefined;
  }
  return chain;
}

export function isDescendantOf(
  archive: ArtifactGenome[],
  genomeId: string,
  ancestorId: string,
): boolean {
  return lineageOf(archive, genomeId).some((g) => g.id === ancestorId);
}

/**
 * Seed genome for a brand-new artifact lineage (generation 0, no parents,
 * status "promoted" since it is the current in-use baseline, not an evolved
 * proposal). Deterministic id.
 */
export function seedGenome(input: {
  kind: GenomeKind;
  content: string;
  behavior_descriptor?: string;
  score?: number;
}): ArtifactGenome {
  return {
    id: genomeId({
      kind: input.kind,
      content: input.content,
      lineage_parent_ids: [],
      generation: 0,
    }),
    kind: input.kind,
    content: input.content,
    lineage_parent_ids: [],
    generation: 0,
    behavior_descriptor: input.behavior_descriptor,
    score: input.score,
    status: "promoted",
  };
}
