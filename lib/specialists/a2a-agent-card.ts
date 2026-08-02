/**
 * A2A agent-card discovery and auth resolution.
 *
 * Fetches the standard A2A agent card — `/.well-known/agent-card.json` per
 * A2A v0.3.0, falling back to the legacy v0.2.x `/.well-known/agent.json` —
 * or an explicit override URL. Inspects its `security` / `securitySchemes`
 * fields and returns a typed `ResolvedAuth` so the outbound runner can attach
 * the right headers — or decline loud when credentials are missing.
 *
 * Two-level cache:
 *   - `cardCache` (Map<endpoint, {card, fetchedAt}>): resolved cards, TTL 10 min.
 *   - `inFlight`  (Map<endpoint, Promise<AgentCard>>): dedupes concurrent fetches
 *     for the same endpoint so N simultaneous bids don't hammer the card URL.
 *
 * Fetch policy: lazy — first bid for a given endpoint triggers the fetch; not
 * at module load, so a missing/misconfigured card URL doesn't break startup.
 */

import type { SpecialistConfig } from "../types";

// ─── A2A agent-card types (minimal spec subset) ───────────────────────────

/** Security scheme as declared in the agent card's `securitySchemes` map. */
export interface AgentCardSecurityScheme {
  type: string;
  /** Present when type === "http". Usually "bearer". */
  scheme?: string;
  /** Present when type === "apiKey". Usually "header". */
  in?: string;
  /** Present when type === "apiKey". The header name to use. */
  name?: string;
  /** Present when type === "oauth2". We don't implement this — decline. */
  flows?: unknown;
}

/** Top-level agent card. Only the fields relevant to auth are typed. */
export interface AgentCard {
  name?: string;
  /**
   * Array of requirement objects. Each object maps a scheme name to a list of
   * required scopes (usually []). An empty array means "no auth required".
   */
  security?: Array<Record<string, string[]>>;
  /** Map from scheme name → scheme definition. */
  securitySchemes?: Record<string, AgentCardSecurityScheme>;
  /** Catch-all for other fields we don't need to inspect. */
  [key: string]: unknown;
}

// ─── Auth resolution result ───────────────────────────────────────────────

export type ResolvedAuth =
  | { kind: "none" }
  | { kind: "bearer"; token: string; envVar: string }
  | { kind: "api-key"; token: string; envVar: string; headerName: string }
  | { kind: "decline"; reason: string };

// ─── constants ────────────────────────────────────────────────────────────

const CARD_TTL_MS = 10 * 60 * 1_000; // 10 minutes
const CARD_FETCH_TIMEOUT_MS = 5_000;
const CARD_FETCH_ATTEMPTS = 2;

// ─── module-level caches ──────────────────────────────────────────────────

/** Resolved card cache — keyed by the card fetch URL (not the A2A endpoint). */
const cardCache = new Map<string, { card: AgentCard; fetchedAt: number }>();

/** In-flight dedupe — keyed by the same card fetch URL. */
const inFlight = new Map<string, Promise<AgentCard>>();

/**
 * Which well-known path won for a given origin. Once an origin resolves via
 * agent-card.json (or the legacy fallback), later calls skip the probe order
 * and go straight to the winner — a v0.2.x server isn't re-probed at the
 * v0.3.0 path on every bid.
 */
const resolvedCardUrlByOrigin = new Map<string, string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(cardUrl: string): number {
  let hash = 0;
  for (const char of cardUrl) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 150 + (hash % 200);
}

function isRetryableCardError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = /^HTTP (\d{3})\b/.exec(message)?.[1];
  if (!status) return true;
  const code = Number(status);
  return code === 408 || code === 429 || code >= 500;
}

// ─── helpers ──────────────────────────────────────────────────────────────

/** 6-line timeout wrapper (same shape as the one in a2a-forwarding.ts). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label}: timeout after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Candidate well-known card URLs for an endpoint origin, in probe order:
 * the A2A v0.3.0 path first, then the legacy v0.2.x path.
 */
function candidateCardUrls(a2aEndpoint: string): string[] {
  const origin = new URL(a2aEndpoint).origin;
  return [
    `${origin}/.well-known/agent-card.json`,
    `${origin}/.well-known/agent.json`,
  ];
}

// ─── public API ───────────────────────────────────────────────────────────

/**
 * Fetch the agent card for `endpoint`.  Uses `explicitUrl` when provided,
 * otherwise probes `${origin}/.well-known/agent-card.json` (A2A v0.3.0)
 * and falls back to `${origin}/.well-known/agent.json` (v0.2.x).
 *
 * Results are cached per card URL for CARD_TTL_MS.  Concurrent fetches to
 * the same URL are coalesced via `inFlight`.  The winning well-known path
 * per origin is remembered so fallback probing happens at most once.
 */
