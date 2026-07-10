import assert from "node:assert/strict";
import { classifyTaskComplexity } from "./dag";

// ─── clearly simple prompts → single ──────────────────────────────────────

{
  const v = classifyTaskComplexity("Summarize this article in two sentences.");
  assert.equal(v.mode, "single", "short single-verb ask should be single");
}

{
  const v = classifyTaskComplexity("Write a haiku about the ocean.");
  assert.equal(v.mode, "single", "trivial creative ask should be single");
}

{
  const v = classifyTaskComplexity(
    "Translate the phrase 'good morning' into French.",
  );
  assert.equal(v.mode, "single", "single-verb translation ask should be single");
}

{
  const v = classifyTaskComplexity("What is the capital of France?");
  assert.equal(v.mode, "single", "trivial factual question should be single");
}

// ─── clearly multi-part prompts → dag ─────────────────────────────────────

{
  const v = classifyTaskComplexity(
    "1. Research competitor pricing. 2. Design a new pricing page. 3. Write the copy. 4. Deploy it to production.",
  );
  assert.equal(v.mode, "dag", "numbered multi-step list should be dag");
  assert.ok(v.roles && v.roles.length > 0, "should surface role hints");
}

{
  const v = classifyTaskComplexity(
    "First, research the top 5 competitors. Then, analyze their strengths and weaknesses. Finally, write a report summarizing the findings.",
  );
  assert.equal(v.mode, "dag", "explicit step sequencing language should be dag");
}

{
  const v = classifyTaskComplexity(
    "Build a REST API for user auth, and also write comprehensive tests, as well as deploy it to staging.",
  );
  assert.equal(v.mode, "dag", "multi-part connectives with multiple verbs should be dag");
}

{
  const v = classifyTaskComplexity(
    "Research the market, design the architecture, implement the backend, test the endpoints, and deploy to production.",
  );
  assert.equal(v.mode, "dag", "5 distinct domain verbs should be dag");
  assert.ok(
    v.roles && v.roles.includes("researcher") && v.roles.includes("builder"),
    "role hints should reflect the distinct verbs",
  );
}

// ─── boundary cases ────────────────────────────────────────────────────────

{
  // Exactly 2 distinct verbs, short prompt, no budget: not enough signal alone.
  const v = classifyTaskComplexity("Review and edit this paragraph for clarity.");
  assert.equal(
    v.mode,
    "single",
    "two verbs alone on a short prompt without other markers should stay single",
  );
}

{
  // 2 verbs + large budget should tip to dag (weak-stack rule).
  const v = classifyTaskComplexity(
    "Research the topic and write a detailed report.",
    undefined,
    250,
  );
  assert.equal(v.mode, "dag", "2 verbs plus a large budget should stack to dag");
}

{
  // 2 verbs + long prompt should tip to dag (weak-stack rule).
  const filler = "This project has a lot of context that needs to be considered carefully. ".repeat(10);
  const v = classifyTaskComplexity(`${filler} Research the background and write a summary.`);
  assert.equal(v.mode, "dag", "2 verbs plus a long prompt should stack to dag");
}

{
  // Long prompt alone (no verbs, no markers) should NOT force dag by itself.
  const filler = "Please keep in mind the following important context while you think about this. ".repeat(10);
  const v = classifyTaskComplexity(`${filler} Give me your best guess.`);
  assert.equal(
    v.mode,
    "single",
    "a long prompt with no compound-task markers should still be single",
  );
}

{
  // Small budget with a single verb stays single.
  const v = classifyTaskComplexity("Write a short tagline for our product.", undefined, 10);
  assert.equal(v.mode, "single", "small budget single-verb ask should be single");
}

{
  const v = classifyTaskComplexity("");
  assert.equal(v.mode, "single", "empty description should default to single");
}

// success_criteria contributes to the classification text too.
{
  const v = classifyTaskComplexity(
    "Improve this function.",
    "1. Add input validation. 2. Add unit tests. 3. Update the docs.",
  );
  assert.equal(
    v.mode,
    "dag",
    "enumerated success criteria should push the verdict to dag",
  );
}

console.log("dag-gate tests passed");
