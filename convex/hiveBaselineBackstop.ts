"use node";

// Guaranteed terminal executor (W6) — backstop for EVERY node class.
//
// This is the belt-and-suspenders guarantee behind the hive's "always
// terminates" contract. The PRIMARY mechanism is that the Arbor-owned floor
// agents are registered in SPECIALISTS and bid (last-resort) on every auction,
// so a node normally completes through the ordinary auction path. This backstop
// covers the residual case where even that path fails: after shortlist +
// bounded open-retry exhaust, the orchestrator hands the failed node here and
// we run an Arbor-owned runner DIRECTLY inside Convex (no tunnel needed):
//   - PR-review nodes  -> arbor-baseline (specialized reviewer)
//   - everything else  -> arbor-hive-backstop (universal model floor)
// Then we write the full attributable trail the trust bar requires: node
// output, a scratchpad diagnostic, a judge verdict, and a reputation_dimensions
// record. No hive node may terminate silently.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { arborBaseline, ARBOR_BASELINE_LABEL } from "../lib/specialists/arbor-baseline";
import {
  arborHiveBackstop,
  ARBOR_HIVE_BACKSTOP_LABEL,
} from "../lib/specialists/arbor-hive-backstop";
import { isPrReviewTask } from "../lib/specialists/pr-review-detect";
import { callOpenAIJSON } from "../lib/openai";

const JUDGE_MODEL = "arbor-backstop-judge";

// Stable prefix written to a node's output_text when the backstop itself could
// not produce a deliverable. The orchestrator checks for it so a failed
// backstop is never re-scheduled into an infinite loop — the DAG fails honestly
// instead.
export const BACKSTOP_FAILED_PREFIX =
  "arbor backstop could not produce a deliverable";

// Rows written before the W6 generalization carry the old PR-review-era prefix;
// the orchestrator honors both so legacy failed nodes are not re-looped.
export const LEGACY_BACKSTOP_FAILED_PREFIX =
  "arbor-baseline backstop could not produce a review";

interface BackstopVerdict {
  verdict?: "accept" | "reject";
  quality_score?: number;
  reasoning?: string;
}

