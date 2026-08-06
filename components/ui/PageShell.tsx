"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArborMark } from "@/components/ui/ArborMark";
import { ArrowLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const NAV_LINKS: Array<{ label: string; href: string; match: string }> = [
  { label: "Tasks", href: "/tasks", match: "/tasks" },
  { label: "Specialists", href: "/agents", match: "/agents" },
  { label: "Replays", href: "/replay", match: "/replay" },
  { label: "Dashboard", href: "/dashboard", match: "/dashboard" },
  { label: "Console", href: "/admin", match: "/admin" },
];

const WIDTHS = {
  narrow: "max-w-4xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
} as const;

interface PageShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned slot in the page header row (id chips, actions). */
  meta?: ReactNode;
  back?: { href: string; label: string };
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}

/**
 * Shared product chrome: the marketing hero's dark glassy nav carried through
 * every inner page, over an ambient aurora background. Keeps the site feeling
 * like one continuous surface instead of a landing page stapled to plain
 * white tool pages.
 */
export function PageShell({
  title,
  subtitle,
  meta,
  back,
  width = "default",
  children,
}: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="page-aurora min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/85 shadow-lg shadow-slate-950/10 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-7">
            <ArborMark as="link" tone="light" />
            <div className="hidden items-center gap-5 sm:flex">
              {NAV_LINKS.map((link) => {
                const active = pathname?.startsWith(link.match);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative text-sm font-medium transition-colors",
                      active
                        ? "text-white after:absolute after:-bottom-[1.15rem] after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-brand-400"
                        : "text-white/55 hover:text-white",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <Link
            href="/#post-task"
            className="inline-flex shrink-0 items-center rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink shadow-sm transition-all hover:scale-105 hover:shadow-md hover:shadow-white/20 active:scale-100"
          >
            Post a task
          </Link>
        </nav>
      </header>

      <main className={cn("mx-auto px-6 pb-16", WIDTHS[width])}>
        <div className="animate-fade-up pt-10">
          {back && (
            <Link
              href={back.href}
              className="group mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-brand-700"
            >
              <ArrowLeft
                size={14}
                weight="bold"
                className="transition-transform group-hover:-translate-x-0.5"
              />
              {back.label}
            </Link>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
                  {subtitle}
                </p>
              )}
            </div>
            {meta && <div className="shrink-0 pb-1">{meta}</div>}
          </div>
        </div>

        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
