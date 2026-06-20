import { decode, encode } from "@toon-format/toon";

/** Arbor's agent-facing structured-data formats. */
export type AgentFormat = "toon" | "json";

/** Provisional media type defined by the TOON specification. */
export const TOON_MEDIA_TYPE = "text/toon";
export const TOON_FILE_EXTENSION = ".toon";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJsonValue(value: unknown): unknown {
  const json = JSON.stringify(value);
  return json === undefined ? null : JSON.parse(json);
}

/** Encode through the official TOON implementation with Arbor's stable layout. */
export function encodeToon(value: unknown): string {
  return encode(normalizeJsonValue(value), {
    indent: 2,
    delimiter: ",",
    keyFolding: "off",
  });
}

/** Decode a UTF-8 `.toon` document into the JSON data model. */
export function decodeToon(input: string): unknown {
  return decode(input);
}

/** Cheap, model-agnostic token estimate used only for rollout telemetry. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ToonStats {
  json_chars: number;
  toon_chars: number;
  json_tokens_est: number;
  toon_tokens_est: number;
  /** Positive means TOON is smaller. */
  saved_pct: number;
}

export function toonStats(value: unknown): ToonStats {
  const json = JSON.stringify(normalizeJsonValue(value), null, 2);
  const toon = encodeToon(value);
  const jsonTokens = estimateTokens(json);
  const toonTokens = estimateTokens(toon);
  return {
    json_chars: json.length,
    toon_chars: toon.length,
    json_tokens_est: jsonTokens,
    toon_tokens_est: toonTokens,
    saved_pct:
      jsonTokens === 0
        ? 0
        : Math.round(((jsonTokens - toonTokens) / jsonTokens) * 100),
  };
}

function envFlag(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

/**
 * Default off. The kill switch wins, then a per-call override, then the global
 * rollout flag.
 */
export function toonEnabled(override?: AgentFormat | string): boolean {
  if (envFlag("ARBOR_TOON_DISABLED")) return false;
  if (override === "toon") return true;
  if (override === "json") return false;
  return envFlag("ARBOR_TOON_ENABLED");
}

export const TOON_PRIMER =
  "Some structured data is in TOON, a compact JSON-equivalent: 2-space indentation marks nesting; `key[N]: a,b,c` is an N-item list; `key[N]{f1,f2}:` followed by N indented comma-separated rows is a table of objects with fields f1,f2. Read it as the equivalent JSON.";

export interface SerializedAgentData {
  text: string;
  format: AgentFormat;
  media_type: "application/json" | typeof TOON_MEDIA_TYPE;
  file_extension: ".json" | typeof TOON_FILE_EXTENSION;
  saved_pct: number;
}

/** Serialize data for an agent or LLM boundary. Bare scalars remain JSON. */
export function serializeAgentData(
  value: unknown,
  opts: { override?: AgentFormat | string } = {},
): SerializedAgentData {
  const useToon =
    toonEnabled(opts.override) && (Array.isArray(value) || isPlainObject(value));
  if (!useToon) {
    return {
      text: JSON.stringify(normalizeJsonValue(value), null, 2),
      format: "json",
      media_type: "application/json",
      file_extension: ".json",
      saved_pct: 0,
    };
  }
  const stats = toonStats(value);
  return {
    text: encodeToon(value),
    format: "toon",
    media_type: TOON_MEDIA_TYPE,
    file_extension: TOON_FILE_EXTENSION,
    saved_pct: stats.saved_pct,
  };
}

/** Decode an agent payload. If undeclared, JSON is attempted before TOON. */
export function parseAgentData(text: string, format?: AgentFormat): unknown {
  if (format === "json") return JSON.parse(text);
  if (format === "toon") return decodeToon(text);
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to TOON.
    }
  }
  return decodeToon(text);
}

export interface StructuredBlock {
  text: string;
  format: AgentFormat;
  saved_pct: number;
}

/** Render a self-describing fenced block for an LLM prompt. */
export function formatStructuredBlock(
  label: string,
  value: unknown,
  opts: { override?: AgentFormat | string } = {},
): StructuredBlock {
  const serialized = serializeAgentData(value, opts);
  if (serialized.format === "toon") {
    const heading =
      `${label} - TOON format (compact JSON; 2-space indent = nesting, ` +
      "`key[N]: a,b,c` = list, `key[N]{f1,f2}:` + rows = table of objects):";
    return {
      text: `${heading}\n\`\`\`toon\n${serialized.text}\n\`\`\``,
      format: "toon",
      saved_pct: serialized.saved_pct,
    };
  }
  return {
    text: `${label}:\n\`\`\`json\n${serialized.text}\n\`\`\``,
    format: "json",
    saved_pct: 0,
  };
}
