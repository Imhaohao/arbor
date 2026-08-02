import assert from "node:assert/strict";
import {
  adaptiveInviteCount,
  allocateNodeBudget,
  buildRoutingQuery,
  decideRouteMode,
  estimateNodeDifficulty,
  explicitAgentMentions,
  nodeDepths,
  perNodeBudget,
  promoteExplicitAgentMentions,
  shouldFallbackOpen,
  wilsonLowerBound,
  type AllocatableNode,
  type RouteModeInput,
} from "./router-core";

// ─── perNodeBudget ─────────────────────────────────────────────────────────
// Even split rounded to cents.
assert.equal(perNodeBudget(10, 3), 3.33, "10 / 3 should round to 3.33");
assert.equal(perNodeBudget(100, 4), 25, "100 / 4 should be 25");
assert.equal(perNodeBudget(1, 3), 0.33, "1 / 3 should round to 0.33");
// Zero node count must not divide by zero (treated as 1).
assert.equal(perNodeBudget(50, 0), 50, "0 nodes should be treated as 1");

// ─── shouldFallbackOpen ──────────────────────────────────────────────────────
// Fewer than 2 candidates -> fallback open.
assert.equal(shouldFallbackOpen([]), true, "0 candidates -> fallback");
assert.equal(
  shouldFallbackOpen([{ similarity: 0.9 }]),
  true,
  "1 candidate -> fallback even if strong",
);
// >=2 candidates but best similarity below 0.15 -> fallback open.
assert.equal(
  shouldFallbackOpen([{ similarity: 0.14 }, { similarity: 0.1 }]),
  true,
  "best < 0.15 -> fallback",
);
// >=2 candidates with a strong-enough best match -> keep the shortlist.
assert.equal(
  shouldFallbackOpen([{ similarity: 0.15 }, { similarity: 0.05 }]),
  false,
  "best == 0.15 -> keep shortlist",
);
assert.equal(
  shouldFallbackOpen([{ similarity: 0.8 }, { similarity: 0.4 }]),
  false,
  "strong candidates -> keep shortlist",
);

// Explicit worker names override generic reputation/profile ordering.
{
  const candidates = [
    { agent_id: "marginalia", display_name: "Marginalia" },
    { agent_id: "hello-world-agent", display_name: "Hello World Agent" },
    { agent_id: "spatial-atlas", display_name: "Spatial Atlas" },
  ];
  assert.deepEqual(
    promoteExplicitAgentMentions(
      "Ask the Hello World external A2A specialist for a greeting.",
      candidates,
    ).map((candidate) => candidate.agent_id),
    ["hello-world-agent", "marginalia", "spatial-atlas"],
  );
  assert.deepEqual(
    promoteExplicitAgentMentions("Write a generic greeting.", candidates).map(
      (candidate) => candidate.agent_id,
    ),
    candidates.map((candidate) => candidate.agent_id),
  );
  assert.deepEqual(
    explicitAgentMentions(
      "Ask the Hello World external A2A specialist for a greeting.",
      candidates,
    ).map((candidate) => candidate.agent_id),
    ["hello-world-agent"],
  );
  assert.deepEqual(
    explicitAgentMentions("Write a generic greeting.", candidates),
    [],
  );
}

// ─── buildRoutingQuery ────────────────────────────────────────────────────────
// Includes description, success criteria, and up to 3 hints.
{
  const query = buildRoutingQuery(
    { description: "Summarize the PR diff", success_criteria: "Concise bullets" },
    ["hint one", "hint two", "hint three", "hint four (dropped)"],
  );
  assert.match(query, /Summarize the PR diff/, "must include description");
  assert.match(query, /Success criteria: Concise bullets/, "must include criteria");
  assert.match(query, /hint one/, "must include first hint");
  assert.match(query, /hint three/, "must include third hint");
  assert.doesNotMatch(query, /hint four/, "fourth hint must be dropped (max 3)");
}

