import assert from "node:assert/strict";
import {
  SUBMAGIC_EDITOR_CONFIG,
  extractOutputUrl,
  extractSourceUrl,
  isEditBrief,
  isTerminalStatus,
  submagicApiKey,
  submagicEditor,
} from "./submagic-editor";
import { getRunner, SPECIALISTS } from "./registry";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function reset(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.SUBMAGIC_API_KEY;
  delete process.env.SUBMAGIC_TEMPLATE;
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
  await test("key resolution", () => {
    assert.equal(submagicApiKey(), undefined);
    process.env.SUBMAGIC_API_KEY = "k";
    assert.equal(submagicApiKey(), "k");
  });

  await test("brief classification", () => {
    assert.equal(isEditBrief("add captions and b-roll to this clip", "generation"), true);
    assert.equal(isEditBrief("book a flight", "reasoning"), false);
  });

  await test("source URL extraction", () => {
    assert.equal(extractSourceUrl("polish https://cdn/x.mp4"), "https://cdn/x.mp4");
  });

  await test("status classification", () => {
    assert.equal(isTerminalStatus("completed"), "ok");
    assert.equal(isTerminalStatus("ready"), "ok");
    assert.equal(isTerminalStatus("failed"), "bad");
    assert.equal(isTerminalStatus("rendering"), "pending");
  });

  await test("defensive output-URL extraction across plausible field names", () => {
    assert.equal(extractOutputUrl({ outputUrl: "https://cdn/a.mp4" }), "https://cdn/a.mp4");
    assert.equal(extractOutputUrl({ videoUrl: "https://cdn/b.mp4" }), "https://cdn/b.mp4");
    assert.equal(extractOutputUrl({ downloadUrl: "https://cdn/c.mp4" }), "https://cdn/c.mp4");
    assert.equal(extractOutputUrl({ exportUrl: "not-a-url" }), undefined);
    assert.equal(extractOutputUrl({}), undefined);
  });

  await test("registered in the static roster", () => {
    const cfg = SPECIALISTS.find((s) => s.agent_id === "submagic-editor");
    assert.ok(cfg);
    assert.equal(cfg.tier, "real");
    assert.equal(getRunner("submagic-editor").config.agent_id, "submagic-editor");
  });

  await test("declines to bid without credentials", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must not call");
    };
    const decision = await submagicEditor.bid("add captions", "generation");
    assert.ok("decline" in decision);
    assert.match(decision.reason, /SUBMAGIC_API_KEY is not configured/);
    assert.equal(called, false);
  });

  await test("probe reports demo_lane without credentials", async () => {
    const probe = await submagicEditor.probe!("generation");
    assert.equal(probe.status, "demo_lane");
  });

  await test("execute throws without credentials", async () => {
    await assert.rejects(
      () => submagicEditor.execute("edit https://cdn/a.mp4", "generation"),
      /SUBMAGIC_API_KEY is not set/,
    );
  });

  await test("execute submits with x-api-key header and polls to completion", async () => {
    process.env.SUBMAGIC_API_KEY = "k";
    const calls: string[] = [];
    let keySeen = "";
    let pollCount = 0;

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://api.submagic.co/v1", "")}`);
      keySeen = String((init?.headers as Record<string, string> | undefined)?.["x-api-key"] ?? "");
      if (url.includes("/projects") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.videoUrl, "https://cdn/source.mp4");
        assert.equal(body.templateName, "Hormozi 2");
        return new Response(JSON.stringify({ id: "sm-1" }), { status: 200 });
      }
      if (url.includes("/projects/sm-1")) {
        pollCount += 1;
        if (pollCount === 1) {
          return new Response(JSON.stringify({ status: "rendering" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ status: "completed", outputUrl: "https://cdn.submagic/out.mp4" }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await submagicEditor.execute(
      "add captions to https://cdn/source.mp4",
      "generation",
    );
    assert.equal(keySeen, "k", "auth must use x-api-key, not Bearer");
    assert.equal(pollCount, 2);
    assert.deepEqual(calls.filter((c) => c.startsWith("POST")), ["POST /projects"]);
    const text = result.output as string;
    assert.ok(text.includes("https://cdn.submagic/out.mp4"));
    assert.equal(result.provenance.external_task_id, "sm-1");
  });

  await test("a moderation/failure status surfaces the real reason", async () => {
    process.env.SUBMAGIC_API_KEY = "k";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: "sm-2" }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "failed", error: "unsupported codec" }), {
        status: 200,
      });
    };
    await assert.rejects(
      () => submagicEditor.execute("edit https://cdn/a.mp4", "generation"),
      /ended as "failed": unsupported codec/,
    );
  });

  await test("a completed status with no recognizable URL is an error, not a silent pass", async () => {
    process.env.SUBMAGIC_API_KEY = "k";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: "sm-3" }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
    };
    await assert.rejects(
      () => submagicEditor.execute("edit https://cdn/a.mp4", "generation"),
      /completed without a recognizable output URL/,
    );
  });

  await test("an auth rejection is reported as fail by the probe", async () => {
    process.env.SUBMAGIC_API_KEY = "bad";
    globalThis.fetch = async () => new Response("no", { status: 401 });
    const probe = await submagicEditor.probe!("generation");
    assert.equal(probe.status, "fail");
  });

  console.log("submagic-editor tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
