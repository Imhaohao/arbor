import assert from "node:assert/strict";
import {
  NEUTRAL_REPUTATION,
  PRIOR_HALF_BAND,
  assignReputationPriors,
  encoderContribution,
  midrankPercentiles,
  percentileToReputation,
  type ReputationPriorInput,
} from "./reputation-prior-core";
import { ENCODER_HEAD_MODEL } from "./encoder-head-core";

// ─── midrankPercentiles ─────────────────────────────────────────────────────

assert.deepEqual(midrankPercentiles([]), []);
// One observation carries no ordering information, so it sits neutral.
assert.deepEqual(midrankPercentiles([7]), [0.5]);
assert.deepEqual(midrankPercentiles([10, 20, 30]), [0, 0.5, 1]);
// Input order does not matter, only the values.
assert.deepEqual(midrankPercentiles([30, 10, 20]), [1, 0, 0.5]);
// Ties share the average of the positions they span rather than being spread.
assert.deepEqual(midrankPercentiles([5, 5, 5]), [0.5, 0.5, 0.5]);
assert.deepEqual(midrankPercentiles([1, 2, 2, 3]), [0, 0.5, 0.5, 1]);

// ─── percentileToReputation ─────────────────────────────────────────────────

assert.equal(percentileToReputation(0.5), NEUTRAL_REPUTATION);
assert.equal(percentileToReputation(0), NEUTRAL_REPUTATION - PRIOR_HALF_BAND);
assert.equal(percentileToReputation(1), NEUTRAL_REPUTATION + PRIOR_HALF_BAND);
// Out-of-range percentiles clamp rather than escaping the band.
assert.equal(percentileToReputation(-3), NEUTRAL_REPUTATION - PRIOR_HALF_BAND);
assert.equal(percentileToReputation(9), NEUTRAL_REPUTATION + PRIOR_HALF_BAND);
// The band is the whole point: a prior can never reach what earned history can.
// convex/agents.ts clamps earned reputation to [0.05, 1.0].
assert.ok(percentileToReputation(1) < 1.0);
assert.ok(percentileToReputation(0) > 0.05);

// ─── assignReputationPriors ─────────────────────────────────────────────────

const noEvidence = { smoke: { runs: 0, passes: 0 }, probes: { attempts: 0, passes: 0 } };

function input(
  agent_id: string,
  over: Partial<ReputationPriorInput> = {},
): ReputationPriorInput {
  return {
    agent_id,
    settled_tasks: 0,
    current_reputation: 0.5,
    evidence: noEvidence,
    ...over,
  };
}

// Settled agents are left exactly alone — reputation_events is the authority
// there, and rewriting the base would desync it from the sum of its deltas.
{
  const [earned] = assignReputationPriors([
    input("veteran", { settled_tasks: 4, current_reputation: 0.83 }),
  ]);
  assert.equal(earned.source, "earned");
  assert.equal(earned.reputation, 0.83);
  assert.equal(earned.delta, 0);
  assert.equal(earned.percentile, undefined);
}

// Measured pass rates order the pool, best-measured highest.
{
  const results = assignReputationPriors([
    input("dead", { evidence: { smoke: { runs: 10, passes: 0 }, probes: { attempts: 10, passes: 0 } } }),
    input("live", { evidence: { smoke: { runs: 10, passes: 10 }, probes: { attempts: 10, passes: 10 } } }),
    input("mixed", { evidence: { smoke: { runs: 10, passes: 5 }, probes: { attempts: 10, passes: 5 } } }),
  ]);
  const by = new Map(results.map((r) => [r.agent_id, r]));
  assert.ok(by.get("live")!.reputation > by.get("mixed")!.reputation);
  assert.ok(by.get("mixed")!.reputation > by.get("dead")!.reputation);
  // Nothing is tied, so the encoder is not credited for any of it.
  for (const r of results) {
    assert.equal(r.source, "measured");
    assert.equal(r.encoder_broke_tie, false);
  }
  // Order is preserved regardless of how the input was shuffled.
  assert.equal(by.get("live")!.reputation, NEUTRAL_REPUTATION + PRIOR_HALF_BAND);
  assert.equal(by.get("dead")!.reputation, NEUTRAL_REPUTATION - PRIOR_HALF_BAND);
}

