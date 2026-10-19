import { PUBLIC_DEMO_AGENT_ID } from "../public-demo";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistExecuteResult,
  SpecialistProvenance,
  SpecialistRunner,
} from "../types";

const LABEL = "[PUBLIC DEMO — deterministic, no external calls]";
const SMOKE_SENTENCE = "Arbor preview smoke test passed safely.";

export const ARBOR_PUBLIC_DEMO_CONFIG: SpecialistConfig = {
  agent_id: PUBLIC_DEMO_AGENT_ID,
  tier: "real",
  display_name: "Arbor Public Demo",
  sponsor: "Arbor",
  capabilities: ["safe demo", "deterministic response", "hive lifecycle"],
  cost_baseline: 0.01,
  starting_reputation: 0.01,
  one_liner:
    "Deterministic Arbor-owned preview lane; it never calls A2A, tools, models, or payments.",
  system_prompt:
    "Public-demo-only deterministic specialist. No network, credentials, model calls, or side effects.",
};

export const arborPublicDemo: SpecialistRunner = {
  config: ARBOR_PUBLIC_DEMO_CONFIG,

  async probe() {
    return {
      status: "pass" as const,
      duration_ms: 0,
      response_excerpt: "public demo lane ready (deterministic; no external calls)",
    };
  },

  async bid(prompt): Promise<SpecialistDecision> {
    return {
      bid_price: ARBOR_PUBLIC_DEMO_CONFIG.cost_baseline,
      capability_claim:
        `${LABEL} I will return the requested deterministic preview result for ` +
        `"${prompt.trim().slice(0, 120)}" without any network, key, model, or payment call.`,
      estimated_seconds: 1,
      confidence: 1,
      plan_source: "baseline",
    };
  },

  async execute(prompt, _taskType, context): Promise<SpecialistExecuteResult> {
    const text = prompt.includes(SMOKE_SENTENCE)
      ? `${LABEL}\n\n${SMOKE_SENTENCE}`
      : `${LABEL}\n\nThis public preview only demonstrates Arbor's safe Hive lifecycle. ` +
        "No A2A agent, external tool, model, or real-money payment was used; " +
        "the Hive lifecycle records simulated Convex escrow only.";
    const sessionId = `public-demo:${context?.task_id ?? "local"}`;
    const recorder = context?.toolRecorder;

    if (recorder) {
      await recorder.record(
        {
          agent_id: context?.agent_id ?? PUBLIC_DEMO_AGENT_ID,
          phase: "execute",
          transport: "mock",
          provider: "arbor-public-demo",
          endpoint: "public-demo://deterministic",
          method: "render",
          tool_name: "deterministic_preview",
        },
        async () => text,
        () => ({
          ok: true,
          result_preview: text,
          external_session_id: sessionId,
        }),
      );
    }

    const provenance: SpecialistProvenance = {
      tier: "not-a2a-yet",
      live_tools_called: false,
      transport: "mock",
      proof_level: "none",
      successful_tool_call_count: recorder ? 1 : 0,
      external_session_id: sessionId,
    };
    return { output: text, provenance };
  },
};
