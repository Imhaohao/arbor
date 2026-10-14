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
import { Treeling } from "@/components/grove/Treeling";
import { Button } from "@/components/ui/Button";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { PaperPlaneTilt, WarningDiamond } from "@phosphor-icons/react";
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
const READINESS_TONE: Record<string, PillTone> = {
  ready: "success",
  needs_key: "warning",
  protocol_mismatch: "warning",
  endpoint_down: "danger",
  mock_only: "neutral",
  needs_owner_action: "info",
  unknown: "neutral",
  checking: "neutral",
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
  return (
    <Pill tone={READINESS_TONE[status] ?? "neutral"} className="shrink-0">
      {readinessLabel(status)}
    </Pill>
  );
}

const TURN_CLASS: Record<ChatTurn["role"], string> = {
  user: "bg-ink text-paper",
  agent: "bg-surface-muted text-ink",
  system: "bg-danger-50 text-danger-700",
};

const CONTROL_INPUT =
  "w-full rounded-control border border-line-control/60 bg-surface px-3 text-sm text-ink outline-none focus:shadow-ring disabled:opacity-50";

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

function useAgentReadiness() {
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

  return { readinessByAgent, readinessStatusFor };
}

function pickDefaultSpecialist(previous: string, loaded: A2ASpecialist[]): string {
  return previous || loaded.find((s) => s.chat_ready)?.agent_id || loaded[0].agent_id;
}

function useSpecialistDirectory() {
  const [specialists, setSpecialists] = useState<A2ASpecialist[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);

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
          setSelected((prev) => pickDefaultSpecialist(prev, next));
        }
      })
      .catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : "admin specialist load failed",
        );
        setSpecialists([]);
      });
  }, []);

  return { specialists, selected, setSelected, loadError };
}

function errorTurn(err: unknown, fallback: string): ChatTurn {
  return { role: "system", text: err instanceof Error ? err.message : fallback };
}

type ParsedBody = { parsed: true; value: any } | { parsed: false }; // eslint-disable-line @typescript-eslint/no-explicit-any

function tryParseJson(bodyText: string): ParsedBody {
  try {
    return { parsed: true, value: JSON.parse(bodyText) };
  } catch {
    return { parsed: false };
  }
}

