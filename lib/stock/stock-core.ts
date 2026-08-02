// Royalty-free stock sourcing (Layer 5 pure helpers).
//
// The cheapest way to put REAL footage on screen is not to generate it. Stock
// providers cost $0 per asset where AI generation bills per image or per second,
// so this is the low-cost floor of the media pipeline.
//
// "Royalty-free" is not one thing, and conflating its variants is how projects
// end up shipping media they are not licensed to use. Four distinct obligation
// levels appear across these providers:
//
//   public_domain            CC0 / PD. No obligations at all.
//   permissive_no_attribution Pexels / Pixabay licence. Free commercial use,
//                            attribution welcome but NOT required.
//   attribution_required     CC BY. Must credit the creator.
//   share_alike              CC BY-SA. Must credit AND license derivatives
//                            alike — which can infect the whole output video.
//
// Default policy allows the first three and EXCLUDES share_alike. CC BY is fine
// because the credit obligation is satisfied automatically (see buildCredits);
// CC BY-SA is not, because copyleft propagates to the finished video. Wikimedia
// Commons video is mostly CC BY-SA, so that provider is opt-in by design.
//
// Every returned asset carries its licence and a ready-made attribution line so
// a credits file can be emitted even when attribution is optional.

export type LicenseClass =
  | "public_domain"
  | "permissive_no_attribution"
  | "attribution_required"
  | "share_alike"
  | "unknown";

/** Licence classes that impose no obligation at all on the finished video. */
export const NO_OBLIGATION_LICENSES: readonly LicenseClass[] = [
  "public_domain",
  "permissive_no_attribution",
];

/**
 * Licence classes usable by default.
 *
 * Attribution-required (CC BY) IS included. It is royalty-free in the sense that
 * matters — no payment — and the only obligation is a credit line, which this
 * module generates automatically into CREDITS.md. Excluding it was a costly
 * mistake in practice: restricting Openverse to CC0 alone collapses the index to
 * a small, eclectic pool (archival scans, hobby renders) with almost nothing
 * topical, so searches returned high-resolution irrelevance.
 *
 * `share_alike` is deliberately NOT here. CC BY-SA is copyleft: using one clip
 * can force the entire finished video under a compatible licence. That is a
 * decision for a human, never a silent default.
 *
 * `unknown` is never allowed — an unclassified licence is the one that ships
 * unlicensed media.
 */
export const DEFAULT_ALLOWED_LICENSES: readonly LicenseClass[] = [
  "public_domain",
  "permissive_no_attribution",
  "attribution_required",
];

export type StockMediaType = "photo" | "video" | "audio";

export interface StockProvider {
  id: string;
  name: string;
  homepage: string;
  /** Media types this provider can actually serve. */
  media: readonly StockMediaType[];
  /** Env var holding the key, or null when the API is keyless. */
  api_key_env: string | null;
  /** Worst-case licence class the provider can return under our query policy. */
  license_class: LicenseClass;
  /** Requests permitted per window, for the throttle. */
  rate_limit?: { requests: number; per_seconds: number };
  /** Provider rules we must honour in code, not just in docs. */
  constraints: readonly string[];
}

/**
 * Provider registry, in PREFERENCE order — curated libraries first.
 *
 * An earlier version ranked keyless providers first so the zero-config path
 * needed no setup. Measured against a real brief that was the wrong trade:
 * Openverse is a Creative-Commons SEARCH AGGREGATOR over Flickr, museum and
 * archival collections, not a stock photo library. For "kid jumping in joy" it
 * keyword-matches and returns a vintage lamb illustration, a school choir, a
 * vegetable garden and a Best Buy storefront ("Does your kid wear Poko Pants?").
 *
 * Pexels and Pixabay are curated stock libraries whose whole purpose is this use
 * case, and their keys are FREE. They lead. Openverse remains the keyless
 * fallback so a render still works with no setup, but callers should expect
 * loose topical fit from it and the manifest records which provider supplied
 * each frame.
 */
