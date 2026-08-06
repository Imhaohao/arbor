/**
 * Open-auction fan-out ranking.
 *
 * Lives in lib/ rather than convex/auctions.ts so it can be unit-tested
 * without pulling in the Convex server runtime or lib/specialists/registry
 * (which registers runners and A2A/MCP clients at module scope). The caller
 * passes the floor-agent set and the environment explicitly for the same
 * reason.
 */
import type { SpecialistConfig } from "./types";

export type RosterEnv = Record<string, string | undefined>;

/**
 * True when this specialist could actually transact right now: it needs no
 * API key, or every key it declares is present in `env`.
 *
 * Ranking signal only. A "ready" agent can still fail its probe, and an
 * unready one is merely deprioritized — an uncapped auction still invites it.
 * Deliberately query-free: consulting per-agent stats here would reintroduce
 * exactly the per-agent round-trip cost the cap exists to avoid.
 */
export function looksTransportReady(
  spec: SpecialistConfig,
  env: RosterEnv,
): boolean {
  const keyEnvs = [spec.a2a_api_key_env, spec.mcp_api_key_env].filter(
    (name): name is string => Boolean(name),
  );
  return keyEnvs.every((name) => Boolean(env[name]));
}

/**
 * Rank an open (uninvited) roster and take the top `cap`.
 *
 * Invariants:
 * - Arbor-owned floor agents are always kept, regardless of rank or cap, so
 *   the cap can never empty an auction. This mirrors the exemption
 *   ARBOR_CLUSTER_ACCEPT_FLOOR already honors.
 * - Remaining slots go to transport-ready agents first, then by starting
 *   reputation, so the cap sheds dead endpoints before capable ones.
 * - A roster at or under the cap is returned untouched.
 */
export function capOpenRoster(
  roster: SpecialistConfig[],
  cap: number,
  opts: { floorAgentIds: ReadonlySet<string>; env: RosterEnv },
): SpecialistConfig[] {
  if (roster.length <= cap) return roster;
  const { floorAgentIds, env } = opts;
  const floor = roster.filter((s) => floorAgentIds.has(s.agent_id));
  const rest = roster
    .filter((s) => !floorAgentIds.has(s.agent_id))
    .sort((a, b) => {
      const ready =
        Number(looksTransportReady(b, env)) - Number(looksTransportReady(a, env));
      if (ready !== 0) return ready;
      return (b.starting_reputation ?? 0) - (a.starting_reputation ?? 0);
    });
  // Floor agents are prepended, so a cap smaller than the floor set still
  // yields every floor agent rather than an empty auction.
  return [...floor, ...rest].slice(0, Math.max(cap, floor.length));
}
