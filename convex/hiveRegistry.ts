"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  cosineSimilarity,
  embedText,
  embeddingBackend,
} from "../lib/hive/embeddings";
import {
  buildCapabilityText,
  hiveAgentTransport,
  type HiveAgentCandidate,
} from "../lib/hive/registry-core";
import {
  availabilityWithFreshness,
  routingIntegrityEnabled,
} from "../lib/hive/routing-integrity-core";
import { smoothedRate } from "../lib/hive/probe-success-core";
import { discoverTools } from "../lib/mcp-outbound";
import { openrouterEnabled } from "../lib/openai";
import { isCuratedOpenRouterSpecialist } from "../lib/specialists/openrouter-roster";
import {
  rankAgents4D,
  type ReputationDimensions,
} from "../lib/hive/rank-core";

const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const DEFAULT_REPUTATION = 0.5;
const OPENAI_EMBEDDING_MODEL = "openai:text-embedding-3-small";
const LOCAL_EMBEDDING_MODEL = "local-hash";

// W4 (Agentverse-style multi-dimensional ranked discovery, arXiv:2606.20570):
// availability mapping from the agent's readiness stage. `ready` gets full
// availability; `mock_only` is usable but discounted; every other stage
// (needs_key/endpoint_down/protocol_mismatch/needs_owner_action) is
// effectively unavailable; unknown/no-smoke-evidence agents get a neutral
// mid-point rather than being penalized for lacking evidence.
const AVAILABILITY_BY_READINESS: Record<string, number> = {
  ready: 1.0,
  mock_only: 0.3,
  needs_key: 0.1,
  endpoint_down: 0.1,
  protocol_mismatch: 0.1,
  needs_owner_action: 0.1,
};
const AVAILABILITY_UNKNOWN = 0.5;

function availabilityForReadiness(status: string | undefined): number {
  if (!status) return AVAILABILITY_UNKNOWN;
  return AVAILABILITY_BY_READINESS[status] ?? AVAILABILITY_UNKNOWN;
}

/**
 * Additive 4D fields joined onto the existing HiveAgentCandidate shape when
 * rank_mode: "4d" is requested. Existing callers that omit rank_mode never
 * see these fields (searchAgents returns byte-for-byte the same shape).
 */
export interface HiveAgentCandidate4D extends HiveAgentCandidate {
  rank_score?: number;
  capability_score?: number;
  reputation_dims?: ReputationDimensions;
  reputation_rank_score?: number;
  price_score?: number;
  availability_score?: number;
  readiness_status?: string;
}

function embeddingModelName(): string {
  return embeddingBackend() === "openai"
    ? OPENAI_EMBEDDING_MODEL
    : LOCAL_EMBEDDING_MODEL;
}

function validateAgentId(agent_id: string): void {
  if (!AGENT_ID_RE.test(agent_id)) {
    throw new Error(
      `Invalid agent_id "${agent_id}" - must be kebab-case, 3-40 chars`,
    );
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].map((value) => value.trim()).sort();
  const normalizedRight = [...right].map((value) => value.trim()).sort();
  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index],
  );
}

function sameRegistration(
  existing: {
    display_name: string;
    sponsor: string;
    capabilities: string[];
    one_liner: string;
    system_prompt: string;
    cost_baseline: number;
    tier?: string;
    mcp_endpoint?: string;
    a2a_endpoint?: string;
    openrouter_model_id?: string;
  },
  incoming: {
    display_name: string;
    sponsor: string;
    capabilities: string[];
    one_liner: string;
    system_prompt: string;
    cost_baseline: number;
    tier?: string;
    mcp_endpoint?: string;
    a2a_endpoint?: string;
    openrouter_model_id?: string;
  },
): boolean {
  return (
    existing.display_name === incoming.display_name &&
    existing.sponsor === incoming.sponsor &&
    sameStrings(existing.capabilities, incoming.capabilities) &&
    existing.one_liner === incoming.one_liner &&
    existing.system_prompt === incoming.system_prompt &&
    existing.cost_baseline === incoming.cost_baseline &&
    existing.tier === incoming.tier &&
    existing.mcp_endpoint === incoming.mcp_endpoint &&
    existing.a2a_endpoint === incoming.a2a_endpoint &&
    existing.openrouter_model_id === incoming.openrouter_model_id
  );
}