export const STOCK_PROVIDERS: readonly StockProvider[] = [
  {
    id: "pexels",
    name: "Pexels",
    homepage: "https://pexels.com",
    media: ["photo", "video"],
    api_key_env: "PEXELS_API_KEY",
    license_class: "permissive_no_attribution",
    rate_limit: { requests: 200, per_seconds: 3600 },
    constraints: [
      "key goes in the Authorization header (bare key, no Bearer prefix)",
      "200 req/hour and 20000 req/month by default",
      "must not replicate a stock-photo product; assembling a new video is a value-add",
      "attribution is optional but unlocks a higher rate limit",
    ],
  },
  {
    id: "pixabay",
    name: "Pixabay",
    homepage: "https://pixabay.com",
    media: ["photo", "video"],
    api_key_env: "PIXABAY_API_KEY",
    license_class: "permissive_no_attribution",
    rate_limit: { requests: 100, per_seconds: 60 },
    constraints: [
      "key is a query parameter, not a header",
      "responses MUST be cached for 24h — this is a hard requirement, not advice",
      "permanent hotlinking of images is forbidden; download before serving",
      "video may be embedded directly, but downloading is still recommended",
    ],
  },
  {
    id: "openverse",
    name: "Openverse",
    homepage: "https://openverse.org",
    // Openverse indexes images and audio only — it does NOT index video.
    media: ["photo", "audio"],
    api_key_env: null,
    // Worst case under our query policy (cc0 + by). CC BY-SA is excluded at the
    // query level, so share-alike never reaches the render from this provider.
    license_class: "attribution_required",
    rate_limit: { requests: 20, per_seconds: 60 },
    constraints: [
      "query pins license=cc0,by ; the index also holds CC BY-SA which we exclude",
      "cold start measured at 40s; warm queries ~0.7s — set timeouts above 40s",
      "openverse cannot guarantee upstream licence accuracy — record the source url",
      "no video index; use pexels/pixabay/wikimedia for motion",
    ],
  },
  {
    id: "wikimedia",
    name: "Wikimedia Commons",
    homepage: "https://commons.wikimedia.org",
    media: ["photo", "video"],
    api_key_env: null,
    // Commons video is predominantly CC BY-SA. Share-alike can propagate to the
    // finished video, so this provider is opt-in.
    license_class: "share_alike",
    rate_limit: { requests: 200, per_seconds: 60 },
    constraints: [
      "requires a descriptive User-Agent or requests are refused",
      "video is WebM/Ogg only — Commons rejects H.264/H.265, so transcode for MP4",
      "typical clips are low resolution (640x480)",
      "CC BY-SA imposes attribution AND share-alike on derivatives",
    ],
  },
] as const;

export function providerById(id: string): StockProvider | undefined {
  return STOCK_PROVIDERS.find((p) => p.id === id);
}

/** Providers that can serve a media type without a configured key. */
export function keylessProvidersFor(media: StockMediaType): StockProvider[] {
  return STOCK_PROVIDERS.filter(
    (p) => p.api_key_env === null && p.media.includes(media),
  );
}

/**
 * Providers usable right now for a media type, in preference order.
 *
 * `env` is injected rather than read from process.env so this stays pure and
 * testable. `allowShareAlike` opts into copyleft sources; the default excludes
 * them so an unattended render cannot silently put a share-alike condition on
 * the finished video.
 */
export function availableProviders(args: {
  media: StockMediaType;
  env: Record<string, string | undefined>;
  /** Opt in to copyleft (CC BY-SA) sources. Off by default. */
  allowShareAlike?: boolean;
}): StockProvider[] {
  const allowed = args.allowShareAlike
    ? [...DEFAULT_ALLOWED_LICENSES, "share_alike" as LicenseClass]
    : DEFAULT_ALLOWED_LICENSES;
  return STOCK_PROVIDERS.filter((p) => {
    if (!p.media.includes(args.media)) return false;
    if (p.api_key_env && !args.env[p.api_key_env]?.trim()) return false;
    return allowed.includes(p.license_class);
  });
}

/** Map a raw licence string to its obligation class. */
export function classifyLicense(raw: string | undefined): LicenseClass {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().replace(/[\s_]+/g, "-");
  if (/cc0|public-?domain|\bpdm\b/.test(s)) return "public_domain";
  if (/pexels|pixabay/.test(s)) return "permissive_no_attribution";
  // Order matters: "cc-by-sa" also matches "cc-by".
  if (/(^|-)by-sa|share-?alike/.test(s)) return "share_alike";
  if (/(^|-)by(-|$)/.test(s)) return "attribution_required";
  return "unknown";
}

/** True when a licence class can be used with no credit and no copyleft. */
export function isObligationFree(license: LicenseClass): boolean {
  return NO_OBLIGATION_LICENSES.includes(license);
}

export interface StockAsset {
  provider: string;
  media: StockMediaType;
  /** Direct URL to the asset bytes. */
  url: string;
  /** Human-facing page for the asset, used in attribution. */
  source_page?: string;
  title?: string;
  creator?: string;
  license_raw?: string;
  license: LicenseClass;
  width?: number;
  height?: number;
  duration_seconds?: number;
  mime?: string;
}

/**
 * Attribution line for one asset.
 *
 * Returned even for obligation-free assets: crediting CC0 and Pexels work is
 * optional but good practice, and on Pexels it is what unlocks a higher rate
 * limit. Callers decide whether to display it; this never silently drops credit.
 */
export function attributionLine(asset: StockAsset): string {
  const title = asset.title?.trim() || "Untitled";
  const creator = asset.creator?.trim();
  const provider = providerById(asset.provider)?.name ?? asset.provider;
  const license = asset.license_raw?.trim() || asset.license;
  const where = asset.source_page || asset.url;
  return (
    `"${title}"${creator ? ` by ${creator}` : ""} via ${provider} ` +
    `(${license})${where ? ` — ${where}` : ""}`
  );
}

