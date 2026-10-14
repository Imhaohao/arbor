"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Treeling } from "@/components/grove/Treeling";
import { Pill } from "@/components/ui/Pill";
import { MarkdownLite } from "./MarkdownLite";
import {
  CheckCircle,
  CircleNotch,
  CreditCard,
  FileCode,
  FileText,
  GithubLogo,
  GoogleDriveLogo,
  Lightning,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { useStickToLatest } from "@/lib/use-stick-to-latest";
import type { LifecycleEventDoc, TaskDoc } from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  events: LifecycleEventDoc[];
}

interface DiagnosisReadyPayload {
  source: "drive" | "live" | "fallback";
  diagnosis: string;
  source_doc?: {
    filename: string;
    source_kind: string;
    drive_path?: string;
  } | null;
}

interface DriveDocPayload {
  filename: string;
  source_kind: string;
  drive_path?: string;
  via?: string;
  duration_ms?: number;
}

interface V0StartedPayload {
  mcp_endpoint: string;
  model: string;
  target_path: string;
}

interface V0DonePayload {
  patch_source: "v0" | "rule_based" | "docs";
  mcp_endpoint: string;
  model: string;
  target_path: string;
  ops_applied: string[];
  ops_missing: string[];
  duration_ms: number;
  patch_size_chars: number;
  patch_preview: string;
}

interface PrOpenedPayload {
  url: string;
  number: number;
  patch_source: "llm" | "hardcoded_replace" | "docs_fallback";
  target_path: string;
}

interface SourceDonePayload {
  duration_ms?: number;
  document_count?: number;
  tool?: string;
  mode?: string;
  summary_preview?: string;
}

interface BidReceivedPayload {
  bid_id: string;
  agent_id: string;
  sponsor?: string;
  capability_claim?: string;
  estimated_seconds?: number;
}

interface BidDeclinedPayload {
  agent_id: string;
  reason: string;
}

interface AuctionResolvedBid {
  bid_id: string;
  agent_id: string;
  bid_price: number;
  score: number;
  capability_claim?: string;
  estimated_seconds?: number;
}

interface AuctionResolvedPayload {
  bids: AuctionResolvedBid[];
  winner: {
    bid_id: string;
    agent_id: string;
    bid_price: number;
    score: number;
    estimated_seconds?: number;
  };
  vickrey: {
    winner_bid_price: number;
    price_paid: number;
    rule: string;
  };
}

function find(events: LifecycleEventDoc[], type: string) {
  return events.find((e) => e.event_type === type);
}

function findAll(events: LifecycleEventDoc[], type: string) {
  return events.filter((e) => e.event_type === type);
}

interface DemoEvents {
  triggered: LifecycleEventDoc | undefined;
  diagnoseStarted: LifecycleEventDoc | undefined;
  driveDocFound: LifecycleEventDoc | undefined;
  hyperspellDone: LifecycleEventDoc | undefined;
  hyperspellSkipped: LifecycleEventDoc | undefined;
  niaDone: LifecycleEventDoc | undefined;
  niaSkipped: LifecycleEventDoc | undefined;
  diagnosisReady: LifecycleEventDoc | undefined;
  bidReceived: LifecycleEventDoc[];
  bidDeclined: LifecycleEventDoc[];
  auctionResolved: LifecycleEventDoc | undefined;
  paymentRequested: LifecycleEventDoc | undefined;
  paymentConfirmed: LifecycleEventDoc | undefined;
  v0Started: LifecycleEventDoc | undefined;
  v0Done: LifecycleEventDoc | undefined;
  fixStarted: LifecycleEventDoc | undefined;
  prOpened: LifecycleEventDoc | undefined;
  failed: LifecycleEventDoc | undefined;
}

function selectDemoEvents(events: LifecycleEventDoc[]): DemoEvents {
  return {
    triggered: find(events, "demo_triggered"),
    diagnoseStarted: find(events, "demo_diagnose_started"),
    driveDocFound: find(events, "demo_drive_doc_found"),
    hyperspellDone: find(events, "demo_hyperspell_done"),
    hyperspellSkipped: find(events, "demo_hyperspell_skipped"),
    niaDone: find(events, "demo_nia_done"),
    niaSkipped: find(events, "demo_nia_skipped"),
    diagnosisReady: find(events, "demo_diagnosis_ready"),
    bidReceived: findAll(events, "bid_received"),
    bidDeclined: findAll(events, "bid_declined"),
    auctionResolved: find(events, "auction_resolved"),
    paymentRequested: find(events, "demo_payment_requested"),
    paymentConfirmed: find(events, "demo_payment_confirmed"),
    v0Started: find(events, "demo_v0_started"),
    v0Done: find(events, "demo_v0_done"),
    fixStarted: find(events, "demo_fix_started"),
    prOpened: find(events, "demo_pr_opened"),
    failed: find(events, "demo_failed"),
  };
}

