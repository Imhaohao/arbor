import { TaskView } from "@/components/task/TaskView";
import { PageShell } from "@/components/ui/PageShell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <PageShell
      width="narrow"
      title="Task"
      back={{ href: "/", label: "Back to Arbor" }}
      meta={
        <code className="rounded-md bg-white/70 px-2 py-1 font-mono text-[11px] text-ink-muted shadow-hairline">
          {id}
        </code>
      }
    >
      <TaskView taskId={id} />
    </PageShell>
  );
}
