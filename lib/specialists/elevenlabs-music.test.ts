import assert from "node:assert/strict";
import {
  DEFAULT_MUSIC_MS,
  ELEVENLABS_MUSIC_CONFIG,
  MAX_MUSIC_MS,
  MIN_MUSIC_MS,
  MusicPromptRejectedError,
  buildMusicPrompt,
  elevenlabsApiKey,
  elevenlabsMissingEnv,
  elevenlabsMusic,
  extractMusicLengthMs,
  isMusicBrief,
  musicPublicUrl,
  musicRunId,
} from "./elevenlabs-music";

const KEYS = ["ELEVENLABS_API_KEY", "XI_API_KEY", "ARBOR_ELEVENLABS_API_KEY"];
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
assert.equal(ELEVENLABS_MUSIC_CONFIG.agent_id, "elevenlabs-music");
assert.equal(ELEVENLABS_MUSIC_CONFIG.tier, "real");
assert.ok(ELEVENLABS_MUSIC_CONFIG.cost_baseline > 0);
// Capability text must be concrete. The routing audit found boilerplate strings
// shared byte-identically across up to 40 agents, which match everything and
// therefore discriminate nothing.
const capText = ELEVENLABS_MUSIC_CONFIG.capabilities.join(" ").toLowerCase();
assert.ok(capText.includes("music"), "capabilities must mention music");
assert.ok(
  capText.includes("soundtrack") || capText.includes("instrumental"),
  "capabilities must be specific to scoring video",
);
assert.ok(
  !capText.includes("edit photos") && !capText.includes("organize images"),
  "must not reuse the catalog boilerplate",
);

// ─── credentials ─────────────────────────────────────────────────────────────
clearKeys();
assert.equal(elevenlabsApiKey(), undefined, "no key configured -> undefined");
assert.deepEqual(elevenlabsMissingEnv(), ["ELEVENLABS_API_KEY"]);
process.env.ELEVENLABS_API_KEY = "  sk-test-key  ";
assert.equal(elevenlabsApiKey(), "sk-test-key", "key must be trimmed");
assert.deepEqual(elevenlabsMissingEnv(), []);
clearKeys();
// The provider's own env name is accepted too.
process.env.XI_API_KEY = "xi-key";
assert.equal(elevenlabsApiKey(), "xi-key");
clearKeys();
// Whitespace-only is treated as absent, not as a valid key.
process.env.ELEVENLABS_API_KEY = "   ";
assert.equal(elevenlabsApiKey(), undefined, "blank key must count as absent");
clearKeys();

// ─── isMusicBrief ────────────────────────────────────────────────────────────
for (const p of [
  "compose a soundtrack for this clip",
  "generate background music",
  "I need an instrumental track",
  "add sound design",
  "write a jingle for the ad",
  "make a theme song",
]) {
  assert.ok(isMusicBrief(p), `should be a music brief: ${p}`);
}
for (const p of [
  "summarize this contract",
  "review my pull request",
  "generate a video of a dog",
]) {
  assert.equal(isMusicBrief(p), false, `should not be a music brief: ${p}`);
}
// taskType participates in the match.
assert.ok(isMusicBrief("do the thing", "music"));

// ─── extractMusicLengthMs ────────────────────────────────────────────────────
assert.equal(extractMusicLengthMs("no duration here"), DEFAULT_MUSIC_MS);
assert.equal(extractMusicLengthMs("make a 45 second track"), 45_000);
assert.equal(extractMusicLengthMs("a 2 minute score"), 120_000);
assert.equal(extractMusicLengthMs("5000 ms sting"), 5_000);
// Clamped to the API's accepted range rather than sent through and rejected.
assert.equal(extractMusicLengthMs("a 1 second stab"), MIN_MUSIC_MS);
assert.equal(extractMusicLengthMs("a 60 minute ambient bed"), MAX_MUSIC_MS);
assert.equal(extractMusicLengthMs("a 999 minute drone"), MAX_MUSIC_MS);
// Nonsense durations fall back rather than producing 0.
assert.equal(extractMusicLengthMs("a 0 second track"), DEFAULT_MUSIC_MS);
const anyLength = extractMusicLengthMs("30 seconds");
assert.ok(anyLength >= MIN_MUSIC_MS && anyLength <= MAX_MUSIC_MS);

