import assert from "node:assert/strict";
import {
  encodeToon,
  decodeToon,
  toonEnabled,
  toonStats,
  serializeAgentData,
  parseAgentData,
  formatStructuredBlock,
  TOON_FILE_EXTENSION,
  TOON_MEDIA_TYPE,
} from "./toon";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.ARBOR_TOON_ENABLED;
  delete process.env.ARBOR_TOON_DISABLED;
}

/** decode(encode(x)) must equal JSON-normalized x. */
function assertRoundTrip(value: unknown, label: string): void {
  const norm = JSON.parse(JSON.stringify(value));
  const encoded = encodeToon(value);
  const decoded = decodeToon(encoded);
  assert.deepEqual(decoded, norm, `round-trip failed for ${label}\n--- TOON ---\n${encoded}\n`);
}

let passed = 0;
function test(name: string, fn: () => void): void {
  resetEnv();
  fn();
  resetEnv();
  passed++;
  console.log(`  ok ${name}`);
}

// ─── round-trip fidelity ────────────────────────────────────────────────────

test("scalars round-trip", () => {
  for (const v of [null, true, false, 0, 42, -3.14, 1e5, "", "hello", "hello world"]) {
    assertRoundTrip(v, JSON.stringify(v));
  }
});

test("strings that look like other types are quoted and round-trip as strings", () => {
  for (const v of ["true", "false", "null", "42", "1.5", "007", "-3", "1e5", "{}"]) {
    const decoded = decodeToon(encodeToon({ x: v }));
    assert.deepEqual(decoded, { x: v }, `string "${v}" should stay a string`);
  }
});

test("strings with delimiters / structural chars round-trip", () => {
  for (const v of ["a,b", "key: value", 'has "quotes"', "back\\slash", "line\nbreak", "  spaced  ", "- dashy", "[bracket"]) {
    assertRoundTrip({ s: v }, JSON.stringify(v));
  }
});

test("flat object round-trips", () => {
  assertRoundTrip({ enabled: true, count: 100, ratio: 0.85, name: "Config A", description: null }, "config");
});

test("nested objects round-trip", () => {
  assertRoundTrip({ app: { config: { database: { host: "localhost", port: 5432 } } } }, "nested");
});

test("primitive array uses inline [N] form", () => {
  const toon = encodeToon({ friends: ["ana", "luis", "sam"] });
  assert.equal(toon, "friends[3]: ana,luis,sam");
  assertRoundTrip({ friends: ["ana", "luis", "sam"], flags: [true, false, true], nums: [1, 2, 3] }, "prim arrays");
});

test("uniform object array uses tabular form", () => {
  const data = {
    hikes: [
      { id: 1, name: "Blue Lake", distance: 7.5 },
      { id: 2, name: "Ridge", distance: 9.2 },
    ],
  };
  const toon = encodeToon(data);
  assert.equal(toon, "hikes[2]{id,name,distance}:\n  1,Blue Lake,7.5\n  2,Ridge,9.2");
  assertRoundTrip(data, "tabular");
});

test("non-uniform / nested arrays use list (dash) form and round-trip", () => {
  assertRoundTrip(
    {
      orders: [
        { id: 1, items: [{ sku: "A" }, { sku: "B" }] },
        { id: 2, items: [{ sku: "C" }] },
      ],
    },
    "orders nested",
  );
  assertRoundTrip({ mixed: [1, "two", { three: 3 }, [4, 5], null] }, "mixed array");
  assertRoundTrip({ matrix: [[1, 2], [3, 4], [5, 6]] }, "matrix");
});

test("empty containers round-trip", () => {
  assertRoundTrip({ a: [], b: {}, c: [{}], d: [[]] }, "empties");
  assert.deepEqual(decodeToon(encodeToon([])), []);
  assert.deepEqual(decodeToon(encodeToon({})), {});
});

test("root-level array and scalar round-trip", () => {
  assertRoundTrip([1, 2, 3], "root prim array");
  assertRoundTrip([{ id: 1, n: "a" }, { id: 2, n: "b" }], "root tabular");
  assertRoundTrip("just a string", "root scalar");
});

