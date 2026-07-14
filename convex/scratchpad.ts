// Hive-mind Layer 4 shared context store: default-runtime queries + mutations.
// NO "use node" — this file only does database I/O. Embedding (which needs the
// embeddings helper and runs network calls) lives in convex/scratchpadActions.ts.
//
// Writes land instantly UN-embedded; an async action embeds them afterwards via
// _patchEmbedding. Every read is index-based; no .filter.

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  blackboardVerifyEnabled,
  makeGist,
  normalizeBlackboardNamespace,
  resolveBlackboardVerification,
  type BlackboardKind,
} from "../lib/hive/blackboard-core";

const kindValidator = v.union(
  v.literal("observation"),
  v.literal("result"),
  v.literal("decision"),
  v.literal("question"),
  v.literal("proposal"),
  v.literal("critique"),
  v.literal("artifact"),
  v.literal("consensus"),
);

const contentFormatValidator = v.union(
  v.literal("text"),
  v.literal("json"),
  v.literal("toon"),
);

const MAX_CONTENT_CHARS = 16_000;
const FOR_DAG_LIMIT = 200;
const FOR_NODE_LIMIT = 50;

// Entry shape with the 1536-float embedding field STRIPPED, for client payloads.
const entryWithoutEmbeddingValidator = v.object({
  _id: v.id("scratchpad_entries"),
  _creationTime: v.number(),
  dag_id: v.id("hive_dags"),
  node_id: v.optional(v.string()),
  task_id: v.optional(v.id("tasks")),
  artifact_id: v.optional(v.id("media_artifacts")),
  agent_id: v.string(),
  kind: kindValidator,
  namespace: v.optional(v.string()),
  content: v.string(),
  content_format: v.optional(contentFormatValidator),
  content_type: v.optional(v.string()),
  writer_did: v.optional(v.string()),
  verified_writer: v.optional(v.boolean()),
  supersedes_entry_id: v.optional(v.id("scratchpad_entries")),
  revision: v.optional(v.number()),
  confidence: v.number(),
  embedding_model: v.optional(v.string()),
  verification: v.optional(
    v.union(v.literal("evidence_backed"), v.literal("unverified")),
  ),
  supporting_entry_ids: v.optional(v.array(v.id("scratchpad_entries"))),
  gist: v.optional(v.string()),
  created_at: v.number(),
});

type EntryWithoutEmbedding = Omit<Doc<"scratchpad_entries">, "embedding">;

function stripEmbedding(doc: Doc<"scratchpad_entries">): EntryWithoutEmbedding {
  const { embedding: _embedding, ...rest } = doc;
  return rest;
}

