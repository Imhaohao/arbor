import type { PlannedNode } from "./dag";

// Media production DAGs.
//
// Shape (both formats):
//
//   creative_brief ──┬─> generate_video ──┬─> edit_video ──> media_review
//                    └─> generate_music ──┘
//
// generate_music runs in PARALLEL with generate_video rather than after it: the
// two are independent given the brief, and serializing them would add the music
// render time to the critical path for nothing. The editor is the join point,
// which is also the first node that can actually lay audio under picture — before
// this node existed, a generated clip reached the editor with no soundtrack and
// the editor had to ship it silent or invent sound design it could not perform.
//
// Node descriptions name candidate specialists but always say they are candidates,
// never requirements. That wording is deliberate: the router picks on measured
// cost-adjusted capability, and hardcoding a vendor into the brief would override
// the arbitration this system exists to do.

const SHORT_FORM_PLATFORM_RE =
  /\b(tik\s*tok|tiktok|instagram reels?|youtube shorts?|short[- ]form|vertical video)\b/i;
/** Long-form / widescreen destinations. `youtube shorts` is excluded — that is
 * matched by SHORT_FORM_PLATFORM_RE and must stay vertical. */
const LONG_FORM_PLATFORM_RE =
  /\b(youtube(?!\s+shorts?)|long[- ]form|widescreen|16:9|landscape video|vimeo|webinar|documentary)\b/i;
const VIDEO_INTENT_RE =
  /\b(video|clip|reel|short)\b.*\b(create|make|generate|produce|edit)|\b(create|make|generate|produce|edit)\b.*\b(video|clip|reel|short)\b/i;

export type MediaFormat = "vertical" | "widescreen";

export function isShortFormVideoPipeline(
  prompt: string,
  taskType?: string,
): boolean {
  const input = `${taskType ?? ""} ${prompt}`;
  return SHORT_FORM_PLATFORM_RE.test(input) && VIDEO_INTENT_RE.test(input);
}

/**
 * Long-form/widescreen video intent, e.g. "make a high quality video for my
 * YouTube channel". Short-form wins on ties so "YouTube Shorts" stays vertical.
 */
export function isLongFormVideoPipeline(
  prompt: string,
  taskType?: string,
): boolean {
  const input = `${taskType ?? ""} ${prompt}`;
  if (isShortFormVideoPipeline(prompt, taskType)) return false;
  return LONG_FORM_PLATFORM_RE.test(input) && VIDEO_INTENT_RE.test(input);
}

/** True when either media pipeline applies. */
export function isMediaPipeline(prompt: string, taskType?: string): boolean {
  return (
    isShortFormVideoPipeline(prompt, taskType) ||
    isLongFormVideoPipeline(prompt, taskType)
  );
}

/** Which format a prompt implies, or undefined when it is not a media task. */
export function detectMediaFormat(
  prompt: string,
  taskType?: string,
): MediaFormat | undefined {
  if (isShortFormVideoPipeline(prompt, taskType)) return "vertical";
  if (isLongFormVideoPipeline(prompt, taskType)) return "widescreen";
  return undefined;
}

interface FormatSpec {
  aspect: string;
  orientation: string;
  briefNoun: string;
  reviewAspect: string;
  maxDuration: string;
  handoff: string;
}

const FORMATS: Record<MediaFormat, FormatSpec> = {
  vertical: {
    aspect: "9:16",
    orientation: "vertical",
    briefNoun: "vertical short-form video",
    reviewAspect: "9:16 or intentionally vertical",
    maxDuration: "at most 10 minutes",
    handoff:
      "Do not upload to TikTok: Arbor's Upload API button owns the user-authorized handoff.",
  },
  widescreen: {
    aspect: "16:9",
    orientation: "widescreen",
    briefNoun: "widescreen long-form video",
    reviewAspect: "16:9 or intentionally widescreen",
    maxDuration: "within the duration stated in the brief",
    handoff:
      "Do not publish to YouTube: publishing is a user-authorized handoff Arbor performs explicitly, not a step this DAG takes.",
  },
};

/**
 * Plan a media-production DAG for the given format.
 *
 * `planShortFormVideoPipeline` is the vertical special case, kept as a named
 * export because existing callers and the planner dispatch on it.
 */
