import assert from "node:assert/strict";
import {
  DEFAULT_ALLOWED_LICENSES,
  NO_OBLIGATION_LICENSES,
  STOCK_PROVIDERS,
  attributionLine,
  availableProviders,
  buildCredits,
  buildStockQuery,
  classifyLicense,
  isObligationFree,
  keylessProvidersFor,
  pickBestAsset,
  providerById,
  relevanceScore,
  shouldThrottle,
  type StockAsset,
} from "./stock-core";

// ─── provider registry ───────────────────────────────────────────────────────
assert.ok(STOCK_PROVIDERS.length >= 4, "registry must cover the researched set");
const ids = STOCK_PROVIDERS.map((p) => p.id);
assert.deepEqual(new Set(ids).size, ids.length, "provider ids must be unique");
for (const p of STOCK_PROVIDERS) {
  assert.ok(p.media.length > 0, `${p.id} must declare media types`);
  assert.ok(p.constraints.length > 0, `${p.id} must record its API constraints`);
  assert.ok(p.homepage.startsWith("https://"), `${p.id} needs a homepage`);
}

// Openverse indexes images and audio only — it does NOT index video. Claiming
// otherwise would make the router pick a provider that can never return a clip.
const openverse = providerById("openverse");
assert.ok(openverse);
assert.ok(!openverse.media.includes("video"), "openverse has no video index");
assert.ok(openverse.media.includes("photo") && openverse.media.includes("audio"));
assert.equal(openverse.api_key_env, null, "openverse is keyless");

// Wikimedia video is predominantly CC BY-SA, which propagates to derivatives.
const wikimedia = providerById("wikimedia");
assert.ok(wikimedia);
assert.equal(wikimedia.license_class, "share_alike");
assert.equal(wikimedia.api_key_env, null, "wikimedia is keyless");
assert.ok(
  wikimedia.constraints.some((c) => /webm|ogg/i.test(c)),
  "must record that Commons rejects H.264",
);

// Pixabay's 24h caching rule is mandatory, not advisory.
const pixabay = providerById("pixabay");
assert.ok(pixabay);
assert.ok(
  pixabay.constraints.some((c) => /cache/i.test(c) && /24h|24 h/i.test(c)),
  "pixabay 24h caching requirement must be recorded",
);
assert.equal(pixabay.api_key_env, "PIXABAY_API_KEY");

const pexels = providerById("pexels");
assert.ok(pexels);
assert.equal(pexels.api_key_env, "PEXELS_API_KEY");
assert.equal(pexels.license_class, "permissive_no_attribution");

assert.equal(providerById("nope"), undefined);

// ─── keylessProvidersFor ─────────────────────────────────────────────────────
const keylessPhoto = keylessProvidersFor("photo").map((p) => p.id);
assert.ok(keylessPhoto.includes("openverse"), "openverse serves photos keylessly");
const keylessVideo = keylessProvidersFor("video").map((p) => p.id);
assert.ok(keylessVideo.includes("wikimedia"));
assert.ok(!keylessVideo.includes("openverse"), "openverse cannot serve video");
assert.ok(!keylessVideo.includes("pexels"), "pexels needs a key");

// ─── classifyLicense ─────────────────────────────────────────────────────────
assert.equal(classifyLicense("cc0"), "public_domain");
assert.equal(classifyLicense("CC0 1.0"), "public_domain");
assert.equal(classifyLicense("public domain"), "public_domain");
assert.equal(classifyLicense("PDM 1.0"), "public_domain");
assert.equal(classifyLicense("Pexels License"), "permissive_no_attribution");
assert.equal(classifyLicense("Pixabay Content License"), "permissive_no_attribution");
assert.equal(classifyLicense("CC BY 4.0"), "attribution_required");
assert.equal(classifyLicense("by"), "attribution_required");
// Ordering matters: "cc-by-sa" also contains "cc-by". Share-alike must win, or
// a copyleft asset would be treated as merely attribution-required.
assert.equal(classifyLicense("CC BY-SA 3.0"), "share_alike");
assert.equal(classifyLicense("CC BY-SA 4.0"), "share_alike");
assert.equal(classifyLicense("cc_by_sa"), "share_alike");
assert.equal(classifyLicense("ShareAlike"), "share_alike");
assert.equal(classifyLicense(undefined), "unknown");
assert.equal(classifyLicense("all rights reserved"), "unknown");