function auctionPayloadOf(demo: DemoEvents) {
  return demo.auctionResolved?.payload as AuctionResolvedPayload | undefined;
}

function prPayloadOf(demo: DemoEvents) {
  return demo.prOpened?.payload as PrOpenedPayload | undefined;
}

export function ConversionDropDemo({ task, events }: Props) {
  const demo = selectDemoEvents(events);
  const prPayload = prPayloadOf(demo);

  // Track a single signal that flips whenever any new content lands so the
  // auto-scroll fires at every meaningful step of the demo.
  const streamSignal = `${events.length}:${Boolean(demo.prOpened)}:${Boolean(demo.paymentConfirmed)}`;
  const { sentinelRef, hasNewBelow, scrollToLatest } =
    useStickToLatest(streamSignal);

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up">
        <CardHeader title="Conversion drop diagnostic" />
        <p className="text-sm text-ink-soft">{task.prompt}</p>
      </Card>

      <DiagnoseCard demo={demo} />
      <AuctionCard demo={demo} />
      <PaymentCard demo={demo} task={task} />
      <FixCard demo={demo} />

      {prPayload && (
        <FeedbackCard winnerAgentId={auctionPayloadOf(demo)?.winner.agent_id} />
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {hasNewBelow && (
        <button
          type="button"
          onClick={scrollToLatest}
          className={buttonClasses({ variant: "primary", className: "fixed bottom-6 left-1/2 z-30 -translate-x-1/2 animate-fade-up shadow-float" })}
        >
          <ArrowDown size={14} weight="bold" />
          See latest
        </button>
      )}
    </div>
  );
}

function sourceStatusProps(
  done: LifecycleEventDoc | undefined,
  skipped: LifecycleEventDoc | undefined,
  diagnoseStarted: boolean,
) {
  return {
    done: done?.payload as SourceDonePayload | undefined,
    skippedReason: skipped
      ? (skipped.payload as { reason?: string }).reason
      : undefined,
    pending: diagnoseStarted && !done && !skipped,
  };
}

function DiagnoseSources({ demo }: { demo: DemoEvents }) {
  const diagnoseStarted = Boolean(demo.diagnoseStarted);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SourceRow
        name="Hyperspell"
        kind="business"
        {...sourceStatusProps(demo.hyperspellDone, demo.hyperspellSkipped, diagnoseStarted)}
      />
      <SourceRow
        name="Nia"
        kind="repo"
        {...sourceStatusProps(demo.niaDone, demo.niaSkipped, diagnoseStarted)}
      />
    </div>
  );
}

function DiagnosisBody({
  payload,
  started,
}: {
  payload: DiagnosisReadyPayload | undefined;
  started: boolean;
}) {
  if (payload) {
    return (
      <div className="rounded-control bg-surface-muted p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">Diagnosis</span>
          <DiagnosisSourcePill payload={payload} />
        </div>
        <MarkdownLite text={payload.diagnosis} />
      </div>
    );
  }
  if (started) return <PendingRow text="Reading the analysis doc…" />;
  return null;
}

function DiagnoseCard({ demo }: { demo: DemoEvents }) {
  const drivePayload = demo.driveDocFound?.payload as
    | DriveDocPayload
    | undefined;
  const diagnosisPayload = demo.diagnosisReady?.payload as
    | DiagnosisReadyPayload
    | undefined;
  return (
    <Card className="animate-fade-up [animation-delay:60ms]">
      <CardHeader
        title="Diagnose"
        meta={
          <DiagnoseStatusPill
            started={Boolean(demo.diagnoseStarted || demo.triggered)}
            ready={Boolean(demo.diagnosisReady)}
          />
        }
      />
      <div className="space-y-3">
        {drivePayload && <DriveDocRow payload={drivePayload} />}
        <DiagnoseSources demo={demo} />
        <DiagnosisBody
          payload={diagnosisPayload}
          started={Boolean(demo.diagnoseStarted)}
        />
      </div>
    </Card>
  );
}