export function planMediaPipeline(
  prompt: string,
  format: MediaFormat = "vertical",
): PlannedNode[] {
  const goal = prompt.trim();
  if (!goal) throw new Error("video goal is required");
  const spec = FORMATS[format];

  return [
    {
      id: "creative_brief",
      description:
        `Turn this user idea into a concise production brief for a ${spec.briefNoun}: ${goal}\n` +
        "Specify the hook, beat-by-beat shot plan, on-screen text, voice or dialogue, target duration, and audio direction. " +
        "State the music direction explicitly — genre, mood, instrumentation, energy arc, and whether it must be instrumental — because a separate node renders the score from this brief alone. " +
        "Preserve the user's intent and flag any missing choice without inventing brand claims.",
      depends_on: [],
      success_criteria:
        `A generator-ready ${spec.aspect} brief with a clear hook, shots, timing, text, and explicit music direction.`,
      task_class: "generation",
    },
    {
      id: "generate_video",
      description:
        "Generate the source video from the approved creative brief. Route to the best cost-adjusted capable video-generation specialist; Higgsfield is one candidate, not a requirement. " +
        "The result must be real media, not a prompt or description. If the provider returns a public HTTPS output URL, persist it with Arbor media_import_url; otherwise upload raw bytes with media_request_upload and media_finalize_upload. " +
        "Append the returned artifact_id to the DAG blackboard as an artifact_reference.",
      depends_on: ["creative_brief"],
      success_criteria:
        `A playable ${spec.orientation} source-video artifact is stored in Convex Storage and referenced on the blackboard.`,
      task_class: "generation",
    },
    {
      id: "generate_music",
      description:
        "Compose the soundtrack from the music direction in the creative brief. Route to the best cost-adjusted capable music-generation specialist; elevenlabs-music is one candidate, not a requirement. " +
        "Match the track length to the brief's target duration and keep it instrumental unless the brief explicitly asks for vocals, so it sits under narration. " +
        "Never reference a real artist, band, or existing recording — providers reject those prompts and the resulting track would not be clearably licensed. " +
        "The result must be real audio, not a description of music. Persist it with Arbor media_import_url when the provider returns a public HTTPS URL, otherwise media_request_upload plus media_finalize_upload, and append the artifact_id to the blackboard as an artifact_reference. " +
        "If no capable music specialist is available, say so plainly and return without an artifact rather than emitting a placeholder URL — the editor will then cut picture-only and the review node will record the missing audio.",
      depends_on: ["creative_brief"],
      success_criteria:
        "A playable original audio artifact matching the brief's duration and mood is stored in Convex Storage and referenced on the blackboard, or its absence is reported explicitly.",
      task_class: "generation",
    },
    {
      id: "edit_video",
      description:
        "Resolve the generated video and music artifacts with Arbor media_resolve, then cut them together into a finished " +
        `${spec.orientation} piece with intentional pacing, captions or on-screen text, transitions only where useful, and the composed score mixed under the picture. ` +
        "Route to the best cost-adjusted capable editor; reap-editor and submagic-editor both add captions/zooms/b-roll to an already-short video and are real candidates, opusclip-editor is a candidate only when the source is long-form and needs repurposing rather than polish, descript-editor is a candidate when filler-word removal or Studio Sound cleanup is needed, and clueso-editor is a candidate for screen-recording and product-walkthrough sources. None is a requirement. " +
        "If the music node returned no artifact, cut picture-only and state that the piece has no soundtrack — do not substitute stock audio that was never generated. " +
        "Persist the final output with media_import_url or Arbor's upload/finalize tools and append the new artifact_id to the blackboard. Finalize metadata including duration_ms, width, height, codec, and frame_rate.",
      depends_on: ["generate_video", "generate_music"],
      success_criteria:
        `A polished final ${spec.orientation} video is stored as a new durable artifact with complete media metadata, and its audio state (scored or intentionally silent) is stated.`,
      task_class: "generation",
    },
    {
      id: "media_review",
      description:
        "Review the edited artifact and creative brief. Confirm that the durable final artifact is video/mp4, video/quicktime, or video/webm; uses H.264, H.265, VP8, or VP9; is " +
        `${spec.reviewAspect}; is 23-60 FPS; is ${spec.maxDuration}; carries an audio track when the brief called for music; and contains no obvious broken frames. ` +
        `Return the final artifact_id and concise pass/fail evidence. ${spec.handoff}`,
      depends_on: ["creative_brief", "edit_video"],
      success_criteria:
        "The final artifact ID is identified and its format, duration, and audio state are explicitly verified or actionable defects are reported.",
      task_class: "reasoning",
    },
  ];
}

export function planShortFormVideoPipeline(prompt: string): PlannedNode[] {
  return planMediaPipeline(prompt, "vertical");
}

export function planLongFormVideoPipeline(prompt: string): PlannedNode[] {
  return planMediaPipeline(prompt, "widescreen");
}
