import {
  normalizeBlackboardNamespace,
  type BlackboardKind,
} from "./blackboard-core";

export const AGENT_BLACKBOARD_DEFAULT_READ_LIMIT = 25;
export const AGENT_BLACKBOARD_MAX_READ_LIMIT = 50;
export const AGENT_BLACKBOARD_MAX_RAW_BODY_CHARS = 12_000;
export const AGENT_BLACKBOARD_MAX_TEXT_CHARS = 4_000;
export const AGENT_BLACKBOARD_MAX_LABEL_CHARS = 240;
export const AGENT_BLACKBOARD_MAX_ARTIFACT_ID_CHARS = 256;

const TEXT_KINDS = ["observation", "result", "question", "proposal"] as const;
const TEXT_KIND_SET = new Set<string>(TEXT_KINDS);
const ARTIFACT_REFERENCE_CONTENT_TYPE =
  "application/vnd.arbor.artifact-reference+json";
const MIME_TYPE_RE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
const ARTIFACT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

const SECRET_PATTERNS = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i,
  /\b(?:sk|pk|rk)-(?:live|test|proj)-[A-Za-z0-9_-]{12,}\b/i,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)\b\s*[:=]\s*["']?[^\s"']{8,}/i,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/i,
  /[?&](?:api[_-]?key|access[_-]?token|token|key|signature|sig)=[^&#\s]{8,}/i,
] as const;

export type AgentBlackboardTextKind = (typeof TEXT_KINDS)[number];

export interface AgentBlackboardReadRequest {
  dag_id: string;
  node_id: string;
  namespace?: string;
  limit: number;
}

export interface AgentBlackboardTextAppendRequest {
  dag_id: string;
  node_id: string;
  entry: {
    type: "text";
    kind: AgentBlackboardTextKind;
    text: string;
    namespace: string;
    confidence: number;
  };
}

export interface AgentBlackboardArtifactAppendRequest {
  dag_id: string;
  node_id: string;
  entry: {
    type: "artifact_reference";
    artifact_id: string;
    media_type: string;
    label?: string;
    namespace: string;
    confidence: number;
  };
}

export type AgentBlackboardAppendRequest =
  | AgentBlackboardTextAppendRequest
  | AgentBlackboardArtifactAppendRequest;

export interface AgentBlackboardArtifactReference {
  type: "artifact_reference";
  version: 1;
  artifact_id: string;
  media_type: string;
  label?: string;
}

export interface AgentBlackboardStoredEntry {
  kind: BlackboardKind;
  namespace: string;
  artifact_id?: string;
  content: string;
  content_format: "text" | "json";
  content_type: string;
  confidence: number;
}

export type AgentBlackboardViewEntry = {
  entry_id: string;
  node_id?: string;
  agent_id: string;
  kind: BlackboardKind;
  namespace?: string;
  confidence: number;
  created_at: number;
  value:
    | { type: "text"; text: string }
    | AgentBlackboardArtifactReference;
};

interface ScratchpadLikeEntry {
  _id: unknown;
  node_id?: unknown;
  agent_id: unknown;
  kind: unknown;
  namespace?: unknown;
  content: unknown;
  content_type?: unknown;
  confidence: unknown;
  created_at: unknown;
}

interface HiveNodeLike {
  node_id: string;
  assigned_agent_id?: string;
}

function objectRow(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  row: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(row)
    .filter((key) => !allowedSet.has(key))
    .sort();
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}`);
  }
}

function requiredId(value: unknown, label: string, maxChars = 256): string {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxChars) {
    throw new Error(`${label} must be between 1 and ${maxChars} characters`);
  }
  return normalized;
}

function confidence(value: unknown): number {
  const normalized = value === undefined ? 1 : value;
  if (
    typeof normalized !== "number" ||
    !Number.isFinite(normalized) ||
    normalized < 0 ||
    normalized > 1
  ) {
    throw new Error("entry.confidence must be a finite number between 0 and 1");
  }
  return normalized;
}

export function containsCredentialLikeMaterial(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function safeBlackboardText(value: string): string {
  return containsCredentialLikeMaterial(value)
    ? "[redacted: credential-like content]"
    : value;
}

function assertSafeText(value: string, label: string): void {
  if (containsCredentialLikeMaterial(value)) {
    throw new Error(`${label} must not contain credentials or signed URLs`);
  }
}

function normalizedNamespace(
  value: unknown,
  defaultKind: BlackboardKind,
): string {
  if (value !== undefined && typeof value !== "string") {
    throw new Error("entry.namespace must be a string");
  }
  const namespace = normalizeBlackboardNamespace(value, defaultKind);
  if (namespace === "system" || namespace === "consensus") {
    throw new Error("system and consensus namespaces are not agent-writable");
  }
  return namespace;
}

export function parseAgentBlackboardReadRequest(
  value: unknown,
): AgentBlackboardReadRequest {
  const row = objectRow(value, "blackboard read request");
  assertOnlyKeys(
    row,
    ["dag_id", "node_id", "namespace", "limit"],
    "blackboard read request",
  );
  const limit = row.limit ?? AGENT_BLACKBOARD_DEFAULT_READ_LIMIT;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > AGENT_BLACKBOARD_MAX_READ_LIMIT
  ) {
    throw new Error(
      `limit must be an integer between 1 and ${AGENT_BLACKBOARD_MAX_READ_LIMIT}`,
    );
  }
  let namespace: string | undefined;
  if (row.namespace !== undefined) {
    if (typeof row.namespace !== "string") {
      throw new Error("namespace must be a string");
    }
    namespace = normalizeBlackboardNamespace(row.namespace, "observation");
    if (namespace === "system") {
      throw new Error("the system namespace is not agent-readable");
    }
  }
  return {
    dag_id: requiredId(row.dag_id, "dag_id"),
    node_id: requiredId(row.node_id, "node_id", 128),
    ...(namespace ? { namespace } : {}),
    limit,
  };
}

export function parseAgentBlackboardAppendRequest(
  value: unknown,
): AgentBlackboardAppendRequest {
  const row = objectRow(value, "blackboard append request");
  assertOnlyKeys(row, ["dag_id", "node_id", "entry"], "blackboard append request");
  const dag_id = requiredId(row.dag_id, "dag_id");
  const node_id = requiredId(row.node_id, "node_id", 128);
  const entry = objectRow(row.entry, "entry");

  if (entry.type === "text") {
    assertOnlyKeys(
      entry,
      ["type", "kind", "text", "namespace", "confidence"],
      "text entry",
    );
    if (typeof entry.kind !== "string" || !TEXT_KIND_SET.has(entry.kind)) {
      throw new Error(`entry.kind must be one of: ${TEXT_KINDS.join(", ")}`);
    }
    if (typeof entry.text !== "string") throw new Error("entry.text is required");
    const text = entry.text.trim();
    if (!text || text.length > AGENT_BLACKBOARD_MAX_TEXT_CHARS) {
      throw new Error(
        `entry.text must be between 1 and ${AGENT_BLACKBOARD_MAX_TEXT_CHARS} characters`,
      );
    }
    assertSafeText(text, "entry.text");
    const kind = entry.kind as AgentBlackboardTextKind;
    return {
      dag_id,
      node_id,
      entry: {
        type: "text",
        kind,
        text,
        namespace: normalizedNamespace(entry.namespace, kind),
        confidence: confidence(entry.confidence),
      },
    };
  }

  if (entry.type === "artifact_reference") {
    assertOnlyKeys(
      entry,
      ["type", "artifact_id", "media_type", "label", "namespace", "confidence"],
      "artifact reference entry",
    );
    const artifact_id = requiredId(
      entry.artifact_id,
      "entry.artifact_id",
      AGENT_BLACKBOARD_MAX_ARTIFACT_ID_CHARS,
    );
    if (!ARTIFACT_ID_RE.test(artifact_id)) {
      throw new Error("entry.artifact_id must be an opaque artifact id, not a URL");
    }
    if (typeof entry.media_type !== "string" || !MIME_TYPE_RE.test(entry.media_type)) {
      throw new Error("entry.media_type must be a MIME type without parameters");
    }
    let label: string | undefined;
    if (entry.label !== undefined) {
      if (typeof entry.label !== "string") throw new Error("entry.label must be a string");
      label = entry.label.trim();
      if (!label || label.length > AGENT_BLACKBOARD_MAX_LABEL_CHARS) {
        throw new Error(
          `entry.label must be between 1 and ${AGENT_BLACKBOARD_MAX_LABEL_CHARS} characters`,
        );
      }
      assertSafeText(label, "entry.label");
    }
    return {
      dag_id,
      node_id,
      entry: {
        type: "artifact_reference",
        artifact_id,
        media_type: entry.media_type.toLowerCase(),
        label,
        namespace: normalizedNamespace(entry.namespace, "artifact"),
        confidence: confidence(entry.confidence),
      },
    };
  }

  throw new Error("entry.type must be text or artifact_reference");
}

export function toAgentBlackboardStoredEntry(
  request: AgentBlackboardAppendRequest,
): AgentBlackboardStoredEntry {
  if (request.entry.type === "text") {
    return {
      kind: request.entry.kind,
      namespace: request.entry.namespace,
      content: request.entry.text,
      content_format: "text",
      content_type: "text/plain",
      confidence: request.entry.confidence,
    };
  }
  const reference: AgentBlackboardArtifactReference = {
    type: "artifact_reference",
    version: 1,
    artifact_id: request.entry.artifact_id,
    media_type: request.entry.media_type,
    ...(request.entry.label ? { label: request.entry.label } : {}),
  };
  return {
    kind: "artifact",
    namespace: request.entry.namespace,
    artifact_id: request.entry.artifact_id,
    content: JSON.stringify(reference),
    content_format: "json",
    content_type: ARTIFACT_REFERENCE_CONTENT_TYPE,
    confidence: request.entry.confidence,
  };
}

export function isAssignedDagCollaborator(args: {
  agentId: string;
  nodeId: string;
  nodes: HiveNodeLike[];
}): boolean {
  return args.nodes.some(
    (node) =>
      node.node_id === args.nodeId && node.assigned_agent_id === args.agentId,
  );
}

function parseArtifactReference(content: string): AgentBlackboardArtifactReference | null {
  try {
    const row = objectRow(JSON.parse(content), "artifact reference");
    assertOnlyKeys(
      row,
      ["type", "version", "artifact_id", "media_type", "label"],
      "artifact reference",
    );
    if (row.type !== "artifact_reference" || row.version !== 1) return null;
    const artifact_id = requiredId(
      row.artifact_id,
      "artifact_id",
      AGENT_BLACKBOARD_MAX_ARTIFACT_ID_CHARS,
    );
    if (!ARTIFACT_ID_RE.test(artifact_id)) return null;
    if (typeof row.media_type !== "string" || !MIME_TYPE_RE.test(row.media_type)) {
      return null;
    }
    if (
      row.label !== undefined &&
      (typeof row.label !== "string" ||
        !row.label.trim() ||
        row.label.length > AGENT_BLACKBOARD_MAX_LABEL_CHARS ||
        containsCredentialLikeMaterial(row.label))
    ) {
      return null;
    }
    return {
      type: "artifact_reference",
      version: 1,
      artifact_id,
      media_type: row.media_type.toLowerCase(),
      ...(typeof row.label === "string" ? { label: row.label.trim() } : {}),
    };
  } catch {
    return null;
  }
}

export function selectAgentBlackboardEntries(args: {
  rows: ScratchpadLikeEntry[];
  namespace?: string;
  limit: number;
}): AgentBlackboardViewEntry[] {
  const selected: AgentBlackboardViewEntry[] = [];
  for (const row of args.rows) {
    if (selected.length >= args.limit) break;
    if (row.namespace === "system") continue;
    if (args.namespace && row.namespace !== args.namespace) continue;
    if (
      typeof row.agent_id !== "string" ||
      typeof row.kind !== "string" ||
      typeof row.content !== "string" ||
      typeof row.confidence !== "number" ||
      !Number.isFinite(row.confidence) ||
      typeof row.created_at !== "number" ||
      !Number.isFinite(row.created_at)
    ) {
      continue;
    }
    if (
      ![
        "observation",
        "result",
        "decision",
        "question",
        "proposal",
        "critique",
        "artifact",
        "consensus",
      ].includes(row.kind)
    ) {
      continue;
    }
    const artifact =
      row.content_type === ARTIFACT_REFERENCE_CONTENT_TYPE
        ? parseArtifactReference(row.content)
        : null;
    selected.push({
      entry_id: String(row._id),
      ...(typeof row.node_id === "string" ? { node_id: row.node_id } : {}),
      agent_id: row.agent_id,
      kind: row.kind as BlackboardKind,
      ...(typeof row.namespace === "string" ? { namespace: row.namespace } : {}),
      confidence: Math.max(0, Math.min(1, row.confidence)),
      created_at: row.created_at,
      value: artifact ?? {
        type: "text",
        text: safeBlackboardText(row.content).slice(0, AGENT_BLACKBOARD_MAX_TEXT_CHARS),
      },
    });
  }
  return selected;
}
