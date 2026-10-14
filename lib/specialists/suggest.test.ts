import assert from "node:assert/strict";
import { fallbackKeywordRank } from "./suggest";

const spec = (agent_id: string, sponsor: string, one_liner: string, capabilities: string[] = []) => ({
  agent_id,
  display_name: agent_id,
  sponsor,
  one_liner,
  capabilities,
  cost_baseline: 3,
  discovered: true,
  enrollable: false,
});

const pool = [
  spec("colony", "The Colony", "Community platform for AI agents. Create posts, comment, vote."),
  spec("acc", "ACC Foundation", "Agent Cooperative Commerce platform connecting merchants."),
  spec("stripe", "Stripe (payments)", "Payments, Connect onboarding and billing.", ["payments"]),
  spec("rapid", "Gatewayly", "Hosted API gateway.", ["api"]),
];
const score = (query: string) => Object.fromEntries(fallbackKeywordRank(query, pool).map((item) => [item.agent_id, item.fit_score]));

// Regression, seen live 2026-10-13 with model spend switched off: a coding
// task ranked "The Colony" and "ACC Foundation" at 0.89 fit because the
// matcher found "the" in "returns the n-th" and "acc" inside "Fibonacci".
{
  const scores = score("Write a Python function that returns the n-th Fibonacci number modulo 1e9+7, with tests.");
  assert.ok(scores.colony < 0.2, `colony ${scores.colony}`);
  assert.ok(scores.acc < 0.2, `acc ${scores.acc}`);
}

// A real sponsor mention still wins, with or without its parenthetical.
{
  const scores = score("Set up Stripe Connect for my marketplace");
  assert.ok(scores.stripe >= 0.85, `stripe ${scores.stripe}`);
  assert.ok(score("I want The Colony to host a discussion").colony >= 0.85);
}

// Tags match whole words: "rapid" does not contain the tag "api".
{
  assert.equal(score("Need a rapid turnaround on a logo").rapid, 0);
  assert.ok(score("Design a REST api for orders").rapid >= 0.18);
}

console.log("suggest tests passed");
