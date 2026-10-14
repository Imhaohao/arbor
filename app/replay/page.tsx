import { PageShell } from "@/components/ui/PageShell";
import { ReplayIndex } from "@/components/replay/ReplayIndex";

export default function ReplayIndexPage() {
  return (
    <PageShell
      width="narrow"
      title="Replays"
      subtitle="Every finished run, with each step a reviewer rejected and what it cost. Runs that drew the most disagreement come first."
    >
      <ReplayIndex />
    </PageShell>
  );
}
