#!/usr/bin/env node
/**
 * Build 1000 Arbor-addable candidate records from the research corpus.
 *
 * Input:
 *   agents-corpus.json    - capped, validated MCP registry candidates
 *   overflow-agents.json  - real registry candidates excluded only by niche cap
 *
 * Output:
 *   arbor-candidate-records.json - Convex discoveredSpecialists:upsert payloads
 *   arbor-candidate-records.csv  - scan-friendly mirror of the same records
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("..", import.meta.url).pathname;
const target = Number(process.argv[2] ?? process.env.ARBOR_CANDIDATE_TARGET ?? 1000);
const generatedAt = new Date().toISOString();

if (!Number.isInteger(target) || target < 1) {
  throw new Error(`target must be a positive integer, got ${target}`);
}

const corpus = readJson("agents-corpus.json");
const overflow = readJson("overflow-agents.json");
const sourceRows = [...corpus, ...overflow];

if (sourceRows.length < target) {
  throw new Error(`only ${sourceRows.length} source rows available for target ${target}`);
}

const selectedRows = sourceRows.slice(0, target);
const records = toImportRecords(selectedRows);
validateRecords(records, target);

const output = {
  generated: generatedAt,
  source: "agents-corpus.json + overflow-agents.json",
  total: records.length,
  target,
  corpus_rows_used: Math.min(corpus.length, target),
  overflow_rows_used: Math.max(0, target - corpus.length),
  warning:
    "Candidate records are addable via discoveredSpecialists:upsert but are not live-verified beyond registry evidence; load selectively or run smoke checks first.",
  records,
};

writeFileSync(
  `${dir}arbor-candidate-records.json`,
  `${JSON.stringify(output, null, 2)}\n`,
);
writeFileSync(`${dir}arbor-candidate-records.csv`, toCsv(records));

console.log(
  `built ${records.length} candidate records (${output.corpus_rows_used} corpus + ${output.overflow_rows_used} overflow)`,
);

function readJson(fileName) {
  return JSON.parse(readFileSync(`${dir}${fileName}`, "utf8"));
}

function toImportRecords(rows) {
  const seenAgentIds = new Set();
  return rows.map((row) => {
    const agent_id = uniqueAgentId(row, seenAgentIds);
    const displayName = clean(row.display_name || row.agent_id, 80) || agent_id;
    const sponsor = sponsorFor(row);
    const endpoint = validUrl(row.endpoint_or_docs_url, "endpoint_or_docs_url");
    const homepage = optionalUrl(row.homepage_url);
    const capabilities = capabilitiesFor(row);
    const oneLiner = clean(
      `MCP specialist for ${shortNiche(row.niche_label)}: ${capabilities.slice(0, 3).join(", ")}.`,
      180,
    );
    const authRequired = row.auth_required && row.auth_required !== "none";
    const systemPrompt = clean(
      [
        `You are ${displayName}, an external MCP specialist listed in the Model Context Protocol registry at ${endpoint}.`,
        `Use your advertised MCP tools to help with ${shortNiche(row.niche_label).toLowerCase()} tasks such as ${row.consumer_use_cases.join(", ")}.`,
        authRequired
          ? "If authentication or owner setup is required, say so before attempting execution."
          : "If live tool discovery fails, explain the failure and give the best non-destructive next step.",
        "Decline work outside your advertised capabilities.",
      ].join(" "),
      1500,
    );

    const record = {
      agent_id,
      display_name: displayName,
      sponsor,
      capabilities,
      system_prompt: systemPrompt,
      cost_baseline: costBaseline(row),
      starting_reputation: 0.5,
      one_liner: oneLiner,
      tier: "mcp-forwarding",
      discovered_for: "agent-corpus-candidate-import",
      discovery_source: "registry",
      mcp_endpoint: endpoint,
      homepage_url: homepage,
      rationale: clean(`${row.verification_evidence} ${row.notes ?? ""}`, 600),
    };

    if (authRequired) {
      record.mcp_api_key_env = `ARBOR_MCP_KEY_${agent_id.toUpperCase().replace(/-/g, "_")}`.slice(0, 80);
    }
    for (const key of Object.keys(record)) {
      if (record[key] === undefined) delete record[key];
    }
    return record;
  });
}

function uniqueAgentId(row, seen) {
  const hash = createHash("sha256")
    .update(`${row.agent_id}\n${row.endpoint_or_docs_url}`)
    .digest("hex")
    .slice(0, 7);
  const base = slugify(`mcp ${row.display_name || row.agent_id}`);
  let id = `${base.slice(0, 40 - hash.length - 1).replace(/-+$/g, "")}-${hash}`;
  if (id.length < 3) id = `mcp-agent-${hash}`;
  let n = 2;
  while (seen.has(id)) {
    const suffix = `${hash}-${n}`;
    id = `${base.slice(0, 40 - suffix.length - 1).replace(/-+$/g, "")}-${suffix}`;
    n += 1;
  }
  seen.add(id);
  return id;
}

function sponsorFor(row) {
  const endpointHost = hostLabel(row.endpoint_or_docs_url);
  const company = clean(row.company, 80);
  if (company && !["ai", "app", "com", "dev", "io", "org", "net"].includes(company.toLowerCase())) {
    return company;
  }
  return endpointHost || company || "MCP Registry";
}

function hostLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return "";
  }
}

function capabilitiesFor(row) {
  const values = [
    ...(Array.isArray(row.consumer_use_cases) ? row.consumer_use_cases : []),
    shortNiche(row.niche_label),
    "mcp tool forwarding",
  ]
    .map((value) => clean(value, 80))
    .filter(Boolean);
  return [...new Set(values)].slice(0, 8);
}

function shortNiche(label) {
  return String(label ?? "")
    .replace(/^[^-]+ - /, "")
    .trim();
}

function costBaseline(row) {
  const quality = Number(row.quality_score) || 3;
  if (quality >= 4) return 0.6;
  if (quality >= 3) return 0.75;
  return 0.9;
}

function validUrl(value, field) {
  const parsed = optionalUrl(value);
  if (!parsed) throw new Error(`bad ${field}: ${value}`);
  return parsed;
}

function optionalUrl(value) {
  if (!value) return undefined;
  try {
    const parsed = new URL(String(value));
    if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mcp-agent";
}

function clean(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validateRecords(rows, expected) {
  if (rows.length !== expected) {
    throw new Error(`expected ${expected} records, got ${rows.length}`);
  }
  const seenIds = new Set();
  const seenEndpoints = new Set();
  for (const [index, row] of rows.entries()) {
    for (const field of [
      "agent_id",
      "display_name",
      "sponsor",
      "capabilities",
      "system_prompt",
      "cost_baseline",
      "starting_reputation",
      "one_liner",
      "tier",
      "discovered_for",
      "discovery_source",
      "mcp_endpoint",
    ]) {
      if (row[field] === undefined || row[field] === null || row[field] === "") {
        throw new Error(`row ${index} missing ${field}`);
      }
    }
    if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(row.agent_id)) {
      throw new Error(`invalid agent_id ${row.agent_id}`);
    }
    if (seenIds.has(row.agent_id)) throw new Error(`duplicate agent_id ${row.agent_id}`);
    seenIds.add(row.agent_id);
    const endpoint = validUrl(row.mcp_endpoint, "mcp_endpoint");
    if (seenEndpoints.has(endpoint)) throw new Error(`duplicate endpoint ${endpoint}`);
    seenEndpoints.add(endpoint);
    if (!Array.isArray(row.capabilities) || row.capabilities.length < 1) {
      throw new Error(`row ${row.agent_id} has no capabilities`);
    }
    if (row.tier !== "mcp-forwarding") throw new Error(`bad tier ${row.tier}`);
    if (row.discovery_source !== "registry") {
      throw new Error(`bad discovery_source ${row.discovery_source}`);
    }
  }
}

function toCsv(rows) {
  const headers = [
    "agent_id",
    "display_name",
    "sponsor",
    "capabilities",
    "cost_baseline",
    "starting_reputation",
    "one_liner",
    "tier",
    "discovered_for",
    "discovery_source",
    "mcp_endpoint",
    "mcp_api_key_env",
    "homepage_url",
    "rationale",
  ];
  return `${headers.join(",")}\n${rows
    .map((row) =>
      headers
        .map((header) =>
          csvEscape(Array.isArray(row[header]) ? row[header].join("; ") : row[header] ?? ""),
        )
        .join(","),
    )
    .join("\n")}\n`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
