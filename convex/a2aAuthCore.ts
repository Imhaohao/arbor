"use node";

import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { canonicalString, verifySignature } from "../lib/a2a-hmac";

const MAX_DRIFT_SECONDS = 300;
const NONCE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface VerifyArgs {
  raw_body: string;
  agent_id?: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
}

export type VerifyVerdict =
  | { ok: true; agent_id: string }
  | {
      ok: false;
      status: 401 | 403;
      error:
        | "missing_headers"
        | "invalid_timestamp"
        | "timestamp_drift"
        | "unknown_agent"
        | "invalid_signature"
        | "nonce_replay";
      detail?: string;
    };

export async function verifyInbound(
  ctx: ActionCtx,
  args: VerifyArgs,
): Promise<VerifyVerdict> {
  const missing: string[] = [];
  if (!args.agent_id) missing.push("X-Arbor-Agent");
  if (!args.timestamp) missing.push("X-Arbor-Timestamp");
  if (!args.nonce) missing.push("X-Arbor-Nonce");
  if (!args.signature) missing.push("X-Arbor-Signature");
  if (missing.length > 0) {
    return {
      ok: false,
      status: 401,
      error: "missing_headers",
      detail: missing.join(", "),
    };
  }

  const timestamp = Number.parseInt(args.timestamp!, 10);
  if (!Number.isFinite(timestamp)) {
    return {
      ok: false,
      status: 403,
      error: "invalid_timestamp",
      detail: args.timestamp,
    };
  }
  const driftSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (driftSeconds > MAX_DRIFT_SECONDS) {
    return {
      ok: false,
      status: 403,
      error: "timestamp_drift",
      detail: `drift=${Math.round(driftSeconds)}s`,
    };
  }

  const keyRow = await ctx.runQuery(internal.agentKeys._getSecretForAgent, {
    agent_id: args.agent_id!,
  });
  if (!keyRow) return { ok: false, status: 403, error: "unknown_agent" };

  const canonical = canonicalString(args.raw_body, args.timestamp!, args.nonce!);
  if (!verifySignature(keyRow.secret_b64, canonical, args.signature!)) {
    return { ok: false, status: 403, error: "invalid_signature" };
  }

  const replay = await ctx.runMutation(internal.a2aNonces._seenOrInsert, {
    nonce: args.nonce!,
    agent_id: args.agent_id!,
    created_at: Date.now(),
  });
  if (replay) return { ok: false, status: 403, error: "nonce_replay" };

  await ctx
    .runMutation(internal.a2aNonces._cleanupOlderThan, {
      cutoff_ms: Date.now() - NONCE_RETENTION_MS,
    })
    .catch(() => {});
  return { ok: true, agent_id: args.agent_id! };
}
