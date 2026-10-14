"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatMoney, formatScore } from "@/lib/utils";
import { ArrowRight } from "@phosphor-icons/react";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Treeling } from "@/components/grove/Treeling";
import { LoadingProgress, useElapsedSeconds } from "./LoadingProgress";
import type {
  AuctionResolvedPayload,
  LifecycleEventDoc,
} from "@/lib/task-view";
import type { BidProbeDoc } from "./ProbeReceiptPanel";

interface Props {
  events: LifecycleEventDoc[];
  probes?: BidProbeDoc[];
}

type ResolvedBid = AuctionResolvedPayload["bids"][number];

const TIER_CHIPS: Record<string, { label: string; tone: PillTone }> = {
  "native-a2a": { label: "A2A", tone: "info" },
  "a2a-bridge": { label: "Bridge", tone: "brand" },
  "model-backed": { label: "Model", tone: "neutral" },
  "not-a2a-yet": { label: "Demo", tone: "neutral" },
};

export function AuctionResolution({ events, probes }: Props) {
  const resolved = events.find((e) => e.event_type === "auction_resolved");
  const failed = events.find((e) => e.event_type === "auction_failed");
  const bidCount = events.filter((e) => e.event_type === "bid_received").length;
  const declineCount = events.filter((e) => e.event_type === "bid_declined").length;
  // Anchor the elapsed counter on the first signal that the auction has work
  // to do: context_enriched (or task_posted as a fallback).
  const startEvent =
    events.find((e) => e.event_type === "context_enriched") ??
    events.find((e) => e.event_type === "task_posted");
  const elapsed = useElapsedSeconds(
    !resolved && !failed ? startEvent?.timestamp : undefined,
  );

  // Hoisted above the early returns below so hook order stays stable across
  // renders (Rules of Hooks). Depends only on `probes`, which is always present.
  const demoLaneProbes = useMemo(
    () =>
      probes
        ? probes.filter(
            (p) => p.probe_status === "demo_lane" || p.probe_status === "fail",
          )
        : [],
    [probes],
  );

  if (failed) return <AuctionFailed reason={failed.payload.reason} />;
  if (!resolved) {
    return <AuctionResolving bidCount={bidCount} declineCount={declineCount} elapsed={elapsed} />;
  }
  return (
    <AuctionResolved
      payload={resolved.payload as unknown as AuctionResolvedPayload}
      probes={probes}
      demoLaneProbes={demoLaneProbes}
    />
  );
}

function AuctionFailed({ reason: rawReason }: { reason: unknown }) {
  const reason =
    typeof rawReason === "string"
      ? rawReason
      : "No executable specialist bid was available.";
  const explanation = reason.includes("under budget")
    ? "No executable specialist bid met the auction requirements. Nothing was charged."
    : "The auction could not select an executable specialist. Nothing was charged.";
  return (
    <Card className="animate-fade-up">
      <CardHeader title="No specialist matched" meta={<Pill tone="danger">Failed</Pill>} />
      <p className="text-sm text-ink-muted">{explanation}</p>
      <p className="type-data mt-2 text-xs text-ink-subtle">{reason}</p>
    </Card>
  );
}

function AuctionResolving({
  bidCount,
  declineCount,
  elapsed,
}: {
  bidCount: number;
  declineCount: number;
  elapsed: number;
}) {
  const status =
    bidCount === 0 && declineCount === 0
      ? "Waiting for the first specialist to respond..."
      : `${bidCount} ${bidCount === 1 ? "specialist has" : "specialists have"} privately quoted${declineCount > 0 ? ` (${declineCount} declined)` : ""}.`;
  return (
    <Card className="animate-fade-up">
      <CardHeader title="Selecting your specialist" meta={<Pill tone="live">Resolving</Pill>} />
      <LoadingProgress
        label="Sealed bids in flight"
        status={status}
        details={[
          "Quotes stay hidden, even from this view, until the window closes.",
          "When the window closes, the highest score wins and pays the runner-up's price (Vickrey).",
        ]}
        elapsedSeconds={elapsed}
        tone="warning"
      />
    </Card>
  );
}

function AuctionResolved({
  payload,
  probes,
  demoLaneProbes,
}: {
  payload: AuctionResolvedPayload;
  probes?: BidProbeDoc[];
  demoLaneProbes: BidProbeDoc[];
}) {
  const { bids, winner, vickrey } = payload;
  const maxScore = Math.max(...bids.map((b) => b.score), 0.01);
  const [winningBid, ...otherBids] = bids;
  const tierFor = (bid: ResolvedBid) => probes?.find((p) => p.bid_id === bid.bid_id)?.public_tier;
  const hasProbes = Boolean(probes && probes.length > 0);

  return (
    <Card className="animate-fade-up">
      <CardHeader title="Specialist selected" meta={<span className="type-data">{winner.agent_id}</span>} />

      <PriceBanner
        agentId={winner.agent_id}
        bidPrice={vickrey.winner_bid_price}
        pricePaid={vickrey.price_paid}
        isDegenerate={vickrey.rule === "degenerate_single_bid"}
      />

      {winningBid && (
        <WinnerRow
          bid={winningBid}
          tier={tierFor(winningBid)}
          hasProbes={hasProbes}
          widthPct={scoreWidth(winningBid.score, maxScore)}
        />
      )}

      {otherBids.length > 0 && (
        <ol className="mt-3 space-y-1.5" start={2}>
          {otherBids.map((bid, i) => (
            <LoserRow
              key={bid.bid_id}
              bid={bid}
              rank={i + 2}
              tier={tierFor(bid)}
              hasProbes={hasProbes}
              widthPct={scoreWidth(bid.score, maxScore)}
            />
          ))}
        </ol>
      )}

      {demoLaneProbes.length > 0 && <DemoLane probes={demoLaneProbes} />}
    </Card>
  );
}

