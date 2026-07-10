import { parseAgentData, serializeAgentData, type AgentFormat } from "../toon";

export const BLACKBOARD_KINDS = [
  "observation",
  "result",
  "decision",
  "question",
  "proposal",
  "critique",
  "artifact",
  "consensus",
] as const;

export type BlackboardKind = (typeof BLACKBOARD_KINDS)[number];
export type BlackboardWriterRole = "worker" | "reviewer" | "control";
export type BlackboardContentFormat = "text" | AgentFormat;

const NAMESPACE_RE = /^[a-z0-9][a-z0-9/_-]{0,63}$/;
const CONTROL_NAMESPACES = new Set(["consensus", "system"]);

const DEFAULT_NAMESPACES: Record<BlackboardKind, string> = {
  observation: "research",
  result: "artifacts",
  decision: "decisions",
  question: "questions",
  proposal: "proposals",
  critique: "review",
  artifact: "artifacts",
  consensus: "consensus",
};

export interface BlackboardWritePayload {
  dag_id: string;
  node_id?: string;
  task_id?: string;
  namespace?: string;
  kind: BlackboardKind;
  content?: string;
  data?: unknown;
  confidence: number;
  supersedes_entry_id?: string;
  revision?: number;
  format?: BlackboardContentFormat;
  // DELM admit-on-verify (optional): entry ids the writer claims as
  // supporting evidence for this write. Only consulted when
  // ARBOR_BLACKBOARD_VERIFY_ENABLED is on.
  supporting_entry_ids?: string[];
}

export function isBlackboardKind(value: unknown): value is BlackboardKind {
  return (
    typeof value === "string" &&
    (BLACKBOARD_KINDS as readonly string[]).includes(value)
  );
}

export function normalizeBlackboardNamespace(
  namespace: string | undefined,
  kind: BlackboardKind,
): string {
  const normalized = (namespace ?? DEFAULT_NAMESPACES[kind])
    .trim()
    .toLowerCase();
  if (!NAMESPACE_RE.test(normalized) || normalized.includes("//")) {
    throw new Error(
      "namespace must be a lowercase path of letters, numbers, '/', '_' or '-' (max 64 chars)",
    );
  }
  return normalized;
}

export function assertBlackboardWriteAllowed(args: {
  role: BlackboardWriterRole;
  kind: BlackboardKind;
  namespace: string;
}): void {
  if (args.role === "control") return;
  if (args.kind === "consensus" || CONTROL_NAMESPACES.has(args.namespace)) {
    throw new Error("consensus and system namespaces are control-shell only");
  }
  if (args.kind === "critique" && args.role !== "reviewer") {
    throw new Error("critique entries require a reviewer agent");
  }
}

export function didForAgent(agentId: string): string {
  const normalized = agentId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(normalized)) {
    throw new Error("agent_id cannot be represented as an Arbor DID");
  }
  return `did:web:arbor.local:agents:${encodeURIComponent(normalized)}`;
}

export function validateBlackboardPayload(
  value: unknown,
): BlackboardWritePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("blackboard payload must be an object");
  }
  const row = value as Record<string, unknown>;
  if (typeof row.dag_id !== "string" || !row.dag_id.trim()) {
    throw new Error("dag_id is required");
  }
  if (!isBlackboardKind(row.kind)) {
    throw new Error(`kind must be one of: ${BLACKBOARD_KINDS.join(", ")}`);
  }
  if (
    typeof row.confidence !== "number" ||
    !Number.isFinite(row.confidence) ||
    row.confidence < 0 ||
    row.confidence > 1
  ) {
    throw new Error("confidence must be a finite number between 0 and 1");
  }
  const content = typeof row.content === "string" ? row.content : undefined;
  if (!content?.trim() && row.data === undefined) {
    throw new Error("content or data is required");
  }
  const format = row.format;
  if (
    format !== undefined &&
    format !== "text" &&
    format !== "json" &&
    format !== "toon"
  ) {
    throw new Error("format must be text, json, or toon");
  }
  const revision =
    typeof row.revision === "number" && Number.isInteger(row.revision)
      ? row.revision
      : undefined;
  if (revision !== undefined && revision < 0) {
    throw new Error("revision must be a non-negative integer");
  }
  let supporting_entry_ids: string[] | undefined;
  if (row.supporting_entry_ids !== undefined) {
    if (
      !Array.isArray(row.supporting_entry_ids) ||
      !row.supporting_entry_ids.every((id) => typeof id === "string")
    ) {
      throw new Error("supporting_entry_ids must be an array of strings");
    }
    supporting_entry_ids = row.supporting_entry_ids
      .map((id) => (id as string).trim())
      .filter((id) => id.length > 0);
  }
  return {
    dag_id: row.dag_id.trim(),
    node_id: typeof row.node_id === "string" ? row.node_id.trim() : undefined,
    task_id: typeof row.task_id === "string" ? row.task_id.trim() : undefined,
    namespace:
      typeof row.namespace === "string" ? row.namespace.trim() : undefined,
    kind: row.kind,
    content,
    data: row.data,
    confidence: row.confidence,
    supersedes_entry_id:
      typeof row.supersedes_entry_id === "string"
        ? row.supersedes_entry_id.trim()
        : undefined,
    revision,
    format,
    supporting_entry_ids,
  };
}

