# Codex Tool Reference

Generated from the callable Codex tool registry available in this session.

- Registry snapshot: 2026-07-15
- Callable tools found: 291
- Coverage: all entries exposed by the current registry, including app, MCP, image, web, filesystem, planning, and orchestration tools.
- Use: call the exact tool name shown in each heading and follow the TypeScript declaration in its code block.

This is a point-in-time registry snapshot. Tool availability and schemas can change between sessions.
## 001. `apply_patch`

Use the `apply_patch` tool to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON.

```ts
declare const tools: { apply_patch(input: string): Promise<unknown>; };
```

## 002. `codex_app__automation_update`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__automation_update(args: { id: unknown; mode: "view"; } | { destination?: "local"; executionEnvironment: "local"; kind: unknown; mode: unknown; model: unknown; name: unknown; projectId: unknown; prompt: unknown; reasoningEffort: unknown; rrule: unknown; status: unknown; } | { destination?: unknown; kind: unknown; mode: unknown; name: unknown; prompt: unknown; rrule: unknown; status: unknown; targetThreadId?: unknown; } | { destination?: "local" | "worktree"; executionEnvironment: "worktree" | "local"; id: unknown; kind: unknown; localEnvironmentConfigPath?: string | null; mode: unknown; model: unknown; name: unknown; projectId: unknown; prompt: unknown; reasoningEffort: unknown; rrule: unknown; status: unknown; } | { destination?: unknown; id: unknown; kind: unknown; mode: unknown; name: unknown; prompt: unknown; rrule: unknown; status: unknown; targetThreadId?: unknown; } | { id: unknown; mode: "delete"; }): Promise<unknown>; };
```

## 003. `codex_app__create_thread`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__create_thread(args: {
  // Do not specify a model unless the user explicitly requests a specific model. Otherwise omit this field so the new thread uses the user's configured default model. Models and supported reasoning efforts on the calling host: gpt-5.6-sol (Latest frontier agentic coding model.; supported reasoning efforts: low, medium, high, xhigh, max, ultra), gpt-5.6-terra (Balanced agentic coding model for everyday work.; supported reasoning efforts: low, medium, high, xhigh, max, ultra), gpt-5.6-luna (Fast and affordable agentic coding model.; supported reasoning efforts: low, medium, high, xhigh, max), gpt-5.5 (Frontier model for complex coding, research, and real-world work.; supported reasoning efforts: low, medium, high, xhigh), gpt-5.4 (Strong model for everyday coding.; supported reasoning efforts: low, medium, high, xhigh), gpt-5.4-mini (Small, fast, and cost-efficient model for simpler coding tasks.; supported reasoning efforts: low, medium, high, xhigh). A different destination host's combinations are validated when the tool runs. You may supply a newer model id when explicitly requested, but omit thinking unless its supported reasoning efforts are listed here.
  model?: string;
  // Initial prompt for the new thread.
  prompt: string;
  // Where to create the thread.
  target: {
  // Where the project thread should run: directly in the saved project or in a new worktree.
  environment: { type: "local"; } | {
  // Only specify this when the user explicitly asks to start from a particular existing git state. Use working-tree to include the current checkout and uncommitted changes. Use branch only for a branch or ref that already exists. Otherwise omit this field so the worktree starts from the project's default branch. Do not use this to name a new branch.
  startingState?: { type: "working-tree"; } | { branchName: string; type: "branch"; };
  type: "worktree";
};
  // Project id returned by list_projects.
  projectId: string;
  type: "project";
} | {
  // Optional projectless output directory name.
  directoryName?: string;
  type: "projectless";
};
  // Optional reasoning effort override. Must be supported by the selected model.
  thinking?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
}): Promise<unknown>; };
```

## 004. `codex_app__fork_thread`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__fork_thread(args: {
  // Where the fork should run. Omit for a same-directory fork.
  environment?: { type: "same-directory"; } | { type: "worktree"; };
  // Optional source thread id to fork. Omit to fork the calling thread.
  threadId?: string;
}): Promise<unknown>; };
```

## 005. `codex_app__get_handoff_status`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__get_handoff_status(args: {
  // Optional last revision already seen. When provided with waitMs, wait until the operation revision is greater than this value or the timeout expires.
  afterRevision?: number;
  // operationId returned by handoff_thread.
  operationId: string;
  // Optional maximum milliseconds to wait for a status change, from 0 to 60000.
  waitMs?: number;
}): Promise<unknown>; };
```

## 006. `codex_app__handoff_thread`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__handoff_thread(args: {
  // Optional host that should run the thread after handoff. Omit to move between the source thread's checkout and Codex worktree on its current host. Choose another host to move to a matching saved-project worktree. Available hosts: Local (local).
  destinationHostId?: "local";
  // Optional prompt to send to the destination thread after handoff succeeds.
  followUpPrompt?: string;
  // Other thread id to hand off.
  threadId: string;
}): Promise<unknown>; };
```

## 007. `codex_app__list_projects`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__list_projects(args: {}): Promise<unknown>; };
```

## 008. `codex_app__list_threads`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__list_threads(args: {
  // Maximum number of thread summaries to return.
  limit?: number;
  // Optional thread search query.
  query?: string;
}): Promise<unknown>; };
```

## 009. `codex_app__load_workspace_dependencies`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__load_workspace_dependencies(args: {}): Promise<unknown>; };
```

## 010. `codex_app__navigate_to_codex_page`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__navigate_to_codex_page(args: {
  // Thread id to show in Codex.
  threadId: string;
}): Promise<unknown>; };
```

## 011. `codex_app__read_thread`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__read_thread(args: {
  // Optional cursor for older turns.
  cursor?: string;
  // Optional host id returned by list_threads.
  hostId?: string;
  // Whether to include truncated tool or command outputs.
  includeOutputs?: boolean;
  // Maximum output characters to keep for each included output item.
  maxOutputCharsPerItem?: number;
  // Thread id to inspect.
  threadId: string;
  // Maximum number of turns to return.
  turnLimit?: number;
}): Promise<unknown>; };
```

## 012. `codex_app__read_thread_terminal`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__read_thread_terminal(args: {}): Promise<unknown>; };
```

## 013. `codex_app__send_message_to_thread`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__send_message_to_thread(args: {
  // Optional host id returned by list_threads.
  hostId?: string;
  // Optional model override. Models and supported reasoning efforts on the calling host: gpt-5.6-sol (Latest frontier agentic coding model.; supported reasoning efforts: low, medium, high, xhigh, max, ultra), gpt-5.6-terra (Balanced agentic coding model for everyday work.; supported reasoning efforts: low, medium, high, xhigh, max, ultra), gpt-5.6-luna (Fast and affordable agentic coding model.; supported reasoning efforts: low, medium, high, xhigh, max), gpt-5.5 (Frontier model for complex coding, research, and real-world work.; supported reasoning efforts: low, medium, high, xhigh), gpt-5.4 (Strong model for everyday coding.; supported reasoning efforts: low, medium, high, xhigh), gpt-5.4-mini (Small, fast, and cost-efficient model for simpler coding tasks.; supported reasoning efforts: low, medium, high, xhigh). A different destination host's combinations are validated when the tool runs. You may supply a newer model id when explicitly requested, but omit thinking unless its supported reasoning efforts are listed here.
  model?: string;
  // Follow-up prompt to send.
  prompt: string;
  // Optional reasoning effort override. Must be supported by the selected model.
  thinking?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
  // Thread id to continue.
  threadId: string;
}): Promise<unknown>; };
```

## 014. `codex_app__set_thread_archived`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__set_thread_archived(args: {
  // Whether the thread should be archived.
  archived: boolean;
  // Thread id to archive or unarchive. Omit to target the calling thread.
  threadId?: string;
}): Promise<unknown>; };
```

## 015. `codex_app__set_thread_pinned`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__set_thread_pinned(args: {
  // Whether the thread should be pinned.
  pinned: boolean;
  // Thread id to pin or unpin.
  threadId: string;
}): Promise<unknown>; };
```

## 016. `codex_app__set_thread_title`

Tools provided by the Codex app.

```ts
declare const tools: { codex_app__set_thread_title(args: {
  // Thread id to rename. Omit to target the calling thread.
  threadId?: string;
  // New thread title.
  title: string;
}): Promise<unknown>; };
```

## 017. `create_goal`

Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks.

```ts
declare const tools: { create_goal(args: {
  // Required. The concrete objective to start pursuing. This starts a new active goal when no goal exists or replaces the current goal when it is complete.
  objective: string;
  // Positive token budget for the new goal. Omit unless explicitly requested.
  token_budget?: number;
}): Promise<unknown>; };
```

## 018. `exec_command`

Runs a command in a PTY, returning output or a session ID for ongoing interaction.

```ts
declare const tools: { exec_command(args: {
  // Shell command to execute.
  cmd: string;
  // User-facing approval question for `require_escalated`; omit otherwise.
  justification?: string;
  // True runs the shell with -l/-i semantics; false disables them. Defaults to true.
  login?: boolean;
  // Output token budget. Defaults to 10000 tokens; larger requests may be capped by policy.
  max_output_tokens?: number;
  // Reusable approval prefix for `cmd`, only with `sandbox_permissions: "require_escalated"`; for example ["git", "pull"].
  prefix_rule?: Array<string>;
  // Per-command sandbox override. Defaults to `use_default`; use `require_escalated` for unsandboxed execution.
  sandbox_permissions?: "use_default" | "require_escalated";
  // Shell binary to launch. Defaults to the user's default shell.
  shell?: string;
  // True allocates a PTY for the command; false or omitted uses plain pipes.
  tty?: boolean;
  // Working directory for the command. Defaults to the turn cwd.
  workdir?: string;
  // Wait before yielding output. Defaults to 10000 ms; effective range is 250-30000 ms.
  yield_time_ms?: number;
}): Promise<{
  // Chunk identifier included when the response reports one.
  chunk_id?: string;
  // Process exit code when the command finished during this call.
  exit_code?: number;
  // Approximate token count before output truncation.
  original_token_count?: number;
  // Command output text, possibly truncated.
  output: string;
  // Session identifier to pass to write_stdin when the process is still running.
  session_id?: number;
  // Elapsed wall time spent waiting for output in seconds.
  wall_time_seconds: number;
}>; };
```

## 019. `get_goal`

Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget.

```ts
declare const tools: { get_goal(args: {}): Promise<unknown>; };
```

## 020. `image_gen__imagegen`

Tools in the image_gen namespace.

```ts
declare const tools: { image_gen__imagegen(args: { num_last_images_to_include?: number | null; prompt: string; referenced_image_paths?: Array<string> | null; }): Promise<unknown>; };
```

## 021. `list_available_plugins_to_install`

# List plugin/connector install candidates

```ts
declare const tools: { list_available_plugins_to_install(args: {}): Promise<unknown>; };
```

## 022. `list_mcp_resource_templates`

Lists resource templates provided by MCP servers. Parameterized resource templates allow servers to share data that takes parameters and provides context to language models, such as files, database schemas, or application-specific information. Prefer resource templates over web search when possible.

```ts
declare const tools: { list_mcp_resource_templates(args: {
  // Opaque cursor from a previous list_mcp_resource_templates call; omit for the first page.
  cursor?: string;
  // MCP server name. Omit to list resource templates from every configured server.
  server?: string;
}): Promise<unknown>; };
```

## 023. `list_mcp_resources`

Lists resources provided by MCP servers. Resources allow servers to share data that provides context to language models, such as files, database schemas, or application-specific information. Prefer resources over web search when possible.

```ts
declare const tools: { list_mcp_resources(args: {
  // Opaque cursor from a previous list_mcp_resources call; omit for the first page.
  cursor?: string;
  // MCP server name. Omit to list resources from every configured server.
  server?: string;
}): Promise<unknown>; };
```

