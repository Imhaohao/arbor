import { SPECIALISTS } from "@/lib/specialists/registry";
import { AgentsPageClient } from "@/components/agents/AgentsPageClient";

export default function AgentsPage() {
  return <AgentsPageClient specialists={SPECIALISTS} />;
}
