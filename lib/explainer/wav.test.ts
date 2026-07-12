import assert from "node:assert/strict";
import {
  buildWav,
  bytesPerMs,
  parseWav,
  silencePcm,
  stitchWavClips,
  type WavFormat,
} from "./wav";

const FMT: WavFormat = { channels: 1, sampleRate: 24000, bitsPerSample: 16 };

/** Synthetic clip of `ms` milliseconds filled with a marker byte. */
function clip(ms: number, marker: number): Buffer {
  const pcm = Buffer.alloc(Math.round(bytesPerMs(FMT) * ms), marker);
  return buildWav(FMT, pcm);
}

// --- round trip: buildWav -> parseWav ---
const rt = parseWav(clip(500, 7));
assert.deepEqual(rt.format, FMT);
assert.equal(rt.durationMs, 500);
assert.ok(rt.pcm.every((b) => b === 7));

// --- parse rejects garbage ---
assert.throws(() => parseWav(Buffer.from("not a wav file at all........................")));

// --- parse tolerates an extra chunk between fmt and data ---
{
  const pcm = Buffer.alloc(480, 3); // 10ms
  const base = buildWav(FMT, pcm);
  // Splice a 4-byte "LIST" chunk between fmt (ends at 36) and data.
  const extra = Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]);
  const spliced = Buffer.concat([base.subarray(0, 36), extra, base.subarray(36)]);
  spliced.writeUInt32LE(spliced.length - 8, 4);
  const parsed = parseWav(spliced);
  assert.equal(parsed.durationMs, 10);
  assert.ok(parsed.pcm.every((b) => b === 3));
}

// --- silence is sample-aligned ---
{
  const s = silencePcm(FMT, 300);
  assert.equal(s.length % 2, 0);
  assert.equal(s.length, 300 * bytesPerMs(FMT));
}

// --- stitching: timeline math ---
{
  const track = stitchWavClips([clip(1000, 1), clip(500, 2), clip(250, 3)], {
    gapMs: 300,
    leadInMs: 1500,
  });
  assert.equal(track.segments.length, 3);
  assert.deepEqual(
    track.segments.map((s) => ({ i: s.index, start: s.startMs, dur: s.durationMs })),
    [
      { i: 0, start: 1500, dur: 1000 },
      { i: 1, start: 2800, dur: 500 }, // 1500 + 1000 + 300
      { i: 2, start: 3600, dur: 250 }, // 2800 + 500 + 300
    ],
  );
  assert.equal(track.totalMs, 3850);
  // The stitched output must itself parse back to the same totals.
  const reparsed = parseWav(track.wav);
  assert.equal(reparsed.durationMs, 3850);
  assert.deepEqual(reparsed.format, FMT);
}

// --- stitching rejects mixed formats ---
{
  const other = buildWav({ ...FMT, sampleRate: 44100 }, Buffer.alloc(882));
  assert.throws(() => stitchWavClips([clip(100, 1), other]), /format mismatch/);
}

// --- stitching rejects empty input ---
assert.throws(() => stitchWavClips([]), /no clips/);

console.log("wav.test.ts: all assertions passed");
