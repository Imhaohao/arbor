export type ExternalToolEffect = "read" | "write" | "unknown";

export interface ExternalToolSpec {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  effect?: ExternalToolEffect;
  parallelSafe?: boolean;
}

export interface ExternalToolCallResult {
  ok: boolean;
  content: string;
}

export interface ExternalToolAdapter {
  id: string;
  discover(): Promise<ExternalToolSpec[]>;
  call(toolName: string, args: Record<string, unknown>): Promise<ExternalToolCallResult>;
}

export interface HarnessTool extends ExternalToolSpec {
  adapterId: string;
  modelName: string;
}

export interface HarnessToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type HarnessDecision =
  | { type: "final"; content: string }
  | { type: "tool_calls"; content?: string; calls: HarnessToolCall[] };

export type HarnessTranscriptEntry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; calls?: HarnessToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

export interface ToolHarnessModel {
  decide(input: {
    goal: string;
    tools: HarnessTool[];
    transcript: HarnessTranscriptEntry[];
    round: number;
    remainingCalls: number;
    forceFinal: boolean;
  }): Promise<HarnessDecision>;
}

export interface ToolHarnessPolicy {
  maxRounds?: number;
  maxCalls?: number;
  maxParallelCalls?: number;
  maxResultChars?: number;
  maxRepeatedCall?: number;
  authorize?: (
    call: HarnessToolCall,
    tool: HarnessTool,
  ) => Promise<{ allowed: boolean; reason?: string }> | { allowed: boolean; reason?: string };
}

export interface ToolHarnessReceipt {
  callId: string;
  round: number;
  adapterId?: string;
  toolName: string;
  ok: boolean;
  durationMs: number;
  resultPreview: string;
  error?: string;
}

export interface ToolHarnessResult {
  status: "completed" | "budget_exhausted" | "unavailable";
  output: string;
  tools: HarnessTool[];
  receipts: ToolHarnessReceipt[];
  transcript: HarnessTranscriptEntry[];
  discoveryErrors: Array<{ adapterId: string; error: string }>;
}

const DEFAULT_POLICY = {
  maxRounds: 6,
  maxCalls: 12,
  maxParallelCalls: 4,
  maxResultChars: 8_000,
  maxRepeatedCall: 2,
} as const;

function safeModelName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return safe || "tool";
}

export function normalizeToolCatalog(
  discovered: Array<{ adapterId: string; tools: ExternalToolSpec[] }>,
): HarnessTool[] {
  const used = new Set<string>();
  const result: HarnessTool[] = [];
  for (const group of discovered) {
    for (const tool of group.tools) {
      const base = safeModelName(tool.name);
      let modelName = base;
      if (used.has(modelName)) {
        const prefix = safeModelName(group.adapterId);
        modelName = `${prefix}__${base}`.slice(0, 64);
        let suffix = 2;
        while (used.has(modelName)) {
          const tail = `_${suffix++}`;
          modelName = `${prefix}__${base}`.slice(0, 64 - tail.length) + tail;
        }
      }
      used.add(modelName);
      result.push({
        ...tool,
        adapterId: group.adapterId,
        modelName,
        effect: tool.effect ?? "unknown",
        parallelSafe: tool.parallelSafe ?? false,
      });
    }
  }
  return result;
}

function stableCallKey(call: HarnessToolCall): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sort(nested)]),
    );
  };
  return `${call.name}:${JSON.stringify(sort(call.arguments))}`;
}

async function inBatches<T>(
  values: T[],
  width: number,
  run: (value: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < values.length; i += width) {
    await Promise.all(values.slice(i, i + width).map(run));
  }
}

