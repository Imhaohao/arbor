import { PageShell } from "@/components/ui/PageShell";
import { ReplayIndex } from "@/components/replay/ReplayIndex";

export default function ReplayIndexPage() {
  return (
    <PageShell
      width="narrow"
      title="Replays"
      subtitle="A replay is the full record of one finished run: every step attempted, every step a reviewer rejected, and what it cost. Sorted by how much disagreement each run drew — the rejections are the point."
    >
      <ReplayIndex />
    </PageShell>
  );
}
