// Video slice (slice 3) of the codebase-explainer pipeline.
//
// SVG slides (lib/explainer/slides.ts) -> PNG via sharp -> H.264 MP4 via the
// ffmpeg-static binary, with the audio track from slice 2 muxed in. Slide cut
// points come from the stitched audio timeline, so narration and slides share
// one clock by construction.
//
// sharp and ffmpeg-static are lazy-loaded: sharp ships transitively with Next
// and ffmpeg-static is a devDependency, so environments without them (e.g. a
// Convex action) fail soft with a clear error the caller reports honestly.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LessonScript } from "../specialists/codebase-explainer";
import type { StitchedSegment } from "./wav";
import { buildTitleSlideSvg, buildTurnSlideSvg } from "./slides";

const execFileAsync = promisify(execFile);

async function loadSharp(): Promise<(input: Buffer) => { png(): { toBuffer(): Promise<Buffer> } }> {
  try {
    const mod = await import("sharp");
    return (mod.default ?? mod) as unknown as (input: Buffer) => { png(): { toBuffer(): Promise<Buffer> } };
  } catch {
    throw new Error("sharp is not available — cannot rasterize slides");
  }
}

async function loadFfmpegPath(): Promise<string> {
  try {
    const mod = await import("ffmpeg-static");
    const p = (mod.default ?? mod) as unknown as string | null;
    if (typeof p !== "string" || !p) throw new Error("empty path");
    return p;
  } catch {
    throw new Error("ffmpeg-static is not available — cannot encode video");
  }
}

export interface RenderedVideo {
  videoPath: string;
  slideCount: number;
  totalMs: number;
}

/**
 * Render the lesson video into `workDir` (slides + concat list as scratch,
 * `video.mp4` as the artifact). `segments` must be the stitched audio timeline
 * (indices = lesson turn indices); `leadInMs` is the title-card duration that
 * slice 2 reserved as opening silence.
 */
export async function renderLessonVideo(
  lesson: LessonScript,
  audioWavPath: string,
  segments: StitchedSegment[],
  opts: { workDir: string; leadInMs: number; totalMs: number },
): Promise<RenderedVideo> {
  if (segments.length !== lesson.script.length) {
    throw new Error(`segment/turn mismatch: ${segments.length} segments for ${lesson.script.length} turns`);
  }
  const sharp = await loadSharp();
  const ffmpeg = await loadFfmpegPath();

  const slidesDir = join(opts.workDir, "slides");
  await mkdir(slidesDir, { recursive: true });

  // Rasterize: title card + one slide per turn.
  const pngPaths: string[] = [];
  const titlePng = join(slidesDir, "slide-000.png");
  await writeFile(titlePng, await sharp(Buffer.from(buildTitleSlideSvg(lesson))).png().toBuffer());
  pngPaths.push(titlePng);
  for (const [i, turn] of lesson.script.entries()) {
    const p = join(slidesDir, `slide-${String(i + 1).padStart(3, "0")}.png`);
    await writeFile(p, await sharp(Buffer.from(buildTurnSlideSvg(turn, i, lesson.script.length, lesson))).png().toBuffer());
    pngPaths.push(p);
  }

  // Each slide holds from its turn's start until the next turn starts (gaps
  // included); the title card covers the lead-in; the last slide runs to EOF.
  const durationsSec: number[] = [];
  durationsSec.push((segments[0]?.startMs ?? opts.leadInMs) / 1000);
  for (let i = 0; i < segments.length; i++) {
    const end = i + 1 < segments.length ? segments[i + 1].startMs : opts.totalMs;
    durationsSec.push(Math.max(0.1, (end - segments[i].startMs) / 1000));
  }

  // ffmpeg concat demuxer input (last file repeated per demuxer requirement).
  const listLines: string[] = [];
  for (const [i, p] of pngPaths.entries()) {
    listLines.push(`file '${p}'`, `duration ${durationsSec[i].toFixed(3)}`);
  }
  listLines.push(`file '${pngPaths[pngPaths.length - 1]}'`);
  const listPath = join(opts.workDir, "slides.txt");
  await writeFile(listPath, listLines.join("\n") + "\n");

  const videoPath = join(opts.workDir, "video.mp4");
  await execFileAsync(
    ffmpeg,
    [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-i", audioWavPath,
      "-c:v", "libx264",
      "-r", "30",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      videoPath,
    ],
    { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 },
  );

  return { videoPath, slideCount: pngPaths.length, totalMs: opts.totalMs };
}
