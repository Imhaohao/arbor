import assert from "node:assert/strict";
import {
  OPUSCLIP_EDITOR_CONFIG,
  extractClips,
  extractProjectId,
  extractSourceUrl,
  isRepurposeBrief,
  opusApiKey,
  opusclipEditor,
} from "./opusclip-editor";
import { getRunner, SPECIALISTS } from "./registry";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function reset(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.OPUSCLIP_API_KEY;
  delete process.env.OPUSCLIP_ORG_ID;
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
    assert.equal(opusApiKey(), undefined);
    process.env.OPUSCLIP_API_KEY = "k";
    assert.equal(opusApiKey(), "k");
  });

  await test("scope: repurpose brief vs not", () => {
    assert.equal(isRepurposeBrief("repurpose this long podcast into highlights", "generation"), true);
    assert.equal(isRepurposeBrief("add captions to this short clip", "generation"), false);
  });

  await test("source URL extraction", () => {
    assert.equal(extractSourceUrl("source: https://cdn/long.mp4"), "https://cdn/long.mp4");
  });

  await test("defensive project-id extraction across plausible field names", () => {
    assert.equal(extractProjectId({ id: "a" }), "a");
    assert.equal(extractProjectId({ projectId: "b" }), "b");
    assert.equal(extractProjectId({ project_id: "c" }), "c");
    assert.equal(extractProjectId({}), undefined);
  });

  await test("defensive clips extraction across plausible field names", () => {
    assert.deepEqual(extractClips({ clips: [{ id: "1" }] }), [{ id: "1" }]);
    assert.deepEqual(extractClips({ data: [{ id: "2" }] }), [{ id: "2" }]);
    assert.deepEqual(extractClips({}), []);
  });

  await test("registered in the static roster", () => {
    const cfg = SPECIALISTS.find((s) => s.agent_id === "opusclip-editor");
    assert.ok(cfg);
    assert.equal(cfg.tier, "real");
    assert.equal(getRunner("opusclip-editor").config.agent_id, "opusclip-editor");
  });

  await test("declines to bid without credentials", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must not call");
    };
    const decision = await opusclipEditor.bid("repurpose this podcast", "generation");
    assert.ok("decline" in decision);
    assert.match(decision.reason, /OPUSCLIP_API_KEY is not configured/);
    assert.equal(called, false);
  });

  await test("declines a caption/polish brief even when configured (wrong tool)", async () => {
    process.env.OPUSCLIP_API_KEY = "k";
    const decision = await opusclipEditor.bid("add captions to this short clip", "generation");
    assert.ok("decline" in decision);
    assert.match(decision.reason, /repurposes a LONG source video/);
  });

  await test("probe reports demo_lane without credentials", async () => {
    const probe = await opusclipEditor.probe!("generation");
    assert.equal(probe.status, "demo_lane");
  });

  await test("execute throws without credentials", async () => {
    await assert.rejects(
      () => opusclipEditor.execute("repurpose https://cdn/a.mp4", "generation"),
      /OPUSCLIP_API_KEY is not set/,
    );
  });

  await test("execute submits, polls until clips appear, returns export URLs", async () => {
    process.env.OPUSCLIP_API_KEY = "k";
    process.env.OPUSCLIP_ORG_ID = "org-1";
    const calls: string[] = [];
    let authSeen = "";
    let orgSeen = "";
    let pollCount = 0;

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://api.opus.pro/api", "")}`);
      authSeen = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
      orgSeen = String((init?.headers as Record<string, string> | undefined)?.["x-opus-org-id"] ?? "");
      if (url.includes("clip-projects")) {
        return new Response(JSON.stringify({ id: "proj-9" }), { status: 200 });
      }
      if (url.includes("exportable-clips")) {
        pollCount += 1;
        if (pollCount === 1) {
          return new Response(JSON.stringify({ clips: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            clips: [
              { title: "Best moment", uriForExport: "https://cdn.opus/clip1.mp4" },
              { title: "No export yet" },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await opusclipEditor.execute("repurpose https://cdn/long.mp4", "generation");
    assert.equal(authSeen, "Bearer k");
    assert.equal(orgSeen, "org-1");
    assert.equal(pollCount, 2, "must poll until clips are non-empty");
    const text = result.output as string;
    assert.ok(text.includes("https://cdn.opus/clip1.mp4"));
    assert.ok(!text.includes("No export yet"), "a clip without an export URL must be filtered out");
    assert.equal(result.provenance.external_task_id, "proj-9");
  });

  await test("clips with no export URL at all is an error", async () => {
    process.env.OPUSCLIP_API_KEY = "k";
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("clip-projects")) {
        return new Response(JSON.stringify({ id: "proj-10" }), { status: 200 });
      }
      return new Response(JSON.stringify({ clips: [{ title: "x" }] }), { status: 200 });
    };
    await assert.rejects(
      () => opusclipEditor.execute("repurpose https://cdn/a.mp4", "generation"),
      /returned clips with no export URL/,
    );
  });

  await test("an auth rejection is reported as fail by the probe", async () => {
    process.env.OPUSCLIP_API_KEY = "bad";
    globalThis.fetch = async () => new Response("no", { status: 401 });
    const probe = await opusclipEditor.probe!("generation");
    assert.equal(probe.status, "fail");
  });

  console.log("opusclip-editor tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
