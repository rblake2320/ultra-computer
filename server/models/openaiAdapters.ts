import crypto from "node:crypto";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseInputItem,
  ResponseStreamEvent,
  Tool,
} from "openai/resources/responses/responses";
import { modelEvents, type NormalizedModelEvent } from "./events.js";
import type {
  ProviderAdapter,
  ProviderRequestContext,
} from "./providerAdapter.js";
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

export interface OpenAIAdapterConfig {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
  sessionId?: string;
}

function createClient(config: OpenAIAdapterConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs ?? 120_000,
    fetch: createGovernedProviderFetch(config.sessionId ?? "provider:openai"),
    // Hidden SDK retries can create additional paid requests outside the
    // application's reservation model. Retry policy belongs to the router.
    maxRetries: 0,
  });
}

function imageUrl(part: Extract<ModelContentPart, { type: "image" }>): string {
  if (part.url) return part.url;
  if (!part.mediaType) {
    throw new TypeError("Base64 image content requires a mediaType");
  }
  return `data:${part.mediaType};base64,${part.base64}`;
}

function toResponsesContent(content: ModelMessage["content"]): unknown {
  if (typeof content === "string") return content;
  return content.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "input_text", text: part.text };
      case "image":
        return { type: "input_image", image_url: imageUrl(part), detail: part.detail ?? "auto" };
      case "file":
        if (part.url) return { type: "input_file", file_url: part.url };
        return {
          type: "input_file",
          filename: part.filename ?? "attachment",
          file_data: `data:${part.mediaType ?? "application/octet-stream"};base64,${part.base64}`,
        };
      case "audio":
        throw new TypeError("OpenAI Responses audio input requires an explicit audio adapter");
    }
  });
}

function toResponsesInput(messages: readonly ModelMessage[]): ResponseInput {
  const input: ResponseInputItem[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      if (!message.toolCallId) throw new TypeError("Tool result messages require toolCallId");
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId,
        output: textFromContent(message.content),
      });
      continue;
    }
    input.push({
      role: message.role,
      content: toResponsesContent(message.content),
    } as ResponseInputItem);
  }
  return input;
}

function toResponsesTools(request: ModelRequest): Tool[] | undefined {
  return request.tools?.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: false,
  }));
}

function responseToolCalls(output: readonly unknown[]): ModelToolCall[] {
  return output.flatMap((item): ModelToolCall[] => {
    const candidate = item as {
      type?: unknown;
      call_id?: unknown;
      id?: unknown;
      name?: unknown;
      arguments?: unknown;
    };
    if (candidate.type !== "function_call" || typeof candidate.name !== "string") return [];
    return [{
      id: typeof candidate.call_id === "string"
        ? candidate.call_id
        : typeof candidate.id === "string"
          ? candidate.id
          : crypto.randomUUID(),
      name: candidate.name,
      arguments: typeof candidate.arguments === "string" ? candidate.arguments : "{}",
    }];
  });
}

function nativeResponseParams(request: ModelRequest): ResponseCreateParamsNonStreaming {
  const params: ResponseCreateParamsNonStreaming = {
    model: request.model,
    input: toResponsesInput(request.messages),
    store: false,
  };
  if (request.reasoningEffort !== undefined) {
    params.reasoning = { effort: request.reasoningEffort };
  }
  if (request.maxOutputTokens !== undefined) params.max_output_tokens = request.maxOutputTokens;
  if (request.temperature !== undefined) params.temperature = request.temperature;
  if (request.topP !== undefined) params.top_p = request.topP;
  if (request.tools?.length) params.tools = toResponsesTools(request);
  if (request.toolChoice) {
    params.tool_choice = request.toolChoice === "required"
      ? "required"
      : request.toolChoice === "none"
        ? "none"
        : request.toolChoice === "auto"
          ? "auto"
          : { type: "function", name: request.toolChoice.name };
  }
  if (request.metadata) params.metadata = { ...request.metadata };
  if (request.responseFormat?.type === "json_schema") {
    params.text = {
      format: {
        type: "json_schema",
        name: request.responseFormat.name ?? "response",
        schema: request.responseFormat.schema ?? {},
        strict: request.responseFormat.strict ?? true,
      },
    };
  } else if (request.responseFormat?.type === "json_object") {
    params.text = { format: { type: "json_object" } };
  }
  return params;
}

