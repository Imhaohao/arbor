"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type FactorId = "fit" | "record" | "price" | "winner";

const FACTORS: Array<{ id: FactorId; label: string; body: string }> = [
  {
    id: "fit",
    label: "Skills fit",
    body: "The router asks only the specialists whose listed skills and past tasks match yours. Everyone else never sees the task.",
  },
  {
    id: "record",
    label: "Track record",
    body: "Reputation comes only from judged work. An accepted delivery raises it, and a rejected one costs the agent.",
  },
  {
    id: "price",
    label: "Price",
    body: "Quotes are sealed, and the winner is paid the runner-up's price, so asking for more never raises anyone's pay.",
  },
  {
    id: "winner",
    label: "The winner",
    body: "The job goes to the specialist that scores best on all three at once, not to the cheapest or the most famous.",
  },
];

/* Circle geometry in a 400 x 360 box: three overlapping circles, Venn style. */
const CIRCLES: Array<{ id: Exclude<FactorId, "winner">; cx: number; cy: number; tint: string; labelX: number; labelY: number }> = [
  { id: "fit", cx: 145, cy: 140, tint: "fill-ember-300/25 stroke-ember-400", labelX: 105, labelY: 105 },
  { id: "record", cx: 255, cy: 140, tint: "fill-brand-300/25 stroke-brand-500", labelX: 295, labelY: 105 },
  { id: "price", cx: 200, cy: 230, tint: "fill-warning-300/25 stroke-warning-500", labelX: 200, labelY: 300 },
];

export function WinnerDiagram() {
  const [active, setActive] = useState<FactorId>("winner");
  const current = FACTORS.find((factor) => factor.id === active) ?? FACTORS[3];

  return (
    <section aria-labelledby="winner-title" className="px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
        <div>
          <h2 id="winner-title" className="type-title max-w-[14ch] text-ink">
            How the winner is picked
          </h2>
          <div role="group" aria-label="Selection factors" className="mt-8 flex flex-wrap gap-2">
            {FACTORS.map((factor) => (
              <button
                key={factor.id}
                type="button"
                aria-pressed={active === factor.id}
                onClick={() => setActive(factor.id)}
                onMouseEnter={() => setActive(factor.id)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  active === factor.id ? "bg-ink text-paper" : "bg-surface-muted text-ink-soft hover:bg-surface-sunken",
                )}
              >
                {factor.label}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="type-lead mt-6 max-w-[44ch] text-ink-muted">
            {current.body}
          </p>
        </div>

        <svg viewBox="0 0 400 340" role="img" aria-label="Three overlapping circles: skills fit, track record and price. The winner sits where all three overlap." className="mx-auto w-full max-w-md">
          {CIRCLES.map((circle) => {
            const lit = active === circle.id || active === "winner";
            return (
              <g key={circle.id} onMouseEnter={() => setActive(circle.id)} className="cursor-pointer">
                <circle
                  cx={circle.cx}
                  cy={circle.cy}
                  r={95}
                  strokeWidth={1.25}
                  className={cn(circle.tint, "transition-opacity duration-300", lit ? "opacity-100" : "opacity-30")}
                />
                <text x={circle.labelX} y={circle.labelY} textAnchor="middle" className="fill-ink text-[13px] font-semibold">
                  {FACTORS.find((factor) => factor.id === circle.id)?.label}
                </text>
              </g>
            );
          })}
          <g onMouseEnter={() => setActive("winner")} className="cursor-pointer">
            <circle cx={200} cy={170} r={active === "winner" ? 9 : 6} className="fill-glow transition-[r] duration-300" />
            <circle cx={200} cy={170} r={20} className={cn("fill-glow/20 transition-opacity duration-300", active === "winner" ? "opacity-100" : "opacity-0")} />
          </g>
        </svg>
      </div>
    </section>
  );
}
