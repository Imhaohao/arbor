"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { verifyInbound, type VerifyArgs } from "./a2aAuthCore";
import { parseAgentData } from "../lib/toon";
import { didForAgent } from "../lib/hive/blackboard-core";
import {
  AGENT_BLACKBOARD_MAX_RAW_BODY_CHARS,
  isAssignedDagCollaborator,
  parseAgentBlackboardAppendRequest,
  parseAgentBlackboardReadRequest,
  selectAgentBlackboardEntries,
  toAgentBlackboardStoredEntry,
  type AgentBlackboardAppendRequest,
  type AgentBlackboardReadRequest,
} from "../lib/hive/agent-blackboard-core";

const signedArgs = {
  raw_body: v.string(),
  format: v.optional(v.union(v.literal("json"), v.literal("toon"))),
  agent_id: v.optional(v.string()),
  timestamp: v.optional(v.string()),
  nonce: v.optional(v.string()),
  signature: v.optional(v.string()),
};

const failureValidator = v.object({
  ok: v.literal(false),
  status: v.number(),
  error: v.string(),
  detail: v.optional(v.string()),
});

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

const valueValidator = v.union(
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({
    type: v.literal("artifact_reference"),
    version: v.literal(1),
    artifact_id: v.string(),
    media_type: v.string(),
    label: v.optional(v.string()),
  }),
);

const entryValidator = v.object({
  entry_id: v.string(),
  node_id: v.optional(v.string()),
  agent_id: v.string(),
  kind: kindValidator,
  namespace: v.optional(v.string()),
  confidence: v.number(),
  created_at: v.number(),
  value: valueValidator,
});

type Failure = {
  ok: false;
  status: number;
  error: string;
  detail?: string;
};

function failure(status: number, error: string, detail?: string): Failure {
  return { ok: false, status, error, ...(detail ? { detail } : {}) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateSignedEnvelope(args: VerifyArgs): Failure | null {
  if (args.raw_body.length > AGENT_BLACKBOARD_MAX_RAW_BODY_CHARS) {
    return failure(413, "request_too_large");
  }
  if (
    (args.agent_id?.length ?? 0) > 128 ||
    (args.timestamp?.length ?? 0) > 32 ||
    (args.nonce?.length ?? 0) > 128 ||
    (args.signature?.length ?? 0) > 256
  ) {
    return failure(400, "invalid_auth_envelope");
  }
  return null;
}

async function registeredAgent(
  ctx: ActionCtx,
  agentId: string,
): Promise<Doc<"agents"> | null> {
  return await ctx.runQuery(internal.agents._getByAgentId, {
    agent_id: agentId,
  });
}

async function collaboratorNode(
  ctx: ActionCtx,
  args: { dagId: Id<"hive_dags">; nodeId: string; agentId: string },
): Promise<Doc<"hive_nodes"> | null> {
  const node: Doc<"hive_nodes"> | null = await ctx.runQuery(
    internal.hiveData._getNodeByDagAndNodeId,
    { dag_id: args.dagId, node_id: args.nodeId },
  );
  if (!node) return null;
  if (
    isAssignedDagCollaborator({
      agentId: args.agentId,
      nodeId: args.nodeId,
      nodes: [node],
    })
  ) {
    return node;
  }
  // assigned_agent_id lands at settlement time. While a node is executing,
  // the winning bid is the authoritative collaborator identity.
  if (!node.task_id) return null;
  try {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: node.task_id,
    });
    if (!task.winning_bid_id) return null;
    const bid = await ctx.runQuery(internal.bids._get, {
      bid_id: task.winning_bid_id,
    });
    return bid.agent_id === args.agentId ? node : null;
  } catch {
    return null;
  }
}

function decodedPayload(
  args: VerifyArgs & { format?: "json" | "toon" },
): unknown {
  return parseAgentData(args.raw_body, args.format);
}

