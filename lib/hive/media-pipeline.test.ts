import assert from "node:assert/strict";
import {
  isShortFormVideoPipeline,
  planShortFormVideoPipeline,
} from "./media-pipeline";
import { topologicalLevels, validateDag } from "./dag";

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

const plan = planShortFormVideoPipeline(
  "Create a TikTok video explaining our new feature",
);
assert.deepEqual(validateDag(plan), { ok: true });
assert.deepEqual(topologicalLevels(plan), [
  ["creative_brief"],
  ["generate_video"],
  ["edit_video"],
  ["media_review"],
]);
assert.match(plan[1].description, /cost-adjusted/);
assert.match(plan[1].description, /Higgsfield is one candidate, not a requirement/);
assert.match(plan[1].description, /media_import_url/);
assert.match(plan[2].description, /Clueso is one candidate, not a requirement/);
assert.match(plan[2].description, /artifact_id/);

console.log("media-pipeline tests passed");
