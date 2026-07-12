// Render orchestrator for the codebase-explainer specialist.
//
// Given a LessonScript, renders whichever artifacts the flags request:
//   audio (ARBOR_EXPLAINER_AUDIO_ENABLED)  -> audio.wav   (slice 2)
//   video (ARBOR_EXPLAINER_VIDEO_ENABLED)  -> video.mp4   (slice 3, implies audio synth)
// plus lesson.json (the structured script) alongside them.
//
// Everything is fail-soft: any error is captured per-artifact and reported in
// the RenderOutcome, never thrown, so the specialist always delivers the
// script and an HONEST account of what did or did not render. Files land under
// public/explainers/<id>/ so the Next dev server serves them directly.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LessonScript } from "../specialists/codebase-explainer";
import { synthesizeLessonAudio } from "./audio";
import { renderLessonVideo } from "./video";

/** Title-card duration; also the audio lead-in so both slices share a clock. */
const LEAD_IN_MS = 1_500;
const GAP_MS = 300;

export function explainerFlagOn(name: string): boolean {
  const v = (process.env[name] ?? "").toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(v);
}

export interface ArtifactResult {
  requested: boolean;
  path?: string;
  publicUrl?: string;
  detail?: string;
  error?: string;
}

export interface RenderOutcome {
  outDir?: string;
  audio: ArtifactResult;
  video: ArtifactResult;
}

function baseOutputDir(): string {
  return resolve(process.env.ARBOR_EXPLAINER_OUTPUT_DIR?.trim() || join(process.cwd(), "public", "explainers"));
}

function publicUrlFor(id: string, filename: string): string | undefined {
  // Only meaningful when writing inside public/ (the default).
  return process.env.ARBOR_EXPLAINER_OUTPUT_DIR ? undefined : `/explainers/${id}/${filename}`;
}

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Render requested artifacts for `lesson` under <outputDir>/<id>/.
 * Never throws — every failure is folded into the outcome.
 */
export async function renderExplainerArtifacts(lesson: LessonScript, id: string): Promise<RenderOutcome> {
  const wantAudio = explainerFlagOn("ARBOR_EXPLAINER_AUDIO_ENABLED");
  const wantVideo = explainerFlagOn("ARBOR_EXPLAINER_VIDEO_ENABLED");
  const outcome: RenderOutcome = {
    audio: { requested: wantAudio },
    video: { requested: wantVideo },
  };
  if (!wantAudio && !wantVideo) return outcome;

  // Sanitize id for filesystem use.
  const safeId = id.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "local";
  let outDir: string;
  try {
    outDir = join(baseOutputDir(), safeId);
    await mkdir(outDir, { recursive: true });
    outcome.outDir = outDir;
    await writeFile(join(outDir, "lesson.json"), JSON.stringify(lesson, null, 2));
  } catch (e) {
    const msg = `no writable filesystem for artifacts: ${e instanceof Error ? e.message : String(e)}`;
    if (wantAudio) outcome.audio.error = msg;
    if (wantVideo) outcome.video.error = msg;
    return outcome;
  }

  // Audio synth is needed for video too (the timeline drives slide cuts).
  let audioWavPath: string | undefined;
  let track: Awaited<ReturnType<typeof synthesizeLessonAudio>> | undefined;
  try {
    track = await synthesizeLessonAudio(lesson, {
      gapMs: GAP_MS,
      leadInMs: wantVideo ? LEAD_IN_MS : 0,
    });
    audioWavPath = join(outDir, "audio.wav");
    await writeFile(audioWavPath, track.wav);
    if (wantAudio) {
      outcome.audio = {
        requested: true,
        path: audioWavPath,
        publicUrl: publicUrlFor(safeId, "audio.wav"),
        detail: `${fmtMs(track.totalMs)}, ${lesson.script.length} turns, voices Nova=${track.voices.Nova} Kit=${track.voices.Kit} (${track.model})`,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (wantAudio) outcome.audio.error = msg;
    if (wantVideo) outcome.video.error = `audio synthesis failed upstream: ${msg}`;
    return outcome;
  }

  if (wantVideo && track && audioWavPath) {
    try {
      const rendered = await renderLessonVideo(lesson, audioWavPath, track.segments, {
        workDir: outDir,
        leadInMs: LEAD_IN_MS,
        totalMs: track.totalMs,
      });
      outcome.video = {
        requested: true,
        path: rendered.videoPath,
        publicUrl: publicUrlFor(safeId, "video.mp4"),
        detail: `${fmtMs(rendered.totalMs)}, ${rendered.slideCount} slides, 1280x720 H.264`,
      };
    } catch (e) {
      outcome.video.error = e instanceof Error ? e.message : String(e);
    }
  }

  return outcome;
}
