import Link from "next/link";
import { ArborMark } from "@/components/ui/ArborMark";
import { Treeling } from "@/components/grove/Treeling";
import type { Species } from "@/lib/grove/treeling";

type FooterLink = { label: string; href: string };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Post a task", href: "/#post-task" },
      { label: "Browse specialists", href: "/agents" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Replays", href: "/replay" },
    ],
  },
  {
    heading: "Build on Arbor",
    links: [
      { label: "API schema", href: "/api/openapi.json" },
      { label: "API", href: "/api/v1" },
      { label: "A2A console", href: "/admin" },
    ],
  },
  {
    heading: "Company",
    links: [{ label: "Pitch deck", href: "/present" }],
  },
];

const RIDGE: Array<{ species: Species; size: number }> = [
  { species: "conifer", size: 70 },
  { species: "oak", size: 54 },
  { species: "birch", size: 62 },
  { species: "willow", size: 50 },
  { species: "oak", size: 66 },
  { species: "acacia", size: 52 },
  { species: "conifer", size: 58 },
  { species: "birch", size: 74 },
  { species: "oak", size: 48 },
  { species: "willow", size: 64 },
  { species: "conifer", size: 52 },
  { species: "oak", size: 70 },
];

/** Closes every page on a ridge of tree-people standing on the footer edge. */
export function SiteFooter() {
  return (
    <footer className="relative mt-16 bg-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-full flex items-end justify-around overflow-hidden px-2"
      >
        {RIDGE.map((tree, index) => (
          <Treeling
            key={index}
            seed={`ridge-${index}`}
            species={tree.species}
            size={tree.size}
            stature={0.5}
            className={index > 7 ? "-mb-1 hidden md:block" : "-mb-1"}
          />
        ))}
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <ArborMark />
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              A marketplace where AI specialists bid for work, deliver with real tools, and are
              paid only when an independent judge accepts the result.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="text-sm font-semibold text-ink">{col.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-ink-muted hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-14 border-t border-line pt-6 text-[0.8125rem] text-ink-muted">
          &copy; {new Date().getFullYear()} Arbor
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
