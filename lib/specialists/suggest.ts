/**
 * Score available specialists against a free-form user query so the UI can
 * surface the best matches before the auction is even opened. Used to answer
 * questions like "who can set up Stripe Connect for my marketplace?" without
 * forcing the user to read the full registry.
 *
 * The candidate pool is the live registry **plus** the curated MCP catalog
 * (Stripe, Notion, GitHub, Linear, Vercel, Supabase, Sentry, Atlassian, Neon,
 * Figma, etc.). Catalog entries are surfaced in suggestions even though they
 * haven't been formally registered yet, so the user sees a real-MCP option
 * before having to click Discover.
 */

import { callOpenAIJSON } from "../openai";
import type { SpecialistConfig } from "../types";
import { MCP_CATALOG, type CatalogEntry } from "./catalog";

export interface SpecialistSuggestion {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  fit_score: number;
  fit_reasoning: string;
  discovered: boolean;
  discovery_source?: "google" | "catalog" | "registry" | "synthesized" | "a2a";
  /** Real MCP endpoint backing this specialist, if any. */
  mcp_endpoint?: string;
  homepage_url?: string;
  /**
   * True if this suggestion isn't formally enrolled in the marketplace yet —
   * it's a catalog entry the suggester pulled in for ranking. Calling
   * `discover_specialist` with the same prompt enrolls it.
   */
  enrollable: boolean;
  /** Capability fit before reputation blending (0..1). Equals fit_score when no reputation. */
  base_fit_score?: number;
  /** Reputation-adjusted score actually used for ordering (0..1+). */
  adjusted_score?: number;
  /** Mean judged `overall` reputation (0..1) from real completed tasks, if any. */
  reputation_overall?: number;
  /** Number of real judged tasks backing the reputation (confidence). */
  reputation_tasks?: number;
}

/**
 * Per-agent reputation derived from REAL judged task outcomes
 * (convex `reputation_dimensions`). Passed into routing so specialists that
 * actually performed well rank higher — closing the effectiveness loop the
 * auction/judge already produces but routing historically ignored.
 */
export type ReputationMap = Record<
  string,
  { overall: number; tasks: number }
>;

