"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  getRunner,
  getSpecialists,
  registerDiscoveredSpecialist,
  specialistConfigFromPersisted,
} from "../lib/specialists/registry";
import { MCP_CATALOG } from "../lib/specialists/catalog";
import {
  assessSmoke,
  classifyTransportFailure,
  deriveReadiness,
  generateSmokeTask,
  withProbeStatus,
  type SmokeStageStatus,
} from "../lib/agent-readiness";
import {
  describeClaudeRuntime,
  type ClaudeRuntimeReadiness,
} from "../lib/anthropic";
import { describeModelRuntime } from "../lib/openai";
import type {
  AgentId,
  ProbeResult,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistExecuteResult,
} from "../lib/types";

const PROBE_TIMEOUT_MS = 16_000;
const BID_TIMEOUT_MS = 22_000;
const EXECUTION_TIMEOUT_MS = 85_000;
const MAX_BATCH_SIZE = 8;
const ALL_STATIC_SPECIALISTS = getSpecialists("openrouter");

function envPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function redact(value: string): string {
  return value
    .replace(/([?&](?:config|key|token|secret|credential)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|hs)[-_][A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/\b[A-Za-z0-9_-]{64,}\b/g, "[REDACTED_TOKEN]");
}

function safeEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return redact(value);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

function isDecline(decision: SpecialistDecision): decision is { decline: true; reason: string } {
  return "decline" in decision && decision.decline === true;
}

function outputText(result: SpecialistExecuteResult): string {
  return typeof result.output === "string"
    ? result.output.trim()
    : JSON.stringify(result.output);
}

function looksLikeTransportError(value: string): boolean {
  return /(?:auth|api.?key|credential|token|401|403|json-rpc|protocol|method|http|endpoint|timeout|network|fetch|agent card|missing result|response shape)/i.test(
    value,
  );
}

function discoveredConfig(row: Doc<"discovered_specialists">): SpecialistConfig {
  return specialistConfigFromPersisted(row);
}

function catalogConfig(agentId: string): SpecialistConfig | null {
  const row = MCP_CATALOG.find((entry) => entry.agent_id === agentId);
  if (!row) return null;
  return {
    agent_id: row.agent_id,
    display_name: row.display_name,
    sponsor: row.sponsor,
    capabilities: row.capabilities,
    system_prompt: `Read-only smoke runner for ${row.display_name}. Use only ${row.capabilities.join(", ")}.`,
    cost_baseline: row.cost_baseline,
    starting_reputation: 0.55,
    one_liner: row.one_liner,
    mcp_endpoint: row.mcp_endpoint,
    mcp_api_key_env: row.mcp_api_key_env,
    homepage_url: row.homepage_url,
    discovered: true,
    discovery_source: "catalog",
    discovered_for: "readiness smoke",
    tier: "mcp-forwarding",
  };
}

function configFor(
  agent: Doc<"agents">,
  discovered: Map<string, Doc<"discovered_specialists">>,
): SpecialistConfig | null {
  const dynamic = discovered.get(agent.agent_id);
  if (dynamic) return discoveredConfig(dynamic);
  return (
    ALL_STATIC_SPECIALISTS.find((row) => row.agent_id === agent.agent_id) ??
    catalogConfig(agent.agent_id)
  );
}

async function hydrateOutboundKeys(
  ctx: ActionCtx,
  configs: SpecialistConfig[],
): Promise<void> {
  try {
    const rows = await ctx.runQuery(internal.a2aOutboundKeys._getAll, {});
    const byAgent = new Map(rows.map((row) => [row.agent_id, row.api_key]));
    for (const config of configs) {
      if (
        config.a2a_auth_mode !== "none" &&
        config.a2a_api_key_env &&
        !envPresent(config.a2a_api_key_env)
      ) {
        const key = byAgent.get(config.agent_id);
        if (key) process.env[config.a2a_api_key_env] = key;
      }
    }
  } catch {
    // Missing vault access is represented by the normal auth failure bucket.
  }
}

interface AgentSmokeResult {
  agent_id: string;
  readiness_status: string;
}

interface RosterPage<T> {
  page: T[];
  isDone: boolean;
  continueCursor: string;
}

async function allAgentRows(ctx: ActionCtx): Promise<Array<Doc<"agents">>> {
  const rows: Array<Doc<"agents">> = [];
  let cursor: string | null = null;
  for (;;) {
    const result: RosterPage<Doc<"agents">> = await ctx.runQuery(
      api.agents.listPage,
      { paginationOpts: { numItems: 250, cursor } },
    );
    rows.push(...result.page);
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
}

async function allDiscoveredRows(
  ctx: ActionCtx,
): Promise<Array<Doc<"discovered_specialists">>> {
  const rows: Array<Doc<"discovered_specialists">> = [];
  let cursor: string | null = null;
  for (;;) {
    const result: RosterPage<Doc<"discovered_specialists">> =
      await ctx.runQuery(api.discoveredSpecialists.listPage, {
        paginationOpts: { numItems: 250, cursor },
      });
    rows.push(...result.page);
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
}

async function smokeAgent(
  ctx: ActionCtx,
  runId: string,
  fullRun: boolean,
  agent: Doc<"agents">,
  discovered: Map<string, Doc<"discovered_specialists">>,
): Promise<AgentSmokeResult> {
  const startedAt = Date.now();
  const dynamic = discovered.get(agent.agent_id);
  const config = configFor(agent, discovered);
  const task = generateSmokeTask(agent.agent_id, agent.capabilities);
  const owner = dynamic?.owner_id ?? agent.sponsor ?? agent.agent_id;
  let source = dynamic?.discovery_source ?? "agents";
  let transport = "none";
  let endpoint: string | undefined;
  let requiredKeyEnv: string | undefined;
  let transportStatus: "ready" | "needs_key" | "protocol_mismatch" | "endpoint_down" | "mock_only" =
    "mock_only";
  let probeStatus: SmokeStageStatus = "skipped";
  let bidStatus: SmokeStageStatus = "skipped";
  let executionStatus: SmokeStageStatus = "skipped";
  let judgeStatus: SmokeStageStatus = "skipped";
  let evalStatus: SmokeStageStatus = dynamic
    ? dynamic.eval_status === "passed"
      ? "pass"
      : dynamic.eval_status === "failed"
        ? "fail"
        : "skipped"
    : "not_applicable";
  let scratchpadStatus: SmokeStageStatus = "skipped";
  let evidence = "";
  let error = "";
  let hasLiveTransport = false;

  if (config) {
    if (config.discovered) registerDiscoveredSpecialist(config);
    const readiness = deriveReadiness(config, envPresent);
    source = readiness.source;
    transport = readiness.transport;
    endpoint = safeEndpoint(readiness.endpoint);
    requiredKeyEnv = readiness.required_key_env;
    transportStatus = readiness.transport_status;
    hasLiveTransport = config.tier !== "mock" && config.tier !== "disabled";

    if (transportStatus === "ready") {
      try {
        const runner = getRunner(agent.agent_id as AgentId);
        if (runner.probe) {
          const probe: ProbeResult = await withTimeout(
            runner.probe(task.capability),
            PROBE_TIMEOUT_MS,
            "probe",
          );
          // Card-signature trust signal (A2A JWS): persist as structured data
          // on the specialist row whenever the probe actually verified the
          // card, regardless of probe pass/fail. Display/rank input at most —
          // never a routing gate.
          if (probe.card_signature) {
            await ctx.runMutation(
              internal.discoveredSpecialists._recordCardSignature,
              {
                agent_id: agent.agent_id,
                status: probe.card_signature.status,
                ...(probe.card_signature.kid
                  ? { kid: probe.card_signature.kid }
                  : {}),
                ...(probe.card_signature.jwks_origin
                  ? { jwks_origin: probe.card_signature.jwks_origin }
                  : {}),
                checked_at: Date.now(),
              },
            );
          }
          probeStatus = probe.status === "pass" ? "pass" : "fail";
          evidence = probe.response_excerpt?.slice(0, 500) ?? evidence;
          if (probe.status !== "pass") {
            error = probe.error_message ?? `probe returned ${probe.status}`;
            if (!error.toLowerCase().includes("skill mismatch")) {
              transportStatus = withProbeStatus(readiness, probe).transport_status;
            }
          }
        } else {
          probeStatus = "not_applicable";
        }

        if (probeStatus === "pass" || probeStatus === "not_applicable") {
          let decision: SpecialistDecision;
          try {
            decision = await withTimeout(
              runner.bid(task.prompt, task.task_class),
              BID_TIMEOUT_MS,
              "bid",
            );
            if (isDecline(decision)) {
              bidStatus = "declined";
              error = decision.reason.slice(0, 800);
              if (looksLikeTransportError(error)) {
                transportStatus = classifyTransportFailure(error);
              }
            } else {
              bidStatus = "pass";
              evidence = decision.capability_claim.slice(0, 500);
            }
          } catch (err) {
            bidStatus = "fail";
            error = errorMessage(err).slice(0, 800);
            if (looksLikeTransportError(error)) {
              transportStatus = classifyTransportFailure(error);
            }
          }

          if (fullRun && bidStatus === "pass" && transportStatus === "ready") {
            try {
              const delivered = await withTimeout(
                runner.execute(task.prompt, task.task_class),
                EXECUTION_TIMEOUT_MS,
                "execution",
              );
              const text = outputText(delivered);
              const fallback =
                text.startsWith("[FALLBACK") ||
                Boolean(delivered.provenance.fallback_reason);
              const needsExternalProof = config.tier === "a2a" || config.tier === "mcp-forwarding";
              executionStatus =
                text.length >= 12 &&
                !fallback &&
                (!needsExternalProof || delivered.provenance.live_tools_called)
                  ? "pass"
                  : "fail";
              evidence = text.slice(0, 500) || evidence;
              if (executionStatus === "fail") {
                error =
                  delivered.provenance.fallback_reason ??
                  (text.length < 12
                    ? "execution returned no material output"
                    : "execution did not prove a live external call");
                if (looksLikeTransportError(error)) {
                  transportStatus = classifyTransportFailure(error);
                }
              }
              judgeStatus = executionStatus === "pass" ? "pass" : "fail";
              scratchpadStatus =
                judgeStatus === "pass" && text.length > 0 ? "pass" : "fail";
            } catch (err) {
              executionStatus = "fail";
              judgeStatus = "fail";
              scratchpadStatus = "fail";
              error = errorMessage(err).slice(0, 800);
              if (looksLikeTransportError(error)) {
                transportStatus = classifyTransportFailure(error);
              }
            }
          }
        }
      } catch (err) {
        error = errorMessage(err).slice(0, 800);
        transportStatus = looksLikeTransportError(error)
          ? classifyTransportFailure(error)
          : "endpoint_down";
        probeStatus = "fail";
      }
    }
  } else {
    error = "registered agent has no static, catalog, MCP, or A2A execution config";
  }

  const assessment = assessSmoke({
    transport_status: transportStatus,
    probe_status: probeStatus,
    bid_status: bidStatus,
    execution_status: executionStatus,
    judge_status: judgeStatus,
    eval_status: evalStatus,
    scratchpad_status: scratchpadStatus,
    full_run: fullRun,
    has_live_transport: hasLiveTransport,
    probe_error: error || undefined,
  });

  // A full accepted A2A round trip is stronger evidence than another card
  // fetch. Persist the keyless shortcut for endpoints with no configured key
  // so parallel node auctions do not fan out through transient card discovery
  // on every bid. Key-configured agents remain fail-closed.
  if (
    fullRun &&
    assessment.settlement_eligible &&
    config?.tier === "a2a" &&
    !config.a2a_api_key_env
  ) {
    await ctx.runMutation(
      internal.discoveredSpecialists._markA2aAuthNone,
      { agent_id: agent.agent_id },
    );
  }

  await ctx.runMutation(internal.agentReadiness._recordSmokeResult, {
    run_id: runId,
    agent_id: agent.agent_id,
    owner,
    source,
    transport,
    endpoint,
    required_key_env: requiredKeyEnv,
    task_class: task.task_class,
    task_prompt: task.prompt,
    transport_status: transportStatus,
    readiness_status: assessment.readiness_status,
    probe_status: probeStatus,
    bid_status: bidStatus,
    execution_status: executionStatus,
    judge_status: judgeStatus,
    eval_status: evalStatus,
    scratchpad_status: scratchpadStatus,
    settlement_eligible: assessment.settlement_eligible,
    dashboard_status: "visible",
    failure_bucket: assessment.failure_bucket,
    evidence: evidence ? redact(evidence) : undefined,
    error_message: error ? redact(error) : undefined,
    duration_ms: Date.now() - startedAt,
  });
  return { agent_id: agent.agent_id, readiness_status: assessment.readiness_status };
}

interface OpenRouterCreditsResponse {
  data?: { total_credits?: number; total_usage?: number };
}

async function checkHiveModelReadiness(): Promise<ClaudeRuntimeReadiness> {
  const runtime = describeClaudeRuntime();
  if (runtime.provider !== "openrouter") return runtime;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) throw new Error(`credit check returned ${response.status}`);
    const body = (await response.json()) as OpenRouterCreditsResponse;
    const total = body.data?.total_credits;
    const usage = body.data?.total_usage;
    if (typeof total === "number" && typeof usage === "number" && total - usage <= 0) {
      if (runtime.openai_key_configured) {
        const openAI = describeModelRuntime("planner");
        return {
          ...runtime,
          provider: "openai",
          model: openAI.model,
          message: "OpenRouter has no credits; Hive uses the configured OpenAI fallback.",
        };
      }
      return {
        ...runtime,
        ready: false,
        status: "blocked",
        message: "OpenRouter has no credits and no model fallback is configured.",
      };
    }
    return runtime;
  } catch (err) {
    return { ...runtime, message: `${runtime.message} Credit check failed: ${errorMessage(err)}` };
  }
}

export const getHiveModelReadiness = action({
  args: {},
  returns: v.object({
    ready: v.boolean(),
    status: v.union(v.literal("ready"), v.literal("fallback"), v.literal("blocked")),
    provider: v.union(
      v.literal("anthropic"),
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("unavailable"),
    ),
    model: v.string(),
    anthropic_key_configured: v.boolean(),
    openrouter_key_configured: v.boolean(),
    openai_key_configured: v.boolean(),
    missing_env: v.array(v.string()),
    message: v.string(),
  }),
  handler: async (): Promise<ClaudeRuntimeReadiness> => await checkHiveModelReadiness(),
});

export const runSmokeBatch = action({
  args: {
    run_id: v.string(),
    cursor: v.number(),
    batch_size: v.optional(v.number()),
    agent_id: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    next_cursor: v.union(v.number(), v.null()),
    total: v.number(),
    by_readiness: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args): Promise<{
    processed: number;
    next_cursor: number | null;
    total: number;
    by_readiness: Record<string, number>;
  }> => {
    const run = await ctx.runQuery(internal.agentReadiness._getRun, {
      run_id: args.run_id,
    });
    if (!run) throw new Error(`smoke run ${args.run_id} not found`);
    if (run.status === "failed") throw new Error(`smoke run ${args.run_id} is failed`);

    const [agentRows, discoveredRows] = args.agent_id
      ? await Promise.all([
          ctx
            .runQuery(internal.agents._getByAgentId, {
              agent_id: args.agent_id,
            })
            .then((row) => (row ? [row] : [])),
          ctx
            .runQuery(internal.discoveredSpecialists._getByAgentId, {
              agent_id: args.agent_id,
            })
            .then((row) => (row ? [row] : [])),
        ])
      : await Promise.all([allAgentRows(ctx), allDiscoveredRows(ctx)]);
    const agents = [...agentRows].sort((a, b) => a.agent_id.localeCompare(b.agent_id));
    await ctx.runMutation(internal.agentReadiness._setRunTotalAgents, {
      run_id: args.run_id,
      total_agents: agents.length,
    });
    const discovered = new Map(discoveredRows.map((row) => [row.agent_id, row]));
    const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(args.batch_size ?? 6)));
    const cursor = Math.max(0, Math.trunc(args.cursor));
    const batch = agents.slice(cursor, cursor + batchSize);
    const configs = batch
      .map((agent) => configFor(agent, discovered))
      .filter((config): config is SpecialistConfig => config !== null);
    await hydrateOutboundKeys(ctx, configs);

    const results = await Promise.all(
      batch.map((agent) => smokeAgent(ctx, args.run_id, run.mode === "full", agent, discovered)),
    );
    const by_readiness: Record<string, number> = {};
    for (const result of results) {
      by_readiness[result.readiness_status] =
        (by_readiness[result.readiness_status] ?? 0) + 1;
    }
    const next = cursor + batch.length;
    return {
      processed: batch.length,
      next_cursor: next < agents.length ? next : null,
      total: agents.length,
      by_readiness,
    };
  },
});
