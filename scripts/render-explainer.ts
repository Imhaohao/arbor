// Standalone driver for the codebase-explainer render pipeline (slices 1-3).
//
//   npm run explainer:render                       # built-in sample prompt
//   npm run explainer:render -- path/to/prompt.txt # your own task prompt
//
// Forces both artifact flags on for the run, executes the registered
// specialist end-to-end (script -> TTS audio -> slide video), and prints the
// artifact paths. Uses OPENAI_API_KEY from .env.local; writes under
// public/explainers/<id>/ so `npm run dev` serves the results.

import { existsSync, readFileSync } from "node:fs";
import { statSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    if (process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

process.env.ARBOR_EXPLAINER_AUDIO_ENABLED = "true";
process.env.ARBOR_EXPLAINER_VIDEO_ENABLED = "true";

const SAMPLE = `Explain this codebase to a new engineer so they understand it.

Context — a small Express service:

// server.ts
import express from "express";
import { rateLimit } from "./rateLimit";
const app = express();
app.use(rateLimit({ windowMs: 60000, max: 30 }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/orders", createOrder);
app.listen(3000);

// rateLimit.ts — sliding-window limiter backed by an in-memory Map keyed by client IP.
// orders.ts — createOrder validates the body with zod then writes to Postgres via the pool in db.ts.
`;

async function main() {
  const { getRunner } = await import("../lib/specialists/registry");
  const promptPath = process.argv[2];
  const prompt = promptPath ? readFileSync(resolve(promptPath), "utf8") : SAMPLE;
  const id = `render-${promptPath ? "custom" : "sample"}`;

  const runner = getRunner("codebase-explainer");
  console.log(`[explainer] executing (script + audio + video)...`);
  const result = await runner.execute(prompt, "education", {
    task_id: id,
    agent_id: "codebase-explainer",
  } as never);

  console.log(`\n${result.output}\n`);
  console.log(`provenance: ${JSON.stringify(result.provenance)}`);

  for (const f of ["audio.wav", "video.mp4", "lesson.json"]) {
    const p = resolve("public", "explainers", id, f);
    if (existsSync(p)) {
      console.log(`artifact: ${p} (${(statSync(p).size / 1024 / 1024).toFixed(2)} MB)`);
    }
  }
}

main().catch((e) => {
  console.error("render failed:", e);
  process.exit(1);
});