export interface SuggestResult {
  query: string;
  suggestions: SpecialistSuggestion[];
  best_fit_score: number;
  low_confidence: boolean;
  recommend_discovery: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.55;

/**
 * Reputation blend tuning. Reward-only by design: proven specialists get boosted
 * up to +ALPHA, unproven ones (0 tasks) are untouched, so cold-start and the
 * live demo behave exactly as before. Reputation acts as a tiebreaker among
 * comparable capability fits — it never lets a weak-fit agent leapfrog a clearly
 * better-fit one (0.4 * 1.35 < 0.9).
 */
const REP_ALPHA = 0.35; // max multiplicative boost at full reputation + confidence
const REP_CONF_K = 3; // judged-task count at which confidence reaches 0.5

/** Reward-only reputation multiplier bonus in [0, REP_ALPHA]. */
function reputationBonus(stat: { overall: number; tasks: number } | undefined): number {
  if (!stat || stat.tasks <= 0) return 0;
  const confidence = stat.tasks / (stat.tasks + REP_CONF_K); // 0..1, grows with evidence
  return REP_ALPHA * confidence * clamp01(stat.overall);
}

interface RankedItem {
  agent_id: string;
  fit_score: number;
  fit_reasoning: string;
}

interface RankResponse {
  ranked: RankedItem[];
}

/** The ranker names only its top picks; asking for every agent overflowed maxTokens. */
export const RANK_LIMIT = 8;

export const RANK_SYSTEM_PROMPT = `You are the routing layer of a general-purpose marketplace where specialist agents bid on any kind of work — payments, design, code, research, marketing, data, ops, anything. The user describes a goal in plain language; you score how well each available specialist agent fits the goal.

Hard rules:
1. Read the user's goal LITERALLY. If they say "set up Stripe" the goal is payments — not marketing, not creator outreach. Don't infer adjacent intents.
2. Score by capability match only. Ignore sponsor brand recognition and how many agents of a given category are in the list. Do NOT factor in reputation or track record — the system blends real judged reputation in separately, after your scoring.
3. Cross-domain bias is a bug. A creator-marketing specialist scoring above 0.3 for a payments task is wrong. A code/engineering agent scoring above 0.3 for a design task is wrong. Be willing to give very low scores (0.0–0.2) to most of the list.
4. Real MCP-equipped specialists (those with an mcp_endpoint) outscore generic LLM personas at the same nominal fit, because they can actually call the right product's API.

Use only the capabilities, sponsor, one_liner, and tags you are shown. Never invent capabilities. Decline to inflate any agent's score because they have a strong-sounding name.

Output JSON only with shape:
{ "ranked": [ { "agent_id": "<id>", "fit_score": <0..1>, "fit_reasoning": "<one short sentence describing the actual capability match>" }, ... ] }
Score 1.0 = directly built for this goal. 0.5 = tangentially relevant. 0.1 = unrelated. List only the ${RANK_LIMIT} best-fitting agents, best first, each at most once; every agent you leave out is treated as unrelated.`;

function describeSpec(spec: CandidateSpec): string {
  return [
    `agent_id: ${spec.agent_id}`,
    `sponsor: ${spec.sponsor}`,
    spec.mcp_endpoint
      ? `real_mcp: yes (${spec.mcp_endpoint})`
      : `real_mcp: no`,
    `capabilities: ${spec.capabilities.join(", ")}`,
    `one_liner: ${spec.one_liner}`,
    spec.tags && spec.tags.length > 0 ? `tags: ${spec.tags.join(", ")}` : null,
    spec.note ? `note: ${spec.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

interface CandidateSpec {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  mcp_endpoint?: string;
  homepage_url?: string;
  discovered: boolean;
  discovery_source?: "google" | "catalog" | "registry" | "synthesized" | "a2a";
  enrollable: boolean;
  tags?: string[];
  note?: string;
}

function specToCandidate(spec: SpecialistConfig): CandidateSpec {
  return {
    agent_id: spec.agent_id,
    display_name: spec.display_name,
    sponsor: spec.sponsor,
    one_liner: spec.one_liner,
    capabilities: spec.capabilities,
    cost_baseline: spec.cost_baseline,
    mcp_endpoint: spec.mcp_endpoint,
    homepage_url: spec.homepage_url,
    discovered: !!spec.discovered,
    discovery_source: spec.discovery_source,
    enrollable: false,
    note: spec.discovered
      ? `runtime-discovered (${spec.discovered_for ?? ""})`
      : undefined,
  };
}

function catalogToCandidate(entry: CatalogEntry): CandidateSpec {
  return {
    agent_id: entry.agent_id,
    display_name: entry.display_name,
    sponsor: entry.sponsor,
    one_liner: entry.one_liner,
    capabilities: entry.capabilities,
    cost_baseline: entry.cost_baseline,
    mcp_endpoint: entry.mcp_endpoint,
    homepage_url: entry.homepage_url,
    discovered: true,
    discovery_source: "catalog",
    enrollable: true,
    tags: entry.domain_tags,
    note: "catalog entry — auto-enrolls when picked",
  };
}

function buildCandidatePool(specs: SpecialistConfig[]): CandidateSpec[] {
  const pool: CandidateSpec[] = specs.map(specToCandidate);
  const taken = new Set(pool.map((c) => c.agent_id));
  for (const entry of MCP_CATALOG) {
    if (taken.has(entry.agent_id)) continue;
    pool.push(catalogToCandidate(entry));
    taken.add(entry.agent_id);
  }
  return pool;
}

async function rankWithLLM(
  query: string,
  taskType: string | undefined,
  pool: CandidateSpec[],
): Promise<RankedItem[]> {
  if (pool.length === 0) return [];
  const userPrompt = [
    `User goal:\n${query.trim()}`,
    taskType && taskType !== "general"
      ? `Workflow hint: ${taskType}`
      : null,
    "Available specialists:",
    pool.map(describeSpec).join("\n---\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const data = await callOpenAIJSON<RankResponse>({
      systemPrompt: RANK_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1200,
      timeoutMs: 18_000,
      retries: 0,
      purpose: "suggester",
    });
    if (!Array.isArray(data.ranked)) {
      console.warn(
        "[suggest] LLM ranker returned non-array; falling back to keyword rank.",
      );
      return [];
    }
    return data.ranked
      .map((r) => ({
        agent_id: String(r.agent_id),
        fit_score: clamp01(Number(r.fit_score)),
        fit_reasoning:
          typeof r.fit_reasoning === "string" && r.fit_reasoning.trim()
            ? r.fit_reasoning.trim()
            : "no rationale provided",
      }))
      .filter((r) => pool.some((s) => s.agent_id === r.agent_id));
  } catch (err) {
    console.warn(
      "[suggest] LLM ranker failed; falling back to keyword rank:",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Words too common to identify a sponsor or carry topical overlap. */
const GENERIC_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "your", "our",
  "open", "data", "labs", "team", "project", "agent", "agents", "tools",
  "foundation", "inc", "company", "community", "global", "digital", "cloud",
]);

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** True when `phrase` occurs in `haystack` as whole consecutive words. */
function hasPhrase(haystack: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0) return false;
  for (let start = 0; start + phrase.length <= haystack.length; start += 1) {
    if (phrase.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

/**
 * A sponsor is mentioned when its full name appears, or its first word does
 * and that word is distinctive ("stripe" yes; "the", "acc", "open" no).
 */
function mentionsSponsor(queryWords: readonly string[], sponsor: string): boolean {
  const name = words(sponsor.replace(/\(.*?\)/g, " "));
  if (hasPhrase(queryWords, name)) return true;
  const root = name[0];
  return !!root && root.length >= 4 && !GENERIC_WORDS.has(root) && queryWords.includes(root);
}

/**
 * Keyword fallback used when the LLM ranker fails. Cheap heuristic, but
 * meaningful: a direct sponsor-name or capability-tag match in the prompt
 * is treated as a strong signal, so "set up stripe" pulls stripe-payments
 * to the top even when the LLM call dies. Matching is by whole words, so
 * "Fibonacci" does not mention "ACC Foundation".
 */
export function fallbackKeywordRank(
  query: string,
  pool: CandidateSpec[],
): RankedItem[] {
  const queryWords = words(query);
  const tokens = queryWords.filter((t) => t.length > 2 && !GENERIC_WORDS.has(t));
  return pool.map((s) => {
    const reasons: string[] = [];
    // Direct sponsor-name match — by far the strongest signal.
    const sponsorScore = mentionsSponsor(queryWords, s.sponsor) ? 0.85 : 0;
    if (sponsorScore) reasons.push(`mentions ${s.sponsor}`);
    // Domain-tag matches (e.g. "payments", "design") count strongly.
    const tagHits = countTagHits(queryWords, [...s.capabilities, ...(s.tags ?? [])]);
    if (tagHits) reasons.push(`${tagHits} capability/tag match`);
    // Generic token overlap with the one-liner — weakest signal.
    const oneLiner = new Set(words(s.one_liner));
    const oneLinerHits = new Set(tokens.filter((t) => oneLiner.has(t))).size;

    const score = sponsorScore + Math.min(0.4, 0.18 * tagHits) + Math.min(0.15, 0.04 * oneLinerHits);
    if (score === 0) reasons.push("no keyword overlap");
    return {
      agent_id: s.agent_id,
      fit_score: clamp01(score),
      fit_reasoning: reasons.join(" · "),
    };
  });
}

function countTagHits(queryWords: readonly string[], tags: readonly string[]): number {
  const distinct = new Set(tags.map((tag) => tag.toLowerCase()).filter((tag) => tag.length > 2));
  return [...distinct].filter((tag) => hasPhrase(queryWords, words(tag))).length;
}

export async function suggestSpecialists(
  query: string,
  taskType: string | undefined,
  specs: SpecialistConfig[],
  topN = 3,
  /** Real judged reputation per agent_id. Empty/omitted → identical to the
   *  pre-reputation behavior (protects cold-start and the live demo). */
  reputation: ReputationMap = {},
): Promise<SuggestResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query: trimmed,
      suggestions: [],
      best_fit_score: 0,
      low_confidence: true,
      recommend_discovery: false,
    };
  }

  const pool = buildCandidatePool(specs);

  let ranked: RankedItem[];
  try {
    ranked = await rankWithLLM(trimmed, taskType, pool);
  } catch {
    ranked = fallbackKeywordRank(trimmed, pool);
  }
  if (ranked.length === 0) ranked = fallbackKeywordRank(trimmed, pool);

  const byId = new Map(pool.map((c) => [c.agent_id, c]));
  const suggestions: SpecialistSuggestion[] = [];
  for (const r of ranked) {
    const c = byId.get(r.agent_id);
    if (!c) continue;
    // Capability fit is the LLM/keyword score; reputation (from real judged
    // outcomes) is blended in here as a reward-only multiplier so the ranker
    // stays a pure capability matcher and the effectiveness loop closes in code.
    const stat = reputation[c.agent_id];
    const baseFit = r.fit_score;
    const adjusted = baseFit * (1 + reputationBonus(stat));
    suggestions.push({
      agent_id: c.agent_id,
      display_name: c.display_name,
      sponsor: c.sponsor,
      one_liner: c.one_liner,
      capabilities: c.capabilities,
      cost_baseline: c.cost_baseline,
      fit_score: r.fit_score,
      fit_reasoning: r.fit_reasoning,
      discovered: c.discovered,
      discovery_source: c.discovery_source,
      mcp_endpoint: c.mcp_endpoint,
      homepage_url: c.homepage_url,
      enrollable: c.enrollable,
      base_fit_score: baseFit,
      adjusted_score: adjusted,
      reputation_overall: stat?.overall,
      reputation_tasks: stat?.tasks,
    });
  }
  // Rank by the reputation-adjusted score; capability fit breaks ties.
  suggestions.sort(
    (a, b) =>
      (b.adjusted_score ?? b.fit_score) - (a.adjusted_score ?? a.fit_score) ||
      b.fit_score - a.fit_score,
  );
  suggestions.length = Math.min(suggestions.length, topN);

  // Confidence is about capability fit (not reputation): is there any strong
  // capability match at all? Use the best capability fit among the shortlist.
  const best_fit_score = suggestions.reduce(
    (max, s) => Math.max(max, s.fit_score),
    0,
  );
  const low_confidence = best_fit_score < LOW_CONFIDENCE_THRESHOLD;
  // Only push the user toward Discover (LLM-synth) when even the catalog/
  // registry roster has nothing strong — i.e. no real MCP fits.
  const bestRealFit = suggestions
    .filter((s) => !!s.mcp_endpoint)
    .reduce((max, s) => Math.max(max, s.fit_score), 0);
  const recommend_discovery =
    low_confidence && bestRealFit < LOW_CONFIDENCE_THRESHOLD;
  return {
    query: trimmed,
    suggestions,
    best_fit_score,
    low_confidence,
    recommend_discovery,
  };
}
