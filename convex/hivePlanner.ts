"use node";

// Hive-mind DAG planner (Layer 1). A single Claude call decomposes the root
// task's goal into a 1..8-node dependency DAG, which is validated, persisted,
// and handed off to the orchestrator. This is a NEW code path: the legacy
// convex/planning.ts planner is untouched and unrelated.
//
// Invariant: EXACTLY ONE model call. There is no DAG self-repair loop — if the
// call throws OR validateDag rejects the result, we fall back to a single-node
// plan whose sole node is the verbatim goal.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { callClaudeJSON, CLAUDE_PLANNER_MODEL } from "../lib/anthropic";
import {
  validateDag,
  topologicalLevels,
  classifyTaskComplexity,
  deterministicFallbackPlan,
  type PlannedNode,
} from "../lib/hive/dag";
import {
  detectMediaFormat,
  planMediaPipeline,
} from "../lib/hive/media-pipeline";
import {
  didForAgent,
  serializeBlackboardContent,
} from "../lib/hive/blackboard-core";

// W8 escape hatch: honor ARBOR_HIVE_GATE_DISABLED to always plan a full DAG,
// bypassing the single-vs-multi-agent pre-gate. Matches the truthy-string
// convention used by envFlag() in lib/openai.ts.
function hiveGateDisabled(): boolean {
  const value = (process.env.ARBOR_HIVE_GATE_DISABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

const SYSTEM_PROMPT =
  'You are the planner for a multi-agent marketplace. Decompose the user\'s goal into 1 to 8 task nodes forming a dependency DAG. Each node: { "id": "<short snake_case or kebab id>", "description": "<self-contained sub-task; the executing agent sees ONLY this description plus shared-scratchpad context, so include all needed detail>", "depends_on": ["<ids of nodes whose output this node needs>"], "success_criteria": "<one sentence: what makes this node\'s output acceptable>", "task_class": one of "reasoning"|"classification"|"extraction"|"generation" }. Nodes with empty depends_on run in parallel; prefer parallel structure over long chains. Do NOT pad: a simple goal is a single node. depends_on must reference only ids defined in this plan and never form a cycle. Output strict JSON only: { "nodes": [ ... ] }.';

export const planDag = internalAction({
  args: { task_id: v.id("tasks") },
  returns: v.object({
    dag_id: v.id("hive_dags"),
    node_count: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ dag_id: import("./_generated/dataModel").Id<"hive_dags">; node_count: number }> => {
    // 1. Read the root task.
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });

    // W8: cheap deterministic pre-gate. If the task clearly doesn't need a
    // multi-node DAG, skip the model-backed planner call entirely and reuse
    // the same single-node shape the planner already falls back to on
    // failure. ARBOR_HIVE_GATE_DISABLED=true bypasses the gate (always plans
    // a full DAG), matching the repo's other kill-switch env flags.
    const gateDisabled = hiveGateDisabled();
    const gate = gateDisabled
      ? null
      : classifyTaskComplexity(task.prompt, undefined, task.max_budget);

    // 2 + 3. Single model call, then validate. Any throw or validation failure
    //         collapses to a single-node fallback. No retry/self-repair loop.
    let planned: PlannedNode[];
    let fallbackReason: string | null = null;
    let gatedSingle = false;
    let plannerModel = CLAUDE_PLANNER_MODEL;

    // Media production takes a hand-written DAG rather than the LLM planner: the
    // node contracts (artifact persistence, vendor-neutral routing, honest
    // handling of a missing soundtrack) are load-bearing and must not be
    // paraphrased. `detectMediaFormat` returns "vertical" for TikTok/Reels/Shorts
    // and "widescreen" for YouTube/long-form; short-form wins ties so a
    // "YouTube Shorts" request is not planned 16:9.
    const mediaFormat = detectMediaFormat(task.prompt, task.task_type);
    if (mediaFormat !== undefined) {
      planned = planMediaPipeline(task.prompt, mediaFormat);
      plannerModel =
        mediaFormat === "widescreen"
          ? "arbor:long-form-video-v1"
          : "arbor:short-form-video-v1";
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "hive_plan_media_pipeline",
        payload: {
          profile: plannerModel,
          media_format: mediaFormat,
          node_count: planned.length,
          node_ids: planned.map((node) => node.id),
        },
      });
    } else if (gate !== null && gate.mode === "single") {
      gatedSingle = true;
      planned = [{ id: "main", description: task.prompt, depends_on: [] }];
      console.log(`[hive-planner] gated single-node: ${gate.reason}`);
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: args.task_id,
        event_type: "hive_plan_gated_single",
        payload: { reason: gate.reason },
      });
    } else {
      try {
        const roleHint =
          gate !== null && gate.roles && gate.roles.length > 0
            ? `\n\nHint: this task likely needs specialists in these rough roles: ${gate.roles.join(", ")}.`
            : "";
        const result = await callClaudeJSON<{ nodes: PlannedNode[] }>({
          model: CLAUDE_PLANNER_MODEL,
          maxTokens: 1500,
          timeoutMs: 45000,
          retries: 1,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: `${task.prompt}${roleHint}`,
        });
        const candidate = Array.isArray(result?.nodes) ? result.nodes : [];
        const validation = validateDag(candidate);
        if (validation.ok) {
          planned = candidate;
        } else {
          fallbackReason = validation.error;
          planned = deterministicFallbackPlan(task.prompt);
          plannerModel = "arbor:deterministic-fallback-v1";
        }
      } catch (err) {
        fallbackReason = err instanceof Error ? err.message : String(err);
        planned = deterministicFallbackPlan(task.prompt);
        plannerModel = "arbor:deterministic-fallback-v1";
      }

      if (fallbackReason !== null) {
        console.log(`[hive-planner] fallback single-node: ${fallbackReason}`);
      }
    }

    // 4. Persist the DAG, its nodes, the task linkage, and the initial ready set.
    const now = Date.now();
    const dag_id = await ctx.runMutation(internal.hiveData._insertDag, {
      root_task_id: args.task_id,
      goal: task.prompt,
      status: "planning",
      planner_model: plannerModel,
      max_budget: task.max_budget,
      created_at: now,
      updated_at: now,
    });

    await ctx.runMutation(internal.hiveData._insertNodes, {
      dag_id,
      nodes: planned.map((n) => ({
        node_id: n.id,
        description: n.description,
        depends_on: n.depends_on,
        success_criteria: n.success_criteria,
        task_class: n.task_class,
      })),
    });

    await ctx.runMutation(internal.hiveData._setHiveDagId, {
      task_id: args.task_id,
      hive_dag_id: dag_id,
    });

    const goalEntry = await ctx.runMutation(internal.scratchpad._write, {
      dag_id,
      task_id: args.task_id,
      agent_id: "hive-planner",
      kind: "proposal",
      namespace: "goal",
      content: task.prompt,
      content_format: "text",
      content_type: "text/plain",
      writer_did: didForAgent("hive-planner"),
      verified_writer: true,
      revision: 0,
      confidence: fallbackReason === null ? 1 : 0.5,
    });
    const plan = serializeBlackboardContent({ data: { nodes: planned } });
    const planEntry = await ctx.runMutation(internal.scratchpad._write, {
      dag_id,
      task_id: args.task_id,
      agent_id: "hive-planner",
      kind: "proposal",
      namespace: "proposals",
      content: plan.content,
      content_format: plan.content_format,
      content_type: plan.content_type,
      writer_did: didForAgent("hive-planner"),
      verified_writer: true,
      revision: 0,
      confidence: fallbackReason === null ? 1 : 0.5,
    });
    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id: goalEntry,
    });
    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id: planEntry,
    });

    // Entry-point nodes (no dependencies) start "ready" so advance routes them.
    for (const n of planned) {
      if (n.depends_on.length === 0) {
        await ctx.runMutation(internal.hiveData._setNodeStatus, {
          dag_id,
          node_id: n.id,
          status: "ready",
        });
      }
    }

    await ctx.runMutation(internal.hiveData._setDagStatus, {
      dag_id,
      status: "running",
    });

    // 5. Lifecycle log. topologicalLevels is safe on the validated/fallback plan.
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: args.task_id,
      event_type: "hive_plan_decided",
      payload: {
        dag_id,
        node_count: planned.length,
        levels: topologicalLevels(planned),
        fallback_used: fallbackReason !== null,
        gated_single: gatedSingle,
        planner_profile: plannerModel,
      },
    });

    // 6. Hand off to the orchestrator (direct internal reference).
    await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, {
      dag_id,
    });

    // 7.
    return { dag_id, node_count: planned.length };
  },
});
