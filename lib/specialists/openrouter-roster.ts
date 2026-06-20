import type { SpecialistConfig } from "../types";

const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

export const OPENROUTER_SPECIALISTS: SpecialistConfig[] = [
  {
    agent_id: "openrouter-opus-reasoner",
    display_name: "Opus Reasoner",
    sponsor: "Anthropic via OpenRouter",
    capabilities: ["reasoning", "decision analysis", "complex planning"],
    system_prompt:
      "You are a high-rigor reasoning specialist. Resolve ambiguous, multi-constraint problems with explicit assumptions and checks.",
    cost_baseline: 0.12,
    starting_reputation: 0.94,
    one_liner: "Strong reasoning for ambiguous, multi-constraint hive nodes.",
    tier: "openrouter",
    openrouter_model_id: "anthropic/claude-opus-4.8",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-nano-classifier",
    display_name: "Nano Classifier",
    sponsor: "OpenAI via OpenRouter",
    capabilities: ["classification", "labeling", "triage"],
    system_prompt:
      "You are a fast classification specialist. Apply the requested taxonomy consistently and explain borderline assignments briefly.",
    cost_baseline: 0.01,
    starting_reputation: 0.8,
    one_liner: "Low-cost classification, routing, and structured labeling.",
    tier: "openrouter",
    openrouter_model_id: "openai/gpt-5.4-nano",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-gemini-long-context",
    display_name: "Gemini Long Context",
    sponsor: "Google via OpenRouter",
    capabilities: ["extraction", "long-context synthesis", "document analysis"],
    system_prompt:
      "You are a long-context extraction specialist. Preserve source distinctions, extract requested facts, and flag gaps without inventing data.",
    cost_baseline: 0.06,
    starting_reputation: 0.88,
    one_liner: "Long-context extraction and synthesis across large inputs.",
    tier: "openrouter",
    openrouter_model_id: "google/gemini-3.1-pro-preview",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-codex-engineer",
    display_name: "Codex Engineer",
    sponsor: "OpenAI via OpenRouter",
    capabilities: ["generation", "code-specialist", "software engineering"],
    system_prompt:
      "You are a software engineering specialist. Produce implementation-ready code, tests, and precise technical reasoning from the supplied context.",
    cost_baseline: 0.05,
    starting_reputation: 0.91,
    one_liner: "Implementation and code generation for software tasks.",
    tier: "openrouter",
    openrouter_model_id: "openai/gpt-5.3-codex",
    openrouter_api_key_env: OPENROUTER_API_KEY_ENV,
  },
  {
    agent_id: "openrouter-oss-generalist",
    display_name: "OSS Generalist",
    sponsor: "OpenAI OSS via OpenRouter",
    capabilities: ["generation", "open-source model", "content drafting"],
    system_prompt:
      "You are an open-source generalist focused on clear, useful generation tasks. Stay grounded in the supplied prompt and constraints.",
    cost_baseline: 0.04,
    starting_reputation: 0.31,
    one_liner: "Open-weight general generation at a low operating cost.",
    tier: "openrouter",
    openrouter_model_id: "openai/gpt-oss-120b",
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
