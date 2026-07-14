import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertProviderJobTransition,
  type ProviderJobStatus,
} from "../lib/media-artifacts";

const statusValidator = v.union(
  v.literal("queued"),
  v.literal("submitted"),
  v.literal("running"),
  v.literal("retry_wait"),
  v.literal("input_required"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const costValidator = v.object({ amount: v.number(), currency: v.string() });
const MAX_TASK_JOBS = 100;

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function assertServerKey(serverKey: string): void {
  const expected = process.env.ARBOR_INTERNAL_API_KEY?.trim();
  if (!expected) throw new Error("ARBOR_INTERNAL_API_KEY is not configured");
  if (!constantTimeEqual(serverKey, expected)) throw new Error("unauthorized");
}

function cleanText(value: string, label: string, max = 256): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} must contain 1-${max} characters`);
  }
  return normalized;
}

function cleanCost(
  value: { amount: number; currency: string } | undefined,
) {
  if (!value) return undefined;
  if (!Number.isFinite(value.amount) || value.amount < 0) {
    throw new Error("cost amount must be a non-negative number");
  }
  const currency = cleanText(value.currency, "cost currency", 16).toUpperCase();
  return { amount: value.amount, currency };
}

export const createServer = mutation({
  args: {
    server_key: v.string(),
    job_id: v.string(),
    idempotency_key: v.string(),
    task_id: v.optional(v.id("tasks")),
    dag_id: v.optional(v.id("hive_dags")),
    node_id: v.optional(v.string()),
    requested_by_agent_id: v.string(),
    provider: v.string(),
    operation: v.string(),
    input_artifact_id: v.optional(v.id("media_artifacts")),
    quoted_cost: v.optional(costValidator),
    max_attempts: v.optional(v.number()),
  },
  returns: v.object({
    provider_job_id: v.id("provider_jobs"),
    job_id: v.string(),
    created: v.boolean(),
    status: statusValidator,
  }),
  handler: async (ctx, args) => {
    assertServerKey(args.server_key);
    const idempotencyKey = cleanText(
      args.idempotency_key,
      "idempotency_key",
      512,
    );
    const existing = await ctx.db
      .query("provider_jobs")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotency_key", idempotencyKey),
      )
      .unique();
    if (existing) {
      return {
        provider_job_id: existing._id,
        job_id: existing.job_id,
        created: false,
        status: existing.status,
      };
    }

    const maxAttempts = args.max_attempts ?? 3;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error("max_attempts must be an integer between 1 and 20");
    }
    if (args.input_artifact_id) {
      const artifact = await ctx.db.get(args.input_artifact_id);
      if (!artifact || artifact.status !== "ready") {
        throw new Error("input artifact is not ready");
      }
      if (args.task_id && artifact.task_id !== args.task_id) {
        const task = await ctx.db.get(args.task_id);
        if (!task?.hive_dag_id || artifact.dag_id !== task.hive_dag_id) {
          throw new Error("input artifact does not belong to task");
        }
      }
      if (args.dag_id && artifact.dag_id !== args.dag_id) {
        throw new Error("input artifact does not belong to DAG");
      }
    }

    const now = Date.now();
    const job_id = cleanText(args.job_id, "job_id", 256);
    const provider_job_id = await ctx.db.insert("provider_jobs", {
      job_id,
      task_id: args.task_id,
      dag_id: args.dag_id,
      node_id: args.node_id?.trim() || undefined,
      requested_by_agent_id: cleanText(
        args.requested_by_agent_id,
        "requested_by_agent_id",
        128,
      ),
      provider: cleanText(args.provider, "provider", 128),
      operation: cleanText(args.operation, "operation", 128),
      status: "queued",
      idempotency_key: idempotencyKey,
      input_artifact_id: args.input_artifact_id,
      quoted_cost: cleanCost(args.quoted_cost),
      attempts: 0,
      max_attempts: maxAttempts,
      created_at: now,
      updated_at: now,
    });
    return { provider_job_id, job_id, created: true, status: "queued" as const };
  },
});

export const transitionServer = mutation({
  args: {
    server_key: v.string(),
    job_id: v.string(),
    status: statusValidator,
    external_job_id: v.optional(v.string()),
    output_artifact_id: v.optional(v.id("media_artifacts")),
    actual_cost: v.optional(costValidator),
    progress: v.optional(v.number()),
    attempts: v.optional(v.number()),
    next_poll_at: v.optional(v.number()),
    error_code: v.optional(v.string()),
    error_retryable: v.optional(v.boolean()),
    error_message: v.optional(v.string()),
    provider_metadata: v.optional(v.any()),
    clear_error: v.optional(v.boolean()),
  },
  returns: v.id("provider_jobs"),
  handler: async (ctx, args): Promise<Id<"provider_jobs">> => {
    assertServerKey(args.server_key);
    const job = await ctx.db
      .query("provider_jobs")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.job_id))
      .unique();
    if (!job) throw new Error("provider job not found");
    assertProviderJobTransition(
      job.status as ProviderJobStatus,
      args.status as ProviderJobStatus,
    );
    if (args.progress !== undefined && (
      !Number.isFinite(args.progress) || args.progress < 0 || args.progress > 1
    )) {
      throw new Error("progress must be between 0 and 1");
    }
    const attempts = args.attempts ?? job.attempts;
    if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > job.max_attempts) {
      throw new Error("attempts must be within the job retry budget");
    }
    if (
      (args.status === "failed" || args.status === "retry_wait") &&
      (!args.error_code || !args.error_message)
    ) {
      throw new Error(`${args.status} requires error_code and error_message`);
    }
    if (args.status === "retry_wait" && args.next_poll_at === undefined) {
      throw new Error("retry_wait requires next_poll_at");
    }
    if (args.output_artifact_id) {
      const artifact = await ctx.db.get(args.output_artifact_id);
      if (!artifact || artifact.status !== "ready") {
        throw new Error("output artifact is not ready");
      }
    }

    const now = Date.now();
    const terminal =
      args.status === "succeeded" ||
      args.status === "failed" ||
      args.status === "cancelled";
    const patch: Partial<Doc<"provider_jobs">> = {
      status: args.status,
      external_job_id: args.external_job_id ?? job.external_job_id,
      output_artifact_id: args.output_artifact_id ?? job.output_artifact_id,
      actual_cost: cleanCost(args.actual_cost) ?? job.actual_cost,
      progress: args.progress ?? job.progress,
      attempts,
      next_poll_at: terminal ? undefined : args.next_poll_at,
      provider_metadata: args.provider_metadata ?? job.provider_metadata,
      started_at:
        job.started_at ??
        (args.status === "running" || args.status === "input_required"
          ? now
          : undefined),
      completed_at: terminal ? now : undefined,
      updated_at: now,
    };
    if (args.clear_error) {
      patch.error_code = undefined;
      patch.error_retryable = undefined;
      patch.error_message = undefined;
    } else if (args.error_code || args.error_message) {
      patch.error_code = args.error_code;
      patch.error_retryable = args.error_retryable ?? false;
      patch.error_message = args.error_message;
    }
    await ctx.db.patch(job._id, patch);
    return job._id;
  },
});

export const getByJobId = query({
  args: { job_id: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"provider_jobs"> | null> => {
    return await ctx.db
      .query("provider_jobs")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.job_id))
      .unique();
  },
});

export const _getByJobId = internalQuery({
  args: { job_id: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"provider_jobs"> | null> => {
    return await ctx.db
      .query("provider_jobs")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.job_id))
      .unique();
  },
});

export const _claimQueued = internalMutation({
  args: { job_id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const job = await ctx.db
      .query("provider_jobs")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.job_id))
      .unique();
    if (!job || job.status !== "queued") return false;
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "running",
      attempts: job.attempts + 1,
      started_at: job.started_at ?? now,
      updated_at: now,
    });
    return true;
  },
});

export const _requeueRetry = internalMutation({
  args: { job_id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const job = await ctx.db
      .query("provider_jobs")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.job_id))
      .unique();
    if (
      !job ||
      job.status !== "retry_wait" ||
      job.attempts >= job.max_attempts
    ) {
      return false;
    }
    assertProviderJobTransition("retry_wait", "queued");
    await ctx.db.patch(job._id, {
      status: "queued",
      next_poll_at: undefined,
      updated_at: Date.now(),
    });
    return true;
  },
});

export const forTask = query({
  args: { task_id: v.id("tasks") },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"provider_jobs">>> => {
    return await ctx.db
      .query("provider_jobs")
      .withIndex("by_task", (q) => q.eq("task_id", args.task_id))
      .order("desc")
      .take(MAX_TASK_JOBS);
  },
});
