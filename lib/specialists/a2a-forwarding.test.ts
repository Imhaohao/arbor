import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { makeA2aForwardingSpecialist } from "./a2a-forwarding";
import type { BidPayload, SpecialistConfig, SpecialistDecision } from "../types";

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function writeJson(res: ServerResponse, body: unknown) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function startMessageA2aServer(
  options: {
    requireTypeText?: boolean;
    echoMessage?: boolean;
    failFirstCostEstimate?: boolean;
  } = {},
) {
  const requestedAgents: string[] = [];
  let dialectRetries = 0;
  let failedCostEstimate = false;
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    const body = await readJson(req);
    const params = body.params as
      | {
          metadata?: { agent_id?: string; intent?: string };
          message?: {
            parts?: Array<{ kind?: string; type?: string; text?: string }>;
          };
        }
      | undefined;
    const agentId = params?.metadata?.agent_id ?? "unknown-agent";
    if (
      options.failFirstCostEstimate &&
      params?.metadata?.intent === "cost_estimate" &&
      !failedCostEstimate
    ) {
      failedCostEstimate = true;
      req.socket.destroy();
      return;
    }
    if (
      options.requireTypeText &&
      params?.message?.parts?.some((part) => part.type !== "text")
    ) {
      dialectRetries += 1;
      writeJson(res, {
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32602,
          message: "Invalid params: message.parts[0] must be type=text",
        },
      });
      return;
    }
    requestedAgents.push(agentId);
    const sentText = params?.message?.parts?.find(
      (part) => typeof part.text === "string",
    )?.text;

    writeJson(res, {
      jsonrpc: "2.0",
      id: body.id,
      result: {
        kind: "message",
        role: "agent",
        messageId: `reply-${agentId}`,
        parts: [
          {
            kind: "text",
            text: options.echoMessage
              ? `Hello World! You said: "${sentText ?? ""}"`
              : `1. Review the user's travel request as ${agentId}. ` +
                `2. Return a concise route, timing, and source-check plan using the agent's live A2A response. ` +
                `3. Flag any booking or payment step that needs user confirmation.`,
          },
        ],
      },
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    requestedAgents,
    get dialectRetries() {
      return dialectRetries;
    },
    url: `http://127.0.0.1:${address.port}/a2a`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function configFor(agentId: string, endpoint: string): SpecialistConfig {
  return {
    agent_id: agentId,
    display_name: agentId,
    sponsor: "Local A2A Test",
    capabilities: ["travel-research", "route-comparison", "booking-safety"],
    system_prompt: `You are ${agentId}, a local A2A test specialist.`,
    cost_baseline: 3,
    starting_reputation: 0.5,
    one_liner: "Local A2A test responder.",
    tier: "a2a",
    a2a_endpoint: endpoint,
    a2a_auth_mode: "none",
    discovered: true,
    discovered_for: "a2a-forwarding regression",
    discovery_source: "registry",
  };
}

function isBid(decision: SpecialistDecision): decision is BidPayload {
  return !("decline" in decision);
}

async function main() {
  const server = await startMessageA2aServer();
  try {
    const runners = Array.from({ length: 20 }, (_, index) =>
      makeA2aForwardingSpecialist(
        configFor(`local-a2a-bidder-${index + 1}`, server.url),
      ),
    );

    const decisions = await Promise.all(
      runners.map((runner) =>
        runner.bid(
          "Find safe flight options from Shanghai PVG to Seoul ICN on July 11, 2026.\n\nBudget ceiling: $2.00. Do not bid above this budget.",
          "general",
        ),
      ),
    );

    const bids = decisions.filter(isBid);
    assert.equal(bids.length, 20);
    assert.equal(server.requestedAgents.length, 20);
    assert.equal(new Set(server.requestedAgents).size, 20);
    for (const bid of bids) {
      assert.equal(bid.bid_price, 1.6);
      assert.equal(bid.estimated_seconds, 30);
      assert.equal(bid.plan_source, "remote");
      assert.match(bid.capability_claim, /travel request/);
    }
    console.log("a2a-forwarding tests passed: 20 message-shaped responders bid under budget");
  } finally {
    await server.close();
  }

  const legacyServer = await startMessageA2aServer({ requireTypeText: true });
  try {
    const runner = makeA2aForwardingSpecialist(
      configFor("legacy-type-a2a", legacyServer.url),
    );
    const bid = await runner.bid(
      "Research a safe route and summarize the result.",
      "general",
    );
    assert.ok(isBid(bid));
    assert.equal(bid.plan_source, "remote");

    const execution = await runner.execute(
      "Research a safe route and summarize the result.",
      "general",
    );
    assert.equal(execution.provenance.live_tools_called, true);
    assert.match(String(execution.output), /travel request/);
    assert.equal(legacyServer.dialectRetries, 2);
    assert.deepEqual(legacyServer.requestedAgents, [
      "legacy-type-a2a",
      "legacy-type-a2a",
    ]);
    console.log("a2a-forwarding tests passed: legacy type=text bid and execute");
  } finally {
    await legacyServer.close();
  }

  const echoServer = await startMessageA2aServer({
    echoMessage: true,
    failFirstCostEstimate: true,
  });
  try {
    const runner = makeA2aForwardingSpecialist(
      configFor("echo-a2a", echoServer.url),
    );
    const decision = await runner.bid(
      "Return the exact acknowledgement token ARBOR-A2A-ALPHA.",
      "general",
    );
    assert.ok(isBid(decision));
    assert.equal(decision.plan_source, "baseline");
    assert.match(decision.capability_claim, /Plan drafted by Arbor/);
    console.log("a2a-forwarding tests passed: safe bid retry and echo-plan fallback");
  } finally {
    await echoServer.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
