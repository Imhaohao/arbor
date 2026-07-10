import assert from "node:assert/strict";
import { buildAgenticContextLayer } from "./agentic-context-layer";

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_PAT;
  delete process.env.HYPERSPELL_API_KEY;
  delete process.env.HYPERSPELL_USER_ID;
  delete process.env.NIA_API_KEY;
  delete process.env.REACHER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CONTEXT7_MCP_ENDPOINT;
  delete process.env.PLAYWRIGHT_MCP_ENDPOINT;
  delete process.env.FIGMA_MCP_ENDPOINT;
  delete process.env.FIGMA_ACCESS_TOKEN;
  delete process.env.SUPABASE_MCP_ENDPOINT;
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.LINEAR_MCP_ENDPOINT;
  delete process.env.LINEAR_API_KEY;
}

resetEnv();
let layer = buildAgenticContextLayer({
  userId: "buyer:test",
  repoUrl: "https://github.com/Imhaohao/miyohacks.git",
});

assert.equal(layer.version, "agentic-context-layer-v1");
assert.deepEqual(layer.repo, { owner: "Imhaohao", repo: "miyohacks" });
assert.equal(layer.connectors.find((c) => c.id === "github")?.status, "needs_key");
assert.equal(layer.connectors.find((c) => c.id === "nia")?.status, "needs_key");
assert.equal(layer.connectors.find((c) => c.id === "openai")?.status, "needs_key");
assert.equal(layer.connectors.find((c) => c.id === "context7")?.status, "ready");
assert.equal(layer.connectors.find((c) => c.id === "figma")?.status, "needs_http_endpoint");
assert.equal(
  layer.connectors.find((c) => c.id === "commerce")?.action_policy.mode,
  "human_review_required",
);
assert.match(layer.prompt_addendum, /Agentic context layer/);

process.env.GITHUB_TOKEN = "ghp_test";
process.env.NIA_API_KEY = "nia_test";
process.env.HYPERSPELL_API_KEY = "hs_test";
process.env.HYPERSPELL_USER_ID = "user_test";
process.env.REACHER_API_KEY = "reacher_test";
process.env.OPENAI_API_KEY = "sk_test";
process.env.FIGMA_MCP_ENDPOINT = "https://figma.example/mcp";
process.env.FIGMA_ACCESS_TOKEN = "figma_test";

layer = buildAgenticContextLayer({ userId: "buyer:test" });
assert.equal(layer.connectors.find((c) => c.id === "github")?.status, "ready");
assert.equal(layer.connectors.find((c) => c.id === "nia")?.status, "ready");
assert.equal(layer.connectors.find((c) => c.id === "hyperspell")?.status, "ready");
assert.equal(layer.connectors.find((c) => c.id === "openai")?.status, "ready");
assert.equal(layer.connectors.find((c) => c.id === "figma")?.status, "ready");
assert.equal(layer.connectors.find((c) => c.id === "google_drive")?.status, "needs_oauth");
assert.equal(layer.connectors.find((c) => c.id === "tiktok")?.status, "ready");

resetEnv();

console.log("agentic-context-layer tests passed");
