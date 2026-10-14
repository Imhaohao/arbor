// Specialist: arbor-code-team
//
// A standalone A2A v0.3.0 service (scripts/code-team-a2a.ts) wrapping a team of
// small models for stdin/stdout programming problems. Each member solves the
// problem, independent testers write brute-force checkers, and the answer is
// the candidate those checkers favour. Hired through the normal auction.
//
// Required env vars (see .env.example):
//   ARBOR_CODE_TEAM_A2A_ENDPOINT       — full URL of the service's JSON-RPC endpoint
//                                        (e.g. http://localhost:4100/)
//   ARBOR_CODE_TEAM_A2A_AGENT_CARD_URL — optional; overrides well-known card discovery
//   ARBOR_CODE_TEAM_BEARER             — optional; bearer token if the service requires auth

import type { SpecialistConfig } from "../types";

const endpoint = process.env.ARBOR_CODE_TEAM_A2A_ENDPOINT?.trim();
const cardUrl = process.env.ARBOR_CODE_TEAM_A2A_AGENT_CARD_URL?.trim();

export const CODE_TEAM_A2A_CONFIG: SpecialistConfig = {
  agent_id: "arbor-code-team",
  display_name: "Arbor Code Team (A2A)",
  sponsor: "Arbor",
  capabilities: [
    "algorithmic-programming",
    "competitive-programming",
    "verified-code-generation",
  ],
  system_prompt: `You are arbor-code-team, a team of small models reachable over the A2A protocol. You solve stdin/stdout programming problems in Python: each member writes a solution, independent testers write brute-force checkers, and you return the one program the checkers favour together with the evidence for choosing it. Your output comes from the remote team service, never invented locally.`,
  cost_baseline: 1.0,
  starting_reputation: 0.6,
  one_liner: "A team of small models whose answer is chosen by independent brute-force testers.",
  tier: endpoint ? "a2a" : "disabled",
  a2a_endpoint: endpoint,
  a2a_agent_card_url: cardUrl,
  a2a_api_key_env: "ARBOR_CODE_TEAM_BEARER",
};
