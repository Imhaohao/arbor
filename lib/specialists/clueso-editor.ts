/**
 * Clueso specialist — registered per explicit request, but NOT a live
 * integration.
 *
 * Clueso (clueso.io) is an AI-driven product-video and documentation platform
 * for screen-recording walkthroughs — not a match for `edit_video`'s actual
 * job (pacing/captions/sound-design polish on a short generated clip) even if
 * it had an API. More importantly: after checking its official docs, help
 * center, and site, no publicly documented developer API or auth scheme could
 * be found — every other "Clueso API" result returned by search was an
 * unrelated product (CLUE Learning, Cludo Search, Suprema's CLUe biometric
 * API). This is a materially different situation from the other four editors
 * in this file's sibling modules, which are all missing-CREDENTIAL cases; this
 * one is a missing-PRODUCT case.
 *
 * Per CLAUDE.md ("Do not make fallback specialists appear to have live tools
 * when they do not"), this specialist is registered in the roster — so it is
 * visible and the DAG's `edit_video` node stops silently naming an
 * unregistered candidate — but it ALWAYS declines to bid and its `probe`
 * ALWAYS reports `demo_lane`, with the honest reason attached. If Clueso ever
 * publishes a developer API, this file is where a real client would replace
 * the stub, following the same verify-then-build pattern used for the other
 * four editors.
 */
import type {
  BidPayload,
  DeclineDecision,
  ProbeResult,
  SpecialistConfig,
  SpecialistExecuteResult,
  SpecialistRunner,
} from "../types";

export const CLUESO_EDITOR_CONFIG: SpecialistConfig = {
  agent_id: "clueso-editor",
  display_name: "Clueso",
  sponsor: "Clueso",
  capabilities: [
    "product video documentation",
    "screen recording walkthrough",
  ],
  system_prompt:
    "Clueso turns screen recordings into product videos and documentation. " +
    "It has no publicly documented API, so this specialist cannot execute.",
  // Deliberately NOT 0. rankAgents4D's priceScore treats price <= 0 as "free",
  // the best possible price score — which would make a specialist that can
  // NEVER execute look like the cheapest option in the marketplace and win
  // invite slots on a routing artifact rather than genuine value. Matched to
  // the other editors in this file's sibling modules so it neither games nor
  // is penalized by the price dimension.
  cost_baseline: 0.6,
  starting_reputation: 0.5,
  one_liner:
    "Registered as a known product-video tool; not wired because Clueso has no public developer API.",
  tier: "real",
  homepage_url: "https://www.clueso.io",
};

export const CLUESO_NO_API_REASON =
  "Clueso has no publicly documented developer API as of this integration " +
  "(checked clueso.io, its help center, and third-party API trackers) — this " +
  "is not a missing-credential case, there is nothing to authenticate against.";

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

export const cluesoEditor: SpecialistRunner = {
  config: CLUESO_EDITOR_CONFIG,

  async probe(): Promise<ProbeResult> {
    return {
      status: "demo_lane",
      duration_ms: 0,
      error_message: CLUESO_NO_API_REASON,
    };
  },

  async bid(): Promise<BidPayload | DeclineDecision> {
    return decline(CLUESO_NO_API_REASON);
  },

  async execute(): Promise<SpecialistExecuteResult> {
    throw new Error(CLUESO_NO_API_REASON);
  },
};
