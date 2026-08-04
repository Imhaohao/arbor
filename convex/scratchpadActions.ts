"use node";

// Hive-mind Layer 4 shared context store: Node-runtime actions. These need the
// embeddings helper (network I/O) and ctx.vectorSearch (actions only). All DB
// access is delegated to the queries/mutations in convex/scratchpad.ts; the DAG
// existence check delegates to convex/hiveData.ts. No ctx.db here.

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { embedText, embeddingBackend } from "../lib/hive/embeddings";
import {
  assertBlackboardWriteAllowed,
  didForAgent,
  normalizeBlackboardNamespace,
  serializeBlackboardContent,
  validateBlackboardPayload,
} from "../lib/hive/blackboard-core";
import { parseAgentData } from "../lib/toon";
import { verifyInbound } from "./a2aAuthCore";

const SEMANTIC_DEFAULT = 8;
const SEMANTIC_MAX = 20;

function modelLabel(): string {
  const backend = embeddingBackend();
  if (backend === "azure") return "azure:text-embedding-3-small";
  if (backend === "openai") return "openai:text-embedding-3-small";
  return "local-hash";
}

// Strip the 1536-float embedding off an entry doc before returning it.
function stripEmbedding(doc: Doc<"scratchpad_entries">) {
  const { embedding: _embedding, ...rest } = doc;
  return rest;
}

// 1. INTERNAL: embed a single entry if it isn't already embedded. Scheduled by
//    `writeSigned` after the row lands. Any failure is swallowed (the row
//    still serves indexed reads via by_dag / by_dag_and_node).
export const embedEntry = internalAction({
  args: { entry_id: v.id("scratchpad_entries") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const entry: Doc<"scratchpad_entries"> | null = await ctx.runQuery(
        internal.scratchpad._getEntry,
        { entry_id: args.entry_id },
      );
      if (!entry) return null;
      if (entry.embedding) return null;

      const embedding = await embedText(entry.content);
      await ctx.runMutation(internal.scratchpad._patchEmbedding, {
        entry_id: args.entry_id,
        embedding,
        embedding_model: modelLabel(),
      });
    } catch (err) {
      console.warn(
        `scratchpadActions.embedEntry: failed to embed ${args.entry_id}: ${
          (err as Error).message
        }`,
      );
    }
    return null;
  },
});

// 2. PUBLIC: authenticated blackboard append. The signed raw payload is parsed
//    only after HMAC + nonce verification; writer identity comes from the
//    verified header, never from user-controlled content.
export const writeSigned = action({
  args: {
    raw_body: v.string(),
    format: v.optional(v.union(v.literal("json"), v.literal("toon"))),
    agent_id: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    nonce: v.optional(v.string()),
    signature: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), entry_id: v.id("scratchpad_entries") }),
    v.object({
      ok: v.literal(false),
      status: v.number(),
      error: v.string(),
      detail: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const verdict = await verifyInbound(ctx, args);
    if (!verdict.ok) return verdict;

    const decoded = parseAgentData(args.raw_body, args.format);
    const payload = validateBlackboardPayload(decoded);
    const namespace = normalizeBlackboardNamespace(
      payload.namespace,
      payload.kind,
    );
    const agent = await ctx.runQuery(internal.agents._getByAgentId, {
      agent_id: verdict.agent_id,
    });
    if (!agent) {
      return { ok: false as const, status: 403, error: "unknown_agent" };
    }
    const role = agent.agent_role === "reviewer" ? "reviewer" : "worker";
    assertBlackboardWriteAllowed({ role, kind: payload.kind, namespace });

    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: payload.dag_id as Id<"hive_dags">,
    });
    if (!dag) {
      throw new Error("unknown dag_id");
    }

    const serialized = serializeBlackboardContent(payload);

    const entry_id: Id<"scratchpad_entries"> = await ctx.runMutation(
      internal.scratchpad._write,
      {
        dag_id: payload.dag_id as Id<"hive_dags">,
        node_id: payload.node_id,
        task_id: payload.task_id as Id<"tasks"> | undefined,
        artifact_id: undefined,
        agent_id: verdict.agent_id,
        kind: payload.kind,
        namespace,
        content: serialized.content,
        content_format: serialized.content_format,
        content_type: serialized.content_type,
        writer_did: didForAgent(verdict.agent_id),
        verified_writer: true,
        supersedes_entry_id: payload.supersedes_entry_id as
          | Id<"scratchpad_entries">
          | undefined,
        revision: payload.revision,
        confidence: payload.confidence,
        supporting_entry_ids: payload.supporting_entry_ids as
          | Id<"scratchpad_entries">[]
          | undefined,
      },
    );

    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id,
    });

    return { ok: true as const, entry_id };
  },
});

// 3. PUBLIC: semantic recall over a DAG's scratchpad via vector search. Embeds
//    the query, finds nearest entries scoped to dag_id, hydrates each hit, and
//    returns entries (embedding stripped) sorted by score descending.
export const semanticRecall = action({
  args: {
    dag_id: v.id("hive_dags"),
    query: v.string(),
    limit: v.optional(v.number()),
    namespace: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      entry: v.any(),
      score: v.number(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ entry: unknown; score: number }>> => {
    const limit = Math.max(
      1,
      Math.min(SEMANTIC_MAX, args.limit ?? SEMANTIC_DEFAULT),
    );
    const vector = await embedText(args.query);
    const searchLimit = args.namespace ? Math.min(256, limit * 4) : limit;
    const hits = await ctx.vectorSearch("scratchpad_entries", "by_embedding", {
      vector,
      limit: searchLimit,
      filter: (q) => q.eq("dag_id", args.dag_id),
    });

    const results: Array<{ entry: unknown; score: number }> = [];
    for (const hit of hits) {
      const entry: Doc<"scratchpad_entries"> | null = await ctx.runQuery(
        internal.scratchpad._getEntry,
        { entry_id: hit._id },
      );
      if (!entry) continue;
      if (entry.artifact_id) continue;
      if (args.namespace && entry.namespace !== args.namespace) continue;
      results.push({ entry: stripEmbedding(entry), score: hit._score });
      if (results.length >= limit) break;
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  },
});
