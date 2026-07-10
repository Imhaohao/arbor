// Sakana evolution archive (ARBOR_HIVE_EVOLUTION_ENABLED). Persistence + human
// approval gate for evolvable reversible artifacts — prompt templates, rubric
// weights, DAG priors, role specs, tool allowlists. Realizes the report's
// "replayable archive of branches, artifacts, failures, and promoted solutions"
// and Phase 7 (ShinkaEvolve / Darwin-Godel / CycleQD pattern).
//
// Hard rules enforced here via lib/hive/evolution-core:
//   - never auto-promote: a genome only reaches "promoted" through approveGenome
//   - immutable harness: a genome scored with a non-canonical harness is rejected
//   - beat-the-parent: a regression is rejected even if approved
//
// Nothing in the live hive loop calls this automatically. It is the substrate a
// human/owner (or a future, explicitly-gated optimizer) drives.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  admitGenome,
  genomeId,
  type ArtifactGenome,
  type GenomeKind,
} from "../lib/hive/evolution-core";

const kindValidator = v.union(
  v.literal("prompt_template"),
  v.literal("rubric_weights"),
  v.literal("dag_prior"),
  v.literal("role_spec"),
  v.literal("tool_allowlist"),
);

const statusValidator = v.union(
  v.literal("proposed"),
  v.literal("evaluated"),
  v.literal("promoted"),
  v.literal("rejected"),
);

function toGenome(doc: Doc<"evolution_genomes">): ArtifactGenome {
  return {
    id: doc.genome_id,
    kind: doc.kind,
    content: doc.content,
    lineage_parent_ids: doc.lineage_parent_ids,
    generation: doc.generation,
    op: doc.op as ArtifactGenome["op"],
    behavior_descriptor: doc.behavior_descriptor,
    score: doc.score,
    status: doc.status,
    approved_by: doc.approved_by,
  };
}

// Propose a genome (idempotent by content-derived genome_id). Seeds land as
// "proposed"; a generation-0 baseline may be seeded as "promoted" explicitly.
export const _proposeGenome = internalMutation({
  args: {
    kind: kindValidator,
    content: v.string(),
    lineage_parent_ids: v.array(v.string()),
    generation: v.number(),
    op: v.optional(v.string()),
    behavior_descriptor: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const id = genomeId({
      kind: args.kind as GenomeKind,
      content: args.content,
      lineage_parent_ids: args.lineage_parent_ids,
      generation: args.generation,
    });
    const existing = await ctx.db
      .query("evolution_genomes")
      .withIndex("by_genome_id", (q) => q.eq("genome_id", id))
      .first();
    if (existing) return id;
    await ctx.db.insert("evolution_genomes", {
      kind: args.kind,
      genome_id: id,
      content: args.content,
      lineage_parent_ids: args.lineage_parent_ids,
      generation: args.generation,
      op: args.op,
      behavior_descriptor: args.behavior_descriptor,
      status: args.status ?? "proposed",
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    return id;
  },
});

// Record an immutable-harness evaluation. The pure admission gate decides the
// resulting status (rejected / evaluated / promoted). Promotion still requires
// approved=true here — otherwise a beat-the-parent genome only reaches
// "evaluated" and waits for approveGenome.
export const _recordGenomeEvaluation = internalMutation({
  args: {
    genome_id: v.string(),
    evaluator_score: v.number(),
    harness_id: v.string(),
    expected_harness_id: v.string(),
    parent_score: v.optional(v.number()),
    min_improvement: v.optional(v.number()),
    approved: v.optional(v.boolean()),
    approved_by: v.optional(v.string()),
  },
  returns: v.object({ status: statusValidator, reason: v.string() }),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("evolution_genomes")
      .withIndex("by_genome_id", (q) => q.eq("genome_id", args.genome_id))
      .first();
    if (!doc) throw new Error(`genome ${args.genome_id} not found`);

    const decision = admitGenome({
      candidate: { ...toGenome(doc), approved_by: args.approved_by },
      evaluatorScore: args.evaluator_score,
      parentScore: args.parent_score,
      harnessId: args.harness_id,
      expectedHarnessId: args.expected_harness_id,
      approved: args.approved,
      minImprovement: args.min_improvement,
    });
    await ctx.db.patch(doc._id, {
      score: args.evaluator_score,
      status: decision.status,
      harness_id: args.harness_id,
      approved_by: decision.status === "promoted" ? args.approved_by : doc.approved_by,
      updated_at: Date.now(),
    });
    return { status: decision.status, reason: decision.reason };
  },
});

// The explicit human approval gate: promote a genome that already beat its
// parent (status "evaluated"). Refuses to promote anything not yet evaluated —
// the beat-the-parent + harness checks must have passed first.
export const approveGenome = internalMutation({
  args: { genome_id: v.string(), approved_by: v.string() },
  returns: v.object({ promoted: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("evolution_genomes")
      .withIndex("by_genome_id", (q) => q.eq("genome_id", args.genome_id))
      .first();
    if (!doc) return { promoted: false, reason: "genome not found" };
    if (doc.status === "promoted") {
      return { promoted: true, reason: "already promoted" };
    }
    if (doc.status !== "evaluated") {
      return {
        promoted: false,
        reason: `cannot promote a genome in status "${doc.status}"; it must beat its parent on the immutable harness first`,
      };
    }
    await ctx.db.patch(doc._id, {
      status: "promoted",
      approved_by: args.approved_by,
      updated_at: Date.now(),
    });
    return { promoted: true, reason: `approved by ${args.approved_by}` };
  },
});

export const _genomesByKind = internalQuery({
  args: { kind: kindValidator, status: v.optional(statusValidator) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("evolution_genomes")
          .withIndex("by_kind_and_status", (q) =>
            q.eq("kind", args.kind).eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("evolution_genomes")
          .withIndex("by_kind", (q) => q.eq("kind", args.kind))
          .collect();
    return rows;
  },
});

// Public read for a dashboard/owner surface: the promoted (in-use) genome per
// kind, most recent first.
export const promotedGenomes = query({
  args: { kind: kindValidator },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("evolution_genomes")
      .withIndex("by_kind_and_status", (q) =>
        q.eq("kind", args.kind).eq("status", "promoted"),
      )
      .collect();
  },
});
