/**
 * Convex wraps a server-side throw for the client as
 *   [CONVEX A(intake:approveAndPost)] [Request ID: 08f8…] Server Error
 *   Uncaught Error: <message> at handler (../convex/tasks.ts:99:10) … Called by client
 * Only <message> is meant for a person; the rest is transport and stack.
 */
export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = withProviderMessage(raw)
    .replace(/\[CONVEX [^\]]*\]|\[Request ID: [^\]]*\]/g, " ")
    .replace(/^\s*Server Error\b/, " ")
    .replace(/\bUncaught (?:Convex)?Error:\s*/g, "")
    .split(/\s+at (?:async )?[\w.$<>]+ \(/)[0]
    .replace(/\s*Called by client\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return message || raw.trim();
}

/**
 * Provider failures arrive as "Model API error 429: { "error": { "message":
 * "You exceeded your current quota…", … } }". Keep the prefix and the
 * provider's own sentence; drop the JSON envelope.
 */
function withProviderMessage(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;
  const end = text.lastIndexOf("}");
  const parsed = end > start ? parsedMessage(text.slice(start, end + 1)) : undefined;
  if (parsed !== undefined) return `${text.slice(0, start)}${parsed}${text.slice(end + 1)}`;
  // Stored reasons are often cut off mid-body, so fall back to the first "message" field.
  const quoted = text.slice(start).match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  return quoted === undefined ? text : `${text.slice(0, start)}${quoted}`;
}

function parsedMessage(json: string): string | undefined {
  try {
    const body = JSON.parse(json) as { error?: { message?: unknown }; message?: unknown };
    const inner = body.error?.message ?? body.message;
    return typeof inner === "string" ? inner : undefined;
  } catch {
    return undefined;
  }
}
