import assert from "node:assert/strict";
import {
  getRunner,
  getSpecialists,
  OPENROUTER_SPECIALISTS,
  specialistConfigFromPersisted,
} from "./registry";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function reset(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = ORIGINAL_FETCH;
}

async function main(): Promise<void> {
  try {
    process.env.ARBOR_OPENROUTER_ENABLED = "false";
    assert.equal(
      getSpecialists().some((config) => config.tier === "openrouter"),
      false,
    );
    assert.equal(
      getSpecialists("openrouter").filter(
        (config) => config.tier === "openrouter",
      ).length,
      5,
    );
    process.env.ARBOR_OPENROUTER_ENABLED = "true";
    assert.equal(
      getSpecialists("native").some((config) => config.tier === "openrouter"),
      false,
    );

    const modelIds = OPENROUTER_SPECIALISTS.map(
      (config) => config.openrouter_model_id,
    );
    assert.equal(new Set(modelIds).size, 5);
    for (const taskClass of [
      "reasoning",
      "classification",
      "extraction",
      "generation",
    ]) {
      assert.ok(
        OPENROUTER_SPECIALISTS.some((config) =>
          config.capabilities.includes(taskClass),
        ),
        `missing ${taskClass} specialist`,
      );
    }

    const config = OPENROUTER_SPECIALISTS[0];
    const hydrated = specialistConfigFromPersisted({
      ...config,
      discovered_for: "smoke",
      discovery_source: "registry",
    });
    assert.equal(hydrated.tier, "openrouter");
    assert.equal(hydrated.openrouter_model_id, config.openrouter_model_id);

    delete process.env.OPENROUTER_API_KEY;
    const runner = getRunner(config.agent_id);
    assert.equal((await runner.probe?.("reasoning"))?.status, "fail");

    process.env.OPENROUTER_API_KEY = "smoke-key";
    process.env.OPENROUTER_BASE_URL = "https://openrouter.invalid/api/v1";
    const requests: Array<{
      url: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
    }> = [];
    const replies = [
      JSON.stringify({
        decline: false,
        capability_claim:
          "1. Identify the migration constraints. 2. Compare viable options. 3. Recommend one and verify it against the success criteria.",
        estimated_seconds: 24,
      }),
      "Use a staged migration with explicit compatibility checks and rollback criteria.",
    ];
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({
        url: String(input),
        headers: init?.headers as Record<string, string>,
        body,
      });
      const content = replies[requests.length - 1];
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    assert.equal((await runner.probe?.("reasoning"))?.status, "pass");
    const bid = await runner.bid(
      "Choose a migration strategy for the billing service.\n\nTask class: reasoning\n\nBudget ceiling: $1.00.",
      "general",
    );
    assert.ok(!("decline" in bid));
    if (!("decline" in bid)) {
      assert.equal(bid.bid_price, config.cost_baseline);
      assert.equal(bid.plan_source, "llm");
      assert.match(bid.capability_claim, /no live tools/i);
    }

    const result = await runner.execute(
      "Choose a migration strategy for the billing service.",
      "reasoning",
    );
    assert.equal(result.provenance.tier, "model-backed");
    assert.equal(result.provenance.transport, "openrouter");
    assert.equal(result.provenance.live_tools_called, false);
    assert.match(String(result.output), /model-backed; no live tools called/i);

    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(
        request.url,
        "https://openrouter.invalid/api/v1/chat/completions",
      );
      assert.equal(request.headers.authorization, "Bearer smoke-key");
      assert.equal(request.body.model, config.openrouter_model_id);
      assert.equal(typeof request.body.max_tokens, "number");
      assert.equal("max_completion_tokens" in request.body, false);
    }

    console.log(
      "ok - OpenRouter specialists are gated, hydrated, model-specific, and honestly labeled",
    );
  } finally {
    reset();
  }
}

main().catch((error) => {
  reset();
  console.error(error);
  process.exit(1);
});
