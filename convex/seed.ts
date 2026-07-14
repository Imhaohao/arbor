"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { SPECIALISTS } from "../lib/specialists/registry";

export const seedAgents = action({
  args: {},
  handler: async (ctx) => {
    for (const spec of SPECIALISTS) {
      await ctx.runMutation(internal.seedData._upsertAgent, {
        agent_id: spec.agent_id,
        display_name: spec.display_name,
        sponsor: spec.sponsor,
        capabilities: spec.capabilities,
        system_prompt: spec.system_prompt,
        cost_per_task_estimate: spec.cost_baseline,
        reputation_score: spec.starting_reputation,
      });
    }
    return { ok: true };
  },
});
