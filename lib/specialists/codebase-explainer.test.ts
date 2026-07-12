import assert from "node:assert/strict";
import {
  isCodebaseExplainerTask,
  coerceLessonScript,
  buildLessonMarkdown,
  renderArtifactStatus,
  type LessonScript,
} from "./codebase-explainer";

// --- bid gate: isCodebaseExplainerTask ---

// Positive: subject + teach intent.
assert.equal(
  isCodebaseExplainerTask("Explain this codebase to a new hire", "education"),
  true,
);
assert.equal(
  isCodebaseExplainerTask("Walk me through the auth module so I understand it"),
  true,
);
assert.equal(
  isCodebaseExplainerTask("Make an audio overview of our payments service"),
  true,
);
// Positive: explicit unambiguous phrasing even without a lone subject word.
assert.equal(isCodebaseExplainerTask("codebase explainer, please"), true);

// Negative: code task with no teaching intent.
assert.equal(
  isCodebaseExplainerTask("Fix the null pointer bug in the repository"),
  false,
);
// Negative: teaching intent but not about code.
assert.equal(
  isCodebaseExplainerTask("Explain the tax implications of this invoice"),
  false,
);
// Negative: empty.
assert.equal(isCodebaseExplainerTask("", ""), false);

// --- coerceLessonScript: validation + normalization ---

// Rejects non-objects and missing script arrays.
assert.equal(coerceLessonScript(null), null);
assert.equal(coerceLessonScript({ title: "x" }), null);
// Rejects when every turn is invalid (bad speaker / empty line).
assert.equal(
  coerceLessonScript({ script: [{ speaker: "Bob", line: "hi" }, { speaker: "Nova", line: "   " }] }),
  null,
);

// Accepts and normalizes: drops bad turns, trims, keeps refs.
const coerced = coerceLessonScript({
  title: "  Auth Deep Dive  ",
  premise: " how login works ",
  modules: ["Overview", "", "Token flow"],
  script: [
    { speaker: "Nova", line: "  What does this do?  ", ref: " lib/auth.ts " },
    { speaker: "Bob", line: "ignored - bad speaker" },
    { speaker: "Kit", line: "It verifies the JWT.", ref: "  " },
  ],
  sources: ["lib/auth.ts", 42],
});
assert.ok(coerced);
assert.equal(coerced!.title, "Auth Deep Dive");
assert.equal(coerced!.premise, "how login works");
assert.deepEqual(coerced!.modules, ["Overview", "Token flow"]);
assert.equal(coerced!.script.length, 2); // bad-speaker turn dropped
assert.deepEqual(coerced!.script[0], {
  speaker: "Nova",
  line: "What does this do?",
  ref: "lib/auth.ts",
});
assert.equal(coerced!.script[1].ref, undefined); // whitespace ref -> undefined
assert.deepEqual(coerced!.sources, ["lib/auth.ts"]); // non-string dropped

// Falls back title when missing.
const noTitle = coerceLessonScript({ script: [{ speaker: "Nova", line: "hi" }] });
assert.equal(noTitle!.title, "Codebase Walkthrough");

// --- buildLessonMarkdown: pure renderer ---

const lesson: LessonScript = {
  title: "Auth Deep Dive",
  premise: "how login works",
  modules: ["Overview", "Token flow"],
  script: [
    { speaker: "Nova", line: "What does this do?", ref: "lib/auth.ts" },
    { speaker: "Kit", line: "It verifies the JWT." },
  ],
  sources: ["lib/auth.ts"],
};
const md = buildLessonMarkdown(lesson);
assert.match(md, /^# Auth Deep Dive/);
assert.match(md, /_how login works_/);
assert.match(md, /## Lesson outline/);
assert.match(md, /- Overview/);
assert.match(md, /\*\*Nova:\*\* `lib\/auth\.ts` What does this do\?/);
assert.match(md, /\*\*Kit:\*\* It verifies the JWT\./);
assert.match(md, /## Sources referenced/);

// Handles empty modules/sources without emitting their headers.
const bare = buildLessonMarkdown({
  title: "T",
  premise: "",
  modules: [],
  script: [{ speaker: "Nova", line: "hi" }],
  sources: [],
});
assert.doesNotMatch(bare, /Lesson outline/);
assert.doesNotMatch(bare, /Sources referenced/);
assert.match(bare, /## Two-host script/);

// --- renderArtifactStatus: honest, flag-driven ---

const prevAudio = process.env.ARBOR_EXPLAINER_AUDIO_ENABLED;
const prevVideo = process.env.ARBOR_EXPLAINER_VIDEO_ENABLED;
delete process.env.ARBOR_EXPLAINER_AUDIO_ENABLED;
delete process.env.ARBOR_EXPLAINER_VIDEO_ENABLED;
let status = renderArtifactStatus();
assert.match(status, /Script \(this document\): produced/);
assert.match(status, /Audio narration: not requested/);
assert.match(status, /Video overview: not requested/);

process.env.ARBOR_EXPLAINER_AUDIO_ENABLED = "true";
status = renderArtifactStatus();
assert.match(status, /Audio narration: flag on/);
assert.match(status, /Video overview: not requested/);

// Restore env.
if (prevAudio === undefined) delete process.env.ARBOR_EXPLAINER_AUDIO_ENABLED;
else process.env.ARBOR_EXPLAINER_AUDIO_ENABLED = prevAudio;
if (prevVideo === undefined) delete process.env.ARBOR_EXPLAINER_VIDEO_ENABLED;
else process.env.ARBOR_EXPLAINER_VIDEO_ENABLED = prevVideo;

console.log("codebase-explainer.test.ts: all assertions passed");
