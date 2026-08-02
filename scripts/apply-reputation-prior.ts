// Usage:
//   npm run reputation:prior              # dry run, prints the distribution
//   npm run reputation:prior -- --write   # actually rewrite reputation_score
//   npm run reputation:prior -- --vectors path/to/agent_encoder_vectors.json
//
// Two-step maintenance pass:
//
//   1. Upload the offline encoder-target-decoupling vectors (arXiv:2603.20895)
//      produced by scripts/encode-agent-descriptors.py into
//      `agent_encoder_vectors`. Skipped when --vectors is not supplied, so a
//      re-rank against already-stored vectors costs nothing.
//   2. Run reputationPrior:applyAll, which ranks every agent that has never
//      settled a task and writes the resulting prior into
//      `agents.reputation_score`.
//
// Both steps go through `npx convex run` rather than a Convex HTTP client: the
// functions are internal, and the CLI is what holds the deploy credentials.
// Nothing here is reachable from a browser.
//
// Why this exists: 1,105 of 1,233 agents sit at exactly 0.5, so the
// 0.30-weighted reputation dimension of rankAgents4D has a standard deviation
// of zero and cannot reorder any candidate. See lib/hive/reputation-prior-core.ts.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Agents per `convex run` invocation. Keeps each argv payload well under the
 * OS limit and each mutation under the document-write limit. */
const UPLOAD_BATCH = 100;

interface VectorRow {
  agent_id: string;
  vector: number[];
  logit: number;
  descriptor: string;
}

function runConvex(fn: string, args: unknown): unknown {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The CLI prefixes warnings before the JSON body; take the last JSON value.
  const start = out.indexOf("{");
  if (start < 0) return undefined;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return out.slice(start);
  }
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const vectorsPath = option("vectors");
  const write = flag("write");

  if (vectorsPath) {
    const rows = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorRow[];
    console.log(`uploading ${rows.length} encoder vectors from ${vectorsPath}`);
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < rows.length; i += UPLOAD_BATCH) {
      const batch = rows.slice(i, i + UPLOAD_BATCH).map((r) => ({
        agent_id: r.agent_id,
        vector: r.vector,
        logit: r.logit,
        descriptor: r.descriptor,
      }));
      const res = runConvex("reputationPrior:_upsertVectors", { rows: batch }) as
        | { inserted: number; updated: number }
        | undefined;
      inserted += res?.inserted ?? 0;
      updated += res?.updated ?? 0;
      process.stdout.write(
        `\r  ${Math.min(i + UPLOAD_BATCH, rows.length)}/${rows.length}`,
      );
    }
    console.log(`\n  inserted=${inserted} updated=${updated}`);
  } else {
    console.log("no --vectors supplied; ranking against stored vectors only");
  }

  console.log(write ? "\napplying priors…" : "\ndry run (pass --write to persist)…");
  const summary = runConvex("reputationPrior:applyAll", { dry_run: !write });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
