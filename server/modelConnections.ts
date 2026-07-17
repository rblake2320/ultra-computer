/**
 * Model Connections Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Multi-auth connection system for LLM providers.
 * Supports: API Key, OAuth2, Environment Variables, Browser Login, 1-Click Presets.
 * Each provider defines its supported auth methods, OAuth endpoints, and env var names.
 * Credentials are resolved at runtime — the model router calls resolveCredentials()
 * to get the active API key/token regardless of which auth method was used.
 */

import crypto from "crypto";
import { storage } from "./storage.js";
import type { Model } from "@shared/schema";
import { isModelRoutable } from "./modelReadiness.js";
import { governedFetch } from "./governedFetch.js";

// ═══════════════════════════════════════════════════════════════════════════
// Provider Definitions
// ═══════════════════════════════════════════════════════════════════════════

export interface ProviderAuthConfig {
  id: string;
  name: string;
  icon: string;           // lucide icon name
  supportedAuth: AuthMethod[];
  defaultAuth: AuthMethod;
  apiKeyPrefix?: string;  // e.g. "sk-" for OpenAI
  apiKeyUrl?: string;     // URL to generate API keys
  envVarNames: string[];  // common env var names for this provider
  defaultBaseUrl?: string;
  oauthConfig?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    clientIdRequired: boolean;
  };
  models: ProviderModelPreset[];
}

export interface ProviderModelPreset {
  name: string;
  modelId: string;
  speedTier: "fast" | "medium" | "powerful";
  capabilities: string[];
  contextWindow: number;
  description: string;
  recommended?: boolean;
}

export type AuthMethod = "api_key" | "oauth" | "env_var" | "browser_login" | "none";

export type ConnectionStatus = "unconfigured" | "connected" | "disconnected" | "expired" | "error";

// ─── Provider Registry ───────────────────────────────────────────────────────

