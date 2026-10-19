import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-10 text-ink", className)}>{children}</div>;
}

export function ProseSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="type-heading text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function ProseP({ children }: { children: ReactNode }) {
  return <p className="type-body max-w-[68ch] text-ink-soft">{children}</p>;
}

export function ProseList({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "type-body max-w-[68ch] space-y-1.5 pl-5 text-ink-soft",
        ordered ? "list-decimal" : "list-disc",
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </Tag>
  );
}

export function ProseTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface-subtle">
      <table className="type-body w-full text-left">
        <thead>
          <tr className="text-ink">
            {head.map((cell) => (
              <th key={cell} scope="col" className="type-subheading px-4 py-3">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink-soft">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-line">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProseLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-ink underline underline-offset-4 hover:text-ink-muted">
      {children}
    </a>
  );
}