// The measured ordering is never overridden by the encoder. This is the
// property the model card demands: encoder+measured (0.9458 AUC) is WORSE than
// measured alone (0.9590), so the encoder may only act inside a tie.
{
  const strongVector = new Array(ENCODER_HEAD_MODEL.coef.length).fill(0);
  strongVector[0] = -5; // coef[0] is the large negative weight -> high logit
  const weakVector = new Array(ENCODER_HEAD_MODEL.coef.length).fill(0);
  weakVector[0] = 5;

  const results = assignReputationPriors([
    // Worse measured rate but a very promising descriptor.
    input("weak-measured-strong-encoder", {
      evidence: { smoke: { runs: 10, passes: 1 }, probes: { attempts: 10, passes: 1 } },
      encoder_vector: strongVector,
    }),
    // Better measured rate, unpromising descriptor.
    input("strong-measured-weak-encoder", {
      evidence: { smoke: { runs: 10, passes: 9 }, probes: { attempts: 10, passes: 9 } },
      encoder_vector: weakVector,
    }),
  ]);
  const by = new Map(results.map((r) => [r.agent_id, r]));
  assert.ok(
    by.get("strong-measured-weak-encoder")!.reputation >
      by.get("weak-measured-strong-encoder")!.reputation,
    "encoder must not reorder agents the measured head already separated",
  );
}

// Inside a measured tie the encoder decides, and gets the credit.
{
  const high = new Array(ENCODER_HEAD_MODEL.coef.length).fill(0);
  high[0] = -3;
  const low = new Array(ENCODER_HEAD_MODEL.coef.length).fill(0);
  low[0] = 3;
  const tiedEvidence = {
    smoke: { runs: 4, passes: 0 },
    probes: { attempts: 4, passes: 0 },
  };

  const results = assignReputationPriors([
    input("promising", { evidence: tiedEvidence, encoder_vector: high }),
    input("unpromising", { evidence: tiedEvidence, encoder_vector: low }),
  ]);
  const by = new Map(results.map((r) => [r.agent_id, r]));
  assert.equal(by.get("promising")!.measured_score, by.get("unpromising")!.measured_score);
  assert.ok(by.get("promising")!.reputation > by.get("unpromising")!.reputation);
  assert.equal(by.get("promising")!.source, "encoder");
  assert.equal(by.get("promising")!.encoder_broke_tie, true);
}

// A tie with no vectors to separate it stays a tie: both agents share one
// reputation and neither head is credited.
{
  const tiedEvidence = {
    smoke: { runs: 4, passes: 0 },
    probes: { attempts: 4, passes: 0 },
  };
  const results = assignReputationPriors([
    input("a", { evidence: tiedEvidence }),
    input("b", { evidence: tiedEvidence }),
  ]);
  assert.equal(results[0].reputation, results[1].reputation);
  assert.equal(results[0].source, "neutral");
  assert.equal(results[0].encoder_broke_tie, false);
}

// A vector of the wrong width is ignored rather than throwing mid-pool: the
// offline job can lag a model change, and one stale row must not fail a
// 1,200-agent pass.
{
  const results = assignReputationPriors([
    input("stale", { encoder_vector: [1, 2, 3] }),
    input("other"),
  ]);
  assert.equal(results.find((r) => r.agent_id === "stale")!.encoder_logit, undefined);
}

// Delta is reported against whatever the agent had before.
{
  const [only] = assignReputationPriors([input("solo", { current_reputation: 0.55 })]);
  assert.equal(only.percentile, 0.5);
  assert.equal(only.reputation, NEUTRAL_REPUTATION);
  assert.equal(only.delta, round6(NEUTRAL_REPUTATION - 0.55));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

// Output order matches input order, so callers can zip against their own list.
{
  const ids = ["z", "y", "x", "w"];
  const results = assignReputationPriors(ids.map((id) => input(id)));
  assert.deepEqual(results.map((r) => r.agent_id), ids);
}

// ─── encoderContribution ────────────────────────────────────────────────────

{
  const high = new Array(ENCODER_HEAD_MODEL.coef.length).fill(0);
  high[0] = -2;
  const low = new Array(ENCODER_HEAD_MODEL.coef.length).fill(0);
  low[0] = 2;
  const tiedEvidence = {
    smoke: { runs: 3, passes: 0 },
    probes: { attempts: 3, passes: 0 },
  };
  const results = assignReputationPriors([
    input("settled", { settled_tasks: 2, current_reputation: 0.9 }),
    input("t1", { evidence: tiedEvidence, encoder_vector: high }),
    input("t2", { evidence: tiedEvidence, encoder_vector: low }),
    input("clear", {
      evidence: { smoke: { runs: 3, passes: 3 }, probes: { attempts: 3, passes: 3 } },
    }),
  ]);
  const contribution = encoderContribution(results);
  // The settled agent is not part of the prior pool.
  assert.equal(contribution.pool, 3);
  assert.equal(contribution.tie_broken, 2);
  assert.equal(contribution.distinct_reputations, 3);
}

console.log("reputation-prior-core.test.ts: all assertions passed");
