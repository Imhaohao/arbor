"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { verifyInbound } from "./a2aAuthCore";

const verifyArgs = {
  raw_body: v.string(),
  agent_id: v.optional(v.string()),
  timestamp: v.optional(v.string()),
  nonce: v.optional(v.string()),
  signature: v.optional(v.string()),
};

/** Public verifier used by the A2A route before dispatching a request. */
export const verifyInboundCallback = action({
  args: verifyArgs,
  handler: verifyInbound,
});
