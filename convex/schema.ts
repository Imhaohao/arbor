import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    capabilities: v.array(v.string()),
    system_prompt: v.string(),
    cost_per_task_estimate: v.number(),
    reputation_score: v.number(),
    /**
     * Where reputation_score came from. "earned" means the event-sourced sum of
     * reputation_events deltas; the others are liveness PRIORS assigned by
     * reputation-prior-core.ts and confined to [0.30, 0.70]. Absent on rows
     * that predate the prior pass. Never treat a prior as a track record —
     * both heads behind it predict whether an agent answers, not how well.
     */
    reputation_source: v.optional(v.string()),
    reputation_prior_updated_at: v.optional(v.number()),
    total_tasks_completed: v.number(),
    total_disputes_lost: v.number(),
    agent_role: v.optional(v.string()),
  }).index("by_agent_id", ["agent_id"]),

  tasks: defineTable({
    posted_by: v.string(),
    task_type: v.string(),
    prompt: v.string(),
    output_schema: v.optional(v.any()),
    max_budget: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("planning"),
      v.literal("plan_review"),
      v.literal("bidding"),
      v.literal("awarded"),
      v.literal("requires_payment"),
      v.literal("executing"),
      v.literal("judging"),
      v.literal("synthesizing"),
      v.literal("complete"),
      v.literal("disputed"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    bid_window_seconds: v.number(),
    bid_window_closes_at: v.number(),
    winning_bid_id: v.optional(v.id("bids")),
    price_paid: v.optional(v.number()),
    payment_status: v.optional(v.string()),
    project_id: v.optional(v.string()),
    workflow_mode: v.optional(v.string()),
    // Per-task OpenRouter override: "openrouter" | "native". Unset → global
    // ARBOR_OPENROUTER_ENABLED switch decides. Mirrors workflow_mode.
    model_gateway: v.optional(v.string()),
    result: v.optional(v.any()),
    judge_verdict: v.optional(v.any()),
    /** Real measured execution spend (lib/llm-usage.ts pricing), written by
     * auctions.execute when the winner's runner makes model calls in-process.
     * Absent = not captured (external-infra agents); zero = free lane. The
     * value panel must never present headroom as savings when this is absent. */
    execution_cost_usd: v.optional(v.number()),
    execution_input_tokens: v.optional(v.number()),
    execution_output_tokens: v.optional(v.number()),
    execution_models: v.optional(v.array(v.string())),
    /**
     * If set, this task is a sub-step in a larger plan. The auction lifecycle
     * runs identically; on settle, control returns to the parent task to
     * advance to the next step or synthesize.
     */
    parent_task_id: v.optional(v.id("tasks")),
    step_index: v.optional(v.number()),
    product_context_profile_id: v.optional(v.id("product_context_profiles")),
    /**
     * Decomposition produced by the planner. Set on parent tasks only.
     * Each step describes a sub-prompt and an optional preferred specialist.
     */
    task_plan: v.optional(
      v.array(
        v.object({
          prompt: v.string(),
          rationale: v.string(),
          specialist_hint: v.optional(v.string()),
        }),
      ),
    ),
    invited_agent_ids: v.optional(v.array(v.string())),
    hive_dag_id: v.optional(v.id("hive_dags")),
    hive_node_id: v.optional(v.string()),
    // Sakana best-of-N (ARBOR_HIVE_BESTOFN_ENABLED): when a node fans out into
    // several candidate executions, each child task carries its candidate index.
    // Unset on the legacy single-winner path, so onNodeSettled behaves exactly
    // as before when best-of-N is off.
    hive_candidate_index: v.optional(v.number()),
    success_criteria: v.optional(v.string()),
  })
    .index("by_parent", ["parent_task_id"])
    .index("by_posted_by_and_parent_task_id", ["posted_by", "parent_task_id"]),

  product_context_profiles: defineTable({
    owner_id: v.string(),
    project_id: v.optional(v.string()),
    company_name: v.string(),
    product_url: v.optional(v.string()),
    github_repo_url: v.optional(v.string()),
    business_context: v.string(),
    repo_context: v.optional(v.string()),
    source_hints: v.array(v.string()),
    hyperspell_status: v.union(
      v.literal("not_configured"),
      v.literal("pending"),
      v.literal("seeded"),
      v.literal("failed"),
    ),
    hyperspell_error: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_owner", ["owner_id"]),

  task_contexts: defineTable({
    task_id: v.id("tasks"),
    version: v.string(),
    business: v.object({
      owner: v.string(),
      summary: v.string(),
      known_facts: v.array(v.string()),
      goals: v.array(v.string()),
      constraints: v.array(v.string()),
      open_questions: v.array(v.string()),
    }),
    repo: v.object({
      owner: v.string(),
      summary: v.string(),
      source_map: v.array(
        v.object({
          label: v.string(),
          path: v.string(),
          why: v.string(),
        }),
      ),
      retrieval_queries: v.array(v.string()),
      guardrails: v.array(v.string()),
    }),
    routing: v.object({
      owner: v.string(),
      execution_rule: v.string(),
      recommended_specialists: v.array(v.string()),
      context_contract: v.array(v.string()),
    }),
    prompt_addendum: v.string(),
    created_at: v.number(),
  }).index("by_task", ["task_id"]),

  task_intakes: defineTable({
    owner_id: v.string(),
    initial_prompt: v.string(),
    task_type: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("collecting"),
      v.literal("ready"),
      v.literal("posting"),
      v.literal("posted"),
      v.literal("failed"),
    ),
    final_prompt: v.optional(v.string()),
    posted_task_id: v.optional(v.id("tasks")),
    last_error: v.optional(v.string()),
    question_rounds: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_owner_id_and_status", ["owner_id", "status"])
    .index("by_posted_task_id", ["posted_task_id"]),

  task_intake_messages: defineTable({
    intake_id: v.id("task_intakes"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    kind: v.union(
      v.literal("initial_prompt"),
      v.literal("questions"),
      v.literal("answer"),
      v.literal("final_brief"),
      v.literal("error"),
    ),
    text: v.string(),
    questions: v.optional(v.array(v.string())),
    created_at: v.number(),
  }).index("by_intake_id", ["intake_id"]),

  bids: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    agent_role: v.optional(v.string()),
    bid_price: v.number(),
    capability_claim: v.string(),
    estimated_seconds: v.number(),
    score: v.number(),
    acceptance_rate: v.optional(v.number()),
    availability_score: v.optional(v.number()),
    /** Bidder's self-reported P(judge accepts), scored by Brier at settle. */
    confidence: v.optional(v.number()),
    /** Calibrated P(accept) used in the Vickrey score (see lib/bid-calibration.ts). */
    p_accept: v.optional(v.number()),
    effective_price: v.optional(v.number()),
    estimate_accuracy: v.optional(v.number()),
    execution_preview: v.optional(v.string()),
    expected_quality: v.optional(v.number()),
    historical_quality: v.optional(v.number()),
    latency_penalty: v.optional(v.number()),
    plan_source: v.optional(v.string()),              // "remote" | "llm" | "baseline"
    reputation_score: v.optional(v.number()),
    reputation_source: v.optional(v.string()),
    reliability_score: v.optional(v.number()),
    speed_score: v.optional(v.number()),
    task_class: v.optional(v.string()),
    task_class_history_count: v.optional(v.number()),
    task_fit_score: v.optional(v.number()),
    tool_availability: v.optional(v.any()),
    value_score: v.optional(v.number()),
  }).index("by_task", ["task_id"]),

  bid_probes: defineTable({
    task_id: v.id("tasks"),
    bid_id: v.optional(v.id("bids")),               // null when probe failed and no bid was inserted
    agent_id: v.string(),
    public_tier: v.string(), // "native-a2a" | "a2a-bridge" | "model-backed" | "not-a2a-yet"
    probe_status: v.union(
      v.literal("pass"),
      v.literal("fail"),
      v.literal("demo_lane"),
    ),
    duration_ms: v.number(),
    response_excerpt: v.optional(v.string()),         // first 300 chars of the agent's response
    error_message: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_task", ["task_id"])
    .index("by_bid", ["bid_id"])
    // Per-agent probe history is the measured half of the liveness signal
    // (probeSuccessScore). Without this index it costs a 30k-row scan, which
    // exceeds the per-function read limit as soon as anything else is read.
    .index("by_agent_id", ["agent_id"]),

  // ─── HMAC signing & replay protection (plan §H follow-ups) ──────────────
  // Per-agent shared secret. The secret is stored base64-encoded so that
  // operators can paste it as an env var without escaping. Revoked rows
  // are kept for audit; _getSecretForAgent ignores them.
  agent_keys: defineTable({
    agent_id: v.string(),
    secret_b64: v.string(),
    created_at: v.number(),
    revoked_at: v.optional(v.number()),
  }).index("by_agent_id", ["agent_id"]),

  // Outbound API keys for remote A2A specialists (the inverse of agent_keys,
  // which holds inbound HMAC secrets). One active row per agent_id; setting a
  // new key overwrites. `source` records how the key was obtained:
  // "user_paste" (console UI), "auto_acquired" (trial-key/signup script), or
  // "operator". header_name overrides the card's scheme header when set.
  a2a_outbound_keys: defineTable({
    agent_id: v.string(),
    api_key: v.string(),
    header_name: v.optional(v.string()),
    source: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_agent_id", ["agent_id"]),

  // Nonces seen on signed inbound callbacks. Each row is one accepted
  // request; replay attempts hit the by_nonce index and 403.
  a2a_nonces: defineTable({
    nonce: v.string(),
    agent_id: v.string(),
    created_at: v.number(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_created_at", ["created_at"]),

  escrow: defineTable({
    task_id: v.id("tasks"),
    buyer_id: v.string(),
    seller_id: v.string(),
    locked_amount: v.number(),
    agent_net_amount: v.optional(v.number()),
    platform_fee: v.optional(v.number()),
    payment_processor: v.optional(v.string()),
    payment_status: v.optional(v.string()),
    stripe_checkout_session_id: v.optional(v.string()),
    stripe_payment_intent_id: v.optional(v.string()),
    stripe_charge_id: v.optional(v.string()),
    stripe_connected_account_id: v.optional(v.string()),
    stripe_application_fee_amount: v.optional(v.number()),
    stripe_currency: v.optional(v.string()),
    payment_required_at: v.optional(v.number()),
    payment_authorized_at: v.optional(v.number()),
    payment_captured_at: v.optional(v.number()),
    payment_canceled_at: v.optional(v.number()),
    payment_last_error: v.optional(v.string()),
    status: v.union(
      v.literal("locked"),
      v.literal("released"),
      v.literal("refunded"),
    ),
  }).index("by_task", ["task_id"]),

  stripe_connected_accounts: defineTable({
    agent_id: v.string(),
    stripe_account_id: v.string(),
    email: v.optional(v.string()),
    onboarding_status: v.string(),
    charges_enabled: v.boolean(),
    payouts_enabled: v.boolean(),
    details_submitted: v.boolean(),
    requirements_currently_due: v.array(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_agent_id", ["agent_id"])
    .index("by_stripe_account_id", ["stripe_account_id"]),

  reputation_events: defineTable({
    agent_id: v.string(),
    task_id: v.id("tasks"),
    event_type: v.string(),
    delta: v.number(),
    reasoning: v.string(),
    new_score: v.number(),
  }).index("by_agent", ["agent_id"]),

  /**
   * Per-task multi-dimensional performance record. Each completed task
   * (accepted or rejected) gets one row per agent that did the work, so we
   * can show how the specialist performed across speed, estimate accuracy,
   * judge-graded quality, and value-per-dollar — not just a single rep score.
   */
  reputation_dimensions: defineTable({
    agent_id: v.string(),
    task_id: v.id("tasks"),
    /** Wall-clock seconds between execution_started and execution_complete. */
    actual_seconds: v.number(),
    /** What the agent quoted in their bid. */
    estimated_seconds: v.number(),
    /** 1.0 = on-time or faster, 0.0 = vastly slower than estimated. */
    speed_score: v.number(),
    /** 1.0 = perfect estimate, 0.0 = wildly off. Symmetric — over and under-estimating both penalize. */
    estimate_accuracy: v.number(),
    /** Judge's quality verdict, 0..1. */
    quality_score: v.number(),
    /** Quality per dollar paid, normalized 0..1. */
    value_score: v.number(),
    /** Bidder's self-reported P(judge accepts) from the winning bid. */
    confidence: v.optional(v.number()),
    /** Brier calibration of that self-report: 1 - (confidence - outcome)^2. */
    calibration_score: v.optional(v.number()),
    /** Capability cluster (hive task-class taxonomy) the task belonged to.
     * Ability is task-relative: incentive stats prefer same-class rows and
     * fall back to global history. Absent on legacy rows. */
    task_class: v.optional(v.string()),
    /** Weighted aggregate of the dimensions above. */
    overall: v.number(),
    /** Did the judge accept the result? */
    accepted: v.boolean(),
    bid_price: v.number(),
    price_paid: v.number(),
    created_at: v.number(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_agent_and_task_class", ["agent_id", "task_class"])
    .index("by_task", ["task_id"]),

  /**
   * FlyRoute-style capability profiles (W3): one row per (agent, task-class),
   * EWMA-updated from every settled hive node. `uncertainty` shrinks with
   * evidence and buys router exploration; the router blends profileScore into
   * the semantic shortlist order (lib/hive/profile-core.ts).
   */
  agent_profiles: defineTable({
    agent_id: v.string(),
    task_class: v.string(),
    /** Number of settled-node outcomes folded into this profile. */
    tasks: v.number(),
    /** Cumulative judge-accepted outcomes. Optional for pre-migration rows;
     * agentProfiles backfills an estimate until the next exact write. */
    successful_tasks: v.optional(v.number()),
    /** Exact trials backing successful_tasks. Legacy rows start at zero so
     * pre-migration EWMA history cannot authorize direct routing. */
    success_trials: v.optional(v.number()),
    /** EWMA of judge-accepted success, 0..1. */
    success_rate: v.number(),
    /** EWMA of judge quality_score, 0..1. */
    avg_quality: v.number(),
    /** EWMA of wall-clock seconds from child-task mint to settle. */
    avg_latency_seconds: v.number(),
    /** EWMA of price_paid on settled child tasks. */
    avg_price: v.number(),
    /** 1/sqrt(tasks+1) — exploration term, 1.0 at zero evidence. */
    uncertainty: v.number(),
    updated_at: v.number(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_agent_and_class", ["agent_id", "task_class"]),

  lifecycle_events: defineTable({
    task_id: v.id("tasks"),
    event_type: v.string(),
    payload: v.any(),
    timestamp: v.number(),
  }).index("by_task", ["task_id"]),

  agent_tool_calls: defineTable({
    task_id: v.id("tasks"),
    agent_id: v.string(),
    phase: v.string(),
    transport: v.string(),
    provider: v.string(),
    endpoint_host: v.optional(v.string()),
    method: v.string(),
    tool_name: v.optional(v.string()),
    call_id: v.optional(v.string()),
    arguments_redacted: v.optional(v.any()),
    status: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    started_at: v.number(),
    completed_at: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    error_message: v.optional(v.string()),
    result_preview: v.optional(v.string()),
    external_session_id: v.optional(v.string()),
    external_task_id: v.optional(v.string()),
    pr_url: v.optional(v.string()),
    pr_number: v.optional(v.number()),
    events_observed: v.optional(v.number()),
    artifact_present: v.optional(v.boolean()),
    artifact_hash: v.optional(v.string()),
    probe_id: v.optional(v.id("bid_probes")),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_task_id", ["task_id"])
    .index("by_agent_id", ["agent_id"])
    .index("by_status", ["status"])
    .index("by_external_session_id", ["external_session_id"])
    .index("by_task_id_and_status", ["task_id", "status"]),

  discovered_specialists: defineTable({
    agent_id: v.string(),
    display_name: v.string(),
    sponsor: v.string(),
    capabilities: v.array(v.string()),
    system_prompt: v.string(),
    cost_baseline: v.number(),
    starting_reputation: v.number(),
    one_liner: v.string(),
    tier: v.optional(
      v.union(
        v.literal("real"),
        v.literal("mcp-forwarding"),
        v.literal("a2a"),
        v.literal("a2a-bridge"),
        v.literal("openrouter"),
        v.literal("mock"),
        v.literal("disabled"),
      ),
    ),
    openrouter_model_id: v.optional(v.string()),
    openrouter_api_key_env: v.optional(v.string()),
    discovered_for: v.string(),
    created_at: v.number(),
    discovery_source: v.optional(
      v.union(
        v.literal("google"),
        v.literal("catalog"),
        v.literal("registry"),
        v.literal("synthesized"),
        v.literal("a2a"),
      ),
    ),
    mcp_endpoint: v.optional(v.string()),
    mcp_api_key_env: v.optional(v.string()),
    homepage_url: v.optional(v.string()),
    rationale: v.optional(v.string()),
    a2a_endpoint: v.optional(v.string()),
    a2a_agent_card_url: v.optional(v.string()),
    a2a_api_key_env: v.optional(v.string()),
    // "none" = skip card auth entirely (server verified not to enforce the
    // scheme its card declares). Absent/"card" = resolve auth from the card.
    a2a_auth_mode: v.optional(v.union(v.literal("none"), v.literal("card"))),
    // Latest A2A card JWS verification (trust signal, never a routing gate:
    // a valid signature attests card integrity/origin only, not capability,
    // and unsigned cards stay fully routable).
    card_signature: v.optional(
      v.object({
        status: v.union(
          v.literal("unsigned"),
          v.literal("valid"),
          v.literal("invalid"),
        ),
        kid: v.optional(v.string()),
        jwks_origin: v.optional(v.string()),
        checked_at: v.number(),
      }),
    ),
    owner_id: v.optional(v.string()),
    mcp_tool_schemas: v.optional(v.array(v.any())),
    avg_latency_ms: v.optional(v.number()),
    reliability_score: v.optional(v.number()),
    eval_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("passed"),
        v.literal("failed"),
      ),
    ),
    eval_report: v.optional(v.any()),
  }).index("by_agent_id", ["agent_id"]),

  /**
   * Per-call persistence for the A2A market gateway at /api/a2a/market.
   * Each message/send or tasks/send creates a row keyed by `run_id`. The
   * underlying protocol task lives in the `tasks` table; this table tracks
   * the A2A-level run state separately so `tasks/get` on the market route
   * can return the same artifact shape it returned at message/send time.
   */
  a2a_task_runs: defineTable({
    run_id: v.string(),
    agent_id: v.string(),
    intent: v.optional(v.string()),
    tool: v.optional(v.string()),
    state: v.union(
      v.literal("submitted"),
      v.literal("working"),
      v.literal("input-required"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("canceled"),
      v.literal("rejected"),
    ),
    prompt: v.string(),
    requester_agent_id: v.optional(v.string()),
    requester_did: v.optional(v.string()),
    protocol_version: v.optional(v.string()),
    sla: v.optional(v.any()),
    negotiated_format: v.optional(v.union(v.literal("json"), v.literal("toon"))),
    artifact: v.optional(v.any()),
    error_message: v.optional(v.string()),
    cancel_requested: v.optional(v.boolean()),
    execution_status: v.optional(v.string()),
    method: v.optional(v.string()),
    sandbox_disclosure: v.optional(v.string()),
    task_type: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_run_id", ["run_id"]),

  /**
   * Conversational negotiation memory for the A2A market gateway. The A2A
   * protocol never retransmits history, so the server keeps one row per turn
   * keyed by contextId; replies stay on-topic across message/send exchanges
   * from foreign agents. Read/written by convex/a2aNegotiations.ts.
   */
  a2a_negotiation_turns: defineTable({
    context_id: v.string(),
    role: v.union(v.literal("counterparty"), v.literal("agent")),
    text: v.string(),
    requester_agent_id: v.optional(v.string()),
    intent: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_context_id", ["context_id"]),

  // ─── Hive mind: Layer 1 registry embeddings ──────────────────────────────
  hive_agent_embeddings: defineTable({
    agent_id: v.string(),
    capability_text: v.string(),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
    eval_passed: v.boolean(),
    cost_baseline: v.number(),
    reputation_score: v.number(),
    updated_at: v.number(),
  })
    .index("by_agent_id", ["agent_id"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["eval_passed"],
    }),

  /**
   * Task-battery runs: one row per (golden task, agent) attempt.
   *
   * This is the artifact all four Agent System Trilemma metrics block on
   * (lib/hive/pareto-core.ts). The golden AUDIT lane posts one task through the
   * auction so only the WINNER is graded — deliberately, to keep calibration
   * honest — which means it can never produce a query x agent crossing. The
   * battery does the opposite: it fans one task out to many agents and grades
   * all of them, so a per-query quality DIFFERENTIAL becomes observable.
   *
   * Each row carries the bid (confidence, price) and the execution outcome
   * (graded accuracy, tokens, cost, latency) together, which is what lets one
   * harness feed all four metrics:
   *   marginal gain            — two agents, same golden_task_id, real costs
   *   accuracy-per-token       — accuracy_score against total_tokens
   *   padded AUCCC             — (cost_usd, accuracy_score) operating points
   *   beta tuning              — stated confidence against the graded outcome
   */
  battery_runs: defineTable({
    /** Groups one sweep so runs are comparable and re-runs do not blend. */
    battery_id: v.string(),
    golden_task_id: v.id("golden_tasks"),
    golden_id: v.string(),
    agent_id: v.string(),
    /** "declined" is an OUTCOME, not a failure — the incentive design makes
     * abstention rational, so dropping these rows would bias the corpus toward
     * agents that always answer. */
    status: v.union(
      v.literal("complete"),
      v.literal("declined"),
      v.literal("error"),
    ),
    /** Arm label, so a multi-agent DAG run and a single-agent pass over the
     * same task can be compared at matched token budgets. */
    arm: v.string(),
    /** Hive arm only: every member of the team, in execution order. agent_id
     * then carries a synthetic "hive:" id; this field is the real roster. */
    members: v.optional(v.array(v.string())),

    // ── bid leg ──
    bid_price: v.optional(v.number()),
    /** Self-reported P(accept). The label beta tuning needs and that
     * reputation_dimensions never receives in the organic flow. */
    confidence: v.optional(v.number()),
    estimated_seconds: v.optional(v.number()),

    // ── execution leg ──
    output_text: v.optional(v.string()),
    error_message: v.optional(v.string()),
    latency_ms: v.optional(v.number()),

    // ── graded outcome ──
    /** Reference-graded quality, 0..1. NOT a judge opinion — golden tasks
     * carry a known correct answer. */
    accuracy_score: v.optional(v.number()),
    audit_passed: v.optional(v.boolean()),
    substring_misses: v.optional(v.array(v.string())),
    grader_used: v.optional(v.boolean()),

    // ── trilemma telemetry ──
    /** Real measured spend for this run, from lib/llm-usage.ts pricing. Zero
     * is meaningful (a local or free agent); undefined means not captured. */
    cost_usd: v.optional(v.number()),
    input_tokens: v.optional(v.number()),
    output_tokens: v.optional(v.number()),
    total_tokens: v.optional(v.number()),
    models_used: v.optional(v.array(v.string())),

    created_at: v.number(),
  })
    .index("by_battery", ["battery_id"])
    .index("by_golden_task", ["golden_task_id"])
    .index("by_agent_id", ["agent_id"])
    .index("by_battery_and_task", ["battery_id", "golden_task_id"]),

  /**
   * Encoder-target-decoupling vectors (arXiv:2603.20895), one row per agent.
   *
   * Deliberately NOT bundled into lib/hive/encoder-head-model.json: cold start
   * is exactly the case of an agent that no bundle knows about yet, so the
   * vectors have to live where new agents can be added to them. Written by the
   * offline job in scripts/encode-agent-descriptors.py, read by the reputation
   * prior pass and by cold-start candidate ranking.
   *
   * `descriptor` is stored verbatim because buildAgentDescriptor() is a model
   * contract — if an agent's capabilities change, the stored vector is stale
   * and the descriptor is the only way to detect that without re-encoding.
   */
  agent_encoder_vectors: defineTable({
    agent_id: v.string(),
    /** 8-dim standardized PCA projection. Width must match model.coef. */
    vector: v.array(v.float64()),
    descriptor: v.string(),
    /** encoderColdStartLogit(vector) at write time — ranking value, not a
     * calibrated probability. See the caveat in encoder-head-core.ts. */
    logit: v.number(),
    encoder_model: v.string(),
    model_version: v.number(),
    updated_at: v.number(),
  }).index("by_agent_id", ["agent_id"]),

  // ─── Hive mind: Layer 2 task DAGs ────────────────────────────────────────
  hive_dags: defineTable({
    root_task_id: v.id("tasks"),
    goal: v.string(),
    status: v.union(
      v.literal("planning"),
      v.literal("running"),
      v.literal("evaluating"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("escalated"),
    ),
    planner_model: v.string(),
    max_budget: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_root_task", ["root_task_id"]),

  hive_nodes: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    description: v.string(),
    depends_on: v.array(v.string()),
    success_criteria: v.optional(v.string()),
    task_class: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("auctioned"),
      v.literal("executing"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    task_id: v.optional(v.id("tasks")),
    assigned_agent_id: v.optional(v.string()),
    output_text: v.optional(v.string()),
    eval_score: v.optional(v.number()),
    revision_count: v.optional(v.number()),
    // Cost telemetry (W2): per-node spend + budget data for the SeqRoute
    // budget allocator (see hiveData._dagSpend) and a future offline-RL
    // router. Populated in onNodeSettled from the child task row.
    cost_paid: v.optional(v.number()),
    bid_price: v.optional(v.number()),
    allocated_budget: v.optional(v.number()),
    settled_at: v.optional(v.number()),
    // Sakana best-of-N fan-out (ARBOR_HIVE_BESTOFN_ENABLED). expected_candidates
    // is the K this node fanned out into; onNodeSettled waits for K candidates to
    // settle (the barrier) before selecting a winner. promotion_claimed is the
    // atomic latch that guarantees exactly one settle delivery promotes a winner.
    // Both unset on the single-winner path (byte-for-byte unchanged when off).
    expected_candidates: v.optional(v.number()),
    promotion_claimed: v.optional(v.boolean()),
    updated_at: v.number(),
  })
    .index("by_dag", ["dag_id"])
    .index("by_dag_and_node_id", ["dag_id", "node_id"])
    .index("by_task_id", ["task_id"]),

  // Durable media exchanged between users, specialists, and downstream
  // providers. Provider URLs are never the system of record: uploaded or
  // imported bytes live in Convex Storage and storage_id resolves to a
  // short-lived download URL when an authorized participant asks for it.
  media_artifacts: defineTable({
    task_id: v.optional(v.id("tasks")),
    dag_id: v.optional(v.id("hive_dags")),
    node_id: v.optional(v.string()),
    created_by_agent_id: v.string(),
    source: v.union(
      v.literal("user_upload"),
      v.literal("agent_upload"),
      v.literal("provider_output"),
      v.literal("import"),
    ),
    media_kind: v.union(
      v.literal("video"),
      v.literal("audio"),
      v.literal("image"),
      v.literal("other"),
    ),
    status: v.union(
      v.literal("uploading"),
      v.literal("ready"),
      v.literal("processing"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    storage_id: v.optional(v.id("_storage")),
    file_name: v.string(),
    mime_type: v.string(),
    byte_size: v.optional(v.number()),
    sha256: v.optional(v.string()),
    duration_ms: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    codec: v.optional(v.string()),
    frame_rate: v.optional(v.number()),
    provider: v.optional(v.string()),
    external_artifact_id: v.optional(v.string()),
    error_message: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_task", ["task_id"])
    .index("by_dag", ["dag_id"])
    .index("by_dag_and_node", ["dag_id", "node_id"])
    .index("by_creator", ["created_by_agent_id"])
    .index("by_storage", ["storage_id"])
    .index("by_status", ["status"]),

  // Provider-neutral execution ledger. Routing can swap Higgsfield, Clueso,
  // or another provider while the orchestration and artifact handoff contract
  // remains stable. One row records one provider operation; larger fan-out is
  // represented by multiple rows instead of an unbounded artifact array.
  provider_jobs: defineTable({
    job_id: v.string(),
    task_id: v.optional(v.id("tasks")),
    dag_id: v.optional(v.id("hive_dags")),
    node_id: v.optional(v.string()),
    requested_by_agent_id: v.string(),
    provider: v.string(),
    operation: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("submitted"),
      v.literal("running"),
      v.literal("retry_wait"),
      v.literal("input_required"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    idempotency_key: v.string(),
    external_job_id: v.optional(v.string()),
    input_artifact_id: v.optional(v.id("media_artifacts")),
    output_artifact_id: v.optional(v.id("media_artifacts")),
    quoted_cost: v.optional(
      v.object({ amount: v.number(), currency: v.string() }),
    ),
    actual_cost: v.optional(
      v.object({ amount: v.number(), currency: v.string() }),
    ),
    progress: v.optional(v.number()),
    attempts: v.number(),
    max_attempts: v.number(),
    next_poll_at: v.optional(v.number()),
    error_code: v.optional(v.string()),
    error_retryable: v.optional(v.boolean()),
    error_message: v.optional(v.string()),
    provider_metadata: v.optional(v.any()),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_job_id", ["job_id"])
    .index("by_idempotency_key", ["idempotency_key"])
    .index("by_task", ["task_id"])
    .index("by_dag", ["dag_id"])
    .index("by_provider_and_external_job", ["provider", "external_job_id"])
    .index("by_status", ["status"]),

  // ─── Hive mind: Sakana best-of-N candidate archive ───────────────────────
  // One row per candidate execution of a node under best-of-N (the "orchestrator
  // branches"/"artifacts" of the Sakana report). The judge selects among the
  // contenders; the winner is promoted onto the node and the losers are kept as
  // a replayable archive + extra flywheel training signal.
  hive_node_candidates: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.string(),
    candidate_index: v.number(),
    task_id: v.optional(v.id("tasks")),
    agent_id: v.optional(v.string()),
    output_text: v.optional(v.string()),
    calibrated_score: v.optional(v.number()),
    confidence: v.optional(v.number()),
    cost_paid: v.optional(v.number()),
    quality: v.optional(v.any()),
    status: v.union(
      v.literal("contender"),
      v.literal("promoted"),
      v.literal("rejected"),
    ),
    generation: v.optional(v.number()),
    parent_candidate_id: v.optional(v.id("hive_node_candidates")),
    created_at: v.number(),
  })
    .index("by_dag", ["dag_id"])
    .index("by_dag_and_node", ["dag_id", "node_id"])
    .index("by_task_id", ["task_id"]),

  // ─── Hive mind: Sakana evolution archive (reversible artifacts) ──────────
  // Proposed/evaluated/promoted genomes for evolvable artifacts (prompt
  // templates, rubric weights, DAG priors, role specs, tool allowlists). Never
  // auto-promoted: promotion requires approved_by. Gated by
  // ARBOR_HIVE_EVOLUTION_ENABLED.
  evolution_genomes: defineTable({
    kind: v.union(
      v.literal("prompt_template"),
      v.literal("rubric_weights"),
      v.literal("dag_prior"),
      v.literal("role_spec"),
      v.literal("tool_allowlist"),
    ),
    genome_id: v.string(),
    content: v.string(),
    lineage_parent_ids: v.array(v.string()),
    generation: v.number(),
    op: v.optional(v.string()),
    behavior_descriptor: v.optional(v.string()),
    score: v.optional(v.number()),
    status: v.union(
      v.literal("proposed"),
      v.literal("evaluated"),
      v.literal("promoted"),
      v.literal("rejected"),
    ),
    harness_id: v.optional(v.string()),
    approved_by: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_kind", ["kind"])
    .index("by_kind_and_status", ["kind", "status"])
    .index("by_genome_id", ["genome_id"]),

  // ─── Hive mind: Layer 4 agentic blackboard ──────────────────────────────
  scratchpad_entries: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    task_id: v.optional(v.id("tasks")),
    artifact_id: v.optional(v.id("media_artifacts")),
    agent_id: v.string(),
    kind: v.union(
      v.literal("observation"),
      v.literal("result"),
      v.literal("decision"),
      v.literal("question"),
      v.literal("proposal"),
      v.literal("critique"),
      v.literal("artifact"),
      v.literal("consensus"),
    ),
    namespace: v.optional(v.string()),
    content: v.string(),
    content_format: v.optional(
      v.union(v.literal("text"), v.literal("json"), v.literal("toon")),
    ),
    content_type: v.optional(v.string()),
    writer_did: v.optional(v.string()),
    verified_writer: v.optional(v.boolean()),
    supersedes_entry_id: v.optional(v.id("scratchpad_entries")),
    revision: v.optional(v.number()),
    confidence: v.number(),
    embedding: v.optional(v.array(v.float64())),
    embedding_model: v.optional(v.string()),
    // DELM (arXiv:2510.01285) curated-blackboard properties. Both optional so
    // existing rows and callers are unaffected when ARBOR_BLACKBOARD_VERIFY_ENABLED
    // is off (the default).
    // Admit-on-verify: curation label, not a rejection gate — unverified entries
    // are still stored. Only set when the verify flag is on.
    verification: v.optional(
      v.union(v.literal("evidence_backed"), v.literal("unverified")),
    ),
    // Entry ids the writer claims as supporting evidence (must resolve in the
    // same DAG to earn "evidence_backed").
    supporting_entry_ids: v.optional(v.array(v.id("scratchpad_entries"))),
    // Gist-unfold: compact deterministic summary (<=240 chars), always safe to
    // populate since it costs no model call.
    gist: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_dag", ["dag_id"])
    .index("by_dag_and_node", ["dag_id", "node_id"])
    .index("by_dag_and_namespace", ["dag_id", "namespace"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["dag_id"],
    }),

  // ─── Hive mind: Layer 5 evaluations + escalations ────────────────────────
  hive_evaluations: defineTable({
    dag_id: v.id("hive_dags"),
    node_id: v.optional(v.string()),
    agent_id: v.string(),
    score: v.number(),
    verdict: v.union(v.literal("accept"), v.literal("reject")),
    reasoning: v.string(),
    conflicts_with: v.optional(v.array(v.string())),
    judge_model: v.string(),
    created_at: v.number(),
  }).index("by_dag", ["dag_id"]),

  escalations: defineTable({
    dag_id: v.optional(v.id("hive_dags")),
    task_id: v.id("tasks"),
    kind: v.union(v.literal("low_confidence"), v.literal("conflict_tie")),
    reason: v.string(),
    payload: v.optional(v.any()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolution: v.optional(v.string()),
    created_at: v.number(),
    resolved_at: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_task", ["task_id"]),

  // ─── Hive mind: Layer 6 settlement ───────────────────────────────────────
  payout_records: defineTable({
    owner_id: v.string(),
    agent_id: v.string(),
    period: v.string(),
    tasks_won: v.number(),
    tasks_lost: v.number(),
    tasks_accepted: v.number(),
    gross_volume: v.number(),
    platform_fee: v.number(),
    estimated_payout: v.number(),
    reputation_end: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_owner_and_period", ["owner_id", "period"])
    .index("by_agent_and_period", ["agent_id", "period"]),

  // ─── Agent Task 23: readiness matrix ─────────────────────────────────────
  // Separates TRANSPORT readiness (can we reach this agent at all?) from BID /
  // EXEC fitness (does it do good work on a given task class?). An agent that
  // fails one task class is NOT marked globally bad — fitness is per-class.
  // Populated by the agentReadiness smoke-task path and read by the dashboard
  // readiness filters (ready | needs_key | protocol_mismatch | endpoint_down |
  // mock_only).
  agent_readiness: defineTable({
    agent_id: v.string(),
    source: v.string(), // static | catalog | discovered | a2a | arbor-baseline
    transport: v.string(), // real | mcp-forwarding | a2a | mock | api
    owner: v.optional(v.string()),
    endpoint: v.optional(v.string()),
    auth_mode: v.optional(v.string()),
    required_key_env: v.optional(v.string()),
    transport_status: v.string(), // ready | needs_key | protocol_mismatch | endpoint_down | mock_only
    readiness_status: v.optional(v.string()),
    latest_probe_status: v.optional(v.string()),
    last_bid_status: v.optional(v.string()), // separate from transport
    last_exec_status: v.optional(v.string()),
    latest_judge_status: v.optional(v.string()),
    latest_eval_status: v.optional(v.string()),
    latest_scratchpad_status: v.optional(v.string()),
    settlement_eligible: v.optional(v.boolean()),
    dashboard_status: v.optional(v.string()),
    failure_bucket: v.optional(v.string()),
    latest_smoke_run_id: v.optional(v.string()),
    task_class: v.optional(v.string()), // fitness is per-class, not global
    note: v.optional(v.string()),
    updated_at: v.number(),
  })
    .index("by_agent_id", ["agent_id"])
    .index("by_status", ["transport_status"])
    .index("by_readiness_status", ["readiness_status"]),

  agent_smoke_runs: defineTable({
    run_id: v.string(),
    mode: v.union(v.literal("probe"), v.literal("full")),
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    total_agents: v.number(),
    processed_agents: v.number(),
    ready_agents: v.number(),
    scratchpad_task_id: v.optional(v.id("tasks")),
    scratchpad_dag_id: v.optional(v.id("hive_dags")),
    started_at: v.number(),
    completed_at: v.optional(v.number()),
    updated_at: v.number(),
  })
    .index("by_run_id", ["run_id"])
    .index("by_started_at", ["started_at"]),

  // ─── Golden-task audit lane ──────────────────────────────────────────────
  // Curated tasks with known reference answers / checkable success criteria.
  // Posted through the normal auction pipeline so bidders cannot tell them
  // from organic tasks; graded against the reference at settle to keep the
  // calibration and quality reputation dimensions honest (an agent that only
  // bids on tasks it is sure of still gets sampled by ground truth).
  golden_tasks: defineTable({
    golden_id: v.string(),
    title: v.string(),
    prompt: v.string(),
    task_type: v.string(),
    /** Per-task ceiling; further clamped by ARBOR_GOLDEN_MAX_BUDGET at post. */
    max_budget: v.number(),
    /** The known correct answer, given verbatim to the reference grader. */
    reference_answer: v.string(),
    /** Checkable criteria the grader must apply (facts, fields, figures). */
    success_criteria: v.string(),
    /** Deterministic leg: every entry must appear in the delivery
     * (case/thousands-separator insensitive) or the audit fails outright. */
    required_substrings: v.optional(v.array(v.string())),
    enabled: v.boolean(),
    run_count: v.number(),
    last_run_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_golden_id", ["golden_id"]),

  // One row per golden post. This table is the ONLY link between a golden
  // definition and its live task — the tasks row itself is unmarked so public
  // task queries and bid solicitations reveal nothing to bidders.
  golden_task_runs: defineTable({
    golden_task_id: v.id("golden_tasks"),
    task_id: v.id("tasks"),
    status: v.union(
      v.literal("posted"),
      v.literal("audited"),
      v.literal("audit_error"),
      v.literal("expired"),
    ),
    agent_id: v.optional(v.string()),
    judge_accepted: v.optional(v.boolean()),
    audit_passed: v.optional(v.boolean()),
    audit_quality: v.optional(v.number()),
    audit_reasoning: v.optional(v.string()),
    substring_misses: v.optional(v.array(v.string())),
    grader_used: v.optional(v.boolean()),
    posted_at: v.number(),
    audited_at: v.optional(v.number()),
    /** Templating (settlement-audit-protocol.md section 3): the golden's
     * prompt/reference/substrings are drawn fresh per post from a seeded PRNG
     * (lib/golden-audit.ts) so repeated exposure of the same golden_id can't
     * be memorized. `seed` plus `drawn_params_json` (a JSON snapshot of the
     * template's `draw()` output: params, prompt, reference_answer,
     * success_criteria, required_substrings) are recorded here — on the
     * immutable per-run row, not the mutable golden_tasks definition — so
     * this exact run can be re-graded or reviewed later even after the
     * golden_id has since been posted again with different drawn values. */
    seed: v.optional(v.number()),
    drawn_params_json: v.optional(v.string()),
  })
    .index("by_task", ["task_id"])
    .index("by_golden", ["golden_task_id"])
    .index("by_status", ["status"])
    .index("by_posted_at", ["posted_at"]),

  agent_smoke_results: defineTable({
    run_id: v.string(),
    agent_id: v.string(),
    owner: v.string(),
    source: v.string(),
    transport: v.string(),
    endpoint: v.optional(v.string()),
    required_key_env: v.optional(v.string()),
    task_class: v.string(),
    task_prompt: v.string(),
    transport_status: v.string(),
    readiness_status: v.string(),
    probe_status: v.string(),
    bid_status: v.string(),
    execution_status: v.string(),
    judge_status: v.string(),
    eval_status: v.string(),
    scratchpad_status: v.string(),
    scratchpad_entry_id: v.optional(v.id("scratchpad_entries")),
    settlement_eligible: v.boolean(),
    dashboard_status: v.string(),
    failure_bucket: v.string(),
    evidence: v.optional(v.string()),
    error_message: v.optional(v.string()),
    duration_ms: v.number(),
    created_at: v.number(),
  })
    .index("by_run_id", ["run_id"])
    .index("by_agent_id", ["agent_id"])
    .index("by_run_id_and_agent_id", ["run_id", "agent_id"])
    .index("by_failure_bucket", ["failure_bucket"]),
});
