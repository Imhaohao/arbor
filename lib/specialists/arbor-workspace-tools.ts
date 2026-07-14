import type { ArborWorkspaceToolName } from "../types";

export interface ArborWorkspaceToolDefinition {
  name: ArborWorkspaceToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MEDIA_KIND = ["video", "audio", "image", "other"] as const;

export const ARBOR_WORKSPACE_TOOLS: readonly ArborWorkspaceToolDefinition[] = [
  {
    name: "media_request_upload",
    description:
      "Request a one-use Convex Storage upload URL scoped to the current Hive node. Upload the generated or edited bytes to the returned URL with HTTP POST, then call media_finalize_upload with the returned storageId.",
    inputSchema: {
      type: "object",
      required: ["file_name", "mime_type", "media_kind"],
      properties: {
        file_name: { type: "string" },
        mime_type: { type: "string" },
        media_kind: { type: "string", enum: MEDIA_KIND },
      },
      additionalProperties: false,
    },
  },
  {
    name: "media_import_url",
    description:
      "Import provider output from a short-lived public HTTPS URL directly into the current Hive node's Convex Storage. Use this when the provider tool returns a download URL rather than raw bytes. Returns artifact_id.",
    inputSchema: {
      type: "object",
      required: [
        "source_url",
        "file_name",
        "mime_type",
        "media_kind",
        "provider",
      ],
      properties: {
        source_url: { type: "string", format: "uri" },
        file_name: { type: "string" },
        mime_type: { type: "string" },
        media_kind: { type: "string", enum: MEDIA_KIND },
        duration_ms: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        codec: { type: "string" },
        frame_rate: { type: "number" },
        provider: { type: "string" },
        external_artifact_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "media_finalize_upload",
    description:
      "Register bytes already uploaded to the node's Convex Storage URL as a durable Arbor media artifact. Returns artifact_id. Include video metadata when available.",
    inputSchema: {
      type: "object",
      required: [
        "storage_id",
        "file_name",
        "mime_type",
        "media_kind",
        "source",
      ],
      properties: {
        storage_id: { type: "string" },
        file_name: { type: "string" },
        mime_type: { type: "string" },
        media_kind: { type: "string", enum: MEDIA_KIND },
        source: {
          type: "string",
          enum: ["agent_upload", "provider_output"],
        },
        duration_ms: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        codec: { type: "string" },
        frame_rate: { type: "number" },
        provider: { type: "string" },
        external_artifact_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "media_resolve",
    description:
      "Resolve a durable artifact from the current Hive DAG to its metadata and short-lived download URL.",
    inputSchema: {
      type: "object",
      required: ["artifact_id"],
      properties: { artifact_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "blackboard_read",
    description:
      "Read bounded shared blackboard entries visible to the current Hive node. The DAG and node scope are injected by Arbor.",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "blackboard_append",
    description:
      "Append a text result or durable artifact reference to the current Hive DAG blackboard. Never include credentials or signed URLs.",
    inputSchema: {
      type: "object",
      required: ["entry"],
      properties: {
        entry: {
          oneOf: [
            {
              type: "object",
              required: ["type", "kind", "text"],
              properties: {
                type: { const: "text" },
                kind: {
                  type: "string",
                  enum: ["observation", "result", "question", "proposal"],
                },
                text: { type: "string" },
                namespace: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              additionalProperties: false,
            },
            {
              type: "object",
              required: ["type", "artifact_id", "media_type"],
              properties: {
                type: { const: "artifact_reference" },
                artifact_id: { type: "string" },
                media_type: { type: "string" },
                label: { type: "string" },
                namespace: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              additionalProperties: false,
            },
          ],
        },
      },
      additionalProperties: false,
    },
  },
];
