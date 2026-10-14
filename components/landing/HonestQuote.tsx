"use client";

import { useId, useState } from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Treeling } from "@/components/grove/Treeling";
import { cn } from "@/lib/utils";

const MIN = 20;
const MAX = 80;
const YOUR_COST = 38;
const RIVALS = [
  { seed: "hq-rival-a", species: "conifer", quote: 47 },
  { seed: "hq-rival-b", species: "willow", quote: 56 },
  { seed: "hq-rival-c", species: "acacia", quote: 69 },
] as const;
const RUNNER_UP = Math.min(...RIVALS.map((r) => r.quote));

const pct = (value: number) => `${((value - MIN) / (MAX - MIN)) * 100}%`;

type Outcome = { kind: "win"; paid: number } | { kind: "lose"; winner: number } | { kind: "tie" };

function outcomeFor(quote: number): Outcome {
  if (quote < RUNNER_UP) return { kind: "win", paid: RUNNER_UP };
  if (quote === RUNNER_UP) return { kind: "tie" };
  return { kind: "lose", winner: RUNNER_UP };
}

/**
 * Second-price quoting as something to play with. Drag your quote: below the
 * runner-up you always earn the runner-up's price, above it you lose the job,
 * so padding a quote can only cost you. That is the whole argument for why
 * Arbor's quotes are honest.
 */
export function HonestQuote() {
  const [quote, setQuote] = useState(42);
  const outcome = outcomeFor(quote);
  const sliderId = useId();

  return (
    <section aria-labelledby="honest-title" className="px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto max-w-7xl">
        <h2 id="honest-title" className="type-title max-w-[20ch] text-ink">
          Why padding a quote never pays
        </h2>
        <p className="type-lead mt-4 max-w-[58ch] text-ink-muted">
          The winner is paid the runner-up&rsquo;s quote instead of its own, which makes an
          honest quote every specialist&rsquo;s best move. Try it as the specialist: the work
          costs you ${YOUR_COST}.
        </p>

        <div className="mt-12 rounded-card bg-surface p-5 shadow-card sm:p-8">
          <div className="relative h-52 sm:h-56">
            <PriceAxis />
            <CostMarker />
            {RIVALS.map((rival) => (
              <Bidder key={rival.seed} seed={rival.seed} species={rival.species} quote={rival.quote} label={`$${rival.quote}`} />
            ))}
            <Bidder seed="hq-you" species="oak" quote={quote} label={`You, $${quote}`} you highlighted={outcome.kind === "win"} />
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
            <div>
              <label htmlFor={sliderId} className="type-subheading text-ink">
                Your quote
              </label>
              <input
                id={sliderId}
                type="range"
                min={MIN}
                max={MAX}
                step={1}
                value={quote}
                onChange={(event) => setQuote(Number(event.target.value))}
                aria-valuetext={`$${quote}`}
                className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-sunken accent-[oklch(var(--ink))]"
              />
              <div className="mt-2 flex justify-between text-[0.8125rem] text-ink-muted type-data">
                <span>${MIN}</span>
                <span>${MAX}</span>
              </div>
            </div>
            <OutcomePanel outcome={outcome} />
          </div>
          <p className="mt-6 text-[0.8125rem] text-ink-muted">
            Simplified to four equally trusted specialists, so price alone decides. On Arbor the
            winner is picked on fit and reputation too, and the same rule holds.
          </p>
        </div>
      </div>
    </section>
  );
}

function PriceAxis() {
  const ticks = [20, 30, 40, 50, 60, 70, 80];
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0">
      <div className="h-px w-full bg-line-strong" />
      {ticks.map((tick) => (
        <span
          key={tick}
          className="type-data absolute top-2 -translate-x-1/2 text-xs text-ink-subtle"
          style={{ left: pct(tick) }}
        >
          ${tick}
        </span>
      ))}
    </div>
  );
}

function CostMarker() {
  return (
    <div aria-hidden="true" className="absolute bottom-0 top-6" style={{ left: pct(YOUR_COST) }}>
      <div className="h-full border-l border-dashed border-line-control" />
      <span className="absolute -top-6 left-0 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-ink-muted">
        Your cost
      </span>
    </div>
  );
}

function Bidder({
  seed,
  species,
  quote,
  label,
  you = false,
  highlighted = false,
}: {
  seed: string;
  species: "oak" | "conifer" | "willow" | "acacia";
  quote: number;
  label: string;
  you?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute bottom-0 flex -translate-x-1/2 flex-col items-center",
        you ? "z-10 transition-[left] duration-150" : "z-0",
      )}
      style={{ left: pct(quote) }}
    >
      <span
        className={cn(
          "mb-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium type-data",
          you ? "bg-ink text-paper" : "bg-surface-muted text-ink-soft",
        )}
      >
        {label}
      </span>
      <div className={you ? "w-12 sm:w-[4.5rem]" : "w-10 sm:w-16"}>
        <Treeling
          seed={seed}
          species={species}
          pose={highlighted ? "raised" : "rest"}
          lantern={highlighted}
          stature={0.6}
          fluid
        />
      </div>
    </div>
  );
}

function OutcomePanel({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "win") {
    return (
      <div aria-live="polite" className="flex items-start gap-3 rounded-control bg-moss-50 p-4">
        <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-moss-600" />
        <p className="text-sm text-ink">
          <span className="font-semibold">You win and are paid ${outcome.paid}.</span>{" "}
          Any quote under ${RUNNER_UP} earns exactly this, so you keep ${outcome.paid - YOUR_COST} over
          your cost no matter what you ask.
        </p>
      </div>
    );
  }
  if (outcome.kind === "tie") {
    return (
      <div aria-live="polite" className="flex items-start gap-3 rounded-control bg-surface-muted p-4">
        <XCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-ink-muted" />
        <p className="text-sm text-ink">
          <span className="font-semibold">Tied at ${RUNNER_UP}.</span> Reputation breaks the tie,
          and you might lose a job you could have had.
        </p>
      </div>
    );
  }
  return (
    <div aria-live="polite" className="flex items-start gap-3 rounded-control bg-danger-50 p-4">
      <XCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-danger-600" />
      <p className="text-sm text-ink">
        <span className="font-semibold">You lose the job.</span> The ${outcome.winner} specialist
        wins and you earn nothing. Asking for more never raised your pay, it only risked the work.
      </p>
    </div>
  );
}
