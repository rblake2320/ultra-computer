import { ProviderAdapterError } from "./providerAdapter.js";
import type {
  ModelContentPart,
  ModelFinishReason,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelToolCall,
  NormalizedProviderError,
} from "./types.js";

export function textFromContent(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is Extract<ModelContentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function finishReason(reason: string | null | undefined): ModelFinishReason {
  switch (reason) {
    case "end_turn":
    case "stop":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
    case "length":
      return "length";
    case "tool_use":
    case "tool_calls":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    default:
      return "unknown";
  }
}

export function normalizeProviderError(
  provider: string,
  error: unknown,
): NormalizedProviderError {
  if (error instanceof ProviderAdapterError) return error.details;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    request_id?: unknown;
    headers?: { get?(name: string): string | null };
  };
  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  const code = typeof candidate?.code === "string"
    ? candidate.code
    : status
      ? `http_${status}`
      : `${provider}_request_failed`;
  const message = error instanceof Error
    ? error.message
    : typeof candidate?.message === "string"
      ? candidate.message
      : `${provider} request failed`;
  const providerRequestId = typeof candidate?.request_id === "string"
    ? candidate.request_id
    : candidate?.headers?.get?.("request-id") ??
      candidate?.headers?.get?.("x-request-id") ??
      undefined;

  return {
    code,
    message,
    retryable: status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500),
    status,
    providerRequestId: providerRequestId ?? undefined,
  };
}

export function asProviderAdapterError(provider: string, error: unknown): ProviderAdapterError {
  if (error instanceof ProviderAdapterError) return error;
  return new ProviderAdapterError(normalizeProviderError(provider, error), {
    cause: error,
  });
}

export function responseWithToolCalls(
  response: Omit<ModelResponse, "toolCalls">,
  toolCalls: readonly ModelToolCall[],
): ModelResponse {
  return { ...response, toolCalls };
}

export function assertRequest(request: ModelRequest): void {
  if (!request.model.trim()) throw new TypeError("Model ID must not be empty");
  if (request.messages.length === 0) throw new TypeError("At least one message is required");
  if (request.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)) {
    throw new TypeError("maxOutputTokens must be a positive safe integer");
  }
}
