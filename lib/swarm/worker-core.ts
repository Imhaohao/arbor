// Local swarm workers: subscription CLIs driven headlessly. Pure — every
// command-line and output-parsing decision lives here so it can be tested
// without spawning anything.

export type Backend = "claude" | "codex" | "cursor" | "gemini" | "opencode" | "ollama";
export type Mode = "ask" | "code";
export type Family = "anthropic" | "openai" | "xai" | "google" | "local" | "other";
export type FailureKind = "auth" | "rate_limit" | "timeout" | "empty" | "other";

export interface WorkerSpec {
  backend: Backend;
  model?: string;
  label: string;
}

export interface Invocation {
  bin: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface WorkerOutput {
  ok: boolean;
  text: string;
  failure?: FailureKind;
}

const BACKENDS: readonly Backend[] = ["claude", "codex", "cursor", "gemini", "opencode", "ollama"];

export const DEFAULT_POOL: readonly string[] = [
  "claude",
  "codex",
  "cursor:grok-4.7-medium",
  "cursor:gemini-3.8-flash-high",
  "opencode:google/gemini-3-flash-preview",
  "ollama:qwen2.5-coder:7b",
];

export const OLLAMA_DEFAULT_MODEL = "qwen2.5-coder:7b";

export function parseWorker(raw: string): WorkerSpec {
  const label = raw.trim();
  const colon = label.indexOf(":");
  const backendName = colon === -1 ? label : label.slice(0, colon);
  const model = colon === -1 ? undefined : label.slice(colon + 1) || undefined;
  if (!BACKENDS.includes(backendName as Backend)) {
    throw new Error(`unknown worker backend "${backendName}" (expected one of ${BACKENDS.join(", ")})`);
  }
  return { backend: backendName as Backend, model, label };
}

export function parseWorkerList(raw: string): WorkerSpec[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseWorker);
}

const MODEL_FAMILY_PATTERNS: ReadonlyArray<[RegExp, Family]> = [
  [/claude|opus|sonnet|haiku|fable/i, "anthropic"],
  [/grok/i, "xai"],
  [/gemini|gemma/i, "google"],
  [/gpt|codex/i, "openai"],
];

const BACKEND_FAMILY: Record<Backend, Family> = {
  claude: "anthropic",
  codex: "openai",
  cursor: "other",
  gemini: "google",
  opencode: "other",
  ollama: "local",
};

export function familyOf(spec: WorkerSpec): Family {
  if (spec.backend === "ollama" || !spec.model) return BACKEND_FAMILY[spec.backend];
  const match = MODEL_FAMILY_PATTERNS.find(([pattern]) => pattern.test(spec.model ?? ""));
  return match ? match[1] : BACKEND_FAMILY[spec.backend];
}

// Ollama is a plain text model with no file tools, so it cannot edit a repo.
export function supportsMode(spec: WorkerSpec, mode: Mode): boolean {
  return mode === "ask" || spec.backend !== "ollama";
}

// OpenCode's only primary agent edits files, so ask-mode runs it somewhere
// harmless instead of in the user's checkout.
export function needsScratchCwdForAsk(spec: WorkerSpec): boolean {
  return spec.backend === "opencode";
}

export interface InvocationContext {
  codexHome: string;
}

type InvocationBuilder = (
  spec: WorkerSpec,
  mode: Mode,
  prompt: string,
  context: InvocationContext,
) => Invocation;

const modelFlag = (flag: string, model?: string): string[] => (model ? [flag, model] : []);

const INVOCATION_BUILDERS: Record<Backend, InvocationBuilder> = {
  claude: (spec, mode, prompt) => ({
    bin: "claude",
    args: [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--strict-mcp-config",
      ...modelFlag("--model", spec.model),
      ...(mode === "code" ? ["--permission-mode", "acceptEdits"] : []),
    ],
  }),
  codex: (spec, mode, prompt, context) => ({
    bin: "codex",
    args: [
      "exec",
      "--skip-git-repo-check",
      "-s",
      mode === "code" ? "workspace-write" : "read-only",
      ...modelFlag("-m", spec.model),
      prompt,
    ],
    env: { CODEX_HOME: context.codexHome },
  }),
  cursor: (spec, mode, prompt) => ({
    bin: "cursor-agent",
    args: [
      "-p",
      "--trust",
      "--output-format",
      "text",
      ...modelFlag("--model", spec.model),
      ...(mode === "ask" ? ["--mode", "ask"] : []),
      prompt,
    ],
  }),
  // auto_edit approves file edits only; shell commands stay unapproved, so a
  // headless Gemini cannot launch long jobs. plan is Gemini's read-only mode.
  gemini: (spec, mode, prompt) => ({
    bin: "gemini",
    args: [
      "-p",
      prompt,
      "-o",
      "json",
      "--approval-mode",
      mode === "code" ? "auto_edit" : "plan",
      ...modelFlag("-m", spec.model),
    ],
  }),
  opencode: (spec, _mode, prompt) => ({
    bin: "opencode",
    args: ["run", ...modelFlag("-m", spec.model), prompt],
  }),
  ollama: (spec, _mode, prompt) => ({
    bin: "ollama",
    // Without --nowordwrap ollama redraws wrapped words with cursor codes,
    // which leave stuttered fragments ("requiri requiring") once stripped.
    args: ["run", "--nowordwrap", spec.model ?? OLLAMA_DEFAULT_MODEL, prompt],
  }),
};

