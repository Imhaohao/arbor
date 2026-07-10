// Pure DAG helpers for the Arbor hive-mind planner. No Convex imports — this
// module is runtime-agnostic so it can be unit-tested and reused on the client.

export interface PlannedNode {
  id: string;
  description: string;
  depends_on: string[];
  success_criteria?: string;
  task_class?: "reasoning" | "classification" | "extraction" | "generation";
}

const NODE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

/**
 * Validate a planned DAG before it is persisted. Returns the first violation
 * found with a human-readable message. Rules:
 *  - 1..8 nodes
 *  - ids match NODE_ID_RE and are unique
 *  - every depends_on entry references an existing id and never the node itself
 *  - the graph is acyclic (Kahn's algorithm)
 *  - at least one node has no dependencies (a valid entry point)
 */
export function validateDag(
  nodes: PlannedNode[],
): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { ok: false, error: "DAG must contain at least 1 node" };
  }
  if (nodes.length > 8) {
    return {
      ok: false,
      error: `DAG must contain at most 8 nodes, got ${nodes.length}`,
    };
  }

  const seen = new Set<string>();
  for (const node of nodes) {
    if (!NODE_ID_RE.test(node.id)) {
      return {
        ok: false,
        error: `Invalid node id "${node.id}": must match /^[a-z0-9][a-z0-9_-]{0,30}$/`,
      };
    }
    if (seen.has(node.id)) {
      return { ok: false, error: `Duplicate node id "${node.id}"` };
    }
    seen.add(node.id);
  }

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      if (dep === node.id) {
        return {
          ok: false,
          error: `Node "${node.id}" cannot depend on itself`,
        };
      }
      if (!seen.has(dep)) {
        return {
          ok: false,
          error: `Node "${node.id}" depends on unknown node "${dep}"`,
        };
      }
    }
  }

  // Kahn's algorithm: if we cannot remove every node, a cycle exists. This
  // runs before the "has a root" check because a graph with no root is itself
  // cyclic, and a cycle is the more specific, actionable diagnosis.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, node.depends_on.length);
  }
  for (const node of nodes) {
    for (const dep of node.depends_on) {
      const list = dependents.get(dep) ?? [];
      list.push(node.id);
      dependents.set(dep, list);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }

  let removed = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    removed += 1;
    for (const child of dependents.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (removed !== nodes.length) {
    return { ok: false, error: "DAG contains a cycle" };
  }

  // An acyclic graph always has at least one zero-indegree node, so this is a
  // belt-and-suspenders guarantee of the spec's "at least one root" rule.
  const hasRoot = nodes.some((n) => n.depends_on.length === 0);
  if (!hasRoot) {
    return {
      ok: false,
      error: "DAG must have at least one node with no dependencies",
    };
  }

  return { ok: true };
}

/**
 * Group node ids into topological levels. Level 0 holds nodes with no deps;
 * level N holds nodes whose deps all resolved in earlier levels. Assumes the
 * input is already valid (call validateDag first).
 */
export function topologicalLevels(nodes: PlannedNode[]): string[][] {
  const byId = new Map<string, PlannedNode>();
  for (const node of nodes) byId.set(node.id, node);

  const placed = new Set<string>();
  const levels: string[][] = [];

  while (placed.size < nodes.length) {
    const level: string[] = [];
    for (const node of nodes) {
      if (placed.has(node.id)) continue;
      if (node.depends_on.every((dep) => placed.has(dep))) {
        level.push(node.id);
      }
    }
    // Guard against malformed input that would otherwise loop forever.
    if (level.length === 0) break;
    for (const id of level) placed.add(id);
    levels.push(level);
  }

  return levels;
}

/**
 * Return ids of nodes that are runnable right now: their own status is
 * "pending" and every dependency's status is "complete".
 */
export function readyNodes(
  nodes: PlannedNode[],
  statusByNodeId: Record<string, string>,
): string[] {
  const ready: string[] = [];
  for (const node of nodes) {
    if (statusByNodeId[node.id] !== "pending") continue;
    const depsComplete = node.depends_on.every(
      (dep) => statusByNodeId[dep] === "complete",
    );
    if (depsComplete) ready.push(node.id);
  }
  return ready;
}

// ─── W8: single-vs-multi-agent pre-gate (MasRouter, arXiv:2502.11133) ────
//
// Before spending a model call on `hivePlanner.planDag`, decide with a cheap,
// deterministic heuristic whether the task even needs a multi-node DAG. The
// Mar-2026 orchestration survey (doi.org/10.3390/fi18060326) measures
// +58-285% token overhead from multi-agent decomposition on tasks that were
// simple enough for a single agent. Gate that overhead out before it starts.

export type TaskComplexityMode = "single" | "dag";

export interface TaskComplexityVerdict {
  mode: TaskComplexityMode;
  reason: string;
  roles?: string[];
}

// Verbs whose presence (as distinct lemmas) signals a distinct sub-task/role.
// Kept small and human-auditable rather than an NLP model — this must stay a
// zero-cost, zero-latency, deterministic heuristic (no model call).
const DOMAIN_VERBS = [
  "research",
  "design",
  "write",
  "build",
  "implement",
  "test",
  "review",
  "deploy",
  "analyze",
  "summarize",
  "translate",
  "document",
  "refactor",
  "debug",
  "optimize",
  "audit",
  "migrate",
  "benchmark",
  "compare",
  "draft",
  "edit",
  "publish",
  "plan",
  "schedule",
  "negotiate",
];

// Rough role hint per domain verb, used only as a planner-prompt nudge.
const VERB_TO_ROLE: Record<string, string> = {
  research: "researcher",
  design: "designer",
  write: "writer",
  build: "builder",
  implement: "builder",
  test: "tester",
  review: "reviewer",
  deploy: "deployer",
  analyze: "analyst",
  summarize: "summarizer",
  translate: "translator",
  document: "writer",
  refactor: "builder",
  debug: "builder",
  optimize: "builder",
  audit: "reviewer",
  migrate: "builder",
  benchmark: "analyst",
  compare: "analyst",
  draft: "writer",
  edit: "writer",
  publish: "deployer",
  plan: "planner",
  schedule: "planner",
  negotiate: "negotiator",
};

const ENUMERATION_RE = /(^|\n)\s*(\d+[.)]|[-*•])\s+\S/m;
const SEQUENCING_RE =
  /\b(and then|then |after that|followed by|next,|finally,|first,|step\s*\d|phase\s*\d)\b/i;
