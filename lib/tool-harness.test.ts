import assert from "node:assert/strict";
import {
  normalizeToolCatalog,
  runToolHarness,
  type ExternalToolAdapter,
  type HarnessDecision,
} from "./tool-harness";

async function main() {
const catalog = normalizeToolCatalog([
  { adapterId: "workspace", tools: [{ name: "search", parallelSafe: true }] },
  { adapterId: "github", tools: [{ name: "search", parallelSafe: true }] },
  { adapterId: "web", tools: [{ name: "web.search" }] },
]);
assert.deepEqual(
  catalog.map((tool) => tool.modelName),
  ["search", "github__search", "web_search"],
);

await assert.rejects(
  () => runToolHarness({
    goal: "duplicate adapters",
    adapters: [
      { id: "same", async discover() { return []; }, async call() { return { ok: true, content: "" }; } },
      { id: "same", async discover() { return []; }, async call() { return { ok: true, content: "" }; } },
    ],
    model: { async decide() { return { type: "final", content: "unused" }; } },
  }),
  /duplicate external tool adapter id: same/,
);

const calls: string[] = [];
const adapter: ExternalToolAdapter = {
  id: "github",
  async discover() {
    return [
      { name: "search", effect: "read", parallelSafe: true },
      { name: "delete_issue", effect: "write" },
    ];
  },
  async call(name, args) {
    calls.push(`${name}:${String(args.q ?? "")}`);
    return { ok: true, content: `${name} result` };
  },
};

const decisions: HarnessDecision[] = [
  {
    type: "tool_calls",
    calls: [
      { id: "1", name: "search", arguments: { q: "harness" } },
      { id: "2", name: "delete_issue", arguments: { q: "7" } },
    ],
  },
  { type: "final", content: "grounded answer" },
];
const result = await runToolHarness({
  goal: "research the harness",
  adapters: [adapter],
  model: {
    async decide() {
      return decisions.shift() ?? { type: "final", content: "done" };
    },
  },
  policy: {
    authorize(_call, tool) {
      return tool.effect === "write"
        ? { allowed: false, reason: "approval required" }
        : { allowed: true };
    },
  },
});
assert.equal(result.status, "completed");
assert.equal(result.output, "grounded answer");
assert.deepEqual(calls, ["search:harness"]);
assert.equal(result.receipts.length, 2);
assert.equal(result.receipts[0].ok, true);
assert.match(result.receipts[1].error ?? "", /approval required/);

let repeatedRound = 0;
const repeated = await runToolHarness({
  goal: "loop",
  adapters: [adapter],
  model: {
    async decide({ forceFinal }) {
      if (forceFinal) return { type: "final", content: "stopped" };
      repeatedRound += 1;
      return {
        type: "tool_calls",
        calls: [{ id: String(repeatedRound), name: "search", arguments: { q: "same" } }],
      };
    },
  },
  policy: { maxRounds: 3, maxRepeatedCall: 1 },
});
assert.equal(repeated.status, "budget_exhausted");
assert.equal(repeated.output, "stopped");
assert.equal(repeated.receipts.filter((receipt) => receipt.ok).length, 1);
assert.match(repeated.receipts[1].error ?? "", /repeated identical call/);

const parallelOrder = await runToolHarness({
  goal: "parallel",
  adapters: [{
    id: "web",
    async discover() {
      return [
        { name: "slow", effect: "read", parallelSafe: true },
        { name: "fast", effect: "read", parallelSafe: true },
      ];
    },
    async call(name) {
      if (name === "slow") await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true, content: name };
    },
  }],
  model: {
    async decide({ transcript }) {
      if (transcript.some((entry) => entry.role === "tool")) {
        return { type: "final", content: "ordered" };
      }
      return {
        type: "tool_calls",
        calls: [
          { id: "slow-call", name: "slow", arguments: {} },
          { id: "fast-call", name: "fast", arguments: {} },
        ],
      };
    },
  },
});
assert.deepEqual(
  parallelOrder.receipts.map((receipt) => receipt.callId),
  ["slow-call", "fast-call"],
);

const unavailable = await runToolHarness({
  goal: "none",
  adapters: [{ ...adapter, async discover() { throw new Error("offline"); } }],
  model: { async decide() { return { type: "final", content: "unused" }; } },
});
assert.equal(unavailable.status, "unavailable");
assert.deepEqual(unavailable.discoveryErrors, [{ adapterId: "github", error: "offline" }]);

const bounded = await runToolHarness({
  goal: "bounded",
  adapters: [adapter],
  model: {
    async decide({ forceFinal }) {
      return forceFinal
        ? { type: "final", content: "bounded" }
        : { type: "tool_calls", calls: [] };
    },
  },
  policy: { maxParallelCalls: 0, maxResultChars: -1, maxRounds: Number.NaN },
});
assert.equal(bounded.status, "budget_exhausted");
assert.equal(bounded.output, "bounded");

console.log("tool-harness tests passed");
}

void main();
