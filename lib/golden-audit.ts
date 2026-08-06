/**
 * Golden-task audit lane: pure grading logic for auditing a marketplace
 * delivery against a curated reference answer.
 *
 * Why it exists: bids carry a Brier-scored confidence (lib/bid-calibration.ts),
 * so a strategic agent can protect its calibration and quality dimensions by
 * only bidding on tasks it is certain of. Golden tasks are ordinary-looking
 * tasks with a known expected outcome, posted through the normal auction
 * pipeline and graded against the stored reference at settle — keeping the
 * calibration and quality dimensions anchored to ground truth the agent
 * cannot self-select around.
 *
 * Convex wiring lives in convex/goldenTasks.ts (posting, seeds, frequency
 * caps) and convex/goldenTaskAudit.ts (the settle-time reference grader).
 */

/** Ceiling on any single golden task's max_budget (dollars) unless
 * ARBOR_GOLDEN_MAX_BUDGET raises/lowers it. Audits must stay cheap. */
export const GOLDEN_BUDGET_CAP_DEFAULT = 0.5;

/** Minimum hours between golden posts (global, across all golden tasks)
 * unless ARBOR_GOLDEN_MIN_INTERVAL_HOURS overrides. */
export const GOLDEN_MIN_INTERVAL_HOURS_DEFAULT = 24;

/** A posted golden run that never reaches settle (auction failed, execution
 * failed) is marked expired after this long so the run log stays honest. */
export const GOLDEN_RUN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function goldenBudgetCap(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
    return GOLDEN_BUDGET_CAP_DEFAULT;
  }
  return Math.max(0.05, Math.min(5, parsed));
}

export function goldenMinIntervalMs(raw: string | undefined): number {
  const parsed = Number(raw);
  const hours =
    !raw || !Number.isFinite(parsed) || parsed < 0
      ? GOLDEN_MIN_INTERVAL_HOURS_DEFAULT
      : Math.min(24 * 30, parsed);
  return hours * 60 * 60 * 1000;
}

/** Case- and thousands-separator-insensitive containment, so "$2,340.50" in a
 * delivery satisfies a "2340.50" criterion and vice versa. */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/,/g, "");
}

/** Returns the required substrings NOT found in the delivery (empty = all
 * present). Deterministic leg of the audit — no model involved. */
export function checkRequiredSubstrings(
  deliveryText: string,
  required: string[],
): string[] {
  const haystack = normalizeForMatch(deliveryText);
  return required.filter(
    (needle) => !haystack.includes(normalizeForMatch(needle)),
  );
}

export interface GoldenGraderVerdict {
  passed?: boolean;
  quality_score?: number;
  reasoning?: string;
}

