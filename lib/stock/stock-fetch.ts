// Network layer for royalty-free stock sourcing. Pure policy lives in
// stock-core.ts; this file only talks to the providers and normalises their
// wildly different response shapes into StockAsset.
//
// Every request identifies Arbor in the User-Agent. Wikimedia refuses anonymous
// generic agents outright, and the others treat it as good citizenship.

import {
  classifyLicense,
  type StockAsset,
  type StockMediaType,
} from "./stock-core";

const USER_AGENT =
  process.env.ARBOR_STOCK_USER_AGENT ??
  "arbor-media-pipeline/1.0 (https://github.com/Imhaohao/miyohacks)";

// Openverse cold-starts slowly: a first query measured 40.5s, with warm follow-up
// queries at ~0.7s. A 20s timeout aborts every first call and silently drops the
// cheapest provider, so the ceiling is set above the observed cold start.
const DEFAULT_TIMEOUT_MS = Number(process.env.ARBOR_STOCK_TIMEOUT_MS ?? 60_000);

async function getJson<T>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `${new URL(url).host} responded ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Openverse (keyless, CC0 photos + audio, NO video) ──────────────────────

interface OpenverseResult {
  title?: string;
  creator?: string;
  license?: string;
  url?: string;
  foreign_landing_url?: string;
  width?: number;
  height?: number;
  filetype?: string;
}

export async function searchOpenverse(args: {
  query: string;
  media: "photo" | "audio";
  limit?: number;
  /** Comma-separated Openverse licence codes. Defaults to "cc0,by". */
  licenses?: string;
}): Promise<StockAsset[]> {
  // cc0 + by only. CC BY-SA is excluded at the QUERY level so copyleft material
  // never enters the pipeline. Restricting to cc0 alone was tried first and
  // collapsed the result pool to archival oddities with nothing topical.
  const path = args.media === "photo" ? "images" : "audio";
  const licenses = args.licenses ?? "cc0,by";
  const url =
    `https://api.openverse.org/v1/${path}/?q=${encodeURIComponent(args.query)}` +
    `&license=${encodeURIComponent(licenses)}&page_size=${args.limit ?? 8}`;
  const data = await getJson<{ results?: OpenverseResult[] }>(url);
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      provider: "openverse",
      media: args.media,
      url: r.url as string,
      source_page: r.foreign_landing_url,
      title: r.title,
      creator: r.creator,
      license_raw: r.license,
      license: classifyLicense(r.license),
      width: r.width,
      height: r.height,
      mime: r.filetype,
    }));
}

// ─── Pexels (key in Authorization header, photos + video) ───────────────────

interface PexelsVideoFile {
  link?: string;
  width?: number;
  height?: number;
  file_type?: string;
  quality?: string;
}
interface PexelsVideo {
  url?: string;
  duration?: number;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
}
interface PexelsPhoto {
  url?: string;
  photographer?: string;
  alt?: string;
  width?: number;
  height?: number;
  src?: { large2x?: string; large?: string; original?: string };
}

export async function searchPexels(args: {
  query: string;
  media: "photo" | "video";
  apiKey: string;
  limit?: number;
  orientation?: "landscape" | "portrait";
}): Promise<StockAsset[]> {
  const per = args.limit ?? 8;
  // Bare key, no "Bearer" prefix — Pexels rejects the bearer form.
  const headers = { authorization: args.apiKey };
  const orient = args.orientation ? `&orientation=${args.orientation}` : "";

  if (args.media === "video") {
    const data = await getJson<{ videos?: PexelsVideo[] }>(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(args.query)}&per_page=${per}${orient}`,
      headers,
    );
    return (data.videos ?? []).flatMap((v): StockAsset[] => {
      // Prefer an HD-ish progressive file; Pexels returns several renditions.
      const files = (v.video_files ?? []).filter((f) => f.link);
      const best =
        files.find((f) => (f.width ?? 0) >= 1280 && (f.width ?? 0) <= 2048) ??
        files.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
      if (!best?.link) return [];
      return [
        {
          provider: "pexels",
          media: "video" as const,
          url: best.link,
          source_page: v.url,
          title: v.url?.split("/").filter(Boolean).pop()?.replace(/-/g, " "),
          creator: v.user?.name,
          license_raw: "Pexels License",
          license: classifyLicense("pexels"),
          width: best.width,
          height: best.height,
          duration_seconds: v.duration,
          mime: best.file_type,
        },
      ];
    });
  }

  const data = await getJson<{ photos?: PexelsPhoto[] }>(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(args.query)}&per_page=${per}${orient}`,
    headers,
  );
  return (data.photos ?? [])
    .filter((p) => p.src?.large2x || p.src?.original)
    .map((p) => ({
      provider: "pexels",
      media: "photo" as const,
      url: (p.src?.large2x ?? p.src?.original) as string,
      source_page: p.url,
      title: p.alt,
      creator: p.photographer,
      license_raw: "Pexels License",
      license: classifyLicense("pexels"),
      width: p.width,
      height: p.height,
    }));
}

