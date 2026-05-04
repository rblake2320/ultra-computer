/**
 * Multi-Model Router
 * Routes tasks to the optimal model based on task type, capability, and speed tier.
 * Supports: OpenAI, Anthropic, Google Gemini, Mistral, Groq, Together, DeepSeek, xAI,
 * Cohere, Ollama, any OpenAI-compatible endpoint.
 * All providers are normalized to a single streaming interface.
 * 
 * Credential resolution is delegated to modelConnections.ts — supports API key,
 * OAuth tokens, environment variables, and no-auth (local models).
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "./storage.js";
import { resolveCredentials } from "./modelConnections.js";
import { cacheEngine } from "./cacheEngine.js";
import type { CacheRequest, CacheResponse, Message as CacheMessage } from "./cacheEngine.js";
import type { Model } from "@shared/schema";

export type TaskType = "research" | "code" | "write" | "browse" | "analyze" | "image" | "general" | "speed";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RouterOptions {
  taskType?: TaskType;
  modelId?: string;       // override: use specific model
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  modelId: string;
  usage?: { prompt: number; completion: number; total: number };
}

// ─── Task → Speed Tier Mapping ───────────────────────────────────────────────
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

// ─── Select best model for a task ────────────────────────────────────────────
export function selectModelForTask(taskType: TaskType, preferredModelId?: string): Model | null {
  const allModels = storage.getModels().filter(m => m.enabled);

  if (preferredModelId) {
    const found = allModels.find(m => m.id === preferredModelId);
    if (found) return found;
  }

  const tier = TASK_TIER_MAP[taskType] || "medium";

  // 1. Try to match tier + capability
  const cap = taskType === "code" ? "code" : taskType === "image" ? "image" : "chat";
  const withCap = allModels.filter(m => {
    try {
      const caps: string[] = JSON.parse(m.capabilities || "[]");
      return caps.includes(cap) && m.speedTier === tier;
    } catch {
      return false;
    }
  });
  if (withCap.length > 0) return withCap[0];

  // 2. Match tier only
  const withTier = allModels.filter(m => m.speedTier === tier);
  if (withTier.length > 0) return withTier[0];

  // 3. Default model
  const def = storage.getDefaultModel();
  if (def) return def;

  // 4. Any model
  return allModels[0] || null;
}

// ─── Unified chat completion ──────────────────────────────────────────────────
export async function chat(
  messages: ChatMessage[],
  options: RouterOptions = {}
): Promise<LLMResponse> {
  const taskType = options.taskType || "general";
  const model = selectModelForTask(taskType, options.modelId);

  if (!model) {
    throw new Error("No models configured. Add a model in the Models page.");
  }

  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.7;

  // ─── Cache: check for exact/semantic hit ──────────────────────────────
  const cacheMessages: CacheMessage[] = messages.map(m => ({
    role: m.role as CacheMessage["role"],
    content: m.content,
    isStatic: m.role === "system",
  }));
  const cacheReq: CacheRequest = {
    model: model.modelId,
    messages: cacheMessages,
    parameters: { maxTokens, temperature },
    route: `chat/${taskType}`,
    streaming: false,
  };
  const cached = cacheEngine.get(cacheReq);
  if (cached) {
    return {
      content: cached.response.content,
      model: model.name,
      modelId: model.id,
      usage: { prompt: cached.response.tokensIn, completion: cached.response.tokensOut, total: cached.response.tokensIn + cached.response.tokensOut },
    };
  }

  // ─── Cache: optimize prompt ordering for provider-side prefix caching ─
  const optimized = cacheEngine.optimizePrompt(cacheMessages, model.provider);
  const optimizedMsgs: ChatMessage[] = optimized.map(m => ({ role: m.role as ChatMessage["role"], content: m.content }));

  switch (model.provider) {
    case "openai":
    case "openai_compat":
    case "ollama":
    case "custom":
    case "mistral":
    case "groq":
    case "together":
    case "deepseek":
    case "xai":
    case "cohere":
    case "openrouter":
    case "huggingface":
    case "fireworks":
    case "cerebras":
    case "perplexity":
    case "lmstudio": {
      const result = await chatOpenAICompat(model, optimizedMsgs, maxTokens, temperature);
      cacheEngine.set(cacheReq, { content: result.content, tokensIn: result.usage?.prompt || 0, tokensOut: result.usage?.completion || 0, modelId: model.id });
      return result;
    }
    case "anthropic": {
      const result = await chatAnthropic(model, optimizedMsgs, maxTokens, temperature);
      cacheEngine.set(cacheReq, { content: result.content, tokensIn: result.usage?.prompt || 0, tokensOut: result.usage?.completion || 0, modelId: model.id });
      return result;
    }
    case "google": {
      const result = await chatGoogle(model, optimizedMsgs, maxTokens, temperature);
      cacheEngine.set(cacheReq, { content: result.content, tokensIn: result.usage?.prompt || 0, tokensOut: result.usage?.completion || 0, modelId: model.id });
      return result;
    }
    default: {
      const result = await chatOpenAICompat(model, optimizedMsgs, maxTokens, temperature);
      cacheEngine.set(cacheReq, { content: result.content, tokensIn: result.usage?.prompt || 0, tokensOut: result.usage?.completion || 0, modelId: model.id });
      return result;
    }
  }
}

// ─── Streaming version ────────────────────────────────────────────────────────
export async function* chatStream(
  messages: ChatMessage[],
  options: RouterOptions = {}
): AsyncGenerator<string> {
  const taskType = options.taskType || "general";
  const model = selectModelForTask(taskType, options.modelId);

  if (!model) {
    throw new Error("No models configured. Add a model in the Models page.");
  }

  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.7;

  switch (model.provider) {
    case "openai":
    case "openai_compat":
    case "ollama":
    case "custom":
    case "mistral":
    case "groq":
    case "together":
    case "deepseek":
    case "xai":
    case "cohere":
    case "openrouter":
    case "huggingface":
    case "fireworks":
    case "cerebras":
    case "perplexity":
    case "lmstudio":
      yield* streamOpenAICompat(model, messages, maxTokens, temperature);
      break;
    case "anthropic":
      yield* streamAnthropic(model, messages, maxTokens, temperature);
      break;
    case "google":
      yield* streamGoogle(model, messages, maxTokens, temperature);
      break;
    default:
      yield* streamOpenAICompat(model, messages, maxTokens, temperature);
  }
}

// ─── OpenAI / Ollama / LM Studio / Groq / Together / DeepSeek / xAI / any OpenAI-compat
function makeOpenAIClient(model: Model): OpenAI {
  const creds = resolveCredentials(model);
  const baseURL = creds.baseUrl || model.baseUrl || undefined;
  const apiKey = creds.apiKey || (model.provider === "ollama" ? "ollama" : "none");
  return new OpenAI({ apiKey, baseURL, timeout: 120_000 });
}

async function chatOpenAICompat(
  model: Model,
  msgs: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const client = makeOpenAIClient(model);
  const res = await client.chat.completions.create({
    model: model.modelId,
    messages: msgs,
    max_tokens: maxTokens,
    temperature,
  });
  if (!res.choices?.length) {
    throw new Error("No response from model");
  }
  return {
    content: res.choices[0]?.message?.content || "",
    model: model.name,
    modelId: model.id,
    usage: res.usage ? {
      prompt: res.usage.prompt_tokens,
      completion: res.usage.completion_tokens,
      total: res.usage.total_tokens,
    } : undefined,
  };
}

async function* streamOpenAICompat(
  model: Model,
  msgs: ChatMessage[],
  maxTokens: number,
  temperature: number
): AsyncGenerator<string> {
  const client = makeOpenAIClient(model);
  const stream = await client.chat.completions.create({
    model: model.modelId,
    messages: msgs,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────
function makeAnthropicClient(model: Model): Anthropic {
  const creds = resolveCredentials(model);
  if (!creds.apiKey) throw new Error(`No API key configured for provider anthropic (model: ${model.name})`);
  return new Anthropic({ apiKey: creds.apiKey });
}

/**
 * Build Anthropic system param with prompt caching.
 * Uses cache_control: { type: "ephemeral" } on the system content block
 * so Anthropic caches the static prefix (KB + system prompt) across requests.
 * This can reduce input token costs by up to 90% for repeated prefixes.
 */
