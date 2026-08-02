import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Candidate shortlists are small; this only guards against a pathological call. */
const MAX_SMOKE_COUNT_AGENTS = 64;
/** Per-agent smoke history is short (11 runs corpus-wide at time of writing). */
const MAX_SMOKE_ROWS_PER_AGENT = 200;

/**
 * Per-agent smoke pass counts for a bounded candidate list, feeding the
 * availability dimension of 4D discovery.
 *
 * WHY COUNTS INSTEAD OF THE READINESS BUCKET. `agent_readiness.readiness_status`
 * is a 3-value enum and, measured on 2026-07-29, was wrong for 60% of the A2A
 * agents it marked `ready`: a live agent-card probe ~12h after the smoke run found
 * only 18 of 45 actually alive. The smoothed pass RATE over recorded smoke runs
 * scored 0.9344 ranking AUC against real bid-probe outcomes on a temporal holdout
 * (21,354 rows, 249 positives), versus 0.8205 for the enum. Counts also carry the
 * evidence volume the enum throws away, which is what lets small samples be
 * shrunk toward the corpus prior instead of trusted outright.
 *
 * `latest_at` is returned so the caller can decay the signal with age — a stale
 * observation is not evidence of being up now.
 *
 * Bounded read: uses the `by_agent_id` index and is only called for a shortlist.
 * `bid_probes` has no `by_agent_id` index, so the probe leg of the combined head
 * is deliberately not joined here; adding that index would enable it (0.9590 AUC
 * for both legs together).
 */
export const _smokeCountsForAgents = internalQuery({
  args: { agent_ids: v.array(v.string()) },
  returns: v.array(
    v.object({
      agent_id: v.string(),
      runs: v.number(),
      passes: v.number(),
      latest_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const unique = Array.from(new Set(args.agent_ids)).slice(
      0,
      MAX_SMOKE_COUNT_AGENTS,
    );
    const out: Array<{
      agent_id: string;
      runs: number;
      passes: number;
      latest_at: number;
    }> = [];
    for (const agent_id of unique) {
      const rows = await ctx.db
        .query("agent_smoke_results")
        .withIndex("by_agent_id", (q) => q.eq("agent_id", agent_id))
        .take(MAX_SMOKE_ROWS_PER_AGENT);
      if (rows.length === 0) continue;
      let passes = 0;
      let latest_at = 0;
      for (const row of rows) {
        if (row.probe_status === "pass") passes += 1;
        if (row.created_at > latest_at) latest_at = row.created_at;
      }
      out.push({ agent_id, runs: rows.length, passes, latest_at });
    }
    return out;
  },
});
