export interface ConsensusEvaluation {
  node_id: string;
  verdict: "accept" | "reject";
}

export interface ConsensusNode {
  node_id: string;
  revision_count?: number;
}

export type ConsensusDecision =
  | { action: "reached"; reason: string }
  | { action: "revise"; node_ids: string[]; reason: string }
  | { action: "escalate"; reason: string };

export function decideConsensus(args: {
  evaluations: ConsensusEvaluation[];
  nodes: ConsensusNode[];
  confidence: number;
  tieCount: number;
  fallbackUsed: boolean;
  lowConfidenceThreshold: number;
  maxRevisions: number;
  tieEpsilon: number;
}): ConsensusDecision {
  const rejectedIds = args.evaluations
    .filter((evaluation) => evaluation.verdict === "reject")
    .map((evaluation) => evaluation.node_id);
  const rejectedNodes = rejectedIds
    .map((id) => args.nodes.find((node) => node.node_id === id))
    .filter((node): node is ConsensusNode => Boolean(node));
  const exhausted = rejectedNodes.some(
    (node) => (node.revision_count ?? 0) >= args.maxRevisions,
  );

  if (
    rejectedNodes.length > 0 &&
    !exhausted &&
    args.tieCount === 0 &&
    !args.fallbackUsed
  ) {
    return {
      action: "revise",
      node_ids: rejectedNodes.map((node) => node.node_id),
      reason: "Evaluator critique requires another bounded worker revision.",
    };
  }
  if (args.tieCount > 0) {
    return {
      action: "escalate",
      reason: `Conflicting node outputs have scores within ${args.tieEpsilon}.`,
    };
  }
  if (exhausted) {
    return {
      action: "escalate",
      reason: `Consensus did not stabilize after ${args.maxRevisions} revisions.`,
    };
  }
  if (rejectedIds.length > 0) {
    return {
      action: "escalate",
      reason: "One or more node artifacts were rejected by the evaluator.",
    };
  }
  if (args.confidence < args.lowConfidenceThreshold) {
    return {
      action: "escalate",
      reason: `DAG confidence ${args.confidence.toFixed(2)} is below ${args.lowConfidenceThreshold}.`,
    };
  }
  return { action: "reached", reason: "All node artifacts were accepted." };
}
