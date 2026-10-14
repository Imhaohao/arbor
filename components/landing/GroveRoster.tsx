"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Treeling } from "@/components/grove/Treeling";
import { buttonClasses } from "@/components/ui/Button";
import { statureFromReputation } from "@/lib/grove/treeling";
import type { GroveAgent } from "@/lib/grove/roster";

const money = (value: number) =>
  value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(value % 1 ? 2 : 0)}`;

/** A walk along one row of the grove: real agents, real numbers. */
export function GroveRoster({ agents, total }: { agents: GroveAgent[]; total: number }) {
  const track = useRef<HTMLUListElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: "smooth" });
  };

  if (agents.length === 0) return null;

  return (
    <section aria-labelledby="roster-title" className="py-24 md:py-32">
      <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
        <h2 id="roster-title" className="type-title max-w-[16ch] text-ink">
          Specialists in the grove
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll specialists left"
            className={buttonClasses({ variant: "secondary", size: "md", className: "w-10 px-0" })}
          >
            <ArrowLeft size={16} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll specialists right"
            className={buttonClasses({ variant: "secondary", size: "md", className: "w-10 px-0" })}
          >
            <ArrowRight size={16} weight="bold" />
          </button>
          <Link href="/agents" className={buttonClasses({ variant: "secondary" })}>
            Browse all {total.toLocaleString()}
          </Link>
        </div>
      </div>

      <ul
        ref={track}
        tabIndex={0}
        aria-label="Specialists, scroll sideways for more"
        className="mt-10 outline-none focus-visible:shadow-ring flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-8 pt-2 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 lg:scroll-px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] lg:px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] [&::-webkit-scrollbar]:hidden"
      >
        {agents.map((agent) => (
          <li key={agent.id} className="snap-start">
            <RosterCard agent={agent} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RosterCard({ agent }: { agent: GroveAgent }) {
  return (
    <article className="group flex h-full w-60 flex-col rounded-card bg-surface p-5 shadow-card transition-[box-shadow,translate] duration-200 hover:-translate-y-1 hover:shadow-card-hover">
      <div className="relative flex h-36 items-end justify-center">
        <div
          aria-hidden="true"
          className="absolute bottom-0 h-5 w-32 rounded-[50%] bg-[radial-gradient(closest-side,oklch(var(--leaf-1)/0.22),transparent)]"
        />
        <Treeling
          seed={agent.id}
          capabilities={agent.capabilities}
          name={agent.name}
          stature={statureFromReputation(agent.reputation)}
          size={132}
        />
      </div>
      <h3 className="type-subheading mt-4 truncate text-ink" title={agent.name}>
        {agent.name}
      </h3>
      <p className="truncate text-[0.8125rem] text-ink-muted" title={agent.sponsor}>
        {agent.sponsor}
      </p>
      <p className="mt-3 line-clamp-2 text-[0.8125rem] leading-snug text-ink-soft">
        {agent.capabilities.slice(0, 3).join(", ")}
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-2 pt-4 text-[0.8125rem]">
        <div>
          <dt className="text-ink-muted">Per task</dt>
          <dd className="type-data text-ink">{money(agent.cost)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Delivered</dt>
          <dd className="type-data text-ink">{agent.completed}</dd>
        </div>
      </dl>
    </article>
  );
}
