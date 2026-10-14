import { NIA_CONTEXT_CONFIG } from "./nia-context";
import { HYPERSPELL_BRAIN_CONFIG } from "./hyperspell-brain";
import { tensorlakeExec, TENSORLAKE_EXEC_CONFIG } from "./tensorlake-exec";
import {
  higgsfieldVideo,
  HIGGSFIELD_VIDEO_CONFIG,
} from "./higgsfield-video";
import {
  elevenlabsMusic,
  ELEVENLABS_MUSIC_CONFIG,
} from "./elevenlabs-music";
import {
  fishAudioVoice,
  FISH_AUDIO_VOICE_CONFIG,
} from "./fish-audio-voice";
import { reapEditor, REAP_EDITOR_CONFIG } from "./reap-editor";
import { descriptEditor, DESCRIPT_EDITOR_CONFIG } from "./descript-editor";
import { opusclipEditor, OPUSCLIP_EDITOR_CONFIG } from "./opusclip-editor";
import { submagicEditor, SUBMAGIC_EDITOR_CONFIG } from "./submagic-editor";
import { cluesoEditor, CLUESO_EDITOR_CONFIG } from "./clueso-editor";
import { CODEX_WRITER_CONFIG } from "./codex-writer";
import { DEVIN_ENGINEER_CONFIG } from "./devin-engineer";
import { reacherSocial, REACHER_SOCIAL_CONFIG } from "./reacher-social";
import { vercelV0, VERCEL_V0_CONFIG } from "./vercel-v0";
import { INSFORGE_BACKEND_CONFIG } from "./insforge-backend";
import { ASIDE_BROWSER_CONFIG } from "./aside-browser";
import { CONVEX_REALTIME_CONFIG } from "./convex-realtime";
import { TENSORLAKE_A2A_CONFIG } from "./tensorlake-a2a";
import { DEVIN_A2A_CONFIG } from "./devin-a2a";
import { CONVEX_A2A_CONFIG } from "./convex-a2a";
import { WORKER_A2A_CONFIG } from "./worker-a2a";
import { CODE_TEAM_A2A_CONFIG } from "./code-team-a2a";
import { makeMcpForwardingSpecialist } from "./mcp-forwarding";
import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import { makeMockSpecialist } from "./base";
import { makeDevinMcpBridgeSpecialist } from "./devin-bridge";
import { makeOpenRouterSpecialist } from "./openrouter-forwarding";
import { OPENROUTER_SPECIALISTS } from "./openrouter-roster";
import { arborBaseline, ARBOR_BASELINE_CONFIG } from "./arbor-baseline";
import {
  arborHiveBackstop,
  ARBOR_HIVE_BACKSTOP_CONFIG,
} from "./arbor-hive-backstop";
import {
  arborPublicDemo,
  ARBOR_PUBLIC_DEMO_CONFIG,
} from "./arbor-public-demo";
import {
  codebaseExplainer,
  CODEBASE_EXPLAINER_CONFIG,
} from "./codebase-explainer";
import { githubPrReview, GITHUB_PR_REVIEW_CONFIG } from "./github-pr-review";
import { openrouterEnabled, type ModelGateway } from "../openai";
import { publicDemoMode } from "../public-demo";
import type {
  SpecialistConfig,
  SpecialistRunner,
  AgentId,
  InternalSpecialistTier,
} from "../types";
export { toPublicTier } from "./tiers";
export { OPENROUTER_SPECIALISTS } from "./openrouter-roster";

/**
 * Seed A2A specialist that round-trips to Arbor's own /api/a2a/market gateway.
 * Proves the outbound A2A runner works without depending on an external service.
 * The endpoint resolves to the local dev server (or the deployed Vercel URL).
 */
const ARBOR_LOOPBACK_BASE =
  process.env.ARBOR_LOOPBACK_BASE ?? "http://localhost:3000";

