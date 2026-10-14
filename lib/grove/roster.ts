import { unstable_cache } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/** The slice of an agent the forest and avatars need, nothing heavier. */
export interface GroveAgent {
  id: string;
  name: string;
  sponsor: string;
  capabilities: string[];
  reputation: number;
  cost: number;
  completed: number;
}

interface AgentRow {
  agent_id: string;
  display_name: string;
  sponsor: string;
  capabilities: string[];
  reputation_score: number;
  cost_per_task_estimate: number;
  total_tasks_completed: number;
}

async function fetchRoster(): Promise<GroveAgent[]> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return [];
  try {
    const client = new ConvexHttpClient(url);
    const rows = (await client.query(api.agents.list, {})) as AgentRow[];
    return rows.map((row) => ({
      id: row.agent_id,
      name: row.display_name,
      sponsor: row.sponsor,
      capabilities: row.capabilities.slice(0, 4),
      reputation: row.reputation_score,
      cost: row.cost_per_task_estimate,
      completed: row.total_tasks_completed,
    }));
  } catch {
    // The landing must render even when the backend is unreachable; the
    // forest falls back to an unlabeled seeded grove (see AgoraForest).
    return [];
  }
}

/**
 * Live roster, cached for ten minutes. agents.list returns full rows with
 * system prompts, so the slimming happens here on the server and the client
 * receives only the fields above.
 */
export const getGroveRoster = unstable_cache(fetchRoster, ["grove-roster-v1"], {
  revalidate: 600,
});
