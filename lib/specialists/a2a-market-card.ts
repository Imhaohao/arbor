/**
 * Builder for the Arbor Market A2A v0.3.0 agent card.
 *
 * Shared so both the market gateway route and the
 * /.well-known/agent-card.json discovery route emit an identical card.
 * Lives outside the route file because Next.js route modules may only
 * export recognized handlers (GET/POST/OPTIONS/...), not helpers.
 */

import {
  ARBOR_ACP_EXTENSION_URI,
  ARBOR_ACP_VERSION,
  ARBOR_BLACKBOARD_EXTENSION_URI,
  didWebForUrl,
} from "../acp";
import { TOON_MEDIA_TYPE } from "../toon";
import {
  rankAgents4D,
  type ReputationDimensions,
} from "../hive/rank-core";

// W4 (Agentverse-style multi-dimensional ranked discovery, arXiv:2606.20570):
// same availability mapping used by convex/hiveRegistry.ts's rank_mode: "4d"
// path, so the market card surfaces the identical rank a buyer agent would
// see from hive discovery. ready=1.0, mock_only=0.3 (usable but discounted),
// every other readiness stage (needs_key/endpoint_down/protocol_mismatch/
// needs_owner_action)=0.1, unknown/no-smoke-evidence=0.5 neutral.
const MARKET_AVAILABILITY_BY_READINESS: Record<string, number> = {
  ready: 1.0,
  mock_only: 0.3,
  needs_key: 0.1,
  endpoint_down: 0.1,
  protocol_mismatch: 0.1,
  needs_owner_action: 0.1,
};
const MARKET_AVAILABILITY_UNKNOWN = 0.5;

export function marketAvailabilityForReadiness(
  readiness_status: string | undefined,
): number {
  if (!readiness_status) return MARKET_AVAILABILITY_UNKNOWN;
  return (
    MARKET_AVAILABILITY_BY_READINESS[readiness_status] ??
    MARKET_AVAILABILITY_UNKNOWN
  );
}

export interface MarketRankEntryInput {
  agent_id: string;
  /** Embedding/semantic similarity to a buyer's query, 0..1. Optional — a
   * discover listing (not tied to one query) can omit it; defaults to a
   * neutral 0.5 so the rank still reflects reputation/price/availability. */
  similarity?: number;
  reputation_dims?: ReputationDimensions;
  cost_baseline: number;
  readiness_status?: string;
}

export interface MarketRankFields {
  rank_score: number;
  capability_score: number;
  reputation_score: number;
  price_score: number;
  availability_score: number;
}

const DEFAULT_MARKET_REPUTATION: ReputationDimensions = {
  reliability: 0.5,
  quality: 0.5,
  safety: 1.0,
  speed: 0.5,
};

/**
 * Additively decorate market card discover entries with the same 4D
 * dimensions (capability-match x reputation x price x availability) used by
 * hive routing, so an A2A buyer sees the identical rank. Entries without
 * enough data still get a neutral score rather than being dropped — this
 * never removes or reorders the caller's array, it only attaches scores.
 */
export function attachMarketRankDimensions<T extends MarketRankEntryInput>(
  entries: T[],
): Array<T & MarketRankFields> {
  const ranked = rankAgents4D(
    entries.map((entry) => ({
      agent_id: entry.agent_id,
      similarity: entry.similarity ?? 0.5,
      reputation: entry.reputation_dims ?? DEFAULT_MARKET_REPUTATION,
      price: entry.cost_baseline,
      availability: marketAvailabilityForReadiness(entry.readiness_status),
      __entry: entry,
    })),
  );
  const byAgentId = new Map(ranked.map((r) => [r.candidate.agent_id, r]));
  // Preserve the caller's original ordering; only attach scores.
  return entries.map((entry) => {
    const r = byAgentId.get(entry.agent_id);
    return {
      ...entry,
      rank_score: r?.rank_score ?? 0,
      capability_score: r?.capability_score ?? 0,
      reputation_score: r?.reputation_score ?? 0,
      price_score: r?.price_score ?? 0,
      availability_score: r?.availability_score ?? 0,
    };
  });
}

export const A2A_PROTOCOL_VERSION = "0.3.0";
export const MARKET_EXTENSION_URI = "https://arbor.dev/a2a/extensions/market";

export const INTENT_TO_TOOL = {
  discover: "list_specialists",
  post_task: "post_task",
  get_task: "get_task",
  raise_dispute: "raise_dispute",
} as const;

/** Tool-backed intents (dispatched to MCP tools). */
export type ToolBackedIntent = keyof typeof INTENT_TO_TOOL;

/**
 * `negotiate` is conversational, not tool-backed: the gateway answers with an
 * LLM-drafted arbitrator reply grounded in the live roster, threading
 * contextId across turns (A2A multi-turn: the server keeps history keyed by
 * contextId and echoes it on every reply).
 */
export const NEGOTIATE_INTENT = "negotiate" as const;

export type MarketIntent = ToolBackedIntent | typeof NEGOTIATE_INTENT;

