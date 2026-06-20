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

export const A2A_PROTOCOL_VERSION = "0.3.0";
export const MARKET_EXTENSION_URI = "https://arbor.dev/a2a/extensions/market";

export const INTENT_TO_TOOL = {
  discover: "list_specialists",
  post_task: "post_task",
  get_task: "get_task",
  raise_dispute: "raise_dispute",
} as const;

export type MarketIntent = keyof typeof INTENT_TO_TOOL;

export const INTENT_DESCRIPTIONS: Record<MarketIntent, string> = {
  discover:
    "List specialists with reputation, connection status, and the market_ready flag.",
  post_task:
    "Post a work brief with max_budget. The auction opens immediately.",
  get_task: "Fetch the latest state of a posted task by task_id.",
  raise_dispute: "Reopen a completed task for the judge to re-evaluate.",
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
    skills: (Object.keys(INTENT_TO_TOOL) as MarketIntent[]).map((intent) => ({
      id: intent,
      name: intent,
      description: INTENT_DESCRIPTIONS[intent],
      tags: ["arbor", "market", intent],
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
        (Object.keys(INTENT_TO_TOOL) as MarketIntent[]).map((intent) => [
          intent,
          {
            tool: INTENT_TO_TOOL[intent],
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
