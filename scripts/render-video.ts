/**
 * Native video renderer — the fallback that makes the media DAG produce real
 * output when no third-party generation vendor is reachable.
 *
 * Higgsfield (video) and ElevenLabs (music) are the preferred specialists, but
 * both need credentials this deployment does not have. Rather than emit a
 * placeholder, this renders an actual MP4 from whatever IS available, in order:
 *
 *   BACKEND "openai"  (used when OPENAI_API_KEY has quota)
 *     brief   gpt-4o-mini        -> shot list + narration
 *     stills  gpt-image-1-mini   -> one generated photo per beat
 *     voice   gpt-4o-mini-tts    -> narration audio
 *
 *   BACKEND "local"   ($0, no network egress beyond localhost)
 *     brief   Ollama             -> shot list + narration
 *     stills  SVG + sharp        -> composed motion-graphic scenes
 *     voice   macOS `say`        -> narration audio
 *
 *   assemble (both)  ffmpeg-static -> Ken Burns push per beat, concat, mux
 *
 * It auto-falls back from openai to local on an auth/quota error, because a
 * missing credential should degrade the OUTPUT, never fail the task.
 *
 * WHAT THIS IS NOT: generated motion footage. Each beat is a still with a
 * synthetic camera push. In `local` mode the stills are composed graphics, not
 * photographs of anything. The manifest records `backend` and
 * `motion: "synthetic_ken_burns"` so nothing downstream can mistake either for
 * video-diffusion output.
 *
 * Usage:
 *   npx tsx scripts/render-video.ts "<prompt>" [--beats 5] [--vertical] [--local]
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import {
  fishAudioApiKey,
  fishAudioModel,
  synthesizeSpeech,
} from "../lib/specialists/fish-audio-voice";
import {
  availableProviders,
  buildCredits,
  buildStockQuery,
  pickBestAsset,
  type StockAsset,
} from "../lib/stock/stock-core";
import { searchProvider } from "../lib/stock/stock-fetch";

const run = promisify(execFile);

const OPENAI_BASE = "https://api.openai.com/v1";
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const BRIEF_MODEL = process.env.ARBOR_VIDEO_BRIEF_MODEL ?? "gpt-4o-mini";
const IMAGE_MODEL = process.env.ARBOR_VIDEO_IMAGE_MODEL ?? "gpt-image-1-mini";
const TTS_MODEL = process.env.ARBOR_VIDEO_TTS_MODEL ?? "gpt-4o-mini-tts";
const TTS_VOICE = process.env.ARBOR_VIDEO_TTS_VOICE ?? "nova";
const LOCAL_BRIEF_MODEL = process.env.ARBOR_VIDEO_LOCAL_MODEL ?? "qwen2.5:7b";

type Backend = "openai" | "local";

interface Beat {
  /** Still-image prompt (openai) / scene subject (local). */
  shot: string;
  /** One spoken sentence. */
  narration: string;
  /** Short on-screen headline, used by the local scene composer. */
  headline?: string;
}

const BRIEF_SYSTEM =
  "You are a video director. Return ONLY minified JSON of the form " +
  '{"beats":[{"shot":"...","headline":"...","narration":"..."}]}. ' +
  "`shot` is a vivid still-image prompt for one moment: subject, setting, " +
  "expression, lighting. `headline` is at most 4 words of on-screen text. " +
  "`narration` is one spoken sentence of at most 18 words. " +
  "Tell a clear emotional arc across the beats. Never name a real person.";

function apiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

