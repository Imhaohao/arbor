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
      back={{ href: "/tasks", label: "All tasks" }}
      meta={
        <code className="type-data rounded-full bg-surface-muted px-3 py-1 text-xs text-ink-muted">
          {id}
        </code>
      }
    >
      <TaskView taskId={id} />
    </PageShell>
  );
}
