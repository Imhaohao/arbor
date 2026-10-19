import assert from "node:assert/strict";
import { arborPublicDemo } from "./arbor-public-demo";
import { getSpecialists } from "./registry";
import {
  PUBLIC_DEMO_AGENT_ID,
  PUBLIC_DEMO_SMOKE_PROMPT,
} from "../public-demo";

async function main() {
  const previousDemoMode = process.env.ARBOR_PUBLIC_DEMO_MODE;
  process.env.ARBOR_PUBLIC_DEMO_MODE = "true";
  try {
    assert.deepEqual(
      getSpecialists().map((specialist) => specialist.agent_id),
      [PUBLIC_DEMO_AGENT_ID],
    );
  } finally {
    if (previousDemoMode === undefined) delete process.env.ARBOR_PUBLIC_DEMO_MODE;
    else process.env.ARBOR_PUBLIC_DEMO_MODE = previousDemoMode;
  }

  const decision = await arborPublicDemo.bid("Return the smoke-test sentence.", "general");
  assert.ok(!("decline" in decision));

  const result = await arborPublicDemo.execute(
    PUBLIC_DEMO_SMOKE_PROMPT,
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
