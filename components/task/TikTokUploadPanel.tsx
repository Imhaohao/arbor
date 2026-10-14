"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowSquareOut, UploadSimple } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

interface MediaArtifactView {
  _id: Id<"media_artifacts">;
  media_kind: "video" | "audio" | "image" | "other";
  file_name: string;
  mime_type: string;
  node_id?: string;
  byte_size?: number;
  download_url?: string | null;
}

interface ProviderJobView {
  _id: Id<"provider_jobs">;
  job_id: string;
  provider: string;
  operation: string;
  status:
    | "queued"
    | "submitted"
    | "running"
    | "retry_wait"
    | "input_required"
    | "succeeded"
    | "failed"
    | "cancelled";
  input_artifact_id?: Id<"media_artifacts">;
  progress?: number;
  error_message?: string;
}

const HANDOFF_MESSAGE =
  "TikTok sends an inbox notification when the video is ready. Open that notification in TikTok to review the draft and finish posting.";

function bytesLabel(bytes?: number): string {
  if (!bytes) return "size unavailable";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function jobTone(status: ProviderJobView["status"]) {
  if (status === "failed" || status === "cancelled") return "danger" as const;
  if (status === "input_required" || status === "succeeded") {
    return "success" as const;
  }
  return "brand" as const;
}

export function TikTokUploadPanel({ taskId }: { taskId: string }) {
  const task_id = taskId as Id<"tasks">;
  const artifacts = useQuery(api.mediaArtifacts.forTask, { task_id }) as
    | MediaArtifactView[]
    | undefined;
  const jobs = useQuery(api.providerJobs.forTask, { task_id }) as
    | ProviderJobView[]
    | undefined;
  const [startingArtifact, setStartingArtifact] = useState<string>();
  const [error, setError] = useState<string>();

  const allVideos =
    artifacts?.filter((artifact) => artifact.media_kind === "video") ?? [];
  const editedVideos = allVideos.filter((artifact) =>
    /edit|final|review/i.test(artifact.node_id ?? ""),
  );
  const videos = editedVideos.length > 0 ? editedVideos : allVideos;
  if (artifacts === undefined || jobs === undefined || videos.length === 0) {
    return null;
  }

  async function startUpload(artifactId: Id<"media_artifacts">) {
    setStartingArtifact(String(artifactId));
    setError(undefined);
    try {
      const response = await fetch("/api/v1/tiktok/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ task_id: taskId, artifact_id: artifactId }),
      });
      const result = (await response.json()) as {
        error?: string | { message?: string };
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.detail ??
            (typeof result.error === "string"
              ? result.error
              : result.error?.message) ??
            "TikTok upload could not start",
        );
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : String(uploadError),
      );
    } finally {
      setStartingArtifact(undefined);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="TikTok upload"
        meta={<Pill tone="brand">Upload API</Pill>}
      />
      <div className="space-y-3">
        {videos.map((artifact) => {
          const job = jobs.find(
            (candidate) =>
              candidate.provider === "tiktok" &&
              candidate.operation === "upload_inbox" &&
              candidate.input_artifact_id === artifact._id,
          );
          const busy =
            startingArtifact === String(artifact._id) ||
            job?.status === "queued" ||
            job?.status === "submitted" ||
            job?.status === "running" ||
            job?.status === "retry_wait";
          return (
            <div
              key={artifact._id}
              className="rounded-control bg-surface-muted p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {artifact.file_name}
                  </p>
                  <dl className="mt-0.5 flex gap-x-3 text-xs text-ink-muted">
                    <dd className="type-data">{artifact.mime_type}</dd>
                    <dd className="type-data">{bytesLabel(artifact.byte_size)}</dd>
                  </dl>
                </div>
                <div className="flex items-center gap-2">
                  {job ? (
                    <Pill tone={jobTone(job.status)}>
                      {job.status.replaceAll("_", " ")}
                    </Pill>
                  ) : null}
                  {job?.status === "input_required" ? (
                    <a
                      href="https://www.tiktok.com/"
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClasses({ variant: "primary" })}
                    >
                      Open TikTok
                      <ArrowSquareOut size={15} weight="bold" />
                    </a>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => startUpload(artifact._id)}
                      disabled={busy || job?.status === "succeeded"}
                    >
                      <UploadSimple size={16} weight="bold" />
                      {busy ? "Sending" : "Send to TikTok drafts"}
                    </Button>
                  )}
                </div>
              </div>
              {job?.status === "input_required" ? (
                <p className="mt-3 text-[0.8125rem] text-ink-muted">
                  {HANDOFF_MESSAGE}
                </p>
              ) : null}
              {job?.error_message ? (
                <p role="alert" className="mt-3 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
                  {job.error_message}
                </p>
              ) : null}
            </div>
          );
        })}
        {error ? (
          <p role="alert" className="rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
