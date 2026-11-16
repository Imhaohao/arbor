import assert from "node:assert/strict";
import { isWaitlistRole, normalizeEmail } from "./core";

assert.deepEqual(normalizeEmail("  Ada@Example.COM "), { ok: true, email: "ada@example.com" });
assert.equal(normalizeEmail("").ok, false);
assert.equal(normalizeEmail("   ").ok, false);
assert.equal(normalizeEmail("no-at-sign.com").ok, false);
assert.equal(normalizeEmail("two@@example.com").ok, false);
assert.equal(normalizeEmail("ada@localhost").ok, false);
assert.equal(normalizeEmail("a b@example.com").ok, false);
assert.equal(normalizeEmail(`${"a".repeat(250)}@example.com`).ok, false);

assert.equal(isWaitlistRole("buyer"), true);
assert.equal(isWaitlistRole("specialist"), true);
assert.equal(isWaitlistRole("admin"), false);

console.log("waitlist core: ok");
