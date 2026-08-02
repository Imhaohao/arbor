"use node";

// Hive router (Layer 5). routeNode shortlists candidate agents for a single
// DAG node, mints a child auction task scoped to that shortlist (via
// invited_agent_ids), and kicks off the EXISTING Vickrey auction on it. The
// auction mechanism (solicitBids + resolve) is reused, never reimplemented.
//
// "use node" because we call the Anthropic helper (lib/anthropic.ts) for task
// classification and the registry search action.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BID_WINDOW_SECONDS } from "./tasks";
import { callClaudeJSON, CLAUDE_FAST_MODEL } from "../lib/anthropic";
import {
  adaptiveInviteCount,
  allocateNodeBudget,
  buildRoutingQuery,
  decideRouteMode,
  directRouteLiquidity,
  expertDelegationEnabled,
  expertDelegationShadowEnabled,
  expertMinTasks,
  explicitAgentMentions,
  FULL_SHORTLIST_INVITES,
  orchestratorFirstEnabled,
  promoteExplicitAgentMentions,
  shouldFallbackOpen,
} from "../lib/hive/router-core";
import {
  assessCapability,
  routingIntegrityEnabled,
} from "../lib/hive/routing-integrity-core";
import {
  bestOfNEnabled,
  fanoutDeadlineSeconds,
  fanoutMaxWidth,
  fanoutMinBudget,
  plannedFanoutWidth,
} from "../lib/hive/candidate-search-core";
import { assembleBlackboardPointers } from "../lib/hive/context-store";
import {
  EXPERT_PROFILE_WEIGHT,
  profileWeightedRank,
  type AgentProfile,
} from "../lib/hive/profile-core";
import {
  BUNDLED_DELEGATION_HEAD,
  rankWithBundledDelegationHead,
} from "../lib/hive/delegation-head";
import { ARBOR_FLOOR_AGENT_IDS } from "../lib/specialists/registry";

// FlyRoute proven-bad filter (W3): with this much evidence and a success rate
// this low, the agent is dropped from the shortlist (open auctions unaffected).
const PROVEN_BAD_MIN_TASKS = 5;
const PROVEN_BAD_SUCCESS_RATE = 0.2;

const VALID_TASK_CLASSES = new Set([
  "reasoning",
  "classification",
  "extraction",
  "generation",
]);
const DEFAULT_TASK_CLASS = "reasoning";
const HINT_PREFIX_CHARS = 100;

const CLASSIFY_SYSTEM_PROMPT =
  'Respond with exactly one of: reasoning, classification, extraction, generation. ' +
  "Choose the single best task class for the described sub-task. " +
  'Output strict JSON {"task_class":"..."}.';

/**
 * Route one DAG node: classify it, shortlist agents, create a scoped child
 * auction task and start the Vickrey auction.
 *
 * Idempotent: the orchestrator claims a node by flipping it to "auctioned"
 * before scheduling routeNode. If routeNode is delivered more than once, every
 * call after the first sees a node whose status is no longer "auctioned" and
 * returns immediately without minting a duplicate child task.
 */
