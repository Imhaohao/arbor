import assert from "node:assert/strict";
import {
  abmctsDecision,
  bestOfNEnabled,
  fanoutDeadlineSeconds,
  nextGeneration,
  plannedFanoutWidth,
  promptHash,
  scoreCandidate,
  selectBestCandidate,
  shouldSynthesize,
  pairCandidateArchive,
  resolveWinnerPair,
  ucbScore,
  type CandidateRecord,
  type SearchBranch,
} from "./candidate-search-core";

function contender(
  index: number,
  score: number | undefined,
  output: string,
  extra: Partial<CandidateRecord> = {},
): CandidateRecord {
  return {
    candidate_index: index,
    agent_id: `agent-${index}`,
    output_text: output,
    calibrated_score: score,
    confidence: 0.6,
    cost_paid: 1,
    status: "contender",
    ...extra,
  };
}

// ─── master switch ───────────────────────────────────────────────────────────

{
  const prevOn = process.env.ARBOR_HIVE_BESTOFN_ENABLED;
  const prevOff = process.env.ARBOR_HIVE_BESTOFN_DISABLED;

  delete process.env.ARBOR_HIVE_BESTOFN_ENABLED;
  delete process.env.ARBOR_HIVE_BESTOFN_DISABLED;
  assert.equal(bestOfNEnabled(), false, "default is off");

  process.env.ARBOR_HIVE_BESTOFN_ENABLED = "true";
  assert.equal(bestOfNEnabled(), true, "explicit true enables");

  process.env.ARBOR_HIVE_BESTOFN_ENABLED = "on";
  assert.equal(bestOfNEnabled(), true, "'on' enables");

  process.env.ARBOR_HIVE_BESTOFN_DISABLED = "1";
  assert.equal(bestOfNEnabled(), false, "kill switch wins over enable");

  if (prevOn === undefined) delete process.env.ARBOR_HIVE_BESTOFN_ENABLED;
  else process.env.ARBOR_HIVE_BESTOFN_ENABLED = prevOn;
  if (prevOff === undefined) delete process.env.ARBOR_HIVE_BESTOFN_DISABLED;
  else process.env.ARBOR_HIVE_BESTOFN_DISABLED = prevOff;
}

// ─── fan-out width ───────────────────────────────────────────────────────────

{
  // Disabled → always width 1, full budget to the single candidate.
  const r = plannedFanoutWidth({
    enabled: false,
    taskClass: "reasoning",
    nodeBudget: 100,
  });
  assert.equal(r.width, 1, "disabled → single");
  assert.equal(r.qualifies, false);
  assert.equal(r.perCandidateBudget, 100, "single candidate keeps full budget");
}

{
  // Non-qualifying class → width 1 even when enabled + budget rich.
  const r = plannedFanoutWidth({
    enabled: true,
    taskClass: "classification",
    nodeBudget: 100,
    perCandidateFloor: 1,
  });
  assert.equal(r.width, 1, "classification does not fan out");
  assert.equal(r.qualifies, false);
}

{
  // Qualifying class, rich budget → fan out to maxWidth, budget split.
  const r = plannedFanoutWidth({
    enabled: true,
    taskClass: "reasoning",
    nodeBudget: 90,
    perCandidateFloor: 10,
    maxWidth: 3,
  });
  assert.equal(r.width, 3, "rich budget fans out to maxWidth");
  assert.equal(r.qualifies, true);
  assert.equal(r.perCandidateBudget, 30, "node budget split across candidates");
  assert.ok(
    r.perCandidateBudget * r.width <= 90 + 1e-9,
    "candidates together stay within node budget (no K× overspend)",
  );
}

{
  // Budget too thin for 2 candidates → collapse to single.
  const r = plannedFanoutWidth({
    enabled: true,
    taskClass: "reasoning",
    nodeBudget: 15,
    perCandidateFloor: 10,
  });
  assert.equal(r.width, 1, "budget < 2× floor → single");
  assert.equal(r.qualifies, false);
}

{
  // forceQualifies overrides class (e.g. a code node the classifier missed).
  const r = plannedFanoutWidth({
    enabled: true,
    taskClass: "extraction",
    nodeBudget: 40,
    perCandidateFloor: 10,
    forceQualifies: true,
    maxWidth: 2,
  });
  assert.equal(r.qualifies, true, "forceQualifies overrides class gate");
  assert.equal(r.width, 2);
}

