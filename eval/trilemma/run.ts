// Usage: npm run trilemma:report
//
// Measures what Arbor can actually compute under the Agent System Trilemma
// (performance / cost / latency) and reports, per metric, whether the corpus
// supports it. Read this BEFORE quoting any Pareto number: three of the four
// metrics need a query x agent matrix of graded outcomes, and the marketplace
// does not currently produce one.
//
// The report is deliberately blunt about shortfalls. A metric computed on 20
// samples and presented next to one computed on 20,000 reads as equally solid,
// and that is how a routing change gets justified by noise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import {
  BETA_TIERS,
  TRILEMMA_MINIMUMS,
  assessTrilemmaReadiness,
  costCoverageCurve,
  oracleDistance,
  paddedAucc,
  paretoFrontier,
  summarizeMarginalGain,
  sweepBeta,
  type MarginalGainObservation,
  type TrilemmaPoint,
} from "../../lib/hive/pareto-core";

function resolveConvexUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (fromEnv) return fromEnv;
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*NEXT_PUBLIC_CONVEX_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("NEXT_PUBLIC_CONVEX_URL not found");
}

function bar(readiness: string): string {
  return readiness === "ready"
    ? "READY"
    : readiness === "underpowered"
      ? "UNDERPOWERED"
      : "NO DATA";
}