export async function runToolHarness(input: {
  goal: string;
  adapters: ExternalToolAdapter[];
  model: ToolHarnessModel;
  policy?: ToolHarnessPolicy;
}): Promise<ToolHarnessResult> {
  const adapterIds = new Set<string>();
  for (const adapter of input.adapters) {
    if (adapterIds.has(adapter.id)) {
      throw new Error(`duplicate external tool adapter id: ${adapter.id}`);
    }
    adapterIds.add(adapter.id);
  }
  const boundedInt = (value: number | undefined, fallback: number, min: number) =>
    Number.isFinite(value)
      ? Math.max(min, Math.floor(value as number))
      : fallback;
  const policy = {
    maxRounds: boundedInt(input.policy?.maxRounds, DEFAULT_POLICY.maxRounds, 1),
    maxCalls: boundedInt(input.policy?.maxCalls, DEFAULT_POLICY.maxCalls, 0),
    maxParallelCalls: boundedInt(
      input.policy?.maxParallelCalls,
      DEFAULT_POLICY.maxParallelCalls,
      1,
    ),
    maxResultChars: boundedInt(
      input.policy?.maxResultChars,
      DEFAULT_POLICY.maxResultChars,
      1,
    ),
    maxRepeatedCall: boundedInt(
      input.policy?.maxRepeatedCall,
      DEFAULT_POLICY.maxRepeatedCall,
      1,
    ),
    authorize: input.policy?.authorize,
  };
  const discoveryErrors: ToolHarnessResult["discoveryErrors"] = [];
  const discovery = await Promise.all(
    input.adapters.map(async (adapter) => {
      try {
        return {
          adapterId: adapter.id,
          tools: await adapter.discover(),
          error: undefined,
        };
      } catch (error) {
        return {
          adapterId: adapter.id,
          tools: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  const discovered = discovery.map(({ adapterId, tools, error }) => {
    if (error) discoveryErrors.push({ adapterId, error });
    return { adapterId, tools };
  });
  const tools = normalizeToolCatalog(discovered);
  const transcript: HarnessTranscriptEntry[] = [
    { role: "user", content: input.goal },
  ];
  const receipts: ToolHarnessReceipt[] = [];
  if (tools.length === 0) {
    return {
      status: "unavailable",
      output: "",
      tools,
      receipts,
      transcript,
      discoveryErrors,
    };
  }

  const adapters = new Map(input.adapters.map((adapter) => [adapter.id, adapter]));
  const byModelName = new Map(tools.map((tool) => [tool.modelName, tool]));
  const repetitions = new Map<string, number>();
  let callsUsed = 0;

  for (let round = 0; round < policy.maxRounds; round++) {
    const decision = await input.model.decide({
      goal: input.goal,
      tools,
      transcript: [...transcript],
      round,
      remainingCalls: Math.max(0, policy.maxCalls - callsUsed),
      forceFinal: false,
    });
    if (decision.type === "final") {
      transcript.push({ role: "assistant", content: decision.content });
      return {
        status: "completed",
        output: decision.content,
        tools,
        receipts,
        transcript,
        discoveryErrors,
      };
    }

    const remaining = Math.max(0, policy.maxCalls - callsUsed);
    const calls = decision.calls.slice(0, remaining);
    transcript.push({
      role: "assistant",
      content: decision.content ?? null,
      calls,
    });
    if (calls.length === 0) break;
    callsUsed += calls.length;

    const execute = async (call: HarnessToolCall) => {
      const started = Date.now();
      const tool = byModelName.get(call.name);
      let content: string;
      let ok = false;
      let error: string | undefined;
      if (!tool) {
        error = `unknown tool: ${call.name}`;
        content = error;
      } else {
        const key = stableCallKey(call);
        const repeated = (repetitions.get(key) ?? 0) + 1;
        repetitions.set(key, repeated);
        const authorization = policy.authorize
          ? await policy.authorize(call, tool)
          : { allowed: true };
        if (!authorization.allowed) {
          error = `tool call blocked: ${authorization.reason ?? "policy denied"}`;
          content = error;
        } else if (repeated > policy.maxRepeatedCall) {
          error = `tool call blocked: repeated identical call limit (${policy.maxRepeatedCall})`;
          content = error;
        } else {
          try {
            const result = await adapters.get(tool.adapterId)!.call(
              tool.name,
              call.arguments,
            );
            ok = result.ok;
            content = result.content;
            if (!ok) error = result.content.slice(0, 500);
          } catch (caught) {
            error = caught instanceof Error ? caught.message : String(caught);
            content = `tool call failed: ${error}`;
          }
        }
      }
      const clipped = content.slice(0, policy.maxResultChars);
      const receipt: ToolHarnessReceipt = {
        callId: call.id,
        round,
        adapterId: tool?.adapterId,
        toolName: tool?.name ?? call.name,
        ok,
        durationMs: Date.now() - started,
        resultPreview: clipped,
        error,
      };
      const transcriptEntry: HarnessTranscriptEntry = {
        role: "tool",
        callId: call.id,
        name: call.name,
        content: clipped,
      };
      return { receipt, transcriptEntry };
    };

    const parallel = calls.every(
      (call) => byModelName.get(call.name)?.parallelSafe === true,
    );
    const ordered = new Array<Awaited<ReturnType<typeof execute>>>(calls.length);
    await inBatches(
      calls.map((call, index) => ({ call, index })),
      parallel ? policy.maxParallelCalls : 1,
      async ({ call, index }) => {
        ordered[index] = await execute(call);
      },
    );
    for (const result of ordered) {
      receipts.push(result.receipt);
      transcript.push(result.transcriptEntry);
    }
  }

  const final = await input.model.decide({
    goal: input.goal,
    tools: [],
    transcript: [...transcript],
    round: policy.maxRounds,
    remainingCalls: 0,
    forceFinal: true,
  });
  const output = final.type === "final" ? final.content : final.content ?? "";
  transcript.push({ role: "assistant", content: output });
  return {
    status: "budget_exhausted",
    output,
    tools,
    receipts,
    transcript,
    discoveryErrors,
  };
}
