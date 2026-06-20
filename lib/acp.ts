import {
  serializeAgentData,
  toonEnabled,
  TOON_FILE_EXTENSION,
  TOON_MEDIA_TYPE,
  type AgentFormat,
} from "./toon";

export const ARBOR_ACP_VERSION = "1.0";
export const ARBOR_ACP_EXTENSION_URI = "https://arbor.dev/acp/v1";
export const ARBOR_BLACKBOARD_EXTENSION_URI =
  "https://arbor.dev/acp/extensions/blackboard/v1";

export type AcpTaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected";

export interface AcpMessagePart {
  kind?: "text" | "data" | "file";
  type?: string;
  text?: string;
  data?: unknown;
  content_type?: string;
  content?: unknown;
  content_url?: string;
  content_encoding?: "plain" | "base64";
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface AcpSlaRequest {
  max_budget?: number;
  deadline_at?: number;
  max_tokens?: number;
  capabilities?: string[];
  accepted_formats?: string[];
}

export interface AcpSla {
  max_budget?: number;
  deadline_at?: number;
  max_tokens?: number;
  capabilities: string[];
  output_format: AgentFormat;
  output_media_type: "application/json" | typeof TOON_MEDIA_TYPE;
}

export type AcpSlaDecision =
  | { accepted: true; sla: AcpSla }
  | { accepted: false; reason: string };

export function didWebForUrl(url: string, path = "agents/arbor-market"): string {
  const parsed = new URL(url);
  const authority = parsed.host.replace(/:/g, "%3A");
  const suffix = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join(":");
  return `did:web:${authority}${suffix ? `:${suffix}` : ""}`;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function negotiateSla(args: {
  request?: AcpSlaRequest;
  offeredCapabilities: string[];
  defaultBudget?: number;
  maxBudget?: number;
  now?: number;
}): AcpSlaDecision {
  const request = args.request ?? {};
  const now = args.now ?? Date.now();
  const budget = request.max_budget ?? args.defaultBudget;
  if (budget !== undefined && !finitePositive(budget)) {
    return { accepted: false, reason: "max_budget must be a positive finite number" };
  }
  if (budget !== undefined && args.maxBudget !== undefined && budget > args.maxBudget) {
    return {
      accepted: false,
      reason: `max_budget exceeds the service limit of ${args.maxBudget}`,
    };
  }
  if (
    request.deadline_at !== undefined &&
    (!finitePositive(request.deadline_at) || request.deadline_at <= now)
  ) {
    return { accepted: false, reason: "deadline_at must be in the future" };
  }
  if (
    request.max_tokens !== undefined &&
    (!Number.isInteger(request.max_tokens) || request.max_tokens <= 0)
  ) {
    return { accepted: false, reason: "max_tokens must be a positive integer" };
  }

  const requestedCapabilities = request.capabilities ?? [];
  const offered = new Set(args.offeredCapabilities);
  const missing = requestedCapabilities.filter((capability) => !offered.has(capability));
  if (missing.length > 0) {
    return {
      accepted: false,
      reason: `unsupported capabilities: ${missing.join(", ")}`,
    };
  }

  const acceptedFormats = request.accepted_formats ?? ["application/json"];
  const acceptsToon = acceptedFormats.some(
    (format) => format === TOON_MEDIA_TYPE || format === "toon" || format === ".toon",
  );
  const outputFormat: AgentFormat =
    acceptsToon && toonEnabled("toon") ? "toon" : "json";
  return {
    accepted: true,
    sla: {
      max_budget: budget,
      deadline_at: request.deadline_at,
      max_tokens: request.max_tokens,
      capabilities: requestedCapabilities,
      output_format: outputFormat,
      output_media_type:
        outputFormat === "toon" ? TOON_MEDIA_TYPE : "application/json",
    },
  };
}

export function textFromParts(parts: AcpMessagePart[] | undefined): string {
  return (parts ?? [])
    .map((part) => {
      if (typeof part.text === "string") return part.text;
      if (
        typeof part.content === "string" &&
        (part.content_type?.startsWith("text/") || part.type === "text")
      ) {
        return part.content;
      }
      return "";
    })
    .filter((text) => text.trim())
    .join("\n\n")
    .trim();
}

export function dataFromParts(
  parts: AcpMessagePart[] | undefined,
): Record<string, unknown> | undefined {
  for (const part of parts ?? []) {
    const candidate =
      part.data ??
      (part.content_type === "application/json" ? part.content : undefined);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }
  return undefined;
}

export function artifactDataPart(
  data: unknown,
  format: AgentFormat,
): AcpMessagePart {
  const serialized = serializeAgentData(data, { override: format });
  if (serialized.format === "json") {
    return {
      kind: "data",
      data,
      content_type: "application/json",
      metadata: { format: "json", media_type: "application/json" },
    };
  }
  return {
    kind: "data",
    data: {
      format: "toon",
      content_type: serialized.media_type,
      file_extension: TOON_FILE_EXTENSION,
      content: serialized.text,
    },
    content_type: serialized.media_type,
    metadata: {
      format: "toon",
      media_type: serialized.media_type,
      saved_pct_estimate: serialized.saved_pct,
    },
  };
}

const TERMINAL_STATES = new Set<AcpTaskState>([
  "completed",
  "failed",
  "canceled",
  "rejected",
]);

export function canTransitionTask(from: AcpTaskState, to: AcpTaskState): boolean {
  if (from === to) return true;
  if (TERMINAL_STATES.has(from)) return false;
  if (to === "canceled" || to === "failed" || to === "rejected") return true;
  if (from === "submitted") return to === "working" || to === "input-required";
  if (from === "input-required") return to === "working";
  return from === "working" && (to === "input-required" || to === "completed");
}
