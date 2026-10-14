import type { Example, PublicTask } from "./bench-core";

export type ParsedProblem = { ok: true; task: PublicTask } | { ok: false; error: string };

const DEFAULT_TIME_LIMIT_S = 2;
const DEFAULT_CHECKER = "tokens";
const NO_EXAMPLES_ERROR = "the problem needs at least one example (Input and Output blocks); the team cannot verify anything without them";

const EXAMPLE_PAIR = /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*|\*\*)?Input:?(?:\*\*)?[ \t]*\n+```[^\n]*\n([\s\S]*?)```[\s\S]*?\n[ \t]*(?:#{1,6}[ \t]*|\*\*)?Output:?(?:\*\*)?[ \t]*\n+```[^\n]*\n([\s\S]*?)```/g;
const EXAMPLES_START = /^#{2,6}[ \t]*Examples?\b|^Example[ \t]+\d+[ \t]*$|(?:^|\n)[ \t]*(?:#{1,6}[ \t]*|\*\*)?Input:?(?:\*\*)?[ \t]*\n+```/m;
const TITLE_LINE = /^#[ \t]+(.+)$/m;

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

const FENCED_BLOCK = /```[^\n]*\n([\s\S]*?)```/g;

function labelledExamples(markdown: string): Example[] {
  return [...markdown.matchAll(EXAMPLE_PAIR)].map((match) => ({ input: ensureTrailingNewline(match[1]), output: ensureTrailingNewline(match[2]) }));
}

/** "Example N" followed by two bare fences: input, then output. Ambiguous (odd) layouts yield none. */
function unlabelledExamples(markdown: string): Example[] {
  const start = markdown.search(EXAMPLES_START);
  if (start === -1) return [];
  const blocks = [...markdown.slice(start).matchAll(FENCED_BLOCK)].map((match) => ensureTrailingNewline(match[1]));
  if (blocks.length === 0 || blocks.length % 2 !== 0) return [];
  return blocks.flatMap((block, index): Example[] => (index % 2 === 0 ? [{ input: block, output: blocks[index + 1] }] : []));
}

function extractExamples(markdown: string): Example[] {
  const labelled = labelledExamples(markdown);
  return labelled.length > 0 ? labelled : unlabelledExamples(markdown);
}

function statementBody(markdown: string): string {
  const firstExample = markdown.search(EXAMPLES_START);
  const body = firstExample === -1 ? markdown : markdown.slice(0, firstExample);
  return body.replace(TITLE_LINE, "").trim();
}

function buildTask(fields: { title: string; statement: string; examples: Example[]; time_limit_s?: number; checker?: string }): ParsedProblem {
  if (fields.examples.length === 0) return { ok: false, error: NO_EXAMPLES_ERROR };
  if (!fields.statement.trim()) return { ok: false, error: "the problem has no statement text" };
  return {
    ok: true,
    task: {
      id: "buyer-problem",
      title: fields.title,
      topic: [],
      author: "buyer",
      checker: fields.checker ?? DEFAULT_CHECKER,
      time_limit_s: fields.time_limit_s ?? DEFAULT_TIME_LIMIT_S,
      statement: fields.statement.trim(),
      examples: fields.examples,
    },
  };
}

export function parseMarkdownProblem(markdown: string): ParsedProblem {
  const title = markdown.match(TITLE_LINE)?.[1].trim() ?? "Untitled problem";
  return buildTask({ title, statement: statementBody(markdown), examples: extractExamples(markdown) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readExamples(value: unknown): Example[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Example[] =>
    isRecord(item) && typeof item.input === "string" && typeof item.output === "string"
      ? [{ input: ensureTrailingNewline(item.input), output: ensureTrailingNewline(item.output) }]
      : [],
  );
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseJsonProblem(data: unknown): ParsedProblem {
  if (!isRecord(data) || typeof data.statement !== "string") return { ok: false, error: "the JSON problem needs a string `statement`" };
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Untitled problem";
  return buildTask({
    title,
    statement: data.statement,
    examples: readExamples(data.examples),
    time_limit_s: positiveNumber(data.time_limit_s),
    checker: typeof data.checker === "string" ? data.checker : undefined,
  });
}

/** Accepts the Markdown form, or the same problem as a JSON object (parsed or as text). */
export function parseProblem(input: string | unknown): ParsedProblem {
  if (typeof input !== "string") return parseJsonProblem(input);
  const trimmed = input.trim();
  if (!trimmed.startsWith("{")) return parseMarkdownProblem(trimmed);
  try {
    return parseJsonProblem(JSON.parse(trimmed));
  } catch {
    return parseMarkdownProblem(trimmed);
  }
}
