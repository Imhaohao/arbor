// Sakana best-of-N candidate layer (ARBOR_HIVE_BESTOFN_ENABLED). When a node
// fans out into K candidate executions (see hiveRouter.routeNode), each child
// task settles here instead of directly onto the node:
//   - recordAndMaybePromote : archive this candidate, fold its outcome into the
//     agent flywheel, and — once all K candidates have settled (the barrier) —
//     run _settleBarrier.
//   - _settleBarrier        : ONE transactional mutation that claims the
//     promotion latch, selects the best archived output with the judge score,
//     patches the winner onto the node (or fails it to the W6 floor), and
//     schedules the follow-ups. Atomic, so a crash can never burn the latch
//     without also settling the node.
//   - forcePromotionCheck   : wall-clock liveness sweeper. Convex actions are
//     NOT retried on failure, so a candidate routeNode that dies before minting
//     its child would otherwise leave the barrier short forever.
//
// All new logic lives here so hiveOrchestrator.onNodeSettled's legacy
// single-winner path stays byte-for-byte unchanged when best-of-N is off.

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { didForAgent } from "../lib/hive/blackboard-core";
import { profileOutcomeSucceeded } from "../lib/hive/profile-core";
import {
  pairCandidateArchive,
  resolveWinnerPair,
  scoreCandidate,
  selectBestCandidate,
} from "../lib/hive/candidate-search-core";

const MAX_OUTPUT_CHARS = 50000;
const MAX_SCRATCHPAD_CHARS = 8000;

const candidateStatusValidator = v.union(
  v.literal("contender"),
  v.literal("promoted"),
  v.literal("rejected"),
);

// ─── Data layer ──────────────────────────────────────────────────────────────

// Insert a candidate (idempotent by task_id: a duplicate settle delivery patches
// the existing row instead of inserting a second one, so the barrier count stays
// stable).
export const _insertCandidate = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    candidate_index: v.number(),
    task_id: v.optional(v.id("tasks")),
    agent_id: v.optional(v.string()),
    output_text: v.optional(v.string()),
    calibrated_score: v.optional(v.number()),
    confidence: v.optional(v.number()),
    cost_paid: v.optional(v.number()),
    quality: v.optional(v.any()),
    status: candidateStatusValidator,
  },
  returns: v.object({
    id: v.id("hive_node_candidates"),
    inserted: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ id: Id<"hive_node_candidates">; inserted: boolean }> => {
    const existing = args.task_id
      ? await ctx.db
          .query("hive_node_candidates")
          .withIndex("by_task_id", (q) => q.eq("task_id", args.task_id))
          .first()
      : null;
    const fields = {
      dag_id: args.dag_id,
      node_id: args.node_id,
      candidate_index: args.candidate_index,
      task_id: args.task_id,
      agent_id: args.agent_id,
      output_text: args.output_text,
      calibrated_score: args.calibrated_score,
      confidence: args.confidence,
      cost_paid: args.cost_paid,
      quality: args.quality,
      status: args.status,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { id: existing._id, inserted: false };
    }
    const id = await ctx.db.insert("hive_node_candidates", {
      ...fields,
      created_at: Date.now(),
    });
    return { id, inserted: true };
  },
});

export const _candidatesForNode = internalQuery({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("hive_node_candidates"),
      candidate_index: v.number(),
      task_id: v.optional(v.id("tasks")),
      agent_id: v.optional(v.string()),
      output_text: v.optional(v.string()),
      calibrated_score: v.optional(v.number()),
      confidence: v.optional(v.number()),
      cost_paid: v.optional(v.number()),
      status: candidateStatusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("hive_node_candidates")
      .withIndex("by_dag_and_node", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      candidate_index: r.candidate_index,
      task_id: r.task_id,
      agent_id: r.agent_id,
      output_text: r.output_text,
      calibrated_score: r.calibrated_score,
      confidence: r.confidence,
      cost_paid: r.cost_paid,
      status: r.status,
    }));
  },
});

export const _countCandidatesForNode = internalQuery({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const rows = await ctx.db
      .query("hive_node_candidates")
      .withIndex("by_dag_and_node", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .collect();
    return rows.length;
  },
});

// ─── Transactional barrier settlement ────────────────────────────────────────

