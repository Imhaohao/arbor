import type { PlannedNode } from "./dag";

const SHORT_FORM_PLATFORM_RE =
  /\b(tik\s*tok|tiktok|instagram reels?|youtube shorts?|short[- ]form|vertical video)\b/i;
const VIDEO_INTENT_RE =
  /\b(video|clip|reel|short)\b.*\b(create|make|generate|produce|edit)|\b(create|make|generate|produce|edit)\b.*\b(video|clip|reel|short)\b/i;

export function isShortFormVideoPipeline(
  prompt: string,
  taskType?: string,
): boolean {
  const input = `${taskType ?? ""} ${prompt}`;
  return SHORT_FORM_PLATFORM_RE.test(input) && VIDEO_INTENT_RE.test(input);
}

export function planShortFormVideoPipeline(prompt: string): PlannedNode[] {
  const goal = prompt.trim();
  if (!goal) throw new Error("short-form video goal is required");
  return [
    {
      id: "creative_brief",
      description:
        `Turn this user idea into a concise production brief for a vertical short-form video: ${goal}\n` +
        "Specify the hook, beat-by-beat shot plan, on-screen text, voice or dialogue, target duration, and audio direction. Preserve the user's intent and flag any missing choice without inventing brand claims.",
      depends_on: [],
      success_criteria:
        "A generator-ready 9:16 brief with a clear hook, shots, timing, text, and audio direction.",
      task_class: "generation",
    },
    {
      id: "generate_video",
      description:
        "Generate the source video from the approved creative brief. Route to the best cost-adjusted capable video-generation specialist; Higgsfield is one candidate, not a requirement. The result must be real media, not a prompt or description. If the provider returns a public HTTPS output URL, persist it with Arbor media_import_url; otherwise upload raw bytes with media_request_upload and media_finalize_upload. Append the returned artifact_id to the DAG blackboard as an artifact_reference.",
      depends_on: ["creative_brief"],
      success_criteria:
        "A playable vertical source-video artifact is stored in Convex Storage and referenced on the blackboard.",
      task_class: "generation",
    },
    {
      id: "edit_video",
      description:
        "Resolve the generated artifact with Arbor media_resolve, then edit it into a TikTok-ready cut with intentional pacing, captions or on-screen text, transitions only where useful, and sound design or effects. Route to the best cost-adjusted capable editor; Clueso is one candidate, not a requirement. Persist the final output with media_import_url or Arbor's upload/finalize tools and append the new artifact_id to the blackboard. Finalize metadata including duration_ms, width, height, codec, and frame_rate.",
      depends_on: ["generate_video"],
      success_criteria:
        "A polished final vertical video with sound is stored as a new durable artifact with complete TikTok media metadata.",
      task_class: "generation",
    },
    {
      id: "media_review",
      description:
        "Review the edited artifact and creative brief. Confirm that the durable final artifact is video/mp4, video/quicktime, or video/webm; uses H.264, H.265, VP8, or VP9; is 9:16 or intentionally vertical; is 23-60 FPS; is at most 10 minutes; and contains no obvious broken frames or missing audio. Return the final artifact_id and concise pass/fail evidence. Do not upload to TikTok: Arbor's Upload API button owns the user-authorized handoff.",
      depends_on: ["creative_brief", "edit_video"],
      success_criteria:
        "The final artifact ID is identified and its TikTok compatibility is explicitly verified or actionable defects are reported.",
      task_class: "reasoning",
    },
  ];
}
