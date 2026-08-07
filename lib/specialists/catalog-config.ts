/**
 * Catalog entry -> SpecialistConfig synthesis.
 *
 * MCP_CATALOG entries are auto-enrolled as bidders but are NEVER persisted to
 * the `discovered_specialists` table — they exist only as an in-memory
 * registration. That registration is module-scope state, so it lives and dies
 * with the Convex isolate.
 *
 * `solicitBids` and the execute path run as separate actions and may land in
 * different isolates. When execute landed on a cold one, `getRunner` threw
 * "No specialist runner registered for <agent>" for a catalog agent that had
 * just legitimately won its auction — intermittently, because a warm isolate
 * still had the registration from bidding.
 *
 * Both call sites now build the config from this single function so the
 * execute-time rehydration cannot drift from the bid-time enrolment.
 */
import type { SpecialistConfig } from "../types";
import type { CatalogEntry } from "./catalog";

/** Reputation floor for an auto-enrolled catalog agent with no track record. */
export const CATALOG_STARTING_REPUTATION = 0.55;

export function catalogSystemPrompt(entry: CatalogEntry): string {
  return `You are ${entry.display_name}, an MCP-equipped specialist for ${entry.sponsor}. Your remote tools cover: ${entry.capabilities.join(", ")}. ${entry.one_liner} Treat the user's goal on its own terms — never translate it into another domain. Decline cleanly when the goal is outside what your tools can do.`;
}

export function specialistConfigFromCatalog(
  entry: CatalogEntry,
): SpecialistConfig {
  return {
    agent_id: entry.agent_id,
    display_name: entry.display_name,
    sponsor: entry.sponsor,
    capabilities: entry.capabilities,
    system_prompt: catalogSystemPrompt(entry),
    cost_baseline: entry.cost_baseline,
    starting_reputation: CATALOG_STARTING_REPUTATION,
    one_liner: entry.one_liner,
    mcp_endpoint: entry.mcp_endpoint,
    mcp_api_key_env: entry.mcp_api_key_env,
    homepage_url: entry.homepage_url,
    discovered: true,
    discovery_source: "catalog",
    discovered_for: "auto-enrolled from catalog",
    tier: "mcp-forwarding",
  };
}
