import Link from "next/link";
import { Treeling } from "@/components/grove/Treeling";

/** Arbor's mark is the first tree-person of the grove, with the wordmark. */
export function ArborMark({ as = "div" }: { as?: "link" | "div" }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <Treeling seed="arbor" species="oak" stature={0.7} size={28} alive={false} />
      <span className="text-[1.1875rem] font-semibold [font-stretch:118%]">Arbor</span>
    </span>
  );
  if (as === "link") {
    return (
      <Link href="/" className="inline-flex items-center rounded-full" aria-label="Arbor home">
        {inner}
      </Link>
    );
  }
  return inner;
}