test("deep realistic agent payload round-trips", () => {
  assertRoundTrip(
    {
      meta: { version: "1.0", timestamp: "2025-01-15" },
      users: [
        { id: 1, name: "Alice", role: "admin", active: true },
        { id: 2, name: "Bob", role: "user", active: false },
      ],
      routing: { execution_rule: "auction", recommended_specialists: ["a", "b", "c"] },
      notes: null,
    },
    "agent payload",
  );
});

test("decoder reads canonical TOON tabular arrays", () => {
  const canonical = "orders[2]{id,name}:\n  1,Alice\n  2,Bob";
  assert.deepEqual(decodeToon(canonical), {
    orders: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ],
  });
});

// ─── token savings ──────────────────────────────────────────────────────────

test("TOON is smaller than JSON on uniform-array payloads", () => {
  const data = {
    rows: Array.from({ length: 12 }, (_, i) => ({ id: i, name: `item-${i}`, score: i * 1.5, ok: i % 2 === 0 })),
  };
  const stats = toonStats(data);
  assert.ok(stats.toon_chars < stats.json_chars, "TOON should be fewer chars");
  assert.ok(stats.saved_pct > 30, `expected >30% token savings, got ${stats.saved_pct}%`);
});

// ─── master switch ──────────────────────────────────────────────────────────

test("master switch defaults OFF and is reversible", () => {
  assert.equal(toonEnabled(), false);
  process.env.ARBOR_TOON_ENABLED = "true";
  assert.equal(toonEnabled(), true);
  process.env.ARBOR_TOON_ENABLED = "0";
  assert.equal(toonEnabled(), false);
});

test("per-call override wins over the global flag", () => {
  assert.equal(toonEnabled("toon"), true);
  process.env.ARBOR_TOON_ENABLED = "true";
  assert.equal(toonEnabled("json"), false);
});

test("kill-switch wins over everything", () => {
  process.env.ARBOR_TOON_ENABLED = "true";
  process.env.ARBOR_TOON_DISABLED = "true";
  assert.equal(toonEnabled(), false);
  assert.equal(toonEnabled("toon"), false, "kill-switch beats per-call override");
});

// ─── agent-communication boundary ───────────────────────────────────────────

test("serializeAgentData honors the switch and stays JSON for scalars", () => {
  const value = { hikes: [{ id: 1, name: "A" }, { id: 2, name: "B" }] };
  const off = serializeAgentData(value);
  assert.equal(off.format, "json");
  assert.deepEqual(JSON.parse(off.text), value);

  const on = serializeAgentData(value, { override: "toon" });
  assert.equal(on.format, "toon");
  assert.equal(on.media_type, TOON_MEDIA_TYPE);
  assert.equal(on.file_extension, TOON_FILE_EXTENSION);
  assert.deepEqual(decodeToon(on.text), value);

  // bare scalars never switch — JSON even when forced on
  assert.equal(serializeAgentData("scalar", { override: "toon" }).format, "json");
});

test("parseAgentData decodes both formats and sniffs when undeclared", () => {
  const value = { a: [1, 2, 3], b: { c: "d" } };
  assert.deepEqual(parseAgentData(JSON.stringify(value), "json"), value);
  assert.deepEqual(parseAgentData(encodeToon(value), "toon"), value);
  assert.deepEqual(parseAgentData(JSON.stringify(value)), value); // sniffs JSON
  assert.deepEqual(parseAgentData(encodeToon(value)), value); // sniffs TOON
});

test("formatStructuredBlock is self-describing and fenced", () => {
  const value = { rows: [{ id: 1 }, { id: 2 }] };
  const json = formatStructuredBlock("Schema", value);
  assert.match(json.text, /^Schema:\n```json\n/);

  const toon = formatStructuredBlock("Schema", value, { override: "toon" });
  assert.match(toon.text, /TOON format/);
  assert.match(toon.text, /```toon\n/);
  // the fenced body must decode back to the original
  const body = toon.text.split("```toon\n")[1].split("\n```")[0];
  assert.deepEqual(decodeToon(body), value);
});

console.log(`\ntoon.test.ts: ${passed} tests passed`);
