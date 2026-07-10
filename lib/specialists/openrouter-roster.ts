import type { SpecialistConfig } from "../types";

const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

/**
 * Curated 2026 frontier-economics roster (workstream W7). Slugs verified live
 * against `GET https://openrouter.ai/api/v1/models` on 2026-07-04 (no auth
 * required for the model list). Pricing below is that endpoint's per-token
 * `pricing.prompt` / `pricing.completion`, expressed as $/1M tokens:
 *
 *   anthropic/claude-opus-4.8   prompt $5.00  completion $25.00  (1M ctx)
 *   openai/gpt-5.5              prompt $5.00  completion $30.00  (1.05M ctx)
 *   google/gemini-3.5-flash     prompt $1.50  completion $9.00   (1.05M ctx)
 *   deepseek/deepseek-v4-pro    prompt $0.435 completion $0.87   (1.05M ctx, open-weight)
 *   moonshotai/kimi-k2.6        prompt $0.66  completion $3.41   (262k ctx, open-weight)
 *
 * `cost_baseline` stays a per-task dollar estimate (not $/1M), scaled the same
 * way as the rest of this roster/registry — relative ordering tracks the
 * completion-token price above.
 */
export const OPENROUTER_SPECIALISTS: SpecialistConfig[] = [
  {
    agent_id: "openrouter-opus-reasoner",
    display_name: "Opus Reasoner",
    sponsor: "Anthropic via OpenRouter",
    capabilities: [
      "reasoning",
      "decision analysis",
      "complex planning",
      "software engineering",
      "pr-review",
    ],
    system_prompt:
      "You are a high-rigor software-engineering and reasoning specialist. Resolve ambiguous, multi-constraint problems and hard PR-review/code tasks with explicit assumptions and checks.",
    cost_baseline: 0.12,
    starting_reputation: 0.94,
    one_liner:
      "Hard software-engineering, PR-review, and ambiguous multi-constraint reasoning.",
    tier: "openrouter",
    openrouter_model_id: "anthropic/claude-opus-4.8",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-gpt55-planner",
    display_name: "GPT-5.5 Planner",
    sponsor: "OpenAI via OpenRouter",
    capabilities: [
      "reasoning",
      "classification",
      "decision analysis",
      "complex planning",
      "hard-task planner",
    ],
    system_prompt:
      "You are a hard-reasoning planning specialist. Decompose abstract, high-ambiguity goals into a verifiable plan, calling out assumptions and failure modes explicitly.",
    cost_baseline: 0.09,
    starting_reputation: 0.9,
    one_liner:
      "Hard/abstract reasoning and planner-of-record for the toughest tasks.",
    tier: "openrouter",
    openrouter_model_id: "openai/gpt-5.5",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-gemini-flash-agent",
    display_name: "Gemini Flash Agent",
    sponsor: "Google via OpenRouter",
    capabilities: [
      "extraction",
      "long-context synthesis",
      "document analysis",
      "generation",
      "classification",
      "tool-loop",
    ],
    system_prompt:
      "You are a fast, high-volume default specialist for tool-loop and long-context work. Preserve source distinctions, extract requested facts, and answer directly without padding — be concise, not verbose.",
    cost_baseline: 0.025,
    starting_reputation: 0.86,
    one_liner:
      "Value-leader default/tool-loop/high-volume node; long-context extraction and synthesis. Caveat: verbose by default, so callers should cap output (ARBOR_AGENT_MAX_OUTPUT_TOKENS or a per-call maxTokens).",
    tier: "openrouter",
    openrouter_model_id: "google/gemini-3.5-flash",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-deepseek-bulk",
    display_name: "DeepSeek Bulk",
    sponsor: "DeepSeek via OpenRouter",
    capabilities: ["generation", "classification", "open-source model", "bulk"],
    system_prompt:
      "You are a cost-capped, open-weight generalist for bulk generation and classification work. Stay grounded in the supplied prompt and constraints; keep answers direct.",
    cost_baseline: 0.008,
    starting_reputation: 0.72,
    one_liner: "Open-weight bulk/cost-capped generation and classification.",
    tier: "openrouter",
    openrouter_model_id: "deepseek/deepseek-v4-pro",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-kimi-oss-generalist",
    display_name: "Kimi OSS Generalist",
    sponsor: "Moonshot AI via OpenRouter",
    capabilities: ["generation", "open-source model", "content drafting", "bulk"],
    system_prompt:
      "You are an open-source generalist focused on clear, useful generation tasks at low operating cost. Stay grounded in the supplied prompt and constraints.",
    cost_baseline: 0.015,
    starting_reputation: 0.68,
    one_liner: "Open-weight general generation, bulk/cost-capped alternative.",
    tier: "openrouter",
    openrouter_model_id: "moonshotai/kimi-k2.6",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
];

export function isCuratedOpenRouterSpecialist(input: {
  agent_id: string;
  openrouter_model_id?: string;
}): boolean {
  return OPENROUTER_SPECIALISTS.some(
    (specialist) =>
      specialist.agent_id === input.agent_id &&
      specialist.openrouter_model_id === input.openrouter_model_id,
  );
}
