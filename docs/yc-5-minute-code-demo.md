# YC 5-Minute Code Demo: Real Payment Gating in Arbor

## Pick

Record the Stripe payment-boundary session described in
`docs/yc-coding-agent-session.md`.

**One-sentence claim:** Arbor now pauses a won agent auction until Stripe confirms
that funds are authorized, then captures on accepted work or cancels on rejection;
real payment side effects remain disabled by default.

This is the strongest session to show:

| Commit | What is strong | Decision |
| --- | --- | --- |
| `63e8177` | Landed the current off-by-default task Checkout, webhook, Convex bridge, UI, and settlement path | Show this Stripe slice, not the commit's unrelated bulk changes |
| `6464824` | Focused A2A compatibility and budget-safety fix with a 20-responder regression test | Runner-up; technically clean, but less legible in five minutes |
| `7be6d9a` | Large, visual conversion-drop demo flow | Skip; more demo-specific and weaker as an engineering judgment story |
| `a7f88c0` | Original marketplace-payments foundation | Mention only as earlier groundwork; the current code is clearer |

Do not lead with `git show --stat 63e8177`; it is a broad consolidation commit.
Show the exact payment slice below from the current tree.

## Stage These Views

Open these files in this order and place the cursor at the listed line:

| Order | File and line | Show |
| --- | --- | --- |
| 1 | `convex/auctions.ts:868` | Stripe mode pauses after a winner is chosen; demo mode executes immediately |
| 2 | `app/api/stripe/checkout/task/route.ts:36` | Explicit `503 stripe_disabled` guard |
| 3 | `app/api/stripe/checkout/task/route.ts:92` | Manual capture, destination account, platform fee, idempotency key |
| 4 | `app/api/stripe/webhook/route.ts:93` | Raw-body signature verification and handled Stripe events |
| 5 | `convex/payments.ts:112` | Verified authorization changes state and resumes execution |
| 6 | `convex/auctions.ts:1320` | Accept captures/releases; reject cancels/refunds |
| 7 | `components/task/TaskPaymentPanel.tsx:24` | Buyer-visible payment checkpoint |

Keep `convex/schema.ts:24` and `convex/schema.ts:255` open only as backup if asked
where the state is persisted.

## Exact Commands

Use these before recording:

```bash
cd /Users/yanzihao/Documents/miyohacks
npm run typecheck
npm run build
```

The current worktree's in-progress `package.json` references an untracked,
not-yet-created `lib/specialists/pr-review-detect.test.ts`. Do not run or show
`npm test` until that unrelated work is finished. To verify the committed suite
without changing the worktree, run:

```bash
node - <<'NODE'
const { execFileSync, execSync } = require("node:child_process");
const path = require("node:path");
const pkg = JSON.parse(execFileSync("git", ["show", "HEAD:package.json"], { encoding: "utf8" }));
execSync(pkg.scripts.test, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PATH: `${path.join(process.cwd(), "node_modules/.bin")}:${process.env.PATH}` },
});
NODE
```

Start a no-side-effect smoke server in a separate terminal:

```bash
cd /Users/yanzihao/Documents/miyohacks
env -u ARBOR_PAYMENTS_MODE -u STRIPE_SECRET_KEY npm run dev
```

Keep this command ready for the final proof:

```bash
curl -sS -i -X POST http://localhost:3000/api/stripe/checkout/task \
  -H 'content-type: application/json' \
  --data '{"task_id":"demo"}' | sed -n '1,18p'
```

Expected result: HTTP `503` with code `stripe_disabled`. The guard runs before
task lookup, so this makes no Stripe call and needs no valid task ID.

If an editor is unavailable, print the same sections in a terminal:

```bash
nl -ba convex/auctions.ts | sed -n '868,896p;1320,1360p'
nl -ba app/api/stripe/checkout/task/route.ts | sed -n '34,42p;92,136p'
nl -ba app/api/stripe/webhook/route.ts | sed -n '93,149p'
nl -ba convex/payments.ts | sed -n '112,149p'
nl -ba components/task/TaskPaymentPanel.tsx | sed -n '24,96p'
```

## Timed Narration

### 0:00-0:25 - Hook