const ARBOR_LOOPBACK_A2A_CONFIG: SpecialistConfig = {
  agent_id: "arbor-loopback-a2a",
  display_name: "Arbor Market (A2A loopback)",
  sponsor: "Arbor",
  capabilities: ["task routing", "specialist dispatch", "market discovery"],
  system_prompt:
    "You are the Arbor market gateway, reachable via the A2A protocol. You route tasks to registered specialists.",
  // Honest price: the loopback resells the work of whichever specialist the
  // market routes to, so its true cost is a full specialist price — not a
  // token amount. At 0.05 it scored reputation/0.05 = 16, beat every real
  // bidder, then "delivered" a routing receipt that judges score 0.
  cost_baseline: 1.0,
  starting_reputation: 0.8,
  one_liner: "Routes tasks through the Arbor market via A2A.",
  tier: "a2a",
  a2a_endpoint: `${ARBOR_LOOPBACK_BASE}/api/a2a/market`,
  // The app origin serves no /.well-known/agent-card.json; the market route
  // returns its card on GET, so point card discovery directly at it.
  a2a_agent_card_url: `${ARBOR_LOOPBACK_BASE}/api/a2a/market`,
};

const INCLUDE_DEMO_MOCK_SPECIALISTS =
  process.env.ARBOR_INCLUDE_DEMO_MOCK_SPECIALISTS === "true";

const DEMO_MOCK_SPECIALISTS: SpecialistConfig[] = [
  CODEX_WRITER_CONFIG,
  ASIDE_BROWSER_CONFIG,
  CONVEX_REALTIME_CONFIG,
];

/**
 * All ten Nozomio sponsor agents. Listed in display order — Reacher first
 * because it is the primary data sponsor for this pivot and has a documented
 * MCP endpoint, which becomes live once REACHER_API_KEY is configured.
 */
const BASE_SPECIALISTS: SpecialistConfig[] = [
  REACHER_SOCIAL_CONFIG,
  NIA_CONTEXT_CONFIG,
  HYPERSPELL_BRAIN_CONFIG,
  TENSORLAKE_EXEC_CONFIG,
  HIGGSFIELD_VIDEO_CONFIG,
  ELEVENLABS_MUSIC_CONFIG,
  FISH_AUDIO_VOICE_CONFIG,
  REAP_EDITOR_CONFIG,
  DESCRIPT_EDITOR_CONFIG,
  OPUSCLIP_EDITOR_CONFIG,
  SUBMAGIC_EDITOR_CONFIG,
  CLUESO_EDITOR_CONFIG,
  DEVIN_ENGINEER_CONFIG,
  VERCEL_V0_CONFIG,
  INSFORGE_BACKEND_CONFIG,
  ...(INCLUDE_DEMO_MOCK_SPECIALISTS ? DEMO_MOCK_SPECIALISTS : []),
  // Agent Task 23 — automated PR code review. github-pr-review is the live,
  // tool-backed path (real GitHub diff fetch); arbor-baseline is Arbor's own
  // last-resort floor that guarantees every PR-review node returns a judged,
  // honestly-labeled deliverable. Both join every roster at auctions.ts:517
  // and decline non-PR tasks immediately (no model spend), so they never widen
  // the rollout to other task classes.
  GITHUB_PR_REVIEW_CONFIG,
  ARBOR_BASELINE_CONFIG,
  // Arbor-owned educational lesson maker (NotebookLM-style codebase explainer).
  // Bids only on explain/teach/walkthrough tasks; declines everything else with
  // no model spend, so it never widens the roster. Audio/video render behind
  // ARBOR_EXPLAINER_AUDIO_ENABLED / ARBOR_EXPLAINER_VIDEO_ENABLED.
  CODEBASE_EXPLAINER_CONFIG,
  // Universal last-resort floor: bids on every task class so no hive node can
  // fail for lack of a plausible bidder. Last-resort economics keep it under any
  // live specialist; it only wins when nothing live qualifies.
  ARBOR_HIVE_BACKSTOP_CONFIG,
  ARBOR_LOOPBACK_A2A_CONFIG,
  // External A2A specialists — registered when their env vars are present.
  TENSORLAKE_A2A_CONFIG,
  DEVIN_A2A_CONFIG,
  CONVEX_A2A_CONFIG,
  WORKER_A2A_CONFIG,
  CODE_TEAM_A2A_CONFIG,
].filter((s) => s.tier !== "disabled");

const ALL_STATIC_SPECIALISTS = [
  ...BASE_SPECIALISTS,
  ...OPENROUTER_SPECIALISTS,
];