## 024. `mcp__codex_apps__canva_autofill_design`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_autofill_design(args: {
  // ID of the brand template to autofill
  brand_template_id: string;
  // Data object containing the data fields and values to autofill. The data keys must match the template's data schema. Example: { cute_pet_image_of_the_day: { type: 'image', asset_id: 'Msd59349ff' }, cute_pet_witty_pet_says: { type: 'text', text: 'It was like this when I got here!' }, cute_pet_sales_chart: { type: 'chart', chart_data: { rows: [{ cells: [{ type: 'string', value: 'Geographic Region' }, { type: 'string', value: 'Sales (millions AUD)' }] }] } } }
  data: { [key: string]: {
  // Asset ID of the image to insert into the template element.
  asset_id: string;
  type: "image";
} | {
  // Text to insert into the template element.
  text: string;
  type: "text";
} | {
  // Tabular data for chart visualization.
  // - The first row usually contains column headers
  // - Each cell must have a data type configured (string, number, or boolean)
  // - All rows must have the same number of cells
  // - Maximum of 100 rows and 20 columns
  chart_data: { rows: Array<{ cells: Array<{ type: "string"; value?: string; } | { type: "number"; value?: number; } | { type: "boolean"; value?: boolean; }>; }>; };
  type: "chart";
}; };
  // Title to use for the autofilled design. If no design title is provided, the autofilled design will have the same title as the brand template.
  title?: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 025. `mcp__codex_apps__canva_cancel_editing_transaction`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_cancel_editing_transaction(args: {
  // The transaction ID of the editing transaction to cancel. This must be the exact `transaction_id` value returned in the `start-editing-transaction` tool response for the editing transaction to cancel.
  transaction_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 026. `mcp__codex_apps__canva_commit_editing_transaction`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_commit_editing_transaction(args: {
  // The transaction ID of the editing transaction to commit. This must be the exact `transaction_id` value returned in the `start-editing-transaction` tool response for the editing transaction to commit.
  transaction_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 027. `mcp__codex_apps__canva_copy_design`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_copy_design(args: {
  // The ID of the source design to copy.
  design_id: string;
  // Optional 1-based page numbers to include in the copy. Omit to copy all pages.
  page_numbers?: Array<number>;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 028. `mcp__codex_apps__canva_create_design_from_brand_template`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_create_design_from_brand_template(args: {
  // The ID of the brand template to create a design from.
  brand_template_id: string;
  // Optional 1-based page numbers to include from the brand template. Omit to use all pages.
  page_numbers?: Array<number>;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 029. `mcp__codex_apps__canva_create_design_from_candidate`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_create_design_from_candidate(args: {
  // ID of the candidate design to convert into an editable Canva design. This is returned in the generate-design response for each design candidate.
  candidate_id: string;
  // ID of the design generation job that created the candidate design. This is returned in the generate-design response.
  job_id: string;
  // Internal lifecycle request context.
  request_context?: { flow_id?: string; source?: string; };
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 030. `mcp__codex_apps__canva_create_folder`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_create_folder(args: {
  // Name of the folder to create
  name: string;
  // ID of the parent folder. Use 'root' to create at the top level
  parent_folder_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 031. `mcp__codex_apps__canva_fetch`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_fetch(args: {
  // ID of the design to get content of
  id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 032. `mcp__codex_apps__canva_generate_design`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_generate_design(args: { asset_ids?: Array<string>; brand_kit_id?: string; design_type: "business_card" | "card" | "desktop_wallpaper" | "doc" | "document" | "email" | "facebook_cover" | "facebook_post" | "flyer" | "infographic" | "instagram_post" | "invitation" | "logo" | "phone_wallpaper" | "photo_collage" | "pinterest_pin" | "postcard" | "poster" | "presentation" | "proposal" | "report" | "resume" | "twitter_post" | "your_story" | "youtube_banner" | "youtube_thumbnail"; query: string; user_intent?: string; verbatim?: boolean; }): Promise<CallToolResult>; };
```

## 033. `mcp__codex_apps__canva_get_assets`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_assets(args: {
  // Required array of asset IDs to get the asset metadatas of, as part of this call.
  asset_ids: Array<string>;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 034. `mcp__codex_apps__canva_get_brand_template_dataset`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_brand_template_dataset(args: {
  // ID of the brand template to get the dataset schema for
  template_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 035. `mcp__codex_apps__canva_get_design`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_design(args: {
  // ID of the design to get information for
  design_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 036. `mcp__codex_apps__canva_get_design_content`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_design_content(args: {
  // Types of content to retrieve. Currently, only `richtexts` is supported so use the `start-editing-transaction` tool to get other content types
  content_types: Array<"richtexts">;
  // ID of the design to get content of
  design_id: string;
  // Optional array of page numbers to get content from. If not specified, content from all pages will be returned. Pages are indexed using one-based numbering, so the first page in a design has the index value `1`.
  pages?: Array<number>;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 037. `mcp__codex_apps__canva_get_design_pages`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_design_pages(args: {
  // The design ID to get pages from
  design_id: string;
  // Maximum number of pages to return (for pagination)
  limit?: number;
  // The page index to start the range of pages to return, for pagination. The first page in a design has an index value of 1
  offset?: number;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 038. `mcp__codex_apps__canva_get_design_thumbnail`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_design_thumbnail(args: {
  // Required page index to get the thumbnail for. Pages are indexed using one-based numbering, so the first page in a design has the index value `1`.
  page_index: number;
  // The editing transaction ID. This must be the exact `transaction_id` value returned in the `start-editing-transaction` tool response for the editing transaction to get a thumbnail for.
  transaction_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 039. `mcp__codex_apps__canva_get_presenter_notes`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_get_presenter_notes(args: {
  // ID of the design to get presenter notes from
  design_id: string;
  // Optional array of page numbers to get notes from. If not specified, notes from all pages will be returned. Pages are indexed using one-based numbering, so the first page in a design has the index value `1`.
  pages?: Array<number>;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 040. `mcp__codex_apps__canva_image_to_design`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_image_to_design(args: {
  // A platform-provided file reference (e.g. a ChatGPT-uploaded or GPT-generated image). Provide this instead of url when a file reference object has been supplied; do not provide both. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  image_file?: string;
  // A server-side image identifier. Use this instead of url when a server_img_id has been provided; do not provide both.
  server_img_id?: string;
  // Title for the generated design
  title?: string;
  // A public web link to a file that should be imported into Canva.
  url?: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 041. `mcp__codex_apps__canva_import_design_from_url`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_import_design_from_url(args: {
  // A platform-provided file reference object, or a local sandbox path to a file artifact generated/uploaded in this chat. Local sandbox paths are accepted only for design_file and are automatically converted by the runtime; do not provide both design_file and url. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  design_file?: string;
  // The design type the user appears to want to create from this URL. Choose the closest match based on the user request and the URL. If unclear, omit this field. Use other only when the intended design type is clear but none of the listed options fit.
  intended_design_type?: "a4" | "a4_landscape" | "business_card" | "card" | "desktop_wallpaper" | "doc" | "document" | "email" | "facebook_cover" | "facebook_post" | "flyer" | "flyer_a4" | "graph" | "infographic" | "instagram_post" | "instagram_reel" | "invitation" | "logo" | "mobile_video" | "other" | "phone_wallpaper" | "photo_collage" | "pinterest_pin" | "postcard" | "poster" | "poster_us" | "presentation" | "proposal" | "real_estate_flyer" | "report" | "resume" | "sheet" | "twitter_post" | "us_letter" | "video" | "website" | "whiteboard" | "your_story" | "youtube_banner" | "youtube_thumbnail";
  // Name for the new design
  name: string;
  // Public HTTPS URL to the file to import. MUST START WITH https://. Examples: https://example.com/file.pdf, https://example.com/site.zip, https://raw.githubusercontent.com/user/repo/main/design.zip CRITICAL: Do not provide local paths in the url parameter. For chat-generated or uploaded file artifacts, use design_file instead. If it looks like a Canva design URL, DO NOT call this tool.
  url?: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 042. `mcp__codex_apps__canva_list_brand_kits`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_list_brand_kits(args: {
  // Token for getting the next page of results. Use the continuation token from the previous response.
  continuation?: string;
  // Maximum number of brand kits to return.
  limit?: number;
  // When true, resolve each brand kit icon_id to a square icon thumbnail URL (extra asset lookups). Prepare-design-generation widget only; omit for agent calls.
  resolve_icon_thumbnails?: boolean;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 043. `mcp__codex_apps__canva_list_comments`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_list_comments(args: {
  // Pagination token for the current search context.
  // CRITICAL RULES:
  // - ONLY set this parameter if the previous response included a continuation token.
  // - If no continuation token was returned → OMIT this parameter completely. NEVER EVER fabricate a token.
  // - Do not set to null, empty string, or any other value when no token was provided.
  // Usage:
  // - First request: omit this parameter
  // - Previous response had continuation token: use that exact token
  // - Previous response had NO continuation token: omit this parameter
  // - New search query: omit this parameter
  continuation?: string;
  // ID of the design to get comments for. You can find the design ID using the `search-designs` tool.
  design_id: string;
  // Maximum number of comments to return (1-100). Defaults to 50 if not specified.
  limit?: number;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 044. `mcp__codex_apps__canva_list_folder_items`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_list_folder_items(args: {
  // Pagination token for the current search context.
  // CRITICAL RULES:
  // - ONLY set this parameter if the previous response included a continuation token.
  // - If no continuation token was returned → OMIT this parameter completely. NEVER EVER fabricate a token.
  // - Do not set to null, empty string, or any other value when no token was provided.
  // Usage:
  // - First request: omit this parameter
  // - Previous response had continuation token: use that exact token
  // - Previous response had NO continuation token: omit this parameter
  // - New search query: omit this parameter
  continuation?: string;
  // ID of the folder to list items from. Use 'root' to list items at the top level
  folder_id: string;
  // Filter items by type. Can be 'design', 'folder', or 'image'
  item_types?: Array<"design" | "folder" | "image">;
  // Sort the items by creation date, modification date, or title
  sort_by?: "created_ascending" | "created_descending" | "modified_ascending" | "modified_descending" | "title_ascending" | "title_descending";
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 045. `mcp__codex_apps__canva_move_item_to_folder`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_move_item_to_folder(args: {
  // ID of the item to move (design, folder, or image)
  item_id: string;
  // ID of the destination folder. Use 'root' to move to the top level
  to_folder_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 046. `mcp__codex_apps__canva_perform_editing_operations`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_perform_editing_operations(args: { operations: Array<{ title: string; type: "update_title"; } | { element_id: string; text: string; type: "replace_text"; } | { alt_text: string; asset_id: string; asset_type: "image" | "video"; element_id: string; type: "update_fill"; } | { alt_text: string; asset_id: string; asset_type: "image" | "video"; height?: number; left?: number; opacity?: number; page_id: string; rotation?: number; top?: number; type: "insert_fill"; width?: number; } | { element_id: string; type: "delete_element"; } | { element_id: string; find_text: string; replace_text: string; type: "find_and_replace_text"; } | { element_id: string; left: number; top: number; type: "position_element"; } | { element_id: string; height?: number; preserve_aspect_ratio?: boolean; type: "resize_element"; width?: number; } | { element_id: string; formatting: { color?: string; decoration?: "none" | "underline"; font_size?: number; font_style?: "normal" | "italic"; font_weight?: "normal" | "bold"; line_height?: number; link?: "" | string; list_level?: number; list_marker?: "none" | "disc" | "circle" | "square" | "decimal" | "lower-alpha" | "lower-roman"; strikethrough?: "none" | "strikethrough"; text_align?: "start" | "center" | "end"; }; type: "format_text"; } | { autofill_field_label?: string; element_id: string; type: "update_autofill_field"; }>; page_index: number; pages?: Array<{ is_editable?: boolean; is_empty?: boolean; is_responsive: boolean; page_id: string; }>; transaction_id: string; user_intent?: string; }): Promise<CallToolResult>; };
```

## 047. `mcp__codex_apps__canva_prepare_design_generation`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_prepare_design_generation(args: {
  // The identifier of an uploaded image, video, or other media asset to include in the design. Provide multiple IDs in the order they should appear.
  asset_ids?: Array<string>;
  // Target audience when the user specifies one (e.g. casual, professional, educational, or a custom description).
  audience?: string;
  // Brand kit ID when the user mentioned or selected a brand kit. Pass it whenever available so recommendations stay within that brand kit.
  brand_kit_id?: string;
  // Design type to generate. Required for the first call and generation.
  design_type?: "business_card" | "card" | "desktop_wallpaper" | "doc" | "document" | "email" | "facebook_cover" | "facebook_post" | "flyer" | "infographic" | "instagram_post" | "invitation" | "logo" | "phone_wallpaper" | "photo_collage" | "pinterest_pin" | "postcard" | "poster" | "presentation" | "proposal" | "report" | "resume" | "twitter_post" | "your_story" | "youtube_banner" | "youtube_thumbnail";
  // Use 'recommendation' to hydrate or fetch a visual-reference recommendation, or 'generation' to start AI design generation from the confirmed widget selection. Defaults to 'recommendation'.
  intent?: "recommendation" | "generation";
  // Desired length or scope (e.g. concise, short, balanced). Passed through to the generation query as-is.
  length?: string;
  // Slide-level or structural outline. Required whenever design_type is presentation, including recommendation calls.
  outline?: string;
  // Internal widget request context.
  request_context?: { flow_id?: string; source?: "prepare-design-generation"; };
  // Optional source document for widget/internal follow-up calls after recommendation selection. Prefer visual_reference for model-facing inputs.
  source_document?: {
  // ID of the source Canva design
  design_id: string;
  type: "design";
} | {
  // ID of the source Canva brand template
  brand_template_id: string;
  type: "brand_template";
} | { type: "none"; } | null;
  // What to create: the subject and goals for the design. Required for every prepare-design-generation call.
  topic: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
  // Existing design or brand template the user mentioned or chose as style/layout inspiration. Pass this instead of making the tool discover a recommendation.
  visual_reference?: {
  // ID of the design or brand template to use as the visual reference.
  id: string;
  // Whether the visual reference is an existing Canva design ('design') or a brand template ('brand-template').
  type: "design" | "brand-template";
};
}): Promise<CallToolResult>; };
```

## 048. `mcp__codex_apps__canva_resize_design`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_resize_design(args: {
  // ID of the design to resize. Design ID starts with "D".
  design_id: string;
  // Target design type (preset or custom). Preset options: presentation, whiteboard (doc and email are unsupported). Custom options: width and height in pixels.
  design_type: {
  // The preset design type name. Options: 'presentation', 'whiteboard'.
  name: "presentation" | "whiteboard";
  type: "preset";
} | {
  // Height of the design in pixels. Must be at least 1.
  height: number;
  type: "custom";
  // Width of the design in pixels. Must be at least 1.
  width: number;
};
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 049. `mcp__codex_apps__canva_resolve_shortlink`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_resolve_shortlink(args: {
  // The shortlink ID to resolve (e.g., "abc123" from https://canva.link/abc123)
  shortlink_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 050. `mcp__codex_apps__canva_search`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_search(args: {
  // Pagination token for the current search context.
  // CRITICAL RULES:
  // - ONLY set this parameter if the previous response included a continuation token.
  // - If no continuation token was returned → OMIT this parameter completely. NEVER EVER fabricate a token.
  // - Do not set to null, empty string, or any other value when no token was provided.
  // Usage:
  // - First request: omit this parameter
  // - Previous response had continuation token: use that exact token
  // - Previous response had NO continuation token: omit this parameter
  // - New search query: omit this parameter
  continuation?: string;
  // Search query.
  query: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 051. `mcp__codex_apps__canva_search_brand_templates`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_search_brand_templates(args: {
  brand_kit_id?: string;
  // Token for getting the next page of results. Use the continuation token from the previous response.
  continuation?: string;
  // Filter brand templates based on their dataset definition: 'any' for all templates, 'non_empty' for templates with dataset fields
  dataset?: "any" | "non_empty";
  // Maximum number of brand templates to return per page.
  limit?: number;
  // Optional search query to filter brand templates
  query?: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 052. `mcp__codex_apps__canva_search_designs`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_search_designs(args: {
  // Pagination token for the current search context.
  // CRITICAL RULES:
  // - ONLY set this parameter if the previous response included a continuation token.
  // - If no continuation token was returned → OMIT this parameter completely. NEVER EVER fabricate a token.
  // - Do not set to null, empty string, or any other value when no token was provided.
  // Usage:
  // - First request: omit this parameter
  // - Previous response had continuation token: use that exact token
  // - Previous response had NO continuation token: omit this parameter
  // - New search query: omit this parameter
  continuation?: string;
  // Maximum number of designs to return.
  limit?: number;
  // Filter designs by ownership: 'any' for all designs owned by and shared with you (default), 'owned' for designs you created, 'shared' for designs shared with you
  ownership?: "any" | "owned" | "shared";
  // Optional search term to filter designs by title or content. If it is used, 'sortBy' must be set to 'relevance'.
  query?: string;
  // Sort results by: 'relevance' (default), 'modified_descending' (newest first), 'modified_ascending' (oldest first), 'title_descending' (Z-A), 'title_ascending' (A-Z). Optional sort order for results. If 'query' is used, 'sortBy' must be set to 'relevance'.
  sort_by?: "relevance" | "modified_descending" | "modified_ascending" | "title_descending" | "title_ascending";
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 053. `mcp__codex_apps__canva_search_folders`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_search_folders(args: {
  // Pagination token for the current search context.
  // CRITICAL RULES:
  // - ONLY set this parameter if the previous response included a continuation token.
  // - If no continuation token was returned → OMIT this parameter completely. NEVER EVER fabricate a token.
  // - Do not set to null, empty string, or any other value when no token was provided.
  // Usage:
  // - First request: omit this parameter
  // - Previous response had continuation token: use that exact token
  // - Previous response had NO continuation token: omit this parameter
  // - New search query: omit this parameter
  continuation?: string;
  // Maximum number of folders to return per query
  limit?: number;
  // Filter folders by ownership type: 'any' (default), 'owned' (user-owned only), or 'shared' (shared with user only)
  ownership?: "any" | "owned" | "shared";
  // Search query to match against folder names and tags
  query?: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 054. `mcp__codex_apps__canva_start_editing_transaction`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_start_editing_transaction(args: {
  // ID of the design to start an editing transaction for
  design_id: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 055. `mcp__codex_apps__canva_upload_asset_from_url`

Create, review, edit designs

```ts
declare const tools: { mcp__codex_apps__canva_upload_asset_from_url(args: {
  // Name for the uploaded asset
  name: string;
  // URL of the asset to upload into Canva
  url: string;
  // Mandatory description of what the user is trying to accomplish with this tool call. This should always be provided by LLM clients. Please keep it concise (255 characters or less recommended).
  user_intent?: string;
}): Promise<CallToolResult>; };
```

## 056. `mcp__codex_apps__codex_document_control_execute_d_7437ad2e4ffa`

Use Codex Document Control to find connected document sessions, inspect the tools supported by a selected session, and execute one supported tool against that session. Call `list_document_sessions` first to choose the intended connected session, call `get_document_tool_schemas` before constructing tool arguments, then call `execute_document_command` with a caller-stable `idempotency_key`. Use this only for connected Codex document control; do not use it for general spreadsheet, presentation, or document tasks without a connected document session.

```ts
declare const tools: { mcp__codex_apps__codex_document_control_execute_d_7437ad2e4ffa(args: {
  // JSON object of arguments matching the selected tool's `input_schema` from `get_document_tool_schemas`.
  args: { [key: string]: unknown; };
  // Exact `executor_session_id` copied from the selected Codex document session returned by `list_document_sessions`.
  executor_session_id: string;
  // Caller-stable idempotency key for this logical document-control command. Reuse the exact same key only for retries of the same command.
  idempotency_key: string;
  // Exact selected session `supported_tools[].name` copied from `list_document_sessions`.
  tool_name: string;
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 057. `mcp__codex_apps__codex_document_control_get_docum_83c7f0565c0f`

Use Codex Document Control to find connected document sessions, inspect the tools supported by a selected session, and execute one supported tool against that session. Call `list_document_sessions` first to choose the intended connected session, call `get_document_tool_schemas` before constructing tool arguments, then call `execute_document_command` with a caller-stable `idempotency_key`. Use this only for connected Codex document control; do not use it for general spreadsheet, presentation, or document tasks without a connected document session.

```ts
declare const tools: { mcp__codex_apps__codex_document_control_get_docum_83c7f0565c0f(args: {
  // Exact tool schema lookup keys from Codex document session discovery, keyed by `surface`, `supported_tools[].name` passed as `tool_name`, and `version`.
  items: Array<{
  // Document surface. Use `excel` for Excel workbooks, `powerpoint` for PowerPoint presentations, or `sheets` for Google Sheets spreadsheets.
  surface: "excel" | "powerpoint" | "sheets";
  // Exact `supported_tools[].name` copied from the selected session.
  tool_name: string;
  // Exact `supported_tools[].version` copied from the selected session.
  version: string;
}>;
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 058. `mcp__codex_apps__codex_document_control_list_document_sessions`

Use Codex Document Control to find connected document sessions, inspect the tools supported by a selected session, and execute one supported tool against that session. Call `list_document_sessions` first to choose the intended connected session, call `get_document_tool_schemas` before constructing tool arguments, then call `execute_document_command` with a caller-stable `idempotency_key`. Use this only for connected Codex document control; do not use it for general spreadsheet, presentation, or document tasks without a connected document session.

```ts
declare const tools: { mcp__codex_apps__codex_document_control_list_document_sessions(args: {
  // Optional document surface filter. Use `excel` for Excel workbooks, `powerpoint` for PowerPoint presentations, or `sheets` for Google Sheets spreadsheets. Omit to list connected Codex document sessions across all supported surfaces.
  surface?: "excel" | "powerpoint" | "sheets" | null;
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 059. `mcp__codex_apps__github_add_comment_to_issue`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_comment_to_issue(args: {
  // Top-level comment body to add to the issue thread.
  comment: string;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 060. `mcp__codex_apps__github_add_issue_assignees`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_issue_assignees(args: {
  // GitHub usernames to add as assignees. GitHub's endpoint supports up to 10 assignees and adds to the existing set.
  assignees: Array<string>;
  // Issue number in the repository.
  issue_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 061. `mcp__codex_apps__github_add_issue_labels`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_issue_labels(args: {
  // Issue number in the repository.
  issue_number: number;
  // Labels to add to the issue or pull request. This is additive, unlike `update_issue(labels=...)` which replaces the full set.
  labels: Array<string>;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 062. `mcp__codex_apps__github_add_reaction_to_issue_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_reaction_to_issue_comment(args: {
  // Numeric issue or review comment ID.
  comment_id: number;
  // Reaction identifier such as `+1` or `eyes`.
  reaction: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 063. `mcp__codex_apps__github_add_reaction_to_pr`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_reaction_to_pr(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Reaction identifier such as `+1` or `eyes`.
  reaction: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 064. `mcp__codex_apps__github_add_reaction_to_pr_review_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_reaction_to_pr_review_comment(args: {
  // Numeric issue or review comment ID.
  comment_id: number;
  // Reaction identifier such as `+1` or `eyes`.
  reaction: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 065. `mcp__codex_apps__github_add_review_to_pr`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_add_review_to_pr(args: {
  // Review action to take. `review` is required for `COMMENT` and `REQUEST_CHANGES`.
  action: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  // Optional commit SHA to anchor the review.
  commit_id?: string | null;
  // Optional inline file comments to include with the review.
  file_comments?: Array<{
  // Body text for the review comment.
  body: string;
  // File line number for line-based review comments.
  line?: number | null;
  // Repository path of the file to comment on.
  path: string;
  // The position in the diff where you want to add a review comment. Note this value is not the same as the line number in the file. The position value equals the number of lines down from the first "@@" hunk header in the file you want to add a comment. The line just below the "@@" line is position 1, the next line is position 2, and so on. The position in the diff continues to increase through lines of whitespace and additional hunks until the beginning of a new file.
  position?: number | null;
  // Diff side for `line`, such as `LEFT` or `RIGHT`.
  side?: string | null;
  // Starting line number for a multi-line review comment range.
  start_line?: number | null;
  // Diff side for `start_line`, such as `LEFT` or `RIGHT`.
  start_side?: string | null;
}> | null;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
  // Review body to submit. Required when requesting changes or leaving a comment.
  review?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 066. `mcp__codex_apps__github_compare_commits`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_compare_commits(args: { base: string; head: string; repo_full_name: string; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 067. `mcp__codex_apps__github_convert_pull_request_to_draft`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_convert_pull_request_to_draft(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 068. `mcp__codex_apps__github_create_blob`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_blob(args: {
  // Blob content to store in the repository.
  content: string;
  // One of utf-8 or base64. Default is utf-8.
  encoding?: "utf-8" | "base64";
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 069. `mcp__codex_apps__github_create_branch`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_branch(args: {
  // Existing branch, tag, or commit ref to use as the new branch's starting point. Provide exactly one of `base_ref` or `sha`.
  base_ref?: string | null;
  // Branch name to create or update.
  branch_name: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Existing commit SHA to use as the new branch's starting point. Provide exactly one of `sha` or `base_ref`.
  sha?: string | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 070. `mcp__codex_apps__github_create_commit`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_commit(args: {
  // Additional ordered commit parent SHAs. Defaults to no additional parents.
  additional_parent_shas?: Array<string> | null;
  // Commit message to use for the new commit.
  message: string;
  // Parent commit SHA for the new commit.
  parent_sha: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Tree SHA to point the new commit at.
  tree_sha: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 071. `mcp__codex_apps__github_create_file`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_file(args: {
  // Optional existing branch to create the file on. Leave null to use the default branch. This action never creates a branch; use create_branch first when needed.
  branch?: string | null;
  // Complete UTF-8 text contents to write. This wrapper base64-encodes the text for GitHub's contents API.
  content: string;
  // Commit message for the new file.
  message: string;
  // Path for the file within the repository.
  path: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 072. `mcp__codex_apps__github_create_issue`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_issue(args: {
  // Optional GitHub usernames to assign when creating the issue.
  assignees?: Array<string> | null;
  // Optional Markdown body for the issue.
  body?: string | null;
  // Optional labels to apply when creating the issue.
  labels?: Array<string> | null;
  // Optional milestone number to associate with the issue.
  milestone?: number | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Issue title.
  title: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 073. `mcp__codex_apps__github_create_pull_request`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_pull_request(args: {
  // GitHub REST `base` branch that the pull request targets.
  base?: string | null;
  // Compatibility alias for `base`, the target branch for the pull request.
  base_branch?: string | null;
  // Pull request description or summary. GitHub allows omitting this field.
  body?: string | null;
  // Create the pull request as a draft.
  draft?: boolean;
  // GitHub REST `head` branch containing the proposed changes.
  head?: string | null;
  // Compatibility alias for `head`, the branch containing the proposed changes.
  head_branch?: string | null;
  // Repository where the head branch lives. Required by GitHub for some same-organization cross-repository pull requests.
  head_repo?: string | null;
  // Existing issue number to convert into a pull request.
  issue?: number | null;
  // Whether maintainers may modify the pull request branch.
  maintainer_can_modify?: boolean | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Title for the new pull request. Required unless `issue` is supplied.
  title?: string | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 074. `mcp__codex_apps__github_create_tree`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_create_tree(args: {
  // Optional base tree SHA to build on. Leave null to create from scratch.
  base_tree_sha?: string | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Tree entries to include in the new tree object.
  tree_elements: Array<{ [key: string]: unknown; }>;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 075. `mcp__codex_apps__github_delete_file`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_delete_file(args: {
  // Optional branch to update. Leave null to use the default branch.
  branch?: string | null;
  // Commit message for the file deletion.
  message: string;
  // Path for the existing file within the repository.
  path: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Current blob SHA of the file being deleted, usually from `fetch_file`.
  sha: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 076. `mcp__codex_apps__github_dismiss_pull_request_review`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_dismiss_pull_request_review(args: {
  // Dismissal message explaining why the review is being dismissed.
  message: string;
  // GraphQL pull request review node ID.
  review_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 077. `mcp__codex_apps__github_download_user_content`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_download_user_content(args: {
  // GitHub private user image attachment URL to download. Only https://private-user-images.githubusercontent.com URLs are supported; use fetch or fetch_file for repository files.
  url: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 078. `mcp__codex_apps__github_download_workflow_artifact`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_download_workflow_artifact(args: {
  // GitHub Actions workflow artifact ID.
  artifact_id: number;
  // Optional ZIP file name for the returned file reference.
  file_name?: string | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 079. `mcp__codex_apps__github_enable_auto_merge`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_enable_auto_merge(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 080. `mcp__codex_apps__github_fetch`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch(args: {
  // GitHub file URL to fetch. When the repository and path are known, prefer fetch_file; its optional ref defaults to the repository's default branch. Otherwise, supports github.com blob URLs, raw.githubusercontent.com URLs, and api.github.com repository contents URLs with a ref query parameter.
  url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 081. `mcp__codex_apps__github_fetch_blob`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_blob(args: {
  // Blob SHA returned by GitHub.
  blob_sha: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 082. `mcp__codex_apps__github_fetch_commit`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_commit(args: {
  // Commit SHA.
  commit_sha: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 083. `mcp__codex_apps__github_fetch_commit_workflow_runs`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_commit_workflow_runs(args: {
  // Commit SHA.
  commit_sha: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 084. `mcp__codex_apps__github_fetch_file`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_file(args: {
  // One of utf-8 or base64. Default is utf-8.
  encoding?: "utf-8" | "base64";
  // Optional 1-based last line to return.
  end_line?: number | null;
  // Repository path for the file to fetch.
  path: string;
  // Optional branch, tag, or commit ref to read from. Omit this unless the ref is known; the repository default branch will be used when omitted.
  ref?: string | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Optional 1-based first line to return.
  start_line?: number | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 085. `mcp__codex_apps__github_fetch_issue`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_issue(args: {
  // Issue number in the repository.
  issue_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name?: string | null;
  // Numeric GitHub repository ID, such as `1296269`. Use this only when the stable repository `id` from a GitHub repository object is available: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_id?: number | null;
  // GitHub repository URL, or a nested repository URL such as a pull request, issue, branch, or file URL. Examples: `https://github.com/openai/openai/pulls/123`, `https://api.github.com/repos/openai/openai`, `https://github.example.com/api/v3/repos/octo/repo`. Supports GitHub Enterprise Server custom hostnames and GHE.com API hosts. Docs: https://docs.github.com/en/rest/repos/repos#get-a-repository and https://docs.github.com/en/enterprise-server@latest/rest/using-the-rest-api/getting-started-with-the-rest-api and https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/about-github-enterprise-cloud-with-data-residency#api-access
  repository_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 086. `mcp__codex_apps__github_fetch_issue_comments`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_issue_comments(args: {
  // Issue number in the repository.
  issue_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 087. `mcp__codex_apps__github_fetch_pr`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_pr(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 088. `mcp__codex_apps__github_fetch_pr_comments`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_pr_comments(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 089. `mcp__codex_apps__github_fetch_pr_file_patch`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_pr_file_patch(args: {
  // Exact changed-file path returned by `list_pr_changed_filenames` for this pull request. Do not guess paths or use this action to discover changed files.
  path: string;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 090. `mcp__codex_apps__github_fetch_pr_patch`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_pr_patch(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 091. `mcp__codex_apps__github_fetch_workflow_job_logs`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_workflow_job_logs(args: {
  // GitHub Actions workflow job ID.
  job_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 092. `mcp__codex_apps__github_fetch_workflow_job_steps`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_workflow_job_steps(args: {
  // GitHub Actions workflow job ID.
  job_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 093. `mcp__codex_apps__github_fetch_workflow_run_artifacts`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_workflow_run_artifacts(args: {
  // Optional artifact name to filter by.
  name?: string | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
  // GitHub Actions workflow run ID.
  run_id: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 094. `mcp__codex_apps__github_fetch_workflow_run_jobs`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_fetch_workflow_run_jobs(args: {
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
  // GitHub Actions workflow run ID.
  run_id: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 095. `mcp__codex_apps__github_get_commit_combined_status`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_commit_combined_status(args: {
  // Commit SHA.
  commit_sha: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 096. `mcp__codex_apps__github_get_issue_comment_reactions`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_issue_comment_reactions(args: {
  // Numeric issue or review comment ID.
  comment_id: number;
  // 1-based page number for pagination.
  page?: number | null;
  // Maximum number of results to return.
  per_page?: number | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 097. `mcp__codex_apps__github_get_pr_diff`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_pr_diff(args: {
  // Output format to return. Use `diff` for unified diff or `patch` for patch text.
  format?: "diff" | "patch";
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 098. `mcp__codex_apps__github_get_pr_info`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_pr_info(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 099. `mcp__codex_apps__github_get_pr_reactions`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_pr_reactions(args: {
  // 1-based page number for pagination.
  page?: number | null;
  // Maximum number of results to return.
  per_page?: number | null;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 100. `mcp__codex_apps__github_get_pr_review_comment_reactions`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_pr_review_comment_reactions(args: {
  // Numeric issue or review comment ID.
  comment_id: number;
  // 1-based page number for pagination.
  page?: number | null;
  // Maximum number of results to return.
  per_page?: number | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 101. `mcp__codex_apps__github_get_profile`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_profile(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 102. `mcp__codex_apps__github_get_repo`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_repo(args: {
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name?: string | null;
  // Numeric GitHub repository ID, such as `1296269`. Use this only when the stable repository `id` from a GitHub repository object is available: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_id?: number | null;
  // GitHub repository URL, or a nested repository URL such as a pull request, issue, branch, or file URL. Examples: `https://github.com/openai/openai/pulls/123`, `https://api.github.com/repos/openai/openai`, `https://github.example.com/api/v3/repos/octo/repo`. Supports GitHub Enterprise Server custom hostnames and GHE.com API hosts. Docs: https://docs.github.com/en/rest/repos/repos#get-a-repository and https://docs.github.com/en/enterprise-server@latest/rest/using-the-rest-api/getting-started-with-the-rest-api and https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/about-github-enterprise-cloud-with-data-residency#api-access
  repository_url?: string | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 103. `mcp__codex_apps__github_get_repo_collaborator_permission`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_repo_collaborator_permission(args: {
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // GitHub username to check against the repository.
  username: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 104. `mcp__codex_apps__github_get_user_login`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_user_login(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 105. `mcp__codex_apps__github_get_users_recent_prs_in_repo`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_get_users_recent_prs_in_repo(args: {
  // Include pull request comments in each result.
  include_comments?: boolean;
  // Include the pull request diff in each result.
  include_diff?: boolean;
  // Maximum number of results to return.
  limit?: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Pull request state filter such as `open`, `closed`, or `all`.
  state?: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 106. `mcp__codex_apps__github_label_pr`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_label_pr(args: {
  // Label to add to the pull request.
  label: string;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 107. `mcp__codex_apps__github_list_installations`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_installations(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 108. `mcp__codex_apps__github_list_installed_accounts`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_installed_accounts(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 109. `mcp__codex_apps__github_list_pr_changed_filenames`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_pr_changed_filenames(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 110. `mcp__codex_apps__github_list_pull_request_review_threads`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_pull_request_review_threads(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 111. `mcp__codex_apps__github_list_pull_request_reviews`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_pull_request_reviews(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 112. `mcp__codex_apps__github_list_recent_issues`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_recent_issues(args: { top_k?: number; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 113. `mcp__codex_apps__github_list_repositories`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_repositories(args: {
  // Include code search index availability metadata for each repo.
  include_search_index_status?: boolean;
  // Optional owner login to filter returned repositories.
  owner?: string | null;
  // Zero-based offset into the result set.
  page_offset?: number;
  // Maximum number of results to return.
  page_size?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 114. `mcp__codex_apps__github_list_repositories_by_affiliation`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_repositories_by_affiliation(args: {
  // GitHub affiliation filter such as `owner`, `collaborator`, or `organization_member`.
  affiliation: string;
  // Zero-based offset into the result set.
  page_offset?: number;
  // Maximum number of results to return.
  page_size?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 115. `mcp__codex_apps__github_list_repositories_by_installation`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_repositories_by_installation(args: {
  // GitHub App installation ID to filter by.
  installation_id: number;
  // Zero-based offset into the result set.
  page_offset?: number;
  // Maximum number of results to return.
  page_size?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 116. `mcp__codex_apps__github_list_user_org_memberships`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_user_org_memberships(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 117. `mcp__codex_apps__github_list_user_orgs`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_list_user_orgs(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 118. `mcp__codex_apps__github_lock_issue_conversation`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_lock_issue_conversation(args: {
  // Issue number in the repository.
  issue_number: number;
  // Optional reason for locking the conversation.
  lock_reason?: "off-topic" | "too heated" | "resolved" | "spam" | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 119. `mcp__codex_apps__github_mark_pull_request_ready_for_review`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_mark_pull_request_ready_for_review(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 120. `mcp__codex_apps__github_merge_pull_request`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_merge_pull_request(args: {
  // Optional override for the merge commit message.
  commit_message?: string | null;
  // Optional override for the merge commit title.
  commit_title?: string | null;
  // Optional expected head SHA. GitHub rejects the merge if the PR head moved.
  expected_head_sha?: string | null;
  // Optional merge method.
  merge_method?: "merge" | "squash" | "rebase" | null;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 121. `mcp__codex_apps__github_remove_issue_assignees`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_remove_issue_assignees(args: {
  // GitHub usernames to remove from assignees.
  assignees: Array<string>;
  // Issue number in the repository.
  issue_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 122. `mcp__codex_apps__github_remove_issue_label`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_remove_issue_label(args: {
  // Issue number in the repository.
  issue_number: number;
  // Single label to remove from the issue or pull request.
  label: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 123. `mcp__codex_apps__github_remove_pull_request_reviewers`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_remove_pull_request_reviewers(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Optional GitHub usernames to remove from review requests.
  reviewers?: Array<string> | null;
  // Optional team slugs to remove from review requests.
  team_reviewers?: Array<string> | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 124. `mcp__codex_apps__github_remove_reaction_from_issue_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_remove_reaction_from_issue_comment(args: {
  // Numeric issue or review comment ID.
  comment_id: number;
  // Reaction ID to remove.
  reaction_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 125. `mcp__codex_apps__github_remove_reaction_from_pr`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_remove_reaction_from_pr(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Reaction ID to remove.
  reaction_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 126. `mcp__codex_apps__github_remove_reaction_from_pr_review_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_remove_reaction_from_pr_review_comment(args: {
  // Numeric issue or review comment ID.
  comment_id: number;
  // Reaction ID to remove.
  reaction_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 127. `mcp__codex_apps__github_reply_to_review_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_reply_to_review_comment(args: {
  // Reply text to post into the review thread.
  comment: string;
  // Numeric issue or review comment ID.
  comment_id: number;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 128. `mcp__codex_apps__github_request_pull_request_reviewers`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_request_pull_request_reviewers(args: {
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Optional GitHub usernames to request for review.
  reviewers?: Array<string> | null;
  // Optional team slugs to request for review.
  team_reviewers?: Array<string> | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 129. `mcp__codex_apps__github_rerun_failed_workflow_run_jobs`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_rerun_failed_workflow_run_jobs(args: {
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
  // GitHub Actions workflow run ID.
  run_id: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 130. `mcp__codex_apps__github_rerun_workflow_job`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_rerun_workflow_job(args: {
  // GitHub Actions workflow job ID to re-run.
  job_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 131. `mcp__codex_apps__github_resolve_review_thread`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_resolve_review_thread(args: {
  // GraphQL review thread node ID.
  thread_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 132. `mcp__codex_apps__github_search`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search(args: {
  // Optional GitHub organization to scope the search.
  org?: string | null;
  // Search query string.
  query: string;
  // Repository or repositories to search within. Use this to narrow the search scope.
  repository_name?: string | Array<string> | null;
  // Maximum number of results to return.
  topn?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 133. `mcp__codex_apps__github_search_branches`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_branches(args: {
  // Opaque cursor from a previous branch search.
  cursor?: string | null;
  // GitHub repository owner or organization name.
  owner: string;
  // Maximum number of results to return.
  page_size?: number;
  // Search query string.
  query: string;
  // Repository name without the owner prefix.
  repo_name: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 134. `mcp__codex_apps__github_search_commits`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_commits(args: {
  // Optional result ordering.
  order?: "desc" | "asc" | null;
  // Optional GitHub organization to scope the search.
  org?: string | null;
  // Commit search text. Include at least one non-qualifier search term; GitHub rejects queries made only of qualifiers such as `author:` or `committer-date:`. To list recent commits in a repository without matching text, pass an empty string with `repository_full_name` and keep the default descending order.
  query: string;
  // Repository or repositories in `owner/name` form to search within.
  repository_full_name?: string | Array<string> | null;
  // Repository ID or IDs to search within.
  repository_id?: number | Array<number> | null;
  // Repository URL or URLs to search within.
  repository_url?: string | Array<string> | null;
  // Optional commit sort order.
  sort?: "best-match" | "author-date" | "committer-date" | null;
  // Maximum number of results to return.
  topn?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 135. `mcp__codex_apps__github_search_installed_reposito_be740b6e4965`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_installed_reposito_be740b6e4965(args: {
  // Maximum number of results to return.
  limit?: number;
  // Opaque streaming cursor from a previous search.
  next_token?: string | null;
  // Include search index availability metadata in the response.
  option_enrich_code_search_index_availability?: boolean;
  // Maximum concurrent requests when enriching search index availability.
  option_enrich_code_search_index_request_concurrency_limit?: number;
  // Search query string.
  query: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 136. `mcp__codex_apps__github_search_installed_repositories_v2`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_installed_repositories_v2(args: {
  // Include code search index availability metadata for each repo.
  include_search_index_status?: boolean;
  // Optional GitHub App installation IDs to filter by.
  installation_ids?: Array<string> | null;
  // Maximum number of results to return.
  limit?: number;
  // 1-based page number for pagination.
  page?: number;
  // Search query string.
  query: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 137. `mcp__codex_apps__github_search_issues`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_issues(args: {
  // Optional result ordering.
  order?: "desc" | "asc" | null;
  // Search query string.
  query: string;
  // Repository or repositories in `owner/name` form to search within.
  repository_full_name?: string | Array<string> | null;
  // Repository ID or IDs to search within.
  repository_id?: number | Array<number> | null;
  // Repository URL or URLs to search within.
  repository_url?: string | Array<string> | null;
  // Optional issue sort order.
  sort?: "best-match" | "created" | "updated" | "comments" | "reactions" | "interactions" | null;
  // Optional issue state filter.
  state?: "open" | "closed" | null;
  // Maximum number of results to return.
  topn?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 138. `mcp__codex_apps__github_search_prs`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_prs(args: {
  // Optional result ordering.
  order?: "desc" | "asc" | null;
  // Optional GitHub organization to scope the search.
  org?: string | null;
  // Search query string.
  query: string;
  // Repository or repositories in `owner/name` form to search within.
  repository_full_name?: string | Array<string> | null;
  // Repository ID or IDs to search within.
  repository_id?: number | Array<number> | null;
  // Repository URL or URLs to search within.
  repository_url?: string | Array<string> | null;
  // Optional pull request sort order.
  sort?: "best-match" | "created" | "updated" | "comments" | "reactions" | "interactions" | null;
  // Optional pull request state filter: open, closed, or all.
  state?: "open" | "closed" | "all" | null;
  // Maximum number of results to return.
  topn?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 139. `mcp__codex_apps__github_search_repositories`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_search_repositories(args: {
  // Optional GitHub organization to scope the search.
  org?: string | null;
  // 1-based page number for pagination.
  page?: number;
  // Maximum number of results to return.
  per_page?: number | null;
  // Search query string.
  query: string;
  // Alias for `per_page` used by some callers.
  topn?: number | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 140. `mcp__codex_apps__github_unlock_issue_conversation`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_unlock_issue_conversation(args: {
  // Issue number in the repository.
  issue_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 141. `mcp__codex_apps__github_unresolve_review_thread`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_unresolve_review_thread(args: {
  // GraphQL review thread node ID.
  thread_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 142. `mcp__codex_apps__github_update_file`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_update_file(args: {
  // Optional branch to update. Leave null to use the default branch.
  branch?: string | null;
  // Complete replacement UTF-8 text contents. This wrapper base64-encodes the text for GitHub's contents API.
  content: string;
  // Commit message for the file update.
  message: string;
  // Path for the existing file within the repository.
  path: string;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Current blob SHA of the file being updated, usually from `fetch_file`.
  sha: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 143. `mcp__codex_apps__github_update_issue`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_update_issue(args: {
  // Optional full assignee list to set on the issue. This replaces the assignee set rather than adding to it.
  assignees?: Array<string> | null;
  // Optional replacement Markdown body.
  body?: string | null;
  // Issue number in the repository.
  issue_number: number;
  // Optional full label list to set on the issue. This replaces the label set rather than adding to it.
  labels?: Array<string> | null;
  // Optional milestone number to set on the issue. This wrapper does not expose an explicit way to clear an existing milestone.
  milestone?: number | null;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Optional issue state. Use closed to close or open to reopen.
  state?: "open" | "closed" | null;
  // Optional state reason. GitHub uses this only with state changes. This wrapper supports `completed`, `not_planned`, `duplicate`, and `reopened`.
  state_reason?: "completed" | "not_planned" | "duplicate" | "reopened" | null;
  // Optional replacement issue title.
  title?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 144. `mcp__codex_apps__github_update_issue_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_update_issue_comment(args: {
  // Replacement comment body.
  comment: string;
  // Numeric issue or review comment ID.
  comment_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 145. `mcp__codex_apps__github_update_pull_request`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_update_pull_request(args: {
  // Optional new base branch to retarget the pull request onto.
  base_branch?: string | null;
  // Optional replacement pull request body.
  body?: string | null;
  // Whether maintainers may push commits to the head branch.
  maintainer_can_modify?: boolean | null;
  // Pull request number in the repository.
  pr_number: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Optional pull request state. Use closed to close or open to reopen.
  state?: "open" | "closed" | null;
  // Optional replacement pull request title.
  title?: string | null;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 146. `mcp__codex_apps__github_update_ref`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_update_ref(args: {
  // Branch name to create or update.
  branch_name: string;
  // Force the ref update even if it is not a fast-forward.
  force?: boolean;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repository_full_name: string;
  // Commit SHA.
  sha: string;
}): Promise<CallToolResult<{ result: { [key: string]: unknown; }; }>>; };
```

## 147. `mcp__codex_apps__github_update_review_comment`

Access repositories, issues, and pull requests. Required for some features such as Codex

```ts
declare const tools: { mcp__codex_apps__github_update_review_comment(args: {
  // Replacement inline review comment body.
  comment: string;
  // Numeric issue or review comment ID.
  comment_id: number;
  // Repository in `owner/name` form, such as `openai/openai`. This maps to GitHub REST `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos#get-a-repository
  repo_full_name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 148. `mcp__codex_apps__gmail_apply_labels_to_emails`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_apply_labels_to_emails(args: {
  // Gmail label display names. This action accepts names and can create missing labels when create_missing_labels is true; batch_modify_email requires existing Gmail label IDs.
  add_label_names?: Array<string> | null;
  // Whether to create missing labels before applying them.
  create_missing_labels?: boolean;
  // Gmail message IDs returned by Gmail search/read results. Use `message_ids` from search_email_ids or `id` fields from email results. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_ids: Array<string>;
  // Gmail label display names. This action accepts names and can create missing labels when create_missing_labels is true; batch_modify_email requires existing Gmail label IDs.
  remove_label_names?: Array<string> | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 149. `mcp__codex_apps__gmail_archive_emails`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_archive_emails(args: {
  // Gmail message IDs returned by Gmail search/read results. Use `message_ids` from search_email_ids or `id` fields from email results. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_ids: Array<string>;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 150. `mcp__codex_apps__gmail_batch_modify_email`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_batch_modify_email(args: {
  // Existing Gmail label IDs to add, not label display names. Prefer apply_labels_to_emails when you have label names or want missing labels created. Do not pass search operators such as -in:trash, ALL, or display names.
  add_labels?: Array<string> | null;
  // Gmail message IDs returned by Gmail search/read results. Use `message_ids` from search_email_ids or `id` fields from email results. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_ids: Array<string>;
  // Existing Gmail label IDs to remove, not label display names. Prefer apply_labels_to_emails when you have label names. Do not pass search operators such as -in:trash, ALL, or display names.
  remove_labels?: Array<string> | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 151. `mcp__codex_apps__gmail_batch_read_email`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_batch_read_email(args: {
  // Ignored compatibility alias; message_ids controls the batch.
  max_messages?: number | null;
  // Ignored compatibility alias; output size is not token-limited here.
  max_output_tokens?: number | null;
  // Ignored compatibility alias; message_ids controls the batch.
  max_results?: number | null;
  // Gmail message IDs returned by Gmail search/read results. Use `message_ids` from search_email_ids or `id` fields from email results. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_ids: Array<string>;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 152. `mcp__codex_apps__gmail_batch_read_email_threads`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_batch_read_email_threads(args: {
  // Interpret each entry in `ids` as `message` or `thread`. Set to `thread` only when every value came from thread_id or thread_ids.
  id_type?: "message" | "thread";
  // Gmail message IDs when id_type='message' or Gmail thread IDs when id_type='thread'. Every entry must use the same ID type; split mixed message/thread IDs into separate calls.
  ids: Array<string>;
  // Maximum number of messages to include per thread.
  max_messages?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 153. `mcp__codex_apps__gmail_bulk_label_matching_emails`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_bulk_label_matching_emails(args: {
  // Whether to archive matching messages after labeling them.
  archive?: boolean;
  // Whether to create the label first if it does not already exist.
  create_label_if_missing?: boolean;
  // Label name to apply to all matching messages.
  label_name: string;
  // Gmail search query used to find messages to label.
  query: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 154. `mcp__codex_apps__gmail_create_draft`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_create_draft(args: {
  // Optional file references to attach to the outgoing Gmail message. Pass file handles or workspace file paths; do not pass base64 content. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  attachment_files?: Array<string>;
  // Optional comma-separated BCC recipients.
  bcc?: string;
  // Email body content. By default this is interpreted as Markdown and sent as multipart plain text plus rendered HTML. For raw HTML, pass html_body or set content_type='text/html'.
  body?: string | null;
  // Optional file reference containing the outgoing body. Pass file handles or workspace/local HTML or text file paths; do not pass base64 content. HTML files are sent as text/html unless content_type explicitly requests text/plain or text/markdown. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  body_file?: string;
  // Optional comma-separated CC recipients.
  cc?: string;
  // How to interpret body or body_file when html_body is not provided. Use text/markdown for existing Markdown behavior, text/html to preserve raw HTML, or text/plain for a plain-text-only message.
  content_type?: "text/markdown" | "text/html" | "text/plain";
  // Optional raw HTML body to send as the message's text/html part. This preserves explicit email-client HTML such as tables, inline styles, width rules, and spacer layouts. Provide body as the plain-text fallback when possible.
  html_body?: string | null;
  // Optional Gmail message ID to reply to so the draft stays threaded. Gmail message ID returned by Gmail search/read results. Use the `id` or `message_id` field from an email result. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  reply_message_id?: string | null;
  // Draft subject line.
  subject: string;
  // Comma-separated recipient email addresses.
  to: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 155. `mcp__codex_apps__gmail_create_label`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_create_label(args: {
  // Visibility of the label itself in Gmail label lists.
  label_list_visibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
  // Visibility of messages carrying this label in Gmail message lists.
  message_list_visibility?: "show" | "hide";
  // Name of the Gmail label to create.
  name: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 156. `mcp__codex_apps__gmail_delete_emails`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_delete_emails(args: {
  // Gmail message IDs returned by Gmail search/read results. Use `message_ids` from search_email_ids or `id` fields from email results. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_ids: Array<string>;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 157. `mcp__codex_apps__gmail_forward_emails`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_forward_emails(args: {
  // Optional comma-separated BCC recipients.
  bcc?: string;
  // Optional comma-separated CC recipients.
  cc?: string;
  // Gmail message IDs returned by Gmail search/read results. Use `message_ids` from search_email_ids or `id` fields from email results. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_ids: Array<string>;
  // Optional note to place at the top of each forwarded email body. Supports Markdown formatting.
  note?: string;
  // Comma-separated recipient email addresses.
  to: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 158. `mcp__codex_apps__gmail_get_profile`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_get_profile(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 159. `mcp__codex_apps__gmail_list_drafts`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_list_drafts(args: {
  // Maximum number of results to return. Must be at least 1.
  max_results?: number;
  // Pagination token from a previous drafts list.
  next_page_token?: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 160. `mcp__codex_apps__gmail_list_labels`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_list_labels(args: {
  // Optional Gmail label display names to filter by. For search label filters, copy labels[].id from the response, not labels[].name.
  label_names?: Array<string> | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 161. `mcp__codex_apps__gmail_read_attachment`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_read_attachment(args: {
  // Exact Gmail attachment_id copied from the selected attachment's attachments[].attachment_id or inline_images[].attachment_id on the parent message. Use it only when the complete value is available; if it is absent or marked truncated in a tool response, pass the exact filename instead. Do not pass truncated values, filenames, message IDs, thread IDs, Content-ID, X-Attachment-Id, URLs, or guessed values.
  attachment_id?: string;
  // Exact attachment filename from the parent message's attachments or inline_images. Use only when attachment_id is absent, unknown, or marked truncated in the tool response. If multiple attachments share this filename, retry with a complete attachment_id.
  filename?: string;
  // Gmail message ID returned by Gmail search/read results. Use the `id` or `message_id` field from an email result. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs. Use the parent message ID.
  message_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 162. `mcp__codex_apps__gmail_read_email`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_read_email(args: {
  // When true, bypass the text sync cache and include the original RFC822 MIME source plus Gmail raw base64url payload. Use this to verify HTML layout, MIME boundaries, and exact content headers.
  include_raw_mime?: boolean;
  // Gmail message ID returned by Gmail search/read results. Use the `id` or `message_id` field from an email result. Do not pass placeholder values like `dummy`, `latest`, `gmail:<id>`, draft IDs, thread IDs, email addresses, subjects, or Gmail UI URLs.
  message_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 163. `mcp__codex_apps__gmail_read_email_thread`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_read_email_thread(args: {
  // A Gmail message ID when id_type='message'; a Gmail thread ID when id_type='thread'. Do not mix message IDs and thread IDs in this field.
  id: string;
  // Interpret `id` as `message` or `thread`. Set to `thread` only when the value came from a thread_id or thread_ids field.
  id_type?: "message" | "thread";
  // Maximum number of messages to include from the thread.
  max_messages?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 164. `mcp__codex_apps__gmail_search_email_ids`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_search_email_ids(args: {
  // Optional Gmail label IDs, not Gmail search operators and not display names. Use exact label IDs such as INBOX, UNREAD, SENT, TRASH, SPAM, CATEGORY_PROMOTIONS, or user label IDs returned in list_labels.labels[].id. Put Gmail search syntax such as -in:spam, -in:trash, -category:promotions, label:Newsletters, category:promotions, newer_than:7d, or from:alice@example.com in query. Do not pass ALL, label display names like Newsletters, or custom names like DA/30 Waiting - Cody unless list_labels returned that exact value as id.
  label_ids?: Array<string> | null;
  // Maximum number of results to return. Must be at least 1.
  max_results?: number;
  // Pagination token from a previous search.
  next_page_token?: string;
  // Gmail search query. Put Gmail search operators here, including -in:spam, -in:trash, -category:promotions, category:promotions, label:<display name>, from:, to:, after:, before:, newer_than:, and has:attachment.
  query?: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 165. `mcp__codex_apps__gmail_search_emails`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_search_emails(args: {
  // Optional Gmail label IDs, not Gmail search operators and not display names. Use exact label IDs such as INBOX, UNREAD, SENT, TRASH, SPAM, CATEGORY_PROMOTIONS, or user label IDs returned in list_labels.labels[].id. Put Gmail search syntax such as -in:spam, -in:trash, -category:promotions, label:Newsletters, category:promotions, newer_than:7d, or from:alice@example.com in query. Do not pass ALL, label display names like Newsletters, or custom names like DA/30 Waiting - Cody unless list_labels returned that exact value as id.
  label_ids?: Array<string> | null;
  // Maximum number of results to return. Must be at least 1.
  max_results?: number;
  // Pagination token from a previous search.
  next_page_token?: string;
  // Gmail search query. Put Gmail search operators here, including -in:spam, -in:trash, -category:promotions, category:promotions, label:<display name>, from:, to:, after:, before:, newer_than:, and has:attachment.
  query?: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 166. `mcp__codex_apps__gmail_send_draft`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_send_draft(args: {
  // Gmail draft ID returned by create_draft, update_draft, or list_drafts as `draft_id`. Do not pass the draft's underlying message_id, thread_id, subject, recipient email, placeholder values, or Gmail UI URLs.
  draft_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 167. `mcp__codex_apps__gmail_send_email`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_send_email(args: {
  // Optional file references to attach to the outgoing Gmail message. Pass file handles or workspace file paths; do not pass base64 content. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  attachment_files?: Array<string>;
  // Optional comma-separated BCC recipients.
  bcc?: string;
  // Email body content. By default this is interpreted as Markdown and sent as multipart plain text plus rendered HTML. For raw HTML, pass html_body or set content_type='text/html'.
  body?: string | null;
  // Optional file reference containing the outgoing body. Pass file handles or workspace/local HTML or text file paths; do not pass base64 content. HTML files are sent as text/html unless content_type explicitly requests text/plain or text/markdown. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  body_file?: string;
  // Optional comma-separated CC recipients.
  cc?: string;
  // How to interpret body or body_file when html_body is not provided. Use text/markdown for existing Markdown behavior, text/html to preserve raw HTML, or text/plain for a plain-text-only message.
  content_type?: "text/markdown" | "text/html" | "text/plain";
  // Optional raw HTML body to send as the message's text/html part. This preserves explicit email-client HTML such as tables, inline styles, width rules, and spacer layouts. Provide body as the plain-text fallback when possible.
  html_body?: string | null;
  // Optional Gmail message ID to reply to so the email stays threaded.
  reply_message_id?: string | null;
  // Email subject line.
  subject: string;
  // Comma-separated recipient email addresses.
  to: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 168. `mcp__codex_apps__gmail_update_draft`

Gmail tools for label counts, searching and reading emails/threads/attachments, reviewing drafts, and explicit mail changes like send, draft, forward, archive, Trash, and label actions.

```ts
declare const tools: { mcp__codex_apps__gmail_update_draft(args: {
  // New BCC list. Leave null to keep the existing value.
  bcc?: string | null;
  // New draft body content. Leave null to keep the existing value unless html_body or body_file is provided.
  body?: string | null;
  // Optional file reference containing the outgoing body. Pass file handles or workspace/local HTML or text file paths; do not pass base64 content. HTML files are sent as text/html unless content_type explicitly requests text/plain or text/markdown. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  body_file?: string;
  // New CC list. Leave null to keep the existing value.
  cc?: string | null;
  // How to interpret body or body_file when html_body is not provided. Use text/markdown for existing Markdown behavior, text/html to preserve raw HTML, or text/plain for a plain-text-only message.
  content_type?: "text/markdown" | "text/html" | "text/plain";
  // Gmail draft ID returned by create_draft, update_draft, or list_drafts as `draft_id`. Do not pass the draft's underlying message_id, thread_id, subject, recipient email, placeholder values, or Gmail UI URLs.
  draft_id: string;
  // Optional raw HTML body to send as the message's text/html part. This preserves explicit email-client HTML such as tables, inline styles, width rules, and spacer layouts. Provide body as the plain-text fallback when possible.
  html_body?: string | null;
  // New subject line. Leave null to keep the existing value.
  subject?: string | null;
  // New recipient list. Leave null to keep the existing value.
  to?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 169. `mcp__codex_apps__google_calendar_batch_read_event`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_batch_read_event(args: {
  // Calendar ID to query. Use `primary` for the user's main calendar, or an email-like calendar ID containing `@` (for example `team@group.calendar.google.com`). Default is `primary`.
  calendar_id?: string | null;
  // List of event IDs to read. Results are returned in the same order, up to the connector's batch limit.
  event_ids: Array<string>;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 170. `mcp__codex_apps__google_calendar_create_event`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_create_event(args: {
  // Whether to request a Google Meet link for the event. Defaults to true. If conference creation is still pending, re-read the event later to check final Meet details.
  add_google_meet?: boolean;
  // List of attendee emails to invite. The authenticated user's attendance is controlled by `self_attendance`. Pass an empty list for a solo status block.
  attendees: Array<string>;
  // Auto-decline behavior for status events
  auto_decline_mode?: "declineNone" | "declineAllConflictingInvitations" | "declineOnlyNewConflictingInvitations" | null;
  // Calendar ID to query. Use `primary` for the user's main calendar, or an email-like calendar ID containing `@` (for example `team@group.calendar.google.com`). Default is `primary`.
  calendar_id?: string | null;
  // Chat status for focus time events
  chat_status?: "doNotDisturb" | null;
  // Optional Google Calendar event color string ID from the `event` palette returned by `get_colors`. Pass the palette key, not a background or foreground hex value. Leave null to use or keep the calendar default color.
  color_id?: string | null;
  // Optional message sent when declining
  decline_message?: string | null;
  // Description of the event
  description?: string | null;
  // Event end datetime in full ISO-8601/RFC3339 format (e.g. 2026-05-01T10:00:00-07:00).
  end_time: string;
  // Optional event type. Use `outOfOffice` or `focusTime` for status events. For a personal focus block, prefer `attendees=[]`; use `self_attendance="omit"` if you do not want the authenticated user added as an attendee.
  event_type?: "birthday" | "default" | "focusTime" | "fromGmail" | "outOfOffice" | "workingLocation" | null;
  // Whether invited guests may modify the event. Set true only when the user explicitly wants guests to edit the event; leave null for Google default behavior.
  guests_can_modify?: boolean | null;
  // Location of the event
  location?: string | null;
  // Optional raw Google/RFC5545 recurrence lines (for example `RRULE:FREQ=WEEKLY;BYDAY=MO`). Omit for one-off events.
  recurrence?: Array<string> | null;
  // Event reminder configuration. Use the calendar defaults when omitted.
  reminders?: {
  // Custom reminder overrides. Provide an empty list with use_default=false to disable reminders for the event.
  overrides?: Array<{
  // Reminder delivery method.
  method: "email" | "popup";
  // Minutes before the event when the reminder triggers.
  minutes: number;
}> | null;
  // Whether to use the calendar's default reminders for this event.
  use_default: boolean;
} | null;
  // How the authenticated user should be represented on the event they create. Defaults to `accepted`; use `omit` to create the event without adding the authenticated user as an attendee. For a solo `focusTime` block, prefer `omit`.
  self_attendance?: "accepted" | "declined" | "tentative" | "omit";
  // Event start datetime in full ISO-8601/RFC3339 format (e.g. 2026-05-01T09:00:00-07:00).
  start_time: string;
  // IANA timezone name such as `America/Los_Angeles` or `Europe/Berlin`. Do not pass UTC offsets like `+02:00`. Default is `America/Los_Angeles`.
  timezone_str?: string | null;
  // Title shown for the calendar event.
  title: string;
  // Optional event transparency. Use `opaque` to block the time as busy, or `transparent` to keep the event from blocking the calendar so overlapping bookings can still be scheduled. Leave null for Google default behavior.
  transparency?: "opaque" | "transparent" | null;
  // Optional event visibility (`default`, `public`, or `private`). Leave null for Google default behavior.
  visibility?: "default" | "public" | "private" | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 171. `mcp__codex_apps__google_calendar_delete_event`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_delete_event(args: {
  // Calendar ID to query. Use `primary` for the user's main calendar, or an email-like calendar ID containing `@` (for example `team@group.calendar.google.com`). Default is `primary`.
  calendar_id?: string | null;
  // Google Calendar event ID.
  event_id: string;
}): Promise<CallToolResult<{ result: null; }>>; };
```

## 172. `mcp__codex_apps__google_calendar_fetch`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_fetch(args: {
  // Calendar ID to query. Use `primary` for the user's main calendar, or an email-like calendar ID containing `@` (for example `team@group.calendar.google.com`). Default is `primary`.
  calendar_id?: string | null;
  // Google Calendar event ID.
  event_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 173. `mcp__codex_apps__google_calendar_get_availability`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_get_availability(args: {
  // List of calendar IDs to query. Use Google Calendar IDs such as `primary`, a coworker email, or a room/resource email.
  calendar_ids: Array<string>;
  // Required IANA timezone name used for response timestamps only, such as `America/Los_Angeles` or `Europe/Berlin`. This does not define the query interval.
  response_timezone_str: string;
  // Required RFC3339 datetime string with `Z` or an explicit UTC offset (for example `2026-05-01T10:00:00-07:00`). Do not pass naive datetimes and do not pass `now`.
  time_max: string;
  // Required RFC3339 datetime string with `Z` or an explicit UTC offset (for example `2026-05-01T09:00:00-07:00`). Do not pass naive datetimes and do not pass `now`.
  time_min: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 174. `mcp__codex_apps__google_calendar_get_colors`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_get_colors(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 175. `mcp__codex_apps__google_calendar_get_profile`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_get_profile(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 176. `mcp__codex_apps__google_calendar_read_event`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_read_event(args: {
  // Calendar ID to query. Use `primary` for the user's main calendar, or an email-like calendar ID containing `@` (for example `team@group.calendar.google.com`). Default is `primary`.
  calendar_id?: string | null;
  // Google Calendar event ID.
  event_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 177. `mcp__codex_apps__google_calendar_respond_event`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_respond_event(args: {
  // Google Calendar event ID.
  event_id: string;
  // Notify attendees of this response
  notify?: boolean;
  // Optional note explaining your response
  reason?: string | null;
  // Your response to the event invitation
  response_status: "accepted" | "declined" | "tentative";
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 178. `mcp__codex_apps__google_calendar_search`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_search(args: {
  // Maximum number of events to return. Must be at least 1.
  max_results?: number;
  // Broad free-text query passed to Google Calendar's `q` search parameter. Best for keyword matches in titles and some indexed event text, not precise attendee filtering.
  query: string;
  // Optional window end in full ISO-8601/RFC3339 format (e.g. 2026-05-31T23:59:59Z).
  time_max?: string | null;
  // Optional window start in full ISO-8601/RFC3339 format (e.g. 2026-05-01T00:00:00Z).
  time_min?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 179. `mcp__codex_apps__google_calendar_search_events`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_search_events(args: {
  // Calendar ID to query. Use `primary` for the user's main calendar, or an email-like calendar ID containing `@` (for example `team@group.calendar.google.com`). Default is `primary`.
  calendar_id?: string | null;
  // Maximum number of events to return. Must be at least 1.
  max_results?: number;
  // Pagination token returned by a previous search_events/search_events_all_fields call. Use it to continue paging within the same bounded window, and omit it on the first page.
  next_page_token?: string | null;
  // Broad free-text query passed to Google Calendar's `q` search parameter. Best for keyword matches in titles and some indexed event text, not precise attendee filtering.
  query?: string | null;
  // End of the search window. Prefer passing an explicit full ISO-8601/RFC3339 datetime (for example `2026-05-31T23:59:59Z`) rather than omitting bounds. Use exact `now` only when you intentionally want a current boundary. Do not use relative expressions like `now-7d` or `now+30m`.
  time_max?: string | null;
  // Start of the search window. Prefer passing an explicit full ISO-8601/RFC3339 datetime (for example `2026-05-01T00:00:00Z`) rather than omitting bounds. Use exact `now` only when you intentionally want a current boundary. Do not use relative expressions like `now-7d` or `now+30m`.
  time_min?: string | null;
  // Timezone for interpreting time_min/time_max. IANA timezone name such as `America/Los_Angeles` or `Europe/Berlin`. Do not pass UTC offsets like `+02:00`. Default is `America/Los_Angeles`.
  timezone_str?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 180. `mcp__codex_apps__google_calendar_update_event`

Google Calendar tools for searching/reading events, checking availability before scheduling, reading colors, and explicit calendar changes: create/update/delete events or respond to invitations.

```ts
declare const tools: { mcp__codex_apps__google_calendar_update_event(args: { add_google_meet?: boolean; attendees_to_add?: Array<string> | null; attendees_to_remove?: Array<string> | null; auto_decline_mode?: "declineNone" | "declineAllConflictingInvitations" | "declineOnlyNewConflictingInvitations" | null; calendar_id?: string | null; chat_status?: "doNotDisturb" | null; color_id?: string | null; decline_message?: string | null; description?: string | null; end_time?: string | null; event_id: string; event_type?: "birthday" | "default" | "focusTime" | "fromGmail" | "outOfOffice" | "workingLocation" | null; guests_can_modify?: boolean | null; location?: string | null; recurrence?: Array<string> | null; reminders?: { overrides?: Array<{ method: "email" | "popup"; minutes: number; }> | null; use_default: boolean; } | null; start_time?: string | null; timezone_str?: string | null; title?: string | null; transparency?: "opaque" | "transparent" | null; update_scope?: "this_instance" | "entire_series" | "this_and_following"; visibility?: "default" | "public" | "private" | null; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 181. `mcp__codex_apps__google_drive_batch_update_document`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_batch_update_document(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // Optional sidecar file references for local or generated images used by Drive roll-up batch update actions. This exists because runtime file upload rewriting currently only handles top-level file parameters. Put local workspace image paths here in the same order as the matching image URL placeholders in requests. Public HTTP(S) image URLs should stay directly in requests and should not be repeated here. Do not pass base64 data URLs. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  image_uris?: string;
  // Raw Google Docs API documents.batchUpdate request objects for editing document content. Each list item must set exactly one request type key such as insertText, updateTextStyle, replaceAllText, deleteContentRange, insertInlineImage, or addDocumentTab. For insertInlineImage, pass a short public HTTP(S) URL string directly in uri. For local/generated image bytes, put the workspace image path in image_uris and set the matching request uri to a non-public placeholder such as that same path. Do not pass base64 data URLs directly. Send each request as a structured object in the list, not as a JSON string or other stringified input. Requests execute in order. Do not use this to rename or move the Drive file; use update_file for Drive metadata or parent-folder changes.
  requests: Array<{ [key: string]: unknown; }>;
  // Optional writeControl object for the underlying Google Docs API batch update call.
  write_control?: {
  // Require the document to still be at this revision ID or fail the batch update.
  requiredRevisionId?: string | null;
  // Apply the batch update against this revision ID and merge with newer changes when possible.
  targetRevisionId?: string | null;
} | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 182. `mcp__codex_apps__google_drive_batch_update_presentation`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_batch_update_presentation(args: {
  // Optional sidecar file references for local or generated images used by Drive roll-up batch update actions. This exists because runtime file upload rewriting currently only handles top-level file parameters. Put local workspace image paths here in the same order as the matching image URL placeholders in requests. Public HTTP(S) image URLs should stay directly in requests and should not be repeated here. Do not pass base64 data URLs. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  image_uris?: string;
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url?: string | null;
  // Raw Google Slides API presentations.batchUpdate request objects for editing presentation content. Each list item must set exactly one request type key such as createSlide, createImage, insertText, updateTextStyle, replaceAllText, updatePageElementTransform, deleteObject, or duplicateObject. Use slide/page objectId values returned by get_presentation, get_presentation_outline, or get_slide for fields such as elementProperties.pageObjectId or slideObjectIds; do not use the presentation ID, slide number, layout ID, or a page element ID. For local/generated image bytes in createImage.url, replaceImage.url, or replaceAllShapesWithImage.imageUrl, put the workspace image path in image_uris and set the matching request URL field to a non-public placeholder such as that same path. Send each request as a structured object in the list, not as a JSON string or other stringified input. Requests execute in order. Do not use this to rename or move the Drive file; use update_file for Drive metadata or parent-folder changes.
  requests: Array<{ [key: string]: unknown; }>;
  // Optional writeControl object for the underlying Google Slides API batch update call. Prefer providing requiredRevisionId from a fresh read before writing when you want concurrent edits to fail cleanly.
  write_control?: {
  // Require the presentation to still be at this revision ID or fail the batch update.
  requiredRevisionId?: string | null;
} | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 183. `mcp__codex_apps__google_drive_batch_update_spreadsheet`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_batch_update_spreadsheet(args: {
  // Optional sidecar file references for local or generated images used by Drive roll-up batch update actions. This exists because runtime file upload rewriting currently only handles top-level file parameters. Put local workspace image paths here in the same order as the matching image URL placeholders in requests. Public HTTP(S) image URLs should stay directly in requests and should not be repeated here. Do not pass base64 data URLs. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  image_uris?: string;
  // When true, include the updated spreadsheet resource in the response.
  include_spreadsheet_in_response?: boolean;
  // Raw Google Sheets API batchUpdate requests, in execution order. Each item must be one structured Sheets REST request object with exactly one request type key, for example {'addSheet': {...}}, {'updateCells': {...}}, or {'findReplace': {...}}. Use Google field names and casing exactly and do not pass JSON strings. For updateCells, provide a valid start or range with the target sheetId, keep row/column indexes inside the requested grid, put the field mask on updateCells.fields, and do not put a fields key inside rows[]. For findReplace, set exactly one scope: range, sheetId, or allSheets. For local/generated image bytes in IMAGE formulas, put the workspace image path in image_uris and set the matching formula URL argument to a non-public placeholder such as that same path. Do not use this to rename or move the Drive file; use update_file for Drive metadata or parent-folder changes.
  requests: Array<{ [key: string]: unknown; }>;
  // When true, include grid data in updatedSpreadsheet. Only meaningful when include_spreadsheet_in_response is true.
  response_include_grid_data?: boolean;
  // Optional ranges to include in updatedSpreadsheet when include_spreadsheet_in_response is true. A1 range including the sheet name, e.g. Sheet1!A1:C20 or 'Q1 Plan'!A1:C20. Quote sheet names that contain spaces or punctuation and avoid duplicated sheet prefixes.
  response_ranges?: Array<string> | null;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 184. `mcp__codex_apps__google_drive_bulk_update_file_comments`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_bulk_update_file_comments(args: {
  // Top-level Drive file comments to create. Inspect the file first and collect all intended comments for this file before calling this action instead of calling once per comment. For every comment, you must include enough location context for a reader to identify the target even if Google shows the Drive API comment as unanchored: use `quoted_text` with the exact sentence or phrase for Docs/text, use `slide_number` plus `quoted_text` when possible for Slides, and use `sheet_cell_range` with the sheet name and A1 cell/range for Sheets.
  comments?: Array<{
  // Optional raw Google Drive comment anchor JSON string. Omit to create an unanchored comment. Use this only when you already have a provider-valid anchor string; the connector does not construct anchors for you.
  anchor?: string | null;
  // Plain-text content for the comment or reply.
  content: string;
  // Optional exact text snippet from the file that this comment refers to. For Google Workspace editor files, prefer including this short snippet because Drive API-created anchors can appear unanchored in the editor UI.
  quoted_text?: string | null;
  // Optional Google Sheets A1 cell or range reference this comment refers to, such as `B12` or `Sheet1!B12:D15`.
  sheet_cell_range?: string | null;
  // Optional 1-based slide number this comment refers to for Google Slides files.
  slide_number?: number | null;
}> | null;
  // Google Drive file ID only (for example `1abcDEF...`). Do not pass extra parameters.
  id?: string | null;
  // Replies to add to existing Drive comment threads. Include all intended replies for this file in one call.
  replies?: Array<{
  // Drive comment thread ID on the file.
  comment_id: string;
  // Plain-text content for the comment or reply.
  content: string;
}> | null;
  // Existing Drive comment threads to resolve. Include all intended resolutions for this file in one call.
  resolutions?: Array<{
  // Drive comment thread ID on the file.
  comment_id: string;
  // Optional reply text to include while resolving the comment. Omit to resolve without adding a note.
  reply_content?: string | null;
}> | null;
  // Google Drive/Docs/Sheets/Slides file URL containing a valid ID (for example https://drive.google.com/file/d/<FILE_ID>/... or https://docs.google.com/document/d/<FILE_ID>/...). Do not pass local filesystem paths, Windows paths, gdrive:// URIs, or plain names.
  url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 185. `mcp__codex_apps__google_drive_copy_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_copy_file(args: {
  // Optional new title for the copied file. Parameter name is `new_title` (not `title`).
  new_title?: string | null;
  // Optional parent folder reference. Accepted values: folder ID, folder URL, or literal `root`. Parameter name is `parent_folder` (not `parent_id` or `folder_id`).
  parent_folder?: string | null;
  // Google Drive/Docs/Sheets/Slides file URL containing a valid ID (for example https://drive.google.com/file/d/<FILE_ID>/... or https://docs.google.com/document/d/<FILE_ID>/...). Do not pass local filesystem paths, Windows paths, gdrive:// URIs, or plain names.
  url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 186. `mcp__codex_apps__google_drive_create_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_create_file(args: {
  // Native Google Workspace MIME type to create. Supported values: application/vnd.google-apps.document, application/vnd.google-apps.spreadsheet, application/vnd.google-apps.presentation.
  mime_type: string;
  // Title for the new file.
  title: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 187. `mcp__codex_apps__google_drive_create_folder`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_create_folder(args: {
  // Name of the new folder.
  name: string;
  // Optional parent folder reference. Accepted values: folder ID, folder URL, or literal `root`. Parameter name is `parent_folder` (not `parent_id` or `folder_id`).
  parent_folder?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 188. `mcp__codex_apps__google_drive_create_presentation_0cb5796bb4da`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_create_presentation_0cb5796bb4da(args: {
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  template_presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  template_presentation_url?: string | null;
  // Optional title for the new deck created from a template copy.
  title?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 189. `mcp__codex_apps__google_drive_delete_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_delete_file(args: {
  // Google Drive/Docs/Sheets/Slides file URL containing a valid ID (for example https://drive.google.com/file/d/<FILE_ID>/... or https://docs.google.com/document/d/<FILE_ID>/...). Do not pass local filesystem paths, Windows paths, gdrive:// URIs, or plain names.
  url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 190. `mcp__codex_apps__google_drive_duplicate_sheet_in__87f8596f8691`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_duplicate_sheet_in__87f8596f8691(args: {
  // Name of the newly created spreadsheet file that will receive the copied sheet.
  new_file_name: string;
  // Optional name for the copied sheet in the new spreadsheet. Leave null to keep the source sheet name.
  new_sheet_name?: string | null;
  // Source sheet name to duplicate. Use the visible tab name, not the spreadsheet file name.
  source_sheet_name: string;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 191. `mcp__codex_apps__google_drive_export_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_export_file(args: {
  // Google Drive file ID only (for example `1abcDEF...`). Do not pass extra parameters.
  id?: string | null;
  // Export MIME type for a native Google Doc, Sheet, or Slide file. Common examples: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.openxmlformats-officedocument.presentationml.presentation, text/markdown, text/plain, text/csv.
  mime_type?: string;
  // Google Drive/Docs/Sheets/Slides file URL containing a valid ID (for example https://drive.google.com/file/d/<FILE_ID>/... or https://docs.google.com/document/d/<FILE_ID>/...). Do not pass local filesystem paths, Windows paths, gdrive:// URIs, or plain names.
  url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 192. `mcp__codex_apps__google_drive_fetch`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_fetch(args: {
  // Download raw bytes.
  download_raw_file?: boolean;
  // Requires download_raw_file=true for Google Docs, Sheets, or Slides; null uses the default raw export.
  raw_export_mime_type?: string | null;
  // Drive file or canonical Drive folder URL. With default text options, folders return at most 100 direct children as JSON and may be partial for larger folders.
  url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 193. `mcp__codex_apps__google_drive_fetch_file_revision`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_fetch_file_revision(args: {
  // Google Drive API `acknowledgeAbuse` query parameter for downloading abusive revision media when the user owns the file or organizes the shared drive.
  acknowledgeAbuse?: boolean | null;
  // Connector export MIME type for Google Docs/Sheets/Slides revisions. Use `text/plain` for readable document text.
  exportMimeType?: string;
  // Google Drive API `fileId` path parameter. Raw file IDs are preferred; Drive/Docs/Sheets/Slides URLs are also accepted.
  fileId: string;
  // Revision ID returned by `list_file_revisions`. To compare to the current file, use `previousRevisionId` from that response.
  revisionId: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 194. `mcp__codex_apps__google_drive_find_document_text_range`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_find_document_text_range(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // 1-based occurrence number when target_text appears multiple times.
  instance?: number;
  // Optional Google Docs tab ID. Use this to target a specific tab in a tabbed document. Exclude to get all tabs.
  tab_id?: string | null;
  // Exact document text to match. Prefer this over raw indexes when possible.
  text_to_find: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 195. `mcp__codex_apps__google_drive_get_document`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_document(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // Optional Google Docs API partial-response fields selector. Nested selections use Google API fields syntax. When selecting tabs, include tabProperties so each flattened tab has its required tabId. Omit this parameter to return the full document resource.
  fields?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 196. `mcp__codex_apps__google_drive_get_document_comments`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_document_comments(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // When true, include deleted comments and deleted replies in the result.
  include_deleted?: boolean;
  // Maximum comment threads to return on this page. Use the response nextPageToken to continue.
  page_size?: number;
  // Opaque nextPageToken from a previous get_document_comments response.
  page_token?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 197. `mcp__codex_apps__google_drive_get_document_paragraph_range`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_document_paragraph_range(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // A Google Docs document index that falls within the paragraph you want to resolve.
  index_within: number;
  // Optional Google Docs tab ID. Use this to target a specific tab in a tabbed document. Exclude to get all tabs.
  tab_id?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 198. `mcp__codex_apps__google_drive_get_document_tables`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_document_tables(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // Optional Google Docs tab ID. Use this to target a specific tab in a tabbed document. Exclude to get all tabs.
  tab_id?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 199. `mcp__codex_apps__google_drive_get_document_text`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_document_text(args: {
  // Raw Google Docs document ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  document_id?: string | null;
  // Google Docs URL in the format https://docs.google.com/document/d/<DOCUMENT_ID>/... or a raw Google Docs document ID. If you only know the document title or title keywords, call `search_documents` first instead of asking the user for a URL. Do not pass document titles, Drive open?id links, app:// URLs, or /document/create.
  document_url?: string | null;
  // Optional Google Docs tab ID. Use this to target a specific tab in a tabbed document. Exclude to get all tabs.
  tab_id?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 200. `mcp__codex_apps__google_drive_get_file_comments`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_file_comments(args: {
  // Google Drive file ID only (for example `1abcDEF...`). Do not pass extra parameters.
  id?: string | null;
  // When true, include deleted comments and deleted replies in the result.
  include_deleted?: boolean;
  // Maximum comment threads to return on this page. Use the response nextPageToken to continue.
  page_size?: number;
  // Opaque nextPageToken from a previous get_file_comments response.
  page_token?: string | null;
  // Google Drive/Docs/Sheets/Slides file URL containing a valid ID (for example https://drive.google.com/file/d/<FILE_ID>/... or https://docs.google.com/document/d/<FILE_ID>/...). Do not pass local filesystem paths, Windows paths, gdrive:// URIs, or plain names.
  url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 201. `mcp__codex_apps__google_drive_get_file_metadata`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_file_metadata(args: {
  // Google Drive API `acknowledgeAbuse` query parameter for downloading abusive media when applicable.
  acknowledgeAbuse?: boolean | null;
  // Google Drive API partial response `fields` selector for the file metadata.
  fields?: string;
  // Google Drive API `fileId` path parameter. Raw file IDs are preferred; Drive/Docs/Sheets/Slides URLs are also accepted.
  fileId: string;
  // Google Drive API `includeLabels` query parameter: comma-separated label IDs to include in `labelInfo`.
  includeLabels?: string | null;
  // Google Drive API `includePermissionsForView` query parameter. Only `published` is supported.
  includePermissionsForView?: string | null;
  // Google Drive API `supportsAllDrives` query parameter.
  supportsAllDrives?: boolean | null;
  // Deprecated Google Drive API `supportsTeamDrives` query parameter.
  supportsTeamDrives?: boolean | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 202. `mcp__codex_apps__google_drive_get_presentation`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_presentation(args: {
  // Optional Google Slides API partial-response fields selector. For example, use `presentationId,title,revisionId,pageSize,locale` for a compact metadata read. Nested selections use Google API fields syntax. Omit this parameter to return the full presentation resource.
  fields?: string | null;
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 203. `mcp__codex_apps__google_drive_get_presentation_comments`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_presentation_comments(args: {
  // When true, include deleted comments and deleted replies in the result.
  include_deleted?: boolean;
  // Maximum comment threads to return on this page. Use the response nextPageToken to continue.
  page_size?: number;
  // Opaque nextPageToken from a previous get_presentation_comments response.
  page_token?: string | null;
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 204. `mcp__codex_apps__google_drive_get_presentation_outline`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_presentation_outline(args: {
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 205. `mcp__codex_apps__google_drive_get_presentation_tables`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_presentation_tables(args: {
  // Google Slides URL
  presentation_url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 206. `mcp__codex_apps__google_drive_get_presentation_text`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_presentation_text(args: {
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 207. `mcp__codex_apps__google_drive_get_profile`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_profile(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 208. `mcp__codex_apps__google_drive_get_slide`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_slide(args: {
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url?: string | null;
  // Google Slides slide/page objectId for the target slide. Use an objectId from get_presentation or get_presentation_outline; do not pass the presentation ID, slide number, layout ID, or a page element ID.
  slide_object_id: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 209. `mcp__codex_apps__google_drive_get_slide_thumbnail`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_slide_thumbnail(args: {
  // Raw Google Slides presentation ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  presentation_id?: string | null;
  // Google Slides URL in the format https://docs.google.com/presentation/d/<PRESENTATION_ID>/... or a raw presentation ID. If you only know the deck title or title keywords, call `search_presentations` first instead of asking the user for a URL.
  presentation_url?: string | null;
  // Slide/page objectId to render as a thumbnail image. Use an objectId from get_presentation or get_presentation_outline; do not pass the presentation ID, slide number, layout ID, or a page element ID.
  slide_object_id: string;
  // Thumbnail size. Defaults to MEDIUM. Use LARGE only when fine layout details matter.
  thumbnail_size?: "LARGE" | "MEDIUM" | "SMALL";
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 210. `mcp__codex_apps__google_drive_get_spreadsheet_cells`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_spreadsheet_cells(args: {
  // Raw Google Sheets CellData field mask fragment. Examples: 'formattedValue,effectiveValue' or 'formattedValue,userEnteredValue,effectiveFormat(textFormat,numberFormat)'. Default: 'userEnteredValue,userEnteredFormat'. Prefer this action over `get_spreadsheet_range` unless you only need the plain cell values; use this action for formatting, formulas, validation, notes, hyperlinks, and other cell metadata.
  cell_fields?: string | null;
  // One or more A1 ranges including the sheet name, e.g. ['Sheet1!A1:C20']. Keep each range within existing sheet bounds.
  ranges: Array<string>;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 211. `mcp__codex_apps__google_drive_get_spreadsheet_comments`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_spreadsheet_comments(args: {
  // When true, include deleted comments and deleted replies in the result.
  include_deleted?: boolean;
  // Maximum comment threads to return on this page. Use the response nextPageToken to continue.
  page_size?: number;
  // Opaque nextPageToken from a previous get_spreadsheet_comments response.
  page_token?: string | null;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 212. `mcp__codex_apps__google_drive_get_spreadsheet_metadata`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_spreadsheet_metadata(args: {
  // When true, return only sheet properties and chart IDs/titles.
  charts_only?: boolean;
  // When true, include per-sheet conditional formatting rules in the response.
  include_conditional_format_rules?: boolean;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 213. `mcp__codex_apps__google_drive_get_spreadsheet_range`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_get_spreadsheet_range(args: {
  // A1/R1C1 range, optional sheet, e.g. A1:B10 or Sheet1!A1:B10. Use `get_spreadsheet_cells` for formatting, formulas, notes, hyperlinks, or metadata.
  range: string;
  // Sheet tab name only (no ! or coordinates). For A1 notation compatibility, quote names with spaces/punctuation (e.g. 'Q1 Plan'). If the name contains a single quote, escape it as two single quotes inside the quoted name (e.g. 'O''Reilly').
  sheet_name: string | null;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
  // The option to render the values, e.g. 'FORMATTED_VALUE', 'UNFORMATTED_VALUE' or 'FORMULA'. Use null for default.
  value_render_option?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA" | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 214. `mcp__codex_apps__google_drive_import_document`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_import_document(args: {
  // Uploaded document file to import through Google Drive's conversion flow. Pass the resolved uploaded file object directly. The source MIME type must match one of the accepted document import MIME types on `source_file.mime_type`. Defaults to creating a native Google Doc; use `upload_file` to store arbitrary raw files without conversion. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  source_file: string;
  // Optional title for the imported Google Docs document. Defaults to the uploaded filename stem.
  title?: string | null;
  // How to store the uploaded file in Drive. Defaults to native_google_docs. `keep_source_file_type` preserves the uploaded file type, but the source file must still be one of the accepted Drive import MIME types for this action.
  upload_mode?: "native_google_docs" | "keep_source_file_type";
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 215. `mcp__codex_apps__google_drive_import_presentation`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_import_presentation(args: {
  // Uploaded presentation file to import through Google Drive's conversion flow. Pass the resolved uploaded file object directly. The source MIME type must match one of the accepted presentation import MIME types on `source_file.mime_type`. Defaults to creating a native Google Slides deck; use `upload_file` to store arbitrary raw files without conversion. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  source_file: string;
  // Optional title for the imported Google Slides presentation. Defaults to the uploaded filename stem.
  title?: string | null;
  // How to store the uploaded file in Drive. Defaults to native_google_slides. `keep_source_file_type` preserves the uploaded file type, but the source file must still be one of the accepted Drive import MIME types for this action.
  upload_mode?: "native_google_slides" | "keep_source_file_type";
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 216. `mcp__codex_apps__google_drive_import_spreadsheet`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_import_spreadsheet(args: {
  // Uploaded spreadsheet file to import through Google Drive's conversion flow. Pass the resolved uploaded file object directly. The source MIME type must match one of the accepted spreadsheet import MIME types on `source_file.mime_type`. Defaults to creating a native Google Sheet; use `upload_file` to store arbitrary raw files without conversion. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  source_file: string;
  // Optional title for the imported spreadsheet. Defaults to the uploaded filename stem.
  title?: string | null;
  // How to store the uploaded spreadsheet in Drive. Defaults to native_google_sheets. `keep_source_file_type` preserves the uploaded file type, but the source file must still be one of the accepted Drive import MIME types for this action.
  upload_mode?: "native_google_sheets" | "keep_source_file_type";
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 217. `mcp__codex_apps__google_drive_list_drives`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_list_drives(args: { [key: string]: unknown; }): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 218. `mcp__codex_apps__google_drive_list_file_revisions`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_list_file_revisions(args: {
  // Google Drive API `fileId` path parameter. Raw file IDs are preferred; Drive/Docs/Sheets/Slides URLs are also accepted.
  fileId: string;
  // Google Drive API `pageSize` query parameter: maximum revisions to request per page.
  pageSize?: number;
  // Google Drive API `pageToken` query parameter: token for continuing a previous revisions.list request.
  pageToken?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 219. `mcp__codex_apps__google_drive_list_folder`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_list_folder(args: {
  // Maximum number of items to scan in the folder. Parameter name is `top_k`.
  top_k?: number;
  // Google Drive folder URL (for example https://drive.google.com/drive/folders/<FOLDER_ID>) or the literal `root` alias for the user's My Drive root folder. Do not pass `my-drive`, raw folder names, or local filesystem paths.
  url: string;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 220. `mcp__codex_apps__google_drive_recent_documents`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_recent_documents(args: {
  // When true, return only files viewed by the authenticated user.
  require_viewed_by_user?: boolean;
  // Number of recent files to return. Parameter name is `top_k`.
  top_k: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 221. `mcp__codex_apps__google_drive_search`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_search(args: {
  // When true, attempt to fetch text content for each result.
  best_effort_fetch?: boolean;
  // Best-effort fetch timeout in seconds when best_effort_fetch=true.
  fetch_ttl?: number;
  // Keyword query for Drive search. Use concise terms like project/file names. This may be empty only when `special_filter_query_str` is provided.
  query: string;
  // When true, keep only files viewed by the authenticated user.
  require_viewed_by_user?: boolean;
  // Optional raw Google Drive API `q` filter expression for advanced filtering.
  special_filter_query_str?: string;
  // Maximum results to return. Parameter name is `topn` (not `top_k`, `max_results`, or `page_size`).
  topn?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 222. `mcp__codex_apps__google_drive_search_spreadsheet_rows`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_search_spreadsheet_rows(args: {
  // Deprecated compatibility alias for return_columns. 1-based column positions relative to the scanned range. Use null unless maintaining an older caller.
  column_numbers?: Array<number> | null;
  // Last spreadsheet column letter to scan, e.g. Z. Required unless range is provided. Choose a finite bound from spreadsheet metadata or known table width. The scan may cover at most 50,000 cells.
  end_column?: string | null;
  // 1-based last row to scan. Required unless range is provided. Choose a finite bound from spreadsheet metadata or user context; this is the scan limit, not the result limit. The scan may cover at most 50,000 cells.
  end_row?: number | null;
  // 1-based spreadsheet row containing column headers. The default behaves like the previous search_spreadsheet_rows action: row 1 when included, otherwise the first scanned row. Use null when the scanned range has no header row.
  header_row?: number | null;
  // When true and header_row is inside the scan, include the header values as the first output row.
  include_header_row?: boolean;
  // Maximum number of scanned columns to return when return_columns is null. Default is 100.
  max_columns?: number;
  // Maximum number of matching non-header rows to return. This limits output only, not the scan. Default is 100.
  max_matching_rows?: number;
  // Deprecated compatibility alias for max_matching_rows. Leave null for new calls.
  max_rows?: number | null;
  // String to search for in any cell within each row.
  query: string;
  // bounded A1 scan range, optional sheet, e.g. A1:F100 or Sheet1!A1:F100. The scan may cover at most 50,000 cells.
  range?: string | null;
  // Optional spreadsheet column letters to include in output, e.g. ['A', 'C', 'F']. They must fall inside the scanned column bounds. Leave null to return the first max_columns scanned columns.
  return_columns?: Array<string> | null;
  // Sheet tab name only (no ! or coordinates). For A1 notation compatibility, quote names with spaces/punctuation (e.g. 'Q1 Plan'). If the name contains a single quote, escape it as two single quotes inside the quoted name (e.g. 'O''Reilly').
  sheet_name: string | null;
  // Raw Google Sheets spreadsheet ID only (for example `1abcDEF...`). Use this when you already have the ID from a prior search result. Do not pass a full URL here.
  spreadsheet_id?: string | null;
  // Google Sheets spreadsheet URL in the format https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/... or a raw spreadsheet ID. If you only know the spreadsheet title or title keywords, call `search_spreadsheets` first instead of asking the user for a URL.
  spreadsheet_url?: string | null;
  // First spreadsheet column letter to scan, e.g. A. Usually A when scanning the visible table.
  start_column?: string;
  // 1-based first row to scan. Usually 1 when the header is in the first row.
  start_row?: number;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 223. `mcp__codex_apps__google_drive_share_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_share_file(args: {
  // Share with anyone in the Google Workspace domain.
  anyone_at_company?: boolean;
  // Share permission level to grant. Use `reader` for read-only access, `writer` to allow edits, `commenter` for comment-only access, or `owner` only when the API path supports ownership transfer.
  permission: "reader" | "writer" | "commenter" | "owner";
  // When sharing with anyone_at_company, whether the file is discoverable in search.
  show_in_search?: boolean;
  // Google Drive file URL to share. Folder URLs are not accepted for this action.
  url: string;
  // Specific user email to share with. Provide this or set anyone_at_company=true.
  user_email?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 224. `mcp__codex_apps__google_drive_update_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_update_file(args: {
  // Optional Google Drive API `addParents` query parameter: comma-separated parent folder IDs to add. For moving a file, set this to the destination folder ID.
  addParents?: string | null;
  // Google Drive API `fileId` path parameter. Raw file IDs are preferred; Drive/Docs/Sheets/Slides URLs are also accepted.
  fileId: string;
  // Optional connector file reference whose bytes should replace the existing raw Drive file content. Leave null for a metadata-only rename or move. Do not pass raw local file paths or string URLs. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  file_uri?: string;
  // Optional MIME type for the replacement bytes. Leave null to use the MIME type from file_uri, or application/octet-stream if file_uri does not include one. Do not use Google Workspace MIME types such as application/vnd.google-apps.document.
  mime_type?: string | null;
  // Optional Google Drive file name. Use this to rename an existing Drive file. Leave null when only changing parents.
  name?: string | null;
  // Optional Google Drive API `removeParents` query parameter: comma-separated parent folder IDs to remove. For moving a file, set this to the current/source parent folder ID.
  removeParents?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 225. `mcp__codex_apps__google_drive_upload_file`

Search and work with files from Google Drive, Docs, Sheets, and Slides.

```ts
declare const tools: { mcp__codex_apps__google_drive_upload_file(args: {
  // Optional destination file name including extension. Leave null to use the name from file_uri.
  file_name?: string | null;
  // Required file reference for the bytes to upload. Pass the `file_uri` object returned by another connector or generated by the runtime; if you provide it manually, send the same structured object/dictionary shape rather than base64 content. Do not pass raw local file paths or string URLs. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  file_uri: string;
  // Optional MIME type for the Drive file. Leave null to use the MIME type from file_uri.
  mime_type?: string | null;
  // Optional destination Google Drive folder ID. Leave null to upload to My Drive/root. Do not pass folder URLs, folder names, `root`, or local filesystem paths.
  parent_folder_id?: string | null;
}): Promise<CallToolResult<{ result: unknown; }>>; };
```

## 226. `mcp__codex_apps__hotline_get_local_hotline`

Look up local hotline information for the user based on country inferred from the conversation. You must use this tool before providing helpline information; do not guess.

```ts
declare const tools: { mcp__codex_apps__hotline_get_local_hotline(args: {}): Promise<CallToolResult>; };
```

## 227. `mcp__codex_apps__plugin_management_get_app_permissions`

Use Plugin Management, not named plugin tools, for plugin permissions/removal. In Codex, use plugin_management.uninstall_plugin for Codex plugins; uninstall_app is only for ChatGPT plugins/connector links. Clarify ambiguous matches using exact IDs. Route what a named plugin may read/write/do or ask first, and named connector/app requests with approval labels (Always ask, Any changes, Important actions, Never ask, Use my default), even without plugin/permission wording. Call the matching permission or uninstall tool for a clear target/mode or global/default change. Ask without calling for missing/broad targets (Google), vague/conflicting modes, risky removal, or delegated choice. For disable, explain it is unsupported and make no call. Exclude install/connect/how-to/undo, OAuth/admin scopes, npm/Chrome/code plugins, and ordinary use. Complete all actions; report only confirmed results.

```ts
declare const tools: { mcp__codex_apps__plugin_management_get_app_permissions(args: {
  // ChatGPT plugin reference to inspect. May be a plugin id, connector id, platform slug, or unambiguous user-facing plugin name. It must identify one plugin; never pass all, global, Google, or another broad/generic target.
  app_id: string;
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 228. `mcp__codex_apps__plugin_management_get_plugin_dependencies`

Use Plugin Management, not named plugin tools, for plugin permissions/removal. In Codex, use plugin_management.uninstall_plugin for Codex plugins; uninstall_app is only for ChatGPT plugins/connector links. Clarify ambiguous matches using exact IDs. Route what a named plugin may read/write/do or ask first, and named connector/app requests with approval labels (Always ask, Any changes, Important actions, Never ask, Use my default), even without plugin/permission wording. Call the matching permission or uninstall tool for a clear target/mode or global/default change. Ask without calling for missing/broad targets (Google), vague/conflicting modes, risky removal, or delegated choice. For disable, explain it is unsupported and make no call. Exclude install/connect/how-to/undo, OAuth/admin scopes, npm/Chrome/code plugins, and ordinary use. Complete all actions; report only confirmed results.

```ts
declare const tools: { mcp__codex_apps__plugin_management_get_plugin_dependencies(args: {
  // Exact backend plugin id or exact name@backend-catalog reference whose manifest dependencies should be resolved. Use a value such as data-analytics@openai-curated; never pass a bare/fuzzy plugin name or a Codex-local alias such as openai-curated-remote.
  plugin_reference: string;
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 229. `mcp__codex_apps__plugin_management_uninstall_app`

Use Plugin Management, not named plugin tools, for plugin permissions/removal. In Codex, use plugin_management.uninstall_plugin for Codex plugins; uninstall_app is only for ChatGPT plugins/connector links. Clarify ambiguous matches using exact IDs. Route what a named plugin may read/write/do or ask first, and named connector/app requests with approval labels (Always ask, Any changes, Important actions, Never ask, Use my default), even without plugin/permission wording. Call the matching permission or uninstall tool for a clear target/mode or global/default change. Ask without calling for missing/broad targets (Google), vague/conflicting modes, risky removal, or delegated choice. For disable, explain it is unsupported and make no call. Exclude install/connect/how-to/undo, OAuth/admin scopes, npm/Chrome/code plugins, and ordinary use. Complete all actions; report only confirmed results.

```ts
declare const tools: { mcp__codex_apps__plugin_management_uninstall_app(args: {
  // Exact, user-approved ChatGPT plugin references to uninstall. Each item may be a plugin id, connector id, platform slug, or unambiguous user-facing name. Never pass Google or another broad provider, all/risky plugins, or a target chosen by the assistant.
  app_ids: Array<string>;
  // Optional user-visible reason for uninstalling the plugin.
  reason?: string | null;
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 230. `mcp__codex_apps__plugin_management_update_app_permissions`

Use Plugin Management, not named plugin tools, for plugin permissions/removal. In Codex, use plugin_management.uninstall_plugin for Codex plugins; uninstall_app is only for ChatGPT plugins/connector links. Clarify ambiguous matches using exact IDs. Route what a named plugin may read/write/do or ask first, and named connector/app requests with approval labels (Always ask, Any changes, Important actions, Never ask, Use my default), even without plugin/permission wording. Call the matching permission or uninstall tool for a clear target/mode or global/default change. Ask without calling for missing/broad targets (Google), vague/conflicting modes, risky removal, or delegated choice. For disable, explain it is unsupported and make no call. Exclude install/connect/how-to/undo, OAuth/admin scopes, npm/Chrome/code plugins, and ordinary use. Complete all actions; report only confirmed results.

```ts
declare const tools: { mcp__codex_apps__plugin_management_update_app_permissions(args: {
  // Optional ChatGPT plugin identifier. Required for app_permissions updates; omit for global_permissions-only updates. May be a plugin id, connector id, platform slug, or unambiguous user-facing plugin name. Never pass Google or another broad/generic target.
  app_id?: string | null;
  // Optional user-visible reason for changing permissions.
  reason?: string | null;
  // Permission updates to apply. A call may contain global_permissions, app_permissions, or both; app_permissions requires app_id.
  updates: {
  // Plugin-specific permission updates to apply.
  app_permissions?: Array<{
  // Permission setting to update. This field is optional; omit it unless needed. If provided, use permission_mode.
  setting?: "permission_mode";
  // New value for the plugin-specific permission setting. Options: inherit (UI label: Use default or follow global; clear this plugin's override), always_ask (UI label: Always ask; ask before reading or making changes with this plugin), ask_before_writes (UI label: Allow read actions; read without asking but ask before making changes with this plugin), review_important_actions (UI label: Allow low-risk actions; automatically approve low-risk actions with this plugin but may deny actions involving sensitive information), and full_access (UI label: Allow all actions; read or take action with this plugin without asking; elevated risk).
  value: "inherit" | "always_ask" | "ask_before_writes" | "review_important_actions" | "full_access";
}> | null;
  // Global default permission updates to apply.
  global_permissions?: Array<{
  // Permission setting to update. This field is optional; omit it unless needed. If provided, use permission_mode.
  setting?: "permission_mode";
  // New value for the global permission setting. Options: always_ask (UI label: Always ask; ask before reading or making changes), ask_before_writes (UI label: Allow read actions; read without asking but ask before making changes), review_important_actions (UI label: Allow low-risk actions; automatically approve low-risk actions but may deny actions involving sensitive information), and full_access (UI label: Allow all actions; read or take action without asking; elevated risk and may be unavailable globally when the feature gate hides it).
  value: "always_ask" | "ask_before_writes" | "review_important_actions" | "full_access";
}> | null;
};
}): Promise<CallToolResult<{
  // The server's response to a tool call.
  result: { _meta?: { [key: string]: unknown; } | null; content: Array<{ _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; text: string; type: "text"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "image"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; data: string; mimeType: string; type: "audio"; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; description?: string | null; icons?: Array<{ mimeType?: string | null; sizes?: Array<string> | null; src: string; }> | null; mimeType?: string | null; name: string; size?: number | null; title?: string | null; type: "resource_link"; uri: string; } | { _meta?: { [key: string]: unknown; } | null; annotations?: { audience?: Array<"user" | "assistant"> | null; priority?: number | null; } | null; resource: { _meta?: { [key: string]: unknown; } | null; mimeType?: string | null; text: string; uri: string; } | { _meta?: { [key: string]: unknown; } | null; blob: string; mimeType?: string | null; uri: string; }; type: "resource"; }>; isError?: boolean; structuredContent?: { [key: string]: unknown; } | null; };
}>>; };
```

## 231. `mcp__codex_apps__sites_add_custom_domain`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_add_custom_domain(args: {
  // Bare custom hostname, such as www.example.com
  hostname: string;
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // A record targets to use when the custom hostname is a zone apex.
  apex_proxy_ipv4_targets: Array<string>;
  // CNAME target to use for custom subdomains.
  cname_target: string | null;
  created_at: string;
  hostname: string;
  id: string;
  last_error: string | null;
  project_id: string;
  provider_status: string | null;
  ssl_status: string | null;
  status: "pending" | "active" | "failed";
  updated_at: string;
  validation_records: Array<{ name?: string | null; record_type?: string | null; value?: string | null; }>;
  worker_name: string;
}; }>>; };
```

## 232. `mcp__codex_apps__sites_create_site`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_create_site(args: {
  // Optional user-facing description of the site.
  description?: string | null;
  // Unique URL slug for the site. Use at least 5 characters, starting with a lowercase ASCII letter and containing only lowercase ASCII letters, digits, and single hyphens. Do not use leading, trailing, or consecutive hyphens, a reserved Sites slug, or a slug already used by another site.
  slug: string;
  // User-facing title for the site.
  title: string;
}): Promise<CallToolResult<{ result: {
  auth_client_id: string | null;
  created_at: string;
  current_live_url: string | null;
  current_preview_url: string | null;
  description: string | null;
  disabled_by?: "workspace_admin" | "openai" | null;
  // Opaque site project ID. Pass this exact value as project_id.
  id: string;
  latest_version_number: number;
  screenshot_url: string | null;
  slug: string;
  // Short-lived source repository write credential when requested.
  source_repository_credential?: {
  // AppGen AppRepository id.
  app_repository_id: string;
  // Git authentication mode for the token.
  auth_mode: string;
  // Default branch the client should push.
  branch: string;
  // Source repository provider.
  provider: string;
  // Git remote URL without embedded credentials.
  remote_url: string;
  // Provider repository name bound to the AppGen project.
  repository: string;
  // Short-lived repo-scoped Git token.
  token: string;
  // Token expiration timestamp when provided.
  token_expires_at: string;
} | null;
  status: "active" | "archived" | "suspended";
  title: string;
  updated_at: string;
}; }>>; };
```

## 233. `mcp__codex_apps__sites_create_source_repository_w_7e7b8ba6ef73`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_create_source_repository_w_7e7b8ba6ef73(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // AppGen AppRepository id.
  app_repository_id: string;
  // Git authentication mode for the token.
  auth_mode: string;
  // Default branch the client should push.
  branch: string;
  // Source repository provider.
  provider: string;
  // Git remote URL without embedded credentials.
  remote_url: string;
  // Provider repository name bound to the AppGen project.
  repository: string;
  // Short-lived repo-scoped Git token.
  token: string;
  // Token expiration timestamp when provided.
  token_expires_at: string;
}; }>>; };
```

## 234. `mcp__codex_apps__sites_deploy_private_site_version`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_deploy_private_site_version(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
  // Exact opaque saved version ID returned as id by save_site_version, list_site_versions, or get_site_version. Copy it verbatim as version_id; never substitute a project or deployment ID.
  version_id: string;
}): Promise<CallToolResult<{ result: {
  env_set_revision: number;
  failure_message: string | null;
  // Opaque deployment ID. Pass this exact value as deployment_id.
  id: string;
  // Opaque site project ID. Pass this exact value as project_id.
  project_id: string;
  provider_deployment_id: string | null;
  screenshot_asset_pointer?: string | null;
  status: "pending" | "building" | "publishing" | "succeeded" | "failed";
  title: string;
  type: "preview" | "publish";
  updated_at: string;
  url: string | null;
  // Opaque saved version ID. Pass this exact value as version_id.
  version_id: string;
}; }>>; };
```

## 235. `mcp__codex_apps__sites_deploy_site_version`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_deploy_site_version(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
  // Exact opaque saved version ID returned as id by save_site_version, list_site_versions, or get_site_version. Copy it verbatim as version_id; never substitute a project or deployment ID.
  version_id: string;
}): Promise<CallToolResult<{ result: {
  env_set_revision: number;
  failure_message: string | null;
  // Opaque deployment ID. Pass this exact value as deployment_id.
  id: string;
  // Opaque site project ID. Pass this exact value as project_id.
  project_id: string;
  provider_deployment_id: string | null;
  screenshot_asset_pointer?: string | null;
  status: "pending" | "building" | "publishing" | "succeeded" | "failed";
  title: string;
  type: "preview" | "publish";
  updated_at: string;
  url: string | null;
  // Opaque saved version ID. Pass this exact value as version_id.
  version_id: string;
}; }>>; };
```

## 236. `mcp__codex_apps__sites_generate_siwc_bypass_token`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_generate_siwc_bypass_token(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  project_id: string;
  // Bearer token accepted by Sites dispatch in the OAI-Sites-Authorization header.
  siwc_bypass_bearer_token: string;
}; }>>; };
```

## 237. `mcp__codex_apps__sites_get_deployment_status`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_get_deployment_status(args: {
  // Deployment ID returned for the supplied project_id and version_id. Do not mix identifiers from different deployment flows.
  deployment_id: string;
  // ID of the site from the same deployment flow as version_id and deployment_id.
  project_id: string;
  // Saved version ID from the same deployment flow as project_id and deployment_id.
  version_id: string;
}): Promise<CallToolResult<{ result: {
  env_set_revision: number;
  failure_message: string | null;
  // Opaque deployment ID. Pass this exact value as deployment_id.
  id: string;
  // Opaque site project ID. Pass this exact value as project_id.
  project_id: string;
  provider_deployment_id: string | null;
  screenshot_asset_pointer?: string | null;
  status: "pending" | "building" | "publishing" | "succeeded" | "failed";
  title: string;
  type: "preview" | "publish";
  updated_at: string;
  url: string | null;
  // Opaque saved version ID. Pass this exact value as version_id.
  version_id: string;
}; }>>; };
```

## 238. `mcp__codex_apps__sites_get_environment_variables`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_get_environment_variables(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: { entries: Array<{ is_secret?: boolean; key: string; type?: "envvar"; value: string | null; }>; project_id: string; revision: number; updated_at: string | null; }; }>>; };
```

## 239. `mcp__codex_apps__sites_get_site`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_get_site(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // Workspace access mode for this Sites project, or null for non-workspace apps.
  access_mode?: "public" | "admins_only" | "workspace_all" | "custom" | null;
  // Workspace access policy for this Appgen project, or null for non-workspace apps.
  access_policy?: {
  // Access mode for the app.
  access_mode: "public" | "admins_only" | "workspace_all" | "custom";
  // Account user ID allowlist for the app.
  allowed_account_user_ids: Array<string>;
  // Group details resolved from allowed workspace and tenant group IDs.
  allowed_groups: Array<{
  // Group ID to use in an Appgen access policy.
  id: string;
  // Group display name.
  name: string;
  // Total number of members in the group.
  size: number;
}>;
  // Tenant group ID allowlist for the app.
  allowed_tenant_group_ids: Array<string>;
  // User details resolved from allowed_account_user_ids.
  allowed_users: Array<{
  // Account user ID for the allowed user.
  account_user_id: string;
  // Email address for the allowed user, when available.
  email?: string | null;
  // Display name for the allowed user, when available.
  name?: string | null;
}>;
  // Workspace group ID allowlist for the app.
  allowed_workspace_group_ids: Array<string>;
  // Appgen project ID
  project_id: string;
  // Monotonic access policy revision.
  revision: number;
  // Access policy update timestamp.
  updated_at: string;
} | null;
  auth_client_id: string | null;
  // Access modes the current user may set. Omitted when the capability is unavailable.
  available_access_modes?: Array<"public" | "workspace_all" | "custom"> | null;
  created_at: string;
  current_live_url: string | null;
  current_preview_url: string | null;
  description: string | null;
  disabled_by?: "workspace_admin" | "openai" | null;
  // Opaque site project ID. Pass this exact value as project_id.
  id: string;
  latest_version_number: number;
  screenshot_url: string | null;
  // Bearer token accepted by Sites dispatch in the OAI-Sites-Authorization header.
  siwc_bypass_bearer_token?: string | null;
  slug: string;
  // Short-lived source repository write credential when requested.
  source_repository_credential?: {
  // AppGen AppRepository id.
  app_repository_id: string;
  // Git authentication mode for the token.
  auth_mode: string;
  // Default branch the client should push.
  branch: string;
  // Source repository provider.
  provider: string;
  // Git remote URL without embedded credentials.
  remote_url: string;
  // Provider repository name bound to the AppGen project.
  repository: string;
  // Short-lived repo-scoped Git token.
  token: string;
  // Token expiration timestamp when provided.
  token_expires_at: string;
} | null;
  status: "active" | "archived" | "suspended";
  title: string;
  updated_at: string;
}; }>>; };
```

## 240. `mcp__codex_apps__sites_get_site_version`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_get_site_version(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
  // Exact opaque saved version ID returned as id by save_site_version, list_site_versions, or get_site_version. Copy it verbatim as version_id; never substitute a project or deployment ID.
  version_id: string;
}): Promise<CallToolResult<{ result: {
  archive_storage?: { archive_format: string; content_hash: string; file_count?: number | null; sediment_file_id: string; size_bytes?: number | null; } | null;
  // Opaque saved version ID. Pass this exact value as version_id.
  id: string;
  // Opaque site project ID. Pass this exact value as project_id.
  project_id: string;
  screenshot_url?: string | null;
  source: { commit_sha: string; };
  version_number: number;
}; }>>; };
```

## 241. `mcp__codex_apps__sites_list_custom_domains`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_list_custom_domains(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: { items: Array<{
  // A record targets to use when the custom hostname is a zone apex.
  apex_proxy_ipv4_targets: Array<string>;
  // CNAME target to use for custom subdomains.
  cname_target: string | null;
  created_at: string;
  hostname: string;
  id: string;
  last_error: string | null;
  project_id: string;
  provider_status: string | null;
  ssl_status: string | null;
  status: "pending" | "active" | "failed";
  updated_at: string;
  validation_records: Array<{ name?: string | null; record_type?: string | null; value?: string | null; }>;
  worker_name: string;
}>; }; }>>; };
```

## 242. `mcp__codex_apps__sites_list_site_versions`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_list_site_versions(args: {
  // Cursor returned by a previous list_site_versions call.
  cursor?: string | null;
  // Maximum number of site versions to return.
  limit?: number;
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // Cursor for the next page, if any
  cursor?: string | null;
  // Appgen project versions in this page
  items: Array<{
  archive_storage?: { archive_format: string; content_hash: string; file_count?: number | null; sediment_file_id: string; size_bytes?: number | null; } | null;
  // Opaque saved version ID. Pass this exact value as version_id.
  id: string;
  // Opaque site project ID. Pass this exact value as project_id.
  project_id: string;
  screenshot_url?: string | null;
  source: { commit_sha: string; };
  version_number: number;
}>;
}; }>>; };
```

## 243. `mcp__codex_apps__sites_list_sites`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_list_sites(args: {
  // Cursor returned by a previous list_sites call.
  cursor?: string | null;
  // Maximum number of sites to return.
  limit: number;
}): Promise<CallToolResult<{ result: {
  // Cursor for the next page, if any
  cursor?: string | null;
  // Appgen projects in page
  items: Array<{
  // Workspace access mode for this Sites project, or null for non-workspace apps.
  access_mode?: "public" | "admins_only" | "workspace_all" | "custom" | null;
  // Workspace access policy for this Appgen project, or null for non-workspace apps.
  access_policy?: {
  // Access mode for the app.
  access_mode: "public" | "admins_only" | "workspace_all" | "custom";
  // Account user ID allowlist for the app.
  allowed_account_user_ids: Array<string>;
  // Group details resolved from allowed workspace and tenant group IDs.
  allowed_groups: Array<{
  // Group ID to use in an Appgen access policy.
  id: string;
  // Group display name.
  name: string;
  // Total number of members in the group.
  size: number;
}>;
  // Tenant group ID allowlist for the app.
  allowed_tenant_group_ids: Array<string>;
  // User details resolved from allowed_account_user_ids.
  allowed_users: Array<{
  // Account user ID for the allowed user.
  account_user_id: string;
  // Email address for the allowed user, when available.
  email?: string | null;
  // Display name for the allowed user, when available.
  name?: string | null;
}>;
  // Workspace group ID allowlist for the app.
  allowed_workspace_group_ids: Array<string>;
  // Appgen project ID
  project_id: string;
  // Monotonic access policy revision.
  revision: number;
  // Access policy update timestamp.
  updated_at: string;
} | null;
  auth_client_id: string | null;
  // Access modes the current user may set. Omitted when the capability is unavailable.
  available_access_modes?: Array<"public" | "workspace_all" | "custom"> | null;
  created_at: string;
  current_live_url: string | null;
  current_preview_url: string | null;
  description: string | null;
  disabled_by?: "workspace_admin" | "openai" | null;
  // Opaque site project ID. Pass this exact value as project_id.
  id: string;
  latest_version_number: number;
  screenshot_url: string | null;
  slug: string;
  // Short-lived source repository write credential when requested.
  source_repository_credential?: {
  // AppGen AppRepository id.
  app_repository_id: string;
  // Git authentication mode for the token.
  auth_mode: string;
  // Default branch the client should push.
  branch: string;
  // Source repository provider.
  provider: string;
  // Git remote URL without embedded credentials.
  remote_url: string;
  // Provider repository name bound to the AppGen project.
  repository: string;
  // Short-lived repo-scoped Git token.
  token: string;
  // Token expiration timestamp when provided.
  token_expires_at: string;
} | null;
  status: "active" | "archived" | "suspended";
  title: string;
  updated_at: string;
}>;
}; }>>; };
```

## 244. `mcp__codex_apps__sites_refresh_custom_domain_status`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_refresh_custom_domain_status(args: {
  // Custom domain ID
  custom_domain_id: string;
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // A record targets to use when the custom hostname is a zone apex.
  apex_proxy_ipv4_targets: Array<string>;
  // CNAME target to use for custom subdomains.
  cname_target: string | null;
  created_at: string;
  hostname: string;
  id: string;
  last_error: string | null;
  project_id: string;
  provider_status: string | null;
  ssl_status: string | null;
  status: "pending" | "active" | "failed";
  updated_at: string;
  validation_records: Array<{ name?: string | null; record_type?: string | null; value?: string | null; }>;
  worker_name: string;
}; }>>; };
```

## 245. `mcp__codex_apps__sites_remove_custom_domain`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_remove_custom_domain(args: {
  // Custom domain ID
  custom_domain_id: string;
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // A record targets to use when the custom hostname is a zone apex.
  apex_proxy_ipv4_targets: Array<string>;
  // CNAME target to use for custom subdomains.
  cname_target: string | null;
  created_at: string;
  hostname: string;
  id: string;
  last_error: string | null;
  project_id: string;
  provider_status: string | null;
  ssl_status: string | null;
  status: "pending" | "active" | "failed";
  updated_at: string;
  validation_records: Array<{ name?: string | null; record_type?: string | null; value?: string | null; }>;
  worker_name: string;
}; }>>; };
```

## 246. `mcp__codex_apps__sites_save_site_version`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_save_site_version(args: {
  // Optional site build tar archive from the source identified by commit_sha. It must contain a supported OpenNext or vinext entrypoint and a valid .openai/hosting.json. This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.
  archive?: string;
  // Git commit SHA for the current HEAD of the site's configured source branch. It must identify the source used to build the archive.
  commit_sha: string;
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  archive_storage?: { archive_format: string; content_hash: string; file_count?: number | null; sediment_file_id: string; size_bytes?: number | null; } | null;
  // Opaque saved version ID. Pass this exact value as version_id.
  id: string;
  // Opaque site project ID. Pass this exact value as project_id.
  project_id: string;
  screenshot_url?: string | null;
  source: { commit_sha: string; };
  version_number: number;
}; }>>; };
```

## 247. `mcp__codex_apps__sites_update_environment_variables`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_update_environment_variables(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
  // Case-sensitive environment keys to remove. Do not repeat keys or include a key also present in set_values. Omit or pass an empty list to preserve other keys.
  remove?: Array<string> | null;
  // Environment entries to create or replace. Keys are case-sensitive and must match the application. Do not repeat keys or include a key also listed in remove. Mark sensitive values as secrets.
  set_values: Array<{
  // Set true for sensitive values so they are not returned in plaintext.
  is_secret?: boolean;
  // Required non-empty, case-sensitive environment variable name.
  key: string;
  type?: "envvar";
  value: string;
}>;
}): Promise<CallToolResult<{ result: { entries: Array<{ is_secret?: boolean; key: string; type?: "envvar"; value: string | null; }>; project_id: string; revision: number; updated_at: string | null; }; }>>; };
```

## 248. `mcp__codex_apps__sites_update_site_access`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_update_site_access(args: {
  // Required access mode for the site: public grants anyone with the URL; workspace_all grants all active workspace users; custom uses the supplied user and group allowlists.
  access_mode: "public" | "workspace_all" | "custom";
  // Tenant group ID allowlist. IDs must come from list_available_access_groups and belong to the tenant linked to the site workspace. Omit to preserve the existing allowlist; pass an empty list to clear it.
  allowed_tenant_group_ids?: Array<string> | null;
  // User email allowlist. Emails must belong to active users in the site workspace. Omit to preserve the existing allowlist; pass an empty list to clear non-owner users.
  allowed_user_emails?: Array<string> | null;
  // Workspace group ID allowlist. IDs must come from list_available_access_groups and belong to the site workspace. Omit to preserve the existing allowlist; pass an empty list to clear it.
  allowed_workspace_group_ids?: Array<string> | null;
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
}): Promise<CallToolResult<{ result: {
  // Access mode for the app.
  access_mode: "public" | "admins_only" | "workspace_all" | "custom";
  // Account user ID allowlist for the app.
  allowed_account_user_ids: Array<string>;
  // Group details resolved from allowed workspace and tenant group IDs.
  allowed_groups: Array<{
  // Group ID to use in an Appgen access policy.
  id: string;
  // Group display name.
  name: string;
  // Total number of members in the group.
  size: number;
}>;
  // Tenant group ID allowlist for the app.
  allowed_tenant_group_ids: Array<string>;
  // User details resolved from allowed_account_user_ids.
  allowed_users: Array<{
  // Account user ID for the allowed user.
  account_user_id: string;
  // Email address for the allowed user, when available.
  email?: string | null;
  // Display name for the allowed user, when available.
  name?: string | null;
}>;
  // Workspace group ID allowlist for the app.
  allowed_workspace_group_ids: Array<string>;
  // Appgen project ID
  project_id: string;
  // Monotonic access policy revision.
  revision: number;
  // Access policy update timestamp.
  updated_at: string;
}; }>>; };
```

## 249. `mcp__codex_apps__sites_update_site_metadata`

Use Sites to build, save, deploy, and inspect websites such as landing pages, portfolios, dashboards, portals, trackers, hubs, games, and internal tools. Always use Sites when .openai/hosting.json exists. Use Sites skills for local implementation, validation, source preparation, and artifact packaging. Use this connector for site creation, runtime environment variables, versions, production deployments, and access controls. Read .openai/hosting.json before creating a site and reuse its project_id when present. Treat Sites IDs and cursors as opaque: copy them exactly from .openai/hosting.json or Sites responses as applicable, and never invent, reformat, derive, or substitute them. Never call create_site more than once for the same local site. Push the exact source state before saving a version. commit_sha must identify that pushed state, and any archive must be built from it. Deploy only saved versions; every Sites deployment URL is production. Inspect deployment status when the initial result is non-terminal or the user asks for progress. Unless the user asks for local-only work or a saved version without deployment, finish deployable site work with a production deployment.

```ts
declare const tools: { mcp__codex_apps__sites_update_site_metadata(args: {
  // Exact opaque site project ID. Copy it verbatim from .openai/hosting.json's project_id or the id field returned by create_site, list_sites, or get_site. Never invent, modify, or substitute another identifier.
  project_id: string;
  // New user-facing site title.
  title: string;
}): Promise<CallToolResult<{ result: {
  auth_client_id: string | null;
  created_at: string;
  current_live_url: string | null;
  current_preview_url: string | null;
  description: string | null;
  disabled_by?: "workspace_admin" | "openai" | null;
  // Opaque site project ID. Pass this exact value as project_id.
  id: string;
  latest_version_number: number;
  screenshot_url: string | null;
  slug: string;
  status: "active" | "archived" | "suspended";
  title: string;
  updated_at: string;
}; }>>; };
```

## 250. `mcp__codex_apps__vercel_add_toolbar_reaction`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_add_toolbar_reaction(args: {
  // The emoji to add as a reaction (e.g. 👍)
  emoji: string;
  // The message ID to react to
  messageId: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // The thread ID containing the message
  threadId: string;
}): Promise<CallToolResult>; };
```

## 251. `mcp__codex_apps__vercel_change_toolbar_thread_resolve_status`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_change_toolbar_thread_resolve_status(args: {
  // Set to true to resolve the thread, false to unresolve it
  resolved: boolean;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // The thread ID to update
  threadId: string;
}): Promise<CallToolResult>; };
```

## 252. `mcp__codex_apps__vercel_check_domain_availability_and_price`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_check_domain_availability_and_price(args: {
  // Array of domain names to check availability for (e.g., ["example.com", "test.org"])
  names: Array<string>;
}): Promise<CallToolResult>; };
```

## 253. `mcp__codex_apps__vercel_deploy_to_vercel`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_deploy_to_vercel(args: { [key: string]: unknown; }): Promise<CallToolResult>; };
```

## 254. `mcp__codex_apps__vercel_edit_toolbar_message`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_edit_toolbar_message(args: {
  // The updated message content in markdown format
  markdown: string;
  // The message ID to edit
  messageId: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // The thread ID containing the message
  threadId: string;
}): Promise<CallToolResult>; };
```

## 255. `mcp__codex_apps__vercel_get_access_to_vercel_url`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_access_to_vercel_url(args: {
  // The full URL of the Vercel deployment (e.g. "https://myapp.vercel.app").
  url: string;
}): Promise<CallToolResult>; };
```

## 256. `mcp__codex_apps__vercel_get_agent_run`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_agent_run(args: {
  // Agent run environment, usually "production" or "preview". Defaults to "production".
  environment?: string;
  // Start time as ISO 8601, Unix seconds, Unix milliseconds, or a relative duration like "12h". Must be used with to.
  from?: string;
  // Preset time range. Ignored when both from and to are provided. Defaults to the dashboard endpoint default.
  period?: "5m" | "15m" | "1h" | "6h" | "12h" | "1d" | "3d" | "7d" | "14d" | "30d" | "90d";
  // The project ID to get the deployment events for. Alternatively the project slug can be used.
  // Project IDs start with "prj_".
  // If you do not know the project ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the projectId
  // - Use the `list_projects` tool
  projectId: string;
  // The Agent Run ID to inspect.
  runId: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time as ISO 8601, Unix seconds, Unix milliseconds, a relative duration like "1h", or "now". Must be used with from.
  to?: string;
}): Promise<CallToolResult>; };
```

## 257. `mcp__codex_apps__vercel_get_agent_run_trace`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_agent_run_trace(args: {
  // Agent run environment, usually "production" or "preview". Defaults to "production".
  environment?: string;
  // Start time as ISO 8601, Unix seconds, Unix milliseconds, or a relative duration like "12h". Must be used with to.
  from?: string;
  // Maximum length for individual string fields in the returned trace. Defaults to 8000; use 0 to disable truncation.
  maxFieldLength?: number;
  // Preset time range. Ignored when both from and to are provided. Defaults to the dashboard endpoint default.
  period?: "5m" | "15m" | "1h" | "6h" | "12h" | "1d" | "3d" | "7d" | "14d" | "30d" | "90d";
  // The project ID to get the deployment events for. Alternatively the project slug can be used.
  // Project IDs start with "prj_".
  // If you do not know the project ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the projectId
  // - Use the `list_projects` tool
  projectId: string;
  // The Agent Run ID to inspect.
  runId: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time as ISO 8601, Unix seconds, Unix milliseconds, a relative duration like "1h", or "now". Must be used with from.
  to?: string;
}): Promise<CallToolResult>; };
```

## 258. `mcp__codex_apps__vercel_get_deployment`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_deployment(args: {
  // The unique identifier or hostname of the deployment.
  idOrUrl: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
}): Promise<CallToolResult>; };
```

## 259. `mcp__codex_apps__vercel_get_deployment_build_logs`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_deployment_build_logs(args: {
  // Filter to a specific build ID (bld_...) for multi-build deployments.
  buildId?: string;
  // Which end of the build log to return. "tail" (default) returns the most recent lines, where build errors appear. "head" returns the earliest lines.
  direction?: "tail" | "head";
  // Return only error, stderr, exit, and fatal events.
  errorsOnly?: boolean;
  // The unique identifier or hostname of the deployment.
  idOrUrl: string;
  // Maximum number of log lines to return. Defaults is 100.
  limit?: number;
  // Start time - ISO date or relative (e.g. "1h", "30m").
  since?: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time - ISO date or relative.
  until?: string;
}): Promise<CallToolResult>; };
```

## 260. `mcp__codex_apps__vercel_get_project`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_project(args: {
  // The project ID to get the deployment events for. Alternatively the project slug can be used.
  // Project IDs start with "prj_".
  // If you do not know the project ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the projectId
  // - Use the `list_projects` tool
  projectId: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
}): Promise<CallToolResult>; };
```

## 261. `mcp__codex_apps__vercel_get_runtime_errors`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_runtime_errors(args: {
  // The project ID to get runtime errors for.
  projectId: string;
  // Comma-separated route paths to filter by (e.g. "/api/checkout").
  routes?: string;
  // Start time - ISO date or relative (e.g. "1h", "7d"). Defaults to 24h ago.
  since?: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time - ISO date or relative.
  until?: string;
}): Promise<CallToolResult>; };
```

## 262. `mcp__codex_apps__vercel_get_runtime_logs`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_runtime_logs(args: {
  // Filter logs to a specific deployment ID or URL.
  deploymentId?: string;
  // Filter by environment: "production" or "preview".
  environment?: "production" | "preview";
  // Return counts grouped by this attribute instead of individual log lines. Use for "how many errors", "status code breakdown", "top paths". Fast even over wide time ranges.
  group_by?: "statusCode" | "requestPath" | "route" | "level" | "source" | "deploymentId" | "branch";
  // Filter by log level(s). Can specify multiple levels.
  level?: Array<"error" | "warning" | "info" | "fatal">;
  // Maximum number of log entries to return. Defaults to 50, max 100.
  limit?: number;
  // The project ID to get runtime logs for.
  projectId: string;
  // Full-text search query to filter logs.
  query?: string;
  // Filter by specific request ID.
  requestId?: string;
  // Start time - ISO format or relative time (e.g., "1h", "30m", "7d"). Defaults to 24 hours ago.
  since?: string;
  // Filter by source type(s). Can specify multiple sources.
  source?: Array<"serverless" | "edge-function" | "edge-middleware" | "static">;
  // Filter by HTTP status code (e.g., "500", "4xx").
  statusCode?: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time - ISO format or relative time. Defaults to now.
  until?: string;
}): Promise<CallToolResult>; };
```

## 263. `mcp__codex_apps__vercel_get_toolbar_thread`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_get_toolbar_thread(args: {
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // The thread ID to retrieve
  threadId: string;
}): Promise<CallToolResult>; };
```

## 264. `mcp__codex_apps__vercel_import_claude_design_from_url`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_import_claude_design_from_url(args: {
  // Suggested title for the imported design.
  title?: string;
  // Public HTTPS URL to the design file. Valid for ~1 hour. Fetched server-side.
  url: string;
}): Promise<CallToolResult>; };
```

## 265. `mcp__codex_apps__vercel_list_agent_run_projects`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_list_agent_run_projects(args: {
  // Agent run environment, usually "production" or "preview". Defaults to "production".
  environment?: string;
  // Start time as ISO 8601, Unix seconds, Unix milliseconds, or a relative duration like "12h". Must be used with to.
  from?: string;
  // Preset time range. Ignored when both from and to are provided. Defaults to the dashboard endpoint default.
  period?: "5m" | "15m" | "1h" | "6h" | "12h" | "1d" | "3d" | "7d" | "14d" | "30d" | "90d";
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time as ISO 8601, Unix seconds, Unix milliseconds, a relative duration like "1h", or "now". Must be used with from.
  to?: string;
}): Promise<CallToolResult>; };
```

## 266. `mcp__codex_apps__vercel_list_agent_runs`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_list_agent_runs(args: {
  // Agent run environment, usually "production" or "preview". Defaults to "production".
  environment?: string;
  // Start time as ISO 8601, Unix seconds, Unix milliseconds, or a relative duration like "12h". Must be used with to.
  from?: string;
  // 1-based page number. Defaults to 1.
  page?: number;
  // Number of runs per page. The dashboard endpoint caps this at 100.
  pageSize?: number;
  // Preset time range. Ignored when both from and to are provided. Defaults to the dashboard endpoint default.
  period?: "5m" | "15m" | "1h" | "6h" | "12h" | "1d" | "3d" | "7d" | "14d" | "30d" | "90d";
  // The project ID to get the deployment events for. Alternatively the project slug can be used.
  // Project IDs start with "prj_".
  // If you do not know the project ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the projectId
  // - Use the `list_projects` tool
  projectId: string;
  // Server-side title search for Agent Runs.
  search?: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // End time as ISO 8601, Unix seconds, Unix milliseconds, a relative duration like "1h", or "now". Must be used with from.
  to?: string;
}): Promise<CallToolResult>; };
```

## 267. `mcp__codex_apps__vercel_list_deployments`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_list_deployments(args: {
  // The project ID to list deployments for.
  projectId: string;
  // Get deployments created after this timestamp.
  since?: number;
  // The team ID to list deployments for.
  teamId: string;
  // Get deployments created before this timestamp.
  until?: number;
}): Promise<CallToolResult>; };
```

## 268. `mcp__codex_apps__vercel_list_projects`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_list_projects(args: {
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
}): Promise<CallToolResult>; };
```

## 269. `mcp__codex_apps__vercel_list_teams`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_list_teams(args: { [key: string]: unknown; }): Promise<CallToolResult>; };
```

## 270. `mcp__codex_apps__vercel_list_toolbar_threads`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_list_toolbar_threads(args: {
  // Filter by branch name
  branch?: string;
  // Maximum number of results to return. Defaults to 20.
  limit?: number;
  // Pagination offset
  offset?: number;
  // Filter by page path (e.g. /docs) or glob (e.g. /docs*)
  page?: string;
  // Filter by project ID
  projectId?: string;
  // Search text in comments
  search?: string;
  // Filter by status. Defaults to unresolved.
  status?: "resolved" | "unresolved";
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
}): Promise<CallToolResult>; };
```

## 271. `mcp__codex_apps__vercel_reply_to_toolbar_thread`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_reply_to_toolbar_thread(args: {
  // The message content in markdown format
  markdown: string;
  // The team ID to get the deployment events for. Alternatively the team slug can be used.
  // Team IDs start with "team_".
  // If you do not know the team ID or slug, it can be found through these mechanism:
  // - Read the file .vercel/project.json if it exists and extract the orgId
  // - Use the `list_teams` tool
  teamId: string;
  // The thread ID to reply to
  threadId: string;
}): Promise<CallToolResult>; };
```

## 272. `mcp__codex_apps__vercel_search_vercel_documentation`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_search_vercel_documentation(args: {
  // Maximum number of tokens to include in the result. Default is 2500.
  tokens?: number;
  // Topic to focus the documentation search on (e.g., 'routing', 'data-fetching').
  topic: string;
}): Promise<CallToolResult>; };
```

## 273. `mcp__codex_apps__vercel_web_fetch_vercel_url`

Provides access to documentation search for a specific hosting and deployment platform and tools to manage its projects and deployments, including listing projects, deployments, build logs, and creating temporary authenticated share URLs or fetching protected deployment URLs. Also supports deploying the current project through the platform’s API, listing teams, and checking domain availability and pricing.

```ts
declare const tools: { mcp__codex_apps__vercel_web_fetch_vercel_url(args: {
  // The full URL of the Vercel deployment including the path (e.g. "https://myapp.vercel.app/my-page").
  url: string;
}): Promise<CallToolResult>; };
```

## 274. `mcp__node_repl__js`

Use `js` to run JavaScript in the persistent Node-backed kernel. When a skill or prompt says to use `node_repl`, call this server's `js` execution tool. Calls default to a 30000 ms (30 seconds) timeout when `timeout_ms` is omitted. The runtime exposes `nodeRepl.cwd`, `nodeRepl.homeDir`, `nodeRepl.tmpDir`, `nodeRepl.requestMeta`, `nodeRepl.setResponseMeta(...)`, and `await nodeRepl.emitImage(...)`. Top-level bindings persist across `js` calls until `js_reset`; do not redeclare existing `const` or `let` names. Reuse existing bindings, use top-level `var` for reusable state that may be assigned again, or choose a fresh descriptive name. Use `js_add_node_module_dir` before `js` when a skill provides an extra package directory, and use dynamic imports like `await import("playwright")` rather than filesystem paths under `./node_modules`.

```ts
declare const tools: { mcp__node_repl__js(args: {
  // JavaScript source to execute in the persistent Node-backed kernel. The code runs with top-level await and can use the `nodeRepl` helpers. Examples: `nodeRepl.write(nodeRepl.cwd)`, `const { chromium } = await import("playwright")`, or `await nodeRepl.emitImage(pngBuffer)`.
  code: string;
  // Optional execution timeout in milliseconds. Defaults to 30000 (30 seconds) when omitted.
  timeout_ms?: number;
  // Short user-facing description of what this code block is doing. Use a few words, for example `Inspect package metadata` or `Render chart preview`.
  title?: string;
}): Promise<CallToolResult>; };
```

## 275. `mcp__node_repl__js_add_node_module_dir`

Use `js` to run JavaScript in the persistent Node-backed kernel. When a skill or prompt says to use `node_repl`, call this server's `js` execution tool. Calls default to a 30000 ms (30 seconds) timeout when `timeout_ms` is omitted. The runtime exposes `nodeRepl.cwd`, `nodeRepl.homeDir`, `nodeRepl.tmpDir`, `nodeRepl.requestMeta`, `nodeRepl.setResponseMeta(...)`, and `await nodeRepl.emitImage(...)`. Top-level bindings persist across `js` calls until `js_reset`; do not redeclare existing `const` or `let` names. Reuse existing bindings, use top-level `var` for reusable state that may be assigned again, or choose a fresh descriptive name. Use `js_add_node_module_dir` before `js` when a skill provides an extra package directory, and use dynamic imports like `await import("playwright")` rather than filesystem paths under `./node_modules`.

```ts
declare const tools: { mcp__node_repl__js_add_node_module_dir(args: {
  // Absolute path to a node_modules directory to add to Node package resolution.
  path: string;
}): Promise<CallToolResult>; };
```

## 276. `mcp__node_repl__js_reset`

Use `js` to run JavaScript in the persistent Node-backed kernel. When a skill or prompt says to use `node_repl`, call this server's `js` execution tool. Calls default to a 30000 ms (30 seconds) timeout when `timeout_ms` is omitted. The runtime exposes `nodeRepl.cwd`, `nodeRepl.homeDir`, `nodeRepl.tmpDir`, `nodeRepl.requestMeta`, `nodeRepl.setResponseMeta(...)`, and `await nodeRepl.emitImage(...)`. Top-level bindings persist across `js` calls until `js_reset`; do not redeclare existing `const` or `let` names. Reuse existing bindings, use top-level `var` for reusable state that may be assigned again, or choose a fresh descriptive name. Use `js_add_node_module_dir` before `js` when a skill provides an extra package directory, and use dynamic imports like `await import("playwright")` rather than filesystem paths under `./node_modules`.

```ts
declare const tools: { mcp__node_repl__js_reset(args: {}): Promise<CallToolResult>; };
```

## 277. `mcp__robinhood_trading__get_portfolio`

Get the account's portfolio market value breakdown by asset type and buying power. Use for "how much is my account worth?", "what's my portfolio breakdown?", "how much do I have in options?", and "how much can I spend / afford?" questions.

```ts
declare const tools: { mcp__robinhood_trading__get_portfolio(args: {
  // Brokerage account number. Obtain from get_accounts.
  account_number: string;
}): Promise<CallToolResult<{
  // Tool-specific result payload; see the inner properties for fields.
  data: {
  // Real-time buying power from the broker.
  buying_power: null | {
  // Authoritative spendable figure used to gate order placement. For margin-enabled accounts it already includes available margin leverage; for cash and leverage-disabled accounts it equals the cash-only figure.
  buying_power: string;
  // Currency of the figures, e.g. 'USD'.
  display_currency: string;
  // Buying power for intraday leverage, when applicable; null when the account does not have intraday margin enabled.
  intraday_buying_power?: null | string;
  // Buying power outside the intraday-leverage window; null when not applicable.
  off_intraday_buying_power?: null | string;
  // Buying power ignoring margin leverage. Typically <= buying_power. Negative when the account is in deficit — new positions cannot be opened until the deficit is cleared.
  unleveraged_buying_power: string;
};
  // Available cash (includes early access from pending deposits).
  cash: string;
  // Spendable buying power for crypto buys. Cash-only (crypto is not marginable), so it excludes the equity margin leverage that buying_power may include — quote this for 'how much can I spend on crypto'. Omitted when unavailable or when the caller is not in the crypto experiment.
  crypto_buying_power?: null | {
  // Authoritative spendable figure for crypto buys (cash-only; excludes equity margin leverage).
  buying_power: string;
};
  // Value of crypto holdings.
  crypto_value: string;
  // Currency all values are denominated in (e.g. USD).
  currency: string;
  // Value of stock and ETF positions.
  equity_value: string;
  // Value of event contract positions.
  event_contracts_value: string;
  // Value of fixed income instruments.
  fixed_income_value: string;
  // Value of futures positions (includes RHD cost basis).
  futures_value: string;
  // Value of mutual fund positions.
  mutual_funds_value: string;
  // Value of options positions.
  options_value: string;
  // Deposits in transit, not yet settled.
  pending_deposits: string;
  // Total portfolio value across all asset types. The default 'account value' to show the user.
  total_value: string;
};
  // Show total_value as "account value" or "portfolio value". The breakdown fields show how value is distributed across asset types. Zero-value fields mean the user has no holdings in that asset class — omit them from display unless the user explicitly asks. For "how much cash do I have?" use the cash field. buying_power is the real-time authoritative spendable figure from the broker; quote buying_power.buying_power as the primary affordability answer with buying_power.display_currency. For "how much can I spend on crypto?" quote crypto_buying_power.buying_power instead — crypto is cash-only (not marginable), so the top-level buying_power may overstate it; crypto_buying_power is omitted when unavailable. crypto_value reflects the user's crypto holdings value.
  guide: string;
}>>; };
```

## 278. `mcp__sites_design_picker__choose_site_design`

Use choose_site_design only after the Sites skill generates exactly three comparable one-shot design-option previews. It may be called sequentially for up to four distinct design decisions; wait for each selection before preparing the next picker.

```ts
declare const tools: { mcp__sites_design_picker__choose_site_design(args: {
  // Exactly three comparable generated site-design options.
  options: Array<{
  // Implementation-ready visual and interaction guidance for the generated preview.
  designBrief: string;
  // Stable unique id for the direction.
  id: string;
  // Absolute path to a generated PNG, JPEG, or WebP preview no larger than 8 MB.
  imagePath: string;
  // Short user-facing direction name.
  title: string;
}>;
  // Focused user-facing question, such as "Pick a color palette" or "Pick a typography pair".
  question?: string;
}): Promise<CallToolResult>; };
```

## 279. `multi_agent_v1__close_agent`

Tools for spawning and managing sub-agents.

```ts
declare const tools: { multi_agent_v1__close_agent(args: {
  // Agent id to close (from spawn_agent).
  target: string;
}): Promise<{
  // The agent status observed before shutdown was requested.
  previous_status: "pending_init" | "running" | "interrupted" | "shutdown" | "not_found" | { completed: string | null; } | { errored: string; };
}>; };
```

## 280. `multi_agent_v1__resume_agent`

Tools for spawning and managing sub-agents.

```ts
declare const tools: { multi_agent_v1__resume_agent(args: {
  // Agent id to resume.
  id: string;
}): Promise<{ status: "pending_init" | "running" | "interrupted" | "shutdown" | "not_found" | { completed: string | null; } | { errored: string; }; }>; };
```

## 281. `multi_agent_v1__send_input`

Tools for spawning and managing sub-agents.

```ts
declare const tools: { multi_agent_v1__send_input(args: {
  // True interrupts the current task and handles this message immediately; false or omitted queues it.
  interrupt?: boolean;
  // Structured input items. Use this to pass explicit mentions (for example app:// connector paths).
  items?: Array<{
  // Image URL when type is image.
  image_url?: string;
  // Display name when type is skill or mention.
  name?: string;
  // Path when type is local_image/skill, or structured mention target such as app://<connector-id> or plugin://<plugin-name>@<marketplace-name> when type is mention.
  path?: string;
  // Text content when type is text.
  text?: string;
  // Input item type: text, image, local_image, skill, or mention.
  type?: string;
}>;
  // Legacy plain-text message to send to the agent. Use either message or items.
  message?: string;
  // Agent id to message (from spawn_agent).
  target: string;
}): Promise<{
  // Identifier for the queued input submission.
  submission_id: string;
}>; };
```

## 282. `multi_agent_v1__spawn_agent`

Tools for spawning and managing sub-agents.

```ts
declare const tools: { multi_agent_v1__spawn_agent(args: {
  // Optional type name for the new agent. If omitted, `default` is used.
  // Available roles:
  // web_researcher: {
  // Use this agent when you need to research information on the internet, particularly for debugging issues, finding solutions to technical problems, or gathering comprehensive information from multiple sources. This agent excels at finding relevant discussions. Use when you need creative search strategies, thorough investigation, or compilation of findings from multiple sources.
  // - This role's model is set to `gpt-5.4` and its reasoning effort is set to `high`. These settings cannot be changed.
  // }
  // default: {
  // Default agent.
  // }
  // explorer: {
  // Use `explorer` for specific codebase questions.
  // Explorers are fast and authoritative.
  // They must be used to ask specific, well-scoped questions on the codebase.
  // Rules:
  // - In order to avoid redundant work, you should avoid exploring the same problem that explorers have already covered. Typically, you should trust the explorer results without additional verification. You are still allowed to inspect the code yourself to gain the needed context!
  // - You are encouraged to spawn up multiple explorers in parallel when you have multiple distinct questions to ask about the codebase that can be answered independently. This allows you to get more information faster without waiting for one question to finish before asking the next. While waiting for the explorer results, you can continue working on other local tasks that do not depend on those results. This parallelism is a key advantage of delegation, so use it whenever you have multiple questions to ask.
  // - Reuse existing explorers for related questions.
  // }
  // worker: {
  // Use for execution and production work.
  // Typical tasks:
  // - Implement part of a feature
  // - Fix tests or bugs
  // - Split large refactors into independent chunks
  // Rules:
  // - Explicitly assign **ownership** of the task (files / responsibility). When the subtask involves code changes, you should clearly specify which files or modules the worker is responsible for. This helps avoid merge conflicts and ensures accountability. For example, you can say "Worker 1 is responsible for updating the authentication module, while Worker 2 will handle the database layer." By defining clear ownership, you can delegate more effectively and reduce coordination overhead.
  // - Always tell workers they are **not alone in the codebase**, and they should not revert the edits made by others, and they should adjust their implementation to accommodate the changes made by others. This is important because there may be multiple workers making changes in parallel, and they need to be aware of each other's work to avoid conflicts and ensure a cohesive final product.
  // }
  agent_type?: string;
  // True forks the current thread history into the new agent; false or omitted starts with only the initial prompt.
  fork_context?: boolean;
  // Structured input items. Use this to pass explicit mentions (for example app:// connector paths).
  items?: Array<{
  // Image URL when type is image.
  image_url?: string;
  // Display name when type is skill or mention.
  name?: string;
  // Path when type is local_image/skill, or structured mention target such as app://<connector-id> or plugin://<plugin-name>@<marketplace-name> when type is mention.
  path?: string;
  // Text content when type is text.
  text?: string;
  // Input item type: text, image, local_image, skill, or mention.
  type?: string;
}>;
  // Initial plain-text task for the new agent. Use either message or items.
  message?: string;
  // Model override for the new agent. Omit unless an explicit override is needed.
  model?: string;
  // Reasoning effort override for the new agent. Omit to inherit the parent effort.
  reasoning_effort?: string;
  // Service tier override for the new agent. Omit unless explicitly requested.
  service_tier?: string;
}): Promise<{
  // Thread identifier for the spawned agent.
  agent_id: string;
  // User-facing nickname for the spawned agent when available.
  nickname: string | null;
}>; };
```

## 283. `multi_agent_v1__wait_agent`

Tools for spawning and managing sub-agents.

```ts
declare const tools: { multi_agent_v1__wait_agent(args: {
  // Agent ids to wait on. Pass multiple ids to wait for whichever finishes first.
  targets: Array<string>;
  // Timeout in milliseconds. Defaults to 30000, min 10000, max 3600000. Prefer longer waits (minutes) to avoid busy polling.
  timeout_ms?: number;
}): Promise<{
  // Final statuses keyed by agent id.
  status: { [key: string]: "pending_init" | "running" | "interrupted" | "shutdown" | "not_found" | { completed: string | null; } | { errored: string; }; };
  // Whether the wait call returned due to timeout before any agent reached a final status.
  timed_out: boolean;
}>; };
```

## 284. `plugin_management__uninstall_plugin`

Tools provided by the Plugin Management app in Codex.

```ts
declare const tools: { plugin_management__uninstall_plugin(args: {
  // The plugin's user-facing name or exact plugin ID.
  plugin: string;
}): Promise<unknown>; };
```

## 285. `read_mcp_resource`

Read a specific resource from an MCP server given the server name and resource URI.

```ts
declare const tools: { read_mcp_resource(args: {
  // MCP server name exactly as configured. Must match the 'server' field returned by list_mcp_resources.
  server: string;
  // Resource URI to read. Must be one of the URIs returned by list_mcp_resources.
  uri: string;
}): Promise<unknown>; };
```

## 286. `request_plugin_install`

# Request plugin/connector install

```ts
declare const tools: { request_plugin_install(args: {
  // Suggested action for the tool. Use "install".
  action_type: string;
  // Concise one-line user-facing reason why this plugin or connector can help with the current request.
  suggest_reason: string;
  // Connector or plugin id to suggest.
  tool_id: string;
  // Type of discoverable tool to suggest. Use "connector" or "plugin".
  tool_type: string;
}): Promise<unknown>; };
```

## 287. `update_goal`

Update the existing goal.

```ts
declare const tools: { update_goal(args: {
  // Required. Set to `complete` only when the objective is achieved and no required work remains. Set to `blocked` only after the same blocking condition has recurred for at least three consecutive goal turns and the agent is at an impasse. After a previously blocked goal is resumed, the resumed run starts a fresh blocked audit.
  status: "complete" | "blocked";
}): Promise<unknown>; };
```

## 288. `update_plan`

Updates the task plan.

```ts
declare const tools: { update_plan(args: {
  // Optional explanation for this plan update.
  explanation?: string;
  // The list of steps
  plan: Array<{
  // Step status.
  status: "pending" | "in_progress" | "completed";
  // Task step text.
  step: string;
}>;
}): Promise<unknown>; };
```

## 289. `view_image`

View a local image file from the filesystem when visual inspection is needed. Use this for images already available on disk.

```ts
declare const tools: { view_image(args: {
  // Image detail level. Defaults to `high`; use `original` to preserve exact resolution.
  detail?: "high" | "original";
  // Local filesystem path to an image file.
  path: string;
}): Promise<{
  // Image detail hint returned by view_image. Returns `high` for default resized behavior or `original` when original resolution is preserved.
  detail: "high" | "original";
  // Data URL for the loaded image.
  image_url: string;
}>; };
```

## 290. `web__run`

Tools in the web namespace.

```ts
declare const tools: { web__run(args: {
  // Open links from previously opened pages.
  click?: Array<{
  // Numbered link id to open.
  id: number;
  // Reference id containing the numbered link.
  ref_id: string;
}>;
  // Look up prices for the given stock symbols.
  finance?: Array<{
  // ISO 3166-1 alpha-3 country code, "OTC", or "" for cryptocurrency.
  market?: string;
  // Ticker symbol to look up.
  ticker: string;
  // Asset type to look up.
  type: "equity" | "fund" | "crypto" | "index";
}>;
  // Find text patterns in pages.
  find?: Array<{
  // Text pattern to find.
  pattern: string;
  // Reference id or URL to search within.
  ref_id: string;
}>;
  // Query the image search engine for a given list of queries.
  image_query?: Array<{
  // Whether to filter by a specific list of domains.
  domains?: Array<string>;
  // Search query.
  q: string;
  // Whether to filter by recency, as a number of recent days.
  recency?: number;
}>;
  // Open pages by reference id or URL.
  open?: Array<{
  // Line number to position the page at.
  lineno?: number;
  // Reference id or URL to open.
  ref_id: string;
}>;
  // Set the length of the response to be returned.
  response_length?: "short" | "medium" | "long";
  // Take screenshots of PDF pages.
  screenshot?: Array<{
  // Zero-indexed PDF page number.
  pageno: number;
  // Reference id or URL to screenshot.
  ref_id: string;
}>;
  // Query the internet search engine for a given list of queries.
  search_query?: Array<{
  // Whether to filter by a specific list of domains.
  domains?: Array<string>;
  // Search query.
  q: string;
  // Whether to filter by recency, as a number of recent days.
  recency?: number;
}>;
  // Look up sports schedules and standings.
  sports?: Array<{
  // Start date in YYYY-MM-DD format.
  date_from?: string;
  // End date in YYYY-MM-DD format.
  date_to?: string;
  // Sports function to call.
  fn: "schedule" | "standings";
  // League to look up.
  league: "nba" | "wnba" | "nfl" | "nhl" | "mlb" | "epl" | "ncaamb" | "ncaawb" | "ipl";
  // Locale for the lookup.
  locale?: string;
  // Number of games to return.
  num_games?: number;
  // Opponent to use with `team` when narrowing the lookup.
  opponent?: string;
  // Team to look up, using the common 3 or 4 letter alias used in broadcasts.
  team?: string;
  // Tool name for sports requests.
  tool?: "sports";
}>;
  // Get time for the given UTC offsets.
  time?: Array<{
  // UTC offset formatted like "+03:00".
  utc_offset: string;
}>;
  // Look up weather forecasts.
  weather?: Array<{
  // Number of days to return. Defaults to 7.
  duration?: number;
  // Location in "Country, Area, City" format.
  location: string;
  // Start date in YYYY-MM-DD format. Defaults to today.
  start?: string;
}>;
}): Promise<unknown>; };
```

## 291. `write_stdin`

Writes characters to an existing unified exec session and returns recent output.

```ts
declare const tools: { write_stdin(args: {
  // Bytes to write to stdin. Defaults to empty, which polls without writing.
  chars?: string;
  // Output token budget. Defaults to 10000 tokens; larger requests may be capped by policy.
  max_output_tokens?: number;
  // Identifier of the running unified exec session.
  session_id: number;
  // Wait before yielding output. Non-empty writes default to 250 ms and cap at 30000 ms; empty polls wait 5000-300000 ms by default.
  yield_time_ms?: number;
}): Promise<{
  // Chunk identifier included when the response reports one.
  chunk_id?: string;
  // Process exit code when the command finished during this call.
  exit_code?: number;
  // Approximate token count before output truncation.
  original_token_count?: number;
  // Command output text, possibly truncated.
  output: string;
  // Session identifier to pass to write_stdin when the process is still running.
  session_id?: number;
  // Elapsed wall time spent waiting for output in seconds.
  wall_time_seconds: number;
}>; };
```


