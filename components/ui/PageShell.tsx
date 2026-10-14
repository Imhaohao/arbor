"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { SiteNav } from "@/components/ui/SiteNav";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { cn } from "@/lib/utils";

const WIDTHS = {
  narrow: "max-w-4xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
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
 * Shared product chrome: the site nav, a page header on the grove floor, and
 * the footer ridge. Every inner page uses this so the forest continues past
 * the landing.
 */
export function PageShell({ title, subtitle, meta, back, width = "default", children }: PageShellProps) {
  return (
    <div className="grove-floor flex min-h-dvh flex-col">
      <SiteNav variant="bar" />
      <main className={cn("mx-auto w-full flex-1 px-4 pb-24 sm:px-6", WIDTHS[width])}>
        <header className="animate-fade-up pt-10 md:pt-14">
          {back && (
            <Link
              href={back.href}
              className="group mb-5 inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={14} weight="bold" className="transition-transform group-hover:-translate-x-0.5" />
              {back.label}
            </Link>
          )}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="type-page text-ink">{title}</h1>
              {subtitle && <p className="type-body mt-3 max-w-[68ch] text-ink-muted">{subtitle}</p>}
            </div>
            {meta && <div className="shrink-0 pb-1">{meta}</div>}
          </div>
        </header>

        <div className="mt-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