function nonJsonTurn(status: number, bodyText: string): ChatTurn {
  const snippet = bodyText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  const gatewayHint =
    status === 504 || status === 502
      ? " (gateway timeout: the agent was too slow or unreachable)"
      : "";
  return {
    role: "system",
    text: `Agent endpoint returned a non-JSON ${status} response${gatewayHint}${
      snippet ? `: ${snippet}` : ""
    }`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agentReplyTurn(d: any): ChatTurn {
  return {
    role: "agent",
    text: d.reply_text || "(empty reply)",
    state: d.state,
    pending: d.pending,
    taskId: d.task_id,
    raw: d.raw,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function failureTurn(d: any): ChatTurn {
  return { role: "system", text: d.error || "request failed", raw: d.raw };
}

function ReadinessWarning({
  spec,
  status,
  requiredKeyEnv,
}: {
  spec: A2ASpecialist;
  status: string;
  requiredKeyEnv?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 bg-warning-50 px-4 py-2.5 text-[0.8125rem] text-warning-900"
    >
      <WarningDiamond size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-warning-700" />
      <div>
      <p className="font-medium">
        Readiness matrix says {spec.display_name} is &quot;
        {readinessLabel(status)}&quot;.
      </p>
      <p className="mt-0.5">
        Sending a message here still makes a real call to its
        endpoint, and it will likely fail, time out, or return an
        error.
        {requiredKeyEnv ? ` Missing key: ${requiredKeyEnv}.` : ""}
      </p>
      </div>
    </div>
  );
}

function SpecialistRow({
  specialist: s,
  isSelected,
  readinessStatus,
  onSelect,
}: {
  specialist: A2ASpecialist;
  isSelected: boolean;
  readinessStatus: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className={`flex min-h-12 w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm outline-none focus-visible:shadow-ring ${
          isSelected
            ? "bg-surface-muted shadow-hairline-strong"
            : "hover:bg-surface-subtle"
        }`}
      >
        <Treeling
          seed={s.agent_id}
          name={s.display_name}
          size={32}
          alive={false}
          asleep={!s.chat_ready}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-ink">
              {s.display_name}
            </span>
            <ReadinessBadge status={readinessStatus} />
          </span>
          <span className="type-data block truncate text-xs text-ink-muted">
            {s.agent_id}
          </span>
          {(s.discovered || !s.chat_ready) && (
            <span className="block truncate text-xs text-ink-muted">
              {s.discovered ? "Discovered" : ""}
              {s.discovered && !s.chat_ready ? ", " : ""}
              {!s.chat_ready ? "no direct A2A endpoint" : ""}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function SpecialistList({
  specialists,
  selected,
  loadError,
  readinessStatusFor,
  onSelect,
}: {
  specialists: A2ASpecialist[];
  selected: string;
  loadError: string | null;
  readinessStatusFor: (agentId: string) => string;
  onSelect: (agentId: string) => void;
}) {
  return (
    <aside>
      <h2 className="type-subheading mb-2 text-ink">Specialists</h2>
      <ul className="relative max-h-[70vh] space-y-1 overflow-y-auto rounded-card bg-surface p-2 shadow-card">
        {specialists.map((s) => (
          <SpecialistRow
            key={s.agent_id}
            specialist={s}
            isSelected={s.agent_id === selected}
            readinessStatus={readinessStatusFor(s.agent_id)}
            onSelect={() => onSelect(s.agent_id)}
          />
        ))}
        {specialists.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-muted" role={loadError ? "alert" : undefined}>
            {loadError ?? "No specialists loaded."}
          </li>
        )}
      </ul>
    </aside>
  );
}

function ChatHeader({ spec }: { spec: A2ASpecialist | undefined }) {
  return (
    <div className="px-4 py-3 shadow-[0_1px_0_oklch(var(--line))]">
      <p className="type-subheading text-ink">
        {spec?.display_name ?? "Select a specialist"}
      </p>
      {spec && (
        <p
          className="type-data truncate text-xs text-ink-muted"
          title={spec.a2a_endpoint ?? spec.chat_unavailable_reason}
        >
          {spec.a2a_endpoint ??
            spec.chat_unavailable_reason ??
            "No endpoint configured"}
        </p>
      )}
    </div>
  );
}

function PickSpecialistPrompt() {
  return (
    <>
      <p className="text-sm font-medium text-ink">
        Pick a specialist on the left
      </p>
      <p className="text-sm text-ink-muted">
        This console sends a real A2A message/send call to that
        specialist&apos;s live endpoint and shows its actual
        reply. Nothing here is simulated.
      </p>
    </>
  );
}

function NoEndpointNotice({ spec }: { spec: A2ASpecialist }) {
  return (
    <>
      <p className="text-sm font-medium text-ink">
        {spec.display_name} has no direct A2A endpoint
      </p>
      <p className="text-sm text-ink-muted">
        {spec.chat_unavailable_reason ??
          "This specialist is listed on the market, but this console cannot message it directly."}
      </p>
    </>
  );
}

function ReadyToChatNotice({
  spec,
  onUseSuggestion,
}: {
  spec: A2ASpecialist;
  onUseSuggestion: () => void;
}) {
  return (
    <>
      <p className="text-sm text-ink-muted">{spec.one_liner}</p>
      <p className="text-[0.8125rem] text-ink-muted">
        Hitting Send makes a real message/send call to{" "}
        {spec.display_name}&apos;s endpoint. The reply you see
        here is what it actually returns.
      </p>
      <Button
        type="button"
        variant="soft"
        size="sm"
        onClick={onUseSuggestion}
        className="h-auto min-h-8 whitespace-normal py-1.5 text-left"
      >
        Use suggested message: &quot;{DEFAULT_PROMPT_SUGGESTION}&quot;
      </Button>
    </>
  );
}

function EmptyChatBody({
  spec,
  canChat,
  onUseSuggestion,
}: {
  spec: A2ASpecialist | undefined;
  canChat: boolean;
  onUseSuggestion: () => void;
}) {
  if (!spec) return <PickSpecialistPrompt />;
  if (!canChat) return <NoEndpointNotice spec={spec} />;
  return <ReadyToChatNotice spec={spec} onUseSuggestion={onUseSuggestion} />;
}

function EmptyChatState({
  spec,
  canChat,
  onUseSuggestion,
}: {
  spec: A2ASpecialist | undefined;
  canChat: boolean;
  onUseSuggestion: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center">
      <Treeling
        seed={spec?.agent_id ?? "a2a-console"}
        name={spec?.display_name}
        asleep={!canChat}
        alive={false}
        size={72}
      />
      <EmptyChatBody spec={spec} canChat={canChat} onUseSuggestion={onUseSuggestion} />
    </div>
  );
}

function AgentTurnMeta({
  turn: t,
  isRawOpen,
  onToggleRaw,
}: {
  turn: ChatTurn;
  isRawOpen: boolean;
  onToggleRaw: () => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-muted">
      {t.state && (
        <span>
          state: {t.state}{t.pending ? " (pending)" : ""}
        </span>
      )}
      {t.raw !== undefined && (
        <button
          type="button"
          aria-expanded={isRawOpen}
          className="rounded-full px-1 underline outline-none hover:text-brand-700 focus-visible:shadow-ring"
          onClick={onToggleRaw}
        >
          {isRawOpen ? "Hide raw" : "Show raw"}
        </button>
      )}
    </div>
  );
}

function TurnBubble({
  turn: t,
  isRawOpen,
  onToggleRaw,
}: {
  turn: ChatTurn;
  isRawOpen: boolean;
  onToggleRaw: () => void;
}) {
  return (
    <div className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div
        role={t.role === "system" ? "alert" : undefined}
        className={`max-w-[85%] rounded-control px-3.5 py-2.5 text-sm leading-relaxed ${TURN_CLASS[t.role]}`}
      >
        <p className="whitespace-pre-wrap break-words">{t.text}</p>
        {t.role === "agent" && (
          <AgentTurnMeta turn={t} isRawOpen={isRawOpen} onToggleRaw={onToggleRaw} />
        )}
        {isRawOpen && t.raw !== undefined && (
          <pre tabIndex={0} className="type-data mt-2 max-h-64 overflow-auto rounded-control bg-surface-sunken p-2 text-xs leading-snug text-ink outline-none focus-visible:shadow-ring">
            {JSON.stringify(t.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function KeyPromptForm({
  keyInput,
  savingKey,
  onKeyInputChange,
  onSubmit,
}: {
  keyInput: string;
  savingKey: boolean;
  onKeyInputChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-2 bg-warning-50 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="min-w-48 flex-1">
        <span className="mb-1 block text-[0.8125rem] font-medium text-warning-900">
          This agent needs an API key
        </span>
        <input
          value={keyInput}
          onChange={(e) => onKeyInputChange(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="Paste API key"
          className={`${CONTROL_INPUT} type-data h-10`}
        />
      </label>
      <Button type="submit" disabled={savingKey || !keyInput.trim()}>
        {savingKey ? "Saving…" : "Save key"}
      </Button>
    </form>
  );
}

function MessageForm({
  spec,
  input,
  canChat,
  sending,
  onInputChange,
  onSubmit,
}: {
  spec: A2ASpecialist | undefined;
  input: string;
  canChat: boolean;
  sending: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex items-end gap-2 px-3 py-3 shadow-[0_-1px_0_oklch(var(--line))]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex-1">
        <span className="mb-1 block text-[0.8125rem] font-medium text-ink-soft">Message</span>
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={spec ? `Message ${spec.display_name}` : "Select a specialist first"}
          disabled={!canChat || sending}
          className={`${CONTROL_INPUT} h-10`}
        />
      </label>
      <Button type="submit" disabled={!canChat || sending || !input.trim()}>
        <PaperPlaneTilt size={14} weight="bold" aria-hidden />
        Send
      </Button>
    </form>
  );
}

function Transcript({
  turns,
  spec,
  canChat,
  sending,
  rawOpen,
  bottomRef,
  onToggleRaw,
  onUseSuggestion,
}: {
  turns: ChatTurn[];
  spec: A2ASpecialist | undefined;
  canChat: boolean;
  sending: boolean;
  rawOpen: number | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onToggleRaw: (index: number) => void;
  onUseSuggestion: () => void;
}) {
  return (
    <div className="relative flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {turns.length === 0 && (
        <EmptyChatState spec={spec} canChat={canChat} onUseSuggestion={onUseSuggestion} />
      )}
      {turns.map((t, i) => (
        <TurnBubble
          key={i}
          turn={t}
          isRawOpen={rawOpen === i}
          onToggleRaw={() => onToggleRaw(i)}
        />
      ))}
      {sending && (
        <p className="text-xs text-ink-muted">
          Waiting for {spec?.display_name ?? "agent"}…
        </p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function describeSelectedSpecialist(
  specialists: A2ASpecialist[],
  selected: string,
  readinessStatusFor: (agentId: string) => string,
  readinessByAgent: Map<string, AgentReadinessRow>,
) {
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
  return { spec, canChat, specReadinessStatus, specReadinessRow, showReadinessWarning };
}

export default function AdminPage() {
  const { specialists, selected, setSelected, loadError } = useSpecialistDirectory();
  const [turnsByAgent, setTurnsByAgent] = useState<Record<string, ChatTurn[]>>({});
  const [threadByAgent, setThreadByAgent] = useState<Record<string, A2AThreadIds>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
  const { readinessByAgent, readinessStatusFor } = useAgentReadiness();

  const turns = turnsByAgent[selected] ?? [];
  const { spec, canChat, specReadinessStatus, specReadinessRow, showReadinessWarning } =
    describeSelectedSpecialist(specialists, selected, readinessStatusFor, readinessByAgent);

  // Scroll only the transcript box; scrollIntoView would also move the window
  // and make the page jump on load.
  useEffect(() => {
    const transcript = bottomRef.current?.parentElement;
    if (transcript) transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  function pushTurn(agentId: string, turn: ChatTurn) {
    setTurnsByAgent((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), turn],
    }));
  }

  function applyAgentReply(agentId: string, d: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    setThreadByAgent((prev) => {
      const current = prev[agentId] ?? {};
      return {
        ...prev,
        [agentId]: nextA2AThread(current, d),
      };
    });
    pushTurn(agentId, agentReplyTurn(d));
  }

  function applyAgentFailure(agentId: string, d: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (d.needs_key) {
      setKeyPromptByAgent((prev) => ({ ...prev, [agentId]: true }));
    }
    pushTurn(agentId, failureTurn(d));
  }

  async function deliverMessage(agentId: string, text: string) {
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
    const body = tryParseJson(bodyText);
    if (!body.parsed) {
      pushTurn(agentId, nonJsonTurn(res.status, bodyText));
      return;
    }
    if (body.value.ok) applyAgentReply(agentId, body.value);
    else applyAgentFailure(agentId, body.value);
  }

  async function send() {
    const text = input.trim();
    if (!text || !selected || !canChat || sending) return;
    const agentId = selected;
    setInput("");
    setSending(true);
    pushTurn(agentId, { role: "user", text });
    try {
      await deliverMessage(agentId, text);
    } catch (err) {
      pushTurn(agentId, errorTurn(err, "network error"));
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
          text: "API key saved to the Arbor key vault. Send your message again.",
        });
      } else {
        pushTurn(agentId, {
          role: "system",
          text: `failed to save key: ${d.error || "unknown error"}`,
        });
      }
    } catch (err) {
      pushTurn(agentId, errorTurn(err, "network error saving key"));
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <PageShell
      title="A2A console"
      subtitle="Talk directly to any specialist reachable over the A2A protocol. Messages go out as real message/send calls to the agent's endpoint."
    >
      <div className="grid animate-fade-up grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <SpecialistList
          specialists={specialists}
          selected={selected}
          loadError={loadError}
          readinessStatusFor={readinessStatusFor}
          onSelect={setSelected}
        />

        <section className="flex min-h-[480px] flex-col overflow-hidden rounded-card bg-surface shadow-card">
          <ChatHeader spec={spec} />

          {showReadinessWarning && spec && (
            <ReadinessWarning
              spec={spec}
              status={specReadinessStatus!}
              requiredKeyEnv={specReadinessRow?.required_key_env}
            />
          )}

          <Transcript
            turns={turns}
            spec={spec}
            canChat={canChat}
            sending={sending}
            rawOpen={rawOpen}
            bottomRef={bottomRef}
            onToggleRaw={(index) => setRawOpen(rawOpen === index ? null : index)}
            onUseSuggestion={() => setInput(DEFAULT_PROMPT_SUGGESTION)}
          />

          {spec && keyPromptByAgent[selected] && (
            <KeyPromptForm
              keyInput={keyInput}
              savingKey={savingKey}
              onKeyInputChange={setKeyInput}
              onSubmit={() => void saveKey()}
            />
          )}

          <MessageForm
            spec={spec}
            input={input}
            canChat={canChat}
            sending={sending}
            onInputChange={setInput}
            onSubmit={() => void send()}
          />
        </section>
      </div>

      <AdminInsights />
    </PageShell>
  );
}
