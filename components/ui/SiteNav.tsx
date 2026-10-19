"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, X } from "@phosphor-icons/react";
import { ArborMark } from "@/components/ui/ArborMark";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { AuthControls } from "@/components/auth/AuthControls";
import { clerkEnabled } from "@/lib/clerk-config";

export const NAV_LINKS: Array<{ label: string; href: string }> = [
  { label: "Your tasks", href: "/tasks" },
  { label: "Specialists", href: "/agents" },
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/dashboard" },
];

/**
 * One navigation bar for the whole site. `overlay` floats over the landing
 * forest's sky and gains a surface once the page scrolls; `bar` is the solid
 * sticky header on product pages.
 */
export function SiteNav({ variant = "bar" }: { variant?: "overlay" | "bar" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const solid = variant === "bar" || scrolled || open;

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="absolute inset-x-0 top-0 h-2" />
      <header
        className={cn(
          "sticky top-0 z-40 transition-[background-color,box-shadow] duration-300",
          variant === "overlay" && "-mb-16",
          solid
            ? "bg-surface-subtle/80 shadow-[0_1px_0_oklch(var(--ink)/0.07)] backdrop-blur-xl backdrop-saturate-150"
            : "bg-transparent",
        )}
      >
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6"
        >
          <ArborMark as="link" />
          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <NavLink {...link} active={Boolean(pathname?.startsWith(link.href))} />
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            {clerkEnabled() && <AuthControls />}
            <Link href="/#post-task" className={buttonClasses({ size: "sm", className: "hidden sm:inline-flex" })}>
              Post a task
            </Link>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((value) => !value)}
              className={buttonClasses({ variant: "ghost", size: "sm", className: "md:hidden" })}
            >
              {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
              Menu
            </button>
          </div>
        </nav>
        {open && (
          <div id="mobile-nav" className="border-t border-line px-4 pb-5 pt-2 md:hidden">
            <ul className="grid gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <NavLink {...link} active={Boolean(pathname?.startsWith(link.href))} block />
                </li>
              ))}
            </ul>
            <Link href="/#post-task" className={buttonClasses({ className: "mt-4 w-full" })}>
              Post a task
            </Link>
          </div>
        )}
      </header>
    </>
  );
}

function NavLink({
  label,
  href,
  active,
  block = false,
}: {
  label: string;
  href: string;
  active: boolean;
  block?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-full px-3.5 text-sm font-medium",
        block ? "h-11 text-base" : "h-9",
        active ? "bg-ink/[0.07] text-ink" : "text-ink-muted hover:bg-ink/[0.05] hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}