export function serializeBlackboardContent(args: {
  content?: string;
  data?: unknown;
  format?: BlackboardContentFormat;
}): {
  content: string;
  content_format: BlackboardContentFormat;
  content_type: string;
} {
  if (args.data === undefined) {
    return {
      content: args.content ?? "",
      content_format: "text",
      content_type: "text/plain",
    };
  }
  const override = args.format === "text" ? "json" : args.format;
  const serialized = serializeAgentData(args.data, { override });
  return {
    content: serialized.text,
    content_format: serialized.format,
    content_type: serialized.media_type,
  };
}

export function parseBlackboardContent(entry: {
  content: string;
  content_format?: BlackboardContentFormat;
}): unknown {
  if (!entry.content_format || entry.content_format === "text") {
    return entry.content;
  }
  return parseAgentData(entry.content, entry.content_format);
}

// ── DELM (arXiv:2510.01285) curated-blackboard properties ──────────────────
// Both properties below are additive and default-safe: gist is always cheap
// to compute (no model call), and the verify gate is off unless the caller
// opts in via ARBOR_BLACKBOARD_VERIFY_ENABLED.

const DEFAULT_GIST_MAX_CHARS = 240;

/**
 * Deterministic, no-model-call summary of a blackboard entry's content.
 *
 * - Takes the first line (split on \n); falls back to the whole content if
 *   there is no newline.
 * - Collapses internal whitespace runs to a single space and trims ends.
 * - Truncates to `maxChars` (default 240), leaving room for an ellipsis
 *   marker ("...") when truncation actually occurs.
 * - Empty/whitespace-only content returns "".
 */
export function makeGist(
  content: string,
  maxChars: number = DEFAULT_GIST_MAX_CHARS,
): string {
  if (!content) return "";
  const firstLine = content.split("\n", 1)[0] ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  if (collapsed.length <= maxChars) return collapsed;
  const ellipsis = "...";
  const cut = Math.max(0, maxChars - ellipsis.length);
  return collapsed.slice(0, cut).trimEnd() + ellipsis;
}

/**
 * Admit-on-verify master switch (ARBOR_BLACKBOARD_VERIFY_ENABLED). Follows the
 * same truthy convention as lib/openai.ts's envFlag: 1/true/yes/on/enabled.
 * Default off preserves current writeSigned behavior byte-for-byte.
 */
export function blackboardVerifyEnabled(): boolean {
  const value = (process.env.ARBOR_BLACKBOARD_VERIFY_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

export type BlackboardVerification = "evidence_backed" | "unverified";

/**
 * Decide the curation label for a new entry given its declared supporting
 * entry ids and which of those ids were actually found (resolved) in the
 * same DAG. Labeling only — never a rejection: the entry is always stored,
 * this just decides how it is tagged.
 *
 * - If the verify gate is disabled, returns undefined (no label at all — the
 *   pre-DELM schema shape, so existing readers see no behavior change).
 * - If enabled and every declared supporting id resolved (and at least one
 *   was declared), returns "evidence_backed".
 * - Otherwise (none declared, or some failed to resolve), returns
 *   "unverified".
 */
export function resolveBlackboardVerification(args: {
  enabled: boolean;
  declaredSupportingIds?: string[];
  resolvedSupportingIds: string[];
}): BlackboardVerification | undefined {
  if (!args.enabled) return undefined;
  const declared = args.declaredSupportingIds ?? [];
  if (declared.length === 0) return "unverified";
  const resolvedSet = new Set(args.resolvedSupportingIds);
  const allResolved = declared.every((id) => resolvedSet.has(id));
  return allResolved ? "evidence_backed" : "unverified";
}
