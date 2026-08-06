// Turn the census into the two lists a human can actually act on.
//
// Usage: npm run roster:actions
//
// Everything the connector could do on its own is done. What remains needs a
// person: signing up with vendors (which this agent does not do) and deciding
// which dead rows to delete. This emits both as concrete worklists rather
// than as a count of things that failed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "autoresearch/data");
const OUT_DIR = resolve(ROOT, "autoresearch/to_human");

interface CensusRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  verdict: string;
  endpoint?: string;
  key_env?: string;
  http_status?: number;
  abilities: string[];
  detail?: string;
}

function host(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 50);
  }
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 60);
}

function main(): void {
  const census = JSON.parse(
    readFileSync(resolve(DATA_DIR, "roster-census.json"), "utf8"),
  ) as CensusRow[];

  const paywalled = census.filter((r) => r.verdict === "paywalled");
  const dead = census.filter(
    (r) => r.verdict === "dead" || r.verdict === "no_transport",
  );

  // Group paywalled agents by vendor host: one signup usually unlocks many
  // agent rows, so the vendor is the unit of work, not the agent.
  const byHost = new Map<string, CensusRow[]>();
  for (const row of paywalled) {
    const key = host(row.endpoint) || row.sponsor || "unknown";
    byHost.set(key, [...(byHost.get(key) ?? []), row]);
  }
  const ranked = [...byHost.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines: string[] = [];
  lines.push("# Roster action list — what needs a human");
  lines.push("");
  lines.push(
    "Everything reachable without credentials has been wired and proven. " +
      "These three lists are the remainder, and each needs a decision this agent " +
      "does not make on its own: creating vendor accounts, approving calls that " +
      "change real account state, and deleting rows.",
  );
  lines.push("");

  lines.push("## 1. Vendors to sign up with (unlocks the most agents first)");
  lines.push("");
  lines.push(
    `${paywalled.length} agents across ${ranked.length} vendors are alive and refuse ` +
      "anonymous callers. One signup typically unlocks every agent on that host. " +
      "Paste each key into `.env.local` under the env name shown (or any name — " +
      "then set it on the roster entry) and the agent activates on the next run.",
  );
  lines.push("");
  lines.push("| Vendor host | Agents unlocked | HTTP | Suggested env var |");
  lines.push("|---|---:|---|---|");
  for (const [hostname, rows] of ranked.slice(0, 40)) {
    const statuses = [...new Set(rows.map((r) => r.http_status))].join("/");
    const envName =
      rows.find((r) => r.key_env)?.key_env ??
      `${hostname.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase().slice(0, 28)}_API_KEY`;
    lines.push(
      `| ${esc(hostname)} | ${rows.length} | ${statuses} | \`${envName}\` |`,
    );
  }
  if (ranked.length > 40) {
    lines.push(`| _(+${ranked.length - 40} more vendors)_ | | | |`);
  }
  lines.push("");
  const top10 = ranked.slice(0, 10).reduce((a, [, r]) => a + r.length, 0);
  lines.push(
    `Leverage note: there is NO shortcut here — the ${paywalled.length} blocked ` +
      `agents are spread across ${ranked.length} distinct vendors, and the top 10 ` +
      `unlock only ${top10} between them. Most are single-agent long-tail servers ` +
      "where the signup cost likely exceeds the value; pick deliberately rather " +
      "than working down the list.",
  );
  lines.push("");

  // Agents that answered and named their tools, but whose every tool changes
  // real state. They are one human decision away from delivering.
  const liveMutating = census.filter(
    (r) =>
      (r.verdict === "live_open" || r.verdict === "live_keyed") &&
      r.abilities.length > 0 &&
      !r.abilities.some((t) => {
        const l = t.toLowerCase();
        return (
          !/create|delete|remove|update|write|send|post|publish|deploy|pay|charge|buy|order|cancel|upload|invite|revoke|reset/.test(
            l,
          ) &&
          /search|query|get_|list|read|fetch|ask|docs|lookup|find|describe|info|explain|summar|check|validate|verify|compare|analyz|detect|calculate|convert|estimate|resolve|status|health|ping|echo|hello|help|capabilit|count|inspect|parse|translate/.test(
            l,
          )
        );
      }),
  );

  lines.push("## 2. Agents awaiting your go-ahead (one decision from delivering)");
  lines.push("");
  lines.push(
    `${liveMutating.length} agents are alive and published their tool list — they ` +
      "responded and stated their abilities — but every tool they expose changes " +
      "real state in an account (create, send, deploy, charge). Nothing was " +
      "invoked on them, deliberately. Review the tools below and tell me which " +
      "agents are safe to call, or approve specific tool names.",
  );
  lines.push("");
  lines.push("| Agent | Vendor | Tools it exposes |");
  lines.push("|---|---|---|");
  for (const row of liveMutating.slice(0, 50)) {
    lines.push(
      `| ${esc(row.agent_id)} | ${esc(host(row.endpoint) || row.sponsor)} | ${esc(row.abilities.slice(0, 5).join(", "))} |`,
    );
  }
  if (liveMutating.length > 50) {
    lines.push(`| _(+${liveMutating.length - 50} more)_ | | |`);
  }
  lines.push("");

  lines.push("## 3. Rows to prune (nothing answers)");
  lines.push("");
  lines.push(
    `${dead.length} registered agents have no reachable endpoint. They were retried ` +
      "across URL variants (`/mcp`, `/sse`, `/api/mcp`, trailing slash) and again " +
      "at a 25s timeout. They are not credential problems — there is no server. " +
      "Until they are removed they inflate the roster count and every metric " +
      "derived from it.",
  );
  lines.push("");
  lines.push("```");
  for (const row of dead.slice(0, 60)) lines.push(row.agent_id);
  if (dead.length > 60) lines.push(`... and ${dead.length - 60} more`);
  lines.push("```");
  lines.push("");
  lines.push(
    "Full machine-readable list: `autoresearch/data/roster-census.json` " +
      '(filter `verdict` = "dead" or "no_transport").',
  );
  lines.push("");

  mkdirSync(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, "roster-actions.md");
  writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(out);
  console.log(
    `${paywalled.length} paywalled across ${ranked.length} vendors | top10 unlocks ${top10} | ${dead.length} prunable`,
  );
}

main();
