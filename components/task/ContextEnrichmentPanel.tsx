"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import type { LifecycleEventDoc } from "@/lib/task-view";

interface Props {
  events: LifecycleEventDoc[];
  taskId: string;
}

interface AddedPayload {
  tool?: string;
  mode?: string;
  source_kind?: "indexed_sources" | "web_research";
  char_count?: number;
  document_count?: number;
  duration_ms: number;
  summary_preview: string;
}

interface SkippedPayload {
  reason: string;
}

interface RequestNeededPayload {
  searched: string[];
  task_prompt: string;
  message: string;
}

interface UserProvidedPayload {
  preview: string;
  char_count: number;
}

interface ContextEvents {
  hyperspellStarted: LifecycleEventDoc | undefined;
  hyperspellAdded: LifecycleEventDoc | undefined;
  hyperspellSkipped: LifecycleEventDoc | undefined;
  niaStarted: LifecycleEventDoc | undefined;
  niaAdded: LifecycleEventDoc | undefined;
  niaSkipped: LifecycleEventDoc | undefined;
  requestNeeded: LifecycleEventDoc | undefined;
  userProvided: LifecycleEventDoc | undefined;
}

function findEvent(events: LifecycleEventDoc[], type: string) {
  return events.find((e) => e.event_type === type);
}

function selectContextEvents(events: LifecycleEventDoc[]): ContextEvents {
  return {
    hyperspellStarted: findEvent(events, "hyperspell_business_context_started"),
    hyperspellAdded: findEvent(events, "hyperspell_business_context_added"),
    hyperspellSkipped: findEvent(events, "hyperspell_business_context_skipped"),
    niaStarted: findEvent(events, "nia_repo_context_started"),
    niaAdded: findEvent(events, "nia_repo_context_added"),
    niaSkipped: findEvent(events, "nia_repo_context_skipped"),
    requestNeeded: findEvent(events, "context_request_needed"),
    userProvided: findEvent(events, "context_user_provided"),
  };
}

function payloadOf<T>(event: LifecycleEventDoc | undefined): T | undefined {
  return event?.payload as unknown as T | undefined;
}

function isEnrichmentDone(ctx: ContextEvents) {
  const hyperspellSettled =
    ctx.hyperspellAdded || ctx.hyperspellSkipped || !ctx.hyperspellStarted;
  const niaSettled = ctx.niaAdded || ctx.niaSkipped || !ctx.niaStarted;
  return hyperspellSettled && niaSettled;
}

function hasContextActivity(ctx: ContextEvents) {
  return Boolean(
    ctx.hyperspellStarted ??
      ctx.niaStarted ??
      ctx.hyperspellAdded ??
      ctx.hyperspellSkipped ??
      ctx.niaAdded ??
      ctx.niaSkipped,
  );
}

export function ContextEnrichmentPanel({ events, taskId }: Props) {
  const ctx = selectContextEvents(events);
  const started = ctx.hyperspellStarted ?? ctx.niaStarted;
  const done = isEnrichmentDone(ctx);

  const elapsed = useElapsedSeconds(
    started && !done ? started.timestamp : undefined,
  );

  if (!hasContextActivity(ctx)) return null;

  // Both platforms came back empty and the user hasn't filled the gap yet.
  if (ctx.requestNeeded && !ctx.userProvided) {
    const payload = ctx.requestNeeded.payload as unknown as RequestNeededPayload;
    return <ContextRequestForm payload={payload} taskId={taskId} />;
  }

  if (done) return <ContextResultCard ctx={ctx} />;

  return <ContextSearchingCard elapsed={elapsed} />;
}

function skippedPayloadOf(ctx: ContextEvents) {
  return (
    payloadOf<SkippedPayload>(ctx.hyperspellSkipped ?? ctx.niaSkipped) ?? null
  );
}