Show `convex/auctions.ts:868`.

> Arbor is a marketplace where AI agents bid for work, execute it, and get
> judged. Before this session, escrow was only simulated in Convex. I asked the
> coding agent for the smallest real payment path that stayed off by default.
> The key design decision was to make authorization a state-machine boundary,
> not bolt a checkout button onto the page.

### 0:25-1:05 - Pause the auction

Highlight lines 868-896.

> After the Vickrey auction chooses a winner and price, Stripe mode marks the
> escrow and task as requiring payment, records the transition, and returns.
> Execution is not scheduled. With Stripe mode off, the existing demo path still
> schedules execution immediately. That preserves the hackathon lane while
> making the real-money lane explicit.

### 1:05-1:55 - Create the right payment

Jump to `app/api/stripe/checkout/task/route.ts:36`, then lines 92-136.

> Every Stripe route fails closed with `stripe_disabled` unless the operator
> opts in. Checkout also verifies that the task is waiting for payment, escrow is
> locked, and the winning agent has a ready Connect account. The PaymentIntent
> uses manual capture, sends funds to that connected account, takes the platform
> fee, and uses an idempotency key. The buyer authorizes before work starts, but
> Arbor does not capture yet.

### 1:55-2:40 - Trust Stripe, not the browser

Jump to `app/api/stripe/webhook/route.ts:93` and highlight lines 107-145.

> Returning from Checkout is not proof of payment. This route reads the raw body,
> verifies Stripe's signature, and handles only the account and PaymentIntent
> transitions Arbor needs. When Stripe reports `requires_capture`, the bridge
> records authorization. Success and cancellation update the same Convex source
> of truth.

### 2:40-3:20 - Resume only after authorization

Jump to `convex/payments.ts:112` and highlight lines 121-146.

> This is the critical bridge. It checks the configured server-to-Convex secret,
> records the PaymentIntent on escrow, updates the task to `authorized`, and logs
> the lifecycle event. Only if the task is actually waiting for payment and has
> a winning bid does it schedule execution. The browser cannot skip this gate.

### 3:20-4:05 - Settle according to judgment

Jump to `convex/auctions.ts:1320` and highlight lines 1320-1360.

> Payment follows the judge's result. Accepted work captures the authorized
> PaymentIntent and releases escrow before completing the task. Rejected work
> cancels the authorization and refunds escrow. The existing reputation update
> remains in the same settlement flow, so quality, payment, and
> marketplace state agree.

### 4:05-4:35 - Make the boundary visible

Jump to `components/task/TaskPaymentPanel.tsx:24` and highlight lines 27-35 and
59-95.

> The task page exposes the same state machine. It appears only for Stripe or a
> task waiting for payment, shows the amount and seller, and offers Checkout only
> in the allowed states. The product visibly stops where the backend stops.

### 4:35-5:00 - Prove the default is safe

Run the prepared `curl` command.

> With payment mode unset, the real endpoint returns `503 stripe_disabled`
> before it touches Stripe. In the implementation session, Convex codegen,
> typecheck, tests, build, and this disabled-route smoke check passed. The result
> is not a payment mock; it is a real, auditable payment boundary that operators
> must deliberately activate.

Stop immediately after the response. Do not add an architecture recap.

## Recording Checklist

- [ ] Use the current Arbor tree; do not show the broad `63e8177` commit diff.
- [ ] Keep the seven file views above open in order.
- [ ] Set editor font large enough to show about 35 lines; hide minimap and sidebars.
- [ ] Hide `.env*`, terminal history, Stripe keys, Convex URLs, and notifications.
- [ ] Leave `ARBOR_PAYMENTS_MODE` and `STRIPE_SECRET_KEY` unset for the smoke server.
- [ ] Run typecheck, the committed suite, and build before recording; keep successful output available but off-screen.
- [ ] Rehearse once with a hard stop at 4:50; target 125-140 spoken words per minute.
- [ ] During recording, highlight only the lines named in the narration.
- [ ] Run the disabled-route `curl` once; confirm `503` and `stripe_disabled` are visible.
- [ ] End on the terminal response, trim dead air, and verify the exported video is under five minutes.