/** Load .env.local without adding a dotenv dependency. */
async function loadEnv(): Promise<void> {
  try {
    const raw = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, name, value] = match;
      if (!process.env[name]) {
        process.env[name] = value.replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

class QuotaError extends Error {}

async function openai<T>(path: string, body: unknown): Promise<T> {
  const key = apiKey();
  if (!key) throw new QuotaError("OPENAI_API_KEY is not set");
  const response = await fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    if (response.status === 401 || response.status === 429) {
      throw new QuotaError(`OpenAI ${path} ${response.status}: ${text}`);
    }
    throw new Error(`OpenAI ${path} failed ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

function parseBeats(content: string, beats: number): Beat[] {
  // Local models sometimes wrap JSON in prose or a fenced block.
  const json = /\{[\s\S]*\}/.exec(content)?.[0] ?? content;
  const parsed = JSON.parse(json) as { beats?: Beat[] };
  const list = (parsed.beats ?? []).filter(
    (b) => b && typeof b.shot === "string" && typeof b.narration === "string",
  );
  if (list.length === 0) throw new Error("brief returned no usable beats");
  return list.slice(0, beats);
}

async function buildBriefOpenAI(prompt: string, beats: number): Promise<Beat[]> {
  const data = await openai<{ choices: Array<{ message: { content: string } }> }>(
    "/chat/completions",
    {
      model: BRIEF_MODEL,
      messages: [
        { role: "system", content: BRIEF_SYSTEM },
        { role: "user", content: `Make exactly ${beats} beats for: ${prompt}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    },
  );
  return parseBeats(data.choices[0].message.content, beats);
}

async function buildBriefLocal(prompt: string, beats: number): Promise<Beat[]> {
  const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_BRIEF_MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.8 },
      messages: [
        { role: "system", content: BRIEF_SYSTEM },
        { role: "user", content: `Make exactly ${beats} beats for: ${prompt}` },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Ollama chat failed ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const data = (await response.json()) as { message?: { content?: string } };
  return parseBeats(data.message?.content ?? "", beats);
}

// ─── local scene composition ────────────────────────────────────────────────

/** Palettes cycle per beat so consecutive scenes read as distinct shots. */
const PALETTES: Array<[string, string, string]> = [
  ["#1b2a4a", "#0d1220", "#7fb2ff"],
  ["#8c1d1d", "#1a1020", "#ffb4a2"],
  ["#123a2e", "#08130f", "#7ae0b5"],
  ["#3b2357", "#140d20", "#c9a7ff"],
  ["#8a5a12", "#1c1206", "#ffd08a"],
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Greedy wrap so long narration lines do not overflow the frame. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Deterministic pseudo-random so a re-render of the same beat looks the same. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function confetti(count: number, w: number, h: number, seed: number, color: string): string {
  const rand = seeded(seed);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = rand() * w;
    const y = rand() * h * 0.85;
    const r = 3 + rand() * 7;
    const o = (0.18 + rand() * 0.4).toFixed(2);
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${o}"/>`,
    );
  }
  return parts.join("");
}

/** Simple celebratory silhouette — arms up, feet off the ground. */
function jumpingFigure(cx: number, baseY: number, scale: number, color: string): string {
  const s = scale;
  return `<g transform="translate(${cx},${baseY}) scale(${s})" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" opacity="0.9">
    <circle cx="0" cy="-96" r="17" fill="${color}" stroke="none"/>
    <path d="M0 -79 L0 -26"/>
    <path d="M0 -68 L-34 -104"/>
    <path d="M0 -68 L34 -104"/>
    <path d="M0 -26 L-24 14"/>
    <path d="M0 -26 L24 14"/>
  </g>`;
}

