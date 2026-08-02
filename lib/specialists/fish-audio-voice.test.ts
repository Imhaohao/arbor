import assert from "node:assert/strict";
import {
  FISH_AUDIO_VOICE_CONFIG,
  FISH_MODELS,
  FishAudioPaymentError,
  MAX_NARRATION_CHARS,
  buildNarrationText,
  fishAudioApiKey,
  fishAudioMissingEnv,
  fishAudioModel,
  fishAudioReferenceId,
  fishAudioVoice,
  isVoiceBrief,
  voicePublicUrl,
  voiceRunId,
} from "./fish-audio-voice";

const KEYS = [
  "FISH_AUDIO_API_KEY",
  "FISH_API_KEY",
  "ARBOR_FISH_AUDIO_API_KEY",
  "ARBOR_FISH_AUDIO_MODEL",
  "ARBOR_FISH_AUDIO_REFERENCE_ID",
  "ARBOR_VOICE_OUTPUT_DIR",
];
const saved = new Map(KEYS.map((k) => [k, process.env[k]]));
function clearKeys() {
  for (const k of KEYS) delete process.env[k];
}
function restoreKeys() {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ─── config ──────────────────────────────────────────────────────────────────
assert.equal(FISH_AUDIO_VOICE_CONFIG.agent_id, "fish-audio-voice");
assert.equal(FISH_AUDIO_VOICE_CONFIG.tier, "real");
assert.ok(FISH_AUDIO_VOICE_CONFIG.cost_baseline > 0);
const capText = FISH_AUDIO_VOICE_CONFIG.capabilities.join(" ").toLowerCase();
assert.ok(
  capText.includes("narration") || capText.includes("speech"),
  "capabilities must name speech work",
);
assert.ok(capText.includes("clone"), "voice cloning is the differentiator");
assert.ok(
  !capText.includes("edit photos") && !capText.includes("organize images"),
  "must not reuse the catalog boilerplate",
);
// Must not collide with the music specialist's lane, or both bid on everything.
assert.ok(
  !capText.includes("soundtrack") && !capText.includes("background music"),
  "voice capabilities must not claim music generation",
);

// ─── credentials ─────────────────────────────────────────────────────────────
clearKeys();
assert.equal(fishAudioApiKey(), undefined);
assert.deepEqual(fishAudioMissingEnv(), ["FISH_AUDIO_API_KEY"]);
process.env.FISH_AUDIO_API_KEY = "  fk-test  ";
assert.equal(fishAudioApiKey(), "fk-test", "key must be trimmed");
assert.deepEqual(fishAudioMissingEnv(), []);
clearKeys();
process.env.FISH_API_KEY = "alt-key";
assert.equal(fishAudioApiKey(), "alt-key", "provider alias accepted");
clearKeys();
process.env.FISH_AUDIO_API_KEY = "   ";
assert.equal(fishAudioApiKey(), undefined, "blank key counts as absent");
clearKeys();

// ─── model selection ─────────────────────────────────────────────────────────
// Defaults to the documented free tier.
assert.equal(fishAudioModel(), "s2.1-pro-free");
for (const m of FISH_MODELS) {
  process.env.ARBOR_FISH_AUDIO_MODEL = m;
  assert.equal(fishAudioModel(), m, `${m} must be accepted`);
}
// An unknown engine falls back rather than being sent through and 422'd.
process.env.ARBOR_FISH_AUDIO_MODEL = "s9-turbo-ultra";
assert.equal(fishAudioModel(), "s2.1-pro-free", "unknown model must fall back");
delete process.env.ARBOR_FISH_AUDIO_MODEL;

assert.equal(fishAudioReferenceId(), undefined);
process.env.ARBOR_FISH_AUDIO_REFERENCE_ID = "voice-abc";
assert.equal(fishAudioReferenceId(), "voice-abc");
delete process.env.ARBOR_FISH_AUDIO_REFERENCE_ID;

// ─── isVoiceBrief ────────────────────────────────────────────────────────────
for (const p of [
  "narrate this script",
  "I need a voiceover for the launch video",
  "text to speech for these lines",
  "record spoken dialogue",
  "read this aloud",
  "make an audiobook chapter",
]) {
  assert.ok(isVoiceBrief(p), `should be a voice brief: ${p}`);
}
for (const p of [
  "summarize this contract",
  "compose a soundtrack",
  "generate a video of a dog",
]) {
  assert.equal(isVoiceBrief(p), false, `should not be a voice brief: ${p}`);
}
// Music briefs must route to the music specialist, not this one.
assert.equal(
  isVoiceBrief("compose background music for the montage"),
  false,
  "music must not be captured by the voice lane",
);
assert.ok(isVoiceBrief("do the thing", "narration"));

// ─── buildNarrationText ──────────────────────────────────────────────────────
// The instruction wrapper must not be spoken back to the listener.
assert.equal(
  buildNarrationText("narrate the following: She got into Stanford."),
  "She got into Stanford.",
);
assert.equal(
  buildNarrationText("Read this aloud: Welcome to the show."),
  "Welcome to the show.",
);
assert.equal(
  buildNarrationText("please say this: hello there"),
  "hello there",
);
// Text with no wrapper survives untouched.
assert.equal(buildNarrationText("Welcome to the show."), "Welcome to the show.");
// Whitespace is normalised.
assert.equal(buildNarrationText("  a   b \n c  "), "a b c");
// Never returns empty when given non-empty input — an empty body would 422.
assert.ok(buildNarrationText("narrate this:").length > 0);
// Billing is per character, so input is clamped.
const clamped = buildNarrationText("x".repeat(MAX_NARRATION_CHARS + 5_000));
assert.equal(clamped.length, MAX_NARRATION_CHARS, "must clamp to the char cap");

// ─── run id / public url ─────────────────────────────────────────────────────
const id = voiceRunId("Narrate The Story!!", 1_700_000_000_000);
assert.match(id, /^1700000000000-narrate-the-story$/, `unexpected id: ${id}`);
assert.doesNotMatch(id, /[^a-z0-9-]/, "id must be filesystem safe");
assert.match(voiceRunId("", 1), /narration/, "empty prompt falls back to a slug");

delete process.env.ARBOR_VOICE_OUTPUT_DIR;
assert.equal(voicePublicUrl("abc", "narration.mp3"), "/voice/abc/narration.mp3");
process.env.ARBOR_VOICE_OUTPUT_DIR = "/tmp/voice";
assert.equal(
  voicePublicUrl("abc", "narration.mp3"),
  undefined,
  "custom dir must not claim a served URL",
);
delete process.env.ARBOR_VOICE_OUTPUT_DIR;

// ─── FishAudioPaymentError ───────────────────────────────────────────────────
const paymentError = new FishAudioPaymentError("402 no credit");
assert.equal(paymentError.name, "FishAudioPaymentError");
assert.ok(paymentError instanceof Error);

async function main(): Promise<void> {
  // ─── honesty contract: no credentials ──────────────────────────────────────
  clearKeys();
  const probeNoKey = await fishAudioVoice.probe!("generation");
  // `demo_lane`, not `fail`: the service is not known to be broken, Arbor simply
  // cannot reach it. Reporting `fail` would defame a working provider.
  assert.equal(probeNoKey.status, "demo_lane");
  assert.equal(probeNoKey.duration_ms, 0, "no key means no live call was made");
  assert.match(probeNoKey.error_message ?? "", /FISH_AUDIO_API_KEY/);
  assert.match(probeNoKey.error_message ?? "", /no live call attempted/);

  const bidNoKey = await fishAudioVoice.bid("narrate this script", "generation");
  assert.ok("decline" in bidNoKey && bidNoKey.decline, "must decline without a key");
  assert.match((bidNoKey as { reason: string }).reason, /FISH_AUDIO_API_KEY/);

  await assert.rejects(
    () => fishAudioVoice.execute("narrate this script", "generation"),
    /FISH_AUDIO_API_KEY/,
    "execute must throw rather than emit a placeholder audio URL",
  );

  // ─── bidding scope, with a key present ─────────────────────────────────────
  process.env.FISH_AUDIO_API_KEY = "fk-test";
  const offScope = await fishAudioVoice.bid("review my pull request", "reasoning");
  assert.ok("decline" in offScope && offScope.decline, "must decline non-voice work");
  assert.match((offScope as { reason: string }).reason, /spoken audio/);

  // The music lane must stay with the music specialist.
  const musicBrief = await fishAudioVoice.bid(
    "compose a 30 second soundtrack",
    "generation",
  );
  assert.ok(
    "decline" in musicBrief && musicBrief.decline,
    "must not poach music work from elevenlabs-music",
  );

  const inScope = await fishAudioVoice.bid(
    "narrate this script: She opened the letter and everything changed.",
    "generation",
  );
  assert.ok(!("decline" in inScope), "must bid on an in-scope narration brief");
  const bid = inScope as {
    bid_price: number;
    capability_claim: string;
    estimated_seconds: number;
  };
  assert.equal(bid.bid_price, FISH_AUDIO_VOICE_CONFIG.cost_baseline);
  assert.match(bid.capability_claim, /v1\/tts/, "claim must name the real endpoint");
  assert.match(bid.capability_claim, /s2\.1-pro-free/, "claim must name the engine");
  assert.ok(bid.estimated_seconds > 0 && bid.estimated_seconds < 300);

  // A longer script must not claim the same turnaround.
  const longBid = (await fishAudioVoice.bid(
    `narrate this: ${"word ".repeat(600)}`,
    "generation",
  )) as { estimated_seconds: number };
  assert.ok(
    longBid.estimated_seconds > bid.estimated_seconds,
    "estimate must scale with script length",
  );

  restoreKeys();
  console.log("fish-audio-voice tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