// No success criteria -> no criteria line.
{
  const query = buildRoutingQuery({ description: "Just a task" }, []);
  assert.equal(query, "Just a task", "no criteria/hints -> description only");
}

// Clamped to <= 1500 chars.
{
  const huge = "x".repeat(5000);
  const query = buildRoutingQuery(
    { description: huge, success_criteria: huge },
    [huge, huge, huge],
  );
  assert.ok(query.length <= 1500, `routing query must be <= 1500 chars, got ${query.length}`);
}

// ─── nodeDepths ──────────────────────────────────────────────────────────────
{
  const mk = (
    node_id: string,
    depends_on: string[],
    extra?: Partial<AllocatableNode>,
  ): AllocatableNode => ({
    node_id,
    description: "task",
    depends_on,
    status: "pending",
    ...extra,
  });
  const depths = nodeDepths([
    mk("a", []),
    mk("b", ["a"]),
    mk("c", ["a", "b"]),
    mk("d", ["missing-dep"]),
  ]);
  assert.equal(depths.a, 0, "root depth 0");
  assert.equal(depths.b, 1, "child depth 1");
  assert.equal(depths.c, 2, "longest path wins (a->b->c)");
  assert.equal(depths.d, 0, "unknown deps ignored");

  // Cycles must not wedge the allocator.
  const cyclic = nodeDepths([mk("x", ["y"]), mk("y", ["x"])]);
  assert.ok(Number.isFinite(cyclic.x) && Number.isFinite(cyclic.y), "cycle guard");
}

// ─── estimateNodeDifficulty ──────────────────────────────────────────────────
{
  const base: AllocatableNode = {
    node_id: "n",
    description: "short",
    depends_on: [],
    status: "pending",
  };
  const reasoning = estimateNodeDifficulty(
    { ...base, task_class: "reasoning" },
    0,
    0,
  );
  const classification = estimateNodeDifficulty(
    { ...base, task_class: "classification" },
    0,
    0,
  );
  assert.ok(
    reasoning > classification,
    "reasoning must weigh more than classification",
  );
  const shallow = estimateNodeDifficulty(base, 0, 3);
  const deep = estimateNodeDifficulty(base, 3, 3);
  assert.ok(deep > shallow, "deeper nodes hold a budget reserve");
  const longSpec = estimateNodeDifficulty(
    { ...base, description: "x".repeat(2000) },
    0,
    0,
  );
  assert.ok(longSpec > shallow, "long specs raise difficulty");
}

