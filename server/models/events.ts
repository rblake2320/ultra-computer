import type {
  ModelFinishReason,
  ModelToolCall,
  ModelUsage,
  NormalizedProviderError,
} from "./types.js";

export type NormalizedModelEvent =
  | {
      type: "response.started";
      provider: string;
      model: string;
      responseId?: string;
    }
  | {
      type: "output_text.delta";
      delta: string;
    }
  | {
      type: "reasoning.delta";
      delta: string;
    }
  | {
      type: "refusal.delta";
      delta: string;
    }
  | {
      type: "tool_call.delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | {
      type: "response.usage";
      usage: ModelUsage;
    }
  | {
      type: "response.completed";
      finishReason: ModelFinishReason;
    }
  | {
      type: "response.error";
      error: NormalizedProviderError;
    };

export interface CollectedModelEvents {
  provider?: string;
  model?: string;
  responseId?: string;
  text: string;
  reasoning: string;
  refusal: string;
  toolCalls: readonly ModelToolCall[];
  usage?: ModelUsage;
  finishReason?: ModelFinishReason;
  error?: NormalizedProviderError;
  completed: boolean;
}

function assertTokenCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
}

export function normalizeUsage(usage: ModelUsage): ModelUsage {
  assertTokenCount(usage.inputTokens, "inputTokens");
  assertTokenCount(usage.outputTokens, "outputTokens");
  assertTokenCount(usage.totalTokens, "totalTokens");
  if (usage.cachedInputTokens !== undefined) {
    assertTokenCount(usage.cachedInputTokens, "cachedInputTokens");
  }
  if (usage.reasoningTokens !== undefined) {
    assertTokenCount(usage.reasoningTokens, "reasoningTokens");
  }

  return { ...usage };
}

export const modelEvents = {
  started(provider: string, model: string, responseId?: string): NormalizedModelEvent {
    return { type: "response.started", provider, model, responseId };
  },

  text(delta: string): NormalizedModelEvent {
    return { type: "output_text.delta", delta };
  },

  reasoning(delta: string): NormalizedModelEvent {
    return { type: "reasoning.delta", delta };
  },

  refusal(delta: string): NormalizedModelEvent {
    return { type: "refusal.delta", delta };
  },

  toolCall(
    index: number,
    delta: { id?: string; name?: string; argumentsDelta?: string },
  ): NormalizedModelEvent {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new TypeError("Tool-call index must be a non-negative safe integer");
    }
    return { type: "tool_call.delta", index, ...delta };
  },

  usage(usage: ModelUsage): NormalizedModelEvent {
    return { type: "response.usage", usage: normalizeUsage(usage) };
  },

  completed(finishReason: ModelFinishReason): NormalizedModelEvent {
    return { type: "response.completed", finishReason };
  },

  error(error: NormalizedProviderError): NormalizedModelEvent {
    return { type: "response.error", error };
  },
} as const;

export function isTerminalModelEvent(event: NormalizedModelEvent): boolean {
  return event.type === "response.completed" || event.type === "response.error";
}

interface PendingToolCall {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
}

/**
 * Collects a normalized stream for non-streaming callers and contract tests.
 * It does not throw provider errors; the normalized error remains in the result
 * so the caller can apply its own retry and fallback policy.
 */
export async function collectNormalizedEvents(
  events: AsyncIterable<NormalizedModelEvent>,
): Promise<CollectedModelEvents> {
  const collected: Omit<CollectedModelEvents, "toolCalls"> & {
    toolCalls: ModelToolCall[];
  } = {
    text: "",
    reasoning: "",
    refusal: "",
    toolCalls: [],
    completed: false,
  };
  const pendingToolCalls = new Map<number, PendingToolCall>();

  eventLoop: for await (const event of events) {
    switch (event.type) {
      case "response.started":
        collected.provider = event.provider;
        collected.model = event.model;
        collected.responseId = event.responseId;
        break;
      case "output_text.delta":
        collected.text += event.delta;
        break;
      case "reasoning.delta":
        collected.reasoning += event.delta;
        break;
      case "refusal.delta":
        collected.refusal += event.delta;
        break;
      case "tool_call.delta": {
        const pending = pendingToolCalls.get(event.index) ?? {
          index: event.index,
          arguments: "",
        };
        pending.id = event.id ?? pending.id;
        pending.name = event.name ?? pending.name;
        pending.arguments += event.argumentsDelta ?? "";
        pendingToolCalls.set(event.index, pending);
        break;
      }
      case "response.usage":
        collected.usage = normalizeUsage(event.usage);
        break;
      case "response.completed":
        collected.finishReason = event.finishReason;
        collected.completed = true;
        break eventLoop;
      case "response.error":
        collected.error = event.error;
        collected.finishReason = "error";
        break eventLoop;
    }
  }

  collected.toolCalls = [...pendingToolCalls.values()]
    .sort((left, right) => left.index - right.index)
    .map((call) => ({
      id: call.id ?? `tool-call-${call.index}`,
      name: call.name ?? "",
      arguments: call.arguments,
    }));

  return collected;
}
