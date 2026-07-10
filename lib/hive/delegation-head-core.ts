// Query-conditioned delegation head. This is a small, deterministic analogue
// of Fugu's worker-selection head: train from per-query worker reward vectors,
// then add a bounded learned logit to Arbor's 4D/profile rank. It makes no model
// call at inference and leaves agents absent from training untouched.

export const DELEGATION_FEATURE_DIMENSION = 2048;
export const DEFAULT_DELEGATION_TEMPERATURE = 0.2;
export const DEFAULT_DELEGATION_BLEND_WEIGHT = 0.15;

export type DelegationVector = Float64Array;
export type SparseDelegationVector = Array<[index: number, value: number]>;

export interface DelegationTrainingExample {
  query: string;
  /** Measured per-worker rewards for this query. More workers are better;
   * omitted workers receive no training signal rather than an invented loss. */
  worker_rewards: Record<string, number>;
}

export interface DelegationHeadModel {
  version: 1;
  dimension: number;
  temperature: number;
  blend_weight: number;
  training_examples: number;
  training_source: string;
  agents: Record<
    string,
    { positive_examples: number; centroid: SparseDelegationVector }
  >;
}

export interface DelegationRankCandidate {
  agent_id: string;
  similarity: number;
  rank_score?: number;
  routing_score?: number;
  availability_score?: number;
}

function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % DELEGATION_FEATURE_DIMENSION;
}

function textFeatures(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
  const features = [...words];
  for (const word of words) {
    const padded = `#${word}#`;
    for (let index = 0; index + 3 <= padded.length; index += 1) {
      features.push(`_${padded.slice(index, index + 3)}`);
    }
  }
  return features;
}

export function embedDelegationText(text: string): DelegationVector {
  const vector = new Float64Array(DELEGATION_FEATURE_DIMENSION);
  for (const feature of textFeatures(text)) {
    vector[hashToken(feature)] += 1;
  }
  let squaredNorm = 0;
  for (const value of vector) squaredNorm += value * value;
  const norm = Math.sqrt(squaredNorm) || 1;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] /= norm;
  }
  return vector;
}

export function delegationCosine(
  left: DelegationVector,
  right: DelegationVector,
): number {
  let dot = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
  }
  return dot;
}

export function softWorkerTargets(
  workerRewards: Record<string, number>,
  temperature = DEFAULT_DELEGATION_TEMPERATURE,
): Record<string, number> {
  const entries = Object.entries(workerRewards).filter(([, reward]) =>
    Number.isFinite(reward),
  );
  if (entries.length === 0) return {};
  const safeTemperature =
    Number.isFinite(temperature) && temperature > 0
      ? temperature
      : DEFAULT_DELEGATION_TEMPERATURE;
  const maxReward = Math.max(...entries.map(([, reward]) => reward));
  const exponentials = entries.map(([agentId, reward]) => [
    agentId,
    Math.exp((reward - maxReward) / safeTemperature),
  ] as const);
  const total = exponentials.reduce((sum, [, value]) => sum + value, 0) || 1;
  return Object.fromEntries(
    exponentials.map(([agentId, value]) => [agentId, value / total]),
  );
}

function denseToSparse(vector: DelegationVector): SparseDelegationVector {
  const sparse: SparseDelegationVector = [];
  for (let index = 0; index < vector.length; index += 1) {
    if (vector[index] !== 0) sparse.push([index, Number(vector[index].toFixed(8))]);
  }
  return sparse;
}

export function trainDelegationHead(
  examples: DelegationTrainingExample[],
  options?: {
    temperature?: number;
    blendWeight?: number;
    trainingSource?: string;
  },
): DelegationHeadModel {
  const temperature = options?.temperature ?? DEFAULT_DELEGATION_TEMPERATURE;
  const blendWeight = options?.blendWeight ?? DEFAULT_DELEGATION_BLEND_WEIGHT;
  const sums = new Map<string, DelegationVector>();
  const positiveExamples = new Map<string, number>();

  for (const example of examples) {
    if (!example.query.trim()) continue;
    const targets = softWorkerTargets(example.worker_rewards, temperature);
    const targetEntries = Object.entries(targets);
    if (targetEntries.length < 2) continue;
    const neutralMass = 1 / targetEntries.length;
    const queryVector = embedDelegationText(example.query);
    for (const [agentId, targetMass] of targetEntries) {
      // Positive soft-target advantage. Below-neutral workers provide no
      // centroid update instead of polluting every specialist with every query.
      const weight = Math.max(0, targetMass - neutralMass);
      if (weight === 0) continue;
      let sum = sums.get(agentId);
      if (!sum) {
        sum = new Float64Array(DELEGATION_FEATURE_DIMENSION);
        sums.set(agentId, sum);
      }
      for (let index = 0; index < sum.length; index += 1) {
        sum[index] += weight * queryVector[index];
      }
      positiveExamples.set(agentId, (positiveExamples.get(agentId) ?? 0) + 1);
    }
  }

  const agents: DelegationHeadModel["agents"] = {};
  for (const agentId of Array.from(sums.keys()).sort()) {
    const vector = sums.get(agentId)!;
    let squaredNorm = 0;
    for (const value of vector) squaredNorm += value * value;
    const norm = Math.sqrt(squaredNorm) || 1;
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] /= norm;
    }
    agents[agentId] = {
      positive_examples: positiveExamples.get(agentId) ?? 0,
      centroid: denseToSparse(vector),
    };
  }

  return {
    version: 1,
    dimension: DELEGATION_FEATURE_DIMENSION,
    temperature,
    blend_weight: Math.max(0, Math.min(0.3, blendWeight)),
    training_examples: examples.length,
    training_source: options?.trainingSource ?? "in-memory",
    agents,
  };
}

function sparseDot(
  dense: DelegationVector,
  sparse: SparseDelegationVector,
): number {
  let dot = 0;
  for (const [index, value] of sparse) {
    if (index >= 0 && index < dense.length && Number.isFinite(value)) {
      dot += dense[index] * value;
    }
  }
  return dot;
}

export function rankWithDelegationHead<C extends DelegationRankCandidate>(
  query: string,
  candidates: C[],
  model: DelegationHeadModel,
): Array<C & { learned_score?: number; routing_score: number }> {
  if (
    model.version !== 1 ||
    model.dimension !== DELEGATION_FEATURE_DIMENSION ||
    !query.trim()
  ) {
    return candidates.map((candidate) => ({
      ...candidate,
      routing_score:
        candidate.routing_score ?? candidate.rank_score ?? candidate.similarity,
    }));
  }
  const queryVector = embedDelegationText(query);
  const scored = candidates.map((candidate, index) => {
    const baseScore =
      candidate.routing_score ?? candidate.rank_score ?? candidate.similarity;
    const agentHead = model.agents[candidate.agent_id];
    const learnedScore = agentHead
      ? Math.max(0, Math.min(1, sparseDot(queryVector, agentHead.centroid)))
      : undefined;
    const availability =
      candidate.availability_score === undefined
        ? 1
        : Math.max(0, Math.min(1, candidate.availability_score));
    const routingScore = Number(
      (
        baseScore +
        (learnedScore === undefined
          ? 0
          : model.blend_weight * availability * learnedScore)
      ).toFixed(6),
    );
    return { candidate, index, learnedScore, routingScore };
  });
  scored.sort(
    (left, right) =>
      right.routingScore - left.routingScore || left.index - right.index,
  );
  return scored.map(({ candidate, learnedScore, routingScore }) => ({
    ...candidate,
    ...(learnedScore === undefined ? {} : { learned_score: learnedScore }),
    routing_score: routingScore,
  }));
}
