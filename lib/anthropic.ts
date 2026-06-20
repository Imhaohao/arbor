import {
  callOpenAI,
  callOpenRouter,
  describeModelRuntime,
  parseJSONLoose,
} from "./openai";

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
  if (openAIConfigured) {
    const runtime = describeModelRuntime("planner");
    if (runtime.provider === "disabled") {
      return {
        ready: false,
        status: "blocked",
        provider: "unavailable",
        model: runtime.model,
        anthropic_key_configured: false,
        openrouter_key_configured: false,
        openai_key_configured: true,
        missing_env: ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"],
        message: "The configured OpenAI fallback is disabled by model routing.",
      };
    }
    return {
      ready: true,
      status: "fallback",
      provider: "openai",
      model: runtime.model,
      anthropic_key_configured: false,
      openrouter_key_configured: false,
      openai_key_configured: true,
      missing_env: ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"],
      message:
        "Claude runtime keys are missing in Convex; Hive model calls use the configured OpenAI fallback.",
    };
  }
  return {
    ready: false,
    status: "blocked",
    provider: "unavailable",
    model,
    anthropic_key_configured: false,
    openrouter_key_configured: false,
    openai_key_configured: false,
    missing_env: [
      "ANTHROPIC_API_KEY",
      "OPENROUTER_API_KEY",
      "OPENAI_API_KEY",
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

  return extractText((await response.json()) as AnthropicTextResponse);
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
    if (env("ANTHROPIC_API_KEY")) {
      attempted = true;
      try {
        return await postClaudeMessage(resolved);
      } catch (err) {
        lastErr = err;
      }
    }
    if (env("OPENROUTER_API_KEY")) {
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
    if (env("OPENAI_API_KEY")) {
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
    if (!attempted) {
      lastErr = new Error(
        "ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY must be set for Hive model calls",
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Anthropic call failed");
}

export async function callClaudeJSON<T>(opts: ClaudeCallOptions): Promise<T> {
  const text = await callClaude(opts);
  return parseJSONLoose<T>(text);
}