export interface GoldenAuditOutcome {
  passed: boolean;
  /** 0..1 quality against the reference, feeds reputation_dimensions. */
  quality: number;
  reasoning: string;
  substring_misses: string[];
  /** False when the model grader was unreachable and the deterministic
   * substring checks decided the verdict alone. */
  grader_used: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Combine the deterministic substring checks with the model grader's verdict.
 * Missing required substrings always fail the audit and cap quality at 0.3 —
 * the reference facts are ground truth, not a matter of grader opinion. When
 * the grader is unreachable, substring criteria (if any) decide alone; with
 * no deterministic criteria either, returns null and the caller records an
 * audit error instead of guessing (never punish or reward on a grader outage).
 */
export function combineAuditVerdict(input: {
  substring_misses: string[];
  had_required_substrings: boolean;
  grader: GoldenGraderVerdict | null;
}): GoldenAuditOutcome | null {
  const { substring_misses, had_required_substrings, grader } = input;
  const substringsOk = substring_misses.length === 0;

  const graderUsable = grader !== null && typeof grader.passed === "boolean";
  if (!graderUsable) {
    if (!had_required_substrings) return null;
    return {
      passed: substringsOk,
      quality: substringsOk ? 0.7 : 0.1,
      reasoning: substringsOk
        ? "Reference grader unavailable; all required reference facts present in the delivery."
        : `Reference grader unavailable; delivery is missing required reference facts: ${substring_misses.join(", ")}.`,
      substring_misses,
      grader_used: false,
    };
  }

  const graderPassed = grader.passed === true;
  const passed = substringsOk && graderPassed;
  let quality = clamp01(
    typeof grader.quality_score === "number"
      ? grader.quality_score
      : graderPassed
        ? 0.7
        : 0.1,
  );
  if (!substringsOk) quality = Math.min(quality, 0.3);
  const reasoning = [
    grader.reasoning?.trim() || (graderPassed ? "Delivery matches the reference." : "Delivery does not match the reference."),
    substringsOk
      ? undefined
      : `Missing required reference facts: ${substring_misses.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { passed, quality, reasoning, substring_misses, grader_used: true };
}

export const GOLDEN_AUDIT_SYSTEM_PROMPT = `You are a reference-based auditor for an agent marketplace. Unlike the general judge, you are given the KNOWN correct answer (or checkable success criteria) for this task. Compare the agent's delivery strictly against that reference. Output JSON only:
{ "passed": true|false, "quality_score": <0.0-1.0>, "reasoning": "<one paragraph>" }

Rules:
- passed = true only if the delivery satisfies the reference answer / success criteria on the substance (exact wording does not matter; facts, numbers, and required fields do).
- Ground every claim in text literally present in the delivery; do not invent content.
- A confident, fluent delivery that gets the reference facts wrong must fail with a low quality_score.`;

export function goldenAuditUserPrompt(input: {
  taskPrompt: string;
  referenceAnswer: string;
  successCriteria: string;
  deliveryText: string;
}): string {
  return [
    `Task given to the agent:\n${input.taskPrompt.slice(0, 2000)}`,
    `Reference answer (known correct):\n${input.referenceAnswer.slice(0, 2000)}`,
    `Success criteria:\n${input.successCriteria.slice(0, 2000)}`,
    `Agent's delivery:\n${input.deliveryText.slice(0, 6000)}`,
  ].join("\n\n---\n\n");
}

// ─── Templating: parameterized golden-task definitions ─────────────────────
//
// Why: the 28 seeded goldens originally hardcoded prompt/reference_answer/
// required_substrings together (e.g. "A marketplace escrow holds $120.00...").
// An agent that bids on the same golden_id twice sees the identical prompt
// and can memorize the reference answer, which stops the audit from
// measuring anything (see research/settlement-audit-protocol.md section 3,
// "Templating (required pre-launch work)"). Every golden_id below is now a
// TEMPLATE: `draw(rng)` pulls fresh numbers/names/dates from a seeded PRNG
// and COMPUTES prompt, reference_answer, success_criteria and
// required_substrings from those same drawn values — never a hardcoded
// literal alongside a templated prompt.
//
// Determinism: the seed for a given post is derived from (golden_id,
// run_index) via deriveGoldenSeed, where run_index is the golden's run_count
// at post time (see convex/goldenTasks.ts:postGolden — run_index is the
// run_count *before* incrementing, so the first post is run 0, the second
// run 1, etc). Same golden_id + same run_index always draws the same task;
// a different run_index always draws a different one. The seed and the
// human-readable drawn params are recorded on the golden_task_runs row
// (see convex/schema.ts `golden_task_runs.seed` / `.drawn_params_json`) so a
// settled run can be re-graded later without depending on any mutable state.

export type Rng = () => number;

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. Good enough for
 * generating surface variation in a task prompt — not cryptographic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash — turns (golden_id, run_index) into a PRNG seed
 * deterministically, with no dependency on Date.now() or Math.random(). */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Same (golden_id, run_index) always derives the same seed; a different
 * run_index always derives a different one. run_index is clamped to a
 * non-negative integer so a bad caller can't accidentally collide run 0. */
export function deriveGoldenSeed(golden_id: string, run_index: number): number {
  return fnv1a32(`${golden_id}::${Math.max(0, Math.floor(run_index))}`);
}

export function createRng(seed: number): Rng {
  return mulberry32(seed);
}

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickOne<T>(rng: Rng, options: readonly T[]): T {
  return options[randInt(rng, 0, options.length - 1)];
}

/** Draw `count` distinct options without replacement (order random). */
function pickDistinct<T>(rng: Rng, options: readonly T[], count: number): T[] {
  const pool = [...options];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randInt(rng, 0, pool.length - 1);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

/** Random dollar amount at cent precision within [minDollars, maxDollars]. */
function randCents(rng: Rng, minDollars: number, maxDollars: number): number {
  const minC = Math.round(minDollars * 100);
  const maxC = Math.round(maxDollars * 100);
  return randInt(rng, minC, maxC) / 100;
}

function withThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "$1,234.56" style formatting — no Intl dependency, so this stays safe to
 * import from Convex's default (non-Node) runtime as well as from Node. */
export function formatUSD(n: number): string {
  const fixed = n.toFixed(2);
  const neg = fixed.startsWith("-");
  const [i, d] = (neg ? fixed.slice(1) : fixed).split(".");
  return `${neg ? "-" : ""}$${withThousands(i)}.${d}`;
}

/** Same as formatUSD but without the currency symbol. */
export function formatPlain(n: number, decimals: number): string {
  const fixed = n.toFixed(decimals);
  const neg = fixed.startsWith("-");
  const parts = (neg ? fixed.slice(1) : fixed).split(".");
  const i = withThousands(parts[0]);
  return `${neg ? "-" : ""}${parts.length > 1 ? `${i}.${parts[1]}` : i}`;
}

/**
 * Format a number as a decisive-but-format-tolerant required substring: a
 * whole value drops the decimal places entirely (so a correct delivery that
 * writes "$111" instead of "$111.00" still passes — this mirrors the
 * original hand-picked substrings, e.g. "111" not "111.00"); a non-whole
 * value keeps the full fixed-decimal string, since the fractional digits are
 * then part of what must be checked (e.g. "0.0942", "2315.25").
 */
export function roundedSubstring(n: number, decimals: number): string {
  const rounded = Number(n.toFixed(decimals));
  const isWhole = Math.abs(rounded - Math.trunc(rounded)) < 1e-9;
  return isWhole ? String(Math.trunc(rounded)) : rounded.toFixed(decimals);
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
] as const;

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a given (1-based) calendar month, leap-year aware. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** A random valid calendar date in [yearMin, yearMax], "YYYY-MM-DD". */
function randDateISO(rng: Rng, yearMin: number, yearMax: number): string {
  const year = randInt(rng, yearMin, yearMax);
  const month = randInt(rng, 1, 12);
  const day = randInt(rng, 1, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Add `days` calendar days to an ISO date. UTC-safe (no DST drift) and
 * correct across month/year/leap-year boundaries via native Date
 * normalization rather than hand-rolled month-length arithmetic. */
function addDaysISO(startISO: string, days: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function singular(noun: string): string {
  return noun.endsWith("s") ? noun.slice(0, -1) : noun;
}

export interface GoldenDraw {
  prompt: string;
  reference_answer: string;
  success_criteria: string;
  required_substrings?: string[];
  /** Human-readable snapshot of exactly what was drawn — recorded on the
   * golden_task_runs row so a settled run can be re-graded or reviewed later
   * without re-deriving anything from template code. */
  params: Record<string, string | number>;
}

export interface GoldenTemplate {
  golden_id: string;
  title: string;
  task_type: string;
  max_budget: number;
  draw: (rng: Rng) => GoldenDraw;
}

export function renderGoldenTemplate(
  template: GoldenTemplate,
  seed: number,
): GoldenDraw {
  return template.draw(createRng(seed));
}

export function findGoldenTemplate(
  golden_id: string,
): GoldenTemplate | undefined {
  return GOLDEN_TEMPLATES.find((t) => t.golden_id === golden_id);
}

/**
 * Draw the task for a specific (golden_id, run_index). run_index should be
 * the golden's run_count *before* incrementing it for this post (run 0 is
 * the first post, run 1 the second, ...) — see convex/goldenTasks.ts.
 * Returns null for an unknown golden_id.
 */
export function drawGoldenForRun(
  golden_id: string,
  run_index: number,
): { seed: number; draw: GoldenDraw } | null {
  const template = findGoldenTemplate(golden_id);
  if (!template) return null;
  const seed = deriveGoldenSeed(golden_id, run_index);
  return { seed, draw: renderGoldenTemplate(template, seed) };
}

// ─── Stochastic max_budget / posted_by draws from the real organic
// distribution ────────────────────────────────────────────────────────────
//
// Why: every golden run previously posted with a single hardcoded max_budget
// ($2, see GOLDEN_TEMPLATES below) and a single hardcoded posted_by
// ("buyer:default", convex/goldenTasks.ts GOLDEN_BUYER_ID) — a uniform value
// on either field is itself a detectability leak independent of the prompt
// (scripts/golden-detectability.ts max_budget / posted_by / full_row_worst_case
// axes). This is defense-in-depth, not a live bidder exploit: convex/
// auctions.ts solicitBids never passes max_budget, posted_by, or
// bid_window_seconds into a bidding specialist's bid(prompt, taskType) call
// (see the comment at auctions.ts:497) — but the stored `tasks` row is
// visible to anything with deployment read access, so uniformity there is
// still a real, hardenable signal.
//
// Weights below come directly from scripts/data/organic-tasks-snapshot.json
// (212-row dev snapshot, captured 2026-08-05):
//
// max_budget: the exact counts observed, EXCLUDING the max_budget:0 bucket
// (17 rows, all convex/agentReadiness.ts startSmokeRun scratchpad tasks that
// never enter bidding — $0 is not a real bidable budget and would violate
// the floor below anyway). 15 distinct nonzero values remain.
//
// posted_by: restricted to the three genuine buyer/agent-facing channels —
// buyer:web (80 rows), agent:mcp (59 rows), and clerk:user_<id> (13 rows
// across 5 distinct real ids) — which together are 152 of 212 rows (71.7%).
// The remaining ~28% is internal test/smoke/hive-harness traffic
// (agent:e2e, hive-e2e, hive-multi-e2e, hive-connector, agent:codex-smoke,
// readiness-smoke:<timestamp>, buyer:e2e-bidcheck*) — deliberately excluded:
// a golden task carrying a posted_by like "readiness-smoke:2026-07-29T..."
// would be a NEW, more obvious tell than the one being fixed (that prefix
// means something specific elsewhere — convex/agentReadiness.ts,
// convex/hiveConnector.ts — and downstream tooling that keys off it should
// not have to account for a golden task wearing it), not a realistic buyer
// post. clerk:user_<id> ids are freshly generated from the draw's own RNG,
// never a literal id copied from the snapshot, so no two runs ever collide
// on an identity and no real historical id string is reused.

interface Weighted<T> {
  value: T;
  weight: number;
}

function drawWeighted<T>(rng: Rng, table: ReadonlyArray<Weighted<T>>): T {
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  let x = rng() * total;
  for (const row of table) {
    x -= row.weight;
    if (x <= 0) return row.value;
  }
  return table[table.length - 1].value;
}

const ORGANIC_MAX_BUDGET_WEIGHTS: ReadonlyArray<Weighted<number>> = [
  { value: 0.4, weight: 1 },
  { value: 0.5, weight: 1 },
  { value: 1, weight: 8 },
  { value: 2, weight: 73 },
  { value: 2.5, weight: 3 },
  { value: 3, weight: 6 },
  { value: 4, weight: 12 },
  { value: 5, weight: 60 },
  { value: 8, weight: 2 },
  { value: 10, weight: 8 },
  { value: 20, weight: 12 },
  { value: 25, weight: 5 },
  { value: 50, weight: 1 },
  { value: 123, weight: 1 },
  { value: 200, weight: 2 },
];

type PostedByCategory = "buyer:web" | "agent:mcp" | "clerk";

const ORGANIC_POSTED_BY_WEIGHTS: ReadonlyArray<Weighted<PostedByCategory>> = [
  { value: "buyer:web", weight: 80 },
  { value: "agent:mcp", weight: 59 },
  { value: "clerk", weight: 13 },
];

const CLERK_ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Matches the shape of the real ids observed in the snapshot
 * (clerk:user_<27 base62 chars>), generated fresh from the draw's RNG. */
function randomClerkId(rng: Rng, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CLERK_ID_ALPHABET[Math.floor(rng() * CLERK_ID_ALPHABET.length)];
  }
  return out;
}

/** Hard floor: the guaranteed floor agent (arbor-hive-backstop) will not bid
 * under its $0.40 cost_baseline — a bidding specialist's bid() call never
 * sees max_budget (see the module comment above), so this isn't about
 * hiding the floor from a bidder; it's that any task posted under $0.40
 * dies with "no valid bids under budget" (verified live, dev deployment,
 * 2026-08-05). Never draw below this, in any caller. */
export const GOLDEN_MAX_BUDGET_FLOOR = 0.4;

/** Raw draw from the organic max_budget distribution, floored at
 * GOLDEN_MAX_BUDGET_FLOOR but NOT capped by ARBOR_GOLDEN_MAX_BUDGET — this is
 * the "uncapped design point" used for each template's static representative
 * budget (GOLDEN_TEMPLATES below), which is what the pre-launch detectability
 * gate (scripts/golden-detectability.ts) reads directly. Actual spend at post
 * time always goes through drawGoldenMaxBudget, which applies the live cap. */
export function drawOrganicMaxBudgetRaw(rng: Rng): number {
  return Math.max(GOLDEN_MAX_BUDGET_FLOOR, drawWeighted(rng, ORGANIC_MAX_BUDGET_WEIGHTS));
}

/** Stochastic per-post max_budget: floored at GOLDEN_MAX_BUDGET_FLOOR and
 * capped by the deployment's live ARBOR_GOLDEN_MAX_BUDGET (via
 * goldenBudgetCap) so a wide organic draw (the snapshot goes up to $200)
 * never posts a golden run more expensive than the operator intends today. */
export function drawGoldenMaxBudget(rng: Rng, envCapRaw: string | undefined): number {
  return Math.min(drawOrganicMaxBudgetRaw(rng), goldenBudgetCap(envCapRaw));
}

/** Stochastic per-post posted_by, drawn from the real buyer/agent-facing
 * channel mix (see the comment above ORGANIC_POSTED_BY_WEIGHTS). */
export function drawGoldenPostedBy(rng: Rng): string {
  const category = drawWeighted(rng, ORGANIC_POSTED_BY_WEIGHTS);
  return category === "clerk" ? `clerk:user_${randomClerkId(rng, 27)}` : category;
}

// ── domain data tables used by individual templates below ──────────────────

const INVOICE_COMPANIES = [
  "Bluefin Analytics LLC",
  "Cascade Data Partners",
  "Northwind Systems Inc",
  "Halcyon Ledger Co",
  "Vantage Compute LLC",
  "Ironwood Metrics Inc",
];
const INVOICE_SERVICES = [
  "data pipeline maintenance",
  "quarterly infrastructure audit",
  "API integration support",
  "analytics dashboard build-out",
];
const INVOICE_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const RECEIPT_CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD"];
const WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const TIER_RATE_SETS: Array<[number, number, number]> = [
  [0.01, 0.006, 0.003],
  [0.012, 0.007, 0.0035],
  [0.015, 0.008, 0.004],
  [0.008, 0.005, 0.0025],
];
function formatRate(n: number): string {
  const s = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `$${s.includes(".") ? s : `${s}.00`}`;
}

interface ContradictionDomain {
  noun: string;
  xAdj: string;
  yAdj: string;
  zAdj: string;
  subject: string;
}
const CONTRADICTION_DOMAINS: ContradictionDomain[] = [
  { noun: "tasks", xAdj: "settled", yAdj: "judged", zAdj: "rejected", subject: "the sample" },
  { noun: "orders", xAdj: "shipped", yAdj: "inspected", zAdj: "returned", subject: "the batch" },
  { noun: "builds", xAdj: "deployed", yAdj: "tested", zAdj: "failed", subject: "the release train" },
  { noun: "agents", xAdj: "onboarded", yAdj: "vetted", zAdj: "suspended", subject: "the roster" },
  { noun: "bids", xAdj: "submitted", yAdj: "reviewed", zAdj: "declined", subject: "the auction" },
];

const SQL_DOMAINS = [
  { table: "runs", idCol: "agent_id", boolCol: "passed" },
  { table: "submissions", idCol: "model_id", boolCol: "success" },
  { table: "attempts", idCol: "worker_id", boolCol: "ok" },
  { table: "evaluations", idCol: "specialist_id", boolCol: "correct" },
];

const BUGFIX_NAMES = [
  { fn: "last_n", list: "xs", n: "n" },
  { fn: "tail_n", list: "items", n: "n" },
  { fn: "take_last", list: "values", n: "k" },
  { fn: "last_k", list: "arr", n: "count" },
];

function randVersionComponent(rng: Rng): string {
  return rng() < 0.15 ? "0" : String(randInt(rng, 1, 50));
}
function randVersion(rng: Rng, parts: number): string {
  return Array.from({ length: parts }, () => randVersionComponent(rng)).join(".");
}
const PART_WORDS: Record<number, string> = { 2: "two", 3: "three", 4: "four" };

const ORDERING_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
  "M", "N", "P", "Q", "R", "S", "T", "U", "V", "W",
];

const NEGATION_SERVICES = [
  "Stripe", "Clerk", "Convex", "Sentry", "Slack",
  "Twilio", "Segment", "Datadog", "PagerDuty", "Auth0",
];
const NEGATION_SUBFEATURES = [
  "cron jobs", "webhook queue", "background workers", "nightly sync",
];

const SUMMARY_CONDITIONS = [
  "flagged for review",
  "under a fraud hold",
  "pending manual verification",
  "flagged for compliance review",
];

const DERIVATIVES_ASSETS = ["BTC", "ETH", "SOL"];

const ROUTING_PAIRS: Array<[string, string]> = [
  ["an EU entity", "a US entity"],
  ["a UK entity", "a Singapore entity"],
  ["a US entity", "a Japanese entity"],
  ["an EU entity", "a UK entity"],
];
const ROUTING_ASSETS = [
  "a stablecoin transfer",
  "a tokenized bond settlement",
  "a cross-border remittance",
];

const SECURITY_ENDPOINTS = [
  "/api/reset-password",
  "/api/account/password-reset",
  "/v1/auth/reset-password",
  "/internal/users/reset-password",
];
const SECURITY_FIELD_PAIRS: Array<[string, string]> = [
  ["email", "new_password"],
  ["user_email", "password"],
  ["email", "newPassword"],
];

const INCIDENT_CAUSES = [
  "a dependency upgrade",
  "a database driver upgrade",
  "a base image upgrade",
  "an SDK version bump",
];

const RETRIEVAL_VARIANTS = [
  {
    protocol: "A2A (Agent2Agent)",
    org: "Google",
    other: "MCP",
    reference:
      "A2A is an open protocol for agent-to-agent communication and task delegation, originally published by Google. It addresses peer agents discovering each other and delegating whole tasks with a lifecycle, whereas MCP standardizes how a single model/client reaches tools and resources. A2A is agent-to-agent; MCP is client-to-tool.",
    criteria:
      "Must state the agent-to-agent vs client-to-tool distinction correctly and attribute A2A to Google. At least one concrete source or URL is required — an unsourced answer fails even if the facts are right.",
  },
  {
    protocol: "MCP (Model Context Protocol)",
    org: "Anthropic",
    other: "A2A",
    reference:
      "MCP is an open protocol standardizing how a single model or client application connects to external tools, data sources, and resources, originally published by Anthropic. It addresses the model-to-tool/resource connection, whereas A2A addresses peer agents discovering each other and delegating whole tasks with a lifecycle. MCP is client-to-tool; A2A is agent-to-agent.",
    criteria:
      "Must state the client-to-tool vs agent-to-agent distinction correctly and attribute MCP to Anthropic. At least one concrete source or URL is required — an unsourced answer fails even if the facts are right.",
  },
];

const SPATIAL_SPACES = [
  "hotel lobby", "airport lounge", "corporate atrium", "hospital waiting area",
];

// ── the 28 templates ────────────────────────────────────────────────────────

export const GOLDEN_TEMPLATES: GoldenTemplate[] = [
  {
    golden_id: "golden-escrow-math",
    title: "Escrow net payout arithmetic",
    task_type: "general",
    max_budget: 25,
    draw: (rng) => {
      const escrow = randInt(rng, 20, 180) * 5; // $100-$900, multiples of $5
      const feePct = pickOne(rng, [4, 5, 6, 7.5, 8, 9, 10, 11, 12, 12.5, 15, 17.5, 20]);
      const escrowCents = Math.round(escrow * 100);
      const feeCents = Math.round((escrowCents * feePct) / 100);
      const fee = feeCents / 100;
      const net = (escrowCents - feeCents) / 100;
      const feeLabel = feePct % 1 === 0 ? String(feePct) : feePct.toFixed(1);
      return {
        prompt: `need the net payout on this before end of day — escrow's holding ${formatUSD(escrow)} and the platform takes a ${feeLabel}% cut before the worker gets paid, walk me through the fee math and give me the exact cents so i can log it right`,
        reference_answer: `Fee = ${formatUSD(escrow)} x ${feeLabel}% = ${formatUSD(fee)}; net payout = ${formatUSD(escrow)} - ${formatUSD(fee)} = ${formatUSD(net)}.`,
        success_criteria: `The delivery must compute the ${feeLabel}% fee on ${formatUSD(escrow)} (${formatUSD(fee)}), subtract it, and state ${formatUSD(net)} as the final net payout.`,
        required_substrings: [roundedSubstring(net, 2)],
        params: { escrow, feePct, fee, net },
      };
    },
  },
  {
    golden_id: "golden-unit-conversion",
    title: "Speed unit conversion",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const mph = randInt(rng, 10, 95);
      const raw = (mph * 1609.344) / 3600;
      const rounded = Number(raw.toFixed(1));
      return {
        prompt: `Our vehicle telemetry logs speed in mph but the dashboard is metric-only. Convert ${mph} mph to meters per second — use 1 mile = 1609.344 meters exactly, not a rounded conversion factor — and show the math so I can sanity-check it. Don't need a ton of precision, just the nearest tenth.`,
        reference_answer: `${mph} x 1609.344 / 3600 = ${raw.toFixed(4)}, so ${rounded.toFixed(1)} m/s.`,
        success_criteria: `The delivery must use the given conversion factor and arrive at approximately ${rounded.toFixed(1)} m/s (rounding from ${raw.toFixed(2)} is acceptable).`,
        required_substrings: [roundedSubstring(rounded, 1)],
        params: { mph, raw: Number(raw.toFixed(4)), rounded },
      };
    },
  },
  {
    golden_id: "golden-invoice-extraction",
    title: "Invoice field extraction",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const company = pickOne(rng, INVOICE_COMPANIES);
      const service = pickOne(rng, INVOICE_SERVICES);
      const invoiceNum = `INV-${randInt(rng, 10000, 99999)}`;
      const monthYear = `${pickOne(rng, INVOICE_MONTHS)} ${randInt(rng, 2026, 2027)}`;
      const subtotal = randCents(rng, 500, 9000);
      const vat = randCents(rng, 20, 900);
      const total = (Math.round(subtotal * 100) + Math.round(vat * 100)) / 100;
      const dueDate = randDateISO(rng, 2026, 2027);
      const remit = `accounts@${company.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 12)}.example`;
      return {
        prompt: `Behind on AP this week and need three facts off this invoice before I file it.\n\nInvoice text:\n"${company} — Tax Invoice ${invoiceNum}. Services rendered: ${service}, ${monthYear}. Subtotal ${formatUSD(subtotal)}, VAT ${formatUSD(vat)}. Total due: ${formatUSD(total)} by ${dueDate}. Remit to ${remit}."\n\nNeed:\n- invoice number\n- what's actually due\n- due date\n\nThree labeled lines, nothing else.`,
        reference_answer: `Invoice number: ${invoiceNum}. Total due: ${formatUSD(total)}. Due date: ${dueDate}.`,
        success_criteria: `All three fields must be extracted exactly as they appear: invoice number ${invoiceNum}, total due ${formatUSD(total)}, due date ${dueDate}. No invented or altered fields.`,
        required_substrings: [invoiceNum.replace("INV-", ""), formatPlain(total, 2), dueDate],
        params: { company, invoiceNum, subtotal, vat, total, dueDate },
      };
    },
  },
  {
    golden_id: "golden-policy-summary",
    title: "Policy passage summary",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const basePct = pickOne(rng, [10, 12, 14, 16, 18, 20, 22, 24]);
      const reducedPct = basePct / 2;
      const windowDays = pickOne(rng, [21, 30, 45, 60]);
      const thresholdTasks = pickOne(rng, [25, 50, 75, 100]);
      const startDate = randDateISO(rng, 2026, 2027);
      return {
        prompt: `Support keeps getting asked to explain our reserve policy and the official wording is dense. Can you boil this down to three sentences max for a help-center article? Keep every number and date exactly as written — nothing rounded or paraphrased.\n\n"Starting ${startDate}, the marketplace holds ${basePct}% of each settled payment in a dispute reserve for ${windowDays} days. If no dispute is filed within that window, the reserve is released automatically. Workers with more than ${thresholdTasks} settled tasks and zero lost disputes qualify for a reduced ${reducedPct}% reserve."`,
        reference_answer: `From ${startDate}, ${basePct}% of each settled payment is held in a dispute reserve for ${windowDays} days and released automatically if no dispute is filed; workers with more than ${thresholdTasks} settled tasks and zero lost disputes get a reduced ${reducedPct}% reserve.`,
        success_criteria: `The summary must preserve all figures: the ${startDate} start date, the ${basePct}% reserve rate, the ${windowDays}-day window, the automatic release condition, and the reduced ${reducedPct}% rate for workers with more than ${thresholdTasks} settled tasks and zero lost disputes. At most three sentences.`,
        required_substrings: [`${basePct}%`, `${windowDays}`, `${reducedPct}%`],
        params: { startDate, basePct, windowDays, thresholdTasks, reducedPct },
      };
    },
  },
  {
    golden_id: "golden-compound-interest",
    title: "Compound interest over three years",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const principal = randInt(rng, 5, 50) * 100; // $500-$5,000
      const ratePct = pickOne(rng, [3, 4, 5, 6, 7, 8, 9, 10, 12]);
      let balCents = Math.round(principal * 100);
      const balances: number[] = [];
      for (let y = 0; y < 3; y++) {
        balCents = Math.round((balCents * (100 + ratePct)) / 100);
        balances.push(balCents / 100);
      }
      const final = balances[2];
      return {
        prompt: `left ${formatUSD(principal)} sitting in escrow earning ${ratePct}% a year, compounded, no deposits or withdrawals for 3 years — need the year by year balance and the final number to the cent before i update the ledger`,
        reference_answer: `Year 1: ${formatUSD(principal)} x (1 + ${ratePct}%) = ${formatUSD(balances[0])}; Year 2: ${formatUSD(balances[1])}; Year 3: ${formatUSD(balances[2])}.`,
        success_criteria: `The delivery must compound annually (not simple interest) and state ${formatUSD(final)} as the final balance.`,
        required_substrings: [roundedSubstring(final, 2)],
        params: { principal, ratePct, year1: balances[0], year2: balances[1], year3: final },
      };
    },
  },
  {
    golden_id: "golden-percentage-change",
    title: "Percentage change direction",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const juneRate = randInt(rng, 40, 92);
      const julyRate = randInt(rng, 2, juneRate - 10);
      const absChange = juneRate - julyRate;
      const relDecline = Number(((absChange / juneRate) * 100).toFixed(1));
      return {
        prompt: `One of our specialists had a rough July — judge-accept rate dropped from ${juneRate}% in June to ${julyRate}% in July. For the incident writeup I need both numbers: the drop in percentage points, and the relative decline as a percentage of where June started. Nearest tenth of a percent is close enough.`,
        reference_answer: `Absolute change: ${absChange} percentage points. Relative decline: ${absChange}/${juneRate} = ${relDecline.toFixed(1)}%.`,
        success_criteria: `The delivery must distinguish percentage points from percent, giving ${absChange} percentage points and a ${relDecline.toFixed(1)}% relative decline.`,
        required_substrings: [String(absChange), roundedSubstring(relDecline, 1)],
        params: { juneRate, julyRate, absChange, relDecline },
      };
    },
  },
  {
    golden_id: "golden-unit-rate",
    title: "Cost per thousand tokens",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const inputTokens = randInt(rng, 10, 500) * 100; // 1,000-50,000
      const outputTokens = randInt(rng, 5, 100) * 100; // 500-10,000
      const inputRate = pickOne(rng, [1, 1.5, 2, 3, 5, 6, 10]);
      const outputRate = pickOne(rng, [5, 8, 10, 15, 20, 25, 30]);
      const inputCost = (inputTokens / 1_000_000) * inputRate;
      const outputCost = (outputTokens / 1_000_000) * outputRate;
      const total = Number((inputCost + outputCost).toFixed(4));
      const inputCostStr = `$${inputCost.toFixed(4)}`;
      const outputCostStr = `$${outputCost.toFixed(4)}`;
      const totalStr = `$${total.toFixed(4)}`;
      return {
        prompt: `Trying to reconcile our LLM bill. One call used ${formatPlain(inputTokens, 0)} input tokens and ${formatPlain(outputTokens, 0)} output tokens; input runs $${inputRate.toFixed(2)} per million and output $${outputRate.toFixed(2)} per million. What did that single call actually cost? Don't round it off — these micro-costs add up fast at our volume.`,
        reference_answer: `Input: ${formatPlain(inputTokens, 0)}/1,000,000 x $${inputRate.toFixed(2)} = ${inputCostStr}. Output: ${formatPlain(outputTokens, 0)}/1,000,000 x $${outputRate.toFixed(2)} = ${outputCostStr}. Total = ${totalStr}.`,
        success_criteria: `The delivery must price input and output separately at their different rates and total ${totalStr}.`,
        required_substrings: [roundedSubstring(total, 4)],
        params: { inputTokens, outputTokens, inputRate, outputRate, inputCost, outputCost, total },
      };
    },
  },
  {
    golden_id: "golden-date-arithmetic",
    title: "Deadline across a month boundary",
    task_type: "general",
    max_budget: 0.5,
    draw: (rng) => {
      const startDate = randDateISO(rng, 2025, 2029);
      const windowDays = pickOne(rng, [30, 40, 45, 50, 60, 75, 90]);
      const closingDate = addDaysISO(startDate, windowDays);
      const year = Number(startDate.slice(0, 4));
      const leapNote = isLeapYear(year)
        ? `${year} is a leap year.`
        : `${year} is not a leap year.`;
      return {
        prompt: `dispute window opened ${startDate} and runs ${windowDays} days, counting the opening day as day 0 — when does it actually close, don't want to release the reserve early. ${leapNote}`,
        reference_answer: `${startDate} + ${windowDays} days = ${closingDate} (day 0 is the opening day; count forward using the correct number of days in each month).`,
        success_criteria: `The delivery must state ${closingDate} and correctly account for each month's actual length (including February's length for the relevant year).`,
        required_substrings: [closingDate],
        params: { startDate, windowDays, closingDate, year },
      };
    },
  },
  {
    golden_id: "golden-json-extraction",
    title: "Structured field extraction",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const orderId = `ORD-${randInt(rng, 10000, 99999)}`;
      const currency = pickOne(rng, RECEIPT_CURRENCIES);
      const weekday = pickOne(rng, WEEKDAYS);
      const subtotal = randCents(rng, 20, 500);
      const shipping = randCents(rng, 0, 20);
      const total = (Math.round(subtotal * 100) + Math.round(shipping * 100)) / 100;
      return {
        prompt: `wiring this receipt into our reconciliation script, need it as clean JSON — just order_id, total, and currency keys, nothing else\n\n"Thank you! Your order ${orderId} shipped on ${weekday}. Subtotal ${subtotal.toFixed(2)} ${currency}, shipping ${shipping.toFixed(2)} ${currency}, total due ${total.toFixed(2)} ${currency}. Questions? Reply to this email."`,
        reference_answer: `{"order_id": "${orderId}", "total": ${total}, "currency": "${currency}"}`,
        success_criteria: `The delivery must return the TOTAL (${total.toFixed(2)}), not the subtotal (${subtotal.toFixed(2)}), with order id ${orderId} and currency ${currency}.`,
        required_substrings: [orderId, String(total), currency],
        params: { orderId, currency, weekday, subtotal, shipping, total },
      };
    },
  },
  {
    golden_id: "golden-table-lookup",
    title: "Conditional table lookup",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const [tier1Rate, tier2Rate, tier3Rate] = pickOne(rng, TIER_RATE_SETS);
      const totalCalls = randInt(rng, 12, 60) * 100; // 1,200-6,000
      const tier3Count = totalCalls - 1000;
      const cost1 = 100 * tier1Rate;
      const cost2 = 900 * tier2Rate;
      const cost3 = tier3Count * tier3Rate;
      const total = Number((cost1 + cost2 + cost3).toFixed(2));
      return {
        prompt: `Our usage-based billing has tiered pricing and I keep messing up the math by hand.\n\nTiers (marginal — each band charged at its own rate):\n- 0-100 calls: ${formatRate(tier1Rate)} each\n- 101-1,000 calls: ${formatRate(tier2Rate)} each\n- 1,001+ calls: ${formatRate(tier3Rate)} each\n\nWhat's the total for ${formatPlain(totalCalls, 0)} calls this cycle?`,
        reference_answer: `100 x ${formatRate(tier1Rate)} = ${formatUSD(cost1)}; 900 x ${formatRate(tier2Rate)} = ${formatUSD(cost2)}; ${formatPlain(tier3Count, 0)} x ${formatRate(tier3Rate)} = ${formatUSD(cost3)}; total ${formatUSD(total)}.`,
        success_criteria: `The delivery must apply the bands marginally (not charge all ${formatPlain(totalCalls, 0)} at the lowest rate) and total ${formatUSD(total)}.`,
        required_substrings: [roundedSubstring(total, 2)],
        params: { tier1Rate, tier2Rate, tier3Rate, totalCalls, total },
      };
    },
  },
  {
    golden_id: "golden-contradiction-detect",
    title: "Detect the contradicted claim",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const d = pickOne(rng, CONTRADICTION_DOMAINS);
      const sn = singular(d.noun);
      const roles = [
        { key: "universalXY", text: `All ${d.xAdj} ${d.noun} in ${d.subject} were ${d.yAdj}.` },
        { key: "existentialYZ", text: `Some ${d.yAdj} ${d.noun} were ${d.zAdj}.` },
        { key: "negativeXZ", text: `No ${d.xAdj} ${sn} in ${d.subject} was ${d.zAdj}.` },
        { key: "universalZX", text: `Every ${d.zAdj} ${sn} in ${d.subject} was ${d.xAdj}.` },
      ];
      const order = roles.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = randInt(rng, 0, i);
        [order[i], order[j]] = [order[j], order[i]];
      }
      const shuffled = order.map((i) => roles[i]);
      const contradictionPos = shuffled.findIndex((r) => r.key === "negativeXZ") + 1;
      const existentialPos = shuffled.findIndex((r) => r.key === "existentialYZ") + 1;
      const universalZXPos = shuffled.findIndex((r) => r.key === "universalZX") + 1;
      const statementsText = shuffled.map((r, i) => `${i + 1}. ${r.text}`).join("\n");
      return {
        prompt: `QA flagged an inconsistency in this status report but couldn't pin down which line was the problem. Exactly one of these statements contradicts the rest — which number, and why?\n${statementsText}`,
        reference_answer: `Statement ${contradictionPos} contradicts the others: by ${existentialPos} and ${universalZXPos}, some ${d.xAdj} ${sn} was ${d.zAdj}, which statement ${contradictionPos} denies.`,
        success_criteria: `The delivery must identify statement ${contradictionPos} and reference the chain through statements ${existentialPos} and ${universalZXPos}.`,
        required_substrings: [String(contradictionPos)],
        params: { domain: d.noun, contradictionPos, existentialPos, universalZXPos },
      };
    },
  },
  {
    golden_id: "golden-sql-reasoning",
    title: "Query result reasoning",
    task_type: "code-context-retrieval",
    max_budget: 20,
    draw: (rng) => {
      const d = pickOne(rng, SQL_DOMAINS);
      return {
        prompt: `Need a pass-rate query against our \`${d.table}\` table (columns: ${d.idCol}, ${d.boolCol} as boolean) for a dashboard. It has to include ${d.idCol}s that failed every single run — don't let them silently drop out of the results — sorted by pass rate descending. Standard SQL, one query.`,
        reference_answer: `SELECT ${d.idCol}, AVG(CASE WHEN ${d.boolCol} THEN 1.0 ELSE 0.0 END) AS pass_rate FROM ${d.table} GROUP BY ${d.idCol} ORDER BY pass_rate DESC;`,
        success_criteria: `The query must GROUP BY ${d.idCol}, compute a rate that yields 0 (not NULL or a dropped row) for all-failed ${d.idCol}s, and ORDER BY the rate descending.`,
        required_substrings: ["GROUP BY", d.idCol],
        params: { table: d.table, idCol: d.idCol, boolCol: d.boolCol },
      };
    },
  },
  {
    golden_id: "golden-code-bugfix",
    title: "Identify the off-by-one",
    task_type: "code-context-retrieval",
    max_budget: 2,
    draw: (rng) => {
      const d = pickOne(rng, BUGFIX_NAMES);
      return {
        prompt: `Found this while triaging a support ticket — this helper is supposed to return the last ${d.n} elements of a list, but something's off when ${d.n} is 0. Can you spot it and send back the fixed version?\n\ndef ${d.fn}(${d.list}, ${d.n}):\n    return ${d.list}[-${d.n}:]`,
        reference_answer: `When ${d.n} is 0, ${d.list}[-0:] is ${d.list}[0:], which returns the whole list instead of an empty one. Fix: \`return ${d.list}[len(${d.list})-${d.n}:]\` or an explicit \`if ${d.n} <= 0: return []\`.`,
        success_criteria: `The delivery must identify that -0 equals 0 so the slice returns the entire list, and give a fix that returns an empty list for ${d.n}=0.`,
        required_substrings: ["0"],
        params: { fn: d.fn, list: d.list, n: d.n },
      };
    },
  },
  {
    golden_id: "golden-regex-spec",
    title: "Regex from a specification",
    task_type: "code-context-retrieval",
    max_budget: 5,
    draw: (rng) => {
      const numParts = pickOne(rng, [2, 3, 4]);
      const goodA = randVersion(rng, numParts);
      const goodB = randVersion(rng, numParts);
      const badPartsArr = goodA.split(".");
      badPartsArr[0] = `0${randInt(rng, 1, 9)}`;
      const badLeadingZero = badPartsArr.join(".");
      const badWrongParts = randVersion(rng, Math.max(1, numParts - 1));
      const regex = `^${Array.from({ length: numParts }, () => "(0|[1-9][0-9]*)").join("\\.")}$`;
      const partsWord = PART_WORDS[numParts] ?? String(numParts);
      return {
        prompt: `Need a regex to validate version strings before they hit our release pipeline — exactly ${partsWord} dot-separated non-negative integers, no leading zeros. ${goodA} and ${goodB} should match; ${badLeadingZero} and ${badWrongParts} should not. Anchor it to the full string, just send the pattern.`,
        reference_answer: regex,
        success_criteria: `The regex must be anchored at both ends, require exactly ${partsWord} components, allow a bare 0, and reject leading zeros.`,
        required_substrings: ["^"],
        params: { numParts, goodA, goodB, badLeadingZero, badWrongParts },
      };
    },
  },
  {
    golden_id: "golden-probability",
    title: "Conditional probability",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const n = pickOne(rng, [1000, 2000, 5000]);
      const livePct = pickOne(rng, [2, 4, 5, 8, 10, 15, 20]);
      const tprPct = pickOne(rng, [80, 85, 88, 90, 92, 95]);
      const fprPct = pickOne(rng, [4, 5, 6, 8, 10, 12]);
      const liveCount = (n * livePct) / 100;
      const deadCount = n - liveCount;
      const liveFlagged = (liveCount * tprPct) / 100;
      const deadFlagged = (deadCount * fprPct) / 100;
      const totalFlagged = liveFlagged + deadFlagged;
      const finalPct = Number(((liveFlagged / totalFlagged) * 100).toFixed(1));
      return {
        prompt: `our liveness probe's false-positive rate has been bugging me — out of ${formatPlain(n, 0)} agents, ${livePct}% are actually live, the probe catches ${tprPct}% of the live ones but also flags ${fprPct}% of the dead ones. if an agent gets flagged, what's the real probability it's live? need it as a percentage for the postmortem`,
        reference_answer: `Live flagged: ${formatPlain(liveCount, 0)} x ${(tprPct / 100).toFixed(2)} = ${formatPlain(liveFlagged, 2)}. Dead flagged: ${formatPlain(deadCount, 0)} x ${(fprPct / 100).toFixed(2)} = ${formatPlain(deadFlagged, 2)}. P(live | flagged) = ${formatPlain(liveFlagged, 2)}/${formatPlain(totalFlagged, 2)} = ${finalPct.toFixed(1)}%.`,
        success_criteria: `The delivery must apply Bayes' rule against the base rate and state ${finalPct.toFixed(1)}%.`,
        required_substrings: [roundedSubstring(finalPct, 1)],
        params: { n, livePct, tprPct, fprPct, finalPct },
      };
    },
  },
  {
    golden_id: "golden-weighted-average",
    title: "Weighted average with a trap",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const countB = randInt(rng, 5, 50);
      const countA = countB * randInt(rng, 4, 15);
      const rateA = randInt(rng, 20, 70);
      const rateB = randInt(rng, rateA + 10, 98);
      const combined = Number(
        ((countA * rateA + countB * rateB) / (countA + countB)).toFixed(1),
      );
      const naive = Number(((rateA + rateB) / 2).toFixed(1));
      return {
        prompt: `agent a ran ${countA} tasks at a ${rateA}% accept rate, agent b ran ${countB} tasks at a ${rateB}% accept rate — what's the real combined accept rate across both, not just averaging the two percentages since the volumes are so different. don't round it to a whole number, we track this closely`,
        reference_answer: `(${countA} x ${rateA}% + ${countB} x ${rateB}%) / ${countA + countB} = (${(countA * rateA) / 100} + ${(countB * rateB) / 100}) / ${countA + countB} = ${combined.toFixed(1)}%.`,
        success_criteria: `The delivery must weight by task count (${combined.toFixed(1)}%), not average the two rates naively (which would give ${naive.toFixed(1)}%).`,
        required_substrings: [roundedSubstring(combined, 1)],
        params: { countA, rateA, countB, rateB, combined },
      };
    },
  },
  {
    golden_id: "golden-ordering-constraints",
    title: "Schedule under dependencies",
    task_type: "general",
    max_budget: 1,
    draw: (rng) => {
      const [nA, nB, nC, nD, nE] = pickDistinct(rng, ORDERING_LETTERS, 5);
      return {
        prompt: `Sprint dependencies got tangled up: ${nC} needs both ${nA} and ${nB} done first, ${nD} needs ${nC}, ${nB} needs ${nA}, ${nE} needs ${nB}. Lay out a valid order to run all five in and give the length of the longest dependency chain.`,
        reference_answer: `Order: ${nA}, ${nB}, ${nC}, ${nD}, ${nE} (or ${nA}, ${nB}, ${nE}, ${nC}, ${nD}). Longest chain: ${nA} -> ${nB} -> ${nC} -> ${nD}, length 4.`,
        success_criteria: `The order must place ${nA} before ${nB}, ${nB} and ${nA} before ${nC}, ${nC} before ${nD}, and ${nB} before ${nE}. The longest chain is 4 nodes.`,
        required_substrings: ["4"],
        params: { nA, nB, nC, nD, nE },
      };
    },
  },
  {
    golden_id: "golden-currency-rounding",
    title: "Split a payment without losing a cent",
    task_type: "general",
    max_budget: 20,
    draw: (rng) => {
      const total = randInt(rng, 20, 500);
      const totalCents = total * 100;
      const workerOptions = [3, 6, 7, 9, 11, 13, 4, 8];
      let numWorkers = pickOne(rng, workerOptions);
      let remainder = totalCents % numWorkers;
      if (remainder === 0) {
        for (const alt of workerOptions) {
          if (totalCents % alt !== 0) {
            numWorkers = alt;
            remainder = totalCents % alt;
            break;
          }
        }
      }
      const base = Math.floor(totalCents / numWorkers);
      const highAmt = (base + 1) / 100;
      const lowAmt = base / 100;
      const countHigh = remainder;
      const countLow = numWorkers - remainder;
      return {
        prompt: `Split a ${formatUSD(total)} payout across ${numWorkers} workers so it lands on exact cents, nothing left over or short. State each worker's amount.`,
        reference_answer: `${countHigh} worker${countHigh === 1 ? "" : "s"} get ${formatUSD(highAmt)} and ${countLow} get ${formatUSD(lowAmt)} so the total is exactly ${formatUSD(total)}.`,
        success_criteria: `The ${numWorkers} amounts must sum to exactly ${total.toFixed(2)}, which requires ${countHigh} of them to differ by a cent from the other ${countLow}; splitting evenly at ${formatUSD(lowAmt)} x ${numWorkers} would be wrong.`,
        required_substrings: [roundedSubstring(highAmt, 2), roundedSubstring(lowAmt, 2)],
        params: { total, numWorkers, highAmt, lowAmt, countHigh, countLow },
      };
    },
  },
  {
    golden_id: "golden-negation-extraction",
    title: "Extraction under negation",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const [e1, e2, e3, d1, d2] = pickDistinct(rng, NEGATION_SERVICES, 5);
      const subfeature = pickOne(rng, NEGATION_SUBFEATURES);
      return {
        prompt: `Building the integrations status page and this engineering note is worded confusingly.\n\nNote: "We have ${e1} connected and ${e2} auth is live. ${e3} is deployed but the ${subfeature} are disabled. We have not enabled ${d1} yet, and the ${d2} integration was turned off last week."\n\nList only the services that are actually live right now. Nothing else.`,
        reference_answer: `${e1}, ${e2}, and ${e3} are enabled.`,
        success_criteria: `The list must include ${e1}, ${e2}, and ${e3}, and must EXCLUDE ${d1}, ${d2}, and the ${subfeature}.`,
        required_substrings: [e1, e2, e3],
        params: { e1, e2, e3, d1, d2, subfeature },
      };
    },
  },
  {
    golden_id: "golden-summary-fidelity",
    title: "Summary preserving a qualifier",
    task_type: "general",
    max_budget: 0.5,
    draw: (rng) => {
      const n1 = pickOne(rng, [1, 2, 3]);
      const n2 = pickOne(rng, [7, 8, 10, 12, 14, 15]);
      const condition = pickOne(rng, SUMMARY_CONDITIONS);
      const n1Word = numberWord(n1);
      const n2Word = numberWord(n2);
      return {
        prompt: `Support keeps misquoting our payout SLA to customers. Can you condense this into one sentence I can paste into our macro — keep the conditional exact, don't drop the exception:\n\n"Payouts settle within ${n1Word} business day${n1 === 1 ? "" : "s"}, except for accounts ${condition}, which settle within ${n2Word} business days once the review clears."`,
        reference_answer: `Payouts settle in ${n1Word} business day${n1 === 1 ? "" : "s"} unless the account is ${condition}, in which case they settle within ${n2Word} business days after the review clears.`,
        success_criteria: `The summary must keep both figures (${n1Word} and ${n2Word} business days) AND the condition that the ${n2Word}-day path applies only to accounts ${condition} after review clears.`,
        required_substrings: [n1Word, n2Word],
        params: { n1, n2, condition },
      };
    },
  },
  {
    golden_id: "golden-dom-derivatives-confluence",
    title: "Crypto derivatives confluence read",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const asset = pickOne(rng, DERIVATIVES_ASSETS);
      return {
        prompt: `Trying to decide whether to add to a ${asset} perpetual futures position before the desk closes. Give me a multi-timeframe read — trend on the 1h, 4h and 1d, whether they agree or conflict, and what open interest would need to show to confirm the move. Be specific about what data you're actually using, and just say so plainly if you don't have live market data rather than making something up.`,
        reference_answer: `A useful answer names the three timeframes, gives a direction or confluence score for each, states agreement/conflict explicitly, and ties open interest (rising OI with price = confirmation, falling OI = weakening) to the conclusion. An honest 'no live data access' with the correct method described is acceptable.`,
        success_criteria: `Must address all three timeframes and the open-interest confirmation condition. Fabricated precise live ${asset} prices with no data source is a failure; an explicit statement of no market-data access plus a correct method is a pass.`,
        params: { asset },
      };
    },
  },
  {
    golden_id: "golden-dom-capability-routing",
    title: "Route a request to the right tool class",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const [partyA, partyB] = pickOne(rng, ROUTING_PAIRS);
      const asset = pickOne(rng, ROUTING_ASSETS);
      return {
        prompt: `We're wiring up an autonomous agent that needs to check whether ${asset} between ${partyA} and ${partyB} is even permitted before it executes anything. What capability classes actually need to be consulted here (regulatory, sanctions, chain data, whatever applies), in what order, and what should a signed verdict contain so a downstream agent can just trust it instead of re-checking everything itself?`,
        reference_answer: `Should identify at least: a regulatory/compliance check for the relevant jurisdictions, a sanctions/AML screen on both counterparties, and on-chain verification of the asset and addresses. Order matters: cheap deterministic screens before expensive chain calls. A reliable verdict carries the decision, the rules applied, the inputs hashed, a timestamp and a signature.`,
        success_criteria: `Must name at least two distinct capability classes and state what makes a verdict reusable (provenance, timestamp, signature, or equivalent). Naming a single generic 'compliance API' with no decomposition is a failure.`,
        params: { partyA, partyB, asset },
      };
    },
  },
  {
    golden_id: "golden-dom-ai-governance",
    title: "Guardrails for a multi-provider AI gateway",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const providerCount = pickOne(rng, [2, 3, 4]);
      const providerWord = numberWord(providerCount);
      return {
        prompt: `We route LLM traffic across ${providerWord} providers and leadership wants real runtime governance before the next audit, not just a policy doc. What controls would you actually enforce at the gateway for spend, data egress, and auditability — and for each one, what signal are you measuring and what fires when it breaches?`,
        reference_answer: `One valid control set — Spend: per-team token/cost budgets measured from usage records, action = throttle or hard-stop. Data egress: PII/secret detection on prompts, action = redact or block before the provider call. Auditability: immutable per-request log of prompt hash, model, tokens, cost and policy decision, retained for review. EQUIVALENT CONTROLS ARE CORRECT: rate/concurrency quotas, per-request cost ceilings, burn-rate alerts, DLP classification, residency/allowlist routing, policy-decision traces, or tamper-evident logging all satisfy an area, provided each named control states a measurable signal and a concrete enforcement action.`,
        success_criteria: `Must cover all three areas (spend, data egress, auditability) with a measurable signal AND a concrete enforcement action for each. Listing controls with no measurement or no action is a failure. Do NOT fail a delivery for choosing different valid controls than the reference's examples; fail only for a missing area, a control without a signal, or a control without an enforcement action.`,
        params: { providerCount },
      };
    },
  },
  {
    golden_id: "golden-dom-security-review",
    title: "Authentication flaw review",
    task_type: "general",
    max_budget: 2.5,
    draw: (rng) => {
      const endpoint = pickOne(rng, SECURITY_ENDPOINTS);
      const [f1, f2] = pickOne(rng, SECURITY_FIELD_PAIRS);
      return {
        prompt: `A contractor handed off this endpoint and I want a second pair of eyes on it before it ships: 'POST ${endpoint} accepts {${f1}, ${f2}}. If the ${f1} exists we set the ${f2} and return 200. If it does not exist we return 404. No rate limiting. Reset tokens are not used.' Rank the problems by severity and tell me the impact and fix for each.`,
        reference_answer: `Critical: no token or proof of ownership means anyone can reset any account's password — full account takeover; fix is a signed, single-use, expiring reset token delivered out of band. High: 404 vs 200 is a user-enumeration oracle; fix is a uniform response. High: no rate limiting enables mass abuse; fix is per-IP and per-account throttling.`,
        success_criteria: `Must identify the missing reset token as the most severe issue (account takeover) and also flag user enumeration and the missing rate limit. Missing the token flaw is a failure regardless of what else is found.`,
        params: { endpoint, f1, f2 },
      };
    },
  },
  {
    golden_id: "golden-dom-incident-recovery",
    title: "Agent fleet incident triage",
    task_type: "general",
    max_budget: 5,
    draw: (rng) => {
      const cause = pickOne(rng, INCIDENT_CAUSES);
      return {
        prompt: `One of our production agents just started returning empty responses with HTTP 200 right after ${cause}, and I'm on call for this. What are the first three recovery steps, in order? For each one tell me the observable signal that confirms it actually worked, and what you'd capture before restarting anything.`,
        reference_answer: `Capture first: current version, recent deploy diff, a sample failing request/response pair and logs — restarting destroys the evidence. One valid sequence: (1) confirm the blast radius by checking whether other agents on the same dependency also fail; (2) roll back the change and verify a non-empty response body on a known-good request; (3) if rollback does not fix it, isolate the agent from traffic and replay the captured request against the previous build. EQUIVALENT ORDERINGS ARE CORRECT: halting the rollout, removing upgraded instances from traffic, blast-radius confirmation, rollback, and isolate-and-replay may appear in any defensible order, provided evidence capture precedes any restart and every step names a concrete observable confirming it worked.`,
        success_criteria: `Must put evidence capture before restart, give three ordered steps, and attach a verifiable observable to each. Generic 'restart and monitor' advice is a failure. Do NOT fail a delivery for choosing a different valid step ordering than the reference sequence; fail only for missing capture-first, fewer than three ordered steps, a step without a verifiable observable, or generic advice.`,
        params: { cause },
      };
    },
  },
  {
    golden_id: "golden-dom-web-retrieval",
    title: "Sourced factual retrieval",
    task_type: "general",
    max_budget: 3,
    draw: (rng) => {
      const v = pickOne(rng, RETRIEVAL_VARIANTS);
      return {
        prompt: `Trying to settle a debate on the team about ${v.protocol}. What is it, which organization originally published it, and what problem does it actually solve that ${v.other} doesn't? Cite whatever sources you used, with URLs where you can.`,
        reference_answer: v.reference,
        success_criteria: v.criteria,
        params: { protocol: v.protocol, org: v.org },
      };
    },
  },
  {
    golden_id: "golden-dom-clinical-summary",
    title: "Patient visit closure summary",
    task_type: "general",
    max_budget: 2,
    draw: (rng) => {
      const age = randInt(rng, 45, 72);
      const sex = pickOne(rng, ["M", "F"]);
      const bpTodaySys = randInt(rng, 138, 155);
      const bpTodayDia = randInt(rng, 85, 95);
      const bpLastSys = bpTodaySys + randInt(rng, 2, 8);
      const bpLastDia = bpTodayDia + randInt(rng, 1, 4);
      const weeksOnMed = pickOne(rng, [4, 5, 6, 8, 10]);
      const a1c = Number((5.5 + rng() * 0.9).toFixed(1));
      const followUpWeeks = pickOne(rng, [3, 4, 6]);
      return {
        prompt: `Front desk needs this turned into something the patient can actually read before their portal message goes out, with a clear follow-up section: 'Pt ${age}${sex}, HTN. BP ${bpTodaySys}/${bpTodayDia} today, was ${bpLastSys}/${bpLastDia} last visit. Started lisinopril 10mg daily ${weeksOnMed}wk ago. Reports occasional dry cough. A1c ${a1c}. Advised DASH diet, recheck BP ${followUpWeeks}wk.' Please don't invent anything that isn't in the notes.`,
        reference_answer: `Plain-language: blood pressure is still above target but slightly improved on the new medicine; the dry cough is a known possible side effect of lisinopril and should be mentioned to the clinician; blood sugar (A1c ${a1c}) is just below the diabetes range. Follow-up: continue lisinopril, follow the DASH diet, recheck blood pressure in ${followUpWeeks} weeks, report the cough if it worsens.`,
        success_criteria: `Must translate every clinical value into plain language, flag the cough as a possible medication side effect, and give the ${followUpWeeks}-week BP recheck as follow-up. Inventing any finding not present in the notes is an automatic failure.`,
        params: { age, sex, bpTodaySys, bpTodayDia, bpLastSys, bpLastDia, weeksOnMed, a1c, followUpWeeks },
      };
    },
  },
  {
    golden_id: "golden-dom-spatial-curation",
    title: "Curating moving image for a physical space",
    task_type: "general",
    max_budget: 25,
    draw: (rng) => {
      const wallMeters = randInt(rng, 4, 12);
      const space = pickOne(rng, SPATIAL_SPACES);
      const article = /^[aeiou]/i.test(space) ? "An" : "A";
      return {
        prompt: `We're installing looping visual art on a ${wallMeters}-metre wall in ${article.toLowerCase()} ${space} with constant foot traffic. What should the loop's duration, motion intensity and colour behaviour be, and why does each choice suit this specific environment rather than a gallery?`,
        reference_answer: `Long or seamless loops (many minutes) so passers-by never catch a visible restart; low, slow motion so it reads as ambience and does not pull focus or cause distraction in a transit space; restrained, low-contrast colour that works under mixed ${space} lighting and behind furniture. A gallery inverts these: shorter, more demanding pieces for a seated, attentive audience.`,
        success_criteria: `Must address duration, motion intensity and colour, and must justify each by the ${space} context (transient audience, ambient role) rather than generic art advice. A gallery contrast is expected.`,
        params: { wallMeters, space },
      };
    },
  },
];
