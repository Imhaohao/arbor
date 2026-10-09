// Models wrap their structured reply in prose, code fences, or quoted code
// that itself contains braces ("uses \p{M}"), so objects are found by trying
// JSON.parse from every "{" rather than by regex.

const SEARCH_TAIL_CHARS = 4000;

function parseObjectAt(text: string, start: number): unknown {
  for (let end = text.indexOf("}", start); end !== -1; end = text.indexOf("}", end + 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // not closed yet; try the next brace
    }
  }
  return undefined;
}

export function jsonObjectsIn(text: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const parsed = parseObjectAt(text, start);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      objects.push(parsed as Record<string, unknown>);
    }
  }
  return objects;
}

/** The last object in the reply's tail that carries `key`. */
export function lastJsonWith(text: string, key: string): Record<string, unknown> | undefined {
  return jsonObjectsIn(text.slice(-SEARCH_TAIL_CHARS))
    .reverse()
    .find((object) => key in object);
}
