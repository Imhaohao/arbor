// Honest per-run savings: counterfactual frontier cost on the SAME tokens
// minus the actual measured cost, reported only when measured cost exists.
//
// Replaces the ValueImpactPanel headroom number (max_budget - price_paid),
// which lib/llm-usage.ts's header documents as budget headroom, not a saving.
// E4 measured the honest metric on 132 settled runs: mean $0.001692/run,
// median $0.000882, positive on 100% (counterfactual/actual ratio 4.25x).
// Small, true, and defensible beats large and fabricated.

import { costOfUsage, priceForModel } from "./llm-usage";

/** Counterfactual model: what the tokens would have cost un-routed, at list
 * price on the frontier default. List price, not an invoice — say so in UI. */
export const FRONTIER_COUNTERFACTUAL_MODEL = "gpt-5.2";

export interface MeasuredExecution {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface CounterfactualSaving {
  frontier_cost_usd: number;
  saving_usd: number;
  /** frontier / actual. 1.0 means routing bought nothing. */
  ratio: number;
}

/** Undefined when the frontier model has no price or tokens are absent —
 * never fabricate a saving from missing data. */
export function counterfactualSaving(
  exec: Partial<MeasuredExecution>,
  frontierModel: string = FRONTIER_COUNTERFACTUAL_MODEL,
): CounterfactualSaving | undefined {
  const { input_tokens, output_tokens, cost_usd } = exec;
  if (
    typeof input_tokens !== "number" ||
    typeof output_tokens !== "number" ||
    typeof cost_usd !== "number" ||
    input_tokens < 0 ||
    output_tokens < 0 ||
    cost_usd < 0
  ) {
    return undefined;
  }
  if (!priceForModel(frontierModel)) return undefined;
  const frontier = costOfUsage(
    { input_tokens, output_tokens },
    frontierModel,
  );
  if (typeof frontier !== "number") return undefined;
  const saving = frontier - cost_usd;
  return {
    frontier_cost_usd: frontier,
    saving_usd: saving,
    ratio: cost_usd > 0 ? frontier / cost_usd : Infinity,
  };
}

/** What the value panel is allowed to show for a task. Discriminated so the
 * component cannot accidentally render headroom under a "saved" label. */
export type SavingsDisplay =
  | {
      kind: "measured";
      saving_usd: number;
      frontier_cost_usd: number;
      actual_cost_usd: number;
      models: string[];
    }
  | { kind: "unmeasured"; budget_unspent_usd: number | undefined };

export interface TaskCostFields {
  max_budget?: number;
  price_paid?: number;
  execution_cost_usd?: number;
  execution_input_tokens?: number;
  execution_output_tokens?: number;
  execution_models?: string[];
}

export function savingsDisplay(task: TaskCostFields): SavingsDisplay {
  const cf = counterfactualSaving({
    input_tokens: task.execution_input_tokens,
    output_tokens: task.execution_output_tokens,
    cost_usd: task.execution_cost_usd,
  });
  if (cf) {
    return {
      kind: "measured",
      saving_usd: cf.saving_usd,
      frontier_cost_usd: cf.frontier_cost_usd,
      actual_cost_usd: task.execution_cost_usd as number,
      models: task.execution_models ?? [],
    };
  }
  const unspent =
    typeof task.max_budget === "number" && typeof task.price_paid === "number"
      ? Math.max(0, task.max_budget - task.price_paid)
      : undefined;
  return { kind: "unmeasured", budget_unspent_usd: unspent };
}