function AuctionCard({ demo }: { demo: DemoEvents }) {
  const { bidReceived, bidDeclined } = demo;
  const auctionStarted = bidReceived.length > 0 || bidDeclined.length > 0;
  return (
    <Card className="animate-fade-up [animation-delay:120ms]">
      <CardHeader
        title="Specialist auction"
        meta={
          <AuctionStatusPill
            started={auctionStarted}
            resolved={Boolean(demo.auctionResolved)}
          />
        }
      />
      {auctionStarted ? (
        <AuctionPanel
          bidReceived={bidReceived.map(
            (e) => e.payload as unknown as BidReceivedPayload,
          )}
          bidDeclined={bidDeclined.map(
            (e) => e.payload as unknown as BidDeclinedPayload,
          )}
          resolved={auctionPayloadOf(demo)}
          evaluatedCount={bidReceived.length + bidDeclined.length}
        />
      ) : (
        <p className="text-sm text-ink-muted">
          Opening sealed-bid auction across the marketplace…
        </p>
      )}
    </Card>
  );
}

function PaymentBody({ demo, task }: { demo: DemoEvents; task: TaskDoc }) {
  const auctionPayload = auctionPayloadOf(demo);
  if (demo.paymentConfirmed) {
    return (
      <PaymentConfirmedRow
        winnerAgentId={auctionPayload?.winner.agent_id}
        pricePaid={auctionPayload?.vickrey.price_paid ?? task.price_paid}
      />
    );
  }
  if (demo.paymentRequested && auctionPayload) {
    return (
      <ConfirmAndPayForm
        taskId={task._id as Id<"tasks">}
        winnerAgentId={auctionPayload.winner.agent_id}
        winnerBidPrice={auctionPayload.winner.bid_price}
        pricePaid={auctionPayload.vickrey.price_paid}
        rule={auctionPayload.vickrey.rule}
      />
    );
  }
  return (
    <p className="text-sm text-ink-muted">Waiting for the auction to resolve.</p>
  );
}

function PaymentCard({ demo, task }: { demo: DemoEvents; task: TaskDoc }) {
  return (
    <Card className="animate-fade-up [animation-delay:180ms]">
      <CardHeader
        title="Confirm and pay"
        meta={
          <PaymentStatusPill
            requested={Boolean(demo.paymentRequested)}
            confirmed={Boolean(demo.paymentConfirmed)}
          />
        }
      />
      <PaymentBody demo={demo} task={task} />
    </Card>
  );
}

function FixFailed({ failed }: { failed: LifecycleEventDoc }) {
  return (
    <div className="rounded-control bg-danger-50 p-4 text-sm text-danger-700">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Warning size={14} weight="bold" /> Fix step failed
      </div>
      {(failed.payload as { reason?: string }).reason}
    </div>
  );
}

function FixProgress({ demo }: { demo: DemoEvents }) {
  const v0DonePayload = demo.v0Done?.payload as V0DonePayload | undefined;
  const v0StartedPayload = demo.v0Started?.payload as
    | V0StartedPayload
    | undefined;
  if (v0DonePayload) return <V0Result payload={v0DonePayload} />;
  if (v0StartedPayload) return <V0Calling payload={v0StartedPayload} />;
  if (!demo.paymentConfirmed) {
    return (
      <p className="text-sm text-ink-muted">Waiting for payment confirmation.</p>
    );
  }
  return <PendingRow text="Handing the diagnosis to the winner…" />;
}

function FixPrAction({ demo }: { demo: DemoEvents }) {
  const prPayload = prPayloadOf(demo);
  if (prPayload) {
    return (
      <a
        href={prPayload.url}
        target="_blank"
        rel="noreferrer"
        className={buttonClasses({ variant: "primary" })}
      >
        <GithubLogo size={16} weight="fill" />
        View PR on GitHub
      </a>
    );
  }
  if (demo.v0Done) {
    return <PendingRow text="Committing the patch and opening the PR…" />;
  }
  return null;
}

