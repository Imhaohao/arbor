"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { discoverSpecialist } from "../lib/specialists/discover";
import {
  getSpecialists,
  registerDiscoveredSpecialist,
  specialistConfigFromPersisted,
  specialistEnabled,
  type PersistedSpecialistConfig,
} from "../lib/specialists/registry";
import {
  AUTO_DISCOVERY_SOURCES,
  discoveryLifecyclePayload,
  discoveryPersistArgs,
  isConnectableDiscovery,
} from "../lib/specialists/post-task-discovery";
import { googleSearchToolMissingEnv } from "../lib/specialists/google-search";
import type { SpecialistConfig } from "../lib/types";

type TaskDoc = {
  _id: Id<"tasks">;
  prompt: string;
  task_type: string;
  model_gateway?: string;
};

async function loadExistingSpecialists(
  ctx: ActionCtx,
  gateway: string | undefined,
): Promise<SpecialistConfig[]> {
  const rows = (await ctx.runQuery(api.discoveredSpecialists.list, {})) as Array<
    PersistedSpecialistConfig
  >;
  const byId = new Map<string, SpecialistConfig>();

  for (const config of getSpecialists(gateway)) {
    byId.set(config.agent_id, config);
  }

  for (const row of rows) {
    const config = specialistConfigFromPersisted(row);
    if (!specialistEnabled(config, gateway)) continue;
    registerDiscoveredSpecialist(config);
    if (!byId.has(config.agent_id)) byId.set(config.agent_id, config);
  }

  return Array.from(byId.values());
}

async function log(
  ctx: ActionCtx,
  task_id: Id<"tasks">,
  event_type: string,
  payload: Record<string, unknown>,
) {
  await ctx.runMutation(internal.lifecycle.log, {
    task_id,
    event_type,
    payload,
  });
}

export const discoverForPostedTask = internalAction({
  args: {
    task_id: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = (await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    })) as TaskDoc;

    if (process.env.ARBOR_AUTO_AGENT_DISCOVERY === "false") {
      await log(ctx, args.task_id, "arbitrator_agent_discovery_skipped", {
        reason: "disabled_by_env",
      });
      return { status: "skipped", reason: "disabled_by_env" };
    }

    const verifyRequested =
      process.env.ARBOR_AUTO_AGENT_DISCOVERY_VERIFY !== "false";

    await log(ctx, args.task_id, "arbitrator_agent_discovery_started", {
      sources: AUTO_DISCOVERY_SOURCES,
      verification_requested: verifyRequested,
      google_search_tool_missing_env: googleSearchToolMissingEnv(),
    });

    try {
      const existing = await loadExistingSpecialists(ctx, task.model_gateway);
      const result = await discoverSpecialist({
        query: task.prompt,
        taskType: task.task_type,
        existing,
        verify: verifyRequested,
        preferred_sources: [...AUTO_DISCOVERY_SOURCES],
        allow_synthesized_fallback: false,
      });

      if (!isConnectableDiscovery(result.specialist)) {
        await log(ctx, args.task_id, "arbitrator_agent_discovery_skipped", {
          ...discoveryLifecyclePayload(result, verifyRequested),
          reason: "candidate_not_connectable",
        });
        return { status: "skipped", reason: "candidate_not_connectable" };
      }

      const persisted = await ctx.runMutation(
        api.discoveredSpecialists.upsert,
        discoveryPersistArgs(result, task.prompt),
      );
      registerDiscoveredSpecialist(result.specialist);

      await log(ctx, args.task_id, "arbitrator_agent_discovery_persisted", {
        ...discoveryLifecyclePayload(result, verifyRequested),
        persisted,
      });

      return {
        status: "persisted",
        agent_id: result.specialist.agent_id,
        source: result.source,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const noMatch = message.includes("no real specialist matched");
      await log(
        ctx,
        args.task_id,
        noMatch
          ? "arbitrator_agent_discovery_no_match"
          : "arbitrator_agent_discovery_failed",
        {
          sources: AUTO_DISCOVERY_SOURCES,
          verification_requested: verifyRequested,
          error: message.slice(0, 500),
        },
      );
      return {
        status: noMatch ? "no_match" : "failed",
        error: message,
      };
    }
  },
});
