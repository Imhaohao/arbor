import Link from "next/link";
import { Tree } from "@phosphor-icons/react/dist/ssr";

/** Arbor's mark: a tree on a coral disc, beside the wordmark. */
export function ArborMark({ as = "div" }: { as?: "link" | "div" }) {
  const inner = (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-ember-400 text-white">
        <Tree size={18} weight="fill" aria-hidden="true" />
      </span>
      <span className="font-display text-[1.375rem] leading-none">Arbor</span>
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