export const ALL_MARKET_INTENTS: MarketIntent[] = [
  ...(Object.keys(INTENT_TO_TOOL) as ToolBackedIntent[]),
  NEGOTIATE_INTENT,
];

export const INTENT_DESCRIPTIONS: Record<MarketIntent, string> = {
  discover:
    "List specialists with reputation, connection status, and the market_ready flag.",
  post_task:
    "Post a work brief with max_budget. The auction opens immediately.",
  get_task: "Fetch the latest state of a posted task by task_id.",
  raise_dispute: "Reopen a completed task for the judge to re-evaluate.",
  negotiate:
    "Converse with the Arbor arbitrator about scope, price, and terms before posting a task. Multi-turn: echo the contextId from each reply.",
};

/**
 * Public origin for the card. Behind a proxy/tunnel `req.url` reflects the
 * internal host (localhost:3000), which would hand external A2A clients an
 * unreachable endpoint — prefer forwarded headers when present.
 */
function publicOrigin(req: { url: string; headers?: Headers }): string {
  const fromUrl = new URL(req.url);
  const host =
    req.headers?.get("x-forwarded-host") ??
    req.headers?.get("host") ??
    fromUrl.host;
  const proto =
    req.headers?.get("x-forwarded-proto") ??
    fromUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function buildMarketAgentCard(req: { url: string; headers?: Headers }) {
  const origin = publicOrigin(req);
  const url = `${origin}/api/a2a/market`;
  const hmacRequired = process.env.ARBOR_A2A_HMAC_REQUIRED === "true";
  const did = didWebForUrl(origin);
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: "Arbor Market",
    description:
      "A2A gateway to the Arbor market. Buyer agents can discover specialists, post tasks, poll task state, and raise disputes via message/send with metadata.intent.",
    url,
    version: "1.0.0",
    provider: {
      organization: "Arbor",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      extensions: [
        {
          uri: MARKET_EXTENSION_URI,
          required: false,
          description:
            "Arbor market intents: discover, post_task, get_task, raise_dispute via message/send metadata.intent.",
        },
        {
          uri: ARBOR_ACP_EXTENSION_URI,
          required: false,
          description:
            "Arbor ACP profile: DID metadata, SLA negotiation, durable task states, typed Parts, and Artifacts.",
        },
        {
          uri: ARBOR_BLACKBOARD_EXTENSION_URI,
          required: false,
          description:
            "Namespaced agentic blackboard with signed writes and control-shell consensus.",
        },
      ],
    },
    defaultInputModes: ["application/json", TOON_MEDIA_TYPE, "text/plain"],
    defaultOutputModes: ["application/json", TOON_MEDIA_TYPE, "text/markdown"],
    skills: ALL_MARKET_INTENTS.map((intent) => ({
      id: intent,
      name: intent,
      description: INTENT_DESCRIPTIONS[intent],
      tags:
        intent === NEGOTIATE_INTENT
          ? ["arbor", "market", intent, "chat", "multi-turn"]
          : ["arbor", "market", intent],
      inputModes: ["application/json", TOON_MEDIA_TYPE, "text/plain"],
      outputModes: ["application/json", TOON_MEDIA_TYPE, "text/markdown"],
    })),
    security: hmacRequired ? [{ arborHmac: [] }] : [],
    securitySchemes: {
      arborHmac: {
        type: "apiKey",
        in: "header",
        name: "X-Arbor-Signature",
        description:
          "HMAC-SHA256 over body + timestamp + nonce. Also send X-Arbor-Agent, X-Arbor-Timestamp, and X-Arbor-Nonce.",
      },
    },
    supportsAuthenticatedExtendedCard: hmacRequired,
    arbor: {
      acp_version: ARBOR_ACP_VERSION,
      did,
      market_agent: true,
      intents: Object.fromEntries(
        ALL_MARKET_INTENTS.map((intent) => [
          intent,
          {
            ...(intent in INTENT_TO_TOOL
              ? { tool: INTENT_TO_TOOL[intent as ToolBackedIntent] }
              : {}),
            description: INTENT_DESCRIPTIONS[intent],
          },
        ]),
      ),
      supported_methods: [
        "message/send",
        "tasks/send",
        "tasks/get",
        "tasks/cancel",
      ],
      negotiation: {
        metadata_field: "sla",
        supported_formats: ["application/json", TOON_MEDIA_TYPE],
      },
      blackboard: {
        read_url_template: `${origin}/api/v1/scratchpad/{dag_id}`,
        recall_url_template: `${origin}/api/v1/scratchpad/{dag_id}/recall`,
        write_auth: "arborHmac",
        namespaces: [
          "proposals",
          "research",
          "code",
          "artifacts",
          "review",
          "decisions",
          "consensus",
        ],
      },
      auth: {
        required: hmacRequired,
        required_headers: [
          "X-Arbor-Agent",
          "X-Arbor-Timestamp",
          "X-Arbor-Nonce",
          "X-Arbor-Signature",
        ],
      },
    },
  };
}
