// Token accounting for model calls. Pure — no I/O, no Convex.
//
// Why this exists: before this module, nothing in the repo read `usage` off a
// model response. lib/anthropic.ts and lib/openai.ts sent max_tokens and threw
// the token counts away, so every dollar figure in the product was derived from
// bid prices rather than from measured spend. `ValueImpactPanel` in particular
// reported "you saved" as (max_budget - price_paid), which is budget headroom
// chosen by the user, not a cost saving.
//
// Provider asymmetries this has to model, because they change the arithmetic:
//   - Anthropic splits input into fresh / cache-write / cache-read, and cache
//     reads bill at 0.1x base input. Arbor re-sends near-identical specialist
//     system prompts on every solicitation, so cache reads dominate its input
//     spend once caching is on.
//   - OpenAI bills reasoning tokens as OUTPUT while never showing them. A
//     reasoning-heavy call can cost many times its visible completion.
// Ignoring either one understates cost, and understated cost inflates "savings".

/** Normalized token counts for one model call. Absent fields mean the provider
 * did not report that category, which is different from reporting zero. */
export interface TokenUsage {
  /** Input tokens billed at the base rate (cache-miss / uncached). */
  input_tokens: number;
  output_tokens: number;
  /** Anthropic: tokens written to the cache. Billed above base input. */
  cache_write_tokens?: number;
  /** Anthropic cache_read_input_tokens / OpenAI cached_tokens. Billed below base. */
  cache_read_tokens?: number;
  /** OpenAI reasoning tokens. Already counted inside output_tokens by the
   * provider; carried separately for attribution, NOT added again when costing. */
  reasoning_tokens?: number;
}

export interface ModelPrice {
  /** USD per million input tokens. */
  input_per_mtok: number;
  /** USD per million output tokens. */
  output_per_mtok: number;
  /** Multiplier on input price for cache writes. Anthropic 5-minute TTL = 1.25. */
  cache_write_multiplier: number;
  /** Multiplier on input price for cache reads. Anthropic = 0.1. */
  cache_read_multiplier: number;
}

const ANTHROPIC_CACHE_WRITE_MULTIPLIER = 1.25;
const ANTHROPIC_CACHE_READ_MULTIPLIER = 0.1;

function anthropicPrice(input: number, output: number): ModelPrice {
  return {
    input_per_mtok: input,
    output_per_mtok: output,
    cache_write_multiplier: ANTHROPIC_CACHE_WRITE_MULTIPLIER,
    cache_read_multiplier: ANTHROPIC_CACHE_READ_MULTIPLIER,
  };
}

/** OpenAI does not charge a cache-write premium; cached input is discounted. */
function openAIPrice(
  input: number,
  output: number,
  cacheReadMultiplier = 0.25,
): ModelPrice {
  return {
    input_per_mtok: input,
    output_per_mtok: output,
    cache_write_multiplier: 1,
    cache_read_multiplier: cacheReadMultiplier,
  };
}

/**
 * Published list prices, USD per million tokens. Keys are matched by longest
 * prefix so dated snapshots (`claude-opus-5-20260514`) resolve to their family.
 *
 * These are list prices, not an invoice. Anything shown to a user as a measured
 * cost must say it is computed from list price.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": anthropicPrice(5, 25),
  "claude-fable-5": anthropicPrice(5, 25),
  "claude-sonnet-5": anthropicPrice(3, 15),
  "claude-haiku-4-5": anthropicPrice(1, 5),
  "gpt-5.2": openAIPrice(1.25, 10),
  "gpt-5": openAIPrice(1.25, 10),
  "gpt-4o": openAIPrice(2.5, 10),
  "gpt-4o-mini": openAIPrice(0.15, 0.6),
  "o4-mini": openAIPrice(1.1, 4.4),
};

/** Longest-prefix lookup. Returns undefined for unknown models so callers can
 * record "cost unknown" instead of silently costing the call at $0. */
export function priceForModel(model: string): ModelPrice | undefined {
  const key = model.trim().toLowerCase();
  let best: string | undefined;
  for (const candidate of Object.keys(MODEL_PRICES)) {
    if (key.startsWith(candidate) && (!best || candidate.length > best.length)) {
      best = candidate;
    }
  }
  return best ? MODEL_PRICES[best] : undefined;
}