export const readSigned = action({
  args: signedArgs,
  returns: v.union(
    failureValidator,
    v.object({
      ok: v.literal(true),
      dag_id: v.id("hive_dags"),
      node_id: v.string(),
      entries: v.array(entryValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const envelopeError = validateSignedEnvelope(args);
    if (envelopeError) return envelopeError;
    const verdict = await verifyInbound(ctx, args);
    if (!verdict.ok) return verdict;

    const agent = await registeredAgent(ctx, verdict.agent_id);
    if (!agent) return failure(403, "unknown_agent");

    let request: AgentBlackboardReadRequest;
    try {
      request = parseAgentBlackboardReadRequest(decodedPayload(args));
    } catch (error) {
      return failure(400, "invalid_request", errorMessage(error));
    }

    const dagId = request.dag_id as Id<"hive_dags">;
    try {
      const dag: Doc<"hive_dags"> | null = await ctx.runQuery(
        internal.hiveData._getDag,
        { dag_id: dagId },
      );
      if (!dag) return failure(404, "unknown_dag");

      const node = await collaboratorNode(ctx, {
        dagId,
        nodeId: request.node_id,
        agentId: verdict.agent_id,
      });
      if (!node) return failure(403, "not_dag_collaborator");

      const rows: Array<Doc<"scratchpad_entries">> = await ctx.runQuery(
        internal.scratchpad._forDag,
        { dag_id: dagId },
      );
      const entries = selectAgentBlackboardEntries({
        rows,
        namespace: request.namespace,
        limit: request.limit,
      });
      return {
        ok: true as const,
        dag_id: dagId,
        node_id: request.node_id,
        entries,
      };
    } catch (error) {
      return failure(400, "invalid_request", errorMessage(error));
    }
  },
});

export const appendSigned = action({
  args: signedArgs,
  returns: v.union(
    failureValidator,
    v.object({
      ok: v.literal(true),
      entry_id: v.id("scratchpad_entries"),
    }),
  ),
  handler: async (ctx, args) => {
    const envelopeError = validateSignedEnvelope(args);
    if (envelopeError) return envelopeError;
    const verdict = await verifyInbound(ctx, args);
    if (!verdict.ok) return verdict;

    const agent = await registeredAgent(ctx, verdict.agent_id);
    if (!agent) return failure(403, "unknown_agent");

    let request: AgentBlackboardAppendRequest;
    try {
      request = parseAgentBlackboardAppendRequest(decodedPayload(args));
    } catch (error) {
      return failure(400, "invalid_request", errorMessage(error));
    }

    const dagId = request.dag_id as Id<"hive_dags">;
    try {
      const dag: Doc<"hive_dags"> | null = await ctx.runQuery(
        internal.hiveData._getDag,
        { dag_id: dagId },
      );
      if (!dag) return failure(404, "unknown_dag");

      const node = await collaboratorNode(ctx, {
        dagId,
        nodeId: request.node_id,
        agentId: verdict.agent_id,
      });
      if (!node) return failure(403, "not_dag_collaborator");

      const stored = toAgentBlackboardStoredEntry(request);
      if (request.entry.type === "artifact_reference" && stored.artifact_id) {
        const artifact = await ctx.runQuery(
          internal.mediaArtifacts._resolveForAgent,
          {
            artifact_id: stored.artifact_id as Id<"media_artifacts">,
            agent_id: verdict.agent_id,
          },
        );
        if (!artifact) return failure(404, "unknown_or_inaccessible_artifact");
        if (artifact.dag_id !== dagId) {
          return failure(400, "artifact_dag_mismatch");
        }
        if (artifact.mime_type !== request.entry.media_type) {
          return failure(400, "artifact_media_type_mismatch");
        }
      }
      const entryId: Id<"scratchpad_entries"> = await ctx.runMutation(
        internal.scratchpad._write,
        {
          dag_id: dagId,
          node_id: request.node_id,
          task_id: node.task_id,
          artifact_id: stored.artifact_id as Id<"media_artifacts"> | undefined,
          agent_id: verdict.agent_id,
          kind: stored.kind,
          namespace: stored.namespace,
          content: stored.content,
          content_format: stored.content_format,
          content_type: stored.content_type,
          writer_did: didForAgent(verdict.agent_id),
          verified_writer: true,
          confidence: stored.confidence,
        },
      );
      await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
        entry_id: entryId,
      });
      return { ok: true as const, entry_id: entryId };
    } catch (error) {
      return failure(400, "invalid_request", errorMessage(error));
    }
  },
});

async function trustedHiveScope(
  ctx: ActionCtx,
  args: { task_id: Id<"tasks">; agent_id: string },
): Promise<{
  task: Doc<"tasks">;
  dagId: Id<"hive_dags">;
  nodeId: string;
}> {
  const task: Doc<"tasks"> = await ctx.runQuery(internal.tasks._get, {
    task_id: args.task_id,
  });
  if (!task.hive_dag_id || !task.hive_node_id || !task.winning_bid_id) {
    throw new Error("task is not an awarded Hive node");
  }
  const bid = await ctx.runQuery(internal.bids._get, {
    bid_id: task.winning_bid_id,
  });
  if (bid.agent_id !== args.agent_id) {
    throw new Error("agent is not the awarded Hive collaborator");
  }
  return {
    task,
    dagId: task.hive_dag_id,
    nodeId: task.hive_node_id,
  };
}

/**
 * Trusted bridge for the awarded in-process specialist runner. DAG/node scope
 * is injected from the child task and cannot be widened by model arguments.
 */
export const invokeTrusted = internalAction({
  args: {
    task_id: v.id("tasks"),
    agent_id: v.string(),
    operation: v.union(v.literal("read"), v.literal("append")),
    payload: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const scope = await trustedHiveScope(ctx, args);
    const rawPayload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const scopedPayload = {
      ...rawPayload,
      dag_id: scope.dagId,
      node_id: scope.nodeId,
    };

    if (args.operation === "read") {
      const request = parseAgentBlackboardReadRequest(scopedPayload);
      const rows: Array<Doc<"scratchpad_entries">> = await ctx.runQuery(
        internal.scratchpad._forDag,
        { dag_id: scope.dagId },
      );
      return {
        dag_id: scope.dagId,
        node_id: scope.nodeId,
        entries: selectAgentBlackboardEntries({
          rows,
          namespace: request.namespace,
          limit: request.limit,
        }),
      };
    }

    const request = parseAgentBlackboardAppendRequest(scopedPayload);
    const stored = toAgentBlackboardStoredEntry(request);
    if (request.entry.type === "artifact_reference" && stored.artifact_id) {
      const artifact = await ctx.runQuery(
        internal.mediaArtifacts._resolveForAgent,
        {
          artifact_id: stored.artifact_id as Id<"media_artifacts">,
          agent_id: args.agent_id,
        },
      );
      if (!artifact || artifact.dag_id !== scope.dagId) {
        throw new Error("unknown_or_inaccessible_artifact");
      }
      if (artifact.mime_type !== request.entry.media_type) {
        throw new Error("artifact_media_type_mismatch");
      }
    }
    const entry_id: Id<"scratchpad_entries"> = await ctx.runMutation(
      internal.scratchpad._write,
      {
        dag_id: scope.dagId,
        node_id: scope.nodeId,
        task_id: scope.task._id,
        artifact_id: stored.artifact_id as Id<"media_artifacts"> | undefined,
        agent_id: args.agent_id,
        kind: stored.kind,
        namespace: stored.namespace,
        content: stored.content,
        content_format: stored.content_format,
        content_type: stored.content_type,
        writer_did: didForAgent(args.agent_id),
        verified_writer: true,
        confidence: stored.confidence,
      },
    );
    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id,
    });
    return { entry_id };
  },
});