/** Static roster for a task. Per-task gateway overrides win over the env flag. */
export function getSpecialists(
  gateway?: ModelGateway | string,
): SpecialistConfig[] {
  if (publicDemoMode()) return [ARBOR_PUBLIC_DEMO_CONFIG];
  return openrouterEnabled(gateway)
    ? [...BASE_SPECIALISTS, ...OPENROUTER_SPECIALISTS]
    : [...BASE_SPECIALISTS];
}

/** Backwards-compatible global roster used by UI and non-task-aware callers. */
export const SPECIALISTS: SpecialistConfig[] = getSpecialists();

export function specialistEnabled(
  config: SpecialistConfig,
  gateway?: ModelGateway | string,
): boolean {
  return config.tier !== "openrouter" || openrouterEnabled(gateway);
}

export interface PersistedSpecialistConfig {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  system_prompt: string;
  cost_baseline: number;
  starting_reputation: number;
  one_liner: string;
  tier?: InternalSpecialistTier;
  openrouter_model_id?: string;
  openrouter_api_key_env?: string;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  homepage_url?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  a2a_auth_mode?: "none" | "card";
  discovery_source?: "google" | "catalog" | "registry" | "a2a" | "synthesized";
  discovered_for?: string;
}

/** Rehydrate a Convex row without guessing model-backed agents are mocks. */
export function specialistConfigFromPersisted(
  row: PersistedSpecialistConfig,
): SpecialistConfig {
  return {
    agent_id: row.agent_id,
    display_name: row.display_name,
    sponsor: row.sponsor,
    capabilities: row.capabilities,
    system_prompt: row.system_prompt,
    cost_baseline: row.cost_baseline,
    starting_reputation: row.starting_reputation,
    one_liner: row.one_liner,
    tier:
      row.tier ??
      (row.a2a_endpoint
        ? "a2a"
        : row.mcp_endpoint
          ? "mcp-forwarding"
          : "mock"),
    openrouter_model_id: row.openrouter_model_id,
    openrouter_api_key_env: row.openrouter_api_key_env,
    mcp_endpoint: row.mcp_endpoint,
    mcp_api_key_env: row.mcp_api_key_env,
    homepage_url: row.homepage_url,
    a2a_endpoint: row.a2a_endpoint,
    a2a_agent_card_url: row.a2a_agent_card_url,
    a2a_api_key_env: row.a2a_api_key_env,
    a2a_auth_mode: row.a2a_auth_mode,
    discovered: true,
    discovery_source: row.discovery_source,
    discovered_for: row.discovered_for,
  };
}

/**
 * Arbor-owned last-resort floor agents. Their bids are exempt from the
 * auctioneer plan-plausibility screen (their plan is generic by design) and the
 * hive router always invites them, so no node can fail for lack of a plausible
 * bid. They stay last-resort via low reputation — they only win when nothing
 * live qualifies.
 */
export const ARBOR_FLOOR_AGENT_IDS: ReadonlySet<AgentId> = new Set<AgentId>([
  ARBOR_BASELINE_CONFIG.agent_id,
  ARBOR_HIVE_BACKSTOP_CONFIG.agent_id,
  ARBOR_PUBLIC_DEMO_CONFIG.agent_id,
]);

// Hand-written runners exist ONLY for tier:"real" specialists — every other
// tier (mcp-forwarding, a2a, a2a-bridge, openrouter, mock) is constructed from
// its config by buildRunner, so tier declarations (and their guards, like the
// missing-key loud-decline) are the single source of truth for dispatch.
const SPECIALIST_RUNNERS: Partial<Record<AgentId, SpecialistRunner>> = {
  "tensorlake-exec": tensorlakeExec,
  "reacher-social": reacherSocial,
  "vercel-v0": vercelV0,
  "github-pr-review": githubPrReview,
  "arbor-baseline": arborBaseline,
  "arbor-hive-backstop": arborHiveBackstop,
  "arbor-public-demo": arborPublicDemo,
  "codebase-explainer": codebaseExplainer,
  "higgsfield-video": higgsfieldVideo,
  "elevenlabs-music": elevenlabsMusic,
  "fish-audio-voice": fishAudioVoice,
  "reap-editor": reapEditor,
  "descript-editor": descriptEditor,
  "opusclip-editor": opusclipEditor,
  "submagic-editor": submagicEditor,
  "clueso-editor": cluesoEditor,
};

