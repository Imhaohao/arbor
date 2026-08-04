// Generate an HTML report for a connector roundtable session.
//
// Usage: npx tsx scripts/hive-roundtable-report.ts [--dag <dag_id>] [--out <path>]
// Defaults to the session in autoresearch/data/connector-session.json and
// writes autoresearch/to_human/roundtable-<dag>.html.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  countAgentMessages,
  looksLikeErrorText,
  meetsBar,
  type BoardEntryLite,
} from "../lib/hive/connector-core";
import { CONNECTOR_ROSTER } from "../lib/hive/connector-roster";

const ROOT = resolve(__dirname, "..");

function loadEnvLocal(): void {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/\s+#.*$/, "").trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function main(): Promise<void> {
  loadEnvLocal();
  const sessionPath = resolve(ROOT, "autoresearch/data/connector-session.json");
  const session = existsSync(sessionPath)
    ? (JSON.parse(readFileSync(sessionPath, "utf8")) as {
        dag_id: string;
        goal: string;
        agent_ids: string[];
      })
    : null;
  const dagId = flag("dag") ?? session?.dag_id;
  if (!dagId) throw new Error("no --dag and no recorded session");

  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
  const rows = (await client.query(api.scratchpad.forDag, {
    dag_id: dagId as never,
  })) as Array<{
    agent_id: string;
    kind: string;
    content: string;
    node_id?: string;
    created_at: number;
  }>;
  const entries: BoardEntryLite[] = rows
    .map((r) => ({
      agent_id: r.agent_id,
      kind: r.kind,
      content: r.content,
      created_at: r.created_at,
    }))
    .sort((a, b) => a.created_at - b.created_at);
  const agentIds = session?.agent_ids ?? [
    ...new Set(entries.map((e) => e.agent_id)),
  ];
  const counts = countAgentMessages(entries, agentIds);
  const bar = meetsBar(counts, 5, 2);
  const rosterById = new Map(CONNECTOR_ROSTER.map((r) => [r.agent_id, r]));

  const phases: Array<{ label: string; match: (n?: string) => boolean }> = [
    { label: "Round 1 — proposals", match: (n) => Boolean(n?.startsWith("propose:")) },
    { label: "Round 2 — negotiation", match: (n) => Boolean(n?.startsWith("negotiate:")) },
    { label: "Round 3 — decisions", match: (n) => Boolean(n?.startsWith("decide:")) },
  ];
  const rowByCreated = new Map(rows.map((r) => [r.created_at, r]));

  const transcriptHtml = phases
    .map((phase) => {
      const inPhase = entries.filter((e) =>
        phase.match(rowByCreated.get(e.created_at)?.node_id),
      );
      if (inPhase.length === 0) return "";
      const items = inPhase
        .map((e) => {
          const roster = rosterById.get(e.agent_id);
          const err = looksLikeErrorText(e.content)
            ? ' <span class="err">error-text (excluded from counts)</span>'
            : "";
          const yc = roster?.yc_batch
            ? ` <span class="yc">YC ${roster.yc_batch}</span>`
            : "";
          return `<div class="msg"><div class="who">${esc(
            roster?.display_name ?? e.agent_id,
          )} <span class="aid">${esc(e.agent_id)}</span>${yc} <span class="kind">${esc(
            e.kind,
          )}</span>${err}</div><pre>${esc(e.content)}</pre></div>`;
        })
        .join("\n");
      return `<h2>${esc(phase.label)}</h2>\n${items}`;
    })
    .join("\n");

  const countsHtml = counts
    .map((c) => {
      const roster = rosterById.get(c.agent_id);
      const ok = c.messages >= 2 ? "pass" : "fail";
      return `<tr><td>${esc(roster?.display_name ?? c.agent_id)}</td><td>${esc(
        c.agent_id,
      )}</td><td>${esc(roster?.sponsor ?? "")}</td><td>${esc(
        roster?.yc_batch ?? "-",
      )}</td><td>${esc(roster?.provenance_label ?? "")}</td><td class="${ok}">${
        c.messages
      }</td><td>${c.error_messages}</td></tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Hive roundtable ${esc(dagId)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#111827;line-height:1.5}
h1{font-size:1.4rem} h2{font-size:1.1rem;margin-top:2rem;border-bottom:1px solid #e5e7eb;padding-bottom:.3rem}
.goal{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:1rem 0}
table{border-collapse:collapse;width:100%;font-size:.85rem} td,th{border:1px solid #e5e7eb;padding:.4rem .6rem;text-align:left}
.pass{background:#ecfdf5;font-weight:600} .fail{background:#fef2f2;font-weight:600}
.msg{margin:.8rem 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.who{background:#f3f4f6;padding:.4rem .7rem;font-weight:600;font-size:.85rem}
.aid{color:#6b7280;font-weight:400;font-family:ui-monospace,monospace;font-size:.75rem}
.kind{float:right;color:#374151;font-weight:400;text-transform:uppercase;font-size:.7rem;letter-spacing:.05em}
.yc{background:#eef2ff;color:#3730a3;border-radius:4px;padding:0 .35rem;font-size:.7rem;font-weight:600}
.err{color:#b91c1c;font-size:.75rem}
pre{white-space:pre-wrap;margin:0;padding:.7rem;font-size:.8rem;font-family:ui-monospace,monospace;background:#fff}
.verdict{font-size:1rem;font-weight:700;padding:.6rem 1rem;border-radius:8px;display:inline-block;margin:.5rem 0}
.verdict.ok{background:#ecfdf5;color:#065f46} .verdict.no{background:#fef2f2;color:#991b1b}
.meta{color:#6b7280;font-size:.8rem}
</style></head><body>
<h1>Arbor hive roundtable — external agents discussing, cooperating, negotiating</h1>
<p class="meta">DAG <code>${esc(dagId)}</code> · generated ${new Date().toISOString()} · every message below was produced by the named external backend and written through the HMAC-signed public blackboard API. Backend failures are never posted; error-shaped texts are flagged and excluded from counts.</p>
${session ? `<div class="goal"><strong>Objective:</strong> ${esc(session.goal)}</div>` : ""}
<div class="verdict ${bar ? "ok" : "no"}">${
    bar
      ? "BAR MET: at least 5 agents with at least 2 non-error hive messages each"
      : "Bar not met"
  }</div>
<h2>Participants and message counts</h2>
<table><tr><th>Agent</th><th>agent_id</th><th>Backed by</th><th>YC</th><th>Provenance</th><th>Non-error msgs</th><th>Error-text</th></tr>
${countsHtml}</table>
${transcriptHtml}
<h2>Where to see it live</h2>
<p>Replay canvas: <code>/replay/${esc(dagId)}</code> on the local app. The network view draws phase handoff edges from the agents' own entries.</p>
</body></html>`;

  const outDir = resolve(ROOT, "autoresearch/to_human");
  mkdirSync(outDir, { recursive: true });
  const out = flag("out") ?? resolve(outDir, `roundtable-${dagId}.html`);
  writeFileSync(out, html);
  console.log(out);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