const PER_MTOK = 1_000_000;

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;
}

/**
 * USD cost of one call. Returns undefined when the model has no known price —
 * the caller must surface that rather than treat the call as free.
 *
 * reasoning_tokens is deliberately NOT added: providers already include it in
 * output_tokens, so adding it would double-bill.
 */
export function costOfUsage(
  usage: TokenUsage,
  model: string,
  price: ModelPrice | undefined = priceForModel(model),
): number | undefined {
  if (!price) return undefined;
  const input = nonNegative(usage.input_tokens);
  const output = nonNegative(usage.output_tokens);
  const write = nonNegative(usage.cache_write_tokens);
  const read = nonNegative(usage.cache_read_tokens);
  const dollars =
    (input * price.input_per_mtok +
      write * price.input_per_mtok * price.cache_write_multiplier +
      read * price.input_per_mtok * price.cache_read_multiplier +
      output * price.output_per_mtok) /
    PER_MTOK;
  return dollars;
}

/** Total input tokens the provider processed, cached or not. */
export function totalInputTokens(usage: TokenUsage): number {
  return (
    nonNegative(usage.input_tokens) +
    nonNegative(usage.cache_write_tokens) +
    nonNegative(usage.cache_read_tokens)
  );
}

/** Fraction of input served from cache, 0..1. Undefined when there was no input,
 * because 0/0 is not "no cache hits" — it is "no data". */
export function cacheHitRate(usage: TokenUsage): number | undefined {
  const total = totalInputTokens(usage);
  if (total <= 0) return undefined;
  return nonNegative(usage.cache_read_tokens) / total;
}

// ─── Provider response parsing ───────────────────────────────────────────────