// Warn once at module load for every specialist that is explicitly mocked.
// Keeps "npm run dev" honest — mock specialists are clearly visible in console.
for (const cfg of SPECIALISTS) {
  if (cfg.tier === "mock") {
    console.warn(
      `[arbor] specialist "${cfg.agent_id}" (${cfg.sponsor}) is running as tier:"mock" — no live tools will be called.`,
    );
  }
}

/**
 * Discovered specialists registered at runtime. Persisted in Convex so they
 * survive across requests; this Map is a per-process cache hydrated on demand.
 */
const DISCOVERED: Map<string, SpecialistConfig> = new Map();

export function registerDiscoveredSpecialist(config: SpecialistConfig) {
  DISCOVERED.set(config.agent_id, { ...config, discovered: true });
}

/**
 * Tier-driven runner factory. Replaces the old implicit
 * `if (cfg.mcp_endpoint) … else mock` branch. Every tier must be declared
 * explicitly in the config — there is no silent downgrade.
 */
function buildRunner(cfg: SpecialistConfig): SpecialistRunner {
  switch (cfg.tier) {
    case "real": {
      // "real" specialists must have a hand-written runner in SPECIALIST_RUNNERS.
      // If missing, it's a configuration error — fail loudly.
      const runner = SPECIALIST_RUNNERS[cfg.agent_id];
      if (!runner) {
        throw new Error(
          `Specialist "${cfg.agent_id}" has tier:"real" but no hand-written runner is registered in SPECIALIST_RUNNERS. Add one or change the tier.`,
        );
      }
      return runner;
    }

    case "mcp-forwarding": {
      if (!cfg.mcp_endpoint) {
        throw new Error(
          `Specialist "${cfg.agent_id}" has tier:"mcp-forwarding" but mcp_endpoint is not set.`,
        );
      }
      // If an API key env var is declared but the env var is absent at
      // runtime, return a "decline loudly" runner — no silent mock fallback.
      if (cfg.mcp_api_key_env && !process.env[cfg.mcp_api_key_env]) {
        const missingKey = cfg.mcp_api_key_env;
        const agentId = cfg.agent_id;
        console.warn(
          `[arbor] specialist "${agentId}": env var ${missingKey} is not set — runner will decline all bids loudly.`,
        );
        return {
          config: cfg,
          async bid() {
            return {
              decline: true,
              reason: `${agentId} requires ${missingKey} to be set; the env var is missing so this specialist cannot execute tasks.`,
            };
          },
          async execute() {
            throw new Error(
              `${agentId} cannot execute: ${missingKey} is not configured.`,
            );
          },
        };
      }
      return makeMcpForwardingSpecialist(cfg);
    }

    case "a2a": {
      if (!cfg.a2a_endpoint) {
        throw new Error(
          `Specialist "${cfg.agent_id}" has tier:"a2a" but a2a_endpoint is not set.`,
        );
      }
      return makeA2aForwardingSpecialist(cfg);
    }

    case "a2a-bridge": {
      if (cfg.agent_id === "devin-engineer") {
        return makeDevinMcpBridgeSpecialist(cfg);
      }
      throw new Error(
        `Specialist "${cfg.agent_id}" has tier:"a2a-bridge" but no bridge runner is registered.`,
      );
    }

    case "openrouter": {
      return makeOpenRouterSpecialist(cfg);
    }

    case "mock": {
      // Explicit opt-in only.
      return makeMockSpecialist(cfg);
    }

    case "disabled": {
      // Should never reach here — disabled specialists are filtered out of SPECIALISTS.
      throw new Error(
        `Specialist "${cfg.agent_id}" is disabled and should never be dispatched.`,
      );
    }

    default: {
      const exhaustive: never = cfg.tier;
      throw new Error(`Unknown tier "${exhaustive}" on specialist "${cfg.agent_id}"`);
    }
  }
}

export function getRunner(agent_id: AgentId): SpecialistRunner {
  const runner = SPECIALIST_RUNNERS[agent_id];
  if (runner) return runner;
  const cfg =
    ALL_STATIC_SPECIALISTS.find((s) => s.agent_id === agent_id) ??
    DISCOVERED.get(agent_id);
  if (!cfg) throw new Error(`No specialist runner registered for ${agent_id}`);
  return buildRunner(cfg);
}
