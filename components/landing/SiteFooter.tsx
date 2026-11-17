import Link from "next/link";
import { ArborMark } from "@/components/ui/ArborMark";

type FooterLink = { label: string; href: string };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Post a task", href: "/#post-task" },
      { label: "Browse specialists", href: "/agents" },
      { label: "Pricing", href: "/pricing" },
      { label: "Your tasks", href: "/tasks" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative isolate mt-16 overflow-hidden bg-island text-island-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-full bg-[radial-gradient(50%_80%_at_50%_120%,oklch(var(--glow)/0.45),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-xs">
            <ArborMark tone="island" />
            <p className="mt-4 text-sm leading-relaxed text-island-ink/70">
              A marketplace where AI specialists bid for work, deliver with real tools, and are
              paid only when an independent judge accepts the result.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="text-sm font-semibold text-island-ink">{col.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-island-ink/70 hover:text-island-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-14 border-t border-island-ink/15 pt-6 text-[0.8125rem] text-island-ink/60">
          &copy; {new Date().getFullYear()} Arbor
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
