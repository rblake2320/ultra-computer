/**
 * Provider-neutral model contracts.
 *
 * These types intentionally do not depend on any provider SDK. Adapters translate
 * provider-specific payloads at the boundary so the router can reason about
 * capabilities and events without importing SDK response types.
 */

export const KNOWN_MODEL_CAPABILITIES = [
  "chat",
  "code",
  "reasoning",
  "vision",
  "tools",
  "parallel-tools",
  "structured-output",
  "web-search",
  "image-generation",
  "audio-input",
  "audio-output",
  "video-input",
  "file-input",
  "embeddings",
  "computer-use",
  "streaming",
] as const;

export type KnownModelCapability = (typeof KNOWN_MODEL_CAPABILITIES)[number];

/**
 * Capability identifiers are open-ended by design. Providers can introduce a
 * capability before Ultra Computer has first-class behavior for it.
 */
export type ModelCapability = KnownModelCapability | (string & {});

export type ModelLifecycle = "available" | "preview" | "deprecated" | "retired" | "unknown";
export type ModelCatalogSource = "provider" | "configured" | "preset";

export interface ProviderModelDescriptor {
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: readonly ModelCapability[];
  lifecycle: ModelLifecycle;
  source: ModelCatalogSource;
  contextWindow?: number;
  maxOutputTokens?: number;
  discoveredAt?: string;
  deprecationDate?: string;
  retirementDate?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface TextContentPart {
  type: "text";
  text: string;
}

interface ImageContentPartBase {
  type: "image";
  mediaType?: string;
  detail?: "auto" | "low" | "high";
}

export type ImageContentPart = ImageContentPartBase &
  (
    | { url: string; base64?: never }
    | { base64: string; url?: never }
  );

export interface AudioContentPart {
  type: "audio";
  base64: string;
  mediaType: string;
}

interface FileContentPartBase {
  type: "file";
  mediaType?: string;
  filename?: string;
}

export type FileContentPart = FileContentPartBase &
  (
    | { url: string; base64?: never }
    | { base64: string; url?: never }
  );

export type ModelContentPart =
  | TextContentPart
  | ImageContentPart
  | AudioContentPart
  | FileContentPart;

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | readonly ModelContentPart[];
  name?: string;
  toolCallId?: string;
}

export interface ModelToolDefinition {
  name: string;
  description?: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

export type ModelToolChoice =
  | "auto"
  | "none"
  | "required"
  | { name: string };

export interface ModelResponseFormat {
  type: "text" | "json_object" | "json_schema";
  name?: string;
  schema?: Readonly<Record<string, unknown>>;
  strict?: boolean;
}

export interface ModelRequest {
  model: string;
  messages: readonly ModelMessage[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: readonly string[];
  tools?: readonly ModelToolDefinition[];
  toolChoice?: ModelToolChoice;
  responseFormat?: ModelResponseFormat;
  metadata?: Readonly<Record<string, string>>;
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export type ModelFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "cancelled"
  | "error"
  | "unknown";

export interface ModelResponse {
  provider: string;
  model: string;
  responseId?: string;
  text: string;
  reasoning?: string;
  refusal?: string;
  toolCalls: readonly ModelToolCall[];
  usage?: ModelUsage;
  finishReason: ModelFinishReason;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface NormalizedProviderError {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
  providerRequestId?: string;
}
