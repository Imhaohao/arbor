import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PrReviewFixture {
  id: string;
  prompt: string;
  planted_bug: {
    description: string;
    must_mention: string[];
  };
  pr_url?: string;
}

const FIXTURES_DIR = resolve(__dirname, "fixtures");

const plantedBugDiff = readFileSync(
  resolve(FIXTURES_DIR, "planted-bug.diff"),
  "utf8",
);

export const PR_REVIEW_FIXTURES: PrReviewFixture[] = [
  {
    id: "ttl-cache-missing-await",
    prompt: `Please perform a thorough code review of the following pull request diff.

The diff modifies \`lib/cache/ttlCache.ts\` and refactors the \`TtlCache\` class.

For each issue you find:
- Name the file and line(s) involved.
- Describe the bug or concern precisely.
- Explain the runtime consequence.

Pay close attention to async/await correctness, type safety, and any logic errors that would cause incorrect runtime behavior.

\`\`\`diff
${plantedBugDiff}
\`\`\`

Flag every bug you find, including subtle ones. Do not skip issues because they look intentional.`,
    planted_bug: {
      description:
        "Missing `await` on the `fetch()` call inside `getOrFetch`. " +
        "The result is a Promise<T> stored and returned as T, so callers receive " +
        "an unresolved Promise instead of the resolved value, and the cache " +
        "stores a Promise object rather than the actual data.",
      must_mention: ["await", "fetch", "getorfetch"],
    },
    pr_url: undefined,
  },
];
