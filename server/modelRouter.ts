/**
 * Multi-Model Router
 * Routes tasks to the optimal model based on task type, capability, and speed tier.
 * Supports: OpenAI, Anthropic, Google Gemini, Ollama, any OpenAI-compatible endpoint.
 * All providers are normalized to a single streaming interface.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage.js";
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

  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.7;

  switch (model.provider) {
    case "openai":
    case "openai_compat":
    case "ollama":
    case "custom":
      return chatOpenAICompat(model, messages, maxTokens, temperature);
    case "anthropic":
      return chatAnthropic(model, messages, maxTokens, temperature);
    case "google":
      return chatGoogle(model, messages, maxTokens, temperature);
    default:
      return chatOpenAICompat(model, messages, maxTokens, temperature);
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

  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.7;

  switch (model.provider) {
    case "openai":
    case "openai_compat":
    case "ollama":
    case "custom":
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

// ─── OpenAI / Ollama / LM Studio / any OpenAI-compat ────────────────────────
function makeOpenAIClient(model: Model): OpenAI {
  const baseURL = model.baseUrl || undefined;
  const apiKey = model.apiKey || (model.provider === "ollama" ? "ollama" : "none");
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
  return new Anthropic({ apiKey: model.apiKey || process.env.ANTHROPIC_API_KEY || "" });
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
    system: systemMsg?.content,
    messages: userMsgs,
    max_tokens: maxTokens,
    temperature,
  });
  const text = res.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  return {
    content: text,
    model: model.name,
    modelId: model.id,
    usage: res.usage ? {
      prompt: res.usage.input_tokens,
      completion: res.usage.output_tokens,
      total: res.usage.input_tokens + res.usage.output_tokens,
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
    system: systemMsg?.content,
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
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(model.apiKey || process.env.GOOGLE_API_KEY || "");
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
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(model.apiKey || process.env.GOOGLE_API_KEY || "");
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
