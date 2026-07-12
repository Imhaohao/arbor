// Pure WAV (RIFF PCM) utilities for the codebase-explainer render pipeline.
//
// The TTS provider returns one WAV per lesson turn. We need (a) to stitch the
// turns into a single track with breathing-room silence between speakers, and
// (b) EXACT per-turn durations so the video slice can cut slides on the same
// clock the audio was built on. Doing both from the raw PCM keeps the whole
// sync story dependency-free and unit-testable — no ffprobe, no guessing.

export interface WavFormat {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export interface ParsedWav {
  format: WavFormat;
  /** Raw PCM bytes (the `data` chunk payload). */
  pcm: Buffer;
  durationMs: number;
}

export function bytesPerMs(format: WavFormat): number {
  return (format.sampleRate * format.channels * (format.bitsPerSample / 8)) / 1000;
}

/** Parse a RIFF/WAVE buffer. Walks chunks, so extra chunks (LIST, fact) between
 *  fmt and data are fine. Throws on non-PCM or malformed input. */
export function parseWav(buf: Buffer): ParsedWav {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE buffer");
  }
  let format: WavFormat | null = null;
  let pcm: Buffer | null = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const declared = buf.readUInt32LE(off + 4);
    const start = off + 8;
    // Streamed writers sometimes declare 0 or 0xFFFFFFFF for the data chunk;
    // clamp to what is actually present.
    const size = Math.min(declared === 0 && id === "data" ? buf.length - start : declared, buf.length - start);
    if (id === "fmt ") {
      const audioFormat = buf.readUInt16LE(start);
      // 1 = PCM, 0xFFFE = WAVE_FORMAT_EXTENSIBLE (still PCM for our providers).
      if (audioFormat !== 1 && audioFormat !== 0xfffe) {
        throw new Error(`unsupported WAV audio format ${audioFormat} (need PCM)`);
      }
      format = {
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bitsPerSample: buf.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      pcm = buf.subarray(start, start + size);
    }
    off = start + size + (size % 2); // chunks are word-aligned
  }
  if (!format || !pcm) throw new Error("WAV missing fmt or data chunk");
  return { format, pcm, durationMs: pcm.length / bytesPerMs(format) };
}

/** PCM silence of the given duration, sample-aligned. */
export function silencePcm(format: WavFormat, ms: number): Buffer {
  const frame = format.channels * (format.bitsPerSample / 8);
  const bytes = Math.round((bytesPerMs(format) * ms) / frame) * frame;
  return Buffer.alloc(Math.max(0, bytes));
}

/** Serialize PCM back into a standalone WAV file buffer. */
export function buildWav(format: WavFormat, pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(format.channels * (format.bitsPerSample / 8), 32);
  header.writeUInt16LE(format.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export interface StitchedSegment {
  /** Index into the input clip array (i.e. the lesson turn index). */
  index: number;
  startMs: number;
  durationMs: number;
}

export interface StitchedTrack {
  wav: Buffer;
  format: WavFormat;
  totalMs: number;
  /** Timeline of each input clip inside the stitched track (gaps excluded). */
  segments: StitchedSegment[];
}

/** Stitch per-turn WAV clips into one track: leadInMs of silence, then each
 *  clip separated by gapMs. All clips must share one format. */
export function stitchWavClips(
  clips: Buffer[],
  opts: { gapMs?: number; leadInMs?: number } = {},
): StitchedTrack {
  if (clips.length === 0) throw new Error("no clips to stitch");
  const gapMs = opts.gapMs ?? 300;
  const leadInMs = opts.leadInMs ?? 0;

  const parsed = clips.map(parseWav);
  const format = parsed[0].format;
  for (const [i, p] of parsed.entries()) {
    if (
      p.format.channels !== format.channels ||
      p.format.sampleRate !== format.sampleRate ||
      p.format.bitsPerSample !== format.bitsPerSample
    ) {
      throw new Error(`clip ${i} format mismatch: ${JSON.stringify(p.format)} vs ${JSON.stringify(format)}`);
    }
  }

  const perMs = bytesPerMs(format);
  const parts: Buffer[] = [];
  const segments: StitchedSegment[] = [];
  let cursor = 0;

  if (leadInMs > 0) {
    const lead = silencePcm(format, leadInMs);
    parts.push(lead);
    cursor += lead.length;
  }
  const gap = silencePcm(format, gapMs);
  for (const [i, p] of parsed.entries()) {
    if (i > 0 && gap.length > 0) {
      parts.push(gap);
      cursor += gap.length;
    }
    segments.push({ index: i, startMs: cursor / perMs, durationMs: p.durationMs });
    parts.push(p.pcm);
    cursor += p.pcm.length;
  }

  const pcm = Buffer.concat(parts);
  return { wav: buildWav(format, pcm), format, totalMs: pcm.length / perMs, segments };
}
