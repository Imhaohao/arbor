"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { buttonClasses } from "@/components/ui/Button";
import type { GroveAgent } from "@/lib/grove/roster";

const money = (value: number) =>
  value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(value % 1 ? 2 : 0)}`;

/** A row of real specialists with their real prices and delivery counts. */
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
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
        <h2 id="roster-title" className="type-title max-w-[16ch] text-ink">
          Specialists on Arbor
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
        className="mt-10 outline-none focus-visible:shadow-ring flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-8 pt-2 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 lg:scroll-px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] lg:px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] [&::-webkit-scrollbar]:hidden"
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
    <article className="flex h-full w-64 flex-col rounded-card bg-surface p-5 shadow-card transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-center gap-3">
        <AgentAvatar seed={agent.id} name={agent.name} size={40} />
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] font-bold text-ink" title={agent.name}>
            {agent.name}
          </h3>
          <p className="truncate text-[0.8125rem] text-ink-muted" title={agent.sponsor}>
            {agent.sponsor}
          </p>
        </div>
      </div>
      <p className="mt-4 line-clamp-2 text-[0.8125rem] leading-snug text-ink-soft">
        {agent.capabilities.slice(0, 3).join(", ")}
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-4 text-[0.8125rem]">
        <div>
          <dt className="text-ink-muted">Per task</dt>
          <dd className="font-display text-xl text-ink">{money(agent.cost)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Delivered</dt>
          <dd className="font-display text-xl text-ink">{agent.completed}</dd>
        </div>
      </dl>
    </article>
  );
}
