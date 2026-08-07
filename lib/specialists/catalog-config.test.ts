import assert from "node:assert/strict";
import { MCP_CATALOG } from "./catalog";
import {
  CATALOG_STARTING_REPUTATION,
  specialistConfigFromCatalog,
} from "./catalog-config";
// Imported for the cold-registry check below. This module registers runners
// and MCP/A2A clients at import time — which is exactly the production state
// the bug depended on, so importing it here is the point, not a hazard.
import { getRunner, registerDiscoveredSpecialist } from "./registry";

// The 2026-08-06 regression: openzeppelin-contracts won an auction and then
// failed with "No specialist runner registered". Catalog agents are enrolled
// as bidders in solicitBids but never persisted to discovered_specialists, so
// on a cold Convex isolate the execute path had nothing to rehydrate from.
// Both call sites now build the config here, so this entry must stay
// synthesizable.
{
  const entry = MCP_CATALOG.find((c) => c.agent_id === "openzeppelin-contracts");
  assert.ok(entry, "openzeppelin-contracts missing from MCP_CATALOG");
  const cfg = specialistConfigFromCatalog(entry);
  assert.equal(cfg.agent_id, "openzeppelin-contracts");
  assert.equal(cfg.tier, "mcp-forwarding");
  assert.ok(cfg.mcp_endpoint, "catalog config must carry an mcp_endpoint");
  assert.equal(cfg.discovered, true);
  assert.equal(cfg.discovery_source, "catalog");
  assert.equal(cfg.starting_reputation, CATALOG_STARTING_REPUTATION);
}

// registry.ts throws for a tier:"mcp-forwarding" config with no mcp_endpoint.
// Any catalog entry that synthesized into one would be unregisterable and
// would reproduce the same "No specialist runner registered" failure the
// moment it won an auction, so guard the whole catalog rather than one entry.
{
  const broken = MCP_CATALOG.filter(
    (c) => !specialistConfigFromCatalog(c).mcp_endpoint,
  ).map((c) => c.agent_id);
  assert.deepEqual(
    broken,
    [],
    `catalog entries with no mcp_endpoint would be unregisterable: ${broken.join(", ")}`,
  );
}

// Agent ids must be unique: a duplicate would let one entry shadow another in
// the registry, so the agent that won is not necessarily the one that runs.
{
  const seen = new Set();
  const dupes = [];
  for (const c of MCP_CATALOG) {
    if (seen.has(c.agent_id)) dupes.push(c.agent_id);
    seen.add(c.agent_id);
  }
  assert.deepEqual(dupes, [], `duplicate catalog agent_ids: ${dupes.join(", ")}`);
}

// The synthesized prompt has to name the agent and its sponsor — this is the
// persona the bid and execute calls both run under.
{
  const entry = MCP_CATALOG[0];
  const cfg = specialistConfigFromCatalog(entry);
  assert.ok(cfg.system_prompt.includes(entry.display_name));
  assert.ok(cfg.system_prompt.includes(entry.sponsor));
}

console.log(
  `catalog-config.test.ts: all assertions passed (${MCP_CATALOG.length} catalog entries)`,
);

// The mechanism itself: a catalog agent is NOT registered at import time, so
// a cold isolate cannot resolve a runner for it — that is the bug. Rebuilding
// from the catalog and registering must make getRunner resolve, which is what
// convex/auctions.ts now does at execute time when the winner has no
// discovered_specialists row.
{
  const entry = MCP_CATALOG.find((c) => c.agent_id === "openzeppelin-contracts");
  assert.ok(entry);

  assert.throws(
    () => getRunner("openzeppelin-contracts" as never),
    /No specialist runner registered/,
    "expected a cold registry to have no catalog runner (the bug's precondition)",
  );

  registerDiscoveredSpecialist(specialistConfigFromCatalog(entry));
  const runner = getRunner("openzeppelin-contracts" as never);
  assert.ok(runner, "catalog agent must resolve a runner after rehydration");
  assert.equal(typeof runner.execute, "function");
}

console.log("catalog-config.test.ts: cold-registry rehydration verified");