export class OpenAIResponsesAdapter implements ProviderAdapter {
  readonly provider = "openai";
  readonly features = {
    capabilities: ["chat", "reasoning", "vision", "tools", "parallel-tools", "structured-output", "file-input", "streaming"],
    discovery: true,
    streaming: true,
  } as const;
  private readonly client: OpenAI;

  constructor(config: OpenAIAdapterConfig) {
    this.client = createClient(config);
  }

  async generate(request: ModelRequest, context: ProviderRequestContext): Promise<ModelResponse> {
    assertRequest(request);
    try {
      const result = await this.client.responses.create(nativeResponseParams(request), {
        signal: context.signal,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      const toolCalls = responseToolCalls(result.output);
      return responseWithToolCalls({
        provider: this.provider,
        model: result.model,
        responseId: result.id,
        text: result.output_text,
        finishReason: toolCalls.length ? "tool_calls" : result.incomplete_details ? "length" : "stop",
        usage: result.usage ? {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          totalTokens: result.usage.total_tokens,
          cachedInputTokens: result.usage.input_tokens_details?.cached_tokens,
          reasoningTokens: result.usage.output_tokens_details?.reasoning_tokens,
        } : undefined,
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
    const params: ResponseCreateParamsStreaming = {
      ...nativeResponseParams(request),
      stream: true,
    };
    try {
      const stream = await this.client.responses.create(params, { signal: context.signal });
      for await (const event of stream) {
        yield* normalizeResponsesEvent(event);
      }
    } catch (error) {
      yield modelEvents.error(asProviderAdapterError(this.provider, error).details);
    }
  }
}

function* normalizeResponsesEvent(event: ResponseStreamEvent): Iterable<NormalizedModelEvent> {
  switch (event.type) {
    case "response.created":
      yield modelEvents.started("openai", event.response.model, event.response.id);
      break;
    case "response.output_text.delta":
      yield modelEvents.text(event.delta);
      break;
    case "response.reasoning_text.delta":
    case "response.reasoning_summary_text.delta":
      yield modelEvents.reasoning(event.delta);
      break;
    case "response.refusal.delta":
      yield modelEvents.refusal(event.delta);
      break;
    case "response.function_call_arguments.delta":
      yield modelEvents.toolCall(event.output_index, {
        argumentsDelta: event.delta,
      });
      break;
    case "response.output_item.added":
      if (event.item.type === "function_call") {
        yield modelEvents.toolCall(event.output_index, {
          id: event.item.call_id,
          name: event.item.name,
        });
      }
      break;
    case "response.completed":
      if (event.response.usage) {
        yield modelEvents.usage({
          inputTokens: event.response.usage.input_tokens,
          outputTokens: event.response.usage.output_tokens,
          totalTokens: event.response.usage.total_tokens,
          cachedInputTokens: event.response.usage.input_tokens_details?.cached_tokens,
          reasoningTokens: event.response.usage.output_tokens_details?.reasoning_tokens,
        });
      }
      yield modelEvents.completed(
        event.response.output.some((item) => item.type === "function_call") ? "tool_calls" : "stop",
      );
      break;
    case "response.failed":
      yield modelEvents.error({
        code: event.response.error?.code ?? "openai_response_failed",
        message: event.response.error?.message ?? "OpenAI response failed",
        retryable: false,
      });
      break;
    case "response.incomplete":
      if (event.response.usage) {
        yield modelEvents.usage({
          inputTokens: event.response.usage.input_tokens,
          outputTokens: event.response.usage.output_tokens,
          totalTokens: event.response.usage.total_tokens,
          cachedInputTokens: event.response.usage.input_tokens_details?.cached_tokens,
          reasoningTokens: event.response.usage.output_tokens_details?.reasoning_tokens,
        });
      }
      yield modelEvents.completed("length");
      break;
    case "error":
      yield modelEvents.error({
        code: event.code ?? "openai_stream_error",
        message: event.message,
        retryable: false,
      });
      break;
  }
}

function toChatContent(content: ModelMessage["content"]): unknown {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") {
      return { type: "image_url", image_url: { url: imageUrl(part), detail: part.detail ?? "auto" } };
    }
    throw new TypeError(`OpenAI-compatible chat does not support ${part.type} content`);
  });
}

function toChatMessages(messages: readonly ModelMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      if (!message.toolCallId) throw new TypeError("Tool result messages require toolCallId");
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: textFromContent(message.content),
      };
    }
    return {
      role: message.role,
      content: toChatContent(message.content),
    } as ChatCompletionMessageParam;
  });
}

