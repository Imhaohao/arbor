// Local LLM via Ollama. Zero cost, zero network egress beyond localhost.
//
// This exists so data-generation work (the task battery, offline grading) can
// keep running when every paid provider is out of credit — measured 2026-07-30:
// OpenAI 429 insufficient_quota, Anthropic 400 credit-too-low, OpenRouter 402
// never-purchased-credits. A grader outage otherwise collapses the battery to
// deterministic substring checks, which cannot express partial quality and
// therefore cannot produce the graded query x agent matrix the router needs.
//
// A LOCAL GRADER IS NOT EQUIVALENT TO A FRONTIER GRADER. A 7B model scores more
// noisily than gpt-4o-mini. Callers MUST record which grader produced a label
// (see `LocalJsonResult.model`) so downstream training can weight or segment by
// grader, rather than silently mixing label qualities.

import { parseJSONLoose } from "./openai";

const DEFAULT_BASE_URL = "http://localhost:11434";
/** Small and fast; the grading task is short-context classification. */
const DEFAULT_MODEL = "qwen2.5:7b";
const DEFAULT_TIMEOUT_MS = 120_000;

export function localLlmBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function localLlmModel(): string {
  return process.env.ARBOR_LOCAL_LLM_MODEL?.trim() || DEFAULT_MODEL;
}

/** Explicit opt-in. Falling back to a weaker grader must never be implicit. */
export function localLlmEnabled(): boolean {
  const raw = (process.env.ARBOR_LOCAL_LLM_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

/** True when an Ollama server answers and has at least one model pulled. */
export async function localLlmAvailable(timeoutMs = 5_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${localLlmBaseUrl()}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { models?: unknown[] };
    return Array.isArray(data.models) && data.models.length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface LocalJsonResult<T> {
  value: T;
  /** Which local model produced this, for label provenance. */
  model: string;
}

/**
 * Call the local model and parse a JSON object out of the reply.
 *
 * Uses Ollama's `format: "json"` to constrain decoding, but still routes the
 * text through `parseJSONLoose` — small models sometimes wrap the object in
 * prose or a fenced block even when asked not to.
 */
export async function callLocalJSON<T>(opts: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<LocalJsonResult<T>> {
  const model = opts.model ?? localLlmModel();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${localLlmBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: opts.temperature ?? 0 },
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(
        `ollama ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    const data = (await response.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) throw new Error("ollama returned an empty message");
    return { value: parseJSONLoose<T>(content), model };
  } finally {
    clearTimeout(timer);
  }
}
