import assert from "node:assert/strict";
import {
  detectMediaFormat,
  isLongFormVideoPipeline,
  isMediaPipeline,
  isShortFormVideoPipeline,
  planLongFormVideoPipeline,
  planMediaPipeline,
  planShortFormVideoPipeline,
} from "./media-pipeline";
import { topologicalLevels, validateDag } from "./dag";

// ─── detection ───────────────────────────────────────────────────────────────
assert.equal(
  isShortFormVideoPipeline("Create a TikTok video explaining our new feature"),
  true,
);
assert.equal(
  isShortFormVideoPipeline("Make a vertical video for Instagram Reels"),
  true,
);
assert.equal(isShortFormVideoPipeline("Research TikTok ad performance"), false);
assert.equal(isShortFormVideoPipeline("Edit this long-form webinar"), false);

// Long-form / YouTube intent.
assert.equal(
  isLongFormVideoPipeline("make a high quality video for my youtube channel"),
  true,
);
assert.equal(isLongFormVideoPipeline("produce a widescreen video for vimeo"), true);
// A bare mention without production intent is not a pipeline.
assert.equal(isLongFormVideoPipeline("research youtube ad performance"), false);

// "YouTube Shorts" must stay VERTICAL — short-form wins the tie, otherwise a
// Shorts request would be planned 16:9 and be unusable.
assert.equal(
  isShortFormVideoPipeline("make a youtube shorts video about our launch"),
  true,
);
assert.equal(
  isLongFormVideoPipeline("make a youtube shorts video about our launch"),
  false,
  "YouTube Shorts must not be treated as long-form",
);
assert.equal(
  detectMediaFormat("make a youtube shorts video about our launch"),
  "vertical",
);
assert.equal(
  detectMediaFormat("make a high quality video for my youtube channel"),
  "widescreen",
);
assert.equal(detectMediaFormat("research youtube ad performance"), undefined);

assert.equal(isMediaPipeline("Create a TikTok video about X"), true);
assert.equal(isMediaPipeline("make a video for my youtube channel"), true);
assert.equal(isMediaPipeline("summarize this contract"), false);

// ─── DAG shape ───────────────────────────────────────────────────────────────
const plan = planShortFormVideoPipeline(
  "Create a TikTok video explaining our new feature",
);
assert.deepEqual(validateDag(plan), { ok: true });
// generate_music runs in PARALLEL with generate_video; edit_video joins them.
// Serializing them would add the music render to the critical path for nothing.
assert.deepEqual(topologicalLevels(plan), [
  ["creative_brief"],
  ["generate_video", "generate_music"],
  ["edit_video"],
  ["media_review"],
]);

/** `success_criteria` is optional on PlannedNode; these nodes must always set it. */
function criteria(node: { id: string; success_criteria?: string }): string {
  assert.ok(
    node.success_criteria,
    `node "${node.id}" must declare success_criteria`,
  );
  return node.success_criteria;
}

const byId = Object.fromEntries(plan.map((n) => [n.id, n]));
assert.ok(byId.generate_music, "pipeline must include a music node");
assert.deepEqual(byId.generate_music.depends_on, ["creative_brief"]);
assert.deepEqual(byId.edit_video.depends_on, ["generate_video", "generate_music"]);

// ─── vendor neutrality ───────────────────────────────────────────────────────
// Candidate specialists may be named but never mandated: the router arbitrates on
// measured cost-adjusted capability, and a hardcoded vendor would override it.
assert.match(byId.generate_video.description, /cost-adjusted/);
assert.match(
  byId.generate_video.description,
  /Higgsfield is one candidate, not a requirement/,
);
assert.match(byId.generate_video.description, /media_import_url/);
assert.match(byId.generate_music.description, /cost-adjusted/);
assert.match(
  byId.generate_music.description,
  /elevenlabs-music is one candidate, not a requirement/,
);
assert.match(byId.generate_music.description, /artifact_id/);
assert.match(
  byId.edit_video.description,
  /reap-editor and submagic-editor both add captions/,
);
assert.match(byId.edit_video.description, /None is a requirement/);
assert.match(byId.edit_video.description, /artifact_id/);

// ─── honesty guards in the node contracts ────────────────────────────────────
// No capable music agent must produce an explicit absence, never a fake URL.
assert.match(byId.generate_music.description, /rather than emitting a placeholder/);
assert.match(byId.edit_video.description, /do not substitute stock audio/i);
// Copyright: providers reject artist references, so the brief must forbid them.
assert.match(byId.generate_music.description, /Never reference a real artist/);
// The brief must carry music direction, since the music node sees only the brief.
assert.match(byId.creative_brief.description, /music direction/i);

// ─── widescreen variant ──────────────────────────────────────────────────────
const wide = planLongFormVideoPipeline(
  "make a high quality video for my youtube channel about our launch",
);
assert.deepEqual(validateDag(wide), { ok: true });
assert.deepEqual(topologicalLevels(wide), topologicalLevels(plan), "same shape");
const wideById = Object.fromEntries(wide.map((n) => [n.id, n]));
assert.match(wideById.creative_brief.description, /widescreen long-form video/);
assert.match(criteria(wideById.creative_brief), /16:9/);
assert.match(wideById.media_review.description, /16:9 or intentionally widescreen/);
// The widescreen review must NOT assert the vertical/TikTok contract.
assert.doesNotMatch(wideById.media_review.description, /9:16/);
assert.doesNotMatch(wideById.media_review.description, /Upload API button/);
assert.match(wideById.media_review.description, /Do not publish to YouTube/);
// Vertical keeps its own contract.
assert.match(criteria(byId.creative_brief), /9:16/);
assert.match(byId.media_review.description, /9:16 or intentionally vertical/);
assert.match(byId.media_review.description, /Upload API button/);

// Both formats require an audio track when the brief asked for music.
for (const p of [byId, wideById]) {
  assert.match(p.media_review.description, /carries an audio track/);
}

// ─── argument handling ───────────────────────────────────────────────────────
assert.throws(() => planMediaPipeline("   "), /video goal is required/);
assert.throws(() => planShortFormVideoPipeline(""), /video goal is required/);
// Default format is vertical, matching the original single-format behaviour.
assert.deepEqual(
  planMediaPipeline("Create a TikTok video about X").map((n) => n.id),
  planShortFormVideoPipeline("Create a TikTok video about X").map((n) => n.id),
);
// The user's goal text is carried into the brief verbatim.
assert.match(
  planLongFormVideoPipeline("a kid jumping in joy after getting into stanford")[0]
    .description,
  /a kid jumping in joy after getting into stanford/,
);

console.log("media-pipeline tests passed");