// Claim + select + promote in ONE transaction. Re-checks the latch itself, so
// callers need no separate claim step and a duplicate call is a harmless no-op.
// Convex guarantees functions scheduled from a mutation run exactly once iff the
// mutation commits, so the advance/lifecycle/blackboard follow-ups can never be
// lost while the node state says "settled" (and vice versa).
export const _settleBarrier = internalMutation({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    // Breadcrumb for the lifecycle log: which path resolved the barrier.
    trigger: v.union(v.literal("barrier"), v.literal("deadline")),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const node = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag_and_node_id", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .first();
    // Latch + state guards, all inside the transaction: only a fan-out node
    // still executing and not yet promoted can settle, and only once.
    if (
      !node ||
      node.status !== "executing" ||
      node.expected_candidates === undefined ||
      node.promotion_claimed === true
    ) {
      return false;
    }

    const rows = await ctx.db
      .query("hive_node_candidates")
      .withIndex("by_dag_and_node", (q) =>
        q.eq("dag_id", args.dag_id).eq("node_id", args.node_id),
      )
      .collect();
    const pairs = pairCandidateArchive(rows, (r) => ({
      candidate_index: r.candidate_index,
      agent_id: r.agent_id ?? "unknown",
      task_id: r.task_id ? String(r.task_id) : undefined,
      output_text: r.output_text ?? "",
      calibrated_score: r.calibrated_score,
      confidence: r.confidence,
      cost_paid: r.cost_paid,
      status: r.status,
    }));
    const selection = selectBestCandidate(pairs.map((p) => p.record));
    const totalCost = rows.reduce(
      (sum, r) => sum + (typeof r.cost_paid === "number" ? r.cost_paid : 0),
      0,
    );
    const dag = await ctx.db.get(args.dag_id);

    if (selection.winner === null) {
      // No candidate produced usable output (possibly zero candidates at the
      // deadline). Fail the node so advance's W6 floor backstop takes over.
      await ctx.db.patch(node._id, {
        promotion_claimed: true,
        status: "failed",
        output_text: "best-of-N: no candidate produced usable output",
        settled_at: Date.now(),
        updated_at: Date.now(),
      });
      if (dag !== null) {
        await ctx.scheduler.runAfter(0, internal.lifecycle.log, {
          task_id: dag.root_task_id,
          event_type: "hive_node_bestofn_failed",
          payload: {
            node_id: args.node_id,
            candidates: rows.length,
            trigger: args.trigger,
          },
        });
      }
      await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, {
        dag_id: args.dag_id,
      });
      return true;
    }

    const winnerPair = resolveWinnerPair(pairs, selection.winner, {
      taskIdOf: (r) => (r.task_id ? String(r.task_id) : undefined),
    });
    if (!winnerPair) {
      // Winner selected but not mappable to exactly one archive row — fail
      // closed so we never mark every candidate rejected or drop task_id.
      await ctx.db.patch(node._id, {
        promotion_claimed: true,
        status: "failed",
        output_text:
          "best-of-N: selected winner could not be matched to candidate archive",
        settled_at: Date.now(),
        updated_at: Date.now(),
      });
      if (dag !== null) {
        await ctx.scheduler.runAfter(0, internal.lifecycle.log, {
          task_id: dag.root_task_id,
          event_type: "hive_node_bestofn_failed",
          payload: {
            node_id: args.node_id,
            candidates: rows.length,
            trigger: args.trigger,
            reason: "winner_row_unresolved",
            winner_candidate_index: selection.winner.candidate_index,
            winner_task_id: selection.winner.task_id,
          },
        });
      }
      await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, {
        dag_id: args.dag_id,
      });
      return true;
    }
    const winnerRow = winnerPair.row;

    // Relabel the archive: winner promoted, everyone else rejected.
    for (const row of rows) {
      const status = row._id === winnerRow._id ? "promoted" : "rejected";
      if (row.status !== status) await ctx.db.patch(row._id, { status });
    }

    const winnerOutput = selection.winner.output_text.slice(0, MAX_OUTPUT_CHARS);
    await ctx.db.patch(node._id, {
      promotion_claimed: true,
      status: "complete",
      assigned_agent_id: selection.winner.agent_id,
      output_text: winnerOutput,
      eval_score: selection.winner.calibrated_score,
      task_id: winnerRow.task_id,
      cost_paid: Number(totalCost.toFixed(2)),
      settled_at: Date.now(),
      updated_at: Date.now(),
    });

    // Blackboard writes happen in a follow-up action (they call the scratchpad
    // mutation + embedding). Best-effort by design — the legacy settle treats
    // the blackboard the same way.
    if (winnerOutput.length > 0 && winnerRow.task_id) {
      await ctx.scheduler.runAfter(
        0,
        internal.hiveCandidates.persistWinnerArtifacts,
        {
          dag_id: args.dag_id,
          node_id: args.node_id,
          task_id: winnerRow.task_id,
          agent_id: selection.winner.agent_id,
          output_text: winnerOutput.slice(0, MAX_SCRATCHPAD_CHARS),
          score: selection.winner.calibrated_score,
          margin: selection.margin,
          candidates: rows.length,
          revision: node.revision_count ?? 0,
        },
      );
    }

    if (dag !== null) {
      await ctx.scheduler.runAfter(0, internal.lifecycle.log, {
        task_id: dag.root_task_id,
        event_type: "hive_node_bestofn_settled",
        payload: {
          node_id: args.node_id,
          candidates: rows.length,
          winner_agent: selection.winner.agent_id,
          winner_score: selection.winner.calibrated_score,
          margin: selection.margin,
          synthesize_eligible: selection.synthesize,
          total_cost: Number(totalCost.toFixed(2)),
          trigger: args.trigger,
        },
      });
    }

    await ctx.scheduler.runAfter(0, internal.hiveOrchestrator.advance, {
      dag_id: args.dag_id,
    });
    return true;
  },
});