// ─── Pixabay (key as query param, photos + video) ───────────────────────────

interface PixabayVideoStream {
  url?: string;
  width?: number;
  height?: number;
}
interface PixabayVideo {
  pageURL?: string;
  duration?: number;
  user?: string;
  tags?: string;
  videos?: Record<string, PixabayVideoStream>;
}
interface PixabayImage {
  pageURL?: string;
  user?: string;
  tags?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export async function searchPixabay(args: {
  query: string;
  media: "photo" | "video";
  apiKey: string;
  limit?: number;
}): Promise<StockAsset[]> {
  const per = Math.max(3, args.limit ?? 8);
  const base = args.media === "video" ? "videos/" : "";
  const data = await getJson<{ hits?: Array<PixabayVideo & PixabayImage> }>(
    `https://pixabay.com/api/${base}?key=${encodeURIComponent(args.apiKey)}` +
      `&q=${encodeURIComponent(args.query)}&per_page=${per}&safesearch=true`,
  );
  return (data.hits ?? []).flatMap((h): StockAsset[] => {
    if (args.media === "video") {
      const streams = Object.values(h.videos ?? {}).filter((s) => s?.url);
      const best =
        streams.find((s) => (s.width ?? 0) >= 1280) ??
        streams.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
      if (!best?.url) return [];
      return [
        {
          provider: "pixabay",
          media: "video" as const,
          url: best.url,
          source_page: h.pageURL,
          title: h.tags,
          creator: h.user,
          license_raw: "Pixabay Content License",
          license: classifyLicense("pixabay"),
          width: best.width,
          height: best.height,
          duration_seconds: h.duration,
        },
      ];
    }
    if (!h.largeImageURL) return [];
    return [
      {
        provider: "pixabay",
        media: "photo" as const,
        url: h.largeImageURL,
        source_page: h.pageURL,
        title: h.tags,
        creator: h.user,
        license_raw: "Pixabay Content License",
        license: classifyLicense("pixabay"),
        width: h.imageWidth,
        height: h.imageHeight,
      },
    ];
  });
}

// ─── Wikimedia Commons (keyless video, but CC BY-SA + WebM/Ogg) ─────────────

interface CommonsPage {
  title?: string;
  imageinfo?: Array<{
    url?: string;
    width?: number;
    height?: number;
    mime?: string;
    duration?: number;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

export async function searchWikimedia(args: {
  query: string;
  media: "photo" | "video";
  limit?: number;
}): Promise<StockAsset[]> {
  const filetype = args.media === "video" ? "video" : "bitmap";
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&generator=search&gsrnamespace=6` +
    `&gsrsearch=${encodeURIComponent(`filetype:${filetype} ${args.query}`)}` +
    `&gsrlimit=${args.limit ?? 8}` +
    `&prop=imageinfo&iiprop=url|extmetadata|size|mime`;
  const data = await getJson<{ query?: { pages?: Record<string, CommonsPage> } }>(url);
  const pages = Object.values(data.query?.pages ?? {});
  return pages.flatMap((p): StockAsset[] => {
    const info = p.imageinfo?.[0];
    if (!info?.url) return [];
    const meta = info.extmetadata ?? {};
    const licenseRaw = meta.LicenseShortName?.value;
    const artist = meta.Artist?.value?.replace(/<[^>]*>/g, "").trim();
    return [
      {
        provider: "wikimedia",
        media: args.media,
        url: info.url,
        source_page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title ?? "")}`,
        title: p.title?.replace(/^File:/, ""),
        creator: artist,
        license_raw: licenseRaw,
        license: classifyLicense(licenseRaw),
        width: info.width,
        height: info.height,
        duration_seconds: info.duration,
        mime: info.mime,
      },
    ];
  });
}

/** Dispatch to the right provider. Unknown ids fail loudly. */
export async function searchProvider(args: {
  provider: string;
  query: string;
  media: StockMediaType;
  env: Record<string, string | undefined>;
  limit?: number;
  orientation?: "landscape" | "portrait";
}): Promise<StockAsset[]> {
  const { provider, query, media, env, limit, orientation } = args;
  switch (provider) {
    case "openverse":
      if (media === "video") return [];
      return searchOpenverse({ query, media, limit });
    case "pexels": {
      const key = env.PEXELS_API_KEY?.trim();
      if (!key || media === "audio") return [];
      return searchPexels({ query, media, apiKey: key, limit, orientation });
    }
    case "pixabay": {
      const key = env.PIXABAY_API_KEY?.trim();
      if (!key || media === "audio") return [];
      return searchPixabay({ query, media, apiKey: key, limit });
    }
    case "wikimedia":
      if (media === "audio") return [];
      return searchWikimedia({ query, media, limit });
    default:
      throw new Error(`unknown stock provider "${provider}"`);
  }
}