async function renderSceneLocal(
  beat: Beat,
  index: number,
  total: number,
  w: number,
  h: number,
  dir: string,
): Promise<string> {
  const [from, to, accent] = PALETTES[index % PALETTES.length];
  const headline = (beat.headline?.trim() || beat.shot).slice(0, 48);
  const headSize = headline.length > 26 ? Math.round(w * 0.052) : Math.round(w * 0.072);
  const subLines = wrap(beat.narration, w > h ? 58 : 34).slice(0, 3);
  const subSize = Math.round(w * 0.023);
  const cy = h * 0.46;

  // Progress dots make the beat position legible without a timeline UI.
  const dots = Array.from({ length: total }, (_, i) => {
    const gap = 22;
    const x = w / 2 - ((total - 1) * gap) / 2 + i * gap;
    return `<circle cx="${x}" cy="${h - 46}" r="${i === index ? 6 : 4}" fill="${accent}" opacity="${i === index ? 0.95 : 0.32}"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${confetti(index === 0 ? 14 : 30 + index * 8, w, h, 1000 + index * 77, accent)}
  ${jumpingFigure(w * 0.5, h * 0.86, Math.min(w, h) / 620, accent)}
  <text x="${w / 2}" y="${cy}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="${headSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(headline)}</text>
  ${subLines
    .map(
      (line, i) =>
        `<text x="${w / 2}" y="${cy + headSize * 0.85 + i * subSize * 1.5}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${subSize}" fill="#ffffff" opacity="0.82" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join("")}
  ${dots}
</svg>`;

  const path = join(dir, `beat-${index}.png`);
  await sharp(Buffer.from(svg)).png().toFile(path);
  return path;
}

/**
 * Fetch a real royalty-free photo for one beat.
 *
 * This is the CHEAPEST source of real imagery: $0 per asset against per-image
 * billing for generation. Returns undefined when nothing suitable is found, so
 * the caller can fall back rather than fail the render.
 *
 * `allowObligations` is off by default — without it, share-alike sources are
 * excluded so an unattended render cannot silently put a copyleft condition on
 * the finished video.
 */
async function fetchStockStill(
  beat: Beat,
  index: number,
  outW: number,
  outH: number,
  dir: string,
  allowShareAlike: boolean,
): Promise<{ path: string; asset: StockAsset } | undefined> {
  const full = buildStockQuery(beat.shot);
  if (!full) return undefined;
  // Progressively broaden: a 4-word query is precise but often returns nothing,
  // and an empty result set is worse than a looser match.
  const queries = Array.from(
    new Set([full, buildStockQuery(beat.shot, 2), buildStockQuery(beat.shot, 1)]),
  ).filter(Boolean);

  const providers = availableProviders({
    media: "photo",
    env: process.env,
    allowShareAlike,
  });
  const orientation = outH > outW ? "portrait" : "landscape";

  for (const provider of providers) {
    let candidates: StockAsset[] = [];
    for (const query of queries) {
      try {
        candidates = await searchProvider({
          provider: provider.id,
          query,
          media: "photo",
          env: process.env,
          limit: 8,
          orientation,
        });
      } catch (error) {
        console.log(
          `      ${provider.id} search failed (${(error as Error).message.slice(0, 60)})`,
        );
        break;
      }
      if (candidates.length > 0) break;
    }
    const best = pickBestAsset(candidates, outW);
    if (!best) continue;
    try {
      const response = await fetch(best.url, {
        headers: { "user-agent": "arbor-media-pipeline/1.0" },
      });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const path = join(dir, `beat-${index}.png`);
      // Normalise to the exact frame: stock assets arrive at arbitrary sizes and
      // aspect ratios, and ffmpeg's zoompan expects a consistent input.
      await sharp(bytes)
        .resize(outW * 2, outH * 2, { fit: "cover", position: "attention" })
        .png()
        .toFile(path);
      return { path, asset: best };
    } catch {
      continue;
    }
  }
  return undefined;
}

async function renderStillOpenAI(
  shot: string,
  size: string,
  index: number,
  dir: string,
): Promise<string> {
  const data = await openai<{ data: Array<{ b64_json?: string; url?: string }> }>(
    "/images/generations",
    {
      model: IMAGE_MODEL,
      prompt:
        `${shot}. Photorealistic, cinematic, natural lighting, shallow depth of ` +
        `field, high detail. No text, no letters, no watermarks.`,
      size,
      n: 1,
    },
  );
  const first = data.data[0];
  const path = join(dir, `beat-${index}.png`);
  if (first?.b64_json) {
    await writeFile(path, Buffer.from(first.b64_json, "base64"));
  } else if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error(`image download failed ${img.status}`);
    await writeFile(path, Buffer.from(await img.arrayBuffer()));
  } else {
    throw new Error("image response contained neither b64_json nor url");
  }
  return path;
}

async function renderNarrationOpenAI(text: string, dir: string): Promise<string> {
  const key = apiKey();
  if (!key) throw new QuotaError("OPENAI_API_KEY is not set");
  const response = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    if (response.status === 401 || response.status === 429) {
      throw new QuotaError(`TTS ${response.status}: ${body}`);
    }
    throw new Error(`TTS failed ${response.status}: ${body}`);
  }
  const path = join(dir, "narration.mp3");
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

/**
 * Fish Audio TTS. Preferred over macOS `say` when a key is present: real neural
 * narration instead of a system voice. `model` is an HTTP header, not a body
 * field — see lib/specialists/fish-audio-voice.ts.
 */
async function renderNarrationFish(text: string, dir: string): Promise<string> {
  const key = fishAudioApiKey();
  if (!key) throw new QuotaError("FISH_AUDIO_API_KEY is not set");
  const rendered = await synthesizeSpeech({ text, apiKey: key });
  const path = join(dir, "narration.mp3");
  await writeFile(path, rendered.bytes);
  return path;
}

/** macOS `say` -> aiff -> m4a. Free and offline. */
async function renderNarrationLocal(text: string, dir: string): Promise<string> {
  const aiff = join(dir, "narration.aiff");
  const out = join(dir, "narration.m4a");
  const voice = process.env.ARBOR_VIDEO_SAY_VOICE;
  const args = voice ? ["-v", voice, "-o", aiff, text] : ["-o", aiff, text];
  await run("say", args);
  await run(ffmpeg(), ["-y", "-i", aiff, "-c:a", "aac", "-b:a", "192k", out]);
  return out;
}

function ffmpeg(): string {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");
  return ffmpegPath;
}

/**
 * Duration in seconds, parsed from ffmpeg's own stderr report.
 *
 * ffmpeg writes the Duration line to stderr and exits 0 on a readable file, so
 * stderr must be read from the SUCCESS path too — reading it only on throw
 * silently reports 0 for every valid input.
 */
async function mediaDurationSeconds(path: string): Promise<number> {
  let stderr = "";
  try {
    stderr = (await run(ffmpeg(), ["-i", path, "-f", "null", "-"])).stderr ?? "";
  } catch (error) {
    stderr = String((error as { stderr?: string }).stderr ?? "");
  }
  const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function main(): Promise<void> {
  await loadEnv();
  const argv = process.argv.slice(2);
  const prompt = argv.find((a) => !a.startsWith("--"));
  if (!prompt) {
    console.error(
      'usage: npx tsx scripts/render-video.ts "<prompt>" [--beats N] [--vertical] [--local]',
    );
    process.exit(1);
  }
  const beatsArg = argv.indexOf("--beats");
  const beatCount = beatsArg >= 0 ? Number(argv[beatsArg + 1]) || 5 : 5;
  const vertical = argv.includes("--vertical");
  let backend: Backend = argv.includes("--local") ? "local" : "openai";
  // Stock is on by default — it is the cheapest source of real imagery.
  const useStock = !argv.includes("--no-stock");
  // Opt in to copyleft (CC BY-SA). Off by default: share-alike propagates to the
  // finished video. CC BY needs no flag — credits are generated automatically.
  const allowShareAlike = argv.includes("--allow-share-alike");

  const imageSize = vertical ? "1024x1536" : "1536x1024";
  const outW = vertical ? 720 : 1280;
  const outH = vertical ? 1280 : 720;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(
    process.env.ARBOR_VIDEO_OUTPUT_DIR ?? join(process.cwd(), "public", "videos"),
    stamp,
  );
  const workDir = join(outDir, "work");
  await mkdir(workDir, { recursive: true });

  console.log(`prompt : ${prompt}`);
  console.log(`format : ${vertical ? "vertical 9:16" : "widescreen 16:9"} ${outW}x${outH}`);
  console.log(`output : ${outDir}\n`);

  // ── 1. brief ──
  let beats: Beat[];
  if (backend === "openai") {
    try {
      console.log(`[1/4] brief via ${BRIEF_MODEL}…`);
      beats = await buildBriefOpenAI(prompt, beatCount);
    } catch (error) {
      if (!(error instanceof QuotaError)) throw error;
      console.log(`      openai unavailable (${error.message.slice(0, 90)})`);
      console.log(`      -> falling back to local backend`);
      backend = "local";
      console.log(`[1/4] brief via ollama ${LOCAL_BRIEF_MODEL}…`);
      beats = await buildBriefLocal(prompt, beatCount);
    }
  } else {
    console.log(`[1/4] brief via ollama ${LOCAL_BRIEF_MODEL}…`);
    beats = await buildBriefLocal(prompt, beatCount);
  }
  beats.forEach((b, i) =>
    console.log(`   beat ${i + 1}: ${(b.headline ?? b.shot).slice(0, 60)}`),
  );

  // ── 2. stills ──
  //
  // Source preference is cheapest-real-first:
  //   1. royalty-free stock  $0        real photographs
  //   2. generated stills    $ per img photorealistic, matches the brief exactly
  //   3. composed SVG        $0        always works, but graphics not footage
  //
  // Stock leads because it is both free AND real imagery — generation only wins
  // on prompt fidelity, which is worth paying for only when it is affordable.
  const stockProviders = availableProviders({
    media: "photo",
    env: process.env,
    allowShareAlike,
  });
  console.log(
    `\n[2/4] ${beats.length} stills — stock:${useStock ? stockProviders.map((p) => p.id).join("/") || "none" : "off"}` +
      ` → ${backend === "openai" ? IMAGE_MODEL : "svg"} → svg`,
  );

  const stills: string[] = [];
  const usedAssets: StockAsset[] = [];
  const stillSources: string[] = [];

  for (const [i, beat] of beats.entries()) {
    let placed = false;

    if (useStock && stockProviders.length > 0) {
      const found = await fetchStockStill(
        beat, i, outW, outH, workDir, allowShareAlike,
      );
      if (found) {
        stills.push(found.path);
        usedAssets.push(found.asset);
        stillSources.push(`stock:${found.asset.provider}`);
        console.log(
          `   still ${i + 1}/${beats.length}  stock:${found.asset.provider} (${found.asset.license})`,
        );
        placed = true;
      }
    }

    if (!placed && backend === "openai") {
      try {
        stills.push(await renderStillOpenAI(beat.shot, imageSize, i, workDir));
        stillSources.push(IMAGE_MODEL);
        console.log(`   still ${i + 1}/${beats.length}  ${IMAGE_MODEL}`);
        placed = true;
      } catch (error) {
        if (!(error instanceof QuotaError)) throw error;
        console.log(`      image quota exhausted -> composed scenes from here on`);
        backend = "local";
      }
    }

    if (!placed) {
      stills.push(await renderSceneLocal(beat, i, beats.length, outW, outH, workDir));
      stillSources.push("svg");
      console.log(`   still ${i + 1}/${beats.length}  svg (composed)`);
    }
  }

  // ── 3. narration ──
  // Voice provider is chosen INDEPENDENTLY of the image backend: Fish Audio can
  // narrate a locally-composed video, which is the common case here since it
  // bills separately from OpenAI. Preference order is quality-first, with each
  // step degrading only on a credential/quota error.
  const narrationText = beats.map((b) => b.narration).join(" ");
  let audioPath: string | undefined;
  let voiceProvider = "macos:say";

  if (fishAudioApiKey()) {
    try {
      console.log(`\n[3/4] narration via fish.audio (${fishAudioModel()})…`);
      audioPath = await renderNarrationFish(narrationText, workDir);
      voiceProvider = `fish.audio:${fishAudioModel()}`;
    } catch (error) {
      console.log(
        `      fish.audio unavailable (${(error as Error).message.slice(0, 80)})`,
      );
    }
  }
  if (!audioPath && backend === "openai") {
    try {
      console.log(`\n[3/4] narration via ${TTS_MODEL}…`);
      audioPath = await renderNarrationOpenAI(narrationText, workDir);
      voiceProvider = TTS_MODEL;
    } catch (error) {
      if (!(error instanceof QuotaError)) throw error;
      console.log(`      openai tts unavailable -> macOS say`);
    }
  }
  if (!audioPath) {
    console.log(`\n[3/4] narration via macOS say…`);
    audioPath = await renderNarrationLocal(narrationText, workDir);
    voiceProvider = "macos:say";
  }
  const audioSeconds = await mediaDurationSeconds(audioPath);
  console.log(`   ${audioSeconds.toFixed(1)}s of narration`);

  // Beat length tracks the narration so picture and voice end together.
  const perBeat = Math.max(
    2.2,
    (audioSeconds > 0 ? audioSeconds : beats.length * 3.5) / stills.length,
  );
  const fps = 30;

  // ── 4. assemble ──
  console.log(`\n[4/4] assembling with ffmpeg (${perBeat.toFixed(2)}s/beat)…`);
  const clips: string[] = [];
  for (const [i, still] of stills.entries()) {
    const clip = join(workDir, `clip-${i}.mp4`);
    // Scale up before the zoom so the push never samples past source resolution.
    await run(ffmpeg(), [
      "-y", "-loop", "1", "-i", still,
      "-t", perBeat.toFixed(3),
      "-filter_complex",
      `scale=${outW * 2}:${outH * 2}:force_original_aspect_ratio=increase,` +
        `crop=${outW * 2}:${outH * 2},` +
        `zoompan=z='min(1+0.0009*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=${Math.round(perBeat * fps)}:s=${outW}x${outH}:fps=${fps},` +
        `format=yuv420p`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-r", String(fps),
      clip,
    ]);
    clips.push(clip);
    console.log(`   clip ${i + 1}/${stills.length}`);
  }

  const listPath = join(workDir, "clips.txt");
  await writeFile(
    listPath,
    clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const silent = join(workDir, "silent.mp4");
  await run(ffmpeg(), [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silent,
  ]);

  // Pad the audio to the picture length rather than using -shortest. With
  // -shortest a narration shorter than the picture silently truncates the video
  // mid-beat, dropping the final scenes entirely.
  const pictureSeconds = perBeat * stills.length;
  const finalPath = join(outDir, "video.mp4");
  await run(ffmpeg(), [
    "-y", "-i", silent, "-i", audioPath,
    "-c:v", "copy",
    "-af", "apad",
    "-c:a", "aac", "-b:a", "192k",
    "-t", pictureSeconds.toFixed(3),
    finalPath,
  ]);

  const duration = await mediaDurationSeconds(finalPath);
  const manifest = {
    prompt,
    rendered_at: stamp,
    output: finalPath,
    duration_seconds: Number(duration.toFixed(2)),
    width: outW,
    height: outH,
    fps,
    backend,
    // Explicit so nothing downstream mistakes this for generated motion footage.
    motion: "synthetic_ken_burns",
    stills:
      backend === "local"
        ? "composed_svg_motion_graphics"
        : "generated_photographic_stills",
    beat_count: stills.length,
    models: {
      brief: backend === "local" ? `ollama:${LOCAL_BRIEF_MODEL}` : BRIEF_MODEL,
      stills: stillSources,
      tts: voiceProvider,
    },
    // Per-asset provenance so every frame's licence is auditable after the fact.
    stock_assets: usedAssets.map((a) => ({
      provider: a.provider,
      url: a.url,
      source_page: a.source_page,
      title: a.title,
      creator: a.creator,
      license: a.license,
      license_raw: a.license_raw,
    })),
    license_policy: allowShareAlike
      ? "CC0 / Pexels / Pixabay / CC BY / CC BY-SA (copyleft opted in — see CREDITS.md)"
      : "CC0 / Pexels / Pixabay / CC BY (share-alike excluded)",
    narration: narrationText,
    beats,
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Credits are written whenever stock was used, even when attribution is
  // optional: crediting CC0/Pexels work is good practice, and on Pexels it is
  // what unlocks a higher rate limit.
  const credits = buildCredits(usedAssets);
  if (credits) {
    await writeFile(join(outDir, "CREDITS.md"), credits);
  }

  if (!process.env.ARBOR_VIDEO_KEEP_WORK) {
    await rm(workDir, { recursive: true, force: true });
  }

  console.log(`\nDONE  ${finalPath}`);
  console.log(`      ${duration.toFixed(1)}s · ${outW}x${outH} · ${fps}fps · backend=${backend}`);
  console.log(`      manifest: ${join(outDir, "manifest.json")}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
