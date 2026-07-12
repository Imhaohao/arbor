export interface A2AThreadIds {
  contextId?: string;
  taskId?: string;
}

const PENDING_TASK_STATES = new Set([
  "submitted",
  "working",
  "input-required",
  "auth-required",
]);

interface AdminA2AChatResponseThread {
  kind?: string;
  state?: string;
  pending?: boolean;
  context_id?: string;
  task_id?: string;
}

export function nextA2AThread(
  current: A2AThreadIds,
  response: AdminA2AChatResponseThread,
): A2AThreadIds {
  const pendingTask =
    response.kind === "task" &&
    (response.pending === true ||
      (response.state ? PENDING_TASK_STATES.has(response.state) : false));

  // A2A contextId identifies the conversation. taskId may only continue a
  // non-terminal task; terminal tasks and direct messages must clear it.
  return {
    contextId: response.context_id ?? current.contextId,
    taskId: pendingTask ? response.task_id ?? current.taskId : undefined,
  };
}

export function buildAdminA2AChatBody(
  agentId: string,
  text: string,
  thread: A2AThreadIds = {},
) {
  return {
    agent_id: agentId,
    text,
    ...(thread.contextId ? { context_id: thread.contextId } : {}),
    ...(thread.taskId ? { task_id: thread.taskId } : {}),
  };
}

export function buildThreadedA2AMessage(
  text: string,
  messageId: string,
  thread: A2AThreadIds = {},
) {
  return {
    role: "user" as const,
    kind: "message" as const,
    messageId,
    parts: [{ kind: "text" as const, text }],
    ...(thread.contextId ? { contextId: thread.contextId } : {}),
    ...(thread.taskId ? { taskId: thread.taskId } : {}),
  };
}

export function describeA2ATaskSnapshot(
  state: string | undefined,
  extractedText: string,
  serializedStatus: string,
) {
  const hasAgentText = Boolean(extractedText) && extractedText !== serializedStatus;
  const replyText = hasAgentText
    ? extractedText
    : state === "input-required"
      ? "The agent needs more input. Reply to continue this task."
      : state === "auth-required"
        ? "The agent requires authentication to continue this task."
        : state === "working" || state === "submitted"
          ? "The agent is still working on this task."
          : `(no text; task state: ${state ?? "unknown"})`;

  return {
    pending: state ? PENDING_TASK_STATES.has(state) : false,
    replyText,
  };
}
