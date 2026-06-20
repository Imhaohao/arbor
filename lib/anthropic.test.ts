import assert from "node:assert/strict";
import {
  callClaude,
  callClaudeJSON,
  CLAUDE_FAST_MODEL,
  CLAUDE_PLANNER_MODEL,
  describeClaudeRuntime,
} from "./anthropic";
import { parseJSONLoose } from "./openai";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_CLAUDE_PLANNER_MODEL;
  delete process.env.OPENROUTER_CLAUDE_FAST_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.ARBOR_MODEL_PROVIDER;
  delete process.env.ARBOR_MODEL_SPEND_DISABLED;
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  resetEnv();
  globalThis.fetch = ORIGINAL_FETCH;
  try {
    await fn();
    console.log(`ok - ${name}`);
  } finally {
    resetEnv();
    globalThis.fetch = ORIGINAL_FETCH;
  }
}

async function main(): Promise<void> {
  await test("callClaude throws fast when both Claude runtime keys are unset", async () => {
    let calledFetch = false;
    globalThis.fetch = async () => {
      calledFetch = true;
      throw new Error("fetch should not be called");
    };

    await assert.rejects(
      () =>
        callClaude({
          model: CLAUDE_FAST_MODEL,
          systemPrompt: "Classify this.",
          userPrompt: "hello",
        }),
      /ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY must be set/,
    );
    assert.equal(calledFetch, false);
  });

  await test("describeClaudeRuntime reports the blocked Convex state", () => {
    assert.deepEqual(describeClaudeRuntime(), {
      ready: false,
      status: "blocked",
      provider: "unavailable",
      model: CLAUDE_PLANNER_MODEL,
      anthropic_key_configured: false,
      openrouter_key_configured: false,
      openai_key_configured: false,
      missing_env: [
        "ANTHROPIC_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENAI_API_KEY",
      ],
      message:
        "Convex has no model runtime key. Hive planning collapses to one node and evaluation uses plain output concatenation.",
    });
  });

  await test("parseJSONLoose round-trips fenced JSON", () => {
    assert.deepEqual(
      parseJSONLoose<{ status: string; score: number }>(
        '```json\n{"status":"ok","score":1}\n```',
      ),
      { status: "ok", score: 1 },
    );
  });

  await test("callClaude constructs Anthropic request body and extracts JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.OPENROUTER_API_KEY = "unused-openrouter-key";
    let request: { url: string; init?: RequestInit } | undefined;

    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: '```json\n{"route":"planner"}\n```' },
            { type: "tool_use", name: "ignored" },
            { type: "text", text: "" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaudeJSON<{ route: string }>({
      model: CLAUDE_FAST_MODEL,
      systemPrompt: "Route requests.",
      userPrompt: "Need a plan.",
      maxTokens: 321,
      timeoutMs: 1_000,
    });

    assert.deepEqual(result, { route: "planner" });
    assert.ok(request);
    assert.equal(request.url, "https://api.anthropic.com/v1/messages");
    assert.equal(request.init?.method, "POST");
    assert.deepEqual(request.init?.headers, {
      "x-api-key": "test-anthropic-key",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
      model: CLAUDE_FAST_MODEL,
      max_tokens: 321,
      system: "Route requests.",
      messages: [{ role: "user", content: "Need a plan." }],
    });
  });

  await test("callClaude falls back to OpenRouter with a Claude catalog model", async () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    let request: { url: string; init?: RequestInit } | undefined;

    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"route":"fast"}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaudeJSON<{ route: string }>({
      model: CLAUDE_FAST_MODEL,
      systemPrompt: "Route requests.",
      userPrompt: "Need a quick route.",
      maxTokens: 64,
      timeoutMs: 1_000,
    });

    assert.deepEqual(result, { route: "fast" });
    assert.ok(request);
    assert.equal(
      request.url,
      "https://openrouter.ai/api/v1/chat/completions",
    );
    assert.deepEqual(request.init?.headers, {
      "content-type": "application/json",
      authorization: "Bearer test-openrouter-key",
    });
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
      model: "anthropic/claude-haiku-4.5",
      messages: [
        { role: "system", content: "Route requests." },
        { role: "user", content: "Need a quick route." },
      ],
      max_tokens: 64,
    });
    assert.equal(describeClaudeRuntime().status, "fallback");
  });

  await test("callClaude reaches OpenAI when both Claude providers fail", async () => {
    process.env.ANTHROPIC_API_KEY = "unfunded-anthropic-key";
    process.env.OPENROUTER_API_KEY = "unfunded-openrouter-key";
    process.env.OPENAI_API_KEY = "working-openai-key";
    process.env.OPENAI_MODEL = "gpt-test";
    const urls: string[] = [];

    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("api.anthropic.com")) {
        return new Response("insufficient credits", { status: 400 });
      }
      if (url.includes("openrouter.ai")) {
        return new Response("insufficient credits", { status: 402 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "recovered" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaude({
      model: CLAUDE_PLANNER_MODEL,
      systemPrompt: "Plan.",
      userPrompt: "Recover this request.",
      timeoutMs: 100,
      retries: 0,
    });

    assert.equal(result, "recovered");
    assert.deepEqual(urls, [
      "https://api.anthropic.com/v1/messages",
      "https://openrouter.ai/api/v1/chat/completions",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  console.log("anthropic tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
