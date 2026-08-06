import assert from "node:assert/strict";
import { isSessionlessToolTransport, receiptShortfall } from "./receipt-rule";

// The regression this rule exists to prevent, measured 2026-08-06:
// nia-context made 138 live MCP tool calls (nia_research x71, index x26,
// search x22) with 124 recorded artifacts, and lost all 4 of its auctions on
// "partial_receipt: missing external_session_id". Nia is a stateless
// Streamable-HTTP server and never issues Mcp-Session-Id, so no amount of
// real work could ever have satisfied the old rule.
{
  const nia = {
    transport: "mcp",
    successful_tool_call_count: 34,
    external_session_id: undefined,
    events_observed_total: 0,
    artifact_present: true,
  };
  assert.deepEqual(receiptShortfall(nia), []);
}

// An MCP agent that called nothing has proved nothing, session id or not.
{
  const shortfall = receiptShortfall({
    transport: "mcp",
    successful_tool_call_count: 0,
    events_observed_total: 0,
    artifact_present: true,
  });
  assert.deepEqual(shortfall, ["successful_tool_calls"]);
}

// MCP still has to deliver something.
{
  const shortfall = receiptShortfall({
    transport: "mcp",
    successful_tool_call_count: 5,
    events_observed_total: 0,
    artifact_present: false,
  });
  assert.deepEqual(shortfall, ["artifact_present"]);
}

// Session-based transports are UNCHANGED: A2A must still present a real
// session id and observed events. Loosening MCP must not loosen A2A.
{
  const shortfall = receiptShortfall({
    transport: "a2a-bridge",
    successful_tool_call_count: 99,
    external_session_id: undefined,
    events_observed_total: 0,
    artifact_present: true,
  });
  assert.deepEqual(shortfall, ["external_session_id", "events_observed"]);
}

// A complete A2A receipt passes.
{
  const shortfall = receiptShortfall({
    transport: "a2a-bridge",
    external_session_id: "sess_abc",
    events_observed_total: 3,
    artifact_present: true,
  });
  assert.deepEqual(shortfall, []);
}

// A missing/unknown transport is treated as session-based — fail closed, so a
// new transport cannot silently inherit the sessionless exemption.
{
  const shortfall = receiptShortfall({
    transport: undefined,
    successful_tool_call_count: 10,
    events_observed_total: 0,
    artifact_present: true,
  });
  assert.deepEqual(shortfall, ["external_session_id", "events_observed"]);
}

{
  assert.equal(isSessionlessToolTransport("mcp"), true);
  assert.equal(isSessionlessToolTransport("a2a-bridge"), false);
  assert.equal(isSessionlessToolTransport(undefined), false);
}

console.log("receipt-rule.test.ts: all assertions passed");
