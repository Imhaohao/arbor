#!/usr/bin/env python3
"""Arbor production launch (Stripe TEST mode). Run from anywhere:

    python3 scripts/launch-prod.py

Steps, in order, stopping on the first failure:
 1. Deploy Convex functions to the project's production deployment.
 2. Copy the dev deployment's env to production, minus the demo locks and
    dead tunnel URLs, then apply production overrides (auth on, model spend
    on, Stripe checkout on). Values are passed as argv, never printed.
 3. Redeploy so convex/auth.config.ts picks up CLERK_JWT_ISSUER_DOMAIN.
 4. Create a Stripe TEST-mode webhook for https://tryarbor.vercel.app.
 5. Set Vercel production env vars (replacing existing ones).
 6. Fast-forward main to feat/first-customer and push, which triggers the
    Vercel production build.
"""
import os
import re
import secrets
import subprocess
import sys
import urllib.parse
import urllib.request
import json
import base64

WORKTREE = "/Users/yanzihao/Documents/miyohacks-launch"
SITE = "https://tryarbor.vercel.app"
ADMIN_EMAILS = "imzihaoi@gmail.com"
CLERK_ISSUER = "https://becoming-labrador-2.clerk.accounts.dev"
VERCEL_SCOPE = "team_ZWXXhoiHzjQiqK2pvtPUFhPN"

SKIP = {
    "ARBOR_PUBLIC_DEMO_MODE", "ARBOR_MODEL_SPEND_DISABLED", "ARBOR_PAYMENTS_MODE",
    "ARBOR_MAX_SOLICITED_AGENTS", "ARBOR_MODEL_PROVIDER", "ARBOR_HIVE_MODEL_PROVIDER",
    "ARBOR_LOOPBACK_BASE", "ARBOR_WORKER_A2A_ENDPOINT", "ARBOR_A2A_DIRECTORY",
}
STRIPE_EVENTS = [
    "checkout.session.completed", "payment_intent.amount_capturable_updated",
    "payment_intent.succeeded", "payment_intent.canceled", "account.updated",
]


def run(args, *, input_text=None, capture=False):
    result = subprocess.run(
        args, cwd=WORKTREE, input=input_text, text=True,
        capture_output=capture or input_text is not None,
    )
    if result.returncode != 0:
        detail = (result.stderr or "")[-400:] if capture or input_text is not None else ""
        sys.exit(f"FAILED: {' '.join(args[:4])} ...\n{detail}")
    return result.stdout if capture else ""


def dotenv(path):
    values = {}
    for line in open(path):
        match = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
        if match:
            values[match.group(1)] = match.group(2).strip().strip('"')
    return values


def deploy():
    out = run(["npx", "convex", "deploy", "-y"], capture=True)
    url = re.search(r"https://[a-z0-9-]+\.convex\.cloud", out)
    if not url:
        sys.exit("FAILED: could not read the production Convex URL from deploy output")
    return url.group(0)


def copy_env(bridge_secret):
    dev = {}
    for line in run(["npx", "convex", "env", "list"], capture=True).splitlines():
        if "=" in line:
            name, value = line.split("=", 1)
            dev[name] = value
    prod = {name: value for name, value in dev.items() if name not in SKIP}
    prod.update({
        "ARBOR_PUBLIC_DEMO_MODE": "false",
        "ARBOR_MODEL_SPEND_DISABLED": "false",
        "ARBOR_PAYMENTS_MODE": "stripe_checkout",
        "ARBOR_MAX_SOLICITED_AGENTS": "40",
        "ARBOR_MODEL_PROVIDER": "azure-openai",
        "ARBOR_HIVE_MODEL_PROVIDER": "openai",
        "ARBOR_LOOPBACK_BASE": SITE,
        "ARBOR_REQUIRE_AUTH": "true",
        "ARBOR_ADMIN_EMAILS": ADMIN_EMAILS,
        "ARBOR_GOLDEN_AUDIT_ENABLED": "false",
        "CLERK_JWT_ISSUER_DOMAIN": CLERK_ISSUER,
        "ARBOR_STRIPE_CONVEX_BRIDGE_SECRET": bridge_secret,
    })
    for name, value in prod.items():
        run(["npx", "convex", "env", "set", "--prod", name, value], capture=True)
    print(f"  set {len(prod)} production Convex env vars")


def stripe_webhook(stripe_key):
    body = urllib.parse.urlencode(
        [("url", f"{SITE}/api/stripe/webhook"), ("description", "Arbor production (test mode)")]
        + [("enabled_events[]", event) for event in STRIPE_EVENTS]
    ).encode()
    request = urllib.request.Request(
        "https://api.stripe.com/v1/webhook_endpoints", data=body, method="POST",
        headers={"Authorization": "Basic " + base64.b64encode(f"{stripe_key}:".encode()).decode()},
    )
    with urllib.request.urlopen(request) as response:
        secret = json.load(response).get("secret")
    if not secret:
        sys.exit("FAILED: Stripe did not return a webhook signing secret")
    return secret


def vercel_env(values):
    for name, value in values.items():
        subprocess.run(
            ["vercel", "env", "rm", name, "production", "-y", "--scope", VERCEL_SCOPE],
            cwd=WORKTREE, capture_output=True, text=True,
        )
        run(["vercel", "env", "add", name, "production", "--scope", VERCEL_SCOPE], input_text=value)
    print(f"  set {len(values)} Vercel production env vars")


def main():
    local = dotenv(os.path.join(WORKTREE, ".env.local"))
    stripe_key = local.get("STRIPE_SECRET_KEY", "")
    if not stripe_key.startswith("sk_test_"):
        sys.exit("FAILED: expected a Stripe TEST secret key in .env.local for the first run")
    bridge_secret = secrets.token_urlsafe(32)

    print("1/6 deploying Convex functions to production")
    convex_url = deploy()
    print(f"  production Convex: {convex_url}")
    print("2/6 copying env to production")
    copy_env(bridge_secret)
    run(["npx", "convex", "env", "set", "--prod", "STRIPE_SECRET_KEY", stripe_key], capture=True)
    print("3/6 redeploying so Clerk auth is active")
    deploy()
    print("4/6 creating Stripe test-mode webhook")
    webhook_secret = stripe_webhook(stripe_key)
    print("5/6 setting Vercel production env")
    vercel_env({
        "NEXT_PUBLIC_CONVEX_URL": convex_url,
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": local["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
        "CLERK_SECRET_KEY": local["CLERK_SECRET_KEY"],
        "ARBOR_REQUIRE_AUTH": "true",
        "ARBOR_ADMIN_EMAILS": ADMIN_EMAILS,
        "ARBOR_PUBLIC_DEMO_MODE": "false",
        "ARBOR_PAYMENTS_MODE": "stripe_checkout",
        "STRIPE_SECRET_KEY": stripe_key,
        "STRIPE_WEBHOOK_SECRET": webhook_secret,
        "ARBOR_STRIPE_CONVEX_BRIDGE_SECRET": bridge_secret,
        "NEXT_PUBLIC_APP_URL": SITE,
    })
    print("6/6 fast-forwarding main and pushing (starts the Vercel production build)")
    run(["git", "fetch", "origin", "main"], capture=True)
    run(["git", "push", "origin", "feat/first-customer:main"], capture=True)
    print("done. Production build started; tell Claude to verify.")


main()