function clampTopK(value: number | undefined): number {
  if (!Number.isFinite(value ?? 8)) return 8;
  return Math.min(32, Math.max(1, Math.trunc(value ?? 8)));
}

function toolSchemasForText(
  tools: Array<{ name?: string; description?: string }> | undefined,
): Array<{ name?: string; description?: string }> | undefined {
  return tools?.map((tool) => ({
    name: typeof tool.name === "string" ? tool.name : undefined,
    description:
      typeof tool.description === "string" ? tool.description : undefined,
  }));
}

function envValue(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const registerArgs = {
  agent_id: v.string(),
  display_name: v.string(),
  sponsor: v.string(),
  owner_id: v.optional(v.string()),
  capabilities: v.array(v.string()),
  one_liner: v.string(),
  system_prompt: v.string(),
  cost_baseline: v.number(),
  starting_reputation: v.optional(v.number()),
  tier: v.optional(
    v.union(
      v.literal("real"),
      v.literal("mcp-forwarding"),
      v.literal("a2a"),
      v.literal("a2a-bridge"),
      v.literal("openrouter"),
      v.literal("mock"),
      v.literal("disabled"),
    ),
  ),
  openrouter_model_id: v.optional(v.string()),
  openrouter_api_key_env: v.optional(v.string()),
  mcp_endpoint: v.optional(v.string()),
  mcp_api_key_env: v.optional(v.string()),
  a2a_endpoint: v.optional(v.string()),
  a2a_agent_card_url: v.optional(v.string()),
  a2a_api_key_env: v.optional(v.string()),
  homepage_url: v.optional(v.string()),
  fetch_tools: v.optional(v.boolean()),
};

export const registerAgent = action({
  args: registerArgs,
  handler: async (
    ctx,
    args,
  ): Promise<{
    agent_id: string;
    registered: true;
    eval_status: "pending" | "passed" | "failed";
    embedding_model: string;
  }> => {
    validateAgentId(args.agent_id);
    if (args.capabilities.length === 0) {
      throw new Error("capabilities must include at least one entry");
    }
    if (args.cost_baseline <= 0) {
      throw new Error("cost_baseline must be greater than 0");
    }

    const starting_reputation =
      args.starting_reputation ?? DEFAULT_REPUTATION;
    const trustedCuratedOpenRouter =
      args.tier === "openrouter" && isCuratedOpenRouterSpecialist(args);
    const existing: Doc<"discovered_specialists"> | null = await ctx.runQuery(
      internal.discoveredSpecialists._getByAgentId,
      { agent_id: args.agent_id },
    );
    const preserveEval =
      existing !== null && sameRegistration(existing, args);
    const evalStatus = trustedCuratedOpenRouter
      ? "passed" as const
      : preserveEval && existing.eval_status
        ? existing.eval_status
        : "pending" as const;
    const upsertArgs = {
      agent_id: args.agent_id,
      display_name: args.display_name,
      sponsor: args.sponsor,
      capabilities: args.capabilities,
      system_prompt: args.system_prompt,
      cost_baseline: args.cost_baseline,
      starting_reputation,
      one_liner: args.one_liner,
      discovered_for: "hive registry",
      discovery_source: "registry",
    } as const;
    const upsertOptionalArgs: {
      mcp_endpoint?: string;
      mcp_api_key_env?: string;
      homepage_url?: string;
      a2a_endpoint?: string;
      a2a_agent_card_url?: string;
      a2a_api_key_env?: string;
      tier?: NonNullable<typeof args.tier>;
      openrouter_model_id?: string;
      openrouter_api_key_env?: string;
    } = {};
    if (args.mcp_endpoint) upsertOptionalArgs.mcp_endpoint = args.mcp_endpoint;
    if (args.mcp_api_key_env) {
      upsertOptionalArgs.mcp_api_key_env = args.mcp_api_key_env;
    }
    if (args.homepage_url) upsertOptionalArgs.homepage_url = args.homepage_url;
    if (args.a2a_endpoint) upsertOptionalArgs.a2a_endpoint = args.a2a_endpoint;
    if (args.a2a_agent_card_url) {
      upsertOptionalArgs.a2a_agent_card_url = args.a2a_agent_card_url;
    }
    if (args.a2a_api_key_env) {
      upsertOptionalArgs.a2a_api_key_env = args.a2a_api_key_env;
    }
    if (args.tier) upsertOptionalArgs.tier = args.tier;
    if (args.openrouter_model_id) {
      upsertOptionalArgs.openrouter_model_id = args.openrouter_model_id;
    }
    if (args.openrouter_api_key_env) {
      upsertOptionalArgs.openrouter_api_key_env = args.openrouter_api_key_env;
    }
    await ctx.runMutation(api.discoveredSpecialists.upsert, {
      ...upsertArgs,
      ...upsertOptionalArgs,
    });

    await ctx.runMutation(internal.hiveRegistryData._patchRegistrationMetadata, {
      agent_id: args.agent_id,
      owner_id: args.owner_id ?? args.sponsor,
      eval_status: evalStatus,
    });

    let mcpToolSchemas: Array<{ name?: string; description?: string }> | undefined;
    if (args.mcp_endpoint && args.fetch_tools !== false) {
      try {
        const tools = await discoverTools(
          args.mcp_endpoint,
          envValue(args.mcp_api_key_env),
        );
        mcpToolSchemas = tools;
        await ctx.runMutation(
          internal.hiveRegistryData._patchRegistrationMetadata,
          {
            agent_id: args.agent_id,
            mcp_tool_schemas: tools,
          },
        );
      } catch (err) {
        console.warn(
          `[hive-registry] tools/list failed agent=${args.agent_id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const capability_text = buildCapabilityText({
      display_name: args.display_name,
      sponsor: args.sponsor,
      one_liner: args.one_liner,
      capabilities: args.capabilities,
      mcp_tool_schemas: toolSchemasForText(mcpToolSchemas),
    });
    const embedding = await embedText(capability_text);
    const embedding_model = embeddingModelName();

    await ctx.runMutation(internal.hiveRegistryData._upsertEmbedding, {
      agent_id: args.agent_id,
      capability_text,
      embedding,
      embedding_model,
      eval_passed: evalStatus === "passed",
      cost_baseline: args.cost_baseline,
      reputation_score: starting_reputation,
      updated_at: Date.now(),
    });

    if (evalStatus === "pending") {
      await ctx.scheduler.runAfter(0, internal.hiveEvalGate.runEvalGate, {
        agent_id: args.agent_id,
      });
    }

    return {
      agent_id: args.agent_id,
      registered: true,
      eval_status: evalStatus,
      embedding_model,
    };
  },
});

export const searchAgents = action({
  args: {
    query: v.string(),
    top_k: v.optional(v.number()),
    min_reputation: v.optional(v.number()),
    max_cost: v.optional(v.number()),
    include_unevaluated: v.optional(v.boolean()),
    model_gateway: v.optional(v.string()),
    pinned_agent_ids: v.optional(v.array(v.string())),
    // W4: when "4d", re-rank the shortlist by capability x reputation x
    // price x availability instead of raw similarity order. Default
    // (omitted) behavior is byte-for-byte unchanged.
    rank_mode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<HiveAgentCandidate4D[]> => {
    const query = args.query.trim();
    if (!query) throw new Error("query must be non-empty");

    const topK = clampTopK(args.top_k);
    const vector = await embedText(query);
    const limit = Math.min(64, topK * 4);
    const hits = args.include_unevaluated
      ? await ctx.vectorSearch("hive_agent_embeddings", "by_embedding", {
          vector,
          limit,
        })
      : await ctx.vectorSearch("hive_agent_embeddings", "by_embedding", {
          vector,
          limit,
          filter: (q) => q.eq("eval_passed", true),
        });

    const pinnedAgentIds = Array.from(
      new Set((args.pinned_agent_ids ?? []).slice(0, 8)),
    );
    const [embeddingRows, pinnedRows] = await Promise.all([
      ctx.runQuery(internal.hiveRegistryData._getEmbeddingsByIds, {
        ids: hits.map((hit) => hit._id),
      }),
      ctx.runQuery(internal.hiveRegistryData._getEmbeddingsByAgentIds, {
        agent_ids: pinnedAgentIds,
      }),
    ]);
    const rowsById = new Map(
      [...embeddingRows, ...pinnedRows].map((row) => [String(row._id), row]),
    );
    const minReputation = args.min_reputation ?? 0.3;
    const maxCost = args.max_cost ?? Number.POSITIVE_INFINITY;
    const scoredRows = hits
      .map((hit) => ({
        row: rowsById.get(String(hit._id)),
        similarity: hit._score,
      }));
    const hitAgentIds = new Set(
      scoredRows.flatMap((hit) => hit.row ? [hit.row.agent_id] : []),
    );
    for (const row of pinnedRows) {
      if (hitAgentIds.has(row.agent_id)) continue;
      scoredRows.push({
        row,
        similarity: cosineSimilarity(vector, row.embedding),
      });
    }
    const filtered = scoredRows
      .filter(
        (hit): hit is {
          row: NonNullable<typeof hit.row>;
          similarity: number;
        } => {
          const row = hit.row;
          return (
            row !== undefined &&
            (args.include_unevaluated || row.eval_passed === true) &&
            row.reputation_score >= minReputation &&
            row.cost_baseline <= maxCost
          );
        },
      );

    const hydrated = await ctx.runQuery(
      internal.hiveRegistryData._hydrateCandidates,
      { agent_ids: filtered.map((hit) => hit.row.agent_id) },
    );
    const hydratedById = new Map(
      hydrated.map((row) => [row.specialist.agent_id, row]),
    );

    const rank4d = args.rank_mode === "4d";
    const candidates: HiveAgentCandidate4D[] = [];
    for (const hit of filtered) {
      const joined = hydratedById.get(hit.row.agent_id);
      if (!joined) continue;
      const specialist = joined.specialist;
      if (
        specialist.tier === "openrouter" &&
        !openrouterEnabled(args.model_gateway)
      ) {
        continue;
      }
      const candidate: HiveAgentCandidate4D = {
        agent_id: specialist.agent_id,
        display_name: specialist.display_name,
        sponsor: specialist.sponsor,
        one_liner: specialist.one_liner,
        capabilities: specialist.capabilities,
        cost_baseline: specialist.cost_baseline,
        reputation_score:
          joined.agent?.reputation_score ?? hit.row.reputation_score,
        similarity: hit.similarity,
        eval_status: specialist.eval_status ?? "pending",
        transport: hiveAgentTransport(specialist),
      };
      if (specialist.mcp_endpoint) {
        candidate.mcp_endpoint = specialist.mcp_endpoint;
      }
      if (specialist.a2a_endpoint) {
        candidate.a2a_endpoint = specialist.a2a_endpoint;
      }
      candidates.push(candidate);
      // Non-4D mode keeps its original early-exit at topK similarity hits.
      // 4D mode must first rank the full filtered set, so it truncates below
      // instead of here.
      if (!rank4d && candidates.length >= topK) break;
    }

    if (!rank4d || candidates.length === 0) {
      return rank4d ? candidates.slice(0, topK) : candidates;
    }

    // W4 (Agentverse-style multi-dimensional ranked discovery): join
    // reputation dimensions + readiness (availability) + price, then re-rank
    // by the 4D blend. Best-effort — a lookup hiccup here must not break
    // discovery, so fall back to the similarity-ordered candidates.
    try {
      const useMeasuredAvailability = routingIntegrityEnabled();
      const [dims, readinessRows, smokeCounts] = await Promise.all([
        ctx.runQuery(internal.reputationDimensions._dimensionsForAgents, {
          agent_ids: candidates.map((c) => c.agent_id),
        }),
        ctx.runQuery(api.agentReadiness.list, {}),
        useMeasuredAvailability
          ? ctx.runQuery(internal.agentSmokeStats._smokeCountsForAgents, {
              agent_ids: candidates.map((c) => c.agent_id),
            })
          : Promise.resolve([]),
      ]);
      interface SmokeCount {
        agent_id: string;
        runs: number;
        passes: number;
        latest_at: number;
      }
      const smokeByAgent = new Map<string, SmokeCount>(
        (smokeCounts as SmokeCount[]).map((s) => [s.agent_id, s]),
      );
      const nowMs = Date.now();

      /**
       * Availability for one candidate.
       *
       * Default path (flag off): the 3-bucket readiness enum, byte-for-byte as
       * before.
       *
       * Measured path (ARBOR_ROUTING_INTEGRITY_ENABLED): the smoothed smoke pass
       * RATE, decayed toward "unknown" by the age of the observation. The enum
       * scored 0.8205 ranking AUC against real probe outcomes; this rate scored
       * 0.9344 on the same temporal holdout. Decay matters because the enum was
       * wrong for 60% of the A2A agents it called `ready` about 12h after the
       * smoke run. Agents with no smoke history fall back to the enum rather than
       * being penalised for lacking evidence.
       */
      const availabilityFor = (
        agent_id: string,
        readiness_status: string | undefined,
      ): number => {
        const enumScore = availabilityForReadiness(readiness_status);
        if (!useMeasuredAvailability) return enumScore;
        const smoke = smokeByAgent.get(agent_id);
        if (!smoke || smoke.runs === 0) return enumScore;
        const rate = smoothedRate(smoke.passes, smoke.runs);
        return availabilityWithFreshness(rate, smoke.latest_at, nowMs).score;
      };
      const dimsByAgent = new Map(dims.map((d) => [d.agent_id, d]));
      const readinessByAgent = new Map(
        (readinessRows as Array<{ agent_id: string; readiness_status?: string }>).map(
          (r) => [r.agent_id, r.readiness_status],
        ),
      );

      type Joined = {
        agent_id: string;
        similarity: number;
        reputation: ReturnType<typeof dimsByAgent.get> & object;
        price: number;
        availability: number;
        base: HiveAgentCandidate4D;
        readiness_status: string | undefined;
      };
      const joinedCandidates: Joined[] = candidates.map((c) => {
        const reputation = dimsByAgent.get(c.agent_id) ?? {
          agent_id: c.agent_id,
          reliability: 0.5,
          quality: 0.5,
          safety: 1.0,
          speed: 0.5,
        };
        const readiness_status = readinessByAgent.get(c.agent_id);
        return {
          agent_id: c.agent_id,
          similarity: c.similarity,
          reputation,
          price: c.cost_baseline,
          availability: availabilityFor(c.agent_id, readiness_status),
          base: c,
          readiness_status,
        };
      });

      const ranked = rankAgents4D(joinedCandidates);

      return ranked.slice(0, topK).map((r) => ({
        ...r.candidate.base,
        rank_score: r.rank_score,
        capability_score: r.capability_score,
        reputation_dims: dimsByAgent.get(r.candidate.agent_id),
        reputation_rank_score: r.reputation_score,
        price_score: r.price_score,
        availability_score: r.availability_score,
        readiness_status: r.candidate.readiness_status,
      }));
    } catch (err) {
      console.warn(
        `[hive-registry] 4D ranking failed; falling back to similarity order: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return candidates.slice(0, topK);
    }
  },
});

export const refreshEmbedding = internalAction({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const specialist = await ctx.runQuery(
      internal.discoveredSpecialists._getByAgentId,
      { agent_id: args.agent_id },
    );
    if (!specialist) {
      throw new Error(`agent ${args.agent_id} not found`);
    }
    const existing = await ctx.runQuery(
      internal.hiveRegistryData._getEmbeddingByAgentId,
      { agent_id: args.agent_id },
    );
    const agent = await ctx.runQuery(internal.agents._getByAgentId, {
      agent_id: args.agent_id,
    });
    const capability_text = buildCapabilityText({
      display_name: specialist.display_name,
      sponsor: specialist.sponsor,
      one_liner: specialist.one_liner,
      capabilities: specialist.capabilities,
      mcp_tool_schemas: toolSchemasForText(
        specialist.mcp_tool_schemas as
          | Array<{ name?: string; description?: string }>
          | undefined,
      ),
    });
    const embedding = await embedText(capability_text);
    const embedding_model = embeddingModelName();

    await ctx.runMutation(internal.hiveRegistryData._upsertEmbedding, {
      agent_id: args.agent_id,
      capability_text,
      embedding,
      embedding_model,
      eval_passed:
        existing?.eval_passed ?? specialist.eval_status === "passed",
      cost_baseline: specialist.cost_baseline,
      reputation_score:
        agent?.reputation_score ?? specialist.starting_reputation,
      updated_at: Date.now(),
    });

    return { agent_id: args.agent_id, refreshed: true, embedding_model };
  },
});
