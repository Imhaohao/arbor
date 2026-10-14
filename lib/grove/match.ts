/**
 * Keyword overlap between a typed task and an agent's listed skills. This
 * drives the landing forest's "who perks up" preview only; the real router
 * (convex/hiveRouter.ts) uses embeddings and auction scores. The UI copy says
 * "list skills that match", which is exactly what this measures.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "our", "your", "my", "you", "that", "this",
  "from", "into", "about", "need", "want", "please", "can", "help", "make",
  "some", "all", "are", "was", "will", "would", "should", "could", "get",
  "new", "out", "use", "using", "who", "what", "how", "why", "when", "then",
]);

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/u, "");
}

export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  const terms = words.filter((w) => w.length >= 3 && !STOPWORDS.has(w)).map(stem);
  return [...new Set(terms.filter((t) => t.length >= 3))];
}

export function agentTerms(capabilities: readonly string[], name: string): string[] {
  const words = `${capabilities.join(" ")} ${name}`.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 3).map(stem))];
}

/** True when any query term is a prefix of an agent term or vice versa. */
export function termsOverlap(query: readonly string[], agent: readonly string[]): boolean {
  return query.some((q) => agent.some((a) => a.startsWith(q) || q.startsWith(a)));
}
