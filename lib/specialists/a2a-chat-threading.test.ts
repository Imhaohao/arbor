import assert from "node:assert/strict";
import {
  buildAdminA2AChatBody,
  buildThreadedA2AMessage,
  describeA2ATaskSnapshot,
  nextA2AThread,
} from "./a2a-chat-threading";

const thread = { contextId: "context-7", taskId: "task-11" };

assert.deepEqual(
  buildAdminA2AChatBody("external-agent", "continue", thread),
  {
    agent_id: "external-agent",
    text: "continue",
    context_id: "context-7",
    task_id: "task-11",
  },
);

assert.deepEqual(
  describeA2ATaskSnapshot("working", '{"state":"working"}', '{"state":"working"}'),
  {
    pending: true,
    replyText: "The agent is still working on this task.",
  },
);

assert.deepEqual(
  describeA2ATaskSnapshot(
    "input-required",
    '{"state":"input-required"}',
    '{"state":"input-required"}',
  ),
  {
    pending: true,
    replyText: "The agent needs more input. Reply to continue this task.",
  },
);

assert.deepEqual(
  describeA2ATaskSnapshot("completed", "Negotiated at $12.", '{"state":"completed"}'),
  {
    pending: false,
    replyText: "Negotiated at $12.",
  },
);

assert.deepEqual(
  nextA2AThread(thread, {
    kind: "task",
    state: "input-required",
    pending: true,
    context_id: "context-8",
    task_id: "task-12",
  }),
  { contextId: "context-8", taskId: "task-12" },
);

assert.deepEqual(
  nextA2AThread(thread, {
    kind: "task",
    state: "completed",
    pending: false,
    context_id: "context-8",
    task_id: "task-11",
  }),
  { contextId: "context-8", taskId: undefined },
);

assert.deepEqual(
  nextA2AThread(thread, {
    kind: "message",
    context_id: "context-8",
    task_id: "task-11",
  }),
  { contextId: "context-8", taskId: undefined },
);

assert.deepEqual(
  buildThreadedA2AMessage("continue", "message-19", thread),
  {
    role: "user",
    kind: "message",
    messageId: "message-19",
    parts: [{ kind: "text", text: "continue" }],
    contextId: "context-7",
    taskId: "task-11",
  },
);

console.log("a2a admin chat threading tests passed");
