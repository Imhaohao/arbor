"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DownloadSimple,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  Paperclip,
} from "@phosphor-icons/react";

interface Props {
  taskId: string;
}

interface MediaArtifactRow {
  _id: string;
  media_kind: "video" | "audio" | "image" | "other";
  file_name: string;
  mime_type: string;
  byte_size?: number;
  duration_ms?: number;
  width?: number;
  height?: number;
  provider?: string;
  created_by_agent_id: string;
  node_id?: string;
  source: string;
  created_at: number;
  download_url: string | null;
}

const KIND_ICON = {
  video: FileVideo,
  audio: FileAudio,
  image: ImageIcon,
  other: Paperclip,
} as const;

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ArtifactMedia({ artifact }: { artifact: MediaArtifactRow }) {
  if (!artifact.download_url) {
    return (
      <div className="flex h-24 items-center justify-center rounded-control bg-surface-muted text-[0.8125rem] text-ink-muted">
        File unavailable
      </div>
    );
  }
  if (artifact.media_kind === "image") {
    return (
      // Storage URLs are opaque Convex endpoints; next/image cannot optimize them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={artifact.download_url}
        alt={artifact.file_name}
        className="max-h-64 w-full rounded-control object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        loading="lazy"
      />
    );
  }
  if (artifact.media_kind === "audio") {
    return (
      <audio controls preload="metadata" className="w-full">
        <source src={artifact.download_url} type={artifact.mime_type} />
      </audio>
    );
  }
  if (artifact.media_kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        className="max-h-72 w-full rounded-control bg-black outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      >
        <source src={artifact.download_url} type={artifact.mime_type} />
      </video>
    );
  }
  return (
    <a
      href={artifact.download_url}
      download={artifact.file_name}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline underline-offset-2"
    >
      <DownloadSimple size={14} weight="bold" />
      Download {artifact.file_name}
    </a>
  );
}

/**
 * Every media artifact the run produced — images, audio, video, and files —
 * with inline players and download links. The TikTok panel only surfaces the
 * final video; this is the full record.
 */
export function MediaArtifactsPanel({ taskId }: Props) {
  const artifacts = useQuery(api.mediaArtifacts.forTask, {
    task_id: taskId as Id<"tasks">,
  }) as MediaArtifactRow[] | undefined;
  const [expanded, setExpanded] = useState(false);

  if (!artifacts || artifacts.length === 0) return null;

  const shown = expanded ? artifacts : artifacts.slice(0, 4);

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Media artifacts"
        meta={`${artifacts.length} file${artifacts.length === 1 ? "" : "s"} produced by this run`}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((artifact) => {
          const Icon = KIND_ICON[artifact.media_kind] ?? Paperclip;
          const size = formatBytes(artifact.byte_size);
          const duration = formatDuration(artifact.duration_ms);
          return (
            <div
              key={artifact._id}
              className="space-y-2 rounded-control bg-surface-muted p-3"
            >
              <ArtifactMedia artifact={artifact} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className="flex items-center gap-1.5 truncate text-sm font-medium text-ink"
                    title={artifact.file_name}
                  >
                    <Icon size={14} className="shrink-0 text-ink-muted" />
                    {artifact.file_name}
                  </p>
                  <dl className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    <dd className="type-data">{artifact.created_by_agent_id}</dd>
                    {artifact.provider && <dd>{artifact.provider}</dd>}
                    {size && <dd className="type-data">{size}</dd>}
                    {duration && <dd className="type-data">{duration}</dd>}
                  </dl>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Pill tone="neutral">{artifact.media_kind}</Pill>
                  {artifact.download_url && (
                    <a
                      href={artifact.download_url}
                      download={artifact.file_name}
                      aria-label={`Download ${artifact.file_name}`}
                      className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-brand-700"
                    >
                      <DownloadSimple size={15} weight="bold" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {artifacts.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-sm font-medium text-brand-700 underline underline-offset-2"
        >
          {expanded ? "Show fewer" : `Show all ${artifacts.length}`}
        </button>
      )}
    </Card>
  );
}