interface AnthropicUsageShape {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Parse Anthropic's `usage`. Returns undefined when the block is absent so a
 * missing field is never recorded as a zero-cost call. */
export function parseAnthropicUsage(
  body: unknown,
): TokenUsage | undefined {
  const usage = (body as AnthropicUsageShape | null)?.usage;
  if (!usage) return undefined;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined;
  const parsed: TokenUsage = {
    input_tokens: nonNegative(input),
    output_tokens: nonNegative(output),
  };
  if (Number.isFinite(usage.cache_creation_input_tokens)) {
    parsed.cache_write_tokens = nonNegative(usage.cache_creation_input_tokens);
  }
  if (Number.isFinite(usage.cache_read_input_tokens)) {
    parsed.cache_read_tokens = nonNegative(usage.cache_read_input_tokens);
  }
  return parsed;
}

interface OpenAIUsageShape {
  usage?: {
    // Chat Completions
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    // Responses API
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

/**
 * Parse OpenAI's `usage`, covering both Chat Completions (`prompt_tokens`) and
 * the Responses API (`input_tokens`). Cached input is reported inside the input
 * total, so it is subtracted out into `cache_read_tokens` to avoid billing those
 * tokens at the full rate.
 */
export function parseOpenAIUsage(body: unknown): TokenUsage | undefined {
  const usage = (body as OpenAIUsageShape | null)?.usage;
  if (!usage) return undefined;
  const rawInput = Number.isFinite(usage.prompt_tokens)
    ? usage.prompt_tokens
    : usage.input_tokens;
  const rawOutput = Number.isFinite(usage.completion_tokens)
    ? usage.completion_tokens
    : usage.output_tokens;
  if (!Number.isFinite(rawInput) && !Number.isFinite(rawOutput)) return undefined;

  const cached = nonNegative(
    usage.prompt_tokens_details?.cached_tokens ??
      usage.input_tokens_details?.cached_tokens,
  );
  const reasoning = nonNegative(
    usage.completion_tokens_details?.reasoning_tokens ??
      usage.output_tokens_details?.reasoning_tokens,
  );

  const total = nonNegative(rawInput);
  const parsed: TokenUsage = {
    // Cached tokens are included in the reported input total; split them out so
    // each part bills at its own rate.
    input_tokens: Math.max(0, total - cached),
    output_tokens: nonNegative(rawOutput),
  };
  if (cached > 0) parsed.cache_read_tokens = cached;
  if (reasoning > 0) parsed.reasoning_tokens = reasoning;
  return parsed;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

// ─── Recording hook ──────────────────────────────────────────────────────────
//
// The provider clients (lib/anthropic.ts, lib/openai.ts) fall back across
// providers with early returns, so threading a usage value up through every
// return path would touch each branch. Instead they report into this hook at the
// point the response body is parsed.
//
// Concurrency: this is module state, so ONE observer belongs to one logical unit
// of work. That matches the architecture — a Convex action handles a single task
// or DAG node — but do NOT wrap two concurrently-awaited operations in separate
// `collectUsage` calls inside the same isolate: their records would interleave.

export type UsageObserver = (record: LlmCallRecord) => void;

let activeObserver: UsageObserver | undefined;

export function setUsageObserver(observer: UsageObserver | undefined): void {
  activeObserver = observer;
}

/** Called by the provider clients. Never throws: a broken observer must not fail
 * the model call it is only measuring. */
export function recordLlmCall(record: LlmCallRecord): void {
  if (!activeObserver) return;
  try {
    activeObserver(record);
  } catch {
    // Accounting is strictly observational.
  }
}

/**
 * Run `fn` while collecting every model call it makes. Restores the previous
 * observer afterwards, including on throw. See the concurrency note above.
 */
export async function collectUsage<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; records: LlmCallRecord[]; totals: UsageTotals }> {
  const previous = activeObserver;
  const records: LlmCallRecord[] = [];
  activeObserver = (record) => records.push(record);
  try {
    const result = await fn();
    return { result, records, totals: sumUsage(records) };
  } finally {
    activeObserver = previous;
  }
}

/** One recorded model call. `cost_usd` is undefined when the model is unpriced. */
export interface LlmCallRecord {
  provider: string;
  model: string;
  usage: TokenUsage;
  cost_usd?: number;
  duration_ms?: number;
  /** Where the call came from, e.g. "judge" | "planner" | "bid". */
  phase?: string;
  agent_id?: string;
}

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  /** Calls whose model had no known price. If this is > 0, `cost_usd` is a
   * LOWER BOUND and must be labelled as such — never shown as exact. */
  unpriced_calls: number;
}

export function emptyUsageTotals(): UsageTotals {
  return {
    calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    cost_usd: 0,
    unpriced_calls: 0,
  };
}

export function sumUsage(records: LlmCallRecord[]): UsageTotals {
  const totals = emptyUsageTotals();
  for (const record of records) {
    totals.calls += 1;
    totals.input_tokens += nonNegative(record.usage.input_tokens);
    totals.output_tokens += nonNegative(record.usage.output_tokens);
    totals.cache_read_tokens += nonNegative(record.usage.cache_read_tokens);
    totals.cache_write_tokens += nonNegative(record.usage.cache_write_tokens);
    totals.reasoning_tokens += nonNegative(record.usage.reasoning_tokens);
    if (record.cost_usd === undefined) totals.unpriced_calls += 1;
    else totals.cost_usd += record.cost_usd;
  }
  totals.cost_usd = Number(totals.cost_usd.toFixed(6));
  return totals;
}

/**
 * What the same token volume would have cost on a single reference model — the
 * counterfactual baseline behind "you saved X". Returns undefined when the
 * reference model is unpriced, so the UI can say "baseline unavailable" instead
 * of printing a fabricated comparison.
 *
 * This deliberately reprices the OBSERVED tokens rather than guessing what a
 * different model would have generated. It answers "what did routing save on
 * price", not "what would a frontier model have done differently" — that second
 * question needs the measured control arm (golden-task lane), not arithmetic.
 */
export function repriceOnModel(
  records: LlmCallRecord[],
  referenceModel: string,
): number | undefined {
  const price = priceForModel(referenceModel);
  if (!price) return undefined;
  let dollars = 0;
  for (const record of records) {
    const cost = costOfUsage(record.usage, referenceModel, price);
    if (cost === undefined) return undefined;
    dollars += cost;
  }
  return Number(dollars.toFixed(6));
}
