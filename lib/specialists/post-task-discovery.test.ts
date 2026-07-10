import assert from "node:assert/strict";
import type { SpecialistConfig } from "../types";
import type { DiscoveryResult } from "./discover";
import {
  discoveryPersistArgs,
  isConnectableDiscovery,
  verificationStatus,
} from "./post-task-discovery";

function specialist(overrides: Partial<SpecialistConfig> = {}): SpecialistConfig {
  return {
    agent_id: "search-agent",
    display_name: "Search Agent",
    sponsor: "Search Co",
    capabilities: ["search"],
    system_prompt: "Use the remote endpoint.",
    cost_baseline: 0.5,
    starting_reputation: 0.5,
    one_liner: "Searches for things.",
    tier: "mcp-forwarding",
    mcp_endpoint: "https://example.com/mcp",
    discovered: true,
    discovery_source: "registry",
    discovered_for: "find an agent",
    ...overrides,
  };
}

function result(
  overrides: Partial<DiscoveryResult> = {},
): DiscoveryResult {
  return {
    specialist: specialist(),
    source: "registry",
    rationale: "matched registry result",
    verified_tools: [],
    ...overrides,
  };
}

assert.equal(verificationStatus(result(), false), "not_requested");
assert.equal(verificationStatus(result(), true), "tools_list_no_evidence");
assert.equal(
  verificationStatus(result({ verified_tools: ["search"] }), true),
  "tools_list_returned_tools",
);
assert.equal(
  verificationStatus(
    result({
      source: "a2a",
      specialist: specialist({
        tier: "a2a",
        a2a_endpoint: "https://agent.example/a2a",
        mcp_endpoint: undefined,
      }),
    }),
    true,
  ),
  "agent_card_fetched",
);

assert.equal(isConnectableDiscovery(specialist()), true);
assert.equal(
  isConnectableDiscovery(
    specialist({ mcp_endpoint: "https://{tenant}.example.com/mcp" }),
  ),
  false,
);
assert.equal(
  isConnectableDiscovery(
    specialist({ tier: "mock", discovery_source: "synthesized" }),
  ),
  false,
);

const persisted = discoveryPersistArgs(result(), "fallback prompt");
assert.equal(persisted.agent_id, "search-agent");
assert.equal(persisted.rationale, "matched registry result");
assert.equal(persisted.discovery_source, "registry");

console.log("post-task-discovery tests passed");
