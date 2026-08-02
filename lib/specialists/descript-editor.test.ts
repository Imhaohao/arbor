import assert from "node:assert/strict";
import {
  DESCRIPT_EDITOR_CONFIG,
  descriptApiToken,
  descriptEditor,
  extractSourceUrl,
  isEditBrief,
} from "./descript-editor";
import { getRunner, SPECIALISTS } from "./registry";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function reset(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.DESCRIPT_API_TOKEN;
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
  await test("token resolution", () => {
    assert.equal(descriptApiToken(), undefined);
    process.env.DESCRIPT_API_TOKEN = "t";
    assert.equal(descriptApiToken(), "t");
  });

  await test("brief classification", () => {
    assert.equal(isEditBrief("remove filler words from this podcast", "generation"), true);
    assert.equal(isEditBrief("plan a trip to Japan", "reasoning"), false);
  });

  await test("source URL extraction", () => {
    assert.equal(
      extractSourceUrl("clean up https://cdn.example.com/raw.mov"),
      "https://cdn.example.com/raw.mov",
    );
  });

  await test("registered in the static roster", () => {
    const cfg = SPECIALISTS.find((s) => s.agent_id === "descript-editor");
    assert.ok(cfg);
    assert.equal(cfg.tier, "real");
    assert.equal(getRunner("descript-editor").config.agent_id, "descript-editor");
  });

  await test("declines to bid without credentials", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must not call");
    };
    const decision = await descriptEditor.bid("remove filler words", "generation");
    assert.ok("decline" in decision);
    assert.match(decision.reason, /DESCRIPT_API_TOKEN is not configured/);
    assert.equal(called, false);
  });

  await test("probe reports demo_lane without credentials", async () => {
    const probe = await descriptEditor.probe!("generation");
    assert.equal(probe.status, "demo_lane");
  });

  await test("execute throws without credentials", async () => {
    await assert.rejects(
      () => descriptEditor.execute("edit https://cdn/a.mp4", "generation"),
      /DESCRIPT_API_TOKEN is not set/,
    );
  });

  await test("execute runs import, agent, publish in order and polls each", async () => {
    process.env.DESCRIPT_API_TOKEN = "t";
    const calls: string[] = [];
    let authSeen = "";
    let pollCountForImport = 0;

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      authSeen = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
      calls.push(`${method} ${url.replace("https://descriptapi.com/v1", "")}`);

      if (url.includes("/jobs/import/project_media")) {
        return new Response(
          JSON.stringify({ job_id: "job-import", project_id: "proj-1" }),
          { status: 200 },
        );
      }
      if (url.includes("/jobs/agent")) {
        return new Response(JSON.stringify({ job_id: "job-agent" }), { status: 200 });
      }
      if (url.includes("/jobs/publish")) {
        return new Response(JSON.stringify({ job_id: "job-publish" }), { status: 200 });
      }
      if (url.includes("/jobs/job-import")) {
        pollCountForImport += 1;
        // First poll pending, second poll stopped — proves the loop actually waits.
        if (pollCountForImport === 1) {
          return new Response(JSON.stringify({ job_state: "running" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            job_state: "stopped",
            result: { status: "success", share_url: "https://web.descript.com/proj-1" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/jobs/job-agent")) {
        return new Response(
          JSON.stringify({
            job_state: "stopped",
            result: { status: "success", agent_response: "Removed 12 filler words." },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/jobs/job-publish")) {
        return new Response(
          JSON.stringify({
            job_state: "stopped",
            result: { status: "success", download_url: "https://dl.descript.com/final.mp4" },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await descriptEditor.execute(
      "clean up https://cdn/source.mp4",
      "generation",
    );

    assert.equal(authSeen, "Bearer t");
    assert.equal(pollCountForImport, 2, "poll must retry until job_state is stopped");
    assert.deepEqual(calls.filter((c) => c.startsWith("POST")), [
      "POST /jobs/import/project_media",
      "POST /jobs/agent",
      "POST /jobs/publish",
    ]);
    const text = result.output as string;
    assert.ok(text.includes("https://dl.descript.com/final.mp4"));
    assert.ok(text.includes("Removed 12 filler words."));
    assert.equal(result.provenance.successful_tool_call_count, 3);
    assert.deepEqual(result.provenance.tool_call_ids, ["job-import", "job-agent", "job-publish"]);
  });

  await test("a failed agent job surfaces the real status", async () => {
    process.env.DESCRIPT_API_TOKEN = "t";
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/jobs/import/project_media")) {
        return new Response(
          JSON.stringify({ job_id: "job-import", project_id: "proj-2" }),
          { status: 200 },
        );
      }
      if (url.includes("/jobs/job-import")) {
        return new Response(
          JSON.stringify({ job_state: "stopped", result: { status: "success" } }),
          { status: 200 },
        );
      }
      if (url.includes("/jobs/agent")) {
        return new Response(JSON.stringify({ job_id: "job-agent" }), { status: 200 });
      }
      if (url.includes("/jobs/job-agent")) {
        return new Response(
          JSON.stringify({ job_state: "stopped", result: { status: "failed" } }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };
    await assert.rejects(
      () => descriptEditor.execute("edit https://cdn/a.mp4", "generation"),
      /finished with status "failed"/,
    );
  });

  await test("an auth rejection is reported as fail by the probe", async () => {
    process.env.DESCRIPT_API_TOKEN = "bad";
    globalThis.fetch = async () => new Response("no", { status: 401 });
    const probe = await descriptEditor.probe!("generation");
    assert.equal(probe.status, "fail");
  });

  console.log("descript-editor tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
