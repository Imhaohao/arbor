import assert from "node:assert/strict";
import {
  callClaude,
  callClaudeJSON,
  CLAUDE_FAST_MODEL,
  CLAUDE_PLANNER_MODEL,
  describeClaudeRuntime,
} from "./anthropic";
import { parseJSONLoose } from "./openai";
import {
  collectUsage,
  setUsageObserver,
  type LlmCallRecord,
} from "./llm-usage";

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
  delete process.env.ARBOR_HIVE_MODEL_PROVIDER;
  delete process.env.ARBOR_CLAUDE_PROVIDER;
  delete process.env.ARBOR_MODEL_SPEND_DISABLED;
  delete process.env.ARBOR_MODEL_CALLS_DISABLED;
  delete process.env.ARBOR_AZURE_ENABLED;
  delete process.env.ARBOR_REQUIRE_AZURE;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
  delete process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT;
  delete process.env.AZURE_OPENAI_API_MODE;
  delete process.env.ARBOR_MODEL;
  delete process.env.ARBOR_PLANNER_MODEL;
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
      /ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or a usable OpenAI-path provider \(OPENAI_API_KEY, or Azure\/Foundry credentials with ARBOR_AZURE_ENABLED\) must be set/,
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

  await test("describeClaudeRuntime reports a ready OpenAI path on a pure-Azure deployment", () => {
    process.env.AZURE_OPENAI_API_KEY = "test";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.ARBOR_AZURE_ENABLED = "true";
    process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT = "planner-deploy";

    const runtime = describeClaudeRuntime();
    assert.equal(runtime.ready, true);
    assert.equal(runtime.status, "fallback");
    assert.equal(runtime.provider, "openai");
    assert.equal(runtime.model, "planner-deploy");
    assert.match(runtime.message, /Azure fallback/);
  });

  await test("callClaude reaches the OpenAI path on a pure-Azure deployment", async () => {
    process.env.AZURE_OPENAI_API_KEY = "test";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.ARBOR_AZURE_ENABLED = "true";
    process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT = "planner-deploy";

    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({ output_text: "azure-recovered" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaude({
      model: CLAUDE_PLANNER_MODEL,
      systemPrompt: "Plan.",
      userPrompt: "Recover via Azure.",
      timeoutMs: 1_000,
      retries: 0,
    });

    assert.equal(result, "azure-recovered");
    assert.ok(request);
    assert.match(request.url, /example\.openai\.azure\.com/);
  });

  await test("describeClaudeRuntime blocks (without throwing) when Azure deployment is missing", () => {
    process.env.AZURE_OPENAI_API_KEY = "test";
    process.env.ARBOR_AZURE_ENABLED = "true";

    const runtime = describeClaudeRuntime();
    assert.equal(runtime.ready, false);
    assert.equal(runtime.status, "blocked");
    assert.ok(runtime.missing_env.includes("AZURE_OPENAI_ENDPOINT"));
    assert.ok(
      runtime.missing_env.some((key) => key.includes("DEPLOYMENT")),
    );
  });

  await test("describeClaudeRuntime stays blocked when the kill switch is set even with Azure configured", () => {
    process.env.AZURE_OPENAI_API_KEY = "test";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT = "planner-deploy";
    process.env.ARBOR_AZURE_ENABLED = "true";
    process.env.ARBOR_MODEL_SPEND_DISABLED = "true";

    const runtime = describeClaudeRuntime();
    assert.equal(runtime.ready, false);
    assert.equal(runtime.status, "blocked");
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

  await test("unset provider flag keeps the Anthropic-first fallback order", () => {
    // Regression: auto must NOT silently prefer a usable OpenAI path over a
    // configured Anthropic key — openai-first is an explicit opt-in via
    // ARBOR_HIVE_MODEL_PROVIDER=openai.
    process.env.OPENAI_API_KEY = "working-openai-key";
    process.env.OPENAI_MODEL = "gpt-test";
    process.env.ANTHROPIC_API_KEY = "available-anthropic-key";

    const runtime = describeClaudeRuntime();
    assert.equal(runtime.ready, true);
    assert.equal(runtime.provider, "anthropic");
    assert.match(runtime.message, /direct Anthropic runtime/);
  });

  await test("ARBOR_HIVE_MODEL_PROVIDER=openai forces OpenAI only", async () => {
    process.env.ARBOR_HIVE_MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "working-openai-key";
    process.env.OPENAI_MODEL = "gpt-test";
    process.env.ANTHROPIC_API_KEY = "available-anthropic-key";
    const urls: string[] = [];

    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "openai-only" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaude({
      model: CLAUDE_PLANNER_MODEL,
      systemPrompt: "Plan.",
      userPrompt: "Use OpenAI.",
      timeoutMs: 100,
      retries: 0,
    });

    assert.equal(result, "openai-only");
    assert.deepEqual(urls, ["https://api.openai.com/v1/chat/completions"]);
    assert.equal(describeClaudeRuntime().status, "ready");
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

  await test("callClaude defaults to Anthropic first even when OpenAI is usable", async () => {
    process.env.ANTHROPIC_API_KEY = "working-anthropic-key";
    process.env.OPENROUTER_API_KEY = "unused-openrouter-key";
    process.env.OPENAI_API_KEY = "working-openai-key";
    process.env.OPENAI_MODEL = "gpt-test";
    const urls: string[] = [];

    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "anthropic-first" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaude({
      model: CLAUDE_PLANNER_MODEL,
      systemPrompt: "Plan.",
      userPrompt: "Use the default order.",
      timeoutMs: 100,
      retries: 0,
    });

    assert.equal(result, "anthropic-first");
    assert.deepEqual(urls, ["https://api.anthropic.com/v1/messages"]);
  });

  await test("callClaude auto mode cascades Anthropic -> OpenRouter -> OpenAI on exhaustion", async () => {
    process.env.ARBOR_HIVE_MODEL_PROVIDER = "auto";
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

  // Token accounting must be wired into the real client path, not just the pure
  // parser. Every downstream cost figure depends on this capture actually firing.
  await test("callClaude records measured token usage and cost", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "verified" }],
          // Shape taken from the Anthropic prompt-caching docs.
          usage: {
            input_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 100_000,
            output_tokens: 503,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const { result, records, totals } = await collectUsage(async () =>
      callClaude({
        model: "claude-opus-5",
        systemPrompt: "s",
        userPrompt: "u",
        retries: 0,
      }),
    );

    assert.equal(result, "verified");
    assert.equal(records.length, 1, "exactly one call must be recorded");
    const [record] = records;
    assert.equal(record.provider, "anthropic");
    assert.equal(record.model, "claude-opus-5");
    assert.equal(record.usage.input_tokens, 50);
    assert.equal(record.usage.output_tokens, 503);
    assert.equal(record.usage.cache_read_tokens, 100_000);
    assert.ok(
      typeof record.duration_ms === "number" && record.duration_ms >= 0,
      "duration must be measured",
    );
    // 50 input @ $5/Mtok + 100k cache reads @ 0.1x + 503 output @ $25/Mtok.
    const expected =
      (50 * 5 + 100_000 * 5 * 0.1 + 503 * 25) / 1_000_000;
    assert.ok(
      Math.abs((record.cost_usd ?? 0) - expected) < 1e-12,
      `cost ${record.cost_usd} !== ${expected}`,
    );
    assert.equal(totals.calls, 1);
    assert.equal(totals.unpriced_calls, 0, "a priced model must not count as unpriced");
    assert.ok(totals.cost_usd > 0, "a real call must not be costed at $0");
  });

  // A response carrying usage but no usable text still cost money, so it must
  // still be billed rather than vanishing when text extraction throws.
  await test("callClaude records usage even when the response has no text", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          content: [],
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const records: LlmCallRecord[] = [];
    setUsageObserver((r) => records.push(r));
    try {
      await assert.rejects(
        () =>
          callClaude({
            model: "claude-opus-5",
            systemPrompt: "s",
            userPrompt: "u",
            retries: 0,
          }),
        /no text content/,
      );
    } finally {
      setUsageObserver(undefined);
    }
    assert.equal(
      records.length,
      1,
      "a text-less but billed response must still be recorded",
    );
    assert.equal(records[0].usage.input_tokens, 10);
  });

  console.log("anthropic tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
