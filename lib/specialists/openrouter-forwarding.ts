import { callOpenRouter, parseJSONLoose } from "../openai";
import type {
  BidPayload,
  DeclineDecision,
  ProbeResult,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistExecuteResult,
  SpecialistProvenance,
  SpecialistRunner,
} from "../types";
import { buildTaskContext } from "../campaign-context";
import { toPublicTier } from "./tiers";
import { clampConfidence } from "../bid-calibration";

type HiveTaskClass =
  | "reasoning"
  | "classification"
  | "extraction"
  | "generation";

interface BidResponse {
  decline?: boolean;
  reason?: string;
  capability_claim?: string;
  estimated_seconds?: number;
  confidence?: number;
}

const TASK_CLASSES: HiveTaskClass[] = [
  "reasoning",
  "classification",
  "extraction",
  "generation",
];
const CODE_TASK_RE =
  /\b(code|coding|repo|repository|typescript|javascript|python|rust|golang|java|sql|api|bug|debug|refactor|test suite|pull request|implementation)\b/i;

function taskClassFor(prompt: string, taskType: string): HiveTaskClass {
  const direct = taskType.trim().toLowerCase() as HiveTaskClass;
  if (TASK_CLASSES.includes(direct)) return direct;
  const tagged = prompt.match(
    /(?:^|\n)\s*Task class:\s*(reasoning|classification|extraction|generation)\b/i,
  )?.[1]?.toLowerCase() as HiveTaskClass | undefined;
  if (tagged && TASK_CLASSES.includes(tagged)) return tagged;
  return "reasoning";
}