// ─── buildMusicPrompt ────────────────────────────────────────────────────────
const built = buildMusicPrompt(
  "make me some music for a kid jumping in joy after getting into stanford",
);
assert.match(built, /kid jumping in joy/, "must preserve the creative intent");
assert.match(built, /instrumental/i);
assert.match(built, /No vocals/i);
// Artist references are stripped up front: the API rejects them outright, so
// sending one would waste a round trip and return an error instead of music.
const styled = buildMusicPrompt(
  "music for my montage in the style of Hans Zimmer, epic and building",
);
assert.doesNotMatch(styled, /Hans Zimmer/i, "artist reference must be stripped");
assert.match(styled, /montage/i, "the rest of the brief must survive");
const soundsLike = buildMusicPrompt("a track that sounds like Daft Punk");
assert.doesNotMatch(soundsLike, /Daft Punk/i);
// Leading imperatives are trimmed so the prompt reads as a description.
assert.doesNotMatch(buildMusicPrompt("create a song about rain"), /^Original instrumental score for: create/i);
// Long briefs are clamped without throwing.
assert.ok(buildMusicPrompt("x".repeat(5000)).length < 1200);
// Empty input still yields a usable prompt rather than a bare prefix.
assert.ok(buildMusicPrompt("   ").length > 40);

// ─── musicRunId / musicPublicUrl ─────────────────────────────────────────────
const id = musicRunId("A Kid Jumping!! In Joy", 1_700_000_000_000);
assert.match(id, /^1700000000000-a-kid-jumping-in-joy$/, `unexpected id: ${id}`);
assert.doesNotMatch(id, /[^a-z0-9-]/, "id must be filesystem safe");
assert.ok(musicRunId("", 1).length > 0, "empty prompt still yields an id");
assert.match(musicRunId("", 1), /track/, "empty prompt falls back to a slug");

delete process.env.ARBOR_MUSIC_OUTPUT_DIR;
assert.equal(musicPublicUrl("abc", "soundtrack.mp3"), "/music/abc/soundtrack.mp3");
// A custom output dir is not served by Next, so there must be no public URL.
process.env.ARBOR_MUSIC_OUTPUT_DIR = "/tmp/music";
assert.equal(
  musicPublicUrl("abc", "soundtrack.mp3"),
  undefined,
  "custom dir must not claim a served URL",
);
delete process.env.ARBOR_MUSIC_OUTPUT_DIR;

// ─── MusicPromptRejectedError ────────────────────────────────────────────────
const rejected = new MusicPromptRejectedError("bad prompt", "try this instead");
assert.equal(rejected.name, "MusicPromptRejectedError");
assert.equal(rejected.suggestion, "try this instead");
assert.ok(rejected instanceof Error);
assert.equal(new MusicPromptRejectedError("x").suggestion, undefined);

// ─── honesty contract: no credentials ────────────────────────────────────────

async function main(): Promise<void> {

  clearKeys();
  const probeNoKey = await elevenlabsMusic.probe!("generation");
  // `demo_lane`, not `fail`: the service is not known to be broken, Arbor simply
  // cannot reach it. Calling it `fail` would defame a working provider.
  assert.equal(probeNoKey.status, "demo_lane");
  assert.equal(probeNoKey.duration_ms, 0, "no key means no live call was attempted");
  assert.match(probeNoKey.error_message ?? "", /ELEVENLABS_API_KEY/);
  assert.match(probeNoKey.error_message ?? "", /no live call attempted/);

  const bidNoKey = await elevenlabsMusic.bid("compose a soundtrack", "generation");
  assert.ok("decline" in bidNoKey && bidNoKey.decline, "must decline without a key");
  assert.match(
    (bidNoKey as { reason: string }).reason,
    /ELEVENLABS_API_KEY/,
    "decline reason must name the missing credential",
  );

  await assert.rejects(
    () => elevenlabsMusic.execute("compose a soundtrack", "generation"),
    /ELEVENLABS_API_KEY/,
    "execute must throw rather than emit a placeholder audio URL",
  );

  // ─── bidding scope, with a key present ───────────────────────────────────────
  process.env.ELEVENLABS_API_KEY = "sk-test-key";
  const offScope = await elevenlabsMusic.bid("review my pull request", "reasoning");
  assert.ok("decline" in offScope && offScope.decline, "must decline non-music work");
  assert.match((offScope as { reason: string }).reason, /composes audio/);

  const inScope = await elevenlabsMusic.bid(
    "compose a 45 second soundtrack for the launch video",
    "generation",
  );
  assert.ok(!("decline" in inScope), "must bid on an in-scope music brief");
  const bid = inScope as { bid_price: number; capability_claim: string; estimated_seconds: number };
  assert.equal(bid.bid_price, ELEVENLABS_MUSIC_CONFIG.cost_baseline);
  assert.match(bid.capability_claim, /v1\/music/, "claim must name the real endpoint");
  assert.match(bid.capability_claim, /45s/, "claim must reflect the parsed duration");
  assert.ok(bid.estimated_seconds > 0 && bid.estimated_seconds < 700);
  // A longer track must not claim the same turnaround as a short one.
  const longBid = (await elevenlabsMusic.bid(
    "compose a 5 minute ambient music bed",
    "generation",
  )) as { estimated_seconds: number };
  assert.ok(
    longBid.estimated_seconds > bid.estimated_seconds,
    "estimate must scale with track length",
  );

  restoreKeys();

  console.log("elevenlabs-music tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