// ─── allocateNodeBudget ──────────────────────────────────────────────────────
{
  const mk = (
    node_id: string,
    status: string,
    depends_on: string[] = [],
    task_class?: string,
    description = "do the thing",
  ): AllocatableNode => ({
    node_id,
    description,
    depends_on,
    status,
    task_class,
  });

  // Homogeneous fresh DAG -> roughly even split of the full budget.
  const even = allocateNodeBudget({
    dagBudget: 30,
    spent: 0,
    nodes: [mk("a", "auctioned"), mk("b", "pending"), mk("c", "pending")],
    nodeId: "a",
  });
  assert.ok(Math.abs(even - 10) < 0.02, `homogeneous ~even split, got ${even}`);

  // Spend is deducted: allocation works from remaining, not original.
  const afterSpend = allocateNodeBudget({
    dagBudget: 30,
    spent: 24,
    nodes: [mk("a", "complete"), mk("b", "complete"), mk("c", "auctioned")],
    nodeId: "c",
  });
  assert.ok(
    afterSpend <= 6 && afterSpend > 0,
    `last node gets what is left (<=6), got ${afterSpend}`,
  );

  // Exhausted budget -> 0 (floor agents still guarantee delivery).
  assert.equal(
    allocateNodeBudget({
      dagBudget: 10,
      spent: 12,
      nodes: [mk("a", "auctioned")],
      nodeId: "a",
    }),
    0,
    "overspent DAG allocates 0",
  );

  // Downstream reserve: an early node in a deep chain gets LESS than the even
  // split because deeper nodes hold reserve weight.
  const chain = [
    mk("a", "auctioned", []),
    mk("b", "pending", ["a"]),
    mk("c", "pending", ["b"]),
  ];
  const early = allocateNodeBudget({
    dagBudget: 30,
    spent: 0,
    nodes: chain,
    nodeId: "a",
  });
  assert.ok(early < 10, `early node reserves for downstream, got ${early}`);
  const late = allocateNodeBudget({
    dagBudget: 30,
    spent: 0,
    nodes: chain,
    nodeId: "c",
  });
  assert.ok(late > early, "deepest node holds the largest reserve");

  // Harder class gets the larger share at equal depth.
  const mixed = [
    mk("r", "auctioned", [], "reasoning"),
    mk("k", "pending", [], "classification"),
  ];
  const reasoningShare = allocateNodeBudget({
    dagBudget: 20,
    spent: 0,
    nodes: mixed,
    nodeId: "r",
  });
  assert.ok(reasoningShare > 10, `reasoning share > even, got ${reasoningShare}`);

  // Settled nodes leave the pool: their unspent allocation is redistributed.
  const redistributed = allocateNodeBudget({
    dagBudget: 30,
    spent: 5,
    nodes: [mk("a", "complete"), mk("b", "failed"), mk("c", "auctioned")],
    nodeId: "c",
  });
  assert.equal(redistributed, 25, "sole survivor gets the full remainder");

  // Never exceeds remaining budget.
  assert.ok(
    allocateNodeBudget({
      dagBudget: 5,
      spent: 4.5,
      nodes: [mk("a", "auctioned")],
      nodeId: "a",
    }) <= 0.5,
    "allocation capped at remaining",
  );
}

// ─── decideRouteMode (orchestrator-first direct assignment) ─────────────────
{
  const ready = (id: string, cost?: number) => ({
    agent_id: id,
    availability_score: 1.0,
    cost_baseline: cost,
  });
  const base: RouteModeInput = {
    enabled: true,
    forceOpen: false,
    isFanout: false,
    revisionCount: 0,
    budget: 20,
    candidates: [ready("alpha", 4), ready("beta", 6)],
    floorAgentIds: ["arbor-hive-backstop"],
    liquidityThreshold: 3,
  };

  // Disabled -> auction, always.
  assert.equal(
    decideRouteMode({ ...base, enabled: false }).mode,
    "auction",
    "disabled -> auction",
  );

  // Special paths stay on the auction machinery.
  assert.equal(
    decideRouteMode({ ...base, forceOpen: true }).reason,
    "force_open_retry",
    "force_open -> auction",
  );
  assert.equal(
    decideRouteMode({ ...base, isFanout: true }).reason,
    "best_of_n_fanout",
    "fanout -> auction",
  );
  assert.equal(
    decideRouteMode({ ...base, revisionCount: 1 }).reason,
    "consensus_revision",
    "revision -> auction",
  );
  assert.equal(
    decideRouteMode({ ...base, budget: 0 }).reason,
    "budget_exhausted",
    "no budget -> auction",
  );

  // Liquid market (>= threshold independent ready) -> real auction.
  const liquid = decideRouteMode({
    ...base,
    candidates: [ready("a"), ready("b"), ready("c")],
  });
  assert.equal(liquid.mode, "auction", "3 ready >= threshold 3 -> auction");
  assert.equal(liquid.independent_ready_count, 3);

  // Floors and non-ready candidates count toward NEITHER liquidity NOR target.
  const floorsAndMocks = decideRouteMode({
    ...base,
    candidates: [
      { agent_id: "arbor-hive-backstop", availability_score: 1.0 },
      { agent_id: "mocky", availability_score: 0.3 },
      { agent_id: "downy", availability_score: 0.1 },
    ],
  });
  assert.equal(floorsAndMocks.mode, "auction", "no independent ready -> auction");
  assert.equal(floorsAndMocks.reason, "no_ready_direct_target");
  assert.equal(floorsAndMocks.independent_ready_count, 0);

  // Thin market -> direct to the TOP-RANKED ready candidate.
  const direct = decideRouteMode(base);
  assert.equal(direct.mode, "direct", "2 ready < threshold 3 -> direct");
  assert.equal(direct.direct_agent_id, "alpha", "top-ranked ready wins");
  assert.equal(direct.direct_price, 4, "prices at cost_baseline");

  // A non-ready top candidate is skipped in favor of the next ready one.
  const skipTop = decideRouteMode({
    ...base,
    candidates: [
      { agent_id: "best-but-down", availability_score: 0.1 },
      ready("beta", 6),
    ],
  });
  assert.equal(skipTop.direct_agent_id, "beta", "skips non-ready top candidate");

  // Observed flywheel price beats cost_baseline.
  const priced = decideRouteMode({
    ...base,
    profilePrices: new Map([["alpha", 2.5]]),
  });
  assert.equal(priced.direct_price, 2.5, "profile price wins over baseline");

  // Price is clamped to the node budget.
  const clamped = decideRouteMode({
    ...base,
    budget: 3,
    profilePrices: new Map([["alpha", 9.99]]),
  });
  assert.equal(clamped.direct_price, 3, "price clamped to budget");

  // No price signal at all -> the node ceiling.
  const ceiling = decideRouteMode({
    ...base,
    candidates: [{ agent_id: "alpha", availability_score: 1.0 }],
  });
  assert.equal(ceiling.direct_price, 20, "no signal -> node ceiling");
}