export async function fetchAgentCard(
  endpoint: string,
  explicitUrl?: string,
): Promise<AgentCard> {
  if (explicitUrl) {
    return fetchCardAtUrl(explicitUrl);
  }

  const origin = new URL(endpoint).origin;
  const known = resolvedCardUrlByOrigin.get(origin);
  if (known) {
    return fetchCardAtUrl(known);
  }

  let lastError: unknown;
  for (const cardUrl of candidateCardUrls(endpoint)) {
    try {
      const card = await fetchCardAtUrl(cardUrl);
      resolvedCardUrlByOrigin.set(origin, cardUrl);
      return card;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`no agent card found for ${origin}`);
}

/** Single-URL fetch with TTL cache + in-flight dedup. */
async function fetchCardAtUrl(cardUrl: string): Promise<AgentCard> {
  // Cache hit?
  const cached = cardCache.get(cardUrl);
  if (cached && Date.now() - cached.fetchedAt < CARD_TTL_MS) {
    if (process.env.DEBUG_A2A_DISCOVERY === "1") {
      console.info(`[a2a-agent-card] cache hit for ${cardUrl}`);
    }
    return cached.card;
  }

  // In-flight dedupe?
  const existing = inFlight.get(cardUrl);
  if (existing) {
    if (process.env.DEBUG_A2A_DISCOVERY === "1") {
      console.info(`[a2a-agent-card] joining in-flight fetch for ${cardUrl}`);
    }
    return existing;
  }

  // New fetch — register promise before awaiting so concurrent callers join it.
  const promise = (async (): Promise<AgentCard> => {
    try {
      let lastError: unknown;
      for (let attempt = 1; attempt <= CARD_FETCH_ATTEMPTS; attempt++) {
        try {
          if (process.env.DEBUG_A2A_DISCOVERY === "1") {
            console.info(
              `[a2a-agent-card] fetching card from ${cardUrl} attempt=${attempt}`,
            );
          }
          const res = await withTimeout(
            fetch(cardUrl, {
              method: "GET",
              headers: { accept: "application/json" },
            }),
            CARD_FETCH_TIMEOUT_MS,
            `fetchAgentCard(${cardUrl})`,
          );
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} from ${cardUrl}`);
          }
          const card = (await res.json()) as AgentCard;
          // Populate cache after successful parse.
          cardCache.set(cardUrl, { card, fetchedAt: Date.now() });
          return card;
        } catch (err) {
          lastError = err;
          if (
            attempt === CARD_FETCH_ATTEMPTS ||
            !isRetryableCardError(err)
          ) {
            throw err;
          }
          await sleep(retryDelayMs(cardUrl));
        }
      }
      throw lastError;
    } finally {
      inFlight.delete(cardUrl);
    }
  })();

  inFlight.set(cardUrl, promise);
  return promise;
}

/**
 * Pure function — inspects the card's security declaration and the specialist
 * config to determine what auth headers (if any) to attach to outbound calls.
 *
 * Never throws. Unknown or unsupported shapes return `{ kind: "decline" }`.
 */
export function resolveAuth(card: AgentCard, cfg: SpecialistConfig): ResolvedAuth {
  try {
    const security = card.security;
    const schemes = card.securitySchemes ?? {};

    // No security declared at all → keyless connection.
    if (!security || security.length === 0) {
      return { kind: "none" };
    }

    // Empty securitySchemes map with non-empty security list is unusual; treat
    // it as "no auth" so we don't silently block keyless endpoints.
    if (Object.keys(schemes).length === 0) {
      return { kind: "none" };
    }

    // Inspect the first security requirement object.
    const firstRequirement = security[0];
    const schemeNames = Object.keys(firstRequirement);
    if (schemeNames.length === 0) {
      // {} in the security array means "no auth" per the OpenAPI / A2A spec.
      return { kind: "none" };
    }

    const schemeName = schemeNames[0];
    const scheme = schemes[schemeName];
    if (!scheme) {
      return {
        kind: "decline",
        reason: `security references unknown scheme "${schemeName}"`,
      };
    }

    const type = scheme.type;

    if (type === "http" && scheme.scheme?.toLowerCase() === "bearer") {
      const envVar = cfg.a2a_api_key_env;
      if (!envVar) {
        return {
          kind: "decline",
          reason: `bearer auth required; a2a_api_key_env not configured on ${cfg.agent_id}`,
        };
      }
      const token = process.env[envVar]?.trim();
      if (!token) {
        return {
          kind: "decline",
          reason: `bearer auth required; env var ${envVar} not set`,
        };
      }
      return { kind: "bearer", token, envVar };
    }

    if (type === "apiKey" && scheme.in === "header") {
      const headerName = scheme.name;
      if (!headerName) {
        return {
          kind: "decline",
          reason: `apiKey scheme missing "name" field (header name)`,
        };
      }
      const envVar = cfg.a2a_api_key_env;
      if (!envVar) {
        return {
          kind: "decline",
          reason: `api-key auth required (${headerName}); a2a_api_key_env not configured on ${cfg.agent_id}`,
        };
      }
      const token = process.env[envVar]?.trim();
      if (!token) {
        return {
          kind: "decline",
          reason: `api-key auth required (${headerName}); env var ${envVar} not set`,
        };
      }
      return { kind: "api-key", token, envVar, headerName };
    }

    if (type === "oauth2" || type === "mutualTLS" || type === "openIdConnect") {
      return { kind: "decline", reason: `scheme not yet supported: ${type}` };
    }

    // Anything else (custom types, etc.) — decline rather than proceeding blind.
    return { kind: "decline", reason: `scheme not yet supported: ${type}` };
  } catch {
    // resolveAuth must never throw — catch anything and decline.
    return { kind: "decline", reason: "unparseable security block" };
  }
}

/**
 * Combined helper: fetch the agent card (with cache), then resolve auth.
 * On any fetch/parse failure, returns `{ kind: "decline" }` — fail closed.
 *
 * Use this at the top of `bid` and `execute` in the A2A runner.
 */
export async function getAuthForEndpoint(
  endpoint: string,
  cfg: SpecialistConfig,
): Promise<ResolvedAuth> {
  // Operator override: the server was verified to NOT enforce the auth its
  // card declares — skip card resolution entirely and call keyless.
  if (cfg.a2a_auth_mode === "none") {
    return { kind: "none" };
  }
  try {
    const card = await fetchAgentCard(endpoint, cfg.a2a_agent_card_url);
    return resolveAuth(card, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "decline",
      reason: `agent card unreachable: ${msg.slice(0, 300)}`,
    };
  }
}
