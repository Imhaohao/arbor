import assert from "node:assert/strict";
import { createServer } from "node:http";
import { callA2aAgent } from "./connector-backends";

async function main() {
  const calls: Array<{ path: string; method: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const rpc = JSON.parse(body) as { id: string; method: string };
      calls.push({ path: request.url ?? "", method: rpc.method });
      response.setHeader("content-type", "application/json");

      if (request.url !== "/a2a") {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      if (rpc.method === "message/send") {
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { id: "task-1", status: { state: "working" } },
          }),
        );
        return;
      }
      if (rpc.method === "tasks/get") {
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              id: "task-1",
              status: { state: "completed" },
              artifacts: [{ parts: [{ kind: "text", text: "fallback poll complete" }] }],
            },
          }),
        );
        return;
      }
      response.statusCode = 400;
      response.end("unsupported method");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const reply = await callA2aAgent({
      endpoint: origin,
      text: "read-only fallback test",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    });

    assert.equal(reply.text, "fallback poll complete");
    assert.equal(reply.provenance, `real agent-to-agent: A2A message/send @ ${origin}/a2a`);
    assert.ok(calls.some((call) => call.path === "/a2a" && call.method === "message/send"));
    assert.ok(calls.some((call) => call.path === "/a2a" && call.method === "tasks/get"));
    assert.equal(
      calls.some((call) => call.path === "/" && call.method === "tasks/get"),
      false,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  console.log("connector-backends tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