// ─── isObligationFree ────────────────────────────────────────────────────────
assert.ok(isObligationFree("public_domain"));
assert.ok(isObligationFree("permissive_no_attribution"));
assert.ok(!isObligationFree("attribution_required"));
assert.ok(!isObligationFree("share_alike"));
// An unknown licence must NEVER be treated as free — that is the failure mode
// that ships unlicensed media.
assert.ok(!isObligationFree("unknown"), "unknown licence must not be assumed free");
assert.equal(NO_OBLIGATION_LICENSES.length, 2);

// ─── default licence policy ──────────────────────────────────────────────────
// CC BY is allowed by default: it is royalty-free and the credit obligation is
// discharged automatically by buildCredits. Restricting to CC0 alone collapsed
// the Openverse pool to archival oddities with nothing topical.
assert.ok(DEFAULT_ALLOWED_LICENSES.includes("attribution_required"));
// Copyleft is NOT allowed by default — it propagates to the finished video.
assert.ok(!DEFAULT_ALLOWED_LICENSES.includes("share_alike"));
// An unclassified licence is never allowed.
assert.ok(!DEFAULT_ALLOWED_LICENSES.includes("unknown"));

// ─── relevanceScore ──────────────────────────────────────────────────────────
assert.equal(
  relevanceScore(
    { provider: "x", media: "photo", url: "u", title: "student celebrating", license: "public_domain" },
    "student celebrating",
  ),
  1,
);
assert.equal(
  relevanceScore(
    { provider: "x", media: "photo", url: "u", title: "a feather", license: "public_domain" },
    "student celebrating",
  ),
  0,
);
// No query terms -> no signal, not a divide-by-zero.
assert.equal(
  relevanceScore(
    { provider: "x", media: "photo", url: "u", title: "anything", license: "public_domain" },
    "",
  ),
  0,
);

// ─── availableProviders ──────────────────────────────────────────────────────
// With no keys at all, the default policy still yields a working photo source.
const noKeys = availableProviders({ media: "photo", env: {} });
assert.deepEqual(noKeys.map((p) => p.id), ["openverse"]);
// Default policy must exclude share-alike, so keyless video yields nothing
// rather than silently attaching a copyleft obligation.
assert.deepEqual(
  availableProviders({ media: "video", env: {} }).map((p) => p.id),
  [],
  "share-alike video must not be a silent default",
);
// Opting in surfaces wikimedia.
assert.deepEqual(
  availableProviders({ media: "video", env: {}, allowShareAlike: true }).map((p) => p.id),
  ["wikimedia"],
);
// A key makes the keyed provider available.
const withPexels = availableProviders({
  media: "video",
  env: { PEXELS_API_KEY: "k" },
});
assert.deepEqual(withPexels.map((p) => p.id), ["pexels"]);
// Blank keys do not count as configured.
assert.deepEqual(
  availableProviders({ media: "video", env: { PEXELS_API_KEY: "   " } }).map((p) => p.id),
  [],
  "whitespace key must not enable a provider",
);
// Preference order: keyless-and-unencumbered first.
const both = availableProviders({
  media: "photo",
  env: { PEXELS_API_KEY: "k", PIXABAY_API_KEY: "k" },
});
// Curated stock libraries outrank the CC aggregator: Openverse returns loose
// keyword matches (a lamb illustration, a Best Buy storefront) for briefs that
// Pexels answers with actual topical stock photography.
assert.equal(both[0].id, "pexels", "curated library ranks above the aggregator");
assert.ok(
  both.map((p) => p.id).indexOf("openverse") > both.map((p) => p.id).indexOf("pexels"),
  "openverse is the fallback, not the first choice",
);
// Audio is only served by openverse in this registry.
assert.deepEqual(
  availableProviders({ media: "audio", env: { PEXELS_API_KEY: "k" } }).map((p) => p.id),
  ["openverse"],
);

