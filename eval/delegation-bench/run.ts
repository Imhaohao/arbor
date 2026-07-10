/**
 * Offline held-out delegation benchmark.
 *
 * Calibration uses the disjoint EASY router suite as repeated historical
 * outcomes. Evaluation uses only HARD near-duplicate tasks. No model/network
 * calls and no HARD labels enter the profiles.
 *
 * Metrics separate two effects:
 *   1. semantic 4D rank -> trained query-conditioned head accuracy;
 *   2. current six-agent auction -> confidence-gated direct/adaptive policy.
 * Profile repetitions below simulate the mature-history policy state; they do
 * not represent end-to-end execution measurements.
 */

import assert from "node:assert/strict";

import { EXTRA_SPECIALISTS } from "../router-bench/distractors";
import { cosine, embed } from "../router-bench/embed";
import { POOL } from "../router-bench/strategies";
import { HARD_TASKS } from "../router-bench/tasks-hard";
import { ROUTER_TASKS } from "../router-bench/tasks";
import type { CatalogEntry } from "../../lib/specialists/catalog";
import {
  adaptiveInviteCount,
  decideRouteMode,
  DEFAULT_EXPERT_MIN_TASKS,
  wilsonLowerBound,
} from "../../lib/hive/router-core";
import {
  EXPERT_PROFILE_WEIGHT,
  profileWeightedRank,
  uncertaintyFor,
  type AgentProfile,
} from "../../lib/hive/profile-core";
import { rankAgents4D } from "../../lib/hive/rank-core";
import {
  BUNDLED_DELEGATION_HEAD,
  rankWithBundledDelegationHead,
} from "../../lib/hive/delegation-head";

const TASK_CLASS = "reasoning";
const CALIBRATION_REPETITIONS = 8;
const LEGACY_NON_FLOOR_INVITES = 6;
const FLOOR_INVITES = 2;
const pool: CatalogEntry[] = [...POOL, ...EXTRA_SPECIALISTS];

function specialistDocument(entry: CatalogEntry): string {
  return [
    entry.display_name,
    entry.sponsor,
    entry.one_liner,
    ...entry.capabilities,
    ...entry.capabilities,
    ...entry.domain_tags,
    ...entry.domain_tags,
  ].join(" ");
}

const specialistVectors = new Map(
  pool.map((entry) => [entry.agent_id, embed(specialistDocument(entry))]),
);

function calibrationProfiles(): Map<string, AgentProfile> {
  const observations = new Map<string, number>();
  for (const task of ROUTER_TASKS) {
    for (const agentId of task.gold_specialist_ids) {
      observations.set(
        agentId,
        (observations.get(agentId) ?? 0) + CALIBRATION_REPETITIONS,
      );
    }
  }
  const byPrice = new Map(pool.map((entry) => [entry.agent_id, entry.cost_baseline]));
  return new Map(
    Array.from(observations, ([agent_id, tasks]) => [
      agent_id,
      {
        agent_id,
        task_class: TASK_CLASS,
        tasks,
        successful_tasks: Math.round(tasks * 0.95),
        success_trials: tasks,
        success_rate: 0.95,
        avg_quality: 0.9,
        avg_latency_seconds: 30,
        avg_price: byPrice.get(agent_id) ?? 0.5,
        uncertainty: uncertaintyFor(tasks),
        updated_at: 0,
      },
    ]),
  );
}

function candidateRanks(goal: string, profiles: Map<string, AgentProfile>) {
  const goalVector = embed(goal);
  const fourDimensional = rankAgents4D(
    pool.map((entry) => ({
      agent_id: entry.agent_id,
      similarity: cosine(goalVector, specialistVectors.get(entry.agent_id)!),
      reputation: {
        reliability: 0.5,
        quality: 0.5,
        safety: 1,
        speed: 0.5,
      },
      price: entry.cost_baseline,
      availability: 1,
      entry,
    })),
  ).map((ranked) => ({
    ...ranked.candidate.entry,
    similarity: ranked.candidate.similarity,
    capability_score: ranked.capability_score,
    rank_score: ranked.rank_score,
    availability_score: ranked.availability_score,
  }));

  return {
    semantic: fourDimensional,
    expert: profileWeightedRank(
      rankWithBundledDelegationHead(
        goal,
        fourDimensional.map((candidate) => ({
          ...candidate,
          routing_score: candidate.rank_score,
        })),
      ),
      profiles,
      { profileWeight: EXPERT_PROFILE_WEIGHT },
    ),
  };
}

interface Metrics {
  tasks: number;
  head_training_examples: number;
  head_learned_agents: number;
  head_training_source: string;
  semantic_acc1: number;
  expert_rank_acc1: number;
  acc1_delta: number;
  direct_routes: number;
  direct_coverage: number;
  direct_precision: number;
  direct_precision_lower_bound: number;
  false_directs: number;
  auction_gold_recall: number;
  policy_gold_path_recall: number;
  baseline_mean_non_floor_invites: number;
  expert_mean_non_floor_invites_per_auction: number;
  expert_mean_solicitations_per_task: number;
  solicitation_reduction: number;
  baseline_mean_total_invites: number;
  expert_mean_total_invites_per_task: number;
}

