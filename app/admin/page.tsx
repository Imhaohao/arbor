"use client";

/**
 * Admin console: direct A2A chat with any registered specialist.
 *
 * Pick any listed specialist, then send messages to specialists with an
 * a2a_endpoint over the A2A protocol (message/send via /api/admin/a2a-chat).
 * contextId is threaded so multi-turn conversations stay coherent on
 * agents that support it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageShell } from "@/components/ui/PageShell";
import { AdminInsights } from "@/components/admin/AdminInsights";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import {
  buildAdminA2AChatBody,
  nextA2AThread,
  type A2AThreadIds,
} from "@/lib/specialists/a2a-chat-threading";

interface A2ASpecialist {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  tier?: string;
  a2a_endpoint?: string;
  chat_ready: boolean;
  chat_unavailable_reason?: string;
  discovered: boolean;
}

// Mirrors the `agent_readiness` rows rendered by the dashboard's readiness
// matrix (components/dashboard/SpecialistReadiness.tsx, backed by
// convex/agentReadiness.ts:list). We only read the fields this console needs
// — this is the same source of truth, not a second one.
interface AgentReadinessRow {
  agent_id: string;
  readiness_status?: string;
  transport_status: string;
  required_key_env?: string;
  note?: string;
}

/**
 * Same vocabulary + colour language as STATUS_STYLE in
 * components/dashboard/SpecialistReadiness.tsx, so the two surfaces agree.
 * "checking" (query still loading) and "unknown" (no readiness row for this
 * agent) are additions specific to this console — neither is a real status
 * from that table, and neither is styled as positive/green.
 */
const READINESS_STYLE: Record<string, string> = {
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  needs_key: "bg-amber-50 text-amber-700 ring-amber-600/20",
  protocol_mismatch: "bg-orange-50 text-orange-700 ring-orange-600/20",
  endpoint_down: "bg-rose-50 text-rose-700 ring-rose-600/20",
  mock_only: "bg-slate-100 text-slate-600 ring-slate-500/20",
  needs_owner_action: "bg-violet-50 text-violet-700 ring-violet-600/20",
  unknown: "bg-slate-100 text-slate-500 ring-slate-500/20",
  checking: "bg-slate-100 text-slate-400 ring-slate-400/20",
};

const READINESS_LABEL: Record<string, string> = {
  needs_key: "needs key",
  protocol_mismatch: "protocol mismatch",
  endpoint_down: "endpoint down",
  mock_only: "mock only",
  needs_owner_action: "needs owner action",
  checking: "checking",
};

function readinessLabel(status: string): string {
  return READINESS_LABEL[status] ?? status.replace(/_/g, " ");
}

/** Readiness statuses that mean "this specialist will most likely not answer
 * right now" — used to decide whether to show the pre-send warning. */
const NON_RESPONSIVE_STATUSES = new Set([
  "needs_key",
  "protocol_mismatch",
  "endpoint_down",
  "mock_only",
  "needs_owner_action",
]);

