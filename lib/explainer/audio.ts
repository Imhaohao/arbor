// Audio slice (slice 2) of the codebase-explainer pipeline.
//
// Synthesizes each lesson turn with the OpenAI TTS API (the repo's existing
// OPENAI_API_KEY — no new secret) using one stable voice per host, then
// stitches the clips into a single WAV via lib/explainer/wav.ts. The stitched
// timeline (exact per-turn start/duration) is returned so the video slice cuts
// slides on the same clock. Azure AI Speech can be added later as an alternate
// provider behind the same interface.

import type { ExplainerHost, LessonScript } from "../specialists/codebase-explainer";
import { stitchWavClips, type StitchedTrack } from "./wav";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

/** Default voice per host: OpenAI ships a voice literally named "nova"; "onyx"
 *  contrasts it well for the guide. Overridable per host via env. */
const DEFAULT_VOICES: Record<ExplainerHost, string> = {
  Nova: "nova",
  Kit: "onyx",
};

export function ttsModel(): string {
  return process.env.ARBOR_EXPLAINER_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
}

export function voiceForHost(host: ExplainerHost): string {
  const envKey = `ARBOR_EXPLAINER_VOICE_${host.toUpperCase()}`;
  return process.env[envKey]?.trim() || DEFAULT_VOICES[host];
}

async function synthesizeTurn(
  text: string,
  voice: string,
  apiKey: string,
  timeoutMs: number,
): Promise<Buffer> {
  const res = await fetch(OPENAI_SPEECH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ttsModel(),
      voice,
      input: text,
      response_format: "wav",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`TTS request failed (${res.status}): ${detail}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export interface LessonAudio extends StitchedTrack {
  /** Voice used per host, for the deliverable's honesty footer. */
  voices: Record<ExplainerHost, string>;
  model: string;
}

/**
 * Render the full lesson dialogue to one WAV track.
 * `leadInMs` reserves opening silence for the video's title card so both
 * slices share a timeline. Turns are synthesized sequentially — a lesson is
 * 12-24 short clips and sequential keeps us far from TTS rate limits.
 */
export async function synthesizeLessonAudio(
  lesson: LessonScript,
  opts: { gapMs?: number; leadInMs?: number; timeoutMs?: number } = {},
): Promise<LessonAudio> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set — cannot render explainer audio");
  if (lesson.script.length === 0) throw new Error("lesson has no turns to synthesize");

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const clips: Buffer[] = [];
  for (const turn of lesson.script) {
    clips.push(await synthesizeTurn(turn.line, voiceForHost(turn.speaker), apiKey, timeoutMs));
  }

  const track = stitchWavClips(clips, {
    gapMs: opts.gapMs ?? 300,
    leadInMs: opts.leadInMs ?? 0,
  });
  return {
    ...track,
    voices: { Nova: voiceForHost("Nova"), Kit: voiceForHost("Kit") },
    model: ttsModel(),
  };
}
