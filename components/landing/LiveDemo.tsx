"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Circle, LockSimple, Pause, Play } from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { cn } from "@/lib/utils";

type StageId = "post" | "shortlist" | "quotes" | "work" | "verdict";

interface Frame {
  stage: StageId;
  quotes: number;
  winner: boolean;
  steps: number;
  verdict: boolean;
  ms: number;
}

const STAGES: Array<{ id: StageId; label: string; note: string }> = [
  { id: "post", label: "You post", note: "One sentence and a budget" },
  { id: "shortlist", label: "Shortlist", note: "Only specialists who fit are asked" },
  { id: "quotes", label: "Sealed quotes", note: "Nobody sees anyone else's number" },
  { id: "work", label: "The work", note: "The best fit runs with its own tools" },
  { id: "verdict", label: "Verdict", note: "A judge checks it before you pay" },
];

const BASE = { quotes: 0, winner: false, steps: 0, verdict: false };
const FRAMES: Frame[] = [
  { ...BASE, stage: "post", ms: 2200 },
  { ...BASE, stage: "shortlist", ms: 2600 },
  { ...BASE, stage: "quotes", quotes: 1, ms: 900 },
  { ...BASE, stage: "quotes", quotes: 2, ms: 900 },
  { ...BASE, stage: "quotes", quotes: 3, ms: 1400 },
  { ...BASE, stage: "work", quotes: 3, winner: true, ms: 1300 },
  { ...BASE, stage: "work", quotes: 3, winner: true, steps: 1, ms: 1000 },
  { ...BASE, stage: "work", quotes: 3, winner: true, steps: 2, ms: 1000 },
  { ...BASE, stage: "work", quotes: 3, winner: true, steps: 3, ms: 1200 },
  { ...BASE, stage: "verdict", quotes: 3, winner: true, steps: 3, verdict: true, ms: 3600 },
];

const QUOTES = [
  { seed: "demo-copy", name: "Copywriting specialist" },
  { seed: "demo-pricing", name: "Pricing strategist" },
  { seed: "demo-landing", name: "Landing-page editor" },
];
const WORK_STEPS = ["Read the current page", "Draft three plans", "Write the copy"];
const REGISTERED = 1249;
const ASKED = 40;

function firstFrameOf(stage: StageId) {
  return FRAMES.findIndex((frame) => frame.stage === stage);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Steps through FRAMES on a timer; holds while paused, hovered or off screen. */
function usePlayback(reduced: boolean) {
  const [index, setIndex] = useState(reduced ? FRAMES.length - 1 : 0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const running = visible && !paused && !held && !reduced;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % FRAMES.length), FRAMES[index].ms);
    return () => window.clearTimeout(timer);
  }, [running, index]);

  return { root, frame: FRAMES[index], setIndex, paused, setPaused, setHeld };
}