function scoreWidth(score: number, maxScore: number) {
  return Math.max(8, Math.round((score / maxScore) * 100));
}

function PriceBanner({
  agentId,
  bidPrice,
  pricePaid,
  isDegenerate,
}: {
  agentId: string;
  bidPrice: number;
  pricePaid: number;
  isDegenerate: boolean;
}) {
  return (
    <div className="mb-5 rounded-control bg-surface-subtle p-5">
      <div className="text-[0.8125rem] font-medium text-brand-700">
        Honest pricing: Vickrey second-price
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-ink-muted">
          <span className="type-data">{agentId}</span> bid
        </span>
        <span className="type-data text-xl text-ink-subtle line-through decoration-danger-500 decoration-2">
          {formatMoney(bidPrice)}
        </span>
        <ArrowRight size={18} weight="bold" className="text-ink-subtle" />
        <span className="type-data animate-value-pop text-3xl font-semibold text-ink">
          pays {formatMoney(pricePaid)}
        </span>
      </div>
      <p className="mt-2 text-[0.8125rem] text-ink-muted">
        {isDegenerate
          ? "Only one valid offer, so they pay their own price."
          : "They pay the runner-up's price, so the honest move is to quote your true cost."}
      </p>
    </div>
  );
}

function TierChip({ tier, hasProbes }: { tier?: string; hasProbes: boolean }) {
  const chip = tier ? TIER_CHIPS[tier] : undefined;
  if (chip) return <Pill tone={chip.tone}>{chip.label}</Pill>;
  if (!tier && hasProbes) return <Pill>Unprobed</Pill>;
  return null;
}

function ScoreBar({ widthPct, score }: { widthPct: number; score: number }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="score-bar flex-1">
        <span style={{ width: `${widthPct}%` }} />
      </div>
      <span className="type-data shrink-0 text-xs text-ink-muted">score {formatScore(score)}</span>
    </div>
  );
}

function WinnerRow({
  bid,
  tier,
  hasProbes,
  widthPct,
}: {
  bid: ResolvedBid;
  tier?: string;
  hasProbes: boolean;
  widthPct: number;
}) {
  return (
    <div className="flex items-start gap-4 rounded-control bg-brand-50 p-4 shadow-hairline">
      <Treeling seed={bid.agent_id} name={bid.agent_id} lantern pose="raised" size={96} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-data text-sm text-ink">{bid.agent_id}</span>
          <Pill tone="success">Winner</Pill>
          <TierChip tier={tier} hasProbes={hasProbes} />
        </div>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">{bid.capability_claim}</p>
        <ScoreBar widthPct={widthPct} score={bid.score} />
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs text-ink-muted">Bid</div>
        <div className="type-data text-base font-semibold text-ink">{formatMoney(bid.bid_price)}</div>
      </div>
    </div>
  );
}

function LoserRow({
  bid,
  rank,
  tier,
  hasProbes,
  widthPct,
}: {
  bid: ResolvedBid;
  rank: number;
  tier?: string;
  hasProbes: boolean;
  widthPct: number;
}) {
  return (
    <li className="flex items-start gap-3 rounded-control bg-surface-subtle p-3 text-sm">
      <span className="type-data mt-1 w-5 shrink-0 text-center text-xs text-ink-muted">{rank}</span>
      <Treeling seed={bid.agent_id} name={bid.agent_id} size={36} alive={false} className="opacity-70" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-data text-[0.8125rem] text-ink-soft">{bid.agent_id}</span>
          <TierChip tier={tier} hasProbes={hasProbes} />
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{bid.capability_claim}</p>
        <ScoreBar widthPct={widthPct} score={bid.score} />
      </div>
      <div className="type-data shrink-0 text-right text-[0.8125rem] text-ink-soft">
        {formatMoney(bid.bid_price)}
      </div>
    </li>
  );
}

function DemoLane({ probes }: { probes: BidProbeDoc[] }) {
  return (
    <details className="mt-4 rounded-control bg-surface-muted">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-[0.8125rem] font-medium text-ink-soft">
        Demo lane: {probes.length} {probes.length === 1 ? "agent" : "agents"} not in the auction
      </summary>
      <dl className="space-y-1.5 px-4 pb-3 pt-1">
        {probes.map((p) => (
          <div key={p._id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
            <dt className="type-data text-ink-soft">{p.agent_id}</dt>
            <dd className="text-ink-muted">
              <span className="italic">{p.public_tier}</span>:{" "}
              {p.probe_status === "fail"
                ? (p.error_message ?? "probe failed")
                : "demo_lane, no live probe"}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