// ─── deadline tunable ────────────────────────────────────────────────────────

{
  const prev = process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS;

  delete process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS;
  assert.equal(fanoutDeadlineSeconds(), 600, "default deadline is 600s");

  process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS = "120";
  assert.equal(fanoutDeadlineSeconds(), 120, "explicit value passes through");

  process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS = "5";
  assert.equal(fanoutDeadlineSeconds(), 60, "clamped to 60s floor");

  process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS = "99999";
  assert.equal(fanoutDeadlineSeconds(), 3600, "clamped to 3600s ceiling");

  process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS = "garbage";
  assert.equal(fanoutDeadlineSeconds(), 600, "invalid value falls back to default");

  if (prev === undefined) delete process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS;
  else process.env.ARBOR_HIVE_BESTOFN_DEADLINE_SECONDS = prev;
}

// ─── scoreCandidate ──────────────────────────────────────────────────────────

{
  const empty = scoreCandidate({ outputText: "   ", qualityScore: 0.9 });
  assert.equal(empty.calibrated_score, undefined, "no output → unselectable");
  assert.equal(empty.confidence, 0);
}

{
  const scalar = scoreCandidate({ outputText: "hello", qualityScore: 0.8 });
  assert.equal(scalar.calibrated_score, 0.8, "scalar score passes through clamped");
  assert.ok(scalar.confidence > 0 && scalar.confidence < 1);
}

{
  const vec = scoreCandidate({
    outputText: "answer",
    quality: { correctness: 0.9, completeness: 0.85, safety: 1 },
    judgeReliability: 0.8,
  });
  assert.ok(
    typeof vec.calibrated_score === "number" && vec.calibrated_score > 0,
    "quality vector produces a calibrated score",
  );
  assert.ok(vec.confidence > 0.3, "vector carries more confidence than a scalar");
}

{
  const unjudged = scoreCandidate({ outputText: "some output" });
  assert.equal(unjudged.calibrated_score, 0.5, "unjudged output usable as last resort");
  assert.ok(unjudged.confidence <= 0.2, "but at low confidence");
}

// ─── selection ───────────────────────────────────────────────────────────────

{
  const sel = selectBestCandidate([
    contender(0, 0.6, "aaa"),
    contender(1, 0.9, "bbb"),
    contender(2, 0.7, "ccc"),
  ]);
  assert.equal(sel.winner?.candidate_index, 1, "highest score wins");
  assert.equal(sel.ranked.length, 3);
  assert.ok(Math.abs(sel.margin - 0.2) < 1e-9, "margin is top minus runner-up");
}

{
  // No selectable candidate (all empty / unscored) → winner null so the caller
  // fails the node and the W6 floor can take over.
  const sel = selectBestCandidate([
    contender(0, undefined, ""),
    contender(1, undefined, ""),
  ]);
  assert.equal(sel.winner, null, "nothing selectable → null winner");
  assert.equal(sel.synthesize, false);
}

{
  // Deterministic tie-break: equal score → higher confidence wins.
  const sel = selectBestCandidate([
    contender(0, 0.8, "xxx", { confidence: 0.4 }),
    contender(1, 0.8, "yyy", { confidence: 0.9 }),
  ]);
  assert.equal(sel.winner?.candidate_index, 1, "tie broken by confidence");
}

{
  // Equal score + equal confidence → lower cost wins.
  const sel = selectBestCandidate([
    contender(0, 0.8, "xxx", { confidence: 0.5, cost_paid: 9 }),
    contender(1, 0.8, "yyy", { confidence: 0.5, cost_paid: 2 }),
  ]);
  assert.equal(sel.winner?.candidate_index, 1, "tie broken by lower cost");
}

{
  // Selection is order-independent (stable hash final tie-break).
  const a = contender(0, 0.8, "alpha", { confidence: 0.5, cost_paid: 1 });
  const b = contender(1, 0.8, "beta", { confidence: 0.5, cost_paid: 1 });
  const s1 = selectBestCandidate([a, b]);
  const s2 = selectBestCandidate([b, a]);
  assert.equal(
    s1.winner?.output_text,
    s2.winner?.output_text,
    "same winner regardless of arrival order",
  );
}

// ─── winner row resolution ───────────────────────────────────────────────────

