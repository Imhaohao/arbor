import type { SpecialistConfig } from "../types";
import type { DiscoveryResult } from "./discover";

export const AUTO_DISCOVERY_SOURCES = [
  "google",
  "registry",
  "a2a",
  "catalog",
] as const;

export type AutoDiscoverySource = (typeof AUTO_DISCOVERY_SOURCES)[number];

export type VerificationStatus =
  | "not_requested"
  | "agent_card_fetched"
  | "tools_list_returned_tools"
  | "tools_list_no_evidence";

export function isConnectableDiscovery(config: SpecialistConfig): boolean {
  if (config.discovery_source === "synthesized" || config.tier === "mock") {
    return false;
  }
  const endpoint = config.mcp_endpoint ?? config.a2a_endpoint;
  return Boolean(endpoint && !/\{[^{}]+\}/.test(endpoint));
}

export function verificationStatus(
  result: DiscoveryResult,
  verifyRequested: boolean,
): VerificationStatus {
  if (result.specialist.a2a_endpoint) return "agent_card_fetched";
  if (!verifyRequested) return "not_requested";
  return result.verified_tools.length > 0
    ? "tools_list_returned_tools"
    : "tools_list_no_evidence";
}

export function discoveryPersistArgs(
  result: DiscoveryResult,
  fallbackPrompt: string,
) {
  const cfg = result.specialist;
  return {
    agent_id: cfg.agent_id,
    display_name: cfg.display_name,
    sponsor: cfg.sponsor,
    capabilities: cfg.capabilities,
    system_prompt: cfg.system_prompt,
    cost_baseline: cfg.cost_baseline,
    starting_reputation: cfg.starting_reputation,
    one_liner: cfg.one_liner,
    tier: cfg.tier,
    openrouter_model_id: cfg.openrouter_model_id,
    openrouter_api_key_env: cfg.openrouter_api_key_env,
    discovered_for: cfg.discovered_for ?? fallbackPrompt,
    discovery_source: cfg.discovery_source,
    mcp_endpoint: cfg.mcp_endpoint,
    mcp_api_key_env: cfg.mcp_api_key_env,
    homepage_url: cfg.homepage_url,
    rationale: result.rationale,
    a2a_endpoint: cfg.a2a_endpoint,
    a2a_agent_card_url: cfg.a2a_agent_card_url,
    a2a_api_key_env: cfg.a2a_api_key_env,
    a2a_auth_mode: cfg.a2a_auth_mode,
  };
}

export function discoveryLifecyclePayload(
  result: DiscoveryResult,
  verifyRequested: boolean,
) {
  const cfg = result.specialist;
  return {
    source: result.source,
    agent_id: cfg.agent_id,
    display_name: cfg.display_name,
    endpoint: cfg.mcp_endpoint ?? cfg.a2a_endpoint,
    verification_requested: verifyRequested,
    verification_status: verificationStatus(result, verifyRequested),
    verified_tools: result.verified_tools,
    rationale: result.rationale,
  };
}
