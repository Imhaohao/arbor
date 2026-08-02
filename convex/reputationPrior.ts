import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  NEUTRAL_REPUTATION,
  PRIOR_HALF_BAND,
  assignReputationPriors,
  encoderContribution,
  type ReputationPriorInput,
} from "../lib/hive/reputation-prior-core";
import {
  ENCODER_HEAD_MODEL,
  buildAgentDescriptor,
} from "../lib/hive/encoder-head-core";

/**
 * Assigns liveness priors to `agents.reputation_score` so the 0.30-weighted
 * reputation dimension of rankAgents4D stops being a constant.
 *
 * Run it with:  npx convex run reputationPrior:applyAll '{"dry_run":true}'
 *
 * Internal-only on purpose. This rewrites reputation for the whole roster; it
 * is a maintenance pass driven from the CLI (which authenticates with the
 * deploy key), not something any client should be able to trigger.
 *
 * See lib/hive/reputation-prior-core.ts for why the ordering is lexicographic
 * (measured rate first, encoder only inside ties) and why priors are confined
 * to a band strictly inside what earned reputation can reach.
 */

/** How many agents one read/write batch covers. Keeps each function call under
 * the 32k document-read limit even for agents with long probe histories. */
const BATCH = 100;

const vectorValidator = v.object({
  agent_id: v.string(),
  vector: v.array(v.float64()),
  descriptor: v.string(),
  logit: v.number(),
});

/**
 * Upsert offline-computed encoder vectors. Rejects wrong-width or non-finite
 * vectors outright: a silently truncated vector would still produce a plausible
 * logit and quietly corrupt every ranking downstream.
 */
export const _upsertVectors = internalMutation({
  args: { rows: v.array(vectorValidator) },
  handler: async (ctx, args) => {
    const width = ENCODER_HEAD_MODEL.coef.length;
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      if (row.vector.length !== width) {
        throw new Error(
          `${row.agent_id}: expected a ${width}-dim vector, got ${row.vector.length}`,
        );
      }
      if (!row.vector.every(Number.isFinite) || !Number.isFinite(row.logit)) {
        throw new Error(`${row.agent_id}: vector or logit is not finite`);
      }
      const doc = {
        agent_id: row.agent_id,
        vector: row.vector,
        descriptor: row.descriptor,
        logit: row.logit,
        encoder_model: ENCODER_HEAD_MODEL.encoder.model,
        model_version: ENCODER_HEAD_MODEL.version,
        updated_at: Date.now(),
      };
      const existing = await ctx.db
        .query("agent_encoder_vectors")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", row.agent_id))
        .first();
      if (existing) {
        await ctx.db.replace(existing._id, doc);
        updated += 1;
      } else {
        await ctx.db.insert("agent_encoder_vectors", doc);
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

/**
 * Descriptor text for the whole roster, built here rather than in the offline
 * job so buildAgentDescriptor() has exactly one implementation. The serialized
 * form is a model contract — a second copy in Python would drift and silently
 * invalidate the trained coefficients.
 *
 * Capability fields come from `discovered_specialists` only, matching how the
 * head was trained. Agents without a discovery row get the thin descriptor they
 * got at training time (id words + task class + transport) rather than a richer
 * one assembled from `agents`, which would be off-distribution.
 */
export const _descriptorFields = internalQuery({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    const out: Array<{ agent_id: string; descriptor: string }> = [];
    for (const agent of agents) {
      const disc = await ctx.db
        .query("discovered_specialists")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent.agent_id))
        .first();
      const readiness = await ctx.db
        .query("agent_readiness")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent.agent_id))
        .first();
      out.push({
        agent_id: agent.agent_id,
        descriptor: buildAgentDescriptor({
          agent_id: agent.agent_id,
          capabilities: disc?.capabilities,
          one_liner: disc?.one_liner,
          rationale: disc?.rationale,
          task_class: readiness?.task_class,
          transport: readiness?.transport,
        }),
      });
    }
    return out.sort((a, b) => (a.agent_id < b.agent_id ? -1 : 1));
  },
});

/** Every agent_id on the roster, in a stable order. */
export const _allAgentIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    return agents.map((a) => a.agent_id).sort();
  },
});

/**
 * Evidence for one batch of agents: settled-task count, current score, and the
 * two measured histories the liveness heads consume.
 *
 * `demo_lane` probes are excluded, matching the training corpus — they are
 * synthesized bids for agents with no key, so counting them would credit an
 * agent for a response it never made.
 */