{
  type Row = {
    _id: string;
    candidate_index: number;
    task_id?: string;
    agent_id?: string;
    output_text?: string;
  };
  const rows: Row[] = [
    {
      _id: "a",
      candidate_index: 0,
      task_id: "task-a",
      agent_id: "agent-0",
      output_text: "aaa",
    },
    {
      _id: "b",
      candidate_index: 1,
      task_id: "task-b",
      agent_id: "agent-1",
      output_text: "bbb",
    },
  ];
  const pairs = pairCandidateArchive(rows, (r) =>
    contender(r.candidate_index, r.candidate_index === 1 ? 0.9 : 0.6, r.output_text ?? "", {
      agent_id: r.agent_id ?? `agent-${r.candidate_index}`,
      task_id: r.task_id,
    }),
  );
  const selection = selectBestCandidate(pairs.map((p) => p.record));
  const resolved = resolveWinnerPair(pairs, selection.winner!, {
    taskIdOf: (r) => r.task_id,
  });
  assert.equal(resolved?.row._id, "b", "winner maps back to archive row");
}

{
  type Row = {
    _id: string;
    candidate_index: number;
    task_id?: string;
    agent_id?: string;
    output_text?: string;
  };
  const rows: Row[] = [
    {
      _id: "dup-a",
      candidate_index: 0,
      task_id: "task-a",
      agent_id: "agent-a",
      output_text: "first",
    },
    {
      _id: "dup-b",
      candidate_index: 0,
      task_id: "task-b",
      agent_id: "agent-b",
      output_text: "second",
    },
  ];
  const pairs = pairCandidateArchive(rows, (r) =>
    contender(0, 0.8, r.output_text ?? "", {
      agent_id: r.agent_id ?? "unknown",
      task_id: r.task_id,
    }),
  );
  const winner = pairs[1].record;
  const resolved = resolveWinnerPair(pairs, winner, {
    taskIdOf: (r) => r.task_id,
  });
  assert.equal(resolved?.row._id, "dup-b", "duplicate index disambiguated by task_id");
}

{
  type Row = {
    _id: string;
    candidate_index: number;
    task_id?: string;
    agent_id?: string;
    output_text?: string;
  };
  const rows: Row[] = [
    {
      _id: "dup-a",
      candidate_index: 0,
      task_id: "task-a",
      agent_id: "agent-a",
      output_text: "first",
    },
    {
      _id: "dup-b",
      candidate_index: 0,
      task_id: "task-b",
      agent_id: "agent-b",
      output_text: "second",
    },
  ];
  const pairs = pairCandidateArchive(rows, (r) =>
    contender(99, 0.8, r.output_text ?? "", {
      agent_id: r.agent_id ?? "unknown",
      task_id: r.task_id,
    }),
  );
  const winner = pairs[1].record;
  const resolved = resolveWinnerPair(pairs, winner, {
    taskIdOf: (r) => r.task_id,
  });
  assert.equal(
    resolved?.row._id,
    "dup-b",
    "broken index repaired via task_id fallback",
  );
}

{
  type Row = {
    _id: string;
    candidate_index: number;
    task_id?: string;
    agent_id?: string;
    output_text?: string;
  };
  const rows: Row[] = [
    {
      _id: "dup-a",
      candidate_index: 0,
      task_id: "task-a",
      agent_id: "agent-a",
      output_text: "same",
    },
    {
      _id: "dup-b",
      candidate_index: 0,
      task_id: "task-b",
      agent_id: "agent-a",
      output_text: "same",
    },
  ];
  const pairs = pairCandidateArchive(rows, (r) =>
    contender(99, 0.8, r.output_text ?? "", {
      agent_id: r.agent_id ?? "unknown",
    }),
  );
  const unresolved = resolveWinnerPair(pairs, pairs[0].record, {
    taskIdOf: (r) => r.task_id,
  });
  assert.equal(
    unresolved,
    undefined,
    "broken index with duplicate content and no task_id stays unresolved",
  );
}

// ─── synthesis eligibility ───────────────────────────────────────────────────