// ─── expert delegation ─────────────────────────────────────────────────────
{
  const candidate = (
    id: string,
    routingScore: number,
    similarity = 0.8,
  ) => ({
    agent_id: id,
    availability_score: 1,
    similarity,
    capability_score: similarity,
    routing_score: routingScore,
    cost_baseline: 4,
  });
  const proven = (overrides: Record<string, number | string> = {}) => ({
    task_class: "reasoning",
    tasks: 12,
    successful_tasks: 11,
    success_trials: 12,
    success_rate: 0.92,
    avg_quality: 0.84,
    ...overrides,
  });
  const base: RouteModeInput = {
    enabled: false,
    expertEnabled: true,
    expertMinTasks: 8,
    taskClass: "reasoning",
    forceOpen: false,
    isFanout: false,
    revisionCount: 0,
    budget: 10,
    candidates: [candidate("expert", 0.9), candidate("runner", 0.72)],
    floorAgentIds: [],
    liquidityThreshold: 3,
    profiles: new Map([["expert", proven()]]),
  };

  const direct = decideRouteMode(base);
  assert.equal(direct.mode, "direct", "proven expert with a clear margin routes direct");
  assert.equal(direct.reason, "expert_match", "expert reason is stable-cardinality");
  assert.equal(direct.direct_agent_id, "expert");
  assert.equal(direct.direct_price, 4);
  assert.ok(
    (direct.expert_success_lower_bound ?? 0) >= 0.6,
    "decision exposes conservative success evidence",
  );

  assert.equal(
    decideRouteMode({
      ...base,
      candidates: [candidate("expert", 0.79), candidate("runner", 0.72)],
    }).mode,
    "auction",
    "narrow score margin abstains",
  );
  assert.equal(
    decideRouteMode({
      ...base,
      candidates: [candidate("expert", 0.9, 0.14), candidate("runner", 0.72)],
    }).mode,
    "auction",
    "weak semantic fit cannot bypass open-auction safety",
  );
  assert.equal(
    decideRouteMode({ ...base, candidates: [candidate("expert", 0.9)] }).mode,
    "auction",
    "one candidate has no comparative confidence",
  );
  assert.equal(
    decideRouteMode({
      ...base,
      profiles: new Map([["expert", proven({ task_class: "general" })]]),
    }).mode,
    "auction",
    "general history is a ranking prior, not exact expertise evidence",
  );
  assert.equal(
    decideRouteMode({
      ...base,
      profiles: new Map([
        ["expert", proven({ tasks: 7, successful_tasks: 7, success_trials: 7 })],
      ]),
    }).mode,
    "auction",
    "insufficient evidence abstains",
  );
  assert.equal(
    decideRouteMode({
      ...base,
      profiles: new Map([
        ["expert", proven({ successful_tasks: 0, success_trials: 0 })],
      ]),
    }).mode,
    "auction",
    "legacy EWMA history without exact counts cannot authorize direct routing",
  );
  assert.equal(
    decideRouteMode({
      ...base,
      profiles: new Map([["expert", proven({ avg_quality: 0.4 })]]),
    }).mode,
    "auction",
    "low-quality history abstains",
  );
  assert.equal(
    decideRouteMode({
      ...base,
      profiles: new Map([["expert", proven({ success_rate: Number.NaN })]]),
    }).mode,
    "auction",
    "non-finite profile signals fail closed",
  );

  for (const guarded of [
    { forceOpen: true },
    { isFanout: true },
    { revisionCount: 1 },
    { budget: 0 },
    { budget: Number.NaN },
  ]) {
    assert.equal(
      decideRouteMode({ ...base, ...guarded }).mode,
      "auction",
      "safety paths beat expert routing",
    );
  }
}