export const routeNode = internalAction({
  args: {
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    // Set by the orchestrator's bounded open-retry: skip the registry shortlist
    // and run a full open auction (every roster agent may bid). This is the
    // safety valve when a node's shortlisted auction produced no plausible bid.
    force_open: v.optional(v.boolean()),
    // Sakana best-of-N sibling dispatch: the primary routeNode call (index
    // undefined) decides the fan-out width and re-schedules itself once per
    // extra candidate with an explicit index + pre-split per-candidate budget.
    candidate_index: v.optional(v.number()),
    per_candidate_budget: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const dag = await ctx.runQuery(internal.hiveData._getDag, {
      dag_id: args.dag_id,
    });
    if (!dag) {
      console.warn(`[hive-router] dag ${args.dag_id} not found; skipping`);
      return null;
    }

    const node = await ctx.runQuery(internal.hiveData._getNodeByDagAndNodeId, {
      dag_id: args.dag_id,
      node_id: args.node_id,
    });
    // A best-of-N sibling (candidate_index > 0) runs while the node is already
    // "executing" (the primary claimed it), so it uses a different guard: proceed
    // as long as the node has not reached a terminal state. The primary and the
    // legacy path keep the strict "auctioned" claim guard for idempotency.
    const isCandidateSibling =
      typeof args.candidate_index === "number" && args.candidate_index > 0;
    if (!node) {
      console.warn(
        `[hive-router] node ${args.node_id} in dag ${args.dag_id} missing; skipping`,
      );
      return null;
    }
    if (isCandidateSibling) {
      if (node.status === "complete" || node.status === "failed") {
        console.warn(
          `[hive-router] node ${args.node_id} candidate ${args.candidate_index} ` +
            `arrived after node terminal (${node.status}); skipping`,
        );
        return null;
      }
    } else if (node.status !== "auctioned") {
      console.warn(
        `[hive-router] node ${args.node_id} in dag ${args.dag_id} is not ` +
          `"auctioned" (status=${node?.status ?? "missing"}); skipping (idempotent)`,
      );
      return null;
    }
    const rootTask = await ctx.runQuery(internal.tasks._get, {
      task_id: dag.root_task_id,
    });

    // 1. Dependency outputs from the scratchpad: for each upstream node, take
    //    its most recent "result" entries (best-effort; never block routing).
    //    This single read path feeds BOTH the routing-query hints and the
    //    shared-context block injected into the child prompt below.
    type ContextEntry = {
      entry_id: string;
      artifact_id?: string;
      agent_id: string;
      kind: string;
      confidence: number;
      content: string;
      created_at: number;
      namespace?: string;
      revision?: number;
      content_format?: string;
    };
    const dependencyEntries: ContextEntry[] = [];
    for (const depId of node.depends_on) {
      try {
        const rows = await ctx.runQuery(internal.scratchpad._forNode, {
          dag_id: args.dag_id,
          node_id: depId,
        });
        const results = rows
          .filter((row) => row.kind === "result" || row.kind === "artifact")
          .slice(0, 2);
        for (const row of results) {
          dependencyEntries.push({
            entry_id: String(row._id),
            artifact_id: row.artifact_id
              ? String(row.artifact_id)
              : undefined,
            agent_id: row.agent_id,
            kind: row.kind,
            confidence: row.confidence,
            content: row.content,
            created_at: row.created_at,
            namespace: row.namespace,
            revision: row.revision,
            content_format: row.content_format,
          });
        }
      } catch (err) {
        console.warn(
          `[hive-router] scratchpad._forNode(${depId}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    const hints = dependencyEntries
      .map((entry) => entry.content.slice(0, HINT_PREFIX_CHARS))
      .filter((line): line is string => Boolean(line && line.trim()));

    // Consensus revisions must see their evaluator critique even if the async
    // embedding has not landed yet. This indexed node read is deterministic.
    const reviewEntries: ContextEntry[] = [];
    try {
      const rows = await ctx.runQuery(internal.scratchpad._forNode, {
        dag_id: args.dag_id,
        node_id: args.node_id,
      });
      for (const row of rows.filter((entry) => entry.kind === "critique").slice(0, 3)) {
        reviewEntries.push({
          entry_id: String(row._id),
          artifact_id: row.artifact_id ? String(row.artifact_id) : undefined,
          agent_id: row.agent_id,
          kind: row.kind,
          confidence: row.confidence,
          content: row.content,
          created_at: row.created_at,
          namespace: row.namespace,
          revision: row.revision,
          content_format: row.content_format,
        });
      }
    } catch (err) {
      console.warn(
        `[hive-router] review context read failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Semantic recall over the whole DAG scratchpad (best-effort). The action
    // returns `entry` as `any`, so we narrow each hit to RecallEntry at map.
    type RecallEntry = {
      _id: Id<"scratchpad_entries">;
      artifact_id?: Id<"media_artifacts">;
      agent_id: string;
      kind: string;
      confidence: number;
      content: string;
      created_at: number;
      namespace?: string;
      revision?: number;
      content_format?: string;
    };
    let recall: Array<{ entry: unknown; score: number }> = [];
    try {
      recall = await ctx.runAction(api.scratchpadActions.semanticRecall, {
        dag_id: args.dag_id,
        query: node.description,
        limit: 5,
      });
    } catch (err) {
      console.warn(
        `[hive-router] scratchpadActions.semanticRecall failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      recall = [];
    }
    const recallEntries: ContextEntry[] = recall.map((r) => {
      const e = r.entry as RecallEntry;
      return {
        entry_id: String(e._id),
        artifact_id: e.artifact_id ? String(e.artifact_id) : undefined,
        agent_id: e.agent_id,
        kind: e.kind,
        confidence: e.confidence,
        content: e.content,
        created_at: e.created_at,
        namespace: e.namespace,
        revision: e.revision,
        content_format: e.content_format,
      };
    });

    const sharedContext = assembleBlackboardPointers({
      dagId: String(args.dag_id),
      entries: [...dependencyEntries, ...reviewEntries, ...recallEntries],
      maxChars: 4000,
    });

    // 2. Resolve the task class (classify only if not already set).
    let taskClass = node.task_class;
    if (!taskClass) {
      taskClass = DEFAULT_TASK_CLASS;
      try {
        const classified = await callClaudeJSON<{ task_class: string }>({
          model: CLAUDE_FAST_MODEL,
          systemPrompt: CLASSIFY_SYSTEM_PROMPT,
          userPrompt: node.description,
          maxTokens: 64,
        });
        const candidate = classified?.task_class?.trim().toLowerCase();
        if (candidate && VALID_TASK_CLASSES.has(candidate)) {
          taskClass = candidate;
        }
      } catch (err) {
        console.warn(
          `[hive-router] task classification failed; defaulting to ` +
            `${DEFAULT_TASK_CLASS}: ${
              err instanceof Error ? err.message : String(err)
            }`,
        );
      }
      await ctx.runMutation(internal.hiveData._patchNode, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        task_class: taskClass,
      });
    }

    // 3. Per-node budget + agent shortlist. SeqRoute-style (W2): allocate this
    //    node's ceiling from the REMAINING budget (max_budget minus realized
    //    spend) weighted by estimated difficulty, reserving budget for deeper
    //    downstream nodes instead of splitting the original budget evenly.
    const nodes = await ctx.runQuery(internal.hiveData._getNodes, {
      dag_id: args.dag_id,
    });
    const { spent } = await ctx.runQuery(internal.hiveData._dagSpend, {
      dag_id: args.dag_id,
    });
    const nodeBudget = allocateNodeBudget({
      dagBudget: dag.max_budget,
      spent,
      nodes: nodes.map((n) => ({
        node_id: n.node_id,
        description: n.description,
        success_criteria: n.success_criteria,
        task_class: n.node_id === args.node_id ? taskClass : n.task_class,
        depends_on: n.depends_on,
        // This node was claimed to "auctioned"/"executing" for routing; it is
        // unfinished by definition, whatever the raceful read says.
        status: n.node_id === args.node_id ? "auctioned" : n.status,
      })),
      nodeId: args.node_id,
    });

    // 3b. Sakana best-of-N fan-out decision. Only the PRIMARY call (no
    //     candidate_index) decides: when best-of-N is on and this node's class is
    //     high-value with budget to spare, split the node ceiling across K
    //     candidate executions and re-schedule routeNode once per extra
    //     candidate. Siblings inherit the pre-split per-candidate budget and skip
    //     the decision. When best-of-N is off (or width collapses to 1), budget
    //     equals the full node ceiling and everything below is unchanged.
    let budget = nodeBudget;
    let candidateIndex: number | undefined;
    let isFanout = false;
    if (isCandidateSibling) {
      budget = args.per_candidate_budget ?? nodeBudget;
      candidateIndex = args.candidate_index;
      isFanout = true;
    } else {
      const fan = plannedFanoutWidth({
        // Fan out only on a node's FIRST attempt. A consensus revision
        // (revision_count > 0) is AB-MCTS "deeper" — one targeted refinement
        // guided by the evaluator critique — not "wider"; it runs the legacy
        // single-winner path. This also keeps round-1 barrier state
        // (expected_candidates, promotion_claimed) provably inert: no round-2
        // candidate can ever re-enter the claimed latch.
        enabled: bestOfNEnabled() && (node.revision_count ?? 0) === 0,
        taskClass,
        nodeBudget,
        perCandidateFloor: fanoutMinBudget(),
        maxWidth: fanoutMaxWidth(),
      });
      if (fan.qualifies && fan.width > 1) {
        budget = fan.perCandidateBudget;
        candidateIndex = 0;
        isFanout = true;
        // Claim the node for fan-out: record the expected K and hold it
        // "executing" while all candidates run. task_id is deliberately left
        // unset — the promoted winner becomes node.task_id at barrier time.
        await ctx.runMutation(internal.hiveData._patchNode, {
          dag_id: args.dag_id,
          node_id: args.node_id,
          status: "executing",
          expected_candidates: fan.width,
        });
        for (let i = 1; i < fan.width; i += 1) {
          await ctx.scheduler.runAfter(0, internal.hiveRouter.routeNode, {
            dag_id: args.dag_id,
            node_id: args.node_id,
            candidate_index: i,
            per_candidate_budget: fan.perCandidateBudget,
          });
        }
        // Liveness backstop: Convex actions are not retried on failure, so a
        // candidate routeNode that dies before minting its child would leave
        // the barrier short forever. After the bid window plus a generous
        // execution allowance, the sweeper promotes from whatever candidates
        // actually settled (or fails the node to the W6 floor if none did).
        await ctx.scheduler.runAfter(
          (BID_WINDOW_SECONDS + fanoutDeadlineSeconds()) * 1000,
          internal.hiveCandidates.forcePromotionCheck,
          { dag_id: args.dag_id, node_id: args.node_id },
        );
        await ctx.runMutation(internal.lifecycle.log, {
          task_id: dag.root_task_id,
          event_type: "hive_node_fanout",
          payload: {
            node_id: args.node_id,
            width: fan.width,
            per_candidate_budget: fan.perCandidateBudget,
            node_budget: nodeBudget,
            task_class: taskClass,
            reason: fan.reason,
          },
        });
      }
    }

    const query = buildRoutingQuery(
      { description: node.description, success_criteria: node.success_criteria },
      hints,
    );
    const explicitRosterMatches = args.force_open
      ? []
      : explicitAgentMentions(
          query,
          await ctx.runQuery(api.discoveredSpecialists.list, {}),
        );
    // On a force_open retry, skip the semantic shortlist entirely and run an
    // open auction (invited = undefined). Otherwise shortlist, falling back to
    // open when the candidate set is too thin (shouldFallbackOpen).
    const candidates = args.force_open
      ? []
      : await ctx.runAction(api.hiveRegistry.searchAgents, {
          query,
          top_k: FULL_SHORTLIST_INVITES,
          min_reputation: 0.3,
          max_cost: budget,
          model_gateway: rootTask.model_gateway,
          pinned_agent_ids: explicitRosterMatches.map(
            (candidate) => candidate.agent_id,
          ),
          // W4: base shortlist order is now the 4D blend (capability x
          // reputation x price x availability) instead of raw similarity.
          // The profile-weighted re-rank below still applies on top of it.
          rank_mode: "4d",
        });
    // FlyRoute profile weighting (W3): blend each candidate's capability
    // profile into its semantic similarity, drop proven-bad agents (enough
    // evidence, dismal success rate), and log the scores as flywheel data.
    // Best-effort: a profile-store hiccup leaves the semantic order intact.
    let ranked = candidates.map((c) => ({ ...c, routing_score: c.similarity }));
    // Observed per-agent prices from the W3 flywheel, for direct-mode pricing.
    const profilePrices = new Map<string, number>();
    let profilesByAgent = new Map<string, AgentProfile>();
    if (candidates.length > 0) {
      try {
        const profileRows: AgentProfile[] = await ctx.runQuery(
          internal.agentProfiles._profilesFor,
          {
            agent_ids: candidates.map((c) => c.agent_id),
            task_class: taskClass,
          },
        );
        profilesByAgent = new Map(profileRows.map((p) => [p.agent_id, p]));
        for (const p of profileRows) {
          if (p.tasks > 0 && p.avg_price > 0) {
            profilePrices.set(p.agent_id, p.avg_price);
          }
        }
        ranked = profileWeightedRank(candidates, profilesByAgent).filter((c) => {
          const profile = profilesByAgent.get(c.agent_id);
          return !(
            profile &&
            profile.tasks >= PROVEN_BAD_MIN_TASKS &&
            profile.success_rate < PROVEN_BAD_SUCCESS_RATE
          );
        });
      } catch (err) {
        console.warn(
          `[hive-router] profile weighting failed; using semantic order: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Exact class profiles can authorize a direct expert assignment. A
    // `general` fallback remains useful for ranking but is deliberately
    // excluded here: generic success is not proof of class expertise.
    const exactProfiles = new Map(
      Array.from(profilesByAgent.entries()).filter(
        ([, profile]) => profile.task_class === taskClass,
      ),
    );
    const expertEnabled = expertDelegationEnabled();
    const expertShadowEnabled = expertDelegationShadowEnabled();
    const minExpertTasks = expertMinTasks();
    const eligibleAgentIds = new Set(ranked.map((candidate) => candidate.agent_id));
    const learnedInputs = candidates
      .filter((candidate) => eligibleAgentIds.has(candidate.agent_id))
      .map((candidate) => ({
        ...candidate,
        routing_score: candidate.rank_score ?? candidate.similarity,
      }));
    const prelearnedScores = new Map(
      learnedInputs.map((candidate) => [candidate.agent_id, candidate.routing_score]),
    );
    const learnedRanked =
      expertEnabled || expertShadowEnabled
        ? profileWeightedRank(
            rankWithBundledDelegationHead(query, learnedInputs),
            profilesByAgent,
            { profileWeight: EXPERT_PROFILE_WEIGHT },
          )
        : ranked.map((candidate) => ({
            ...candidate,
            learned_score: undefined as number | undefined,
          }));
    const learnedByAgent = new Map(
      learnedRanked.map((candidate) => [candidate.agent_id, candidate]),
    );
    if (expertEnabled) ranked = learnedRanked;
    ranked = promoteExplicitAgentMentions(query, ranked);

    // Orchestrator-first gate (ARBOR_ORCHESTRATOR_FIRST_ENABLED, default off):
    // on a thin market, skip the bid round and directly assign the top
    // profile-ranked ready candidate. The decision is conservative — force_open
    // retries, best-of-N fan-outs, consensus revisions, and exhausted budgets
    // all stay on the auction path (see decideRouteMode).
    const routeContext = {
      forceOpen: Boolean(args.force_open),
      isFanout,
      revisionCount: node.revision_count ?? 0,
      budget,
      floorAgentIds: ARBOR_FLOOR_AGENT_IDS,
      liquidityThreshold: directRouteLiquidity(),
      profilePrices,
      expertMinTasks: minExpertTasks,
      taskClass,
      profiles: exactProfiles,
    };
    const routeMode = decideRouteMode({
      ...routeContext,
      enabled: orchestratorFirstEnabled(),
      expertEnabled,
      candidates: ranked,
    });
    // Shadow mode evaluates only the expert policy and never changes routing.
    // It gives a counterfactual recommendation while the normal auction still
    // supplies the realized winner/quality label needed for calibration.
    const expertShadow =
      !expertEnabled && expertShadowEnabled
        ? decideRouteMode({
            ...routeContext,
            enabled: false,
            expertEnabled: true,
            candidates: learnedRanked,
          })
        : undefined;
    const isDirect =
      routeMode.mode === "direct" && Boolean(routeMode.direct_agent_id);

    // Routing integrity: a sorted shortlist is not the same as a CAPABLE
    // shortlist. Measured on the live pool, "make me a video about a kid jumping
    // in joy after getting into stanford" put a human-state agent, a Korean news
    // agent and a rental search at the top with a best similarity of 0.2332 —
    // pure noise, because no video-capable agent was reachable. Assess the
    // semantic floor and treat "nothing here can do this" as another reason to
    // open the auction rather than trusting an irrelevant shortlist.
    //
    // Always computed so the assessment lands in the routing event even when the
    // flag is off (shadow observability); only gates behaviour when enabled.
    const capabilityIntegrity = assessCapability(
      candidates.map((candidate) => candidate.similarity),
    );
    const integrityGated =
      routingIntegrityEnabled() &&
      capabilityIntegrity.verdict === "no_capable_candidate";

    const openFallback =
      Boolean(args.force_open) || shouldFallbackOpen(ranked) || integrityGated;
    const uniqueRanked = Array.from(
      new Map(ranked.map((candidate) => [candidate.agent_id, candidate])).values(),
    );
    const auctionCandidateLimit = adaptiveInviteCount({
      enabled: expertEnabled,
      candidates: uniqueRanked,
      profiles: exactProfiles,
      minTasks: minExpertTasks,
    });
    const explicitlyNamedCandidates = explicitAgentMentions(query, ranked);
    const auctionCandidates =
      explicitlyNamedCandidates.length > 0
        ? explicitlyNamedCandidates
        : expertEnabled
          ? uniqueRanked.slice(0, auctionCandidateLimit)
          : ranked;
    const shadowCandidateLimit = expertShadowEnabled
      ? adaptiveInviteCount({
          enabled: true,
          candidates: Array.from(
            new Map(
              learnedRanked.map((candidate) => [candidate.agent_id, candidate]),
            ).values(),
          ),
          profiles: exactProfiles,
          minTasks: minExpertTasks,
        })
      : undefined;

    // Shortlisted auctions always also invite the Arbor-owned floor agents, so
    // every node has a guaranteed plausible bidder on the FIRST auction (not
    // only the open-retry). searchAgents filters by min_reputation 0.3, which
    // excludes the 0.05-rep floors, so they must be appended explicitly. On a
    // force_open / fallback-open round, invited is undefined and the whole
    // roster (floors included) bids anyway. In direct mode the invited list is
    // the single assignee — an audit trail; solicitBids never runs on it.
    const invited = isDirect
      ? [routeMode.direct_agent_id as string]
      : openFallback
        ? undefined
        : Array.from(
            new Set([
              ...auctionCandidates.map((c) => c.agent_id),
              ...ARBOR_FLOOR_AGENT_IDS,
            ]),
          );
    const floorIds = new Set<string>(ARBOR_FLOOR_AGENT_IDS);
    const nonFloorInviteCount = invited
      ? invited.filter((agentId) => !floorIds.has(agentId)).length
      : undefined;
    const floorInviteCount = invited
      ? invited.filter((agentId) => floorIds.has(agentId)).length
      : undefined;

    // 4. Stable per-node step index: position of this node_id in the
    //    ascending-sorted list of all node_ids in the DAG.
    const sortedNodeIds = nodes
      .map((n) => n.node_id)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const stepIndex = Math.max(0, sortedNodeIds.indexOf(args.node_id));

    const arborOrigin = (
      process.env.ARBOR_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
    )
      .trim()
      .replace(/\/$/, "");
    const workspaceContext =
      `\n\nArbor workspace scope (immutable): dag_id=${args.dag_id}, node_id=${args.node_id}. ` +
      "In-process MCP specialists receive trusted media_* and blackboard_* tools with this scope injected. " +
      (arborOrigin
        ? `Out-of-process A2A specialists may use their provisioned Arbor agent HMAC credential at ${arborOrigin}/api/v1/media and ${arborOrigin}/api/v1/blackboard; sign the exact request body and never return the credential or signed URL in output.`
        : "Out-of-process A2A specialists must use their provisioned Arbor agent HMAC credential with the configured Arbor media and blackboard endpoints; never return the credential or signed URL in output.");

    const childPrompt =
      node.description +
      (node.success_criteria
        ? `\n\nSuccess criteria: ${node.success_criteria}`
        : "") +
      `\n\nTask class: ${taskClass}` +
      workspaceContext +
      (sharedContext
        ? "\n\n---\nAgentic blackboard context (follow bb:// pointers; verify " +
          "low-confidence entries and address review critiques):\n" +
          sharedContext +
          "\n---"
        : "");

    // parent_task_id = dag.root_task_id: auctions.settle will later call
    // internal.planning.advanceOrSynthesize on this child, whose hive guard
    // (child.hive_node_id set) routes settlement to hiveOrchestrator.onNodeSettled
    // instead of the legacy step-planner path.
    const created: { child_task_id: Id<"tasks">; bid_window_closes_at: number } =
      await ctx.runMutation(internal.tasks._createChild, {
        parent_task_id: dag.root_task_id,
        step_index: stepIndex,
        prompt: childPrompt,
        max_budget: budget,
      });
    const childTaskId = created.child_task_id;

    await ctx.runMutation(internal.hiveData._patchTaskHiveFields, {
      task_id: childTaskId,
      hive_dag_id: args.dag_id,
      hive_node_id: args.node_id,
      invited_agent_ids: invited,
      success_criteria: node.success_criteria,
      // Marks this child as a best-of-N candidate so it settles into the
      // candidate archive + barrier (hiveCandidates), not directly onto the node.
      hive_candidate_index: isFanout ? candidateIndex : undefined,
    });

    // 5. Mark the node executing and link it to its child task. Under best-of-N
    //    the node is already "executing" (the primary claimed it) and its
    //    task_id is set to the promoted winner at barrier time, so no candidate
    //    call touches node status/task_id here.
    if (!isFanout) {
      await ctx.runMutation(internal.hiveData._patchNode, {
        dag_id: args.dag_id,
        node_id: args.node_id,
        status: "executing",
        task_id: childTaskId,
      });
    }

    // 6. Lifecycle breadcrumb on the root task.
    await ctx.runMutation(internal.lifecycle.log, {
      task_id: dag.root_task_id,
      event_type: "hive_node_routed",
      payload: {
        node_id: args.node_id,
        child_task_id: childTaskId,
        invited: invited ?? "open",
        candidate_count: candidates.length,
        // Flywheel training data (W3): profile-blended scores per candidate.
        routing_scores: ranked.map((candidate) => {
          const profile = profilesByAgent.get(candidate.agent_id);
          return {
            agent_id: candidate.agent_id,
            similarity: candidate.similarity,
            rank_score: candidate.rank_score,
            routing_score: candidate.routing_score,
            prelearned_routing_score: prelearnedScores.get(candidate.agent_id),
            learned_score: learnedByAgent.get(candidate.agent_id)?.learned_score,
            availability_score: candidate.availability_score,
            profile: profile
              ? {
                  source_class: profile.task_class,
                  exact_class: profile.task_class === taskClass,
                  tasks: profile.tasks,
                  successful_tasks: profile.successful_tasks,
                  success_trials: profile.success_trials,
                  success_rate: profile.success_rate,
                  avg_quality: profile.avg_quality,
                  uncertainty: profile.uncertainty,
                }
              : undefined,
          };
        }),
        task_class: taskClass,
        budget,
        dag_budget: dag.max_budget,
        dag_spent: spent,
        allocator: "seqroute-heuristic-v1",
        // Semantic-grounding audit for this shortlist. `gated` records whether it
        // actually changed routing; when false this row is shadow evidence only.
        capability_integrity: {
          verdict: capabilityIntegrity.verdict,
          best: capabilityIntegrity.best,
          floor: capabilityIntegrity.floor_used,
          runner_up_gap: capabilityIntegrity.runner_up_gap,
          top_order_arbitrary: capabilityIntegrity.top_order_arbitrary,
          gated: integrityGated,
        },
        force_open: Boolean(args.force_open),
        candidate_index: isFanout ? candidateIndex : undefined,
        route_mode: routeMode.mode,
        route_mode_reason: routeMode.reason,
        routing_policy: expertEnabled
          ? "learned-expert-confidence-v1"
          : "legacy-auction-v1",
        delegation_head: expertEnabled || expertShadowEnabled
          ? BUNDLED_DELEGATION_HEAD
          : undefined,
        independent_ready_count: routeMode.independent_ready_count,
        direct_agent_id: isDirect ? routeMode.direct_agent_id : undefined,
        direct_price: isDirect ? routeMode.direct_price : undefined,
        expert_tasks: routeMode.expert_tasks,
        expert_success_lower_bound: routeMode.expert_success_lower_bound,
        expert_score_margin: routeMode.expert_score_margin,
        expert_capability_score: routeMode.expert_capability_score,
        requested_candidate_count: candidates.length,
        ranked_candidate_count: ranked.length,
        auction_candidate_limit: auctionCandidateLimit,
        non_floor_invite_count: nonFloorInviteCount,
        floor_invite_count: floorInviteCount,
        total_invite_count: invited?.length,
        pruned_candidate_count:
          invited && !isDirect
            ? Math.max(0, ranked.length - nonFloorInviteCount!)
            : undefined,
        open_fallback: openFallback,
        expert_shadow: expertShadow
          ? {
              mode: expertShadow.mode,
              reason: expertShadow.reason,
              direct_agent_id: expertShadow.direct_agent_id,
              success_lower_bound: expertShadow.expert_success_lower_bound,
              score_margin: expertShadow.expert_score_margin,
              capability_score: expertShadow.expert_capability_score,
              auction_candidate_limit: shadowCandidateLimit,
            }
          : undefined,
      },
    });

    if (isDirect) {
      // 7a. Orchestrator-first direct assignment: one synthetic bid for the
      //     chosen agent, then resolve immediately — no bid window, no
      //     solicit fan-out, no plausibility screen. resolve's degenerate
      //     single-bid Vickrey prices at this bid, locks escrow, and hands off
      //     to the UNCHANGED execute -> judge -> settle pipeline. If the agent
      //     fails, execute finds no other bids and the task fails into the W6
      //     floor backstop via onNodeSettled, same as a failed auction.
      await ctx.runMutation(internal.bids._insert, {
        task_id: childTaskId,
        agent_id: routeMode.direct_agent_id as string,
        bid_price: routeMode.direct_price ?? budget,
        capability_claim:
          routeMode.reason === "expert_match"
            ? "Direct assignment by Arbor's confidence-gated delegation expert: exact-class evidence, conservative success bound, semantic-fit floor, and a clear rank margin (no bid round)."
            : "Direct assignment by the orchestrator-first router: top profile-ranked ready candidate on a thin market (no bid round).",
        estimated_seconds: 120,
        score: 1,
        plan_source: "direct_assignment",
      });
      await ctx.scheduler.runAfter(0, internal.auctions.resolve, {
        task_id: childTaskId,
      });
    } else {
      // 7b. Start the EXISTING Vickrey auction on the child task.
      await ctx.scheduler.runAfter(0, internal.auctions.solicitBids, {
        task_id: childTaskId,
      });
      await ctx.scheduler.runAfter(
        BID_WINDOW_SECONDS * 1000,
        internal.auctions.resolve,
        { task_id: childTaskId },
      );
    }
    // Settlement sweep backstop on both paths. The primary settlement trigger
    // is auctions.settle -> advanceOrSynthesize; this delayed call only
    // catches wedged nodes, and onNodeSettled is idempotent on settled ones.
    await ctx.scheduler.runAfter(
      BID_WINDOW_SECONDS * 1000 + 5000,
      internal.hiveOrchestrator.onNodeSettled,
      { task_id: childTaskId },
    );

    return null;
  },
});