export const _evidenceBatch = internalQuery({
  args: { agent_ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out: ReputationPriorInput[] = [];
    for (const agent_id of args.agent_ids) {
      const agent = await ctx.db
        .query("agents")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .first();
      if (!agent) continue;

      const settled = await ctx.db
        .query("reputation_dimensions")
        .withIndex("by_agent", (q) => q.eq("agent_id", agent_id))
        .collect();

      const smokeRows = await ctx.db
        .query("agent_smoke_results")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .collect();

      const probeRows = await ctx.db
        .query("bid_probes")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .collect();
      const realProbes = probeRows.filter((p) => p.probe_status !== "demo_lane");

      const stored = await ctx.db
        .query("agent_encoder_vectors")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .first();

      out.push({
        agent_id,
        settled_tasks: settled.length,
        current_reputation: agent.reputation_score,
        evidence: {
          smoke: {
            runs: smokeRows.length,
            passes: smokeRows.filter((s) => s.probe_status === "pass").length,
          },
          probes: {
            attempts: realProbes.length,
            passes: realProbes.filter((p) => p.probe_status === "pass").length,
          },
        },
        encoder_vector: stored?.vector,
      });
    }
    return out;
  },
});

/**
 * Write one batch of priors. Refuses anything outside the prior band — the band
 * is the guarantee that a prediction cannot impersonate a track record, so a
 * caller that computed something outside it has a bug, and clamping silently
 * would hide it.
 */
export const _writeBatch = internalMutation({
  args: {
    updates: v.array(
      v.object({
        agent_id: v.string(),
        reputation: v.number(),
        source: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const lo = NEUTRAL_REPUTATION - PRIOR_HALF_BAND;
    const hi = NEUTRAL_REPUTATION + PRIOR_HALF_BAND;
    const now = Date.now();
    let written = 0;
    for (const u of args.updates) {
      if (!Number.isFinite(u.reputation) || u.reputation < lo || u.reputation > hi) {
        throw new Error(
          `${u.agent_id}: prior ${u.reputation} outside the [${lo}, ${hi}] band`,
        );
      }
      const agent = await ctx.db
        .query("agents")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", u.agent_id))
        .first();
      if (!agent) continue;
      await ctx.db.patch(agent._id, {
        reputation_score: u.reputation,
        reputation_source: u.source,
        reputation_prior_updated_at: now,
      });
      written += 1;
    }
    return { written };
  },
});

/** Mirror the new scores into the hive registry rows that carry their own copy,
 * so vector search and the 4D ranker agree on what an agent is worth. */
export const _syncHiveEmbeddings = internalMutation({
  args: {
    updates: v.array(
      v.object({ agent_id: v.string(), reputation: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    let synced = 0;
    for (const u of args.updates) {
      const row = await ctx.db
        .query("hive_agent_embeddings")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", u.agent_id))
        .first();
      if (!row) continue;
      await ctx.db.patch(row._id, { reputation_score: u.reputation });
      synced += 1;
    }
    return { synced };
  },
});

/**
 * Full pass over the roster. Pass `{"dry_run": true}` to get the distribution
 * and the encoder's measured contribution without writing anything.
 */
export const applyAll = internalAction({
  args: { dry_run: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const agentIds: string[] = await ctx.runQuery(
      internal.reputationPrior._allAgentIds,
      {},
    );

    const inputs: ReputationPriorInput[] = [];
    for (let i = 0; i < agentIds.length; i += BATCH) {
      const batch = await ctx.runQuery(internal.reputationPrior._evidenceBatch, {
        agent_ids: agentIds.slice(i, i + BATCH),
      });
      inputs.push(...batch);
    }

    // Ranking is global by construction: every unsettled agent is placed
    // against every other one, so the whole roster must be in hand before any
    // score is decided. This is why the pass is an action over batched reads
    // rather than a per-agent mutation.
    const results = assignReputationPriors(inputs);
    const contribution = encoderContribution(results);

    const changed = results.filter(
      (r) => r.source !== "earned" && Math.abs(r.delta) > 1e-9,
    );

    if (!args.dry_run) {
      for (let i = 0; i < changed.length; i += BATCH) {
        const slice = changed.slice(i, i + BATCH);
        await ctx.runMutation(internal.reputationPrior._writeBatch, {
          updates: slice.map((r) => ({
            agent_id: r.agent_id,
            reputation: r.reputation,
            source: r.source,
          })),
        });
        await ctx.runMutation(internal.reputationPrior._syncHiveEmbeddings, {
          updates: slice.map((r) => ({
            agent_id: r.agent_id,
            reputation: r.reputation,
          })),
        });
      }
    }

    const bySource: Record<string, number> = {};
    for (const r of results) bySource[r.source] = (bySource[r.source] ?? 0) + 1;

    const priors = results.filter((r) => r.source !== "earned");
    const values = priors.map((r) => r.reputation).sort((a, b) => a - b);
    const mean = values.reduce((s, v2) => s + v2, 0) / (values.length || 1);
    const sd = Math.sqrt(
      values.reduce((s, v2) => s + (v2 - mean) ** 2, 0) / (values.length || 1),
    );

    return {
      dry_run: args.dry_run === true,
      agents: results.length,
      written: args.dry_run ? 0 : changed.length,
      by_source: bySource,
      encoder: contribution,
      distribution: {
        min: values[0],
        p25: values[Math.floor(values.length * 0.25)],
        median: values[Math.floor(values.length * 0.5)],
        p75: values[Math.floor(values.length * 0.75)],
        max: values[values.length - 1],
        mean: Number(mean.toFixed(6)),
        sd: Number(sd.toFixed(6)),
      },
    };
  },
});
