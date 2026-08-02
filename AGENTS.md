# Global Agent Behavior

## Model Routing (Delegation Rules)

Default to the least expensive model tier that can complete the work reliably:
local Ollama → Sonnet/Luna → Terra → Fable/Sol.

### Fable / Sol — frontier model
- Multi-file refactors where a wrong call is hard to undo
- Architecture decisions and ambiguous specs
- Routing decisions (i.e. deciding which model to use)
- Debugging that may span unfamiliar files
- Auth, schema migrations, money/account flows

### Terra — strong model
- Cross-file implementation with a clear design
- Scoped debugging across unfamiliar modules
- Integration tests and protocol adapters
- Review of consequential but reversible changes

### Sonnet / Luna — versatile model
- Single-file or clearly scoped code changes
- Writing or updating tests for a known module
- Code review of a small diff
- Mechanical refactors once the plan is decided
- File/symbol lookups ("where is X defined")
- One-line edits, commit messages, PR descriptions
- Summarization, classification, format conversions
- Prose polish where the substance is already right

### Local Ollama — use when data is sensitive or offline:
- `qwen2.5-coder:7b` — default local code worker (~4 s)
- `qwen2.5:7b` — prose, summaries, changelogs (~2 s warm)
- `llama3.2:3b` — bulk classification, one-word answers (~10 s)
- `deepseek-r1:14b` — hard reasoning, math (~40 s)
- Stay in the fast lane unless you have a specific reason to pay latency

### Decision order (run top to bottom, stop at first match):
1. Data sensitive or offline? → local fast lane
2. Bulk batch (100s of calls)? → local fast lane
3. Clear, scoped, or routine work? → Sonnet/Luna
4. Cross-file work with a settled design? → Terra
5. Hard reasoning or multilingual? → local deliberate lane
6. Ambiguous, architecture-heavy, or correctness-critical? → Fable/Sol

### Mandatory rules:
- Every multi-step plan **must** end with a delegation table mapping each task to a model tier. A plan that assigns every task to Fable/Sol is a bug — rewrite the plan before starting.
- Parallelize independent lookups: launch multiple Sonnet/Luna or Terra subagents in one message rather than running them sequentially on Fable/Sol.
- End-of-turn summaries must list each subagent used: **who** (model), **what** (one phrase), **cost** (est. tokens or wall-clock seconds for local).

## Build Plans for Large Tasks
Before starting any multi-task build (e.g. 'build tasks 7-14'), write the full plan and checkpoint progress to a file (e.g. PROGRESS.md) after each completed sub-task so work survives session limits.

## Verification
After implementing any module, always run typecheck and tests before declaring it done; match existing patterns (e.g. wrap top-level await in a main()).

## Shell Conventions
Use ripgrep with -g for globs (not --include); prefer rg over find/grep. Clear stale Next.js build caches (.next) when seeing runtime module errors.

## Core Principles

- Never use emojis in any output, code, comments, or messages.

## Commit Authorship

- Never add Claude as a commit author.
- Always commit using the default git user settings.

## Documentation Style

- Never create `.md` files unless explicitly instructed.
- Be extremely concise — engineers scan, they don't read.
- Prefer examples over prose.
- Assume technical competence; skip obvious explanations.
- Front-load critical info — warnings and key concepts first.
- Default to 1–2 sentence explanations. Only expand when complexity requires it.

## Imported Claude Cowork project instructions

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