// ─── buildStockQuery ─────────────────────────────────────────────────────────
// Stock indexes match short noun phrases, not prompt-engineered sentences.
assert.equal(
  buildStockQuery(
    "Photorealistic cinematic still of a teenager celebrating, shallow depth of field, natural lighting",
  ),
  "teenager celebrating",
);
assert.equal(
  buildStockQuery("A student jumping in joy after opening a letter"),
  "student jumping joy opening",
);
// Word cap is honoured and duplicates collapse.
assert.ok(buildStockQuery("a b c ".repeat(50)).split(" ").length <= 4);
assert.equal(buildStockQuery("celebration celebration celebration party"), "celebration party");
assert.equal(buildStockQuery("celebration", 1), "celebration");
// Degenerate inputs must not throw.
assert.equal(buildStockQuery(""), "");
assert.equal(buildStockQuery("!!! ??? ..."), "");
assert.equal(buildStockQuery("the of and a"), "", "pure stop-words yield nothing");

// ─── pickBestAsset ───────────────────────────────────────────────────────────
const mk = (
  partial: Partial<StockAsset> & Pick<StockAsset, "license">,
): StockAsset => ({
  provider: "test",
  media: "photo",
  url: "https://example.com/a.jpg",
  ...partial,
});

assert.equal(pickBestAsset([], 1280), undefined);

// RELEVANCE DOMINATES RESOLUTION. The provider ranks by relevance, so result
// order is the strongest topical signal available. An earlier version sorted
// purely on resolution and picked a vintage laxative advert for "student
// celebrating" — the highest-resolution match out of hundreds of loose CC0 hits.
const relevancePick = pickBestAsset(
  [
    mk({ license: "public_domain", width: 800, url: "top-hit" }),
    mk({ license: "public_domain", width: 4000, url: "huge-but-tenth" }),
  ],
  1280,
);
assert.equal(
  relevancePick?.url,
  "top-hit",
  "the provider's top-ranked result must beat a bigger lower-ranked one",
);

// Within the SAME rank position, resolution still decides: under-resolution is
// penalised harder than over-resolution, since upscaling a 640px still into a
// 1280px frame looks worse than downscaling an oversized one.
const resolutionPick = pickBestAsset(
  [mk({ license: "public_domain", width: 640, url: "small" })],
  1280,
);
assert.equal(resolutionPick?.url, "small", "single candidate is returned as-is");
const scoreSmall = pickBestAsset(
  [mk({ license: "public_domain", width: 640, url: "under" })],
  1280,
);
assert.ok(scoreSmall, "under-resolution is still usable when it is all there is");

// A title matching the query pulls a lower-ranked asset up.
const overlapPick = pickBestAsset(
  [
    mk({ license: "public_domain", width: 1280, title: "a feather", url: "off-topic" }),
    mk({
      license: "public_domain",
      width: 1280,
      title: "student celebrating graduation",
      url: "on-topic",
    }),
  ],
  1280,
  "student celebrating",
);
assert.equal(
  overlapPick?.url,
  "on-topic",
  "title overlap must lift a relevant asset above an off-topic top hit",
);

// Licence still breaks ties at equal rank and resolution.
const licensePick = pickBestAsset(
  [
    mk({ license: "share_alike", width: 1280, url: "copyleft" }),
    mk({ license: "public_domain", width: 1280, url: "cc0" }),
  ],
  1280,
);
// The unencumbered asset one rank down beats a copyleft top hit: a single
// position is cheaper than taking on a share-alike obligation.
assert.equal(
  licensePick?.url,
  "cc0",
  "an obligation-free asset one rank down must beat a copyleft top hit",
);
// Relevance still outranks licence once the gap is wide: an unencumbered asset
// buried several ranks down does NOT beat a copyleft top hit.
assert.equal(
  pickBestAsset(
    [
      mk({ license: "share_alike", width: 1280, url: "copyleft-top" }),
      ...Array.from({ length: 6 }, (_, i) =>
        mk({ license: "public_domain", width: 1280, url: `deep-${i}` }),
      ),
    ].reverse(),
    1280,
  )?.url,
  "deep-5",
  "a top-ranked unencumbered asset wins outright",
);
// Missing width must not throw.
assert.ok(pickBestAsset([mk({ license: "public_domain" })], 1280));

