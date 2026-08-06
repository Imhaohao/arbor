import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Connector roundtable provisioning. The external-agent connector
// (scripts/hive-connector.ts) drives real third-party agents through the
// signed public blackboard API (scratchpadActions.writeSigned). Everything
// here is internal: it is invoked by the operator via `npx convex run`, never
// from the public surface.
//
// A roundtable session is a real tasks row + hive_dags row so the existing
// canvases (hiveNetwork.network, replay) render it, plus one hive_node per
// (phase, agent) so the network canvas draws phase-to-phase handoff edges
// from the agents' own result/decision entries. Nodes are structural: no
// auction, no orchestrator advance ever touches them (crons only run
// settlement accrual and the golden audit lane).

const PHASES = ["propose", "negotiate", "decide"] as const;

export const _createDiscussionSession = internalMutation({
  args: {
    goal: v.string(),
    posted_by: v.string(),
    max_budget: v.number(),
    agent_ids: v.array(v.string()),
  },
  returns: v.object({ task_id: v.id("tasks"), dag_id: v.id("hive_dags") }),
  handler: async (ctx, args) => {
    if (args.agent_ids.length === 0) {
      throw new Error("agent_ids must be non-empty");
    }
    const now = Date.now();
    const task_id = await ctx.db.insert("tasks", {
      posted_by: args.posted_by,
      task_type: "hive-roundtable",
      prompt: args.goal,
      max_budget: args.max_budget,
      status: "executing",
      bid_window_seconds: 0,
      bid_window_closes_at: now,
      workflow_mode: "hive",
    });
    const dag_id = await ctx.db.insert("hive_dags", {
      root_task_id: task_id,
      goal: args.goal,
      status: "running",
      planner_model: "connector-roundtable",
      max_budget: args.max_budget,
      created_at: now,
      updated_at: now,
    });
    for (let p = 0; p < PHASES.length; p += 1) {
      for (const agent_id of args.agent_ids) {
        await ctx.db.insert("hive_nodes", {
          dag_id,
          node_id: `${PHASES[p]}:${agent_id}`,
          description: `${PHASES[p]} round for ${agent_id} in the connector roundtable`,
          depends_on:
            p === 0
              ? []
              : args.agent_ids.map((a) => `${PHASES[p - 1]}:${a}`),
          status: "executing",
          assigned_agent_id: agent_id,
          updated_at: now,
        });
      }
    }
    return { task_id, dag_id };
  },
});

// agents._ensureAgent deliberately omits agent_role; the blackboard write
// gate (scratchpadActions.writeSigned) only honors critique entries from
// agents whose row says "reviewer". This lets the operator promote one
// roundtable member to reviewer so real critiques are representable.
export const _setAgentRole = internalMutation({
  args: { agent_id: v.string(), agent_role: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agent_id", args.agent_id))
      .first();
    if (!agent) throw new Error(`agent ${args.agent_id} not found`);
    await ctx.db.patch(agent._id, { agent_role: args.agent_role });
    return null;
  },
});

// Bulk provisioning for census-scale roundtables. One row per agent plus one
// HMAC key each; batched by the caller because a Convex mutation is a
// transaction with a bounded write budget. Idempotent on the agent row, and
// key rotation is deliberate: re-provisioning mints a fresh secret rather
// than trusting whatever the caller last stored.
export const _bulkProvision = internalMutation({
  args: {
    agents: v.array(
      v.object({
        agent_id: v.string(),
        display_name: v.string(),
        sponsor: v.string(),
        capabilities: v.array(v.string()),
        system_prompt: v.string(),
        cost_per_task_estimate: v.number(),
        starting_reputation: v.number(),
        secret_b64: v.string(),
      }),
    ),
  },
  returns: v.object({ created: v.number(), keyed: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let keyed = 0;
    for (const a of args.agents) {
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", a.agent_id))
        .first();
      if (!existing) {
        await ctx.db.insert("agents", {
          agent_id: a.agent_id,
          display_name: a.display_name,
          sponsor: a.sponsor,
          capabilities: a.capabilities,
          system_prompt: a.system_prompt,
          cost_per_task_estimate: a.cost_per_task_estimate,
          reputation_score: a.starting_reputation,
          total_tasks_completed: 0,
          total_disputes_lost: 0,
        });
        created += 1;
      }
      const priorKeys = await ctx.db
        .query("agent_keys")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", a.agent_id))
        .collect();
      const active = priorKeys.filter((k) => k.revoked_at === undefined);
      if (active.length === 0) {
        await ctx.db.insert("agent_keys", {
          agent_id: a.agent_id,
          secret_b64: a.secret_b64,
          created_at: now,
        });
        keyed += 1;
      }
    }
    return { created, keyed };
  },
});

export const _completeSession = internalMutation({
  args: { dag_id: v.id("hive_dags") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const dag = await ctx.db.get(args.dag_id);
    if (!dag) throw new Error("unknown dag_id");
    const now = Date.now();
    const nodes = await ctx.db
      .query("hive_nodes")
      .withIndex("by_dag", (q) => q.eq("dag_id", args.dag_id))
      .take(200);
    for (const node of nodes) {
      await ctx.db.patch(node._id, { status: "complete", updated_at: now });
    }
    await ctx.db.patch(args.dag_id, { status: "complete", updated_at: now });
    await ctx.db.patch(dag.root_task_id, { status: "complete" });
    return null;
  },
});