function budgetCeiling(prompt: string): number | undefined {
  const raw = prompt.match(/Budget ceiling:\s*\$([0-9]+(?:\.[0-9]+)?)/i)?.[1];
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function endpoint(): string {
  const base = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1")
    .trim()
    .replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(base)
    ? base
    : `${base}/chat/completions`;
}

function apiKeyEnv(config: SpecialistConfig): string {
  return config.openrouter_api_key_env ?? "OPENROUTER_API_KEY";
}

function supportsTaskClass(
  config: SpecialistConfig,
  taskClass: HiveTaskClass,
  prompt: string,
): boolean {
  const capabilities = new Set(
    config.capabilities.map((capability) => capability.trim().toLowerCase()),
  );
  if (!capabilities.has(taskClass)) return false;
  return !capabilities.has("code-specialist") || CODE_TASK_RE.test(prompt);
}

function fallbackPlan(
  config: SpecialistConfig,
  prompt: string,
  taskClass: HiveTaskClass,
): string {
  const subject = (prompt.split("\n").find((line) => line.trim()) ?? prompt)
    .trim()
    .slice(0, 180);
  return (
    `[OpenRouter model ${config.openrouter_model_id}; no live tools] ` +
    `1. Analyze the ${taskClass} task "${subject}" against its explicit constraints. ` +
    "2. Produce the requested concrete deliverable using only the supplied context. " +
    "3. Check the result against the success criteria and state any missing evidence."
  );
}

export function makeOpenRouterSpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  const modelId = config.openrouter_model_id;
  if (!modelId) {
    throw new Error(
      `Specialist "${config.agent_id}" has tier:"openrouter" but openrouter_model_id is not set.`,
    );
  }

  return {
    config,

    async probe(): Promise<ProbeResult> {
      const requiredEnv = apiKeyEnv(config);
      if (!process.env[requiredEnv]?.trim()) {
        return {
          status: "fail",
          duration_ms: 0,
          error_message: `${requiredEnv} is not set`,
        };
      }
      return {
        status: "pass",
        duration_ms: 0,
        response_excerpt: `${modelId} configured through OpenRouter`,
      };
    },

    async bid(prompt, taskType): Promise<SpecialistDecision> {
      const taskClass = taskClassFor(prompt, taskType);
      if (!supportsTaskClass(config, taskClass, prompt)) {
        const decline: DeclineDecision = {
          decline: true,
          reason: `${config.display_name} is not curated for ${taskClass} tasks.`,
        };
        return decline;
      }
      const ceiling = budgetCeiling(prompt);
      if (ceiling !== undefined && config.cost_baseline > ceiling) {
        return {
          decline: true,
          reason: `True cost $${config.cost_baseline.toFixed(2)} exceeds the $${ceiling.toFixed(2)} budget ceiling.`,
        };
      }

      const raw = await callOpenRouter({
        model: modelId,
        apiKeyEnv: apiKeyEnv(config),
        systemPrompt:
          `${config.system_prompt}\n\nYou are bidding in a Vickrey auction as a model-backed specialist with no tools. ` +
          `For this ${taskClass} task, return JSON only: ` +
          '{"decline":false,"capability_claim":"a concrete 2-4 step plan grounded in the task subject","estimated_seconds":30,"confidence":0.6}. ' +
          '"confidence" is your honest 0-1 probability that an impartial judge accepts your delivery; it is scored against the actual verdict and a rejected delivery costs reputation in proportion to the confidence claimed, so report truthfully or decline (declining costs nothing). ' +
          "Never claim browsing, repository access, APIs, or live tools.",
        userPrompt: buildTaskContext(prompt, taskType),
        maxTokens: 420,
        timeoutMs: 20_000,
        retries: 0,
        purpose: "agent",
      });
      const parsed = parseJSONLoose<BidResponse>(raw);
      if (parsed.decline) {
        return {
          decline: true,
          reason: parsed.reason?.trim() || "Model declined the task.",
        };
      }

      const claim = parsed.capability_claim?.trim();
      const bid: BidPayload = {
        bid_price: Math.max(0.01, Number(config.cost_baseline.toFixed(2))),
        capability_claim:
          claim && claim.length >= 40
            ? `[OpenRouter model ${modelId}; no live tools] ${claim}`
            : fallbackPlan(config, prompt, taskClass),
        estimated_seconds:
          typeof parsed.estimated_seconds === "number" &&
          Number.isFinite(parsed.estimated_seconds)
            ? Math.max(1, Math.floor(parsed.estimated_seconds))
            : 30,
        confidence: clampConfidence(parsed.confidence),
        plan_source: "llm",
      };
      return bid;
    },

    async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
      const sessionId = `openrouter:${config.agent_id}:${context?.task_id ?? "local"}`;
      const callModel = () =>
        callOpenRouter({
          model: modelId,
          apiKeyEnv: apiKeyEnv(config),
          systemPrompt:
            `${config.system_prompt}\n\nYou won the task. Produce the complete requested work product in markdown. ` +
            "You are model-backed and have no browser, repository, API, or live tools; never imply otherwise.",
          userPrompt: buildTaskContext(prompt, taskType),
          maxTokens: 1800,
          timeoutMs: 90_000,
          retries: 1,
          purpose: "agent",
        });

      const raw = context?.toolRecorder
        ? await context.toolRecorder.record(
            {
              agent_id: context.agent_id ?? config.agent_id,
              phase: "execute",
              transport: "openrouter",
              provider: modelId,
              endpoint: endpoint(),
              method: "model.generate",
            },
            callModel,
            (result) => ({
              ok: typeof result === "string" && result.trim().length > 0,
              result_preview:
                typeof result === "string" ? result.slice(0, 300) : undefined,
              external_session_id: sessionId,
            }),
          )
        : await callModel();

      const provenance: SpecialistProvenance = {
        tier: toPublicTier(config.tier),
        transport: "openrouter",
        live_tools_called: false,
        endpoint: endpoint(),
        proof_level: "api_call",
        successful_tool_call_count: 0,
        external_session_id: sessionId,
      };
      return {
        output:
          `[OpenRouter model: ${modelId}; model-backed; no live tools called]\n\n` +
          raw.trim(),
        provenance,
      };
    },
  };
}