// Blackboard follow-up for a promoted winner: artifact + decision entries plus
// their embeddings, mirroring the legacy settle so downstream nodes' recall is
// unchanged. Scheduled exactly-once from _settleBarrier's transaction.
export const persistWinnerArtifacts = internalAction({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    task_id: v.id("tasks"),
    agent_id: v.string(),
    output_text: v.string(),
    score: v.optional(v.number()),
    margin: v.number(),
    candidates: v.number(),
    revision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const entryId = await ctx.runMutation(internal.scratchpad._write, {
      dag_id: args.dag_id,
      node_id: args.node_id,
      task_id: args.task_id,
      agent_id: args.agent_id,
      kind: "artifact",
      namespace: "artifacts",
      content: args.output_text,
      content_format: "text",
      content_type: "text/plain",
      writer_did: didForAgent(args.agent_id),
      verified_writer: true,
      revision: args.revision,
      confidence: args.score ?? 0.5,
    });
    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id: entryId,
    });

    const decisionId = await ctx.runMutation(internal.scratchpad._write, {
      dag_id: args.dag_id,
      node_id: args.node_id,
      task_id: args.task_id,
      agent_id: args.agent_id,
      kind: "decision",
      namespace: "decisions",
      content: `node ${args.node_id} best-of-${args.candidates}: promoted ${
        args.agent_id
      } (score ${args.score?.toFixed(3) ?? "n/a"}, margin ${args.margin.toFixed(3)})`,
      content_format: "text",
      content_type: "text/plain",
      writer_did: didForAgent("hive-control"),
      verified_writer: true,
      revision: args.revision,
      confidence: 1.0,
    });
    await ctx.scheduler.runAfter(0, internal.scratchpadActions.embedEntry, {
      entry_id: decisionId,
    });
    return null;
  },
});

// ─── Candidate settle + barrier check ────────────────────────────────────────

