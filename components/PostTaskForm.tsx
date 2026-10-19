"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk-config";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { AgentSuggestions } from "@/components/AgentSuggestions";
import { readableError } from "@/lib/readable-error";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";

// task_type is still used by some legacy code paths (the reacher-live-launch
// demo and the campaign-context evidence injection). For the human form we
// always post "general" and let the LLM ranker decide fit purely from the
// prompt — no category selector, no friction.
const DEFAULT_TASK_TYPE = "general";

const EXAMPLES: Array<{ label: string; prompt: string }> = [
  {
    label: "Set up Stripe Connect",
    prompt:
      "I need help setting up payments in my new AI agent marketplace. Not sure which payment platform to use or how to handle marketplace payouts. Recommend a stack and walk me through the integration steps.",
  },
  {
    label: "Design a landing page",
    prompt:
      "Design a clean landing page for a developer tool that explains the product in 10 seconds, has a clear CTA, and follows a modern, minimal aesthetic.",
  },
  {
    label: "Triage our backlog",
    prompt:
      "Look at the open issues in our project tracker and propose a priority order based on impact, urgency, and effort. Group them into next sprint vs. later.",
  },
  {
    label: "Launch a TikTok Shop",
    prompt:
      "Plan a TikTok Shop creator campaign for a clean-label electrolyte drink. Find high-fit creators, draft outreach, and flag risk.",
  },
];

const fieldLabel = "mb-2 block text-sm font-medium text-ink";
const inputBase =
  "w-full rounded-control border border-line-control/60 bg-surface px-3.5 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-subtle hover:border-line-control focus:border-brand-500 focus:outline-none focus:shadow-ring disabled:bg-surface-muted disabled:text-ink-muted";

type IntakeId = Id<"task_intakes">;

interface IntakeActionResult {
  intake_id: IntakeId;
  status: "collecting" | "ready";
  questions?: string[];
  final_prompt?: string | null;
  last_error?: string;
}

interface IntakeDoc {
  status: "collecting" | "ready" | "posting" | "posted" | "failed";
  final_prompt?: string;
  posted_task_id?: Id<"tasks">;
  last_error?: string;
}

interface IntakeMessage {
  role: "user" | "assistant" | "system";
  kind: "initial_prompt" | "questions" | "answer" | "final_brief" | "error";
  text: string;
  questions?: string[];
}

const BRIEF_STATUS_LABEL: Record<string, string> = { posted: "Posted", failed: "Not posted" };

const BRIEF_FINAL_STATUSES: ReadonlySet<IntakeDoc["status"]> = new Set([
  "ready",
  "posting",
  "posted",
  "failed",
]);

function deriveIntakeView(
  intakeId: IntakeId | null,
  intake: IntakeDoc | null | undefined,
  messages: IntakeMessage[] | undefined,
) {
  const latestQuestions =
    messages
      ?.filter((message) => message.kind === "questions")
      .at(-1)?.questions ?? [];
  const loadingIntake =
    intakeId !== null && (intake === undefined || messages === undefined);
  const showQuestions =
    intake?.status === "collecting" && latestQuestions.length > 0;
  // last_error carries either an intake fallback note or, once status is
  // "failed", the reason posting was refused; show each in its own place.
  const postingError = intake?.status === "failed" && intake.last_error ? readableError(intake.last_error) : undefined;
  const briefIntake =
    intake && BRIEF_FINAL_STATUSES.has(intake.status) ? intake : null;
  return { latestQuestions, loadingIntake, showQuestions, postingError, briefIntake };
}

function budgetProblem(prompt: string, budget: string): string | null {
  const max_budget = Number(budget);
  if (!prompt.trim()) return "";
  if (!Number.isFinite(max_budget) || max_budget <= 0) {
    return "Budget must be greater than zero.";
  }
  return null;
}

