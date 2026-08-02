import {
  callOpenAI,
  callOpenRouter,
  describeOpenAIPathReadiness,
  parseJSONLoose,
} from "./openai";
import { costOfUsage, parseAnthropicUsage, recordLlmCall } from "./llm-usage";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const CLAUDE_PLANNER_MODEL = "claude-fable-5";
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5-20251001";

export type ClaudeRuntimeStatus = "ready" | "fallback" | "blocked";

export interface ClaudeRuntimeReadiness {
  ready: boolean;
  status: ClaudeRuntimeStatus;
  provider: "anthropic" | "openrouter" | "openai" | "unavailable";
  model: string;
  anthropic_key_configured: boolean;
  openrouter_key_configured: boolean;
  openai_key_configured: boolean;
  missing_env: string[];
  message: string;
}

export interface ClaudeCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

interface AnthropicTextResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface RequiredClaudeCallOptions extends Required<ClaudeCallOptions> {}

type HiveProviderPreference = "auto" | "anthropic" | "openrouter" | "openai";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timeout after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envFlag(name: string): boolean {
  const value = (env(name) ?? "").toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

function hiveProviderPreference(): {
  preferred: HiveProviderPreference;
  forced: boolean;
} {
  const raw = (
    env("ARBOR_HIVE_MODEL_PROVIDER") ??
    env("ARBOR_CLAUDE_PROVIDER") ??
    ""
  ).toLowerCase();
  if (["anthropic", "claude"].includes(raw)) {
    return { preferred: "anthropic", forced: true };
  }
  if (["openrouter", "router"].includes(raw)) {
    return { preferred: "openrouter", forced: true };
  }
  if (["openai", "native", "direct"].includes(raw)) {
    return { preferred: "openai", forced: true };
  }
  // Unset/auto keeps the legacy fallback order (Anthropic -> OpenRouter ->
  // OpenAI path). Preferring OpenAI must be an explicit opt-in via the env
  // flag — auto-preferring it whenever the OpenAI path is usable would
  // silently reroute Anthropic-keyed deployments and make the flag a no-op.
  return { preferred: "auto", forced: false };
}

function providerOrder(): Array<Exclude<HiveProviderPreference, "auto">> {
  const preference = hiveProviderPreference();
  const fallbackOrder: Array<Exclude<HiveProviderPreference, "auto">> = [
    "anthropic",
    "openrouter",
    "openai",
  ];
  if (preference.preferred === "auto") return fallbackOrder;
  if (preference.forced) return [preference.preferred];
  return [
    preference.preferred,
    ...fallbackOrder.filter((provider) => provider !== preference.preferred),
  ];
}

function anthropicApiKey(): string {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

function openRouterModel(model: string): string {
  if (model === CLAUDE_PLANNER_MODEL) {
    return env("OPENROUTER_CLAUDE_PLANNER_MODEL") ?? `anthropic/${model}`;
  }
  if (model === CLAUDE_FAST_MODEL) {
    return (
      env("OPENROUTER_CLAUDE_FAST_MODEL") ?? "anthropic/claude-haiku-4.5"
    );
  }
  return model.includes("/") ? model : `anthropic/${model}`;
}

export function describeClaudeRuntime(
  model = CLAUDE_PLANNER_MODEL,
): ClaudeRuntimeReadiness {
  const anthropicConfigured = Boolean(env("ANTHROPIC_API_KEY"));
  const openRouterConfigured = Boolean(env("OPENROUTER_API_KEY"));
  const openAIConfigured = Boolean(env("OPENAI_API_KEY"));
  const preference = hiveProviderPreference();
  const openAIPath = describeOpenAIPathReadiness("planner");
  if (
    envFlag("ARBOR_MODEL_SPEND_DISABLED") ||
    envFlag("ARBOR_MODEL_CALLS_DISABLED")
  ) {
    return {
      ready: false,
      status: "blocked",
      provider: "unavailable",
      model,
      anthropic_key_configured: anthropicConfigured,
      openrouter_key_configured: openRouterConfigured,
      openai_key_configured: openAIConfigured,
      missing_env: [
        ...(anthropicConfigured ? [] : ["ANTHROPIC_API_KEY"]),
        ...(openRouterConfigured ? [] : ["OPENROUTER_API_KEY"]),
      ],
      message: "Hive model calls are disabled by an Arbor runtime switch.",
    };
  }
  if (preference.preferred === "openai" && preference.forced) {
    if (openAIPath.usable) {
      return {
        ready: true,
        status: "ready",
        provider: "openai",
        model: openAIPath.model,
        anthropic_key_configured: anthropicConfigured,
        openrouter_key_configured: openRouterConfigured,
        openai_key_configured: openAIConfigured,
        missing_env: [],
        message:
          "Hive model calls are forced through the configured OpenAI path.",
      };
    }
    return {
      ready: false,
      status: "blocked",
      provider: "unavailable",
      model: openAIPath.model,
      anthropic_key_configured: anthropicConfigured,
      openrouter_key_configured: openRouterConfigured,
      openai_key_configured: openAIConfigured,
      missing_env: openAIPath.missing_env.length > 0
        ? openAIPath.missing_env
        : ["OPENAI_API_KEY"],
      message:
        "ARBOR_HIVE_MODEL_PROVIDER=openai is set, but the OpenAI path is not usable.",
    };
  }
  if (preference.preferred === "openrouter" && preference.forced) {
    if (openRouterConfigured) {
      return {
        ready: true,
        status: "ready",
        provider: "openrouter",
        model: openRouterModel(model),
        anthropic_key_configured: anthropicConfigured,
        openrouter_key_configured: true,
        openai_key_configured: openAIConfigured,
        missing_env: [],
        message: "Hive model calls are forced through OpenRouter.",
      };
    }
    return {
      ready: false,
      status: "blocked",
      provider: "unavailable",
      model: openRouterModel(model),
      anthropic_key_configured: anthropicConfigured,
      openrouter_key_configured: false,
      openai_key_configured: openAIConfigured,
      missing_env: ["OPENROUTER_API_KEY"],
      message:
        "ARBOR_HIVE_MODEL_PROVIDER=openrouter is set, but OPENROUTER_API_KEY is missing.",
    };
  }
  if (preference.preferred === "anthropic" && preference.forced && !anthropicConfigured) {
    return {
      ready: false,
      status: "blocked",
      provider: "unavailable",
      model,
      anthropic_key_configured: false,
      openrouter_key_configured: openRouterConfigured,
      openai_key_configured: openAIConfigured,
      missing_env: ["ANTHROPIC_API_KEY"],
      message:
        "ARBOR_HIVE_MODEL_PROVIDER=anthropic is set, but ANTHROPIC_API_KEY is missing.",
    };
  }
  if (anthropicConfigured) {
    return {
      ready: true,
      status: "ready",
      provider: "anthropic",
      model,
      anthropic_key_configured: true,
      openrouter_key_configured: openRouterConfigured,
      openai_key_configured: openAIConfigured,
      missing_env: [],
      message: "Hive Claude calls use the direct Anthropic runtime.",
    };
  }
  if (openRouterConfigured) {
    return {
      ready: true,
      status: "fallback",
      provider: "openrouter",
      model: openRouterModel(model),
      anthropic_key_configured: false,
      openrouter_key_configured: true,
      openai_key_configured: openAIConfigured,
      missing_env: ["ANTHROPIC_API_KEY"],
      message:
        "ANTHROPIC_API_KEY is missing in Convex; Hive Claude calls use the configured OpenRouter fallback.",
    };
  }
  // Gate the final fallback on provider usability, not on OPENAI_API_KEY —
  // a pure-Azure/Foundry deployment has no OpenAI key but callOpenAI works.
  if (openAIPath.usable) {
    const viaAzure =
      openAIPath.provider === "azure-openai" || openAIPath.provider === "foundry";
    return {
      ready: true,
      status: "fallback",
      provider: "openai",
      model: openAIPath.model,
      anthropic_key_configured: false,
      openrouter_key_configured: false,
      openai_key_configured: openAIConfigured,
      missing_env: ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"],
      message: viaAzure
        ? "Claude runtime keys are missing in Convex; Hive model calls use the configured Azure fallback."
        : "Claude runtime keys are missing in Convex; Hive model calls use the configured OpenAI fallback.",
    };
  }
  if (openAIConfigured && openAIPath.provider === "disabled") {
    return {
      ready: false,
      status: "blocked",
      provider: "unavailable",
      model: openAIPath.model,
      anthropic_key_configured: false,
      openrouter_key_configured: false,
      openai_key_configured: true,
      missing_env: ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"],
      message: "The configured OpenAI fallback is disabled by model routing.",
    };
  }
  return {
    ready: false,
    status: "blocked",
    provider: "unavailable",
    model,
    anthropic_key_configured: false,
    openrouter_key_configured: false,
    openai_key_configured: openAIConfigured,
    missing_env: [
      "ANTHROPIC_API_KEY",
      "OPENROUTER_API_KEY",
      ...(openAIPath.missing_env.length > 0
        ? openAIPath.missing_env
        : ["OPENAI_API_KEY"]),
    ],
    message:
      "Convex has no model runtime key. Hive planning collapses to one node and evaluation uses plain output concatenation.",
  };
}

function assertModelSpendEnabled(): void {
  if (
    envFlag("ARBOR_MODEL_SPEND_DISABLED") ||
    envFlag("ARBOR_MODEL_CALLS_DISABLED")
  ) {
    throw new Error(
      "remote model calls are switched off by an Arbor runtime switch",
    );
  }
}

function extractText(data: AnthropicTextResponse): string {
  const text = data.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
  if (text && text.trim()) return text;
  throw new Error("Anthropic returned no text content");
}

async function postClaudeMessage(opts: RequiredClaudeCallOptions): Promise<string> {
  const startedAt = Date.now();
  const response = await withTimeout(
    fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey(),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userPrompt }],
      }),
    }),
    opts.timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  // Record measured spend before extracting text, so a response that carries
  // usage but no usable text still gets billed — it cost money either way.
  const usage = parseAnthropicUsage(body);
  if (usage) {
    recordLlmCall({
      provider: "anthropic",
      model: opts.model,
      usage,
      cost_usd: costOfUsage(usage, opts.model),
      duration_ms: Date.now() - startedAt,
    });
  }
  return extractText(body as AnthropicTextResponse);
}

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const {
    model,
    systemPrompt,
    userPrompt,
    maxTokens = 1024,
    timeoutMs = 30_000,
    retries = 1,
  } = opts;

  const resolved: RequiredClaudeCallOptions = {
    model,
    systemPrompt,
    userPrompt,
    maxTokens,
    timeoutMs,
    retries,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    assertModelSpendEnabled();
    let attempted = false;
    for (const provider of providerOrder()) {
      if (provider === "anthropic" && env("ANTHROPIC_API_KEY")) {
        attempted = true;
        try {
          return await postClaudeMessage(resolved);
        } catch (err) {
          lastErr = err;
        }
      }
      if (provider === "openrouter" && env("OPENROUTER_API_KEY")) {
        attempted = true;
        try {
          return await callOpenRouter({
            ...resolved,
            model: openRouterModel(model),
            retries: 0,
          });
        } catch (err) {
          lastErr = err;
        }
      }
      if (provider === "openai" && describeOpenAIPathReadiness("planner").usable) {
        attempted = true;
        try {
          return await callOpenAI({
            systemPrompt,
            userPrompt,
            maxTokens,
            timeoutMs,
            retries: 0,
            purpose: "planner",
          });
        } catch (err) {
          lastErr = err;
        }
      }
    }
    if (!attempted) {
      lastErr = new Error(
        "ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or a usable OpenAI-path provider (OPENAI_API_KEY, or Azure/Foundry credentials with ARBOR_AZURE_ENABLED) must be set for Hive model calls",
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Anthropic call failed");
}

export async function callClaudeJSON<T>(opts: ClaudeCallOptions): Promise<T> {
  const text = await callClaude(opts);
  return parseJSONLoose<T>(text);
}
