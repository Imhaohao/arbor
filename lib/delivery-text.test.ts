import assert from "node:assert/strict";
import {
  deliveryTextForEvaluation,
  stripProvenanceBanner,
} from "./delivery-text";

// The exact shape arbor-hive-backstop emits (lib/specialists/arbor-hive-backstop.ts).
const BACKSTOP_BANNER =
  "[Arbor hive backstop] Arbor-owned model floor — no external tools, browser, or repo were used.";

// The real regression: a correct three-sentence answer that the judge rejected
// as four sentences because the banner counted as one.
const THREE_SENTENCE_ANSWER =
  "Effective 2026-09-01 the reserve is 14%. Funds release automatically after 30 days. Workers with more than 50 settled tasks and zero lost disputes get a reduced 7% reserve.";

function sentenceCount(text: string): number {
  return text.split(/[.!?]+\s+|[.!?]+$/).filter((s) => s.trim().length > 0).length;
}

// Banner is removed and the answer survives byte-for-byte.
{
  const delivered = `${BACKSTOP_BANNER}\n\n${THREE_SENTENCE_ANSWER}`;
  assert.equal(stripProvenanceBanner(delivered), THREE_SENTENCE_ANSWER);
}

// The actual defect: with the banner the text reads as 4 sentences, without it 3.
{
  const delivered = `${BACKSTOP_BANNER}\n\n${THREE_SENTENCE_ANSWER}`;
  assert.equal(sentenceCount(delivered), 4);
  assert.equal(sentenceCount(stripProvenanceBanner(delivered)), 3);
}

// Text with no banner is returned untouched.
{
  assert.equal(stripProvenanceBanner(THREE_SENTENCE_ANSWER), THREE_SENTENCE_ANSWER);
}

// Only a LEADING banner is stripped — agent content mentioning the label stays.
{
  const mentioning = `The agent replied. [Arbor hive backstop] appears mid-answer here.`;
  assert.equal(stripProvenanceBanner(mentioning), mentioning);
}

// Only one banner is removed, so a doubled banner leaves evidence rather than
// silently swallowing repeated stamps.
{
  const doubled = `${BACKSTOP_BANNER}\n\n${BACKSTOP_BANNER}\n\n${THREE_SENTENCE_ANSWER}`;
  const stripped = stripProvenanceBanner(doubled);
  assert.ok(stripped.startsWith("[Arbor hive backstop]"));
}

// Result-shape normalization: string, {text}, {output}, and object fallback.
{
  assert.equal(
    deliveryTextForEvaluation(`${BACKSTOP_BANNER}\n\n${THREE_SENTENCE_ANSWER}`),
    THREE_SENTENCE_ANSWER,
  );
  assert.equal(
    deliveryTextForEvaluation({ text: `${BACKSTOP_BANNER}\n\n${THREE_SENTENCE_ANSWER}` }),
    THREE_SENTENCE_ANSWER,
  );
  assert.equal(
    deliveryTextForEvaluation({ output: `${BACKSTOP_BANNER}\n\n${THREE_SENTENCE_ANSWER}` }),
    THREE_SENTENCE_ANSWER,
  );
  // No text/output field: fall back to JSON so nothing is silently dropped.
  assert.ok(deliveryTextForEvaluation({ agent_id: "x" }).includes("agent_id"));
}

// Empty and non-string results must not throw.
{
  assert.equal(deliveryTextForEvaluation(""), "");
  assert.ok(deliveryTextForEvaluation(null).length > 0);
  assert.ok(deliveryTextForEvaluation(42).length > 0);
}

console.log("delivery-text tests passed");
