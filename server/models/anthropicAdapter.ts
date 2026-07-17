import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  MessageParam,
  RawMessageStreamEvent,
  TextBlockParam,
  ToolChoice,
  ToolUnion,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { modelEvents, type NormalizedModelEvent } from "./events.js";
import type { ProviderAdapter, ProviderRequestContext } from "./providerAdapter.js";
import type {
  ModelContentPart,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelToolCall,
} from "./types.js";
import {
  asProviderAdapterError,
  assertRequest,
  finishReason,
  responseWithToolCalls,
  textFromContent,
} from "./adapterUtils.js";
import { createGovernedProviderFetch } from "./providerFetch.js";

export interface AnthropicAdapterConfig {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
  sessionId?: string;
}

function imageSource(part: Extract<ModelContentPart, { type: "image" }>) {
  if (part.url) return { type: "url" as const, url: part.url };
  const data = part.base64;
  if (!data || !part.mediaType?.startsWith("image/")) {
    throw new TypeError("Anthropic base64 images require an image mediaType");
  }
  return {
    type: "base64" as const,
    media_type: part.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
    data,
  };
}

function toAnthropicContent(message: ModelMessage): string | ContentBlockParam[] {
  if (message.role === "tool") {
    if (!message.toolCallId) throw new TypeError("Tool result messages require toolCallId");
    return [{
      type: "tool_result",
      tool_use_id: message.toolCallId,
      content: textFromContent(message.content),
    }];
  }
  if (typeof message.content === "string") return message.content;
  return message.content.map((part): ContentBlockParam => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return { type: "image", source: imageSource(part) };
      case "file":
      case "audio":
        throw new TypeError(`Anthropic adapter does not support ${part.type} content`);
    }
  });
}

function requestParts(request: ModelRequest): {
  system?: TextBlockParam[];
  messages: MessageParam[];
} {
  const systemText = request.messages
    .filter((message) => message.role === "system")
    .map((message) => textFromContent(message.content))
    .filter(Boolean)
    .join("\n\n");
  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map((message): MessageParam => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: toAnthropicContent(message),
    }));
  return {
    system: systemText ? [{
      type: "text",
      text: systemText,
      cache_control: { type: "ephemeral" },
    }] : undefined,
    messages,
  };
}

function tools(request: ModelRequest): ToolUnion[] | undefined {
  return request.tools?.map((tool): ToolUnion => {
    const inputSchema = {
      ...tool.inputSchema,
      type: "object" as const,
    };
    return {
      name: tool.name,
      description: tool.description,
      input_schema: inputSchema,
    };
  });
}

function toolChoice(request: ModelRequest): ToolChoice | undefined {
  if (!request.toolChoice || request.toolChoice === "auto") return { type: "auto" };
  if (request.toolChoice === "none") return { type: "none" };
  if (request.toolChoice === "required") return { type: "any" };
  return { type: "tool", name: request.toolChoice.name };
}

function baseParams(request: ModelRequest): MessageCreateParamsNonStreaming {
  if (request.responseFormat?.type === "json_object") {
    throw new TypeError("Anthropic structured output requires an explicit JSON schema");
  }
  const parts = requestParts(request);
  const params: MessageCreateParamsNonStreaming = {
    model: request.model,
    max_tokens: request.maxOutputTokens ?? 4096,
    messages: parts.messages,
    system: parts.system,
  };
  if (request.temperature !== undefined) params.temperature = request.temperature;
  if (request.topP !== undefined) params.top_p = request.topP;
  if (request.stop?.length) params.stop_sequences = [...request.stop];
  if (request.tools?.length) {
    params.tools = tools(request);
    params.tool_choice = toolChoice(request);
  }
  if (request.responseFormat?.type === "json_schema") {
    params.output_config = {
      format: {
        type: "json_schema",
        schema: request.responseFormat.schema ?? {},
      },
    };
  }
  return params;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = "anthropic";
  readonly features = {
    capabilities: ["chat", "reasoning", "vision", "tools", "structured-output", "streaming"],
    discovery: true,
    streaming: true,
  } as const;
  private readonly client: Anthropic;

  constructor(config: AnthropicAdapterConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs ?? 120_000,
      fetch: createGovernedProviderFetch(config.sessionId ?? "provider:anthropic"),
      // The spend guard reserves one provider attempt. Do not allow the SDK to
      // issue additional billable attempts invisibly.
      maxRetries: 0,
    });
  }

  async generate(request: ModelRequest, context: ProviderRequestContext): Promise<ModelResponse> {
    assertRequest(request);
    try {
      const result = await this.client.messages.create(baseParams(request), {
        signal: context.signal,
      });
      const toolCalls = result.content.flatMap((block): ModelToolCall[] =>
        block.type === "tool_use"
          ? [{ id: block.id, name: block.name, arguments: JSON.stringify(block.input) }]
          : [],
      );
      const usage = result.usage;
      return responseWithToolCalls({
        provider: this.provider,
        model: result.model,
        responseId: result.id,
        text: result.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join(""),
        reasoning: result.content
          .filter((block) => block.type === "thinking")
          .map((block) => block.thinking)
          .join(""),
        finishReason: finishReason(result.stop_reason),
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
          cachedInputTokens: usage.cache_read_input_tokens ?? undefined,
        },
      }, toolCalls);
    } catch (error) {
      throw asProviderAdapterError(this.provider, error);
    }
  }

  async *stream(
    request: ModelRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<NormalizedModelEvent> {
    assertRequest(request);
    const params: MessageCreateParamsStreaming = { ...baseParams(request), stream: true };
    try {
      const stream = await this.client.messages.create(params, { signal: context.signal });
      let inputTokens = 0;
      for await (const event of stream) {
        if (event.type === "message_start") inputTokens = event.message.usage.input_tokens;
        yield* normalizeAnthropicEvent(event, inputTokens);
      }
    } catch (error) {
      yield modelEvents.error(asProviderAdapterError(this.provider, error).details);
    }
  }
}

function* normalizeAnthropicEvent(
  event: RawMessageStreamEvent,
  inputTokens: number,
): Iterable<NormalizedModelEvent> {
  switch (event.type) {
    case "message_start":
      yield modelEvents.started("anthropic", event.message.model, event.message.id);
      break;
    case "content_block_start":
      if (event.content_block.type === "tool_use") {
        yield modelEvents.toolCall(event.index, {
          id: event.content_block.id,
          name: event.content_block.name,
        });
      }
      break;
    case "content_block_delta":
      if (event.delta.type === "text_delta") yield modelEvents.text(event.delta.text);
      if (event.delta.type === "thinking_delta") yield modelEvents.reasoning(event.delta.thinking);
      if (event.delta.type === "input_json_delta") {
        yield modelEvents.toolCall(event.index, { argumentsDelta: event.delta.partial_json });
      }
      break;
    case "message_delta":
      yield modelEvents.usage({
        inputTokens,
        outputTokens: event.usage.output_tokens,
        totalTokens: inputTokens + event.usage.output_tokens,
      });
      yield modelEvents.completed(finishReason(event.delta.stop_reason));
      break;
  }
}