function chatParams(request: ModelRequest): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: request.model,
    messages: toChatMessages(request.messages),
  };
  if (request.maxOutputTokens !== undefined) params.max_tokens = request.maxOutputTokens;
  if (request.temperature !== undefined) params.temperature = request.temperature;
  if (request.topP !== undefined) params.top_p = request.topP;
  if (request.stop?.length) params.stop = [...request.stop];
  if (request.tools?.length) {
    params.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
  if (request.toolChoice) {
    params.tool_choice = request.toolChoice === "required"
      ? "required"
      : request.toolChoice === "none"
        ? "none"
        : request.toolChoice === "auto"
          ? "auto"
          : { type: "function", function: { name: request.toolChoice.name } };
  }
  if (request.responseFormat?.type === "json_object") {
    params.response_format = { type: "json_object" };
  }
  return params;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly features = {
    capabilities: ["chat", "vision", "tools", "structured-output", "streaming"],
    discovery: true,
    streaming: true,
  } as const;
  private readonly client: OpenAI;

  constructor(readonly provider: string, config: OpenAIAdapterConfig) {
    this.client = createClient(config);
  }

  async generate(request: ModelRequest, context: ProviderRequestContext): Promise<ModelResponse> {
    assertRequest(request);
    try {
      const result = await this.client.chat.completions.create(chatParams(request), {
        signal: context.signal,
      });
      const choice = result.choices[0];
      if (!choice) throw new Error("Provider returned no completion choices");
      const toolCalls = choice.message.tool_calls?.flatMap((call): ModelToolCall[] =>
        call.type === "function"
          ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }]
          : [],
      ) ?? [];
      const message = choice.message as typeof choice.message & {
        reasoning?: string;
        reasoning_content?: string;
      };
      return responseWithToolCalls({
        provider: this.provider,
        model: result.model,
        responseId: result.id,
        text: typeof message.content === "string" ? message.content : "",
        reasoning: message.reasoning ?? message.reasoning_content,
        finishReason: finishReason(choice.finish_reason),
        usage: result.usage ? {
          inputTokens: result.usage.prompt_tokens,
          outputTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        } : undefined,
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
    const params: ChatCompletionCreateParamsStreaming = {
      ...chatParams(request),
      stream: true,
      stream_options: { include_usage: true },
    };
    try {
      const stream = await this.client.chat.completions.create(params, {
        signal: context.signal,
      });
      yield modelEvents.started(this.provider, request.model);
      for await (const chunk of stream) {
        if (chunk.usage) {
          yield modelEvents.usage({
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          });
        }
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta as typeof choice.delta & {
          reasoning?: string;
          reasoning_content?: string;
        };
        if (delta.content) yield modelEvents.text(delta.content);
        const reasoning = delta.reasoning ?? delta.reasoning_content;
        if (reasoning) yield modelEvents.reasoning(reasoning);
        for (const call of delta.tool_calls ?? []) {
          yield modelEvents.toolCall(call.index, {
            id: call.id,
            name: call.function?.name,
            argumentsDelta: call.function?.arguments,
          });
        }
        if (choice.finish_reason) yield modelEvents.completed(finishReason(choice.finish_reason));
      }
    } catch (error) {
      yield modelEvents.error(asProviderAdapterError(this.provider, error).details);
    }
  }
}
