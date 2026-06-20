import assert from "node:assert/strict";
import { buildMarketAgentCard } from "./a2a-market-card";

const previous = process.env.ARBOR_A2A_HMAC_REQUIRED;
process.env.ARBOR_A2A_HMAC_REQUIRED = "true";

const card = buildMarketAgentCard({
  url: "http://localhost:3000/api/a2a/market",
  headers: new Headers({
    "x-forwarded-host": "arbor.example",
    "x-forwarded-proto": "https",
  }),
});

assert.equal(card.url, "https://arbor.example/api/a2a/market");
assert.equal(card.arbor.did, "did:web:arbor.example:agents:arbor-market");
assert.ok(card.defaultInputModes.includes("text/toon"));
assert.ok(card.defaultOutputModes.includes("text/toon"));
assert.deepEqual(card.security, [{ arborHmac: [] }]);
assert.equal(card.arbor.blackboard.write_auth, "arborHmac");
assert.ok(card.arbor.supported_methods.includes("tasks/cancel"));

if (previous === undefined) delete process.env.ARBOR_A2A_HMAC_REQUIRED;
else process.env.ARBOR_A2A_HMAC_REQUIRED = previous;

console.log("a2a-market-card tests passed");
