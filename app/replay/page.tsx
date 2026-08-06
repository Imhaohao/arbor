import { PageShell } from "@/components/ui/PageShell";
import { ReplayIndex } from "@/components/replay/ReplayIndex";

export default function ReplayIndexPage() {
  return (
    <PageShell
      width="narrow"
      title="Replays"
      subtitle="Settled runs, most-contested first. The rejections are the point."
    >
      <ReplayIndex />
    </PageShell>
  );
}
