/**
 * Convex wraps a server-side throw for the client as
 *   [CONVEX A(intake:approveAndPost)] [Request ID: 08f8…] Server Error
 *   Uncaught Error: <message> at handler (../convex/tasks.ts:99:10) … Called by client
 * Only <message> is meant for a person; the rest is transport and stack.
 */
export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/\[CONVEX [^\]]*\]|\[Request ID: [^\]]*\]/g, " ")
    .replace(/^\s*Server Error\b/, " ")
    .replace(/\bUncaught (?:Convex)?Error:\s*/g, "")
    .split(/\s+at (?:async )?[\w.$<>]+ \(/)[0]
    .replace(/\s*Called by client\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return message || raw.trim();
}
