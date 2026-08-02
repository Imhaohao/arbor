import assert from "node:assert/strict";
import { CLUESO_EDITOR_CONFIG, CLUESO_NO_API_REASON, cluesoEditor } from "./clueso-editor";
import { getRunner, SPECIALISTS } from "./registry";

const ORIGINAL_FETCH = globalThis.fetch;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  globalThis.fetch = ORIGINAL_FETCH;
  try {
    await fn();
    console.log(`ok - ${name}`);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
}

async function main(): Promise<void> {
  await test("registered in the static roster", () => {
    const cfg = SPECIALISTS.find((s) => s.agent_id === "clueso-editor");
    assert.ok(cfg, "clueso-editor must be in the static roster");
    assert.equal(getRunner("clueso-editor").config.agent_id, "clueso-editor");
  });

  // The whole point of this file: unlike the other four editors, this is a
  // missing-PRODUCT case, not a missing-credential case. No env var, however
  // configured, could ever make this specialist execute.
  await test("always declines to bid, regardless of any env var", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must never call — there is no known API to call");
    };
    const decision = await cluesoEditor.bid("edit this product demo video", "generation");
    assert.ok("decline" in decision);
    assert.equal(decision.reason, CLUESO_NO_API_REASON);
    assert.equal(called, false);
  });

  await test("probe always reports demo_lane with the honest reason", async () => {
    const probe = await cluesoEditor.probe!("generation");
    assert.equal(probe.status, "demo_lane");
    assert.equal(probe.error_message, CLUESO_NO_API_REASON);
    assert.equal(probe.duration_ms, 0, "no network call should ever be attempted");
  });

  await test("execute always throws rather than fabricating a result", async () => {
    await assert.rejects(
      () => cluesoEditor.execute("edit this product demo video", "generation"),
      (error: unknown) => error instanceof Error && error.message === CLUESO_NO_API_REASON,
    );
  });

  await test("config never claims a homepage-only integration is live", () => {
    // No mcp_endpoint / a2a_endpoint / openrouter_model_id — nothing that could
    // make the roster machinery believe a transport actually exists.
    assert.equal(CLUESO_EDITOR_CONFIG.mcp_endpoint, undefined);
    assert.equal(CLUESO_EDITOR_CONFIG.a2a_endpoint, undefined);
    assert.equal(CLUESO_EDITOR_CONFIG.openrouter_model_id, undefined);
  });

  // Regression guard: rankAgents4D's priceScore treats cost_baseline <= 0 as
  // "free", the best possible price. A specialist that can NEVER execute must
  // not be able to win routing shortlist slots by looking artificially cheap —
  // this exact bug shipped once and was caught by re-running the routing trace,
  // not by a test, so it gets a test now.
  await test("cost_baseline is not 0 or negative (would game priceScore)", () => {
    assert.ok(
      CLUESO_EDITOR_CONFIG.cost_baseline > 0,
      `cost_baseline must be > 0, got ${CLUESO_EDITOR_CONFIG.cost_baseline} — ` +
        "priceScore treats <= 0 as free/best-price, which would let a " +
        "non-executing specialist win invite slots on price alone",
    );
  });

  console.log("clueso-editor tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