export const recordAndMaybePromote = internalAction({
  args: { task_id: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const task = await ctx.runQuery(internal.tasks._get, {
      task_id: args.task_id,
    });
    const candidateIndex = task.hive_candidate_index;
    const dagId = task.hive_dag_id as Id<"hive_dags"> | undefined;
    const nodeId = task.hive_node_id;
    if (
      typeof candidateIndex !== "number" ||
      dagId === undefined ||
      nodeId === undefined
    ) {
      return null;
    }
    // Only act once the child task has actually reached a terminal state.
    if (
      task.status !== "complete" &&
      task.status !== "disputed" &&
      task.status !== "failed" &&
      task.status !== "cancelled"
    ) {
      return null;
    }

    const node = await ctx.runQuery(internal.hiveData._getNodeByDagAndNodeId, {
      dag_id: dagId,
      node_id: nodeId,
    });
    if (node === null) return null;

    // Extract material (same duck-typing as the legacy settle path).
    const resultText =
      typeof task.result === "object" && task.result && "text" in task.result
        ? (task.result as { text: string }).text
        : task.result !== undefined && task.result !== null
          ? JSON.stringify(task.result)
          : "";
    let agentId =
      typeof task.result === "object" && task.result && "agent_id" in task.result
        ? (task.result as { agent_id?: string }).agent_id
        : undefined;
    if (!agentId && task.winning_bid_id) {
      try {
        const winningBid = await ctx.runQuery(internal.bids._get, {
          bid_id: task.winning_bid_id,
        });
        agentId = winningBid.agent_id;
      } catch {
        // Preserve candidate settlement even if the bid row vanished.
      }
    }
    const verdict = task.judge_verdict as
      | { verdict?: string; quality_score?: number }
      | undefined
      | null;
    const qualityScore =
      verdict && typeof verdict.quality_score === "number"
        ? verdict.quality_score
        : undefined;

    // A candidate is usable if it produced material output. A "disputed"
    // (judge-rejected) result with text is still a contender — the best-of-N
    // selection will simply score it lower.
    const usableOutput =
      task.status === "complete" || task.status === "disputed" ? resultText : "";
    const { calibrated_score, confidence } = scoreCandidate({
      outputText: usableOutput,
      qualityScore,
    });

    const { inserted } = await ctx.runMutation(
      internal.hiveCandidates._insertCandidate,
      {
        dag_id: dagId,
        node_id: nodeId,
        candidate_index: candidateIndex,
        task_id: args.task_id,
        agent_id: agentId,
        output_text: usableOutput.slice(0, MAX_OUTPUT_CHARS),
        calibrated_score,
        confidence,
        cost_paid: task.price_paid,
        status: "contender",
      },
    );

    // Fold every candidate's outcome into the FlyRoute flywheel — best-of-N
    // yields K training signals per node instead of one. Only on the first
    // (genuinely new) record so a duplicate settle delivery cannot double-count
    // an agent's EWMA profile. Best-effort.
    if (agentId && inserted) {
      const latencySeconds = Math.max(0, (Date.now() - task._creationTime) / 1000);
      try {
        await ctx.runMutation(internal.agentProfiles._recordOutcome, {
          agent_id: agentId,
          task_class: node.task_class,
          success: profileOutcomeSucceeded(task.status, verdict?.verdict),
          quality_score: qualityScore,
          latency_seconds: latencySeconds,
          price_paid: task.price_paid,
        });
      } catch (err) {
        console.warn(
          `[hive-candidates] profile update failed for ${agentId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Barrier: once every fanned-out candidate has settled, run the atomic
    // claim+promote. _settleBarrier re-checks the latch transactionally, so the
    // pre-count is only an optimization to avoid a pointless mutation; multiple
    // concurrent callers are safe, and each child's several settle triggers
    // (auction settle event + timer) give the barrier natural retries if this
    // action dies before the mutation lands.
    const expected = node.expected_candidates ?? 1;
    const settledCount = await ctx.runQuery(
      internal.hiveCandidates._countCandidatesForNode,
      { dag_id: dagId, node_id: nodeId },
    );
    if (settledCount < expected) return null;

    await ctx.runMutation(internal.hiveCandidates._settleBarrier, {
      dag_id: dagId,
      node_id: nodeId,
      trigger: "barrier",
    });
    return null;
  },
});

// Liveness sweeper for the fan-out barrier. Scheduled by routeNode when a node
// fans out; fires after the bid window + ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS.
// If the node is still waiting on candidates by then (a candidate routeNode
// threw before minting its child, a child stuck non-terminal, etc. — Convex
// actions are NOT retried on failure), the atomic _settleBarrier promotes from
// whatever candidates HAVE landed. Zero candidates flows through its
// winner-null branch: node fails → advance step 1b hands it to the W6 floor.
// Idempotent: if the barrier already resolved, the latch is taken and
// _settleBarrier no-ops.
export const forcePromotionCheck = internalAction({
  args: { dag_id: v.id("hive_dags"), node_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const node = await ctx.runQuery(internal.hiveData._getNodeByDagAndNodeId, {
      dag_id: args.dag_id,
      node_id: args.node_id,
    });
    if (
      node === null ||
      node.status !== "executing" ||
      node.expected_candidates === undefined ||
      node.promotion_claimed === true
    ) {
      return null;
    }

    const settledCount = await ctx.runQuery(
      internal.hiveCandidates._countCandidatesForNode,
      { dag_id: args.dag_id, node_id: args.node_id },
    );
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: args.dag_id,
    });
    if (dag !== null && settledCount < node.expected_candidates) {
      await ctx.runMutation(internal.lifecycle.log, {
        task_id: dag.root_task_id,
        event_type: "hive_node_bestofn_deadline",
        payload: {
          node_id: args.node_id,
          expected: node.expected_candidates,
          settled: settledCount,
        },
      });
    }

    await ctx.runMutation(internal.hiveCandidates._settleBarrier, {
      dag_id: args.dag_id,
      node_id: args.node_id,
      trigger: "deadline",
    });
    return null;
  },
});
