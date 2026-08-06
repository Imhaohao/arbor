import assert from "node:assert/strict";
import { capOpenRoster, looksTransportReady } from "./auction-roster";
import type { SpecialistConfig } from "./types";

// lib/specialists/registry.ts ARBOR_FLOOR_AGENT_IDS. Hardcoded rather than
// imported: that module registers runners and A2A/MCP clients at module
// scope, which a unit test must not trigger.
const FLOOR = new Set(["arbor-baseline", "arbor-hive-backstop"]);

function spec(
  agent_id: string,
  overrides: Partial<SpecialistConfig> = {},
): SpecialistConfig {
  return {
    agent_id,
    display_name: agent_id,
    sponsor: "test",
    capabilities: [],
    system_prompt: "",
    cost_baseline: 1,
    starting_reputation: 0.5,
    one_liner: "",
    tier: "model",
    ...overrides,
  } as SpecialistConfig;
}

// A specialist that declares no API key can always transact.
{
  assert.equal(looksTransportReady(spec("a"), {}), true);
}

// Every declared key must be present, not just one.
{
  const s = spec("a", { a2a_api_key_env: "A_KEY", mcp_api_key_env: "M_KEY" });
  assert.equal(looksTransportReady(s, { A_KEY: "x" }), false);
  assert.equal(looksTransportReady(s, { A_KEY: "x", M_KEY: "y" }), true);
}

// An empty-string key is missing, not present — this is the common shape of a
// declared-but-unset env var.
{
  const s = spec("a", { a2a_api_key_env: "A_KEY" });
  assert.equal(looksTransportReady(s, { A_KEY: "" }), false);
}

// A roster at or under the cap is returned untouched (same reference).
{
  const roster = [spec("a"), spec("b")];
  assert.equal(capOpenRoster(roster, 5, { floorAgentIds: FLOOR, env: {} }), roster);
}

// The load-bearing invariant: the cap can never empty an auction. Even a cap
// of 1 yields every Arbor-owned floor agent.
{
  const roster = [
    spec("x"),
    spec("arbor-baseline"),
    spec("y"),
    spec("arbor-hive-backstop"),
    spec("z"),
  ];
  const out = capOpenRoster(roster, 1, { floorAgentIds: FLOOR, env: {} });
  const ids = out.map((s) => s.agent_id);
  assert.ok(ids.includes("arbor-baseline"));
  assert.ok(ids.includes("arbor-hive-backstop"));
  assert.equal(out.length, 2);
}

// Readiness dominates reputation: a 0.99-rep agent whose key is missing loses
// to a ready 0.1-rep agent. This is what makes the cap shed dead endpoints
// (the ~1,155-row discovered roster is mostly keyless) before capable ones.
{
  const roster = [
    spec("unready", { a2a_api_key_env: "MISSING", starting_reputation: 0.99 }),
    spec("ready", { starting_reputation: 0.1 }),
    spec("filler-1"),
    spec("filler-2"),
  ];
  const out = capOpenRoster(roster, 1, { floorAgentIds: FLOOR, env: {} });
  assert.ok(!out.map((s) => s.agent_id).includes("unready"));
  assert.equal(out.length, 1);
}

// Reputation is the tiebreak among equally ready agents.
{
  const roster = [
    spec("low", { starting_reputation: 0.2 }),
    spec("high", { starting_reputation: 0.9 }),
    spec("mid", { starting_reputation: 0.5 }),
  ];
  const out = capOpenRoster(roster, 2, { floorAgentIds: FLOOR, env: {} });
  assert.deepEqual(out.map((s) => s.agent_id), ["high", "mid"]);
}

// The real shape: 1,155 discovered specialists down to a demoable fan-out.
{
  const roster = Array.from({ length: 1155 }, (_, i) => spec(`agent-${i}`));
  assert.equal(
    capOpenRoster(roster, 40, { floorAgentIds: FLOOR, env: {} }).length,
    40,
  );
}

console.log("auction-roster.test.ts: all assertions passed");
