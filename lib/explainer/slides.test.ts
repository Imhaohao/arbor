import assert from "node:assert/strict";
import {
  buildTitleSlideSvg,
  buildTurnSlideSvg,
  escapeXml,
  wrapText,
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
} from "./slides";
import type { LessonScript } from "../specialists/codebase-explainer";

// --- escapeXml ---
assert.equal(escapeXml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;");

// --- wrapText ---
assert.deepEqual(wrapText("one two three", 8), ["one two", "three"]);
// Long unbreakable token is hard-split, never overflows.
assert.deepEqual(wrapText("abcdefghij", 4), ["abcd", "efgh", "ij"]);
assert.deepEqual(wrapText("", 10), []);
for (const line of wrapText("a ".repeat(200), 46)) assert.ok(line.length <= 46);

const LESSON: LessonScript = {
  title: "Auth <Deep> Dive",
  premise: "how login works",
  modules: ["Overview"],
  script: [
    { speaker: "Nova", line: "What does auth.ts do?", ref: "lib/auth.ts" },
    { speaker: "Kit", line: "It verifies the JWT & session." },
  ],
  sources: ["lib/auth.ts"],
};

// --- title slide ---
{
  const svg = buildTitleSlideSvg(LESSON);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes(`width="${SLIDE_WIDTH}"`) && svg.includes(`height="${SLIDE_HEIGHT}"`));
  assert.ok(svg.includes("Auth &lt;Deep&gt; Dive")); // escaped, not raw
  assert.ok(!svg.includes("<Deep>"));
  assert.ok(svg.includes("how login works"));
  assert.ok(svg.includes("Arbor Codebase Explainer"));
}

// --- turn slide ---
{
  const svg = buildTurnSlideSvg(LESSON.script[0], 0, 2, LESSON);
  assert.ok(svg.includes(">Nova</text>"));
  assert.ok(svg.includes("lib/auth.ts")); // ref chip
  assert.ok(svg.includes("What does auth.ts do?"));
  assert.ok(svg.includes("1 / 2")); // progress counter
  // Escaping in the body line.
  const svg2 = buildTurnSlideSvg(LESSON.script[1], 1, 2, LESSON);
  assert.ok(svg2.includes("JWT &amp; session"));
  assert.ok(svg2.includes("2 / 2"));
  // No ref -> no monospace chip text beyond the header.
  assert.ok(!svg2.includes("rect x=\"250\""));
}

console.log("slides.test.ts: all assertions passed");