function FixCard({ demo }: { demo: DemoEvents }) {
  return (
    <Card className="animate-fade-up [animation-delay:240ms]">
      <CardHeader
        title="Winner ships the fix"
        meta={
          <FixStatusPill
            started={Boolean(demo.fixStarted || demo.v0Started)}
            pr={Boolean(demo.prOpened)}
            failed={Boolean(demo.failed)}
          />
        }
      />
      {demo.failed ? (
        <FixFailed failed={demo.failed} />
      ) : (
        <div className="space-y-3">
          <FixProgress demo={demo} />
          <FixPrAction demo={demo} />
        </div>
      )}
    </Card>
  );
}

function FeedbackCard({
  winnerAgentId,
}: {
  winnerAgentId: string | undefined;
}) {
  const [choice, setChoice] = useState<"none" | "good" | "bad">("none");
  const agentLabel = winnerAgentId ? (
    <span className="type-data text-ink">{winnerAgentId}</span>
  ) : (
    <span>the winning specialist</span>
  );

  return (
    <Card className="animate-fade-up [animation-delay:300ms]">
      <CardHeader title="Was this a good solution?" />
      {choice === "none" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Did {agentLabel} actually solve the conversion drop the way
            you&rsquo;d expect? Your feedback flows back into the
            specialist&rsquo;s reputation score for future auctions.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChoice("good")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-control bg-moss-50 px-4 py-2.5 text-sm font-medium text-moss-700 transition-colors hover:bg-moss-100"
            >
              <ThumbsUp size={16} weight="bold" />
              Good solution
            </button>
            <button
              type="button"
              onClick={() => setChoice("bad")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-control bg-danger-50 px-4 py-2.5 text-sm font-medium text-danger-700 transition-colors hover:bg-danger-100"
            >
              <ThumbsDown size={16} weight="bold" />
              Needs more work
            </button>
          </div>
        </div>
      ) : (
        <div
          className={
            choice === "good"
              ? "flex items-start gap-3 rounded-control bg-moss-50 p-3 text-sm text-moss-800"
              : "flex items-start gap-3 rounded-control bg-danger-50 p-3 text-sm text-danger-800"
          }
        >
          {choice === "good" ? (
            <ThumbsUp size={18} weight="fill" className="mt-0.5 shrink-0 text-moss-600" />
          ) : (
            <ThumbsDown size={18} weight="fill" className="mt-0.5 shrink-0 text-danger-600" />
          )}
          <div>
            <div className="font-medium">
              {choice === "good"
                ? "Thanks. Reputation bumped."
                : "Thanks. Reputation noted."}
            </div>
            <p className="mt-0.5 text-xs">
              {choice === "good"
                ? "We'll prioritize this specialist on similar tasks next time."
                : "We'll deprioritize this specialist on similar tasks next time."}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function AuctionPanel({
  bidReceived,
  bidDeclined,
  resolved,
  evaluatedCount,
}: {
  bidReceived: BidReceivedPayload[];
  bidDeclined: BidDeclinedPayload[];
  resolved: AuctionResolvedPayload | undefined;
  evaluatedCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>
          <span className="type-data text-ink">{evaluatedCount}</span>{" "}
          specialists evaluated
        </span>
        <span className="text-moss-700">
          <span className="type-data">{bidReceived.length}</span> bid
        </span>
        <span className="text-warning-700">
          <span className="type-data">{bidDeclined.length}</span> declined
        </span>
      </div>

      <div className="space-y-2">
        {bidReceived.map((bid) => (
          <BidRow
            key={bid.bid_id}
            bid={bid}
            winnerId={resolved?.winner.agent_id}
            resolvedBids={resolved?.bids}
          />
        ))}
      </div>

      {bidDeclined.length > 0 && (
        <details className="rounded-control bg-surface-muted/60 p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            Declined ({bidDeclined.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {bidDeclined.map((d) => (
              <li
                key={d.agent_id}
                className="flex animate-fade-in items-start gap-2 text-xs text-ink-muted"
              >
                <XCircle
                  size={12}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-warning-500"
                />
                <span>
                  <span className="type-data text-ink-soft">{d.agent_id}</span>
                  <span className="text-ink-muted">: {d.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {resolved && <WinnerCard payload={resolved} />}
    </div>
  );
}

function BidRow({
  bid,
  winnerId,
  resolvedBids,
}: {
  bid: BidReceivedPayload;
  winnerId: string | undefined;
  resolvedBids: AuctionResolvedBid[] | undefined;
}) {
  const isWinner = winnerId === bid.agent_id;
  const resolved = resolvedBids?.find((b) => b.agent_id === bid.agent_id);
  return (
    <div
      className={
        isWinner
          ? "animate-fade-down rounded-control bg-brand-50 p-3 ring-1 ring-inset ring-brand-200"
          : "animate-fade-down rounded-control bg-surface p-3 shadow-hairline"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Treeling
          seed={bid.agent_id}
          size={32}
          alive={false}
          pose={isWinner ? "rest" : "raised"}
          lantern={isWinner}
        />
        <span className="type-data text-sm text-ink">{bid.agent_id}</span>
        {bid.sponsor && (
          <span className="text-xs text-ink-muted">{bid.sponsor}</span>
        )}
        {isWinner && (
          <Pill tone="brand">
            <Trophy size={11} weight="fill" /> winner
          </Pill>
        )}
        <span className="ml-auto flex items-center gap-2 type-data text-xs text-ink-muted">
          {resolved && <span>score {resolved.score.toFixed(2)}</span>}
          {typeof bid.estimated_seconds === "number" && (
            <span>~{bid.estimated_seconds}s</span>
          )}
        </span>
      </div>
      {bid.capability_claim && (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {bid.capability_claim}
        </p>
      )}
    </div>
  );
}

function WinnerCard({ payload }: { payload: AuctionResolvedPayload }) {
  const { winner, vickrey } = payload;
  return (
    <div className="rounded-control bg-ink p-3 text-paper">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Treeling seed={winner.agent_id} size={36} alive={false} lantern />
        <span className="font-medium">Awarded to</span>
        <span className="type-data">{winner.agent_id}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-paper/70">
        <span>
          bid{" "}
          <span className="type-data text-paper">
            {Math.round(winner.bid_price * 100)} credits
          </span>
        </span>
        <span>
          paid{" "}
          <span className="type-data text-paper">
            {Math.round(vickrey.price_paid * 100)} credits
          </span>{" "}
          <span className="text-paper/60">(Vickrey, second-price)</span>
        </span>
        <span>
          score{" "}
          <span className="type-data text-paper">{winner.score.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

function AuctionStatusPill({
  started,
  resolved,
}: {
  started: boolean;
  resolved: boolean;
}) {
  if (resolved) return <Pill tone="brand">awarded</Pill>;
  if (started) return <Pill tone="neutral">collecting bids</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}

type SourceStatus = "done" | "skipped" | "pending" | "idle";

const SOURCE_PENDING_TEXT = {
  business: "Searching workspace memory…",
  repo: "Querying indexed repo…",
} as const;

const SOURCE_IDLE_TEXT = {
  business: "Workspace memory",
  repo: "Repo retrieval",
} as const;

function sourceStatus(
  done: SourceDonePayload | undefined,
  skippedReason: string | undefined,
  pending: boolean,
): SourceStatus {
  if (done) return "done";
  if (skippedReason) return "skipped";
  if (pending) return "pending";
  return "idle";
}

function sourceDoneText(
  kind: "business" | "repo",
  done: SourceDonePayload | undefined,
) {
  const fallback =
    kind === "business"
      ? "Workspace memory returned"
      : `${done?.tool ?? "search"}/${done?.mode ?? "indexed"}`;
  return done?.summary_preview?.slice(0, 140) || fallback;
}

function sourceDescription(
  status: SourceStatus,
  kind: "business" | "repo",
  done: SourceDonePayload | undefined,
  skippedReason: string | undefined,
) {
  if (status === "done") return sourceDoneText(kind, done);
  if (status === "skipped") return skippedReason ?? "no result";
  if (status === "pending") return SOURCE_PENDING_TEXT[kind];
  return SOURCE_IDLE_TEXT[kind];
}

function SourceStatusBadge({
  status,
  done,
}: {
  status: SourceStatus;
  done: SourceDonePayload | undefined;
}) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-moss-600">
        <CheckCircle size={14} weight="fill" />
        {done?.duration_ms ? `${(done.duration_ms / 1000).toFixed(1)}s` : "ok"}
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-600">
        <XCircle size={14} weight="fill" />
        skipped
      </span>
    );
  }
  if (status === "pending") {
    return <CircleNotch size={14} className="animate-spin text-ink-muted" />;
  }
  return null;
}

function SourceRow({
  name,
  done,
  skippedReason,
  pending,
  kind,
}: {
  name: string;
  done: SourceDonePayload | undefined;
  skippedReason: string | undefined;
  pending: boolean;
  kind: "business" | "repo";
}) {
  const status = sourceStatus(done, skippedReason, pending);
  return (
    <div className="rounded-control bg-surface p-3 shadow-hairline">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{name}</span>
        <SourceStatusBadge status={status} done={done} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {sourceDescription(status, kind, done, skippedReason)}
      </p>
    </div>
  );
}

function DriveDocRow({ payload }: { payload: DriveDocPayload }) {
  return (
    <div className="flex items-start gap-3 rounded-control bg-brand-50 p-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface text-brand-700 shadow-hairline">
        <GoogleDriveLogo size={16} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          <span className="inline-flex items-center gap-1.5">
            <FileText size={13} weight="bold" className="text-brand-700" />
            {payload.filename}
          </span>
          <Pill tone="brand">Google Drive</Pill>
          {payload.via && (
            <span className="text-xs text-ink-muted">via {payload.via}</span>
          )}
        </div>
        {payload.drive_path && (
          <p className="mt-0.5 truncate type-data text-xs text-ink-muted">
            {payload.drive_path}
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">
          Found a written analysis from the growth lead and used it as the
          source of truth for the diagnosis.
        </p>
      </div>
      {typeof payload.duration_ms === "number" && (
        <span className="shrink-0 type-data text-xs text-ink-muted">
          {(payload.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function DiagnosisSourcePill({ payload }: { payload: DiagnosisReadyPayload }) {
  if (payload.source === "drive") {
    return (
      <Pill tone="brand">
        <GoogleDriveLogo size={11} weight="fill" />
        From {payload.source_doc?.filename ?? "Google Drive"}
      </Pill>
    );
  }
  if (payload.source === "live") return <Pill tone="brand">live evidence</Pill>;
  return <Pill tone="neutral">synthesized</Pill>;
}

function ConfirmAndPayForm({
  taskId,
  winnerAgentId,
  winnerBidPrice,
  pricePaid,
  rule,
}: {
  taskId: Id<"tasks">;
  winnerAgentId: string;
  winnerBidPrice: number;
  pricePaid: number;
  rule: string;
}) {
  const confirm = useAction(api.demos.confirmAndShipConversionDrop);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVickrey = rule === "second_highest_bid_price";
  const savings = Math.max(0, winnerBidPrice - pricePaid);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await confirm({ task_id: taskId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-control bg-brand-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <Trophy size={14} weight="fill" className="text-brand-700" />
          <span className="type-data">{winnerAgentId}</span> won the auction
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-ink-muted">Their offer</dt>
            <dd className="mt-0.5 type-data text-ink line-through decoration-danger-500 decoration-2">
              {Math.round(winnerBidPrice * 100)} credits
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">You pay</dt>
            <dd className="mt-0.5 type-data text-2xl font-semibold text-brand-700">
              {Math.round(pricePaid * 100)} credits
            </dd>
          </div>
        </dl>
        {isVickrey && savings > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            Vickrey second-price, you save{" "}
            <span className="type-data text-ink">{Math.round(savings * 100)} credits</span>{" "}
            vs. the winner&rsquo;s offer.
          </p>
        )}
      </div>
      <Button
        onClick={onConfirm}
        disabled={submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? (
          <>
            <CircleNotch size={16} className="animate-spin" weight="bold" />
            Confirming payment…
          </>
        ) : (
          <>
            <CreditCard size={16} weight="bold" />
            Confirm and pay {Math.round(pricePaid * 100)} credits
          </>
        )}
      </Button>
      <p className="text-xs text-ink-muted">
        Funds are held in escrow and only released once the agent ships the
        fix and the judge accepts.
      </p>
      {error && (
        <p className="rounded-control bg-danger-50 px-3 py-2 text-xs text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

function PaymentConfirmedRow({
  winnerAgentId,
  pricePaid,
}: {
  winnerAgentId: string | undefined;
  pricePaid: number | undefined;
}) {
  return (
    <div className="flex items-start gap-3 rounded-control bg-moss-50 p-3 text-sm text-moss-800">
      <ShieldCheck size={18} weight="fill" className="mt-0.5 shrink-0 text-moss-600" />
      <div>
        <div className="font-medium">
          {typeof pricePaid === "number"
            ? `${Math.round(pricePaid * 100)} credits held in escrow`
            : "Payment held in escrow"}
          {winnerAgentId && (
            <>
              {", "}
              <span className="type-data text-moss-800">
                {winnerAgentId}
              </span>{" "}
              cleared to ship
            </>
          )}
        </div>
        <p className="mt-0.5 text-xs text-moss-800/80">
          Released after the judge accepts the result.
        </p>
      </div>
    </div>
  );
}

function PaymentStatusPill({
  requested,
  confirmed,
}: {
  requested: boolean;
  confirmed: boolean;
}) {
  if (confirmed) return <Pill tone="success">paid</Pill>;
  if (requested) return <Pill tone="warning" pulse>action needed</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}

function V0Calling({ payload }: { payload: V0StartedPayload }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-ink-soft">
        <CircleNotch size={14} weight="bold" className="animate-spin text-brand-700" />
        <span>
          <span className="type-data text-ink">vercel-v0</span> calling{" "}
          <span className="type-data text-ink">{payload.model}</span> over MCP
          to patch{" "}
          <span className="type-data text-ink">{payload.target_path}</span>
          <span className="streaming-caret" />
        </span>
      </div>
      <div className="rounded-control bg-surface-muted p-3 type-data text-xs text-ink-muted">
        POST {payload.mcp_endpoint}
      </div>
      <div className="space-y-2">
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-5/6 rounded" />
        <div className="shimmer h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

function V0Result({ payload }: { payload: V0DonePayload }) {
  const sourceLabel =
    payload.patch_source === "v0"
      ? "model-generated patch"
      : payload.patch_source === "rule_based"
        ? "rule-based patch (v0 unavailable)"
        : "docs-only patch (target file missing)";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Pill tone={payload.patch_source === "v0" ? "brand" : "neutral"}>
          <Lightning size={11} weight="fill" />
          {sourceLabel}
        </Pill>
        <span className="type-data text-xs text-ink-soft">
          {payload.target_path}
        </span>
        <span className="text-xs text-ink-muted">
          {(payload.duration_ms / 1000).toFixed(1)}s, {payload.patch_size_chars.toLocaleString()} chars
        </span>
      </div>
      <div className="rounded-control bg-surface-muted p-3 type-data text-xs text-ink-muted">
        <div className="mb-1 flex items-center gap-1.5 text-ink-soft">
          <FileCode size={12} weight="bold" />
          {payload.target_path}
        </div>
        <pre tabIndex={0} className="max-h-40 overflow-y-auto whitespace-pre-wrap text-ink-soft outline-none focus-visible:shadow-ring">
          {payload.patch_preview}
        </pre>
      </div>
      {payload.ops_applied.length > 0 && (
        <div className="text-xs text-ink-muted">
          <span className="font-medium text-ink-soft">Operations applied:</span>{" "}
          {payload.ops_applied.map((op) => (
            <code
              key={op}
              className="mx-0.5 rounded bg-surface-muted px-1.5 py-0.5 type-data text-xs text-ink-soft"
            >
              {op}
            </code>
          ))}
        </div>
      )}
      {payload.ops_missing.length > 0 && (
        <div className="text-xs text-ink-muted">
          <span className="font-medium text-ink-soft">Skipped:</span>{" "}
          {payload.ops_missing.map((op) => (
            <code
              key={op}
              className="mx-0.5 rounded bg-surface-muted px-1.5 py-0.5 type-data text-xs text-ink-muted"
            >
              {op}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <CircleNotch size={14} className="animate-spin" />
      {text}
    </div>
  );
}

function DiagnoseStatusPill({
  started,
  ready,
}: {
  started: boolean;
  ready: boolean;
}) {
  if (ready) return <Pill tone="brand">complete</Pill>;
  if (started) return <Pill tone="neutral">in progress</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}

function FixStatusPill({
  started,
  pr,
  failed,
}: {
  started: boolean;
  pr: boolean;
  failed: boolean;
}) {
  if (failed) return <Pill tone="neutral">failed</Pill>;
  if (pr) return <Pill tone="brand">PR opened</Pill>;
  if (started) return <Pill tone="neutral">applying</Pill>;
  return <Pill tone="neutral">queued</Pill>;
}