export function runDelegationBenchmark(): Metrics {
  const profiles = calibrationProfiles();
  let semanticCorrect = 0;
  let expertRankCorrect = 0;
  let directRoutes = 0;
  let correctDirects = 0;
  let falseDirects = 0;
  let auctioned = 0;
  let auctionGoldHits = 0;
  let policySuccesses = 0;
  let nonFloorSolicitations = 0;
  let totalInvites = 0;

  for (const task of HARD_TASKS) {
    const gold = new Set(task.gold_specialist_ids);
    const ranked = candidateRanks(task.goal, profiles);
    if (gold.has(ranked.semantic[0]?.agent_id)) semanticCorrect += 1;
    if (gold.has(ranked.expert[0]?.agent_id)) expertRankCorrect += 1;

    const candidates = ranked.expert.slice(0, LEGACY_NON_FLOOR_INVITES);
    const decision = decideRouteMode({
      enabled: false,
      expertEnabled: true,
      expertMinTasks: DEFAULT_EXPERT_MIN_TASKS,
      taskClass: TASK_CLASS,
      profiles,
      forceOpen: false,
      isFanout: false,
      revisionCount: 0,
      budget: 10,
      candidates,
      floorAgentIds: [],
      liquidityThreshold: 3,
    });

    if (decision.mode === "direct" && decision.direct_agent_id) {
      directRoutes += 1;
      const correct = gold.has(decision.direct_agent_id);
      correctDirects += correct ? 1 : 0;
      falseDirects += correct ? 0 : 1;
      policySuccesses += correct ? 1 : 0;
      // Direct mode sends no bid solicitations.
      continue;
    }

    auctioned += 1;
    const inviteCount = adaptiveInviteCount({
      enabled: true,
      candidates,
      profiles,
      minTasks: DEFAULT_EXPERT_MIN_TASKS,
    });
    const invitees = candidates.slice(0, inviteCount);
    const goldHit = invitees.some((candidate) => gold.has(candidate.agent_id));
    auctionGoldHits += goldHit ? 1 : 0;
    policySuccesses += goldHit ? 1 : 0;
    nonFloorSolicitations += invitees.length;
    totalInvites += invitees.length + FLOOR_INVITES;
  }

  const tasks = HARD_TASKS.length;
  const baselineSolicitations = tasks * LEGACY_NON_FLOOR_INVITES;
  const semanticAcc1 = semanticCorrect / tasks;
  const expertAcc1 = expertRankCorrect / tasks;
  const meanSolicitations = nonFloorSolicitations / tasks;
  return {
    tasks,
    head_training_examples: BUNDLED_DELEGATION_HEAD.training_examples,
    head_learned_agents: BUNDLED_DELEGATION_HEAD.learned_agents,
    head_training_source: BUNDLED_DELEGATION_HEAD.training_source,
    semantic_acc1: semanticAcc1,
    expert_rank_acc1: expertAcc1,
    acc1_delta: expertAcc1 - semanticAcc1,
    direct_routes: directRoutes,
    direct_coverage: directRoutes / tasks,
    direct_precision: directRoutes > 0 ? correctDirects / directRoutes : 0,
    direct_precision_lower_bound: wilsonLowerBound(correctDirects, directRoutes),
    false_directs: falseDirects,
    auction_gold_recall: auctioned > 0 ? auctionGoldHits / auctioned : 1,
    policy_gold_path_recall: policySuccesses / tasks,
    baseline_mean_non_floor_invites: LEGACY_NON_FLOOR_INVITES,
    expert_mean_non_floor_invites_per_auction:
      auctioned > 0 ? nonFloorSolicitations / auctioned : 0,
    expert_mean_solicitations_per_task: meanSolicitations,
    solicitation_reduction:
      1 - nonFloorSolicitations / baselineSolicitations,
    baseline_mean_total_invites:
      LEGACY_NON_FLOOR_INVITES + FLOOR_INVITES,
    expert_mean_total_invites_per_task: totalInvites / tasks,
  };
}

function main(): void {
  const metrics = runDelegationBenchmark();
  assert.equal(metrics.expert_rank_acc1, 1, "held-out expert rank must be 14/14");
  assert.ok(metrics.acc1_delta > 0, "outcome profiles must improve held-out acc@1");
  assert.equal(metrics.direct_precision, 1, "direct assignments must be gold");
  assert.equal(metrics.false_directs, 0, "no false direct assignments");
  assert.equal(metrics.auction_gold_recall, 1, "compressed auctions retain gold");
  assert.equal(
    metrics.policy_gold_path_recall,
    1,
    "every held-out task retains a gold path",
  );
  assert.ok(
    metrics.solicitation_reduction >= 0.3,
    "policy must cut non-floor solicitations by at least 30%",
  );
  console.log(JSON.stringify(metrics, null, 2));
}

main();