function buildAnthropicSystem(systemContent: string | undefined): Anthropic.Messages.TextBlockParam[] | undefined {
  if (!systemContent) return undefined;
  return [
    {
      type: "text" as const,
      text: systemContent,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

async function chatAnthropic(
  model: Model,
  msgs: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const client = makeAnthropicClient(model);
  const systemMsg = msgs.find(m => m.role === "system");
  const userMsgs = msgs.filter(m => m.role !== "system").map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const res = await client.messages.create({
    model: model.modelId,
    system: buildAnthropicSystem(systemMsg?.content) as any,
    messages: userMsgs,
    max_tokens: maxTokens,
    temperature,
  });
  const text = res.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const usage = res.usage as any;
  return {
    content: text,
    model: model.name,
    modelId: model.id,
    usage: res.usage ? {
      prompt: res.usage.input_tokens,
      completion: res.usage.output_tokens,
      total: res.usage.input_tokens + res.usage.output_tokens,
      // Track cache metrics when available
      ...(usage.cache_creation_input_tokens ? { cacheCreation: usage.cache_creation_input_tokens } : {}),
      ...(usage.cache_read_input_tokens ? { cacheRead: usage.cache_read_input_tokens } : {}),
    } : undefined,
  };
}

async function* streamAnthropic(
  model: Model,
  msgs: ChatMessage[],
  maxTokens: number,
  temperature: number
): AsyncGenerator<string> {
  const client = makeAnthropicClient(model);
  const systemMsg = msgs.find(m => m.role === "system");
  const userMsgs = msgs.filter(m => m.role !== "system").map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const stream = await client.messages.create({
    model: model.modelId,
    system: buildAnthropicSystem(systemMsg?.content) as any,
    messages: userMsgs,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
async function chatGoogle(
  model: Model,
  msgs: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const creds = resolveCredentials(model);
  if (!creds.apiKey) throw new Error(`No API key configured for provider google (model: ${model.name})`);
  const genAI = new GoogleGenerativeAI(creds.apiKey);
  const gModel = genAI.getGenerativeModel({ model: model.modelId });
  const systemMsg = msgs.find(m => m.role === "system")?.content || "";
  const history = msgs.filter(m => m.role !== "system").slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const lastMsg = msgs.filter(m => m.role !== "system").at(-1)?.content || "";
  const chat = gModel.startChat({
    history,
    systemInstruction: systemMsg || undefined,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  });
  const res = await chat.sendMessage(lastMsg);
  const usageMeta = res.response.usageMetadata;
  return {
    content: res.response.text(),
    model: model.name,
    modelId: model.id,
    usage: usageMeta ? {
      prompt: usageMeta.promptTokenCount ?? 0,
      completion: usageMeta.candidatesTokenCount ?? 0,
      total: usageMeta.totalTokenCount ?? 0,
    } : undefined,
  };
}

async function* streamGoogle(
  model: Model,
  msgs: ChatMessage[],
  maxTokens: number,
  temperature: number
): AsyncGenerator<string> {
  const creds = resolveCredentials(model);
  if (!creds.apiKey) throw new Error(`No API key configured for provider google (model: ${model.name})`);
  const genAI = new GoogleGenerativeAI(creds.apiKey);
  const gModel = genAI.getGenerativeModel({ model: model.modelId });
  const systemMsg = msgs.find(m => m.role === "system")?.content || "";
  const history = msgs.filter(m => m.role !== "system").slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const lastMsg = msgs.filter(m => m.role !== "system").at(-1)?.content || "";
  const chat = gModel.startChat({
    history,
    systemInstruction: systemMsg || undefined,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  });
  const res = await chat.sendMessageStream(lastMsg);
  for await (const chunk of res.stream) {
    yield chunk.text();
  }
}

// ─── Test connectivity ────────────────────────────────────────────────────────
export async function testModelConnection(modelId: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const model = storage.getModel(modelId);
  if (!model) return { ok: false, error: "Model not found" };
  const start = Date.now();
  try {
    await chat([{ role: "user", content: "Say: pong" }], { modelId, maxTokens: 10 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