export function PostTaskForm() {
  const router = useRouter();
  const startIntake = useAction(api.intake.start);
  const answerIntake = useAction(api.intake.answer);
  const approveIntake = useAction(api.intake.approveAndPost);
  const productContext = useQuery(api.productContext.latest, {
    owner_id: "buyer:web",
  });
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("2.00");
  const [intakeId, setIntakeId] = useState<IntakeId | null>(null);
  const intake = useQuery(
    api.intake.get,
    intakeId ? { intake_id: intakeId } : "skip",
  ) as IntakeDoc | null | undefined;
  const messages = useQuery(
    api.intake.messages,
    intakeId ? { intake_id: intakeId } : "skip",
  ) as IntakeMessage[] | undefined;
  const [answer, setAnswer] = useState("");
  const [finalDraft, setFinalDraft] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (finalDraft === null && intake?.final_prompt) {
      setFinalDraft(intake.final_prompt);
    }
  }, [finalDraft, intake?.final_prompt]);

  // The landing hero (AgoraHero) hands its prompt off here before
  // scrolling down, so the visitor lands on the full form pre-filled.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail) setPrompt(detail);
    };
    window.addEventListener("arbor:prefill-task", handler);
    return () => window.removeEventListener("arbor:prefill-task", handler);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const problem = budgetProblem(prompt, budget);
    if (problem === "") return;
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = (await startIntake({
        owner_id: "buyer:web",
        task_type: DEFAULT_TASK_TYPE,
        prompt,
        max_budget: Number(budget),
      })) as IntakeActionResult;
      setIntakeId(result.intake_id);
      if (result.final_prompt) {
        setFinalDraft(result.final_prompt);
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!intakeId || answering || !answer.trim()) return;
    setAnswering(true);
    setError(null);
    try {
      const result = (await answerIntake({
        intake_id: intakeId,
        answer,
      })) as IntakeActionResult;
      setAnswer("");
      if (result.final_prompt) {
        setFinalDraft(result.final_prompt);
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setAnswering(false);
    }
  }

  async function approveFinalBrief() {
    if (!intakeId || posting) return;
    const final_prompt = finalDraft?.trim();
    if (!final_prompt) {
      setError("Final brief cannot be empty.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const result = (await approveIntake({
        intake_id: intakeId,
        final_prompt,
      })) as { task_id: Id<"tasks"> };
      router.push(`/task/${result.task_id}`);
    } catch (err) {
      setError(readableError(err));
      setPosting(false);
    }
  }

  const { latestQuestions, loadingIntake, showQuestions, postingError, briefIntake } =
    deriveIntakeView(intakeId, intake, messages);

  return (
    <div className="space-y-4">
      {!intakeId && (
        <IntakeStartCard
          companyName={productContext?.company_name}
          prompt={prompt}
          onPromptChange={setPrompt}
          budget={budget}
          onBudgetChange={setBudget}
          submitting={submitting}
          error={error}
          onSubmit={onSubmit}
        />
      )}

      {loadingIntake && <IntakeLoadingCard />}

      {showQuestions && (
        <ClarifyQuestionsCard
          questions={latestQuestions}
          answer={answer}
          onAnswerChange={setAnswer}
          answering={answering}
          onSubmit={submitAnswer}
        />
      )}

      {briefIntake && (
        <FinalBriefCard
          intake={briefIntake}
          finalDraft={finalDraft}
          onDraftChange={setFinalDraft}
          posting={posting}
          error={error ?? postingError}
          onApprove={approveFinalBrief}
        />
      )}

      <AgentSuggestions prompt={prompt} taskType={DEFAULT_TASK_TYPE} />
    </div>
  );
}

