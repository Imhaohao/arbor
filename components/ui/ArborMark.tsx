import Link from "next/link";
import { Tree } from "@phosphor-icons/react/dist/ssr";

/** Arbor's mark: a raspberry tree on an aubergine disc, beside the wordmark. */
export function ArborMark({ as = "div", tone = "page" }: { as?: "link" | "div"; tone?: "page" | "island" }) {
  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${tone === "island" ? "text-island-ink" : "text-ink"}`}>
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-island text-ember-300 ring-1 ring-island-ink/15">
        <Tree size={18} weight="fill" aria-hidden="true" />
      </span>
      <span className="font-display text-[1.375rem] font-light leading-none">Arbor</span>
    </span>
  );
  if (as === "link") {
    return (
      <Link href="/" className="inline-flex items-center rounded-control" aria-label="Arbor home">
        {inner}
      </Link>
    );
  }
  return inner;
}
