/**
 * Provider-neutral model router.
 *
 * Routing selects a configured model. Provider adapters own protocol details,
 * including native streaming, multimodal content, tools, and error translation.
 */

import crypto from "crypto";
import type { Model } from "@shared/schema";
import { cacheEngine } from "./cacheEngine.js";
import type {
  CacheRequest,
  CacheResponse,
  Message as CacheMessage,
} from "./cacheEngine.js";
import {
  createProviderAdapter,
  hasCapabilities,
  matchCapabilities,
  type ModelCapability,
  type ModelMessage,
  type ModelRequest,
  type ModelResponse,
  type ModelToolCall,
  type ProviderAdapter,
} from "./models/index.js";
import { storage } from "./storage.js";
import {
  reserveModelRequest,
  settleModelReservation,
  settleReservationConservatively,
} from "./spendGuard.js";

export type TaskType =
  | "research"
  | "code"
  | "write"
  | "browse"
  | "analyze"
  | "image"
  | "general"
  | "speed";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RouterOptions {
  taskType?: TaskType;
  /** Configured model ID or unambiguous upstream provider model ID. */
  modelId?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: ModelRequest["reasoningEffort"];
  tools?: ToolDef[];
  /** Connection probes and other freshness-sensitive calls must bypass response caching. */
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export interface LLMResponse {
  content: string;
  model: string;
  modelId: string;
  usage?: { prompt: number; completion: number; total: number };
}

const TASK_TIER_MAP: Record<TaskType, string> = {
  research: "powerful",
  code: "powerful",
  write: "medium",
  browse: "medium",
  analyze: "powerful",
  image: "medium",
  general: "medium",
  speed: "fast",
};

const TASK_CAPABILITY_MAP: Readonly<Record<TaskType, readonly ModelCapability[]>> = {
  research: ["chat"],
  code: ["chat", "code"],
  write: ["chat"],
  browse: ["chat"],
  analyze: ["chat"],
  image: ["chat", "vision"],
  general: ["chat"],
  speed: ["chat"],
};

function modelCapabilities(model: Model): string[] {
  try {
    const parsed = JSON.parse(model.capabilities || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function resolvePreferredModel(models: readonly Model[], identifier: string): Model | null {
  const internal = models.find((model) => model.id === identifier);
  if (internal) return internal;

  const upstreamMatches = models.filter((model) => model.modelId === identifier);
  if (upstreamMatches.length === 1) return upstreamMatches[0];
  if (upstreamMatches.length > 1) {
    throw new Error(
      `Model ID '${identifier}' is ambiguous across configured providers; use the configured model ID`,
    );
  }
  return null;
}

export function selectModelFromCandidates(
  models: readonly Model[],
  taskType: TaskType,
  preferredModelId?: string,
  defaultModelId?: string,
): Model | null {
  const enabledModels = models.filter((model) => model.enabled);
  const required = TASK_CAPABILITY_MAP[taskType] ?? ["chat"];

  if (preferredModelId) {
    const preferred = resolvePreferredModel(enabledModels, preferredModelId);
    if (!preferred) return null;
    const match = matchCapabilities(modelCapabilities(preferred), { all: required });
    if (!match.matches) {
      throw new Error(
        `Model '${preferred.name}' cannot perform '${taskType}'; missing capabilities: ` +
        `${[...match.missing, ...match.missingAny].join(", ")}`,
      );
    }
    return preferred;
  }

  let compatible = enabledModels.filter((model) =>
    hasCapabilities(modelCapabilities(model), { all: required }),
  );
  if (!compatible.length) return null;

  // Reasoning is preferred for analysis but not mandatory: a verified chat
  // model must remain usable as a first/default model instead of falling into
  // the connected-but-unroutable trap.
  if (taskType === "analyze") {
    compatible = [...compatible].sort((a, b) =>
      Number(modelCapabilities(b).includes("reasoning")) - Number(modelCapabilities(a).includes("reasoning")),
    );
  }

  const tier = TASK_TIER_MAP[taskType] ?? "medium";
  const tierMatch = compatible.find((model) => model.speedTier === tier);
  if (tierMatch) return tierMatch;

  const defaultModel = defaultModelId
    ? compatible.find((model) => model.id === defaultModelId)
    : undefined;
  return defaultModel ?? compatible[0];
}

export function selectModelForTask(
  taskType: TaskType,
  preferredModelId?: string,
): Model | null {
  const defaultModel = storage.getDefaultModel();
  return selectModelFromCandidates(
    storage.getModels(),
    taskType,
    preferredModelId,
    defaultModel?.id,
  );
}

function requestCapabilities(request: ModelRequest, streaming: boolean): ModelCapability[] {
  const capabilities: ModelCapability[] = ["chat"];
  if (streaming) capabilities.push("streaming");
  if (request.tools?.length) capabilities.push("tools");
  if (request.responseFormat && request.responseFormat.type !== "text") {
    capabilities.push("structured-output");
  }
  for (const message of request.messages) {
    if (typeof message.content === "string") continue;
    if (message.content.some((part) => part.type === "image")) capabilities.push("vision");
    if (message.content.some((part) => part.type === "file")) capabilities.push("file-input");
    if (message.content.some((part) => part.type === "audio")) capabilities.push("audio-input");
  }
  return [...new Set(capabilities)];
}

function assertAdapterSupports(
  model: Model,
  adapter: ProviderAdapter,
  request: ModelRequest,
  streaming: boolean,
): void {
  const required = requestCapabilities(request, streaming);
  const match = matchCapabilities(adapter.features.capabilities, { all: required });
  if (!match.matches) {
    throw new Error(
      `Provider adapter '${adapter.provider}' cannot satisfy model '${model.name}'; ` +
      `missing capabilities: ${match.missing.join(", ")}`,
    );
  }
  if (streaming && (!adapter.features.streaming || !adapter.stream)) {
    throw new Error(`Provider adapter '${adapter.provider}' does not implement streaming`);
  }
}

function toModelRequest(
  model: Model,
  messages: readonly ChatMessage[],
  options: RouterOptions,
): ModelRequest {
  return {
    model: model.modelId,
    messages: messages.map((message): ModelMessage => ({
      role: message.role,
      content: message.content,
    })),
    maxOutputTokens: options.maxTokens ?? 4096,
    reasoningEffort:
      options.reasoningEffort ??
      (model.provider === "openai" && /^gpt-5\.6(?:-|$)/.test(model.modelId)
        ? "medium"
        : undefined),
    // Do not force sampling parameters. New reasoning models often reject them.
    temperature: options.temperature,
    tools: options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    })),
  };
}

function toolCallBlocks(toolCalls: readonly ModelToolCall[]): string {
  return toolCalls.map((toolCall) => {
    let args: unknown = {};
    try {
      args = JSON.parse(toolCall.arguments || "{}");
    } catch {
      args = {};
    }
    return `\n<tool_call>\n${JSON.stringify({ name: toolCall.name, args })}\n</tool_call>`;
  }).join("");
}

function cacheRequest(
  model: Model,
  taskType: TaskType,
  messages: readonly ChatMessage[],
  options: RouterOptions,
): CacheRequest | null {
  if (options.bypassCache || options.tools?.length) return null;
  const cacheMessages: CacheMessage[] = messages.map((message) => ({
    role: message.role as CacheMessage["role"],
    content: message.content,
    isStatic: message.role === "system",
  }));
  return {
    model: model.modelId,
    messages: cacheMessages,
    parameters: {
      maxTokens: options.maxTokens ?? 4096,
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    },
    route: `chat/${taskType}`,
    streaming: false,
  };
}

async function guardedGenerate(
  adapter: ProviderAdapter,
  model: Model,
  request: ModelRequest,
  signal?: AbortSignal,
): Promise<ModelResponse> {
  const reservation = reserveModelRequest(model, request);
  let settled = false;
  try {
    const result = await adapter.generate(request, {
      requestId: crypto.randomUUID(),
      signal,
    });
    settleModelReservation(reservation, model, result.usage);
    settled = true;
    return result;
  } catch (error) {
    if (!settled) {
      // Once adapter execution begins, transport failures are ambiguous: the
      // provider may have accepted and billed the request.
      settleReservationConservatively(reservation, model);
      settled = true;
    }
    throw error;
  }
}

export async function chat(
  messages: ChatMessage[],
  options: RouterOptions = {},
): Promise<LLMResponse> {
  const taskType = options.taskType ?? "general";
  const model = selectModelForTask(taskType, options.modelId);
  if (!model) {
    throw new Error(
      options.modelId
        ? `Configured model '${options.modelId}' is unavailable or incompatible`
        : `No enabled model supports the required '${taskType}' capabilities`,
    );
  }

  const cacheKey = cacheRequest(model, taskType, messages, options);
  const cached = cacheKey ? cacheEngine.get(cacheKey) : null;
  if (cached) {
    return {
      content: cached.response.content,
      model: model.name,
      modelId: model.id,
      usage: {
        prompt: cached.response.tokensIn,
        completion: cached.response.tokensOut,
        total: cached.response.tokensIn + cached.response.tokensOut,
      },
    };
  }

  const request = toModelRequest(model, messages, options);
  const adapter = createProviderAdapter(model);
  assertAdapterSupports(model, adapter, request, false);
  const result = await guardedGenerate(adapter, model, request, options.signal);
  const content = result.text || result.reasoning || "";
  const finalContent = content + toolCallBlocks(result.toolCalls);

  if (cacheKey) {
    const cacheResponse: CacheResponse = {
      content: finalContent,
      tokensIn: result.usage?.inputTokens ?? 0,
      tokensOut: result.usage?.outputTokens ?? 0,
      modelId: model.id,
    };
    cacheEngine.set(cacheKey, cacheResponse);
  }

  return {
    content: finalContent,
    model: model.name,
    modelId: model.id,
    usage: result.usage ? {
      prompt: result.usage.inputTokens,
      completion: result.usage.outputTokens,
      total: result.usage.totalTokens,
    } : undefined,
  };
}

export async function* chatStream(
  messages: ChatMessage[],
  options: RouterOptions = {},
): AsyncGenerator<string> {
  const taskType = options.taskType ?? "general";
  const model = selectModelForTask(taskType, options.modelId);
  if (!model) {
    throw new Error(
      options.modelId
        ? `Configured model '${options.modelId}' is unavailable or incompatible`
        : `No enabled model supports the required '${taskType}' capabilities`,
    );
  }

  const request = toModelRequest(model, messages, options);
  const adapter = createProviderAdapter(model);
  assertAdapterSupports(model, adapter, request, true);
  const reservation = reserveModelRequest(model, request);

  let emittedText = false;
  let reasoning = "";
  let usage: ModelResponse["usage"];
  let providerCompleted = false;
  let settled = false;
  const toolCalls = new Map<number, { name: string; arguments: string }>();

  try {
    for await (const event of adapter.stream!(request, {
      requestId: crypto.randomUUID(),
      signal: options.signal,
    })) {
      switch (event.type) {
        case "output_text.delta":
          emittedText = true;
          yield event.delta;
          break;
        case "reasoning.delta":
          reasoning += event.delta;
          break;
        case "tool_call.delta": {
          const call = toolCalls.get(event.index) ?? { name: "", arguments: "" };
          if (event.name) call.name += event.name;
          if (event.argumentsDelta) call.arguments += event.argumentsDelta;
          toolCalls.set(event.index, call);
          break;
        }
        case "response.usage":
          usage = event.usage;
          break;
        case "response.completed":
          providerCompleted = true;
          break;
        case "response.error":
          throw new Error(
            `${adapter.provider} request failed (${event.error.code}): ${event.error.message}`,
          );
      }
    }

    settleModelReservation(reservation, model, providerCompleted ? usage : undefined);
    settled = true;

    if (toolCalls.size) {
      yield toolCallBlocks(
        [...toolCalls.entries()]
          .sort(([left], [right]) => left - right)
          .map(([index, call]) => ({
            id: `tool-call-${index}`,
            name: call.name,
            arguments: call.arguments,
          })),
      );
    } else if (!emittedText && reasoning) {
      yield reasoning;
    }
  } finally {
    if (!settled) {
      settleReservationConservatively(reservation, model);
    }
  }
}

export async function testModelConnection(
  modelId: string,
): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const model = storage.getModel(modelId);
  if (!model) return { ok: false, error: "Model not found" };
  const start = Date.now();
  try {
    const adapter = createProviderAdapter(model);
    const request: ModelRequest = {
      model: model.modelId,
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
      maxOutputTokens: 10,
    };
    const result = await guardedGenerate(adapter, model, request);
    if (!result.text.trim() && result.toolCalls.length === 0) {
      throw new Error("Provider returned an empty connection-test response");
    }

    const capabilities = new Set(modelCapabilities(model));
    capabilities.add("chat");
    storage.updateModel(model.id, {
      capabilities: JSON.stringify([...capabilities]),
    });

    const catalogEntry = storage.getModelCatalog(model.provider)
      .find((entry) => entry.modelId === model.modelId);
    if (catalogEntry) {
      const verifiedCapabilities = new Set<string>();
      try {
        const parsed = JSON.parse(catalogEntry.capabilities);
        if (Array.isArray(parsed)) {
          for (const capability of parsed) {
            if (typeof capability === "string") verifiedCapabilities.add(capability);
          }
        }
      } catch {
        // Invalid historical metadata is replaced with the verified evidence.
      }
      verifiedCapabilities.add("chat");
      storage.upsertModelCatalogEntry({
        ...catalogEntry,
        capabilities: JSON.stringify([...verifiedCapabilities]),
        compatibility: "compatible",
        lastSeenAt: Date.now(),
      });
      storage.createModelProbeResult({
        id: crypto.randomUUID(),
        catalogId: catalogEntry.id,
        status: "compatible",
        capabilities: JSON.stringify(["chat"]),
        evidence: JSON.stringify({
          method: "explicit_minimal_text_generation",
          responseReceived: true,
        }),
        error: null,
        latencyMs: Date.now() - start,
        probedAt: Date.now(),
      });
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown provider error",
      latencyMs: Date.now() - start,
    };
  }
}
