import assert from "node:assert/strict";
import {
  HIGGSFIELD_VIDEO_CONFIG,
  buildStagePrompts,
  extractAssetUrl,
  higgsfieldCredentials,
  higgsfieldMissingEnv,
  higgsfieldVideo,
  isTerminalStatus,
  isVideoBrief,
} from "./higgsfield-video";
import { getRunner, SPECIALISTS } from "./registry";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const CRED_KEYS = [
  "HIGGSFIELD_CREDENTIALS",
  "HF_CREDENTIALS",
  "HIGGSFIELD_API_KEY",
  "HF_API_KEY",
  "HIGGSFIELD_API_SECRET",
  "HF_API_SECRET",
  "HIGGSFIELD_DOP_MODEL",
];

function clearCreds(): void {
  for (const key of CRED_KEYS) delete process.env[key];
}
function reset(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  clearCreds();
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

// ─── credential resolution ───────────────────────────────────────────────────
function credentialTests(): void {
  clearCreds();
  assert.equal(higgsfieldCredentials(), undefined, "no env -> undefined");
  assert.equal(higgsfieldMissingEnv().length, 1, "missing env must be reported");

  process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
  assert.equal(higgsfieldCredentials(), "kid:secret", "combined form is used as-is");
  assert.deepEqual(higgsfieldMissingEnv(), [], "configured -> nothing missing");

  // A combined value without the colon is malformed and must not be accepted.
  process.env.HIGGSFIELD_CREDENTIALS = "no-colon-here";
  assert.equal(
    higgsfieldCredentials(),
    undefined,
    "malformed combined credential must not be used",
  );

  // Split form, including the SDK's own variable names.
  clearCreds();
  process.env.HIGGSFIELD_API_KEY = "k1";
  process.env.HIGGSFIELD_API_SECRET = "s1";
  assert.equal(higgsfieldCredentials(), "k1:s1", "split form is joined");
  clearCreds();
  process.env.HF_API_KEY = "k2";
  process.env.HF_API_SECRET = "s2";
  assert.equal(higgsfieldCredentials(), "k2:s2", "SDK env names are honoured");
  // A key with no secret is not usable.
  clearCreds();
  process.env.HIGGSFIELD_API_KEY = "lonely";
  assert.equal(higgsfieldCredentials(), undefined, "key without secret -> undefined");
  clearCreds();
}

// ─── brief classification ────────────────────────────────────────────────────
function briefTests(): void {
  assert.equal(
    isVideoBrief("make me a video about a kid jumping in joy after getting into stanford", "generation"),
    true,
    "the target prompt must be recognised as a video brief",
  );
  assert.equal(isVideoBrief("animate this logo", "generation"), true);
  assert.equal(isVideoBrief("cut a short reel for tiktok", "generation"), true);
  assert.equal(isVideoBrief("cinematic b-roll of a city", "generation"), true);
  // Must not bid on non-video work — the registry is already full of agents that
  // claim everything.
  assert.equal(isVideoBrief("summarize this PDF", "extraction"), false);
  assert.equal(isVideoBrief("review my pull request", "reasoning"), false);
  assert.equal(isVideoBrief("", ""), false);
}

// ─── stage prompt construction ───────────────────────────────────────────────
function stageTests(): void {
  const { imagePrompt, motionPrompt } = buildStagePrompts(
    "make me a video about a kid jumping in joy after getting into stanford",
  );
  // The imperative wrapper is stripped so the image model gets a scene, not an
  // instruction addressed to an assistant.
  assert.ok(
    !/^make me a video/i.test(imagePrompt),
    `imperative wrapper must be stripped: ${imagePrompt}`,
  );
  assert.ok(
    imagePrompt.includes("kid jumping in joy"),
    "the subject must survive into the image prompt",
  );
  assert.ok(
    imagePrompt.toLowerCase().includes("cinematic"),
    "image prompt must carry style direction",
  );
  assert.ok(
    motionPrompt.toLowerCase().includes("camera"),
    "motion prompt must describe camera movement",
  );
  assert.ok(
    motionPrompt.includes("kid jumping in joy"),
    "the subject must survive into the motion prompt",
  );
  // Long briefs are clamped rather than sent unbounded.
  const long = buildStagePrompts("x".repeat(5000));
  assert.ok(long.imagePrompt.length < 1200, "image prompt must be bounded");
}

// ─── response parsing ────────────────────────────────────────────────────────
function parseTests(): void {
  assert.equal(isTerminalStatus("completed"), "ok");
  assert.equal(isTerminalStatus("SUCCEEDED"), "ok", "case-insensitive");
  assert.equal(isTerminalStatus("failed"), "bad");
  assert.equal(isTerminalStatus("nsfw"), "bad", "moderation block is terminal");
  assert.equal(isTerminalStatus("queued"), "pending");
  assert.equal(isTerminalStatus("in_progress"), "pending");
  assert.equal(isTerminalStatus(undefined), "pending", "unknown is not terminal");

  assert.equal(
    extractAssetUrl({ jobs: [{ results: { raw: { url: "https://cdn/x.mp4" } } }] }),
    "https://cdn/x.mp4",
  );
  // Falls back to the min rendition when raw is absent.
  assert.equal(
    extractAssetUrl({ jobs: [{ results: { min: { url: "https://cdn/min.mp4" } } }] }),
    "https://cdn/min.mp4",
  );
  // No asset, empty job list, and non-http values must all be undefined rather
  // than producing a bogus link.
  assert.equal(extractAssetUrl({ jobs: [] }), undefined);
  assert.equal(extractAssetUrl({}), undefined);
  assert.equal(
    extractAssetUrl({ jobs: [{ results: { raw: { url: "not-a-url" } } }] }),
    undefined,
    "a non-http value must not be treated as an asset",
  );
}

async function main(): Promise<void> {
  await test("credential resolution", credentialTests);
  await test("video brief classification", briefTests);
  await test("stage prompt construction", stageTests);
  await test("status and asset parsing", parseTests);

  // ─── registration ──────────────────────────────────────────────────────────
  await test("registered in the static roster with a real runner", () => {
    const cfg = SPECIALISTS.find((s) => s.agent_id === "higgsfield-video");
    assert.ok(cfg, "higgsfield-video must be in the static roster");
    assert.equal(cfg.tier, "real", "must be a real tier, not mock");
    const runner = getRunner("higgsfield-video");
    assert.equal(runner.config.agent_id, "higgsfield-video");
    assert.equal(typeof runner.probe, "function", "must expose a liveness probe");
    // Capability strings are what routing matches on; they must be specific.
    assert.ok(
      cfg.capabilities.some((c) => c.includes("video")),
      "capabilities must mention video",
    );
    assert.ok(
      !cfg.capabilities.includes("mcp tool forwarding"),
      "must not carry the catalog boilerplate capability",
    );
  });

  // ─── honesty: no credentials ───────────────────────────────────────────────
  await test("declines to bid without credentials", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("fetch must not be called without credentials");
    };
    const decision = await higgsfieldVideo.bid(
      "make me a video about a kid jumping in joy after getting into stanford",
      "generation",
    );
    assert.ok("decline" in decision, "must decline, not bid");
    assert.match(decision.reason, /credentials are not configured/);
    assert.equal(called, false, "must not attempt a network call");
  });

  await test("probe reports demo_lane (not fail) without credentials", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("no call expected");
    };
    const probe = await higgsfieldVideo.probe!("generation");
    // "fail" would libel a service Arbor simply cannot reach.
    assert.equal(probe.status, "demo_lane");
    assert.match(probe.error_message ?? "", /not configured/);
    assert.equal(called, false);
  });

  await test("execute throws rather than faking a video URL", async () => {
    globalThis.fetch = async () => {
      throw new Error("no call expected");
    };
    await assert.rejects(
      () => higgsfieldVideo.execute("make me a video", "generation"),
      /credentials are not set/,
      "must refuse to execute without credentials",
    );
  });

  // ─── declines out-of-scope work even when configured ───────────────────────
  await test("declines non-video work when configured", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    const decision = await higgsfieldVideo.bid("summarize this contract", "extraction");
    assert.ok("decline" in decision, "must decline out-of-scope work");
    assert.match(decision.reason, /moving image/);
  });

  await test("bids on the stanford video brief when configured", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    const decision = await higgsfieldVideo.bid(
      "make me a video about a kid jumping in joy after getting into stanford",
      "generation",
    );
    assert.ok(!("decline" in decision), `expected a bid, got ${JSON.stringify(decision)}`);
    assert.equal(decision.bid_price, HIGGSFIELD_VIDEO_CONFIG.cost_baseline);
    assert.ok(decision.estimated_seconds > 0);
    assert.match(decision.capability_claim, /Higgsfield/);
  });

  // ─── full two-stage pipeline against a stubbed API ─────────────────────────
  await test("execute runs text-to-image then image-to-video", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    const calls: string[] = [];
    let authSeen = "";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://platform.higgsfield.ai", "")}`);
      authSeen = String(
        (init?.headers as Record<string, string> | undefined)?.authorization ?? "",
      );
      if (url.includes("text-to-image")) {
        return new Response(JSON.stringify({ request_id: "img-1" }), { status: 200 });
      }
      if (url.includes("image2video")) {
        return new Response(JSON.stringify({ request_id: "vid-1" }), { status: 200 });
      }
      if (url.includes("/requests/img-1/status")) {
        return new Response(
          JSON.stringify({
            status: "completed",
            jobs: [{ results: { raw: { url: "https://cdn.higgsfield/frame.jpg" } } }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/requests/vid-1/status")) {
        return new Response(
          JSON.stringify({
            status: "completed",
            jobs: [{ results: { raw: { url: "https://cdn.higgsfield/clip.mp4" } } }],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await higgsfieldVideo.execute(
      "make me a video about a kid jumping in joy after getting into stanford",
      "generation",
    );

    assert.equal(authSeen, "Key kid:secret", "must send the Key auth scheme");
    assert.deepEqual(calls, [
      "POST /flux-pro/kontext/max/text-to-image",
      "GET /requests/img-1/status",
      "POST /v1/image2video/dop",
      "GET /requests/vid-1/status",
    ], "must run the two stages in order, polling each");

    assert.equal(typeof result.output, "string", "video output must be markdown text");
    const text = result.output as string;
    assert.ok(text.includes("https://cdn.higgsfield/clip.mp4"), "video URL in output");
    assert.ok(text.includes("https://cdn.higgsfield/frame.jpg"), "key frame in output");
    assert.equal(result.provenance.live_tools_called, true);
    assert.equal(result.provenance.transport, "api");
    assert.equal(result.provenance.proof_level, "api_call");
    assert.equal(result.provenance.successful_tool_call_count, 2);
    assert.deepEqual(result.provenance.tool_call_ids, ["img-1", "vid-1"]);
    assert.equal(result.provenance.external_task_id, "vid-1");
  });

  await test("a completed job with no asset URL is an error, not a silent pass", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("text-to-image")) {
        return new Response(JSON.stringify({ request_id: "img-2" }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "completed", jobs: [{}] }), {
        status: 200,
      });
    };
    await assert.rejects(
      () => higgsfieldVideo.execute("make me a video", "generation"),
      /completed without an asset URL/,
    );
  });

  await test("a moderation block surfaces the real reason", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("text-to-image")) {
        return new Response(JSON.stringify({ request_id: "img-3" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ status: "failed", error: "content policy" }),
        { status: 200 },
      );
    };
    await assert.rejects(
      () => higgsfieldVideo.execute("make me a video", "generation"),
      /ended as "failed": content policy/,
    );
  });

  await test("an auth rejection is reported as fail by the probe", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "bad:creds";
    globalThis.fetch = async () => new Response("nope", { status: 401 });
    const probe = await higgsfieldVideo.probe!("generation");
    assert.equal(probe.status, "fail");
    assert.match(probe.error_message ?? "", /rejected the credential pair \(401\)/);
  });

  await test("a 404 on the sentinel request id means auth worked", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    globalThis.fetch = async () => new Response("not found", { status: 404 });
    const probe = await higgsfieldVideo.probe!("generation");
    assert.equal(probe.status, "pass", "404 proves the credentials were accepted");
  });

  await test("submit failure surfaces the HTTP status", async () => {
    process.env.HIGGSFIELD_CREDENTIALS = "kid:secret";
    globalThis.fetch = async () => new Response("rate limited", { status: 429 });
    await assert.rejects(
      () => higgsfieldVideo.execute("make me a video", "generation"),
      /returned 429/,
    );
  });

  console.log("higgsfield-video tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
