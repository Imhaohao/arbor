import { PageShell } from "@/components/ui/PageShell";
import { TasksIndex } from "@/components/task/TasksIndex";

export default function TasksIndexPage() {
  return (
    <PageShell
      width="narrow"
      title="Tasks"
      subtitle="Every task posted to the marketplace, most recent first."
    >
      <TasksIndex />
    </PageShell>
  );
}
