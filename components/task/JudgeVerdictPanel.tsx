"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { Treeling } from "@/components/grove/Treeling";
import { SealCheck, XCircle } from "@phosphor-icons/react";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type { TaskDoc, LifecycleEventDoc } from "@/lib/task-view";
import { cn } from "@/lib/utils";

interface Props {
  task: TaskDoc;
  events?: LifecycleEventDoc[];
}

export function JudgeVerdictPanel({ task, events = [] }: Props) {
  const verdict = task.judge_verdict;
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Judging starts when execution_complete fires; ends when the verdict lands.
  const judgingStarted = events.find(
    (e) => e.event_type === "execution_complete",
  );
  const verdictLanded = events.find((e) => e.event_type === "judge_verdict");
  const elapsed = useElapsedSeconds(
    judgingStarted && !verdictLanded ? judgingStarted.timestamp : undefined,
  );

  // Show the live "judging" spinner once execution is done but no verdict yet.
  if (!verdict) {
    return judgingStarted ? <JudgeReviewing elapsed={elapsed} /> : null;
  }

  const accepted = verdict.verdict === "accept";
  const pct = Math.round(verdict.quality_score * 100);
  const wasOverridden = Boolean((verdict as { override?: boolean }).override);

  async function overrideJudge(nextVerdict: "accept" | "reject") {
    const trimmed = reason.trim();
    if (!trimmed) {
      setMessage("Add a short reason before overriding the judge.");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/tasks/${task._id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict: nextVerdict,
          reason: trimmed,
          actor: "buyer:web",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Override failed");
      }
      setMessage(`Override saved: ${nextVerdict}.`);
      setReason("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Override failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Judge verdict"
        meta={
          <Pill tone={accepted ? "success" : "danger"}>
            {verdictPillLabel(wasOverridden, accepted)}
          </Pill>
        }
      />
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <Treeling seed={task._id} species="birch" size={72} label="The judge" alive={false} />
          <VerdictSeal accepted={accepted} />
        </div>
        <p className="type-body min-w-0 flex-1 text-ink-soft">{verdict.reasoning}</p>
      </div>
      <div className="mt-5">
        <dl className="mb-1.5 flex items-baseline justify-between text-[0.8125rem]">
          <dt className="text-ink-muted">Quality score</dt>
          <dd className="type-data text-ink">{pct}%</dd>
        </dl>
        <div aria-hidden="true" className="score-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-6 rounded-control bg-surface-subtle p-4">
        <h4 className="text-sm font-semibold text-ink">Human override</h4>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-muted">
          The judge is advisory. A buyer or operator can override it with an
          explicit reason; the override is logged and settlement is updated.
        </p>
        <label htmlFor="override-reason" className="mt-3 block text-[0.8125rem] font-medium text-ink">
          Reason for overriding
        </label>
        <textarea
          id="override-reason"
          className="mt-1.5 min-h-20 w-full rounded-control border border-line-control/60 bg-surface px-3 py-2 text-sm text-ink outline-none transition-[box-shadow] placeholder:text-ink-subtle focus-visible:shadow-ring"
          placeholder="Why should the judge decision be overridden?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="soft" disabled={isSubmitting} onClick={() => overrideJudge("accept")}>
            <SealCheck size={16} weight="bold" className="text-moss-700" />
            Override to accept
          </Button>
          <Button variant="danger" disabled={isSubmitting} onClick={() => overrideJudge("reject")}>
            <XCircle size={16} weight="bold" />
            Override to reject
          </Button>
        </div>
        {message && (
          <p role="status" className="mt-3 text-[0.8125rem] text-ink-muted">
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}

function verdictPillLabel(wasOverridden: boolean, accepted: boolean) {
  if (wasOverridden) return "Overridden";
  return accepted ? "Accepted" : "Rejected";
}

function JudgeReviewing({ elapsed }: { elapsed: number }) {
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Judge verdict"
        meta={<Pill tone="live">Reviewing</Pill>}
      />
      <LoadingProgress
        label="Judge is reviewing the output"
        status="Independent gpt-5.5 call: scores the work against the enriched context, returns accept or reject plus a quality score from 0 to 1."
        details={[
          "Strict but fair: rejects if off-topic, hallucinated, or fails the spec.",
          "Reputation flows from this score: accepted bumps rep, rejected docks it.",
        ]}
        elapsedSeconds={elapsed}
        tone="info"
      />
    </Card>
  );
}

function VerdictSeal({ accepted }: { accepted: boolean }) {
  const Icon = accepted ? SealCheck : XCircle;
  return (
    <span
      className={cn(
        "absolute -bottom-1 -right-2 grid size-7 place-items-center rounded-full bg-surface shadow-card",
        accepted ? "text-moss-600" : "text-danger-600",
      )}
    >
      <Icon size={20} weight="fill" aria-hidden="true" />
    </span>
  );
}
