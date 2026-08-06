// Investigative output: what every registered agent actually is.
//
// Usage: npm run roster:report
//
// Merges the transport census with the hive participation proof and writes
// autoresearch/to_human/agent-roster-investigation.md. Every number here
// traces to a recorded HTTP outcome or a signed blackboard row; nothing is
// inferred from the catalog.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readOnlyAbilities } from "../lib/hive/census-roster";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "autoresearch/data");
const OUT_DIR = resolve(ROOT, "autoresearch/to_human");

interface CensusRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  transport: string;
  endpoint?: string;
  key_env?: string;
  verdict: string;
  abilities: string[];
  http_status?: number;
  detail?: string;
}

interface AgentProof {
  agent_id: string;
  display_name: string;
  sponsor: string;
  messages: number;
  ability_statement?: string;
  cooperation_excerpt?: string;
  tool_used?: string;
  dag_id?: string;
  failure?: string;
}

function readJson<T>(name: string, fallback: T): T {
  const path = resolve(DATA_DIR, name);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function host(url?: string): string {
  if (!url) return "-";
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}

function esc(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function main(): void {
  const census = readJson<CensusRow[]>("roster-census.json", []);
  const proofs = readJson<AgentProof[]>("hive-mass-proof.json", []);
  if (census.length === 0) throw new Error("no census data");

  const byVerdict = new Map<string, CensusRow[]>();
  for (const row of census) {
    const list = byVerdict.get(row.verdict) ?? [];
    list.push(row);
    byVerdict.set(row.verdict, list);
  }
  const count = (v: string) => byVerdict.get(v)?.length ?? 0;

  const live = [...(byVerdict.get("live_open") ?? []), ...(byVerdict.get("live_keyed") ?? [])];
  const mutatingOnly = live.filter((r) => readOnlyAbilities(r.abilities).length === 0);
  const spoke = proofs.filter((p) => p.messages >= 1);
  const cooperated = proofs.filter((p) => p.messages >= 2);

  const paywalled = byVerdict.get("paywalled") ?? [];
  const paywalledBySponsor = new Map<string, CensusRow[]>();
  for (const row of paywalled) {
    const key = row.sponsor || host(row.endpoint);
    const list = paywalledBySponsor.get(key) ?? [];
    list.push(row);
    paywalledBySponsor.set(key, list);
  }
  const topPaywalled = [...paywalledBySponsor.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 25);

  const dead = byVerdict.get("dead") ?? [];
  const deadReasons = new Map<string, number>();
  for (const row of dead) {
    const reason = row.http_status
      ? `HTTP ${row.http_status}`
      : (row.detail ?? "unknown").split(":")[0].slice(0, 40);
    deadReasons.set(reason, (deadReasons.get(reason) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push("# Agent roster investigation — can every registered agent actually work?");
  lines.push("");
  lines.push(
    `Generated from a live probe of all ${census.length} registered specialists. ` +
      "Each verdict is a recorded HTTP outcome; each hive quote is a signed " +
      "blackboard row written by that agent's own server.",
  );
  lines.push("");
  // Authoritative accounting, derived from the boards themselves rather than
  // from any single run's proof file. Buckets sum to the registered roster.
  const recon = readJson<{
    summary?: {
      registered_agents: number;
      reconciled_total: number;
      balanced: boolean;
      cooperated_2plus_rounds: number;
      buckets: Record<string, number>;
      live_no_delivery_detail: Record<string, number>;
    };
  }>("roster-reconciliation.json", {});
  if (recon.summary) {
    const s = recon.summary;
    lines.push("## Complete accounting");
    lines.push("");
    lines.push(
      `Every one of the **${s.registered_agents} registered agents** lands in exactly one ` +
        `bucket below (total ${s.reconciled_total}, balanced: ${s.balanced ? "yes" : "NO"}). ` +
        "Participation is read from the hive boards themselves, so agents proven in earlier " +
        "sessions are counted alongside the mass run.",
    );
    lines.push("");
    lines.push("| Bucket | Agents | Meaning |");
    lines.push("|---|---:|---|");
    const meaning: Record<string, string> = {
      delivered:
        "Responded without error, stated its ability, and returned real output from its own tools",
      declared_only:
        "Answered tools/list with real tools (non-error + ability) but every tool mutates a real account, so nothing was invoked",
      live_no_delivery: "Server is reachable but produced no usable output",
      paywalled: "Alive, refuses without credentials we do not have",
      dead: "Nothing answers at the endpoint",
      no_transport: "Registered with no endpoint to call",
      house: "Arbor-owned, served by our own model lane",
      unprobed: "Not yet probed",
    };
    for (const [k, v] of Object.entries(s.buckets)) {
      lines.push(`| ${k} | ${v} | ${meaning[k] ?? ""} |`);
    }
    lines.push("");
    lines.push(
      `**${s.cooperated_2plus_rounds} agents spoke in two or more rounds**, reading the shared ` +
        "board between turns.",
    );
    lines.push("");
    lines.push(
      "Within `live_no_delivery`: " +
        `${s.live_no_delivery_detail.mutating_tools_only_not_called} expose only account-mutating ` +
        `tools and were deliberately not called; ${s.live_no_delivery_detail.call_failed_or_empty} ` +
        "failed at call time or returned nothing usable after three retry strategies " +
        "(short queries, schema enum/default values, and error-guided retry using the server's " +
        "own rejection text).",
    );
    lines.push("");
  }

  lines.push("## Headline");
  lines.push("");
  lines.push("| Outcome | Agents | What it means |");
  lines.push("|---|---:|---|");
  lines.push(
    `| Live, callable free | ${count("live_open")} | Server answered and listed real tools with no credential |`,
  );
  lines.push(
    `| Live with a key we hold | ${count("live_keyed")} | Answered using a credential already in the deployment |`,
  );
  lines.push(
    `| **Needs money or an account** | **${count("paywalled")}** | Server is alive but refuses without credentials we do not have |`,
  );
  lines.push(
    `| Dead endpoint | ${count("dead")} | Nothing answers: DNS failure, timeout, 404, or 5xx |`,
  );
  lines.push(
    `| No transport in the row | ${count("no_transport")} | Catalog entry with no endpoint to call at all |`,
  );
  lines.push("");
  lines.push(
    `Of the ${live.length} live agents, ${live.length - mutatingOnly.length} expose at least one ` +
      `read-only tool that is safe to call blind. The other ${mutatingOnly.length} expose ` +
      "only account-mutating tools (create/delete/send/deploy), so their liveness and " +
      "abilities are proven but calling them would change real state in someone's account.",
  );
  lines.push("");
  // Two populations with different evidentiary strength. Conflating them
  // would overstate the result: a declared-only agent never ran a tool.
  const declaredOnly = spoke.filter((p) => p.tool_used?.startsWith("(declared"));
  const delivered = spoke.filter((p) => !p.tool_used?.startsWith("(declared"));

  lines.push("## Proven in the hive");
  lines.push("");
  lines.push(
    `- **${spoke.length} agents posted a non-error message to a real hive board** ` +
      "(signed, HMAC-verified, stored in `scratchpad_entries`).",
  );
  lines.push(
    `- **${delivered.length} of those cleared all three bars**: they responded without an " +
      "error, stated their ability, and returned real output from their own server's tools.`,
  );
  lines.push(
    `- **${cooperated.length} spoke in two or more rounds**, reading the shared board ` +
      "between turns — that is the cooperation bar.",
  );
  lines.push(
    `- **${declaredOnly.length} cleared two of the three bars**: they answered \`tools/list\` ` +
      "with real tool names (a non-error response, and their ability statement), but every " +
      "tool they expose mutates real account state — creating, sending, deploying, or " +
      "charging something. Those were seated with a capability declaration and **no tool " +
      "was invoked**. Delivery for this group needs an operator's explicit go-ahead, and " +
      "each board entry says so.",
  );
  lines.push("");
  const isProse = (t?: string) => {
    const s = (t ?? "").trim();
    if (!s || s.startsWith("{") || s.startsWith("[")) return false;
    const sentences = (s.match(/[.!?]/g) ?? []).length;
    const machine = (s.match(/[{}":]/g) ?? []).length;
    return sentences >= 1 && machine < s.length * 0.06;
  };
  const readable = spoke.filter((p) => isProse(p.ability_statement));
  lines.push(
    `- **${readable.length} stated their abilities in readable prose.** Most MCP servers return ` +
      "raw JSON, which is real delivery but not a statement a teammate can act on, so those " +
      "responses are narrated into first-person sentences by Arbor's model — grounded strictly " +
      "in the tool names that server declared and the output it actually returned, and labeled " +
      "as narrated on every board entry.",
  );
  lines.push("");

  if (spoke.length > 0) {
    lines.push("### Sample of what they said, in their own words");
    lines.push("");
    for (const p of spoke.slice(0, 20)) {
      lines.push(
        `**${p.agent_id}** (${p.sponsor}) via tool \`${p.tool_used ?? "?"}\`  `,
      );
      lines.push(`> ${(p.ability_statement ?? "").slice(0, 260)}`);
      lines.push("");
    }
  }

  // Failures observed at CALL time, after a server happily listed its tools.
  // These are a distinct population from the census "paywalled" bucket: the
  // catalog looks free, the work is not.
  const failed = proofs.filter((p) => p.messages === 0 && p.failure);
  const callBuckets = new Map<string, number>();
  for (const f of failed) {
    const m = f.failure ?? "";
    const key = /401|Unauthorized|API token|api key/i.test(m)
      ? "Credential demanded at call time (listing was free)"
      : /error result|Invalid|not supported|Available:/i.test(m)
        ? "Needs a domain-specific argument we cannot guess"
        : /no text content|empty/i.test(m)
          ? "Answered, but returned no text"
          : /timeout|aborted|body read/i.test(m)
            ? "Timed out"
            : "Other call-time error";
    callBuckets.set(key, (callBuckets.get(key) ?? 0) + 1);
  }
  if (failed.length > 0) {
    lines.push("## Reachable, but did not deliver");
    lines.push("");
    lines.push(
      `${failed.length} agents listed their tools successfully but produced no usable ` +
        "output when called. The split matters, because only the first row is a money problem:",
    );
    lines.push("");
    lines.push("| Reason | Agents |");
    lines.push("|---|---:|");
    for (const [reason, n] of [...callBuckets.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${esc(reason)} | ${n} |`);
    }
    lines.push("");
  }

  lines.push("## Agents that require money or an account");
  lines.push("");
  lines.push(
    "These servers are alive and answering — they simply refuse anonymous callers. " +
      "**I did not create accounts for any of them**: signing up for third-party " +
      "services and setting passwords is an action I leave to a human, even when " +
      "authorized. Each becomes callable the moment its key exists in `.env.local`.",
  );
  lines.push("");
  lines.push("| Vendor / host | Blocked agents | Status |");
  lines.push("|---|---:|---|");
  for (const [sponsor, rows] of topPaywalled) {
    const statuses = [...new Set(rows.map((r) => r.http_status))].join(", ");
    lines.push(`| ${esc(sponsor.slice(0, 48))} | ${rows.length} | ${statuses} |`);
  }
  if (paywalledBySponsor.size > topPaywalled.length) {
    lines.push(
      `| _(+${paywalledBySponsor.size - topPaywalled.length} more vendors)_ | | |`,
    );
  }
  lines.push("");
  lines.push(
    "HTTP 402 (literal Payment Required) was returned by " +
      `${paywalled.filter((r) => r.http_status === 402).length} agents; the rest return 401/403 ` +
      "(account or API key required).",
  );
  lines.push("");

  lines.push("## Dead endpoints");
  lines.push("");
  lines.push("| Failure | Agents |");
  lines.push("|---|---:|");
  for (const [reason, n] of [...deadReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    lines.push(`| ${esc(reason)} | ${n} |`);
  }
  lines.push("");
  lines.push(
    "These are registry rows pointing at servers that no longer exist. They are " +
      "not fixable with credentials — they need removal or re-discovery.",
  );
  lines.push("");

  lines.push("## The ceiling, stated plainly");
  lines.push("");
  lines.push(
    `A goal of "all ${census.length} agents deliver real output" is not reachable from here. ` +
      `${count("dead")} endpoints are gone, and ${count("paywalled")} require accounts I will not ` +
      "create on your behalf. The reachable universe is " +
      `${live.length} agents, and that is the population this run works against.`,
  );
  lines.push("");
  lines.push("Files: `autoresearch/data/roster-census.json`, `autoresearch/data/hive-mass-proof.json`.");
  lines.push("");

  mkdirSync(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, "agent-roster-investigation.md");
  writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(out);
  console.log(
    `live ${live.length} | spoke ${spoke.length} | cooperated ${cooperated.length} | paywalled ${count("paywalled")} | dead ${count("dead")}`,
  );
}

main();
