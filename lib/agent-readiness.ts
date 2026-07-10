import type { SpecialistConfig } from "./types";

export type TransportStatus =
  | "ready"
  | "needs_key"
  | "protocol_mismatch"
  | "endpoint_down"
  | "mock_only";

export type ReadinessStatus = TransportStatus | "needs_owner_action";

export type SmokeStageStatus =
  | "pass"
  | "fail"
  | "declined"
  | "skipped"
  | "not_applicable";

export interface ReadinessRecord {
  agent_id: string;
  source: string;
  transport: string;
  endpoint?: string;
  auth_mode?: string;
  required_key_env?: string;
  transport_status: TransportStatus;
  note?: string;
}

export interface SmokeTask {
  task_class: string;
  prompt: string;
  capability: string;
}

export interface SmokeAssessmentInput {
  transport_status: TransportStatus;
  probe_status: SmokeStageStatus;
  bid_status: SmokeStageStatus;
  execution_status: SmokeStageStatus;
  judge_status: SmokeStageStatus;
  eval_status: SmokeStageStatus;
  scratchpad_status: SmokeStageStatus;
  full_run: boolean;
  has_live_transport: boolean;
  probe_error?: string;
}

export interface SmokeAssessment {
  readiness_status: ReadinessStatus;
  failure_bucket: string;
  settlement_eligible: boolean;
}

export type EnvPresent = (name: string) => boolean;

export const READINESS_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const EPHEMERAL_TUNNEL_READINESS_MAX_AGE_MS = 15 * 60 * 1_000;

export interface SmokeRunEvidence {
  run_id: string;
  status: string;
  total_agents: number;
  processed_agents: number;
  completed_at?: number;
}

export interface AgentSmokeEvidence {
  run_id: string;
  readiness_status: string;
  created_at: number;
}

export interface MarketReadinessAssessment {
  ready: boolean;
  reason: string | null;
}

export function isEphemeralTunnelEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === "trycloudflare.com" || hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

/**
 * Market readiness is a short-lived lease granted by a completed smoke run.
 * Quick tunnels get a shorter lease because their origin changes on restart.
 */
export function assessMarketReadiness(args: {
  endpoint: string | undefined;
  credential_satisfied: boolean;
  run: SmokeRunEvidence | null;
  evidence: AgentSmokeEvidence | null;
  now?: number;
}): MarketReadinessAssessment {
  if (!args.endpoint) return { ready: false, reason: "no_endpoint" };
  if (!args.credential_satisfied) {
    return { ready: false, reason: "missing_credential" };
  }
  if (!args.run) return { ready: false, reason: "no_readiness_run" };
  if (
    args.run.status !== "complete" ||
    args.run.processed_agents !== args.run.total_agents ||
    !args.run.completed_at
  ) {
    return { ready: false, reason: "readiness_run_incomplete" };
  }

  const now = args.now ?? Date.now();
  const maxAge = isEphemeralTunnelEndpoint(args.endpoint)
    ? EPHEMERAL_TUNNEL_READINESS_MAX_AGE_MS
    : READINESS_MAX_AGE_MS;
  if (now - args.run.completed_at > maxAge) {
    return { ready: false, reason: "readiness_expired" };
  }
  if (!args.evidence || args.evidence.run_id !== args.run.run_id) {
    return { ready: false, reason: "no_current_readiness" };
  }
  if (now - args.evidence.created_at > maxAge) {
    return { ready: false, reason: "readiness_expired" };
  }
  if (args.evidence.readiness_status !== "ready") {
    return { ready: false, reason: args.evidence.readiness_status };
  }
  return { ready: true, reason: null };
}

function deriveSource(cfg: SpecialistConfig): string {
  if (cfg.agent_id.startsWith("arbor-")) return "arbor";
  if (!cfg.discovered) return "static";
  return cfg.discovery_source ?? "discovered";
}

export function deriveReadiness(
  cfg: SpecialistConfig,
  hasEnv: EnvPresent,
): ReadinessRecord {
  const source = deriveSource(cfg);
  const base: ReadinessRecord = {
    agent_id: cfg.agent_id,
    source,
    transport: "mock",
    transport_status: "mock_only",
  };

  switch (cfg.tier) {
    case "mock":
    case "disabled":
      return base;

    case "real":
      return {
        ...base,
        transport: cfg.agent_id.startsWith("arbor-") ? "internal" : "api",
        transport_status: "ready",
        note: cfg.agent_id.startsWith("arbor-")
          ? "Arbor-owned internal worker"
          : undefined,
      };

    case "mcp-forwarding": {
      const missingKey =
        Boolean(cfg.mcp_api_key_env) && !hasEnv(cfg.mcp_api_key_env!);
      return {
        ...base,
        transport: "mcp",
        endpoint: cfg.mcp_endpoint,
        auth_mode: cfg.mcp_api_key_env ? "configured_key" : "none",
        required_key_env: cfg.mcp_api_key_env,
        transport_status: missingKey ? "needs_key" : "ready",
      };
    }

    case "a2a": {
      const missingKey =
        cfg.a2a_auth_mode !== "none" &&
        Boolean(cfg.a2a_api_key_env) &&
        !hasEnv(cfg.a2a_api_key_env!);
      return {
        ...base,
        transport: "a2a",
        endpoint: cfg.a2a_endpoint,
        auth_mode: cfg.a2a_auth_mode ?? "card",
        required_key_env: cfg.a2a_api_key_env,
        transport_status: missingKey ? "needs_key" : "ready",
      };
    }

    case "a2a-bridge":
      return {
        ...base,
        transport: "a2a-bridge",
        endpoint: cfg.a2a_endpoint,
        transport_status: "ready",
      };

    case "openrouter": {
      const requiredKey = cfg.openrouter_api_key_env ?? "OPENROUTER_API_KEY";
      return {
        ...base,
        transport: "openrouter",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        auth_mode: "bearer",
        required_key_env: requiredKey,
        transport_status: hasEnv(requiredKey) ? "ready" : "needs_key",
      };
    }

    default: {
      const exhaustive: never = cfg.tier;
      return exhaustive;
    }
  }
}