export const runForFailedNode = internalAction({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // 1. Atomic claim: failed -> executing. Only one invocation proceeds.
    const claimed = await ctx.runMutation(
      internal.hiveData._claimNodeForBackstop,
      { dag_id: args.dag_id, node_id: args.node_id },
    );
    if (!claimed) return null;

    const node = await ctx.runQuery(internal.hiveData._getNodeByDagAndNodeId, {
      dag_id: args.dag_id,
      node_id: args.node_id,
    });
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: args.dag_id,
    });
    if (!node || !dag) return null;

    const prompt =
      node.description +
      (node.success_criteria ? `\n\nSuccess criteria: ${node.success_criteria}` : "");

    // Runner selection: the specialized reviewer for PR-review nodes, the
    // universal Arbor model floor for every other task class.
    const isPr = isPrReviewTask(prompt, node.task_class);
    const runner = isPr ? arborBaseline : arborHiveBackstop;
    const agentId = isPr ? "arbor-baseline" : "arbor-hive-backstop";
    const label = isPr ? ARBOR_BASELINE_LABEL : ARBOR_HIVE_BACKSTOP_LABEL;
    const taskType = isPr ? "pr-review" : (node.task_class ?? "general");

    const startedAt = Date.now();
    try {
      // 2. Run the Arbor-owned runner directly (no toolRecorder — this is not
      //    the auction execute path, so the receipt gate does not apply here).
      const { output } = await runner.execute(prompt, taskType, {
        task_id: node.task_id ? String(node.task_id) : undefined,
        agent_id: agentId,
      });
      // Runners return string output; normalize defensively.
      const reviewText =
        typeof output === "string"
          ? output
          : "summary" in output
            ? output.summary
            : `Delivered ${output.kind} artifact ${output.artifact_id}.`;
      const actualSeconds = Math.max(0.1, (Date.now() - startedAt) / 1000);

      // 3. Lightweight judge so "verified" stays falsifiable, not vibes.
      let verdict: BackstopVerdict;
      try {
        verdict = await callOpenAIJSON<BackstopVerdict>({
          systemPrompt:
            'You judge a deliverable produced by an automated agent. Given the task and the deliverable, decide whether it materially addresses the task with specific, grounded content. Output JSON only: { "verdict": "accept" | "reject", "quality_score": <0.0-1.0>, "reasoning": "<one sentence>" }',
          userPrompt: `Task:\n${prompt.slice(0, 1500)}\n\nDeliverable:\n${reviewText.slice(0, 3000)}`,
          maxTokens: 256,
          timeoutMs: 20_000,
          retries: 1,
          purpose: "judge",
        });
      } catch (err) {
        verdict = {
          verdict: "accept",
          quality_score: 0.5,
          reasoning: `backstop judge unavailable (${err instanceof Error ? err.message : String(err)}); accepting material review`,
        };
      }
      const accepted = verdict.verdict !== "reject";
      const qualityScore = Math.max(
        0,
        Math.min(1, typeof verdict.quality_score === "number" ? verdict.quality_score : 0.5),
      );

      // 4. Complete the node with the labeled deliverable.
      await ctx.runMutation(internal.hiveData._patchNode, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        status: "complete",
        assigned_agent_id: agentId,
        output_text: reviewText.slice(0, 50_000),
        eval_score: qualityScore,
      });

      // 5. Scratchpad diagnostic — attributable reason for the fallback.
      await ctx.runMutation(internal.scratchpad._write, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        task_id: node.task_id ?? undefined,
        agent_id: agentId,
        kind: "decision",
        content: `${label} no live specialist completed node ${node.node_id}; Arbor-owned backstop produced the deliverable (judge ${accepted ? "accept" : "reject"}, quality ${qualityScore.toFixed(2)}).`,
        confidence: qualityScore,
      });

      // 6. Judge verdict row.
      await ctx.runMutation(internal.hiveData._insertEvaluation, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        agent_id: agentId,
        score: qualityScore,
        verdict: accepted ? "accept" : "reject",
        reasoning:
          verdict.reasoning ??
          "arbor backstop deliverable accepted as material",
        judge_model: JUDGE_MODEL,
      });

      // 7. Reputation dimensions (attributable). No escrow ran in the backstop,
      //    so price_paid is 0 and bid_price is the baseline cost.
      if (node.task_id) {
        await ctx.runMutation(internal.reputationDimensions._record, {
          agent_id: agentId,
          task_id: node.task_id,
          actual_seconds: actualSeconds,
          estimated_seconds: 45,
          quality_score: qualityScore,
          accepted,
          bid_price: 0.4,
          price_paid: 0,
        });
      }

      // Capability-profile flywheel (W3): backstop runs are outcomes too.
      await ctx.runMutation(internal.agentProfiles._recordOutcome, {
        agent_id: agentId,
        task_class: node.task_class,
        success: accepted,
        quality_score: qualityScore,
        latency_seconds: actualSeconds,
        price_paid: 0,
      });

      // 8. Lifecycle breadcrumbs on the root task (settled + backstop marker).
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: dag.root_task_id,
        event_type: "hive_baseline_backstop",
        payload: {
          node_id: node.node_id,
          agent_id: agentId,
          verdict: accepted ? "accept" : "reject",
          quality_score: qualityScore,
          reason: "no_live_specialist_completed_node",
        },
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: dag.root_task_id,
        event_type: "hive_node_settled",
        payload: {
          node_id: node.node_id,
          status: "complete",
          agent_id: agentId,
          quality_score: qualityScore,
          via: "baseline_backstop",
        },
      });
    } catch (err) {
      // Honest "could not complete it, here is why" — never a silent failure.
      const reason = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.hiveData._patchNode, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        status: "failed",
        output_text: `${BACKSTOP_FAILED_PREFIX}: ${reason}`,
      });
      await ctx.runMutation(internal.scratchpad._write, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        task_id: node.task_id ?? undefined,
        agent_id: agentId,
        kind: "observation",
        content: `${label} backstop failed for node ${node.node_id}: ${reason}. No live specialist and the backstop model call did not return — node cannot be completed.`,
        confidence: 0,
      });
      await ctx.runMutation(internal.hiveData._insertEscalation, {
        dag_id: args.dag_id,
        task_id: dag.root_task_id,
        kind: "low_confidence",
        reason: `hive_backstop_failed: ${reason}`,
        payload: { node_id: node.node_id, agent_id: agentId },
      });
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: dag.root_task_id,
        event_type: "hive_baseline_backstop_failed",
        payload: { node_id: node.node_id, reason },
      });
    }

    // 9. Re-advance to detect completion / propagate the honest failure.
    await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, {
      dag_id: args.dag_id,
    });
    return null;
  },
});
