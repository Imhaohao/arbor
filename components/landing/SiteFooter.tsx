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
    <footer className="mt-16 bg-surface">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
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
