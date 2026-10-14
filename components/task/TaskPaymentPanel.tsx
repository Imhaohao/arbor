"use client";

import { useState } from "react";
import { CreditCard, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { formatMoney } from "@/lib/utils";
import type { EscrowDoc, TaskDoc } from "@/lib/task-view";

interface Props {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
}

const LABELS: Record<string, string> = {
  requires_payment: "Payment required",
  checkout_created: "Checkout created",
  authorized: "Authorized",
  captured: "Captured",
  canceled: "Canceled",
};

const CHECKOUT_READY_STATUSES = new Set(["requires_payment", "checkout_created"]);
const PAID_STATUSES = new Set(["authorized", "captured"]);

function shouldShowPayment(task: TaskDoc, escrow: EscrowDoc | null | undefined) {
  return escrow?.payment_processor === "stripe" || task.status === "requires_payment";
}

function canStartCheckout(task: TaskDoc, paymentStatus: string | undefined) {
  return (
    task.status === "requires_payment" &&
    CHECKOUT_READY_STATUSES.has(paymentStatus ?? "")
  );
}

function PaymentStatusPill({ paymentStatus }: { paymentStatus: string | undefined }) {
  return (
    <Pill tone={PAID_STATUSES.has(paymentStatus ?? "") ? "success" : "warning"}>
      {LABELS[paymentStatus ?? ""] ?? "Pending"}
    </Pill>
  );
}

function PaymentDetails({
  task,
  escrow,
}: {
  task: TaskDoc;
  escrow: EscrowDoc | null | undefined;
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="text-ink-muted">Amount</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <ShieldCheck size={16} weight="bold" className="text-brand-600" />
        <span className="type-data font-semibold text-ink">
          {formatMoney(escrow?.locked_amount ?? task.price_paid ?? 0)}
        </span>
        <span className="text-[0.8125rem] text-ink-muted">authorized before execution</span>
      </dd>
      <dt className="text-ink-muted">Seller</dt>
      <dd className="type-data min-w-0 break-all text-[0.8125rem] text-ink">
        {escrow?.seller_id ?? "pending"}
      </dd>
      {escrow?.stripe_connected_account_id ? (
        <>
          <dt className="text-ink-muted">Stripe account</dt>
          <dd className="type-data min-w-0 break-all text-[0.8125rem] text-ink">
            {escrow.stripe_connected_account_id}
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function PaymentError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

export function TaskPaymentPanel({ task, escrow }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentStatus = escrow?.payment_status ?? task.payment_status;

  if (!shouldShowPayment(task, escrow)) return null;

  const canCheckout = canStartCheckout(task, paymentStatus);
  const hasError = Boolean(error || escrow?.payment_last_error);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task._id }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Stripe checkout failed");
      }
      if (!json.url) throw new Error("Stripe checkout did not return a URL");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Payment"
        meta={<PaymentStatusPill paymentStatus={paymentStatus} />}
      />
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <PaymentDetails task={task} escrow={escrow} />
        {canCheckout ? (
          <Button type="button" onClick={startCheckout} disabled={loading}>
            <CreditCard size={16} weight="bold" />
            {loading ? "Opening..." : "Open Stripe Checkout"}
          </Button>
        ) : null}
      </div>
      {hasError ? <PaymentError message={String(error ?? escrow?.payment_last_error)} /> : null}
    </Card>
  );
}