export function buildInvocation(
  spec: WorkerSpec,
  mode: Mode,
  prompt: string,
  context: InvocationContext,
): Invocation {
  if (!supportsMode(spec, mode)) {
    throw new Error(`${spec.label} cannot run in ${mode} mode`);
  }
  return INVOCATION_BUILDERS[spec.backend](spec, mode, prompt, context);
}

// npm run / npx prepend every ancestor's node_modules/.bin to PATH. A stray
// package that happens to share a CLI's name (compute-box has an unrelated
// `codex` in ~/node_modules) then shadows the real tool, so workers resolve
// binaries the way the user's own shell would.
const NPM_INJECTED_PATH_ENTRY = /\/node_modules\/\.bin\/?$|\/@npmcli\/run-script\/lib\/node-gyp-bin\/?$/;

export function withoutNpmBinDirs(path: string): string {
  return path
    .split(":")
    .filter((entry) => entry && !NPM_INJECTED_PATH_ENTRY.test(entry))
    .join(":");
}

const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

const FAILURE_PATTERNS: ReadonlyArray<[RegExp, FailureKind]> = [
  [/rate.?limit|usage limit|quota|\b429\b|too many requests|limit reached/i, "rate_limit"],
  [/authenticat|\blog(?:ged)? ?in\b|oauth|\b40[13]\b|unauthori|auth (?:type|method)|api[_ ]?key/i, "auth"],
];

export function classifyFailure(text: string): FailureKind {
  const match = FAILURE_PATTERNS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : "other";
}

interface ClaudeJsonResult {
  is_error?: boolean;
  result?: string;
}

function parseClaudeJson(stdout: string): ClaudeJsonResult | undefined {
  const lastLine = stdout.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(lastLine) as ClaudeJsonResult;
  } catch {
    return undefined;
  }
}

function claudeOutput(result: ProcessResult): WorkerOutput {
  const parsed = parseClaudeJson(result.stdout);
  if (!parsed) return failed(`${result.stderr}\n${result.stdout}`);
  const text = (parsed.result ?? "").trim();
  if (parsed.is_error) return { ok: false, text, failure: classifyFailure(text) };
  return text ? { ok: true, text } : { ok: false, text, failure: "empty" };
}

interface GeminiJsonResult {
  response?: unknown;
  error?: { message?: unknown } | unknown;
}

function parseWholeJson(stdout: string): GeminiJsonResult | undefined {
  try {
    return JSON.parse(stdout.trim()) as GeminiJsonResult;
  } catch {
    return undefined;
  }
}

function geminiErrorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

function geminiOutput(result: ProcessResult): WorkerOutput {
  const parsed = parseWholeJson(result.stdout);
  if (!parsed) return failed(`${result.stderr}\n${result.stdout}`);
  if (parsed.error) return failed(geminiErrorText(parsed.error));
  const text = String(parsed.response ?? "").trim();
  return text ? { ok: true, text } : { ok: false, text, failure: "empty" };
}

function failed(diagnostic: string): WorkerOutput {
  const text = stripAnsi(diagnostic).trim().slice(-2000);
  return { ok: false, text, failure: classifyFailure(text) };
}

function plainOutput(result: ProcessResult): WorkerOutput {
  if (result.code !== 0) return failed(`${result.stderr}\n${result.stdout}`);
  const text = stripAnsi(result.stdout).trim();
  return text ? { ok: true, text } : { ok: false, text, failure: "empty" };
}

export function parseWorkerOutput(backend: Backend, result: ProcessResult): WorkerOutput {
  if (result.timedOut) return { ok: false, text: "", failure: "timeout" };
  if (backend === "claude") return claudeOutput(result);
  return backend === "gemini" ? geminiOutput(result) : plainOutput(result);
}