// ─── confidence-aware auction size ─────────────────────────────────────────
{
  const inviteCandidate = (agent_id: string, availability_score = 1) => ({
    agent_id,
    availability_score,
    similarity: 0.7,
  });
  const provenProfile = (overrides: Record<string, number> = {}) => ({
    tasks: 12,
    successful_tasks: 10,
    success_trials: 12,
    success_rate: 0.83,
    avg_quality: 0.8,
    ...overrides,
  });
  const candidates = [
    inviteCandidate("a"),
    inviteCandidate("b"),
    inviteCandidate("c"),
    inviteCandidate("d"),
    inviteCandidate("e"),
    inviteCandidate("f"),
  ];

  assert.equal(
    adaptiveInviteCount({ enabled: false, candidates, minTasks: 8 }),
    6,
    "disabled policy retains the full shortlist",
  );
  assert.equal(
    adaptiveInviteCount({
      enabled: true,
      candidates,
      profiles: new Map([["a", provenProfile()]]),
      minTasks: 8,
    }),
    6,
    "one proven agent is not a competitive auction",
  );
  assert.equal(
    adaptiveInviteCount({
      enabled: true,
      candidates,
      profiles: new Map([
        ["a", provenProfile()],
        ["b", provenProfile()],
      ]),
      minTasks: 8,
    }),
    3,
    "two proven top-three agents compress the auction to three",
  );
  assert.equal(
    adaptiveInviteCount({
      enabled: true,
      candidates: [
        inviteCandidate("a"),
        inviteCandidate("a"),
        inviteCandidate("b"),
        inviteCandidate("c"),
        inviteCandidate("d"),
        inviteCandidate("e"),
      ],
      profiles: new Map([["a", provenProfile()]]),
      minTasks: 8,
    }),
    5,
    "duplicate ids never masquerade as independent proven agents",
  );
  assert.equal(
    adaptiveInviteCount({
      enabled: true,
      candidates: [
        inviteCandidate("a", 0.1),
        inviteCandidate("b"),
        inviteCandidate("c"),
        inviteCandidate("d"),
      ],
      profiles: new Map([
        ["a", provenProfile()],
        ["b", provenProfile()],
      ]),
      minTasks: 8,
    }),
    4,
    "unavailable history cannot justify pruning",
  );
}

assert.ok(wilsonLowerBound(11, 12) > 0.6, "strong evidence clears the lower bound");
assert.ok(wilsonLowerBound(3, 5) < 0.5, "weak evidence remains uncertain");

console.log("router-core tests passed");
