import crypto from "node:crypto";
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
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

export interface GoogleAdapterConfig {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
}

function contentPart(part: ModelContentPart): Part {
  switch (part.type) {
    case "text":
      return { text: part.text };
    case "audio":
      return {
        inlineData: {
          data: part.base64,
          mimeType: part.mediaType,
        },
      };
    case "image":
      if (part.base64) {
        return {
          inlineData: {
            data: part.base64,
            mimeType: part.mediaType ?? "image/jpeg",
          },
        };
      }
      return {
        fileData: {
          fileUri: part.url,
          mimeType: part.mediaType,
        },
      };
    case "file":
      if (part.base64) {
        return {
          inlineData: {
            data: part.base64,
            mimeType: part.mediaType ?? "application/octet-stream",
            displayName: part.filename,
          },
        };
      }
      return {
        fileData: {
          fileUri: part.url,
          mimeType: part.mediaType,
          displayName: part.filename,
        },
      };
  }
}

function messageParts(message: ModelMessage): Part[] {
  if (message.role === "tool") {
    if (!message.toolCallId || !message.name) {
      throw new TypeError("Google tool results require toolCallId and name");
    }
    let output: unknown = textFromContent(message.content);
    try {
      output = JSON.parse(String(output));
    } catch {
      // Plain text tool output is valid and remains a string.
    }
    return [{
      functionResponse: {
        id: message.toolCallId,
        name: message.name,
        response: { output },
      },
    }];
  }
  if (typeof message.content === "string") return [{ text: message.content }];
  return message.content.map(contentPart);
}

function requestContents(messages: readonly ModelMessage[]): Content[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: messageParts(message),
    }));
}

function functionDeclarations(request: ModelRequest): FunctionDeclaration[] | undefined {
  return request.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
  }));
}

function generationConfig(
  request: ModelRequest,
  signal?: AbortSignal,
): GenerateContentConfig {
  const config: GenerateContentConfig = { abortSignal: signal };
  const systemInstruction = request.messages
    .filter((message) => message.role === "system")
    .map((message) => textFromContent(message.content))
    .filter(Boolean)
    .join("\n\n");
  if (systemInstruction) config.systemInstruction = systemInstruction;
  if (request.maxOutputTokens !== undefined) config.maxOutputTokens = request.maxOutputTokens;
  if (request.temperature !== undefined) config.temperature = request.temperature;
  if (request.topP !== undefined) config.topP = request.topP;
  if (request.stop?.length) config.stopSequences = [...request.stop];

  const declarations = functionDeclarations(request);
  if (declarations?.length) {
    config.tools = [{ functionDeclarations: declarations }];
    if (request.toolChoice) {
      config.toolConfig = {
        functionCallingConfig: request.toolChoice === "none"
          ? { mode: FunctionCallingConfigMode.NONE }
          : request.toolChoice === "required"
            ? { mode: FunctionCallingConfigMode.ANY }
            : request.toolChoice === "auto"
              ? { mode: FunctionCallingConfigMode.AUTO }
              : {
                  mode: FunctionCallingConfigMode.ANY,
                  allowedFunctionNames: [request.toolChoice.name],
                },
      };
    }
  }

  if (request.responseFormat?.type === "json_object") {
    config.responseMimeType = "application/json";
  } else if (request.responseFormat?.type === "json_schema") {
    config.responseMimeType = "application/json";
    config.responseJsonSchema = request.responseFormat.schema ?? {};
  }
  return config;
}

function responseText(parts: readonly Part[] | undefined, thought: boolean): string {
  return (parts ?? [])
    .filter((part) => Boolean(part.thought) === thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function responseToolCalls(
  calls: readonly { id?: string; name?: string; args?: Record<string, unknown> }[] | undefined,
): ModelToolCall[] {
  return (calls ?? []).flatMap((call): ModelToolCall[] => {
    if (!call.name) return [];
    return [{
      id: call.id ?? crypto.randomUUID(),
      name: call.name,
      arguments: JSON.stringify(call.args ?? {}),
    }];
  });
}

export class GoogleAdapter implements ProviderAdapter {
  readonly provider = "google";
  readonly features = {
    capabilities: [
      "chat",
      "reasoning",
      "vision",
      "tools",
      "structured-output",
      "file-input",
      "audio-input",
      "streaming",
    ],
    discovery: true,
    streaming: true,
  } as const;
  private readonly client: GoogleGenAI;

  constructor(config: GoogleAdapterConfig) {
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: {
        baseUrl: config.baseURL,
        timeout: config.timeoutMs ?? 120_000,
      },
    });
  }

  async generate(request: ModelRequest, context: ProviderRequestContext): Promise<ModelResponse> {
    assertRequest(request);
    try {
      const response = await this.client.models.generateContent({
        model: request.model,
        contents: requestContents(request.messages),
        config: generationConfig(request, context.signal),
      });
      const parts = response.candidates?.[0]?.content?.parts;
      const toolCalls = responseToolCalls(response.functionCalls);
      const usage = response.usageMetadata;
      return responseWithToolCalls({
        provider: this.provider,
        model: request.model,
        responseId: response.responseId,
        text: responseText(parts, false),
        reasoning: responseText(parts, true),
        finishReason: toolCalls.length
          ? "tool_calls"
          : finishReason(response.candidates?.[0]?.finishReason),
        usage: usage ? {
          inputTokens: usage.promptTokenCount ?? 0,
          outputTokens: usage.candidatesTokenCount ?? 0,
          totalTokens: usage.totalTokenCount ?? 0,
          cachedInputTokens: usage.cachedContentTokenCount,
          reasoningTokens: usage.thoughtsTokenCount,
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
    try {
      const stream = await this.client.models.generateContentStream({
        model: request.model,
        contents: requestContents(request.messages),
        config: generationConfig(request, context.signal),
      });
      yield modelEvents.started(this.provider, request.model);
      const emittedCalls = new Set<string>();
      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        const text = responseText(parts, false);
        const reasoning = responseText(parts, true);
        if (text) yield modelEvents.text(text);
        if (reasoning) yield modelEvents.reasoning(reasoning);
        for (const call of responseToolCalls(chunk.functionCalls)) {
          const signature = `${call.id}\0${call.name}\0${call.arguments}`;
          if (emittedCalls.has(signature)) continue;
          emittedCalls.add(signature);
          yield modelEvents.toolCall(emittedCalls.size - 1, {
            id: call.id,
            name: call.name,
            argumentsDelta: call.arguments,
          });
        }
        if (chunk.usageMetadata) {
          yield modelEvents.usage({
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
            cachedInputTokens: chunk.usageMetadata.cachedContentTokenCount,
            reasoningTokens: chunk.usageMetadata.thoughtsTokenCount,
          });
        }
        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason) {
          yield modelEvents.completed(emittedCalls.size ? "tool_calls" : finishReason(reason));
        }
      }
    } catch (error) {
      yield modelEvents.error(asProviderAdapterError(this.provider, error).details);
    }
  }
}