const MULTI_PART_RE = /\b(and also|as well as|in addition to|along with)\b/i;

// Above this word count alone a prompt is treated as "probably compound" even
// without other markers, since real single-shot asks are rarely this long.
const LONG_PROMPT_WORD_COUNT = 120;
// A budget at/above this is read as a signal the requester expects several
// specialists' worth of work, not a hard cutoff by itself.
const LARGE_BUDGET_THRESHOLD = 200;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countDistinctDomainVerbs(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const verb of DOMAIN_VERBS) {
    // Match the verb as a whole word (allow common inflections: -s, -ed, -ing).
    const re = new RegExp(`\\b${verb}(e?s|e?d|ing)?\\b`, "i");
    if (re.test(lower)) found.add(verb);
  }
  return Array.from(found);
}

/**
 * Pure, deterministic pre-gate for W8 (MasRouter-style single-vs-multi-agent
 * routing). No model call: word count, enumeration/sequencing markers, budget
 * size, and distinct domain-verb count decide whether the task can run as a
 * single node or needs a full planner-built DAG.
 *
 * Deliberately conservative: DAG is the fallback whenever signals conflict or
 * are weak, since a wrongly-collapsed compound task is worse than an
 * unnecessary (but still correct) DAG.
 */
export function classifyTaskComplexity(
  description: string,
  successCriteria?: string,
  maxBudget?: number,
): TaskComplexityVerdict {
  const text = `${description ?? ""}\n${successCriteria ?? ""}`.trim();

  if (!text) {
    return { mode: "single", reason: "empty description" };
  }

  const words = wordCount(text);
  const verbs = countDistinctDomainVerbs(text);
  const hasEnumeration = ENUMERATION_RE.test(text);
  const hasSequencing = SEQUENCING_RE.test(text);
  const hasMultiPart = MULTI_PART_RE.test(text);
  const largeBudget =
    typeof maxBudget === "number" && maxBudget >= LARGE_BUDGET_THRESHOLD;

  const signals: string[] = [];
  if (hasEnumeration) signals.push("enumerated list of deliverables");
  if (hasSequencing) signals.push("explicit step/phase sequencing language");
  if (hasMultiPart) signals.push("multi-part connective (and also/as well as)");
  if (verbs.length >= 3) signals.push(`${verbs.length} distinct task verbs (${verbs.join(", ")})`);
  if (words >= LONG_PROMPT_WORD_COUNT) signals.push(`long prompt (${words} words)`);

  // Strong single-signal triggers: any one of these alone is enough evidence
  // of a compound task to justify the DAG's overhead.
  const strongTrigger =
    hasEnumeration || hasSequencing || (hasMultiPart && verbs.length >= 2);

  // Weak evidence needs to stack: 2+ distinct domain verbs plus either a long
  // prompt or a large budget together imply multiple specialist roles.
  const weakStack = verbs.length >= 2 && (words >= LONG_PROMPT_WORD_COUNT || largeBudget);

  if (strongTrigger || weakStack || verbs.length >= 3) {
    const roles = Array.from(
      new Set(verbs.map((v) => VERB_TO_ROLE[v]).filter((r): r is string => Boolean(r))),
    );
    return {
      mode: "dag",
      reason: signals.length > 0 ? signals.join("; ") : "multiple distinct task verbs",
      roles: roles.length > 0 ? roles : undefined,
    };
  }

  return {
    mode: "single",
    reason:
      words < LONG_PROMPT_WORD_COUNT
        ? "short, single-deliverable prompt with no sequencing/enumeration markers"
        : "long prompt but no compound-task markers (enumeration/sequencing/multi-verb) found",
  };
}