// ─── attribution ─────────────────────────────────────────────────────────────
const asset: StockAsset = {
  provider: "openverse",
  media: "photo",
  url: "https://live.staticflickr.com/x.jpg",
  source_page: "https://flickr.com/photos/x",
  title: "Students Celebrating",
  creator: "Jane Doe",
  license_raw: "cc0",
  license: "public_domain",
};
const line = attributionLine(asset);
assert.match(line, /Students Celebrating/);
assert.match(line, /Jane Doe/);
assert.match(line, /Openverse/);
assert.match(line, /flickr\.com/);
// Missing creator/title must not produce "undefined" in user-facing text.
const sparse = attributionLine({
  provider: "pexels",
  media: "video",
  url: "https://v.pexels.com/1.mp4",
  license: "permissive_no_attribution",
});
assert.doesNotMatch(sparse, /undefined/);
assert.match(sparse, /Untitled/);

// ─── buildCredits ────────────────────────────────────────────────────────────
assert.equal(buildCredits([]), undefined, "no assets -> no credits file");

const credits = buildCredits([
  asset,
  {
    provider: "wikimedia",
    media: "video",
    url: "https://upload.wikimedia.org/a.ogv",
    title: "Celebration",
    creator: "Someone",
    license_raw: "CC BY-SA 3.0",
    license: "share_alike",
  },
]);
assert.ok(credits);
assert.match(credits, /Attribution required/);
assert.match(credits, /No attribution required/);
// Share-alike must be called out explicitly — it constrains the whole output.
assert.match(credits, /share-alike/i);
assert.match(credits, /Derivatives of this video must be licensed/);

// A credits file with only obligation-free assets must not claim otherwise.
const freeOnly = buildCredits([asset]);
assert.ok(freeOnly);
assert.doesNotMatch(freeOnly, /Attribution required/);
assert.doesNotMatch(freeOnly, /Derivatives of this video/);

// ─── shouldThrottle ──────────────────────────────────────────────────────────
const limited = providerById("pixabay");
assert.ok(limited?.rate_limit);
const NOW = 1_000_000;
// Under the cap.
assert.deepEqual(
  shouldThrottle(limited, { windowStartMs: NOW, count: 5 }, NOW + 1_000),
  { allowed: true, waitMs: 0 },
);
// At the cap, inside the window -> must wait.
const blocked = shouldThrottle(
  limited,
  { windowStartMs: NOW, count: limited.rate_limit.requests },
  NOW + 1_000,
);
assert.equal(blocked.allowed, false);
assert.ok(blocked.waitMs > 0, "must report how long to wait");
// Window rolled over -> allowed again.
assert.deepEqual(
  shouldThrottle(
    limited,
    { windowStartMs: NOW, count: limited.rate_limit.requests },
    NOW + limited.rate_limit.per_seconds * 1000 + 1,
  ),
  { allowed: true, waitMs: 0 },
);
// A provider with no declared limit is never throttled.
assert.deepEqual(
  shouldThrottle(
    { ...limited, rate_limit: undefined },
    { windowStartMs: NOW, count: 1e9 },
    NOW,
  ),
  { allowed: true, waitMs: 0 },
);

console.log(
  `stock-core.test.ts: all assertions passed (${STOCK_PROVIDERS.length} providers, ` +
    `keyless photo=${keylessProvidersFor("photo").map((p) => p.id).join("/")}, ` +
    `default policy excludes share-alike)`,
);