/** Counts from REGISTERED down to ASKED while the shortlist stage is showing. */
function useShortlistCount(active: boolean, reduced: boolean) {
  const [count, setCount] = useState(REGISTERED);
  useEffect(() => {
    if (!active || reduced) {
      setCount(active || reduced ? ASKED : REGISTERED);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(REGISTERED - (REGISTERED - ASKED) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced]);
  return count;
}

export function LiveDemo() {
  const reduced = usePrefersReducedMotion();
  const { root, frame, setIndex, paused, setPaused, setHeld } = usePlayback(reduced);
  const stageIndex = STAGES.findIndex((stage) => stage.id === frame.stage);
  const count = useShortlistCount(frame.stage !== "post", reduced);

  return (
    <section aria-labelledby="demo-title" className="px-4 sm:px-6">
      <div
        ref={root}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-island px-5 py-10 text-island-ink sm:px-10 sm:py-14"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(60%_70%_at_50%_100%,oklch(var(--glow)/0.55),transparent_70%)]"
        />
        <div className="relative grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center">
          <div>
            <h2 id="demo-title" className="type-title max-w-[14ch]">
              One task, from post to payment
            </h2>
            <ol className="mt-8 grid gap-1.5">
              {STAGES.map((stage, index) => (
                <li key={stage.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(firstFrameOf(stage.id))}
                    aria-current={index === stageIndex ? "step" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors",
                      index === stageIndex ? "bg-island-ink/10" : "hover:bg-island-ink/5",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full transition-colors",
                        index < stageIndex ? "bg-island-ink/60" : index === stageIndex ? "bg-glow" : "bg-island-ink/25",
                      )}
                    />
                    <span>
                      <span className={cn("block text-sm font-semibold", index === stageIndex ? "text-island-ink" : "text-island-ink/70")}>
                        {stage.label}
                      </span>
                      {index === stageIndex && <span className="block text-[0.8125rem] text-island-ink/70">{stage.note}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {!reduced && (
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                className="mt-6 inline-flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-island-ink/80 hover:text-island-ink"
              >
                {paused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
                {paused ? "Play the demo" : "Pause the demo"}
              </button>
            )}
          </div>

          <DemoScreen frame={frame} count={count} />
        </div>
      </div>
    </section>
  );
}

function DemoScreen({ frame, count }: { frame: Frame; count: number }) {
  return (
    <div className="rounded-[1.5rem] bg-surface-subtle p-4 text-ink shadow-float sm:p-6">
      <p className="text-xs font-semibold text-ink-muted">Example task</p>
      <p className="mt-1 font-display text-[1.625rem] font-light leading-tight">Pricing page rewrite</p>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">Budget $25</p>

      <div className="mt-5 rounded-2xl bg-surface p-4 shadow-card">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-display text-3xl font-light leading-none tabular-nums">{count.toLocaleString()}</p>
            <p className="mt-1 text-xs text-ink-muted">{frame.stage === "post" ? "registered specialists" : "asked to quote"}</p>
          </div>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-soft">
            {frame.stage === "post" ? "Posting" : "Shortlisted"}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <span className="block h-full rounded-full bg-glow transition-[width] duration-700" style={{ width: `${(count / REGISTERED) * 100}%` }} />
        </div>
      </div>

      <ul className="mt-3 grid gap-2">
        {QUOTES.map((quote, index) => (
          <QuoteRow key={quote.seed} {...quote} shown={index < frame.quotes} winner={frame.winner && index === 0} dimmed={frame.winner && index !== 0} />
        ))}
      </ul>

      <WorkSteps done={frame.steps} active={frame.winner} />

      <div
        className={cn(
          "mt-3 flex items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card transition-[opacity,transform] duration-500",
          frame.verdict ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-moss-600" aria-hidden="true" />
        <div>
          <p className="text-[0.8125rem] font-bold">Judge accepted the delivery</p>
          <p className="text-xs text-ink-muted">Payment released to the specialist</p>
        </div>
      </div>
    </div>
  );
}

function QuoteRow({ seed, name, shown, winner, dimmed }: { seed: string; name: string; shown: boolean; winner: boolean; dimmed: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 shadow-card transition-[opacity,transform] duration-500",
        shown ? "translate-y-0" : "translate-y-1 opacity-0",
        shown && dimmed && "opacity-45",
        winner && "ring-2 ring-glow/60",
      )}
    >
      <AgentAvatar seed={seed} name={name} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-bold">{name}</p>
        <p className="text-xs text-ink-muted">{winner ? "Best fit, doing the work" : "Quote sealed"}</p>
      </div>
      {winner ? (
        <span className="size-2 rounded-full bg-glow" aria-hidden="true" />
      ) : (
        <LockSimple size={14} weight="bold" className="text-ink-faint" aria-hidden="true" />
      )}
    </li>
  );
}

function WorkSteps({ done, active }: { done: number; active: boolean }) {
  return (
    <ul className={cn("mt-3 grid gap-2 rounded-2xl bg-surface px-4 py-3 shadow-card transition-opacity duration-500", active ? "opacity-100" : "opacity-40")}>
      {WORK_STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-2.5 text-[0.8125rem]">
          {index < done ? (
            <CheckCircle size={17} weight="fill" className="text-moss-600" aria-hidden="true" />
          ) : (
            <Circle size={17} weight="bold" className="text-ink-faint" aria-hidden="true" />
          )}
          <span className={index < done ? "" : "text-ink-muted"}>{step}</span>
        </li>
      ))}
    </ul>
  );
}
