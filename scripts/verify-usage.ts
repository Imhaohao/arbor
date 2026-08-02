/**
 * Proves that token accounting captures real measured spend from a live provider
 * call. Run with `npm run usage:verify`.
 *
 * This exists because every cost figure downstream (savings, per-node spend, the
 * cost term in the routing objective) is only as real as this capture path. If
 * this script reports zero calls or $0, no cost number in the product is real —
 * regardless of what the UI shows.
 *
 * Makes one small paid call (Haiku, 16 max tokens — well under a cent).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local without printing any values.
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvLocal();

import { callClaude } from "../lib/anthropic";
import {
  cacheHitRate,
  collectUsage,
  totalInputTokens,
} from "../lib/llm-usage";

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set; cannot verify against a live call.");
    process.exit(1);
  }

  const { result, records, totals } = await collectUsage(async () =>
    callClaude({
      model: "claude-haiku-4-5-20251001",
      systemPrompt: "Reply with exactly one word.",
      userPrompt: "Say: verified",
      maxTokens: 16,
    }),
  );

  console.log(`model reply: ${JSON.stringify(result.trim().slice(0, 40))}`);
  console.log(`calls recorded: ${records.length}`);
  for (const record of records) {
    console.log(`  provider=${record.provider} model=${record.model}`);
    console.log(`  usage=${JSON.stringify(record.usage)}`);
    console.log(
      `  total_input=${totalInputTokens(record.usage)} ` +
        `cache_hit_rate=${cacheHitRate(record.usage) ?? "n/a"}`,
    );
    console.log(
      `  cost_usd=${record.cost_usd ?? "UNPRICED"} duration_ms=${record.duration_ms}`,
    );
  }
  console.log(`totals: ${JSON.stringify(totals)}`);

  if (records.length === 0) {
    throw new Error(
      "no usage captured from a live call — the recording hook is not wired",
    );
  }
  if (totals.unpriced_calls > 0) {
    throw new Error(
      `${totals.unpriced_calls} call(s) had no known price; add the model to MODEL_PRICES`,
    );
  }
  if (!(totals.cost_usd > 0)) {
    throw new Error("a real paid call was costed at $0");
  }
  console.log(
    "\nVERIFIED: measured tokens and list-price cost captured from a live call.",
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
