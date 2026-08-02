import assert from "node:assert/strict";
import {
  REAP_EDITOR_CONFIG,
  extractClipUrl,
  extractSourceUrl,
  isEditBrief,
  isTerminalStatus,
  reapApiKey,
  reapEditor,
} from "./reap-editor";
import { getRunner, SPECIALISTS } from "./registry";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function reset(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.REAP_API_KEY;
  globalThis.fetch = ORIGINAL_FETCH;
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  reset();
  try {
    await fn();
    console.log(`ok - ${name}`);
  } finally {
    reset();
  }
}

async function main(): Promise<void> {
  await test("no credentials -> undefined key", () => {
    assert.equal(reapApiKey(), undefined);
    process.env.REAP_API_KEY = "k";
    assert.equal(reapApiKey(), "k");
  });

  await test("brief classification", () => {
    assert.equal(isEditBrief("add captions to this video", "generation"), true);
    assert.equal(isEditBrief("summarize this contract", "extraction"), false);
  });

  await test("source URL extraction from prompt text", () => {
    assert.equal(
      extractSourceUrl("edit this: https://cdn.example.com/clip.mp4 please"),
      "https://cdn.example.com/clip.mp4",
    );
    assert.equal(extractSourceUrl("no url here"), undefined);
  });

  await test("status classification", () => {
    assert.equal(isTerminalStatus("completed"), "ok");
    assert.equal(isTerminalStatus("failed"), "bad");
    assert.equal(isTerminalStatus("expired"), "bad");
    assert.equal(isTerminalStatus("processing"), "pending");
    assert.equal(isTerminalStatus(undefined), "pending");
  });

  await test("clip URL extraction falls back and rejects non-http", () => {
    assert.equal(extractClipUrl({ clips: [{ clipUrl: "https://cdn/a.mp4" }] }), "https://cdn/a.mp4");
    assert.equal(
      extractClipUrl({ clips: [{ clipWithCaptionsUrl: "https://cdn/b.mp4" }] }),
      "https://cdn/b.mp4",
    );
    assert.equal(extractClipUrl({ clips: [] }), undefined);
    assert.equal(extractClipUrl({}), undefined);
  });

  await test("registered in the static roster with a real runner", () => {
    const cfg = SPECIALISTS.find((s) => s.agent_id === "reap-editor");
    assert.ok(cfg);
    assert.equal(cfg.tier, "real");
    assert.equal(getRunner("reap-editor").config.agent_id, "reap-editor");
  });

  await test("declines to bid without credentials", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must not call");
    };
    const decision = await reapEditor.bid("add captions to this video", "generation");
    assert.ok("decline" in decision);
    assert.match(decision.reason, /REAP_API_KEY is not configured/);
    assert.equal(called, false);
  });

  await test("probe reports demo_lane without credentials", async () => {
    const probe = await reapEditor.probe!("generation");
    assert.equal(probe.status, "demo_lane");
  });

  await test("execute throws rather than faking a video URL", async () => {
    await assert.rejects(
      () => reapEditor.execute("add captions https://cdn/a.mp4", "generation"),
      /REAP_API_KEY is not set/,
    );
  });

  await test("declines out-of-scope work when configured", async () => {
    process.env.REAP_API_KEY = "k";
    const decision = await reapEditor.bid("summarize this contract", "extraction");
    assert.ok("decline" in decision);
    assert.match(decision.reason, /video-editing task/);
  });

  await test("execute runs create-captions then polls status then clips", async () => {
    process.env.REAP_API_KEY = "k";
    const calls: string[] = [];
    let authSeen = "";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.split("automation")[1]}`);
      authSeen = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
      if (url.includes("create-captions")) {
        return new Response(JSON.stringify({ id: "proj-1" }), { status: 200 });
      }
      if (url.includes("get-project-status")) {
        return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
      }
      if (url.includes("get-project-clips")) {
        return new Response(
          JSON.stringify({ clips: [{ clipUrl: "https://cdn.reap/out.mp4" }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await reapEditor.execute(
      "add captions to https://cdn/source.mp4",
      "generation",
    );
    assert.equal(authSeen, "Bearer k");
    assert.deepEqual(calls, [
      "POST /create-captions",
      "GET /get-project-status?projectId=proj-1",
      "GET /get-project-clips?projectId=proj-1",
    ]);
    const text = result.output as string;
    assert.ok(text.includes("https://cdn.reap/out.mp4"));
    assert.equal(result.provenance.live_tools_called, true);
    assert.equal(result.provenance.external_task_id, "proj-1");
  });

  await test("a failed project throws with the real status", async () => {
    process.env.REAP_API_KEY = "k";
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("create-captions")) {
        return new Response(JSON.stringify({ id: "proj-2" }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "failed" }), { status: 200 });
    };
    await assert.rejects(
      () => reapEditor.execute("caption https://cdn/x.mp4", "generation"),
      /ended as "failed"/,
    );
  });

  await test("an auth rejection is reported as fail by the probe", async () => {
    process.env.REAP_API_KEY = "bad";
    globalThis.fetch = async () => new Response("no", { status: 401 });
    const probe = await reapEditor.probe!("generation");
    assert.equal(probe.status, "fail");
  });

  console.log("reap-editor tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