function ReadinessBadge({ status }: { status: string }) {
  const style = READINESS_STYLE[status] ?? READINESS_STYLE.unknown;
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${style}`}
    >
      {readinessLabel(status)}
    </span>
  );
}

// Shown as a clickable suggestion in the chat pane's empty state, so a
// first-time visitor sees what a reasonable opening message looks like.
const DEFAULT_PROMPT_SUGGESTION =
  "What can you help me with, and what does a typical request look like?";

interface ChatTurn {
  role: "user" | "agent" | "system";
  text: string;
  state?: string;
  pending?: boolean;
  taskId?: string;
  raw?: unknown;
}

export default function AdminPage() {
  const [specialists, setSpecialists] = useState<A2ASpecialist[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [turnsByAgent, setTurnsByAgent] = useState<Record<string, ChatTurn[]>>({});
  const [threadByAgent, setThreadByAgent] = useState<Record<string, A2AThreadIds>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState<number | null>(null);
  // Agents that declined for a missing API key — shows the paste-key form.
  const [keyPromptByAgent, setKeyPromptByAgent] = useState<Record<string, boolean>>({});
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Same readiness data the dashboard's agent readiness matrix renders
  // (convex/agentReadiness.ts:list, consumed at
  // components/dashboard/SpecialistReadiness.tsx:105). Convex useQuery
  // returns undefined while loading — keep that distinct from "no row found"
  // so we never show a fake-positive badge during load.
  const readinessRows = useQuery(api.agentReadiness.list, {}) as
    | AgentReadinessRow[]
    | undefined;
  const readinessByAgent = useMemo(() => {
    const map = new Map<string, AgentReadinessRow>();
    for (const row of readinessRows ?? []) map.set(row.agent_id, row);
    return map;
  }, [readinessRows]);

  function readinessStatusFor(agentId: string): string {
    if (readinessRows === undefined) return "checking";
    const row = readinessByAgent.get(agentId);
    if (!row) return "unknown";
    return row.readiness_status ?? row.transport_status ?? "unknown";
  }

  useEffect(() => {
    fetch("/api/admin/a2a-chat")
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`admin specialist load failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => {
        const next = (d.specialists ?? []) as A2ASpecialist[];
        setLoadError(null);
        setSpecialists(next);
        if (next.length) {
          setSelected(
            (prev) =>
              prev ||
              next.find((s) => s.chat_ready)?.agent_id ||
              next[0].agent_id,
          );
        }
      })
      .catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : "admin specialist load failed",
        );
        setSpecialists([]);
      });
  }, []);

  const turns = turnsByAgent[selected] ?? [];
  const spec = specialists.find((s) => s.agent_id === selected);
  const canChat = Boolean(spec?.chat_ready && spec.a2a_endpoint);
  const specReadinessStatus = spec ? readinessStatusFor(spec.agent_id) : undefined;
  const specReadinessRow = spec ? readinessByAgent.get(spec.agent_id) : undefined;
  // The A2A endpoint exists (canChat) but the readiness matrix says it
  // probably won't answer. We still let the operator send — a down endpoint
  // is a legitimate thing to probe — we just warn honestly before they type.
  const showReadinessWarning = Boolean(
    canChat && specReadinessStatus && NON_RESPONSIVE_STATUSES.has(specReadinessStatus),
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  function pushTurn(agentId: string, turn: ChatTurn) {
    setTurnsByAgent((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), turn],
    }));
  }

  async function send() {
    const text = input.trim();
    if (!text || !selected || !canChat || sending) return;
    const agentId = selected;
    setInput("");
    setSending(true);
    pushTurn(agentId, { role: "user", text });
    try {
      const res = await fetch("/api/admin/a2a-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildAdminA2AChatBody(agentId, text, threadByAgent[agentId]),
        ),
      });
      // The reply may be a gateway/HTML error page (timeout, 5xx) rather than
      // JSON — read text first and parse defensively so the user sees the real
      // status instead of a raw "Unexpected token '<'" parse crash.
      const bodyText = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let d: any;
      try {
        d = JSON.parse(bodyText);
      } catch {
        const snippet = bodyText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
        pushTurn(agentId, {
          role: "system",
          text: `Agent endpoint returned a non-JSON ${res.status} response${
            res.status === 504 || res.status === 502
              ? " (gateway timeout — the agent was too slow or unreachable)"
              : ""
          }${snippet ? `: ${snippet}` : ""}`,
        });
        return;
      }
      if (d.ok) {
        setThreadByAgent((prev) => {
          const current = prev[agentId] ?? {};
          return {
            ...prev,
            [agentId]: nextA2AThread(current, d),
          };
        });
        pushTurn(agentId, {
          role: "agent",
          text: d.reply_text || "(empty reply)",
          state: d.state,
          pending: d.pending,
          taskId: d.task_id,
          raw: d.raw,
        });
      } else {
        if (d.needs_key) {
          setKeyPromptByAgent((prev) => ({ ...prev, [agentId]: true }));
        }
        pushTurn(agentId, {
          role: "system",
          text: d.error || "request failed",
          raw: d.raw,
        });
      }
    } catch (err) {
      pushTurn(agentId, {
        role: "system",
        text: err instanceof Error ? err.message : "network error",
      });
    } finally {
      setSending(false);
    }
  }

  async function saveKey() {
    const key = keyInput.trim();
    if (!key || !selected || savingKey) return;
    const agentId = selected;
    setSavingKey(true);
    try {
      const res = await fetch("/api/admin/a2a-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, api_key: key }),
      });
      const d = await res.json();
      if (d.ok) {
        setKeyInput("");
        setKeyPromptByAgent((prev) => ({ ...prev, [agentId]: false }));
        pushTurn(agentId, {
          role: "system",
          text: "API key saved to the Arbor key vault — send your message again.",
        });
      } else {
        pushTurn(agentId, {
          role: "system",
          text: `failed to save key: ${d.error || "unknown error"}`,
        });
      }
    } catch (err) {
      pushTurn(agentId, {
        role: "system",
        text: err instanceof Error ? err.message : "network error saving key",
      });
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <PageShell
      title="A2A console"
      subtitle="Talk directly to any specialist reachable over the A2A protocol. Messages go out as real message/send calls to the agent's endpoint."
    >
      <div className="grid animate-fade-up gap-6 md:grid-cols-[260px_1fr]">
        <aside>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Specialists
          </h2>
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {specialists.map((s) => (
              <li key={s.agent_id}>
                <button
                  type="button"
                  onClick={() => setSelected(s.agent_id)}
                  aria-label={s.display_name}
                  aria-pressed={s.agent_id === selected}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    s.agent_id === selected
                      ? "bg-brand-700 text-white"
                      : "text-ink hover:bg-black/5"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">
                      {s.display_name}
                    </span>
                    <ReadinessBadge status={readinessStatusFor(s.agent_id)} />
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      s.agent_id === selected ? "text-white/70" : "text-ink-muted"
                    }`}
                  >
                    {s.agent_id}
                    {s.discovered ? " (discovered)" : ""}
                    {!s.chat_ready ? " — no direct A2A endpoint" : ""}
                  </span>
                </button>
              </li>
            ))}
            {specialists.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">
                {loadError ?? "No specialists loaded."}
              </li>
            )}
          </ul>
        </aside>

        <section className="flex min-h-[480px] flex-col rounded-xl border border-black/10 bg-white">
          <div className="border-b border-black/10 px-4 py-3">
            <p className="text-sm font-medium text-ink">
              {spec?.display_name ?? "Select a specialist"}
            </p>
            {spec && (
              <p
                className="truncate text-xs text-ink-muted"
                title={spec.a2a_endpoint ?? spec.chat_unavailable_reason}
              >
                {spec.a2a_endpoint ??
                  spec.chat_unavailable_reason ??
                  "No endpoint configured"}
              </p>
            )}
          </div>

          {showReadinessWarning && spec && (
            <div
              role="alert"
              className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800"
            >
              <p className="font-medium">
                Readiness matrix says {spec.display_name} is &quot;
                {readinessLabel(specReadinessStatus!)}&quot;.
              </p>
              <p className="mt-0.5">
                Sending a message here still makes a real call to its
                endpoint — it will likely fail, time out, or return an
                error.
                {specReadinessRow?.required_key_env
                  ? ` Missing key: ${specReadinessRow.required_key_env}.`
                  : ""}
              </p>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center">
                {!spec ? (
                  <>
                    <p className="text-sm font-medium text-ink">
                      Pick a specialist on the left
                    </p>
                    <p className="text-sm text-ink-muted">
                      This console sends a real A2A message/send call to that
                      specialist&apos;s live endpoint and shows its actual
                      reply — nothing here is simulated.
                    </p>
                  </>
                ) : !canChat ? (
                  <>
                    <p className="text-sm font-medium text-ink">
                      {spec.display_name} has no direct A2A endpoint
                    </p>
                    <p className="text-sm text-ink-muted">
                      {spec.chat_unavailable_reason ??
                        "This specialist is listed on the market, but this console cannot message it directly."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-ink-muted">{spec.one_liner}</p>
                    <p className="text-xs text-ink-muted">
                      Hitting Send makes a real message/send call to{" "}
                      {spec.display_name}&apos;s endpoint. The reply you see
                      here is what it actually returns.
                    </p>
                    <button
                      type="button"
                      aria-label="Use a suggested first message"
                      onClick={() => setInput(DEFAULT_PROMPT_SUGGESTION)}
                      className="rounded-lg border border-black/10 bg-surface-muted px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-black/5"
                    >
                      Try: &quot;{DEFAULT_PROMPT_SUGGESTION}&quot;
                    </button>
                  </>
                )}
              </div>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    t.role === "user"
                      ? "bg-brand-700 text-white"
                      : t.role === "agent"
                        ? "bg-black/5 text-ink"
                        : "border border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{t.text}</p>
                  {t.role === "agent" && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-muted">
                      {t.state && (
                        <span>
                          state: {t.state}{t.pending ? " (pending)" : ""}
                        </span>
                      )}
                      {t.raw !== undefined && (
                        <button
                          className="underline hover:text-brand-700"
                          onClick={() => setRawOpen(rawOpen === i ? null : i)}
                        >
                          {rawOpen === i ? "hide raw" : "raw"}
                        </button>
                      )}
                    </div>
                  )}
                  {rawOpen === i && t.raw !== undefined && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/80 p-2 text-[11px] leading-snug text-green-200">
                      {JSON.stringify(t.raw, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <p className="text-xs text-ink-muted">
                Waiting for {spec?.display_name ?? "agent"}...
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {spec && keyPromptByAgent[selected] && (
            <form
              className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveKey();
              }}
            >
              <span className="text-xs font-medium text-amber-800">
                This agent needs an API key
              </span>
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                type="password"
                placeholder="Paste API key"
                className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand-700"
              />
              <button
                type="submit"
                disabled={savingKey || !keyInput.trim()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {savingKey ? "Saving..." : "Save key"}
              </button>
            </form>
          )}

          <form
            className="flex items-center gap-2 border-t border-black/10 px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={spec ? `Message ${spec.display_name}` : "Select a specialist first"}
              disabled={!canChat || sending}
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand-700 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canChat || sending || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
            >
              <PaperPlaneTilt size={14} weight="bold" />
              Send
            </button>
          </form>
        </section>
      </div>

      <AdminInsights />
    </PageShell>
  );
}
