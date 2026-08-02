import assert from "node:assert/strict";
import { arborPublicDemo } from "./arbor-public-demo";

async function main() {
  const decision = await arborPublicDemo.bid("Return the smoke-test sentence.", "general");
  assert.ok(!("decline" in decision));

  const result = await arborPublicDemo.execute(
    "Return the exact sentence: Arbor preview smoke test passed safely.",
    "general",
  );
  assert.equal(typeof result.output, "string");
  if (typeof result.output === "string") {
    assert.match(result.output, /Arbor preview smoke test passed safely\./);
  }
  assert.equal(result.provenance.live_tools_called, false);
  assert.equal(result.provenance.transport, "mock");
  console.log("arbor-public-demo tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