function ContextResultCard({ ctx }: { ctx: ContextEvents }) {
  const hyperspell = payloadOf<AddedPayload>(ctx.hyperspellAdded);
  const nia = payloadOf<AddedPayload>(ctx.niaAdded);
  const skipped = skippedPayloadOf(ctx);
  const userCtx = payloadOf<UserProvidedPayload>(ctx.userProvided);
  const hasContent = Boolean(hyperspell || nia || userCtx);
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Context"
        meta={<Pill tone="info">Hyperspell + Nia</Pill>}
      />
      <div className="space-y-3">
        {hyperspell && <HyperspellBlock payload={hyperspell} />}
        {nia && <NiaBlock payload={nia} />}
        {userCtx && (
          <ContextBlock
            title="You added"
            body={userCtx.preview}
          />
        )}
        {!hasContent && skipped && (
          <p className="text-[0.8125rem] text-ink-muted">{skipped.reason}</p>
        )}
      </div>
    </Card>
  );
}

function HyperspellBlock({ payload }: { payload: AddedPayload }) {
  return (
    <ContextBlock
      title="Hyperspell workspace memory"
      meta={`${(payload.duration_ms / 1000).toFixed(1)}s`}
      body={
        payload.summary_preview ||
        `${payload.document_count ?? 0} memory documents matched.`
      }
    />
  );
}

function NiaBlock({ payload }: { payload: AddedPayload }) {
  return (
    <ContextBlock
      title={
        payload.source_kind === "indexed_sources"
          ? "Nia indexed sources"
          : "Nia web research (no indexed match)"
      }
      meta={`${(payload.duration_ms / 1000).toFixed(1)}s`}
      body={
        payload.summary_preview ||
        `${(payload.char_count ?? 0).toLocaleString()} chars retrieved.`
      }
    />
  );
}

function ContextSearchingCard({ elapsed }: { elapsed: number }) {
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Looking for context"
        meta={<Pill tone="live">Searching</Pill>}
      />
      <LoadingProgress
        label="Hyperspell + Nia are checking your sources"
        status="Hyperspell scans your connected workspace memory; Nia searches your indexed repos and docs."
        details={[
          "If we find something relevant, the auction opens with it pre-loaded.",
          "If we find nothing, we'll ask you to fill in the gap before bidding.",
        ]}
        elapsedSeconds={elapsed}
        tone="info"
      />
    </Card>
  );
}

function ContextBlock({
  title,
  meta,
  body,
}: {
  title: string;
  meta?: string;
  body: string;
}) {
  return (
    <div>
      <p className="mb-1 flex items-baseline gap-2 text-sm font-medium text-ink">
        {title}
        {meta && <span className="type-data text-xs font-normal text-ink-muted">{meta}</span>}
      </p>
      <pre tabIndex={0} className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-control bg-surface-muted p-3 font-sans text-[0.8125rem] text-ink-soft outline-none focus-visible:shadow-ring">
        {body}
      </pre>
    </div>
  );
}

function ContextRequestForm({
  payload,
  taskId,
}: {
  payload: RequestNeededPayload;
  taskId: string;
}) {
  const provide = useAction(api.userContext.provide);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await provide({ task_id: taskId as Id<"tasks">, text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="We need a bit more context"
        meta={<Pill tone="warning">Awaiting input</Pill>}
      />
      <p className="type-body mb-4 text-ink-soft">
        {payload.message}
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. User analytics live in Mixpanel; the only deploy on Tuesday was a checkout refactor at 4pm PT; sign-up funnel is at /onboard."
          required
          rows={5}
          className="w-full resize-none rounded-control border border-line-control/60 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:shadow-ring"
        />
        <p className="text-[0.8125rem] text-ink-muted">
          We&rsquo;ll save this to your Hyperspell workspace so future tasks can
          find it without asking.
        </p>
        <Button
          type="submit"
          disabled={submitting || !text.trim()}
          className="w-full"
          size="lg"
        >
          {submitting ? (
            <>
              <CircleNotch size={16} className="animate-spin" weight="bold" />
              Saving and opening the auction…
            </>
          ) : (
            <>
              Add context and continue
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </Button>
        {error && (
          <p role="alert" className="rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