// 1. Insert a scratchpad entry (un-embedded). Returns the new row id so the
//    caller can schedule embedding.
export const _write = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    task_id: v.optional(v.id("tasks")),
    artifact_id: v.optional(v.id("media_artifacts")),
    agent_id: v.string(),
    kind: kindValidator,
    namespace: v.optional(v.string()),
    content: v.string(),
    content_format: v.optional(contentFormatValidator),
    content_type: v.optional(v.string()),
    writer_did: v.optional(v.string()),
    verified_writer: v.optional(v.boolean()),
    supersedes_entry_id: v.optional(v.id("scratchpad_entries")),
    revision: v.optional(v.number()),
    confidence: v.number(),
    // DELM admit-on-verify (optional, backward-compatible): entry ids the
    // writer claims as supporting evidence. Only consulted when
    // ARBOR_BLACKBOARD_VERIFY_ENABLED is on; ignored (and unstored) otherwise.
    supporting_entry_ids: v.optional(v.array(v.id("scratchpad_entries"))),
  },
  returns: v.id("scratchpad_entries"),
  handler: async (ctx, args): Promise<Id<"scratchpad_entries">> => {
    const confidence = Math.max(0, Math.min(1, args.confidence));
    const content = args.content.slice(0, MAX_CONTENT_CHARS);
    const namespace = normalizeBlackboardNamespace(
      args.namespace,
      args.kind as BlackboardKind,
    );
    if (args.supersedes_entry_id) {
      const prior = await ctx.db.get(args.supersedes_entry_id);
      if (!prior || prior.dag_id !== args.dag_id) {
        throw new Error("superseded entry must exist in the same DAG");
      }
      if ((args.revision ?? 0) <= (prior.revision ?? 0)) {
        throw new Error("revision must increase when superseding an entry");
      }
    }

    // Gist-unfold: cheap deterministic summary, populated unconditionally
    // (no env flag — it costs no model call and is purely additive).
    const gist = makeGist(content);

    // Admit-on-verify: gated behind ARBOR_BLACKBOARD_VERIFY_ENABLED (default
    // off = current behavior, no verification field written at all).
    const verifyEnabled = blackboardVerifyEnabled();
    let verification: "evidence_backed" | "unverified" | undefined;
    let supporting_entry_ids: Id<"scratchpad_entries">[] | undefined;
    if (verifyEnabled) {
      const declared = args.supporting_entry_ids ?? [];
      const resolved: Id<"scratchpad_entries">[] = [];
      for (const supportId of declared) {
        const supportEntry = await ctx.db.get(supportId);
        if (supportEntry && supportEntry.dag_id === args.dag_id) {
          resolved.push(supportId);
        }
      }
      verification = resolveBlackboardVerification({
        enabled: true,
        declaredSupportingIds: declared,
        resolvedSupportingIds: resolved,
      });
      supporting_entry_ids = declared;
    }

    return await ctx.db.insert("scratchpad_entries", {
      dag_id: args.dag_id,
      node_id: args.node_id,
      task_id: args.task_id,
      artifact_id: args.artifact_id,
      agent_id: args.agent_id,
      kind: args.kind,
      namespace,
      content,
      content_format: args.content_format ?? "text",
      content_type: args.content_type ?? "text/plain",
      writer_did: args.writer_did,
      verified_writer: args.verified_writer ?? true,
      supersedes_entry_id: args.supersedes_entry_id,
      revision: args.revision ?? 0,
      confidence,
      verification,
      supporting_entry_ids,
      gist,
      created_at: Date.now(),
    });
  },
});

// 2. Patch the embedding vector + model onto an existing entry.
export const _patchEmbedding = internalMutation({
  args: {
    entry_id: v.id("scratchpad_entries"),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.entry_id, {
      embedding: args.embedding,
      embedding_model: args.embedding_model,
    });
    return null;
  },
});

// 3. Up to 200 entries for a DAG (newest first).
export const _forDag = internalQuery({
  args: { dag_id: v.id("hive_dags") },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"scratchpad_entries">>> => {
    return await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .order("desc")
      .take(FOR_DAG_LIMIT);
  },
});

// 5. Up to 50 entries for a specific node within a DAG (newest first).
export const _forNode = internalQuery({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"scratchpad_entries">>> => {
    return await ctx.db
      .query("scratchpad_entries")
      .withIndex("by_dag_and_node", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .order("desc")
      .take(FOR_NODE_LIMIT);
  },
});

// 6. Get a single entry by id (or null).
export const _getEntry = internalQuery({
  args: { entry_id: v.id("scratchpad_entries") },
  returns: v.union(v.any(), v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"scratchpad_entries"> | null> => {
    return await ctx.db.get(args.entry_id);
  },
});

// 7. PUBLIC: all entries for a DAG with the embedding vector stripped, so the
//    1536-float arrays never cross the wire to the client.
export const forDag = query({
  args: {
    dag_id: v.id("hive_dags"),
    namespace: v.optional(v.string()),
  },
  returns: v.array(entryWithoutEmbeddingValidator),
  handler: async (ctx, args): Promise<Array<EntryWithoutEmbedding>> => {
    const rows = args.namespace
      ? await ctx.db
          .query("scratchpad_entries")
          .withIndex("by_dag_and_namespace", (q) =>
            q.eq("dag_id", args.dag_id).eq("namespace", args.namespace),
          )
          .order("desc")
          .take(FOR_DAG_LIMIT)
      : await ctx.db
          .query("scratchpad_entries")
          .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
          .order("desc")
          .take(FOR_DAG_LIMIT);
    // Durable media pointers are only exposed through agentBlackboard.readSigned,
    // where DAG collaboration is verified. Keep the legacy public scratchpad
    // useful for text coordination without leaking artifact IDs.
    return rows.filter((row) => !row.artifact_id).map(stripEmbedding);
  },
});
