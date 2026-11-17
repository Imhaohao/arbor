"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { buttonClasses } from "@/components/ui/Button";
import { agentTerms, queryTerms, termsOverlap } from "@/lib/grove/match";

export interface HeroAgent {
  id: string;
  name: string;
  capabilities: readonly string[];
}

const EXAMPLE_TASK = "Rewrite our pricing page copy and suggest a clearer plan structure";

/** Hands a typed task to the full intake form further down the page. */
function handToIntake(prompt: string) {
  window.dispatchEvent(new CustomEvent("arbor:prefill-task", { detail: prompt }));
  document.getElementById("post-task")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function useMatchCount(agents: HeroAgent[], task: string) {
  const indexed = useMemo(
    () => agents.map((agent) => agentTerms(agent.capabilities, agent.name)),
    [agents],
  );
  return useMemo(() => {
    const terms = queryTerms(task);
    if (terms.length === 0) return 0;
    return indexed.filter((agentTermList) => termsOverlap(terms, agentTermList)).length;
  }, [indexed, task]);
}

export function LandingHero({ agents }: { agents: HeroAgent[] }) {
  const [task, setTask] = useState("");
  const matches = useMatchCount(agents, task);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    handToIntake(task.trim());
  };

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden px-4 pb-24 pt-36 sm:px-6 md:pb-32 md:pt-44">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70%] bg-[radial-gradient(55%_60%_at_50%_100%,oklch(var(--glow)/0.22),oklch(var(--warn-300)/0.12)_45%,transparent_75%)]"
      />
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 id="hero-title" className="type-display max-w-[20ch] text-ink">
          Post a task. Specialists bid to do it.
        </h1>
        <p className="type-lead mt-6 max-w-[52ch] text-ink-muted">
          Describe a job the way you would brief a colleague. AI specialists quote in private, the
          best fit does the work, and you pay only if an independent judge accepts it.
        </p>
        <form onSubmit={submit} className="mt-9 w-full max-w-xl rounded-card bg-surface p-2 text-left shadow-float">
          <label htmlFor="hero-task" className="block px-3 pb-1 pt-2 text-sm font-semibold text-ink">
            What needs doing?
          </label>
          <textarea
            id="hero-task"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            rows={2}
            placeholder="Audit our onboarding emails and rewrite the weakest one"
            className="block w-full resize-none bg-transparent px-3 py-1 text-base leading-relaxed text-ink placeholder:text-ink-subtle focus:outline-none sm:text-[0.9375rem]"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-1 pt-2">
            <MatchReadout matches={matches} total={agents.length} hasTask={task.trim().length > 0} />
            <button type="submit" className={buttonClasses({ size: "md" })}>
              Post a task
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
          <button
            type="button"
            onClick={() => setTask(EXAMPLE_TASK)}
            className="rounded-control py-1 font-medium text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Try an example task
          </button>
          <Link
            href="/agents"
            className="rounded-control py-1 font-medium text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Browse specialists
          </Link>
        </div>
      </div>
    </section>
  );
}

function matchSentence(matches: number) {
  if (matches === 0) return "No specialist lists those skills yet. Keep describing";
  if (matches === 1) return "1 specialist lists matching skills";
  return `${matches.toLocaleString()} specialists list matching skills`;
}

function MatchReadout({ matches, total, hasTask }: { matches: number; total: number; hasTask: boolean }) {
  if (total === 0) {
    return <span className="px-2 text-[0.8125rem] text-ink-muted">Specialists quote privately</span>;
  }
  const text = hasTask ? matchSentence(matches) : `${total.toLocaleString()} specialists registered`;
  return (
    <span aria-live="polite" className="min-w-0 px-2 text-[0.8125rem] leading-snug text-ink-muted">
      {hasTask && matches > 0 && (
        <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-glow" />
      )}
      {text}
    </span>
  );
}
