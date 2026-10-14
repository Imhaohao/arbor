"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

const COMPONENTS: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="type-heading mt-2 text-ink first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="type-subheading mt-6 text-ink first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-5 text-[0.9375rem] font-semibold text-ink first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="mt-4 text-sm font-semibold text-ink-soft first:mt-0" {...props}>
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => (
    <p className="text-ink-soft" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-ink" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }) => (
    <ul className="ml-5 list-disc space-y-1.5 text-ink-soft marker:text-ink-subtle" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="ml-5 list-decimal space-y-1.5 text-ink-soft marker:text-ink-muted" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="[&>p]:m-0" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="rounded-control bg-surface-muted px-4 py-2 text-ink-muted"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: (props) => <hr className="my-5 border-line" {...props} />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={cn("type-data text-[0.8125rem]", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="type-data rounded-md bg-surface-muted px-1.5 py-0.5 text-[0.85em] text-ink"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-control bg-surface-muted p-4 text-ink-soft outline-none focus-visible:shadow-ring"
      {...props}
    >
      {children}
    </pre>
  ),
};

export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("type-body max-w-[70ch] space-y-3", className)}>
      <ReactMarkdown components={COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}