/** Credits file body, or undefined when there is nothing to credit. */
export function buildCredits(assets: StockAsset[]): string | undefined {
  if (assets.length === 0) return undefined;
  const required = assets.filter((a) => !isObligationFree(a.license));
  const optional = assets.filter((a) => isObligationFree(a.license));
  const lines: string[] = ["# Credits", ""];
  if (required.length > 0) {
    lines.push("## Attribution required", "");
    for (const a of required) lines.push(`- ${attributionLine(a)}`);
    lines.push("");
  }
  if (optional.length > 0) {
    lines.push("## No attribution required (credited anyway)", "");
    for (const a of optional) lines.push(`- ${attributionLine(a)}`);
    lines.push("");
  }
  if (required.some((a) => a.license === "share_alike")) {
    lines.push(
      "> This render includes share-alike (CC BY-SA) material. Derivatives of " +
        "this video must be licensed under compatible terms.",
      "",
    );
  }
  return lines.join("\n");
}

/**
 * Turn a scene description into a stock search query.
 *
 * Stock indexes match short concrete noun phrases, not sentences. A raw shot
 * prompt ("Photorealistic cinematic still of a teenager, shallow depth of
 * field...") returns nothing useful, so camera and style vocabulary is stripped
 * and the result is capped at a few content words.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "with", "and", "or", "to", "for",
  "from", "by", "as", "is", "are", "was", "were", "his", "her", "their", "its",
  "this", "that", "these", "those", "into", "over", "under", "after", "before",
  "photorealistic", "cinematic", "still", "shot", "photo", "image", "frame",
  "shallow", "depth", "field", "lighting", "natural", "detail", "high",
  "closeup", "close", "up", "wide", "angle", "lens", "bokeh", "expressive",
  "vivid", "beautiful", "stunning", "background", "scene", "moment", "capture",
]);

export function buildStockQuery(shot: string, maxWords = 4): string {
  const words = shot
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
    if (unique.length >= maxWords) break;
  }
  return unique.join(" ");
}

/** Word overlap between an asset's text and the query, in [0,1]. */
export function relevanceScore(asset: StockAsset, query: string): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  if (terms.length === 0) return 0;
  const haystack = `${asset.title ?? ""} ${asset.creator ?? ""}`.toLowerCase();
  let hits = 0;
  for (const t of terms) if (haystack.includes(t)) hits += 1;
  return hits / terms.length;
}

/**
 * Pick the best asset from a candidate list.
 *
 * RELEVANCE DOMINATES. An earlier version ranked purely on resolution and
 * licence, which selected the highest-resolution asset out of hundreds of
 * loosely-matching CC0 results — for a query about a student celebrating, that
 * returned a vintage laxative advert and a LEGO spaceship. Topical fit is the
 * whole point of a stock search, so it is weighted an order of magnitude above
 * pixel count.
 *
 * The provider's own result ORDER is the strongest relevance signal available
 * (their ranking is better than word overlap), so position is the primary term
 * and title overlap only refines it.
 */
export function pickBestAsset(
  assets: StockAsset[],
  targetWidth: number,
  query?: string,
): StockAsset | undefined {
  if (assets.length === 0) return undefined;
  const scored = assets.map((asset, index) => {
    // ABSOLUTE rank, not a fraction of list length: normalising by length makes
    // position 1 of 2 cost as much as position 4 of 8, which lets a two-result
    // set overwhelm every other signal.
    const positionPenalty = index * 1.2;
    // Title overlap can lift a genuinely on-topic asset a few ranks.
    const overlapBonus = query ? relevanceScore(asset, query) * 5 : 0;
    const w = asset.width ?? 0;
    // Under-resolution hurts more than over-resolution: upscaling a 640px still
    // into a 1280px frame looks worse than downscaling an oversized one.
    const resolutionPenalty =
      w >= targetWidth
        ? (w - targetWidth) / targetWidth
        : ((targetWidth - w) / targetWidth) * 4;
    const licensePenalty = isObligationFree(asset.license) ? 0 : 2;
    return {
      asset,
      score: positionPenalty - overlapBonus + resolutionPenalty + licensePenalty,
    };
  });
  scored.sort((l, r) => l.score - r.score);
  return scored[0].asset;
}

/**
 * Simple fixed-window throttle state. Pixabay's 24h caching rule and Pexels'
 * hourly cap both punish bursty automated access, and being rate-limited
 * mid-render fails the whole task.
 */
export interface ThrottleState {
  windowStartMs: number;
  count: number;
}

export function shouldThrottle(
  provider: StockProvider,
  state: ThrottleState,
  nowMs: number,
): { allowed: boolean; waitMs: number } {
  const limit = provider.rate_limit;
  if (!limit) return { allowed: true, waitMs: 0 };
  const windowMs = limit.per_seconds * 1000;
  if (nowMs - state.windowStartMs >= windowMs) {
    return { allowed: true, waitMs: 0 };
  }
  if (state.count < limit.requests) return { allowed: true, waitMs: 0 };
  return { allowed: false, waitMs: windowMs - (nowMs - state.windowStartMs) };
}