function IntakeStartCard({
  companyName,
  prompt,
  onPromptChange,
  budget,
  onBudgetChange,
  submitting,
  error,
  onSubmit,
}: {
  companyName: string | undefined;
  prompt: string;
  onPromptChange: (value: string) => void;
  budget: string;
  onBudgetChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Card>
      {companyName && (
        <p className="mb-4 text-[0.8125rem] text-ink-muted">
          Using {companyName} context
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="brief" className={fieldLabel}>
            Describe the work
          </label>
          <textarea
            id="brief"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="e.g. Set up Stripe Connect for our marketplace, including onboarding, payouts, and refunds."
            required
            rows={5}
            className={`${inputBase} resize-none leading-relaxed`}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="self-center text-[0.8125rem] text-ink-muted">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => onPromptChange(ex.prompt)}
                className="inline-flex h-8 items-center rounded-full bg-surface-muted px-3 text-[0.8125rem] text-ink-soft hover:bg-surface-sunken hover:text-ink active:scale-[0.96]"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="budget" className={fieldLabel}>
            Budget
          </label>
          <div className="relative max-w-[160px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
              $
            </span>
            <input
              id="budget"
              type="number"
              step="0.01"
              min="0.01"
              value={budget}
              onChange={(e) => onBudgetChange(e.target.value)}
              className={`${inputBase} type-data pl-7`}
            />
          </div>
        </div>
        <BriefSubmit submitting={submitting} disabled={!prompt.trim()} />
        {error && (
          <p role="alert" className="rounded-control bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}

function ShapeBriefButton({ submitting, disabled }: { submitting: boolean; disabled: boolean }) {
  return (
    <Button type="submit" disabled={submitting || disabled} className="w-full" size="lg">
      {submitting ? (
        <>
          <CircleNotch size={16} className="animate-spin" weight="bold" />
          Refining your request…
        </>
      ) : (
        <>
          Shape the task brief
          <ArrowRight size={16} weight="bold" />
        </>
      )}
    </Button>
  );
}

/** Signed-out visitors keep their draft and sign in before posting. */
function SignedInShapeBriefButton(props: { submitting: boolean; disabled: boolean }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading || isAuthenticated) return <ShapeBriefButton {...props} />;
  return (
    <SignInButton mode="modal">
      <Button type="button" className="w-full" size="lg">
        Sign in to post this task
        <ArrowRight size={16} weight="bold" />
      </Button>
    </SignInButton>
  );
}

// useConvexAuth only works under Clerk's Convex provider, so the choice is
// fixed per build rather than per render.
const BriefSubmit = clerkEnabled() ? SignedInShapeBriefButton : ShapeBriefButton;

function IntakeLoadingCard() {
  return (
    <Card>
      <CardHeader title="Refining your request" meta="Preparing intake" />
      <div className="space-y-2">
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-5/6 rounded" />
        <div className="shimmer h-3 w-2/3 rounded" />
      </div>
    </Card>
  );
}

function ClarifyQuestionsCard({
  questions,
  answer,
  onAnswerChange,
  answering,
  onSubmit,
}: {
  questions: string[];
  answer: string;
  onAnswerChange: (value: string) => void;
  answering: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Card>
      <CardHeader title="Clarify the task" meta="Pre-auction intake" />
      <ol className="mb-4 space-y-2">
        {questions.map((question, index) => (
          <li
            key={`${question}-${index}`}
            className="flex gap-3 rounded-control bg-surface-muted p-3.5 text-sm text-ink"
          >
            <span className="type-data text-ink-muted">
              {index + 1}
            </span>
            {question}
          </li>
        ))}
      </ol>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="Add the missing details, constraints, examples, and success criteria."
          required
          rows={5}
          className={`${inputBase} resize-none leading-relaxed`}
        />
        <Button
          type="submit"
          disabled={answering || !answer.trim()}
          className="w-full"
          size="lg"
        >
          {answering ? (
            <>
              <CircleNotch size={16} className="animate-spin" weight="bold" />
              Updating the brief…
            </>
          ) : (
            <>
              Update the brief
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}

function BriefButtonLabel({
  posting,
  status,
}: {
  posting: boolean;
  status: IntakeDoc["status"];
}) {
  if (posting || status === "posting") {
    return (
      <>
        <CircleNotch size={16} className="animate-spin" weight="bold" />
        Posting to auction…
      </>
    );
  }
  if (status === "posted") return <>Task posted</>;
  return (
    <>
      Post to auction
      <ArrowRight size={16} weight="bold" />
    </>
  );
}

function FinalBriefCard({
  intake,
  finalDraft,
  onDraftChange,
  posting,
  error,
  onApprove,
}: {
  intake: IntakeDoc;
  finalDraft: string | null;
  onDraftChange: (value: string) => void;
  posting: boolean;
  error: string | undefined;
  onApprove: () => void;
}) {
  const locked =
    posting || intake.status === "posting" || intake.status === "posted";
  return (
    <Card>
      <CardHeader
        title="Task brief"
        meta={BRIEF_STATUS_LABEL[intake.status] ?? "Ready for auction"}
      />
      {intake.last_error && intake.status !== "failed" && (
        <p className="mb-3 rounded-control bg-warning-50 px-3.5 py-2.5 text-sm text-warning-800">
          Automatic intake fell back to manual review: {readableError(intake.last_error)}
        </p>
      )}
      <textarea
        value={finalDraft ?? ""}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={9}
        disabled={locked}
        className={`${inputBase} resize-none leading-relaxed`}
      />
      <Button
        type="button"
        onClick={onApprove}
        disabled={locked || !(finalDraft ?? "").trim()}
        className="mt-4 w-full"
        size="lg"
      >
        <BriefButtonLabel posting={posting} status={intake.status} />
      </Button>
      {error && (
        <p role="alert" className="mt-3 rounded-control bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
          {error}
        </p>
      )}
    </Card>
  );
}