{
  // Close scores + distinct outputs → synthesize.
  assert.equal(
    shouldSynthesize([contender(0, 0.82, "one"), contender(1, 0.8, "two")]),
    true,
    "close & complementary → synthesize",
  );
  // Clear winner → just promote.
  assert.equal(
    shouldSynthesize([contender(0, 0.95, "one"), contender(1, 0.5, "two")]),
    false,
    "runaway margin → no synthesis",
  );
  // Close but identical outputs → nothing to merge.
  assert.equal(
    shouldSynthesize([contender(0, 0.8, "same"), contender(1, 0.8, "same")]),
    false,
    "duplicate outputs → no synthesis",
  );
  assert.equal(shouldSynthesize([contender(0, 0.8, "solo")]), false, "single → no synthesis");
}

// ─── AB-MCTS-lite ────────────────────────────────────────────────────────────

function branch(id: string, over: Partial<SearchBranch> = {}): SearchBranch {
  return { id, visits: 1, depth: 0, ...over };
}

{
  // Hard budget: out of model calls → stop.
  const d = abmctsDecision([branch("a", { score: 0.5 })], {
    maxDepth: 3,
    maxWidth: 4,
    maxModelCalls: 5,
    modelCallsUsed: 5,
    remainingBudget: 100,
  });
  assert.equal(d.action, "stop", "model-call cap forces stop");
}

{
  // Good enough → stop and point at the winning branch.
  const d = abmctsDecision([branch("a", { score: 0.95 })], {
    maxDepth: 3,
    maxWidth: 4,
    maxModelCalls: 10,
    modelCallsUsed: 1,
    remainingBudget: 100,
    scoreThreshold: 0.9,
  });
  assert.equal(d.action, "stop");
  assert.equal(d.targetBranchId, "a", "stop names the good branch");
}

{
  // No evaluator signal yet, room to widen → best-of-N fallback (widen).
  const d = abmctsDecision([branch("a"), branch("b")], {
    maxDepth: 3,
    maxWidth: 4,
    maxModelCalls: 10,
    modelCallsUsed: 2,
    remainingBudget: 100,
  });
  assert.equal(d.action, "wider", "no signal + width budget → widen (best-of-N fallback)");
}

{
  // Uncertain, mediocre frontier with depth budget → go deeper on it.
  const d = abmctsDecision(
    [branch("a", { score: 0.6, uncertainty: 0.6, visits: 1, depth: 0 })],
    {
      maxDepth: 3,
      maxWidth: 1, // width capped so it must refine, not widen
      maxModelCalls: 10,
      modelCallsUsed: 2,
      remainingBudget: 100,
      scoreThreshold: 0.9,
    },
  );
  assert.equal(d.action, "deeper", "uncertain frontier → refine");
  assert.equal(d.targetBranchId, "a");
}

{
  // Confident but not good enough, width budget available → widen.
  const d = abmctsDecision(
    [branch("a", { score: 0.6, uncertainty: 0.1, visits: 3, depth: 3 })],
    {
      maxDepth: 3, // depth capped so it can't refine
      maxWidth: 4,
      maxModelCalls: 10,
      modelCallsUsed: 2,
      remainingBudget: 100,
      scoreThreshold: 0.9,
    },
  );
  assert.equal(d.action, "wider", "confident-but-weak frontier at depth cap → widen");
}

{
  // Both caps reached → stop.
  const d = abmctsDecision(
    [branch("a", { score: 0.6, uncertainty: 0.1, visits: 3, depth: 3 })],
    {
      maxDepth: 3,
      maxWidth: 1,
      maxModelCalls: 10,
      modelCallsUsed: 2,
      remainingBudget: 100,
      scoreThreshold: 0.9,
    },
  );
  assert.equal(d.action, "stop", "depth+width caps → stop");
}

{
  // ucbScore prefers the less-visited / more-uncertain branch, all else equal.
  const explored = branch("a", { score: 0.7, uncertainty: 0.1, visits: 10 });
  const fresh = branch("b", { score: 0.7, uncertainty: 0.6, visits: 1 });
  assert.ok(
    ucbScore(fresh, 11) > ucbScore(explored, 11),
    "UCB explores the uncertain, less-visited branch",
  );
}

// ─── lineage helpers ─────────────────────────────────────────────────────────

{
  assert.equal(nextGeneration(undefined), 1, "root child is generation 1");
  assert.equal(nextGeneration({ generation: 4 }), 5);
  assert.equal(promptHash("abc"), promptHash("abc"), "prompt hash is stable");
  assert.notEqual(promptHash("abc"), promptHash("abd"), "distinct prompts differ");
}

console.log("candidate-search-core.test.ts: all assertions passed");
