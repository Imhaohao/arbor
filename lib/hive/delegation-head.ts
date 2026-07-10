import bundledModel from "./delegation-head-model.json";
import {
  rankWithDelegationHead,
  type DelegationHeadModel,
  type DelegationRankCandidate,
} from "./delegation-head-core";

const model = bundledModel as unknown as DelegationHeadModel;

export const BUNDLED_DELEGATION_HEAD = {
  version: model.version,
  training_examples: model.training_examples,
  training_source: model.training_source,
  learned_agents: Object.keys(model.agents).length,
  blend_weight: model.blend_weight,
} as const;

export function rankWithBundledDelegationHead<
  C extends DelegationRankCandidate,
>(
  query: string,
  candidates: C[],
): Array<C & { learned_score?: number; routing_score: number }> {
  return rankWithDelegationHead(query, candidates, model);
}