export function classifyTransportFailure(error: string): TransportStatus {
  const value = error.toLowerCase();
  if (
    /(?:api.?key|bearer|credential|token|env var).*(?:missing|not set|required|configured)/.test(
      value,
    ) ||
    /(?:401|403|unauthorized|forbidden)/.test(value)
  ) {
    return "needs_key";
  }
  if (
    /(?:json-rpc|protocol|method not found|invalid request|missing result|not task-shaped|not message-shaped|unsupported|parse|unexpected token|response shape)/.test(
      value,
    )
  ) {
    return "protocol_mismatch";
  }
  return "endpoint_down";
}

export function withProbeStatus(
  record: ReadinessRecord,
  probe: { status: "pass" | "fail" | "demo_lane"; error_message?: string } | null,
): ReadinessRecord {
  if (!probe || probe.status === "pass") return record;
  if (record.transport_status !== "ready") return record;
  if (probe.status === "demo_lane") {
    return { ...record, transport_status: "mock_only" };
  }
  const transport_status = classifyTransportFailure(probe.error_message ?? "");
  return {
    ...record,
    transport_status,
    note: probe.error_message
      ? `${record.note ? `${record.note}; ` : ""}probe: ${probe.error_message.slice(0, 240)}`
      : record.note,
  };
}

function taskClassFor(capability: string): string {
  const value = capability.toLowerCase();
  if (/(extract|parse|lookup|search|find|list|fetch|query|read)/.test(value)) {
    return "extraction";
  }
  if (/(classif|detect|assess|score|review|triage|verify)/.test(value)) {
    return "classification";
  }
  if (/(create|write|draft|generate|design|build)/.test(value)) {
    return "generation";
  }
  return "reasoning";
}

export function generateSmokeTask(
  agentId: string,
  capabilities: string[],
): SmokeTask {
  const capability = capabilities.find((item) => item.trim())?.trim() ?? "general assistance";
  return {
    capability,
    task_class: taskClassFor(capability),
    prompt:
      `Read-only Arbor smoke check for ${agentId}'s \"${capability.slice(0, 160)}\" capability. ` +
      "In one or two sentences, describe the minimum inputs required and the result you would return. " +
      "Do not create, modify, delete, publish, send, purchase, transfer, or charge anything.",
  };
}

export function assessSmoke(input: SmokeAssessmentInput): SmokeAssessment {
  if (input.transport_status !== "ready") {
    return {
      readiness_status: input.transport_status,
      failure_bucket:
        input.transport_status === "mock_only" ? "no_live_transport" : input.transport_status,
      settlement_eligible: false,
    };
  }
  if (!input.has_live_transport) {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "no_live_transport",
      settlement_eligible: false,
    };
  }
  if (input.probe_status === "fail") {
    if (input.probe_error?.toLowerCase().includes("skill mismatch")) {
      return {
        readiness_status: "needs_owner_action",
        failure_bucket: "capability_mismatch",
        settlement_eligible: false,
      };
    }
    return {
      readiness_status: "endpoint_down",
      failure_bucket: "probe_failed",
      settlement_eligible: false,
    };
  }
  if (input.bid_status === "declined") {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "bid_declined",
      settlement_eligible: false,
    };
  }
  if (input.bid_status === "fail") {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "bid_failed",
      settlement_eligible: false,
    };
  }
  if (!input.full_run) {
    return {
      readiness_status: "ready",
      failure_bucket: "probe_only",
      settlement_eligible: false,
    };
  }
  if (input.execution_status !== "pass") {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "execution_failed",
      settlement_eligible: false,
    };
  }
  if (input.judge_status !== "pass") {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "judge_failed",
      settlement_eligible: false,
    };
  }
  if (input.eval_status === "fail") {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "registration_eval_failed",
      settlement_eligible: false,
    };
  }
  if (input.scratchpad_status !== "pass") {
    return {
      readiness_status: "needs_owner_action",
      failure_bucket: "scratchpad_ineligible",
      settlement_eligible: false,
    };
  }
  return {
    readiness_status: "ready",
    failure_bucket: "passed",
    settlement_eligible: true,
  };
}