export const PROVIDER_REGISTRY: Record<string, ProviderAuthConfig> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    icon: "Brain",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyPrefix: "sk-",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    envVarNames: ["OPENAI_API_KEY"],
    models: [
      { name: "GPT-5.6 Sol", modelId: "gpt-5.6-sol", speedTier: "powerful", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1050000, description: "Frontier GPT-5.6 model for complex professional work", recommended: true },
      { name: "GPT-5.6 Terra", modelId: "gpt-5.6-terra", speedTier: "medium", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1050000, description: "GPT-5.6 model balancing intelligence and cost" },
      { name: "GPT-5.6 Luna", modelId: "gpt-5.6-luna", speedTier: "fast", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1050000, description: "GPT-5.6 model optimized for cost-sensitive workloads" },
      { name: "o4-mini", modelId: "o4-mini", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 200000, description: "Advanced reasoning" },
      { name: "o3", modelId: "o3", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 200000, description: "Powerful reasoning model" },
    ],
  },

  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    icon: "Shield",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyPrefix: "sk-ant-",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    envVarNames: ["ANTHROPIC_API_KEY"],
    models: [
      { name: "Claude Opus 4.6", modelId: "claude-opus-4-6-20260205", speedTier: "powerful", capabilities: ["chat", "code", "analyze", "vision"], contextWindow: 1000000, description: "Most capable Claude, 1M context", recommended: true },
      { name: "Claude Sonnet 4.6", modelId: "claude-sonnet-4-6-20260217", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Balanced intelligence, 1M context" },
      { name: "Claude Haiku 3.5", modelId: "claude-3-5-haiku-20241022", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 200000, description: "Fastest Claude" },
    ],
  },

  google: {
    id: "google",
    name: "Google Gemini",
    icon: "Sparkles",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    envVarNames: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    models: [
      { name: "Gemini 3.1 Pro", modelId: "gemini-3.1-pro-preview", speedTier: "powerful", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1000000, description: "Most advanced reasoning, 1M context", recommended: true },
      { name: "Gemini 3 Flash", modelId: "gemini-3-flash-preview", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Most powerful agentic/coding model" },
      { name: "Gemini 3.1 Flash-Lite", modelId: "gemini-3.1-flash-lite-preview", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Cheapest & fastest, high volume" },
      { name: "Gemini 2.5 Flash", modelId: "gemini-2.5-flash", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Best price-performance with thinking" },
      { name: "Gemini 2.5 Pro", modelId: "gemini-2.5-pro", speedTier: "powerful", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1000000, description: "Advanced reasoning, stable" },
    ],
  },

  mistral: {
    id: "mistral",
    name: "Mistral AI",
    icon: "Wind",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://console.mistral.ai/api-keys/",
    envVarNames: ["MISTRAL_API_KEY"],
    defaultBaseUrl: "https://api.mistral.ai/v1",
    models: [
      { name: "Mistral Large 3", modelId: "mistral-large-latest", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 256000, description: "MoE 41B/675B, Apache 2.0", recommended: true },
      { name: "Codestral", modelId: "codestral-latest", speedTier: "medium", capabilities: ["code"], contextWindow: 256000, description: "Specialized for code" },
      { name: "Mistral Small 3", modelId: "mistral-small-latest", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 128000, description: "24B, 128K context, multimodal" },
    ],
  },

  groq: {
    id: "groq",
    name: "Groq",
    icon: "Zap",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyPrefix: "gsk_",
    apiKeyUrl: "https://console.groq.com/keys",
    envVarNames: ["GROQ_API_KEY"],
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      { name: "GPT-OSS 120B", modelId: "openai/gpt-oss-120b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "OpenAI open-source, ultra-fast on Groq", recommended: true },
      { name: "Llama 3.3 70B", modelId: "llama-3.3-70b-versatile", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 131072, description: "Fast versatile Llama on Groq" },
      { name: "Llama 4 Scout", modelId: "meta-llama/llama-4-scout-17b-16e-instruct", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 131072, description: "MoE 17B active, multimodal" },
      { name: "Qwen 3 32B", modelId: "qwen/qwen3-32b", speedTier: "medium", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Dense 32B, reasoning" },
      { name: "GPT-OSS 20B", modelId: "openai/gpt-oss-20b", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 131072, description: "Lightweight GPT open-source" },
    ],
  },

  together: {
    id: "together",
    name: "Together AI",
    icon: "Users",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://api.together.xyz/settings/api-keys",
    envVarNames: ["TOGETHER_API_KEY"],
    defaultBaseUrl: "https://api.together.xyz/v1",
    models: [
      { name: "Llama 4 Maverick", modelId: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", speedTier: "powerful", capabilities: ["chat", "code", "vision"], contextWindow: 1048000, description: "400B MoE, 128 experts, multimodal", recommended: true },
      { name: "Llama 4 Scout", modelId: "meta-llama/Llama-4-Scout-17B-16E-Instruct", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 524000, description: "109B MoE, 16 experts" },
      { name: "DeepSeek R1", modelId: "deepseek-ai/DeepSeek-R1", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Full DeepSeek R1 reasoning" },
      { name: "Llama 3.3 70B", modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Meta Llama 3.3 Turbo" },
      { name: "Qwen 3 235B", modelId: "Qwen/Qwen3-235B-A22B-Instruct", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "MoE 22B active, frontier" },
    ],
  },

  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    icon: "Search",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    envVarNames: ["DEEPSEEK_API_KEY"],
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: [
      { name: "DeepSeek V3.2", modelId: "deepseek-chat", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 163000, description: "V3.2 Speciale, 685B MoE", recommended: true },
      { name: "DeepSeek R1", modelId: "deepseek-reasoner", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Chain-of-thought reasoning" },
    ],
  },

  xai: {
    id: "xai",
    name: "xAI (Grok)",
    icon: "Bot",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://console.x.ai/",
    envVarNames: ["XAI_API_KEY"],
    defaultBaseUrl: "https://api.x.ai/v1",
    models: [
      { name: "Grok 4", modelId: "grok-4", speedTier: "powerful", capabilities: ["chat", "code", "analyze", "vision"], contextWindow: 256000, description: "Most capable Grok, 256K context", recommended: true },
      { name: "Grok 4.1 Fast", modelId: "grok-4.1-fast", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 2000000, description: "2M context, ultra-fast" },
      { name: "Grok 3", modelId: "grok-3", speedTier: "medium", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Previous gen, still capable" },
    ],
  },

  cohere: {
    id: "cohere",
    name: "Cohere",
    icon: "Layers",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://dashboard.cohere.com/api-keys",
    envVarNames: ["COHERE_API_KEY", "CO_API_KEY"],
    defaultBaseUrl: "https://api.cohere.com/v2",
    models: [
      { name: "Command A", modelId: "command-a-03-2025", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 256000, description: "111B flagship, 256K context", recommended: true },
      { name: "Command R+", modelId: "command-r-plus", speedTier: "medium", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Previous gen with RAG" },
    ],
  },

  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    icon: "Server",
    supportedAuth: ["none"],
    defaultAuth: "none",
    defaultBaseUrl: "http://localhost:11434/v1",
    envVarNames: [],
    models: [
      { name: "Qwen 3.6 27B", modelId: "qwen3.6:27b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Qwen 3.6 27B — local reasoning + tool use (brain)" },
      { name: "Llama 4 Scout", modelId: "llama4:scout", speedTier: "powerful", capabilities: ["chat", "code", "vision"], contextWindow: 131072, description: "MoE 17B active, multimodal", recommended: true },
      { name: "Qwen 3 32B", modelId: "qwen3:32b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Dense 32B, dual-mode reasoning" },
      { name: "Llama 3.3 70B", modelId: "llama3.3:70b", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Meta Llama 3.3 local" },
      { name: "Gemma 3 27B", modelId: "gemma3:27b", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 128000, description: "Google Gemma 3 local" },
      { name: "Phi-4", modelId: "phi4:14b", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 16384, description: "Microsoft Phi-4 local" },
      { name: "DeepSeek R1 14B", modelId: "deepseek-r1:14b", speedTier: "medium", capabilities: ["chat", "code", "analyze"], contextWindow: 32768, description: "Reasoning model, local" },
    ],
  },

  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    icon: "Globe",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://openrouter.ai/settings/keys",
    envVarNames: ["OPENROUTER_API_KEY"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      { name: "Claude Sonnet 4.6 (via OR)", modelId: "anthropic/claude-sonnet-4.6", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Anthropic Claude 4.6 via OpenRouter", recommended: true },
      { name: "GPT-5.6 Sol (via OR)", modelId: "openai/gpt-5.6-sol", speedTier: "powerful", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1050000, description: "OpenAI GPT-5.6 Sol via OpenRouter" },
      { name: "Gemini 3.1 Pro (via OR)", modelId: "google/gemini-3.1-pro-preview", speedTier: "powerful", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1000000, description: "Google Gemini 3.1 Pro via OpenRouter" },
      { name: "Llama 4 Maverick (via OR)", modelId: "meta-llama/llama-4-maverick", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1048000, description: "Meta Llama 4 MoE via OpenRouter" },
      { name: "DeepSeek V3 (via OR)", modelId: "deepseek/deepseek-chat-v3-0324", speedTier: "fast", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "DeepSeek V3 — cheapest cloud brain ($0.14/$0.28 per M)", recommended: true },
      { name: "DeepSeek R1 (via OR)", modelId: "deepseek/deepseek-r1", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "DeepSeek reasoning via OpenRouter" },
      { name: "Qwen 3 235B (via OR)", modelId: "qwen/qwen3-235b-a22b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Alibaba Qwen 3 MoE via OpenRouter" },
      { name: "Mistral Large 3 (via OR)", modelId: "mistralai/mistral-large", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 256000, description: "Mistral Large 3 via OpenRouter" },
    ],
  },

  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    icon: "Brain",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://huggingface.co/settings/tokens",
    envVarNames: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
    defaultBaseUrl: "https://router.huggingface.co/v1",
    models: [
      { name: "Qwen 3 235B (via HF)", modelId: "Qwen/Qwen3-235B-A22B-Instruct", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Qwen 3 MoE via HF Inference", recommended: true },
      { name: "Llama 4 Scout (via HF)", modelId: "meta-llama/Llama-4-Scout-17B-16E-Instruct", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 131072, description: "Llama 4 MoE via HF" },
      { name: "Llama 3.3 70B (via HF)", modelId: "meta-llama/Llama-3.3-70B-Instruct", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 131072, description: "Meta Llama 3.3 via HF" },
      { name: "Qwen 3 8B (via HF)", modelId: "Qwen/Qwen3-8B", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 40960, description: "Fast Qwen 3 via HF" },
      { name: "Phi-4 (via HF)", modelId: "microsoft/phi-4", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 16384, description: "Microsoft Phi-4 via HF" },
    ],
  },

  fireworks: {
    id: "fireworks",
    name: "Fireworks AI",
    icon: "Sparkles",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://fireworks.ai/account/api-keys",
    envVarNames: ["FIREWORKS_API_KEY"],
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    models: [
      { name: "DeepSeek V3.2 (Fireworks)", modelId: "accounts/fireworks/models/deepseek-v3p2", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 163000, description: "685B MoE on Fireworks", recommended: true },
      { name: "Llama 4 Maverick (Fireworks)", modelId: "accounts/fireworks/models/llama-4-maverick-17b-128e-instruct", speedTier: "powerful", capabilities: ["chat", "code", "vision"], contextWindow: 1048000, description: "400B MoE, multimodal" },
      { name: "Qwen 3 235B (Fireworks)", modelId: "accounts/fireworks/models/qwen3-235b-a22b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Qwen 3 MoE on Fireworks" },
      { name: "Llama 3.3 70B (Fireworks)", modelId: "accounts/fireworks/models/llama-v3p3-70b-instruct", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Llama 3.3 on Fireworks" },
    ],
  },

  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    icon: "Zap",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://cloud.cerebras.ai/",
    envVarNames: ["CEREBRAS_API_KEY"],
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    models: [
      { name: "GPT-OSS 120B (Cerebras)", modelId: "gpt-oss-120b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "OpenAI OSS at ~3000 tok/s", recommended: true },
      { name: "Qwen 3 32B (Cerebras)", modelId: "qwen-3-32b", speedTier: "fast", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Dense 32B, wafer-scale speed" },
      { name: "Llama 3.1 8B (Cerebras)", modelId: "llama3.1-8b", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 131072, description: "~2200 tok/s, lightning fast" },
    ],
  },

  perplexity: {
    id: "perplexity",
    name: "Perplexity",
    icon: "Search",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://www.perplexity.ai/settings/api",
    envVarNames: ["PERPLEXITY_API_KEY", "PPLX_API_KEY"],
    defaultBaseUrl: "https://api.perplexity.ai",
    models: [
      { name: "Sonar Pro", modelId: "sonar-pro", speedTier: "powerful", capabilities: ["chat", "analyze"], contextWindow: 200000, description: "Search-grounded reasoning with citations", recommended: true },
      { name: "Sonar Reasoning Pro", modelId: "sonar-reasoning-pro", speedTier: "powerful", capabilities: ["chat", "analyze"], contextWindow: 200000, description: "Advanced reasoning with search" },
      { name: "Sonar", modelId: "sonar", speedTier: "fast", capabilities: ["chat"], contextWindow: 128000, description: "Fast search-grounded answers" },
      { name: "Sonar Deep Research", modelId: "sonar-deep-research", speedTier: "powerful", capabilities: ["chat", "analyze"], contextWindow: 128000, description: "Multi-step research agent" },
    ],
  },

  lmstudio: {
    id: "lmstudio",
    name: "LM Studio (Local)",
    icon: "Server",
    supportedAuth: ["none"],
    defaultAuth: "none",
    defaultBaseUrl: "http://localhost:1234/v1",
    envVarNames: [],
    models: [
      { name: "LM Studio Model", modelId: "local-model", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 8192, description: "Use whatever model is loaded in LM Studio", recommended: true },
    ],
  },

  openai_compat: {
    id: "openai_compat",
    name: "OpenAI-Compatible",
    icon: "Globe",
    supportedAuth: ["api_key", "env_var", "none"],
    defaultAuth: "api_key",
    envVarNames: [],
    models: [],
  },

  custom: {
    id: "custom",
    name: "Custom Endpoint",
    icon: "Settings",
    supportedAuth: ["api_key", "env_var", "none"],
    defaultAuth: "api_key",
    envVarNames: [],
    models: [],
  },

  // ─── NVIDIA NIM (Inference Microservices) ────────────────────────────────────────────────────────────
  // OpenAI-compatible API at integrate.api.nvidia.com/v1
  // Scout has a 10,000,000 token context window — ideal for massive MCP/CLI/SDK context injection
  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM",
    icon: "Cpu",
    supportedAuth: ["api_key", "env_var"],
    defaultAuth: "api_key",
    apiKeyUrl: "https://build.nvidia.com/",
    envVarNames: ["NVIDIA_API_KEY", "NIM_API_KEY"],
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      // ── Llama 4 Scout — 10M token context (flagship for MCP/tool/SDK injection) ──
      {
        name: "Llama 4 Scout (NVIDIA NIM)",
        modelId: "meta/llama-4-scout-17b-16e-instruct",
        speedTier: "fast",
        capabilities: ["chat", "code", "vision", "analyze"],
        contextWindow: 10000000,
        description: "10M token context — ideal for massive MCP/CLI/SDK context injection. 17B active params, 16 experts.",
        recommended: true,
      },
      // ── Llama 4 Maverick — 1M context, 128 experts, multimodal ──
      {
        name: "Llama 4 Maverick (NVIDIA NIM)",
        modelId: "meta/llama-4-maverick-17b-128e-instruct",
        speedTier: "powerful",
        capabilities: ["chat", "code", "vision", "analyze"],
        contextWindow: 1048576,
        description: "1M context, 128 experts, multimodal. Best for complex agentic tasks.",
      },
      // ── Nemotron Ultra 253B — NVIDIA flagship reasoning ──
      {
        name: "Nemotron Ultra 253B (NVIDIA NIM)",
        modelId: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "NVIDIA's most capable reasoning model. 253B params, top-tier coding & math.",
      },
      // ── Nemotron Super 49B ──
      {
        name: "Nemotron Super 49B (NVIDIA NIM)",
        modelId: "nvidia/llama-3.3-nemotron-super-49b-v1",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "NVIDIA Nemotron Super — strong reasoning and coding, 49B.",
      },
      // ── Nemotron Nano 8B — fastest NVIDIA model ──
      {
        name: "Nemotron Nano 8B (NVIDIA NIM)",
        modelId: "nvidia/llama-3.1-nemotron-nano-8b-v1",
        speedTier: "fast",
        capabilities: ["chat", "code"],
        contextWindow: 131072,
        description: "Ultra-fast 8B Nemotron. Best for high-throughput agentic tasks.",
      },
      // ── DeepSeek R1 via NIM ──
      {
        name: "DeepSeek R1 (NVIDIA NIM)",
        modelId: "deepseek-ai/deepseek-r1",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 163840,
        description: "Full DeepSeek R1 chain-of-thought reasoning via NVIDIA NIM infrastructure.",
      },
      // ── DeepSeek R1 Distill Llama 70B via NIM ──
      {
        name: "DeepSeek R1 Distill Llama 70B (NVIDIA NIM)",
        modelId: "deepseek-ai/deepseek-r1-distill-llama-70b",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "DeepSeek R1 reasoning distilled into Llama 70B via NIM.",
      },
      // ── Mistral Large via NIM ──
      {
        name: "Mistral Large (NVIDIA NIM)",
        modelId: "mistralai/mistral-large-2-instruct",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "Mistral Large 2 via NVIDIA NIM infrastructure.",
      },
      // ── Mistral NeMo 12B via NIM ──
      {
        name: "Mistral NeMo 12B (NVIDIA NIM)",
        modelId: "mistralai/mistral-nemo-12b-instruct",
        speedTier: "fast",
        capabilities: ["chat", "code"],
        contextWindow: 131072,
        description: "12B Mistral NeMo — fast and capable via NIM.",
      },
      // ── Qwen 3 235B A22B via NIM ──
      {
        name: "Qwen 3 235B A22B (NVIDIA NIM)",
        modelId: "qwen/qwen3-235b-a22b",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "Qwen 3 MoE 235B with 22B active params via NVIDIA NIM.",
      },
      // ── Qwen 3 32B via NIM ──
      {
        name: "Qwen 3 32B (NVIDIA NIM)",
        modelId: "qwen/qwen3-32b",
        speedTier: "medium",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "Dense 32B Qwen 3 via NVIDIA NIM.",
      },
      // ── Llama 3.3 70B via NIM ──
      {
        name: "Llama 3.3 70B (NVIDIA NIM)",
        modelId: "meta/llama-3.3-70b-instruct",
        speedTier: "fast",
        capabilities: ["chat", "code"],
        contextWindow: 131072,
        description: "Meta Llama 3.3 70B via NVIDIA NIM.",
      },
      // ── Llama 3.1 405B via NIM ──
      {
        name: "Llama 3.1 405B (NVIDIA NIM)",
        modelId: "meta/llama-3.1-405b-instruct",
        speedTier: "powerful",
        capabilities: ["chat", "code", "analyze"],
        contextWindow: 131072,
        description: "Meta's largest open model via NVIDIA NIM infrastructure.",
      },
      // ── Phi-4 via NIM ──
      {
        name: "Phi-4 (NVIDIA NIM)",
        modelId: "microsoft/phi-4",
        speedTier: "fast",
        capabilities: ["chat", "code"],
        contextWindow: 16384,
        description: "Microsoft Phi-4 14B via NVIDIA NIM.",
      },
    ],
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// Credential Resolution
// ═══════════════════════════════════════════════════════════════════════════

export interface ResolvedCredentials {
  apiKey: string;
  baseUrl?: string;
  method: AuthMethod;
  isValid: boolean;
  expiresAt?: number; // for OAuth tokens
}

/**
 * Resolve the active credentials for a model, regardless of auth method.
 * This is the single entry point the model router uses to get credentials.
 */
export function resolveCredentials(model: Model): ResolvedCredentials {
  const method = (model.authMethod || "api_key") as AuthMethod;

  switch (method) {
    case "api_key":
      return {
        apiKey: model.apiKey || "",
        baseUrl: model.baseUrl || getProviderBaseUrl(model.provider),
        method: "api_key",
        isValid: !!(model.apiKey && model.apiKey.length > 0),
      };

    case "env_var": {
      const envName = model.envVarName || "";
      const resolved = envName ? process.env[envName] || "" : "";
      return {
        apiKey: resolved,
        baseUrl: model.baseUrl || getProviderBaseUrl(model.provider),
        method: "env_var",
        isValid: !!resolved,
      };
    }

    case "oauth": {
      let tokens: any = {};
      try { tokens = JSON.parse(model.oauthTokens || "{}"); } catch { tokens = {}; }
      const expired = tokens.expires_at ? Date.now() > tokens.expires_at : false;
      return {
        apiKey: tokens.access_token || "",
        baseUrl: model.baseUrl || getProviderBaseUrl(model.provider),
        method: "oauth",
        isValid: !!(tokens.access_token && !expired),
        expiresAt: tokens.expires_at,
      };
    }

    case "none":
      // Ollama, local models — no auth needed
      return {
        apiKey: model.provider === "ollama" ? "ollama" : (model.apiKey || "none"),
        baseUrl: model.baseUrl || getProviderBaseUrl(model.provider),
        method: "none",
        isValid: true,
      };

    default:
      return {
        apiKey: model.apiKey || "",
        baseUrl: model.baseUrl || getProviderBaseUrl(model.provider),
        method: "api_key",
        isValid: !!(model.apiKey),
      };
  }
}

/**
 * Get the default base URL for a provider (used when model.baseUrl is not set).
 */
function getProviderBaseUrl(provider: string): string | undefined {
  const config = PROVIDER_REGISTRY[provider];
  return config?.defaultBaseUrl;
}

// ═══════════════════════════════════════════════════════════════════════════
// OAuth Flow for Model Providers
// ═══════════════════════════════════════════════════════════════════════════

// In-memory pending OAuth states for model connections
const pendingModelOAuthStates = new Map<string, { modelId: string; provider: string; createdAt: number }>();

function purgeExpiredModelOAuthStates(): void {
  const TEN_MINUTES = 10 * 60 * 1000;
  const now = Date.now();
  for (const [key, val] of pendingModelOAuthStates.entries()) {
    if (now - val.createdAt > TEN_MINUTES) pendingModelOAuthStates.delete(key);
  }
}

/**
 * Initiate OAuth flow for a model provider.
 * Returns the authorization URL the frontend should redirect to.
 */
export function initiateModelOAuth(
  modelId: string,
  provider: string,
  redirectBaseUrl: string,
  clientId: string,
): { authUrl: string; state: string } | { error: string } {
  purgeExpiredModelOAuthStates();

  const config = PROVIDER_REGISTRY[provider];
  if (!config?.oauthConfig) {
    return { error: `Provider '${provider}' does not support OAuth` };
  }

  const state = crypto.randomBytes(24).toString("hex");
  pendingModelOAuthStates.set(state, { modelId, provider, createdAt: Date.now() });

  const url = new URL(config.oauthConfig.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${redirectBaseUrl}/api/models/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (config.oauthConfig.scopes.length > 0) {
    url.searchParams.set("scope", config.oauthConfig.scopes.join(" "));
  }

  return { authUrl: url.toString(), state };
}

/**
 * Handle OAuth callback — exchange code for tokens and store them.
 */
export async function handleModelOAuthCallback(
  code: string,
  state: string,
  redirectBaseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<{ success: boolean; modelId?: string; error?: string }> {
  purgeExpiredModelOAuthStates();

  const pending = pendingModelOAuthStates.get(state);
  if (!pending) return { success: false, error: "Invalid or expired OAuth state" };
  pendingModelOAuthStates.delete(state);

  const config = PROVIDER_REGISTRY[pending.provider];
  if (!config?.oauthConfig) return { success: false, error: "Provider does not support OAuth" };

  try {
    const tokenResponse = await governedFetch(config.oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${redirectBaseUrl}/api/models/oauth/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    }, "oauth:model-callback", "network", "network:oauth_token_exchange");

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.json().catch(() => ({}));
      return { success: false, error: (errBody as any).error_description || `Token exchange failed (${tokenResponse.status})` };
    }

    const tokenData = await tokenResponse.json() as Record<string, any>;
    const oauthTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      token_type: tokenData.token_type || "Bearer",
      scope: tokenData.scope,
    };

    storage.updateModel(pending.modelId, {
      authMethod: "oauth",
      oauthTokens: JSON.stringify(oauthTokens),
      connectionStatus: "connected",
      connectionError: null as any,
      lastTestedAt: Date.now() as any,
    });

    return { success: true, modelId: pending.modelId };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// Connection Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connect a model with a specific auth method.
 * Validates credentials and updates connection status.
 */
export async function connectModel(
  modelId: string,
  authMethod: AuthMethod,
  credentials: {
    apiKey?: string;
    envVarName?: string;
    baseUrl?: string;
  },
): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const model = storage.getModel(modelId);
  if (!model) return { ok: false, error: "Model not found" };

  // Update the model's auth config
  const updates: Record<string, any> = { authMethod };

  if (authMethod === "api_key" && credentials.apiKey) {
    updates.apiKey = credentials.apiKey;
  }
  if (authMethod === "env_var" && credentials.envVarName) {
    updates.envVarName = credentials.envVarName;
  }
  if (credentials.baseUrl !== undefined) {
    updates.baseUrl = credentials.baseUrl;
  }
  if (authMethod === "none") {
    // No credentials needed (Ollama, etc.)
  }

  storage.updateModel(modelId, updates);

  // Test the connection
  const result = await testConnection(modelId);

  // Update status based on test
  storage.updateModel(modelId, {
    connectionStatus: result.ok ? "connected" : "error",
    connectionError: (result.error || null) as any,
    lastTestedAt: Date.now() as any,
    lastTestLatency: (result.latencyMs || null) as any,
  });
  reconcileModelRoles(result.ok ? modelId : undefined);

  return result;
}

/**
 * Disconnect a model — clears credentials and resets status.
 */
export function disconnectModel(modelId: string): boolean {
  const model = storage.getModel(modelId);
  if (!model) return false;

  storage.updateModel(modelId, {
    apiKey: null as any,
    oauthTokens: null as any,
    envVarName: null as any,
    connectionStatus: "disconnected",
    connectionError: null as any,
    lastTestedAt: null as any,
    lastTestLatency: null as any,
  });

  reconcileModelRoles();

  return true;
}

/** Keep both core roles on connected, credential-ready models when possible. */
export function reconcileModelRoles(preferredModelId?: string): void {
  const routable = storage.getModels().filter(isModelRoutable);
  const preferred = preferredModelId
    ? routable.find(model => model.id === preferredModelId)
    : undefined;
  const currentDefault = routable.find(model => model.isDefault);
  const currentOrchestrator = routable.find(model => model.isOrchestrator);
  const defaultTarget = currentDefault ?? preferred ?? routable[0];
  const orchestratorTarget = currentOrchestrator ?? preferred ?? defaultTarget ?? routable[0];

  storage.setModelRoles(defaultTarget?.id ?? null, { isDefault: Boolean(defaultTarget) });
  storage.setModelRoles(orchestratorTarget?.id ?? null, { isOrchestrator: Boolean(orchestratorTarget) });
}

/**
 * Test a model's connection by sending a minimal completion request.
 */
export async function testConnection(modelId: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const model = storage.getModel(modelId);
  if (!model) return { ok: false, error: "Model not found" };

  const creds = resolveCredentials(model);
  if (!creds.isValid) {
    const error = `No valid credentials — auth method: ${creds.method}`;
    storage.updateModel(modelId, {
      connectionStatus: "error",
      connectionError: error,
      lastTestedAt: Date.now() as any,
      lastTestLatency: null as any,
    });
    reconcileModelRoles();
    return { ok: false, error };
  }

  const start = Date.now();
  try {
    // Use the model router's test function, but first ensure credentials are resolved
    const { testModelConnection } = await import("./modelRouter.js");
    const result = await testModelConnection(modelId);

    // Update DB with test result
    storage.updateModel(modelId, {
      connectionStatus: result.ok ? "connected" : "error",
      connectionError: (result.error || null) as any,
      lastTestedAt: Date.now() as any,
      lastTestLatency: (result.latencyMs || null) as any,
    });

    reconcileModelRoles(result.ok ? modelId : undefined);

    return result;
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    storage.updateModel(modelId, {
      connectionStatus: "error",
      connectionError: e.message as any,
      lastTestedAt: Date.now() as any,
      lastTestLatency: latencyMs as any,
    });
    reconcileModelRoles();
    return { ok: false, error: e.message, latencyMs };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 1-Click Setup Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a model from a 1-click preset.
 * Auto-fills all fields from the provider registry. User only needs to provide credentials.
 */
export function createFromPreset(
  provider: string,
  presetModelId: string,
  authMethod: AuthMethod,
  credentials: { apiKey?: string; envVarName?: string; baseUrl?: string },
): Model | null {
  const providerConfig = PROVIDER_REGISTRY[provider];
  if (!providerConfig) return null;

  const preset = providerConfig.models.find(m => m.modelId === presetModelId);
  if (!preset) return null;

  const id = crypto.randomUUID();

  const model = storage.createModel({
    id,
    name: preset.name,
    provider,
    modelId: preset.modelId,
    baseUrl: credentials.baseUrl || providerConfig.defaultBaseUrl || null,
    apiKey: credentials.apiKey || null,
    enabled: true,
    capabilities: JSON.stringify(preset.capabilities),
    contextWindow: preset.contextWindow,
    isDefault: false,
    isOrchestrator: false,
    speedTier: preset.speedTier,
    notes: preset.description,
    authMethod,
    oauthTokens: null as any,
    envVarName: credentials.envVarName || null,
    connectionStatus: "unconfigured",
    connectionError: null as any,
    lastTestedAt: null as any,
    lastTestLatency: null as any,
  });

  return model;
}

/**
 * Quick-add: create model + connect in one step.
 * Used by the 1-click flow on the frontend.
 */
export async function quickAdd(
  provider: string,
  presetModelId: string,
  authMethod: AuthMethod,
  credentials: { apiKey?: string; envVarName?: string; baseUrl?: string },
): Promise<{ model: Model | null; connection: { ok: boolean; error?: string; latencyMs?: number } }> {
  const model = createFromPreset(provider, presetModelId, authMethod, credentials);
  if (!model) return { model: null, connection: { ok: false, error: "Invalid provider or preset" } };

  const connection = await connectModel(model.id, authMethod, credentials);
  return { model, connection };
}


// ═══════════════════════════════════════════════════════════════════════════
// Environment Variable Discovery
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan for common LLM API key environment variables that are already set.
 * Returns which providers could be auto-connected via env vars.
 */
export function discoverEnvVars(): Array<{ provider: string; envVar: string; isSet: boolean; masked: string }> {
  const results: Array<{ provider: string; envVar: string; isSet: boolean; masked: string }> = [];

  for (const [providerId, config] of Object.entries(PROVIDER_REGISTRY)) {
    for (const envName of config.envVarNames) {
      const value = process.env[envName] || "";
      const isSet = value.length > 0;
      results.push({
        provider: providerId,
        envVar: envName,
        isSet,
        // Only mask if key is long enough to not be entirely revealed by the mask window
        masked: isSet ? (value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "***") : "",
      });
    }
  }

  return results;
}

/**
 * Get provider info for the frontend (without leaking secrets).
 */
export function getProviderCatalog(): Array<{
  id: string;
  name: string;
  icon: string;
  supportedAuth: AuthMethod[];
  defaultAuth: AuthMethod;
  apiKeyUrl?: string;
  envVarNames: string[];
  models: ProviderModelPreset[];
  hasBaseUrl: boolean;
}> {
  return Object.values(PROVIDER_REGISTRY).map((p) => {
    const presets = new Map(p.models.map((model) => [model.modelId, model]));
    for (const entry of storage.getModelCatalog(p.id)) {
      if (entry.lifecycle === "retired" || presets.has(entry.modelId)) continue;
      let capabilities: string[] = [];
      try {
        const parsed = JSON.parse(entry.capabilities);
        if (Array.isArray(parsed)) {
          capabilities = parsed.filter((value): value is string => typeof value === "string");
        }
      } catch {
        capabilities = [];
      }
      presets.set(entry.modelId, {
        name: entry.displayName,
        modelId: entry.modelId,
        speedTier: "medium",
        capabilities,
        contextWindow: entry.contextWindow ?? 0,
        description:
          `Discovered from ${p.name}; compatibility is ${entry.compatibility}. ` +
          "Run an explicit connection test before selecting it.",
      });
    }
    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      supportedAuth: p.supportedAuth,
      defaultAuth: p.defaultAuth,
      apiKeyUrl: p.apiKeyUrl,
      envVarNames: p.envVarNames,
      models: [...presets.values()],
      hasBaseUrl: !!p.defaultBaseUrl || p.id === "openai_compat" || p.id === "custom" || p.id === "ollama",
    };
  });
}
