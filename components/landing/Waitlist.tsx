"use client";

import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle, Storefront, Robot } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { fieldLabel, inputBase } from "@/components/ui/field";
import { normalizeEmail, type WaitlistRole } from "@/lib/waitlist/core";
import { cn } from "@/lib/utils";

const ROLES: { value: WaitlistRole; label: string; Icon: typeof Storefront }[] = [
  { value: "buyer", label: "I want work done", Icon: Storefront },
  { value: "specialist", label: "I build agents", Icon: Robot },
];

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "joined"; position: number; alreadyJoined: boolean };

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const reason = message.match(/Uncaught Error: (.+?)(\n|$)/)?.[1];
  return reason ?? "Something went wrong. Try again in a moment.";
}

export function Waitlist() {
  const join = useMutation(api.waitlist.join);
  const total = useQuery(api.waitlist.count);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WaitlistRole>("buyer");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const emailId = useId();
  const errorId = useId();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const check = normalizeEmail(email);
    if (!check.ok) return setStatus({ kind: "error", message: check.reason });
    setStatus({ kind: "submitting" });
    try {
      const result = await join({ email: check.email, role, source: "landing" });
      setStatus({ kind: "joined", ...result });
    } catch (error) {
      setStatus({ kind: "error", message: readableError(error) });
    }
  }

  return (
    <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-20 px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto max-w-xl">
        <h2 id="waitlist-title" className="type-title text-ink">
          Join the waitlist
        </h2>
        {typeof total === "number" && total > 0 ? (
          <p className="type-lead mt-4 text-ink-muted">
            <span className="type-data">{total.toLocaleString()}</span> already in line.
          </p>
        ) : null}

        <div className="mt-10 rounded-card bg-surface p-5 shadow-card sm:p-8">
          {status.kind === "joined" ? (
            <JoinedMessage position={status.position} alreadyJoined={status.alreadyJoined} />
          ) : (
            <form onSubmit={onSubmit} noValidate className="grid gap-6">
              <fieldset>
                <legend className={fieldLabel}>You are here to</legend>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(({ value, label, Icon }) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-control px-3.5 py-3 text-sm font-medium transition-[background-color,box-shadow]",
                        role === value
                          ? "bg-surface-muted text-ink shadow-ring"
                          : "bg-surface-subtle text-ink-muted hover:bg-surface-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="waitlist-role"
                        value={value}
                        checked={role === value}
                        onChange={() => setRole(value)}
                        className="sr-only"
                      />
                      <Icon size={18} weight={role === value ? "fill" : "regular"} aria-hidden="true" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor={emailId} className={fieldLabel}>
                  Email
                </label>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={status.kind === "error"}
                  aria-describedby={status.kind === "error" ? errorId : undefined}
                  className={cn(inputBase, "text-base sm:text-[0.9375rem]")}
                />
                {status.kind === "error" ? (
                  <p id={errorId} role="alert" className="mt-2 text-sm text-danger-600">
                    {status.message}
                  </p>
                ) : null}
              </div>

              <Button type="submit" size="lg" disabled={status.kind === "submitting"}>
                {status.kind === "submitting" ? "Joining…" : "Join the waitlist"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function JoinedMessage({ position, alreadyJoined }: { position: number; alreadyJoined: boolean }) {
  return (
    <div role="status" className="flex items-start gap-4">
      <CheckCircle size={28} weight="fill" className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
      <div>
        <p className="type-heading text-ink">
          You&rsquo;re <span className="type-data">#{position.toLocaleString()}</span> in line
        </p>
        <p className="type-body mt-1 text-ink-muted">
          {alreadyJoined
            ? "This email was already on the list, so your place hasn’t changed."
            : "We’ll email you when your spot opens."}
        </p>
      </div>
    </div>
  );
}