async function main(): Promise<void> {
  const client = new ConvexHttpClient(resolveConvexUrl());
  const corpus = await client.query(api.trilemma.corpusCounts, {});

  console.log("\n=========== Agent System Trilemma: corpus readiness ===========");
  console.log(
    `hive_evaluations rows          ${corpus.eval_rows}` +
      `  (${corpus.distinct_nodes} nodes x ${corpus.distinct_agents} agents)`,
  );
  console.log(`queries graded on 2+ agents    ${corpus.nodes_with_2plus_agents}`);
  console.log(`=> comparable pairs            ${corpus.comparable_pairs}`);
  console.log(`llm_usage rows (token spend)   ${corpus.llm_usage_rows}`);
  console.log(`golden_task_runs               ${corpus.golden_task_runs}`);
  console.log(`settled bids w/ confidence     ${corpus.labelled_bids}`);
  console.log(
    `cost/accuracy points          ${corpus.cost_accuracy_points}` +
      ` (collapsing to ${costCoverageCurve(corpus.cost_accuracy).length} distinct curve steps)`,
  );

  // Readiness for the cost curve is measured in DISTINCT STEPS, not raw rows.
  // 139 settled tasks that collapse to 3 steps trace a 3-step staircase, and a
  // staircase cannot show where a router sits against an oracle.
  const curveSteps = costCoverageCurve(corpus.cost_accuracy).length;
  const readiness = assessTrilemmaReadiness({
    comparable_pairs: corpus.comparable_pairs,
    matched_budget_runs: corpus.matched_budget_runs,
    cost_accuracy_points: curveSteps,
    labelled_bids: corpus.labelled_bids,
  });

  console.log("\nmetric                        status          have    need  short");
  for (const r of readiness) {
    console.log(
      `${r.metric.padEnd(29)} ${bar(r.readiness).padEnd(14)} ` +
        `${String(r.have).padStart(5)} ${String(r.need).padStart(7)} ` +
        `${String(r.shortfall).padStart(6)}`,
    );
  }

  // Compute marginal gain on whatever real crossing exists, so the number is
  // on the table alongside the sample size rather than withheld.
  const observations: MarginalGainObservation[] = corpus.gain_observations;
  if (observations.length > 0) {
    const summary = summarizeMarginalGain(observations);
    console.log("\n--- marginal gain on the real crossing ---");
    console.log(`  n=${summary.n} pairs`);
    // The signed mean is NOT reported. Nothing records which agent in a pair is
    // the cheap one (hive_evaluations carries no cost), so "small" and "large"
    // are assigned arbitrarily and the signed gains cancel to ~0 by
    // construction. Printing that zero would read as "escalation never helps",
    // which is a statement about the pairing code, not about the marketplace.
    const spread =
      observations.reduce(
        (s, o) => s + Math.abs(o.large_quality - o.small_quality),
        0,
      ) / observations.length;
    console.log(`  mean |quality gap|   ${spread.toFixed(4)}  (unsigned: see note)`);
    console.log(
      `  hopeless share       ${summary.hopeless_share.toFixed(4)}` +
        "  <- both agents below 0.5; escalation cannot rescue these",
    );
    console.log(
      `  NOT ACTIONABLE at n=${summary.n}: a per-query gain model needs ` +
        `${TRILEMMA_MINIMUMS.comparable_pairs} pairs, and needs per-agent cost recorded alongside the grade.`,
    );
  }

  // P-AUCCC is the one metric with enough real data, so compute it rather than
  // merely declaring it ready.
  if (corpus.cost_accuracy.length > 0) {
    const points = corpus.cost_accuracy;
    const maxBudget = Math.max(...points.map((p) => p.cost));
    const aucc = paddedAucc(points, maxBudget);
    // Oracle: the best accuracy anyone achieved, available at the lowest price
    // anyone charged. It is the perfect chooser over exactly this evidence.
    const oracle = [
      {
        cost: Math.min(...points.map((p) => p.cost)),
        accuracy: Math.max(...points.map((p) => p.accuracy)),
      },
    ];
    const distance = oracleDistance({
      router: points,
      oracle,
      max_budget: maxBudget,
    });
    const curve = costCoverageCurve(points);
    console.log("\n--- padded AUCCC on settled tasks ---");
    console.log(`  points=${points.length}  budget range $0 - $${maxBudget.toFixed(2)}`);
    console.log(`  curve steps          ${curve.length}`);
    console.log(`  P-AUCCC              ${aucc.toFixed(4)}`);
    console.log(`  oracle distance      ${distance.toFixed(4)}`);

    // A near-1.0 P-AUCCC here does NOT mean the router is efficient. If the
    // cheapest observed task already scored the highest observed accuracy, the
    // curve saturates at its first step and the oracle — defined over this same
    // evidence — is matched by construction. The metric only discriminates once
    // accuracy actually climbs with budget across many steps.
    const cheapestAccuracy = curve[0]?.accuracy ?? 0;
    const bestAccuracy = Math.max(...points.map((p) => p.accuracy));
    if (curve.length < 5 || cheapestAccuracy >= bestAccuracy) {
      console.log(
        "  NOT INFORMATIVE — the curve saturates at its first step: the cheapest\n" +
          `  settled task (${curve[0]?.cost !== undefined ? "$" + curve[0].cost.toFixed(2) : "n/a"}) already scored the best accuracy observed ` +
          `(${bestAccuracy.toFixed(2)}), so\n  the oracle is matched by construction and P-AUCCC cannot discriminate.\n` +
          "  Do NOT quote 0.98 as a routing-efficiency result.",
      );
    }
  }

  // The beta sweep needs no historical labels — it is a policy knob, so it can
  // be demonstrated on the live bid field today.
  if (corpus.recent_bids.length > 0) {
    console.log("\n--- beta sweep on the most recent contested auction ---");
    const budget = corpus.recent_bid_budget;
    const sweep = sweepBeta(corpus.recent_bids, budget, Object.values(BETA_TIERS));
    const names = Object.keys(BETA_TIERS);
    sweep.forEach((s, i) => {
      console.log(
        `  ${names[i].padEnd(15)} beta=${String(s.beta).padEnd(6)} ` +
          `winner=${(s.winner?.agent_id ?? "none").padEnd(34)} ` +
          `utility=${s.utility.toFixed(4)}`,
      );
    });
    const distinct = new Set(sweep.map((s) => s.winner?.agent_id)).size;
    console.log(
      distinct > 1
        ? `  beta CHANGES the winner across tiers (${distinct} distinct) — the frontier is real here.`
        : "  beta does not change the winner on this field; the bids are not spread enough to trade off.",
    );

    const points: TrilemmaPoint[] = corpus.recent_bids.map((b) => ({
      label: b.agent_id,
      accuracy: b.confidence,
      cost: b.cost,
      latency_seconds: b.latency_seconds,
    }));
    const frontier = paretoFrontier(points);
    // Identical points do not dominate each other, so a field where every bid
    // quotes the same price and carries the same default confidence comes back
    // "100% non-dominated". That is degeneracy, not efficiency, and reporting
    // it as a frontier would be the single most misleading number here.
    const distinctPoints = new Set(
      points.map((p) => `${p.accuracy}|${p.cost}|${p.latency_seconds}`),
    ).size;
    console.log(
      `\n  Pareto frontier: ${frontier.length}/${points.length} bids non-dominated, ` +
        `but only ${distinctPoints} DISTINCT operating point(s)`,
    );
    if (distinctPoints <= 2) {
      console.log(
        "  DEGENERATE FIELD — the bids are near-identical on all three axes, so\n" +
          "  there is no trade-off to be Pareto-efficient about. Every bid carries the\n" +
          "  neutral 0.5 confidence default (reputation_dimensions.confidence is\n" +
          "  never populated) and a near-identical quote.",
      );
    }
    const seen = new Set<string>();
    for (const p of frontier) {
      const key = `${p.accuracy}|${p.cost}|${p.latency_seconds}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(
        `    ${p.label.padEnd(34)} acc=${p.accuracy.toFixed(3)} ` +
          `cost=$${p.cost.toFixed(3)} latency=${p.latency_seconds}s`,
      );
    }
  }

  const blocked = readiness.filter((r) => r.readiness !== "ready");
  console.log("\n=========== verdict ===========");
  if (blocked.length === 0) {
    console.log("All four metrics have enough data to train against.");
  } else {
    console.log(
      `${blocked.length}/4 metrics cannot be trained: ` +
        blocked.map((b) => b.metric).join(", "),
    );
    console.log(
      "All of them are blocked on the SAME artifact — a shared task battery run\n" +
        "across multiple agents with graded outcomes and recorded tokens, cost, and\n" +
        "latency. golden_tasks has the schema for it and 4 rows; golden_task_runs\n" +
        "has 0. Until that battery exists, beta is a policy knob that can be set but\n" +
        "not tuned, and the other three metrics have nothing to measure.",
    );
  }
  console.log("================================\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
