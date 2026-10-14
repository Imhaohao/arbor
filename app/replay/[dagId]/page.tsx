import { PageShell } from "@/components/ui/PageShell";
import { AgentNetwork } from "@/components/network/AgentNetwork";
import { ReplayView } from "@/components/replay/ReplayView";
import { BlackboardPanel } from "@/components/replay/BlackboardPanel";

interface PageProps {
  params: Promise<{ dagId: string }>;
}

export default async function ReplayPage({ params }: PageProps) {
  const { dagId } = await params;
  return (
    <PageShell
      width="narrow"
      title="Replay"
      subtitle="Every verdict this run produced, including the ones that killed the work."
      back={{ href: "/replay", label: "All replays" }}
      meta={
        <code className="type-data rounded-control bg-surface px-2.5 py-1 text-xs text-ink-muted shadow-hairline">
          {dagId}
        </code>
      }
    >
      <div className="stagger-children space-y-4">
        <AgentNetwork dagId={dagId} />
        <ReplayView dagId={dagId} />
        <BlackboardPanel dagId={dagId} />
      </div>
    </PageShell>
  );
}
