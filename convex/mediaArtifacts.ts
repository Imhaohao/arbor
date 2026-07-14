import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const mediaKindValidator = v.union(
  v.literal("video"),
  v.literal("audio"),
  v.literal("image"),
  v.literal("other"),
);

const sourceValidator = v.union(
  v.literal("user_upload"),
  v.literal("agent_upload"),
  v.literal("provider_output"),
  v.literal("import"),
);

const MAX_DAG_NODES = 200;
const MAX_TASK_ARTIFACTS = 100;

function boundedText(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

async function resolveArtifact(
  ctx: {
    storage: { getUrl(id: Id<"_storage">): Promise<string | null> };
  },
  artifact: Doc<"media_artifacts">,
) {
  const download_url = artifact.storage_id
    ? await ctx.storage.getUrl(artifact.storage_id)
    : null;
  return { ...artifact, download_url };
}

export const _generateUploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const _registerStored = internalMutation({
  args: {
    storage_id: v.id("_storage"),
    task_id: v.optional(v.id("tasks")),
    dag_id: v.optional(v.id("hive_dags")),
    node_id: v.optional(v.string()),
    created_by_agent_id: v.string(),
    source: sourceValidator,
    media_kind: mediaKindValidator,
    file_name: v.string(),
    mime_type: v.string(),
    duration_ms: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    codec: v.optional(v.string()),
    frame_rate: v.optional(v.number()),
    provider: v.optional(v.string()),
    external_artifact_id: v.optional(v.string()),
  },
  returns: v.id("media_artifacts"),
  handler: async (ctx, args): Promise<Id<"media_artifacts">> => {
    const metadata = await ctx.db.system.get("_storage", args.storage_id);
    if (!metadata) throw new Error("storage object does not exist");

    const existing = await ctx.db
      .query("media_artifacts")
      .withIndex("by_storage", (q) => q.eq("storage_id", args.storage_id))
      .unique();
    if (existing) {
      if (
        existing.created_by_agent_id !== args.created_by_agent_id ||
        existing.dag_id !== args.dag_id
      ) {
        throw new Error("storage object is already registered to another scope");
      }
      return existing._id;
    }

    const file_name = boundedText(args.file_name, "file_name", 255);
    const mime_type = boundedText(
      metadata.contentType ?? args.mime_type,
      "mime_type",
      127,
    ).toLowerCase();
    const created_by_agent_id = boundedText(
      args.created_by_agent_id,
      "created_by_agent_id",
      128,
    );
    const now = Date.now();

    return await ctx.db.insert("media_artifacts", {
      task_id: args.task_id,
      dag_id: args.dag_id,
      node_id: args.node_id?.trim() || undefined,
      created_by_agent_id,
      source: args.source,
      media_kind: args.media_kind,
      status: "ready",
      storage_id: args.storage_id,
      file_name,
      mime_type,
      byte_size: metadata.size,
      sha256: metadata.sha256,
      duration_ms: args.duration_ms,
      width: args.width,
      height: args.height,
      codec: args.codec?.trim() || undefined,
      frame_rate: args.frame_rate,
      provider: args.provider?.trim() || undefined,
      external_artifact_id: args.external_artifact_id?.trim() || undefined,
      created_at: now,
      updated_at: now,
    });
  },
});

export const _get = internalQuery({
  args: { artifact_id: v.id("media_artifacts") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"media_artifacts"> | null> => {
    return await ctx.db.get(args.artifact_id);
  },
});

export const _forDag = internalQuery({
  args: { dag_id: v.id("hive_dags") },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"media_artifacts">>> => {
    return await ctx.db
      .query("media_artifacts")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .order("desc")
      .take(MAX_TASK_ARTIFACTS);
  },
});

export const _canAgentAccessDag = internalQuery({
  args: { dag_id: v.id("hive_dags"), agent_id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    if (args.agent_id === "hive-control") return true;
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .unique();
    if (!agent) return false;
    const nodes = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(MAX_DAG_NODES);
    if (nodes.some((node) => node.assigned_agent_id === args.agent_id)) {
      return true;
    }
    for (const node of nodes) {
      if (!node.task_id) continue;
      const task = await ctx.db.get(node.task_id);
      if (!task?.winning_bid_id) continue;
      const bid = await ctx.db.get(task.winning_bid_id);
      if (bid?.agent_id === args.agent_id) return true;
    }
    return false;
  },
});

export const _resolveForAgent = internalQuery({
  args: {
    artifact_id: v.id("media_artifacts"),
    agent_id: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifact_id);
    if (!artifact || artifact.status === "deleted") return null;
    if (artifact.created_by_agent_id === args.agent_id) {
      return await resolveArtifact(ctx, artifact);
    }
    if (!artifact.dag_id) return null;
    if (args.agent_id === "hive-control") {
      return await resolveArtifact(ctx, artifact);
    }
    const dagId = artifact.dag_id;
    const nodes = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", dagId))
      .take(MAX_DAG_NODES);
    if (nodes.some((node) => node.assigned_agent_id === args.agent_id)) {
      return await resolveArtifact(ctx, artifact);
    }
    for (const node of nodes) {
      if (!node.task_id) continue;
      const task = await ctx.db.get(node.task_id);
      if (!task?.winning_bid_id) continue;
      const bid = await ctx.db.get(task.winning_bid_id);
      if (bid?.agent_id === args.agent_id) {
        return await resolveArtifact(ctx, artifact);
      }
    }
    return null;
  },
});

// The task surface is already public in this pre-auth application. This query
// mirrors that boundary for the human task view and server-side TikTok handoff;
// signed agent access uses _resolveForAgent through mediaActions instead.
export const forTask = query({
  args: { task_id: v.id("tasks") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.task_id);
    if (!task) return [];
    const artifacts = task.hive_dag_id
      ? await ctx.db
          .query("media_artifacts")
          .withIndex("by_dag", (q) => q.eq("dag_id", task.hive_dag_id))
          .order("desc")
          .take(MAX_TASK_ARTIFACTS)
      : await ctx.db
          .query("media_artifacts")
          .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
          .order("desc")
          .take(MAX_TASK_ARTIFACTS);
    return await Promise.all(
      artifacts
        .filter((artifact) => artifact.status !== "deleted")
        .map((artifact) => resolveArtifact(ctx, artifact)),
    );
  },
});

export const getForTask = query({
  args: {
    artifact_id: v.id("media_artifacts"),
    task_id: v.id("tasks"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifact_id);
    const task = await ctx.db.get(args.task_id);
    if (
      !artifact ||
      !task ||
      (artifact.task_id !== args.task_id &&
        (!task.hive_dag_id || artifact.dag_id !== task.hive_dag_id)) ||
      artifact.status !== "ready"
    ) {
      return null;
    }
    return await resolveArtifact(ctx, artifact);
  },
});
