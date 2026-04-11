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
      { name: "GPT-4o", modelId: "gpt-4o", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 128000, description: "Flagship multimodal model", recommended: true },
      { name: "GPT-4o Mini", modelId: "gpt-4o-mini", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Fast and affordable" },
      { name: "o4-mini", modelId: "o4-mini", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Advanced reasoning" },
      { name: "o3", modelId: "o3", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 200000, description: "Most capable reasoning model" },
      { name: "GPT-4.1", modelId: "gpt-4.1", speedTier: "powerful", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Latest generation flagship" },
      { name: "GPT-4.1 Mini", modelId: "gpt-4.1-mini", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 1000000, description: "Latest generation fast" },
      { name: "GPT-4.1 Nano", modelId: "gpt-4.1-nano", speedTier: "fast", capabilities: ["chat"], contextWindow: 1000000, description: "Ultra-fast, ultra-cheap" },
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
      { name: "Claude Opus 4", modelId: "claude-opus-4-0-20250514", speedTier: "powerful", capabilities: ["chat", "code", "analyze", "vision"], contextWindow: 200000, description: "Most capable Claude model", recommended: true },
      { name: "Claude Sonnet 4", modelId: "claude-sonnet-4-20250514", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 200000, description: "Balanced intelligence and speed" },
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
      { name: "Gemini 2.5 Pro", modelId: "gemini-2.5-pro-preview-06-05", speedTier: "powerful", capabilities: ["chat", "code", "vision", "analyze"], contextWindow: 1000000, description: "Most capable Gemini, 1M context", recommended: true },
      { name: "Gemini 2.5 Flash", modelId: "gemini-2.5-flash-preview-05-20", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Fast with thinking mode" },
      { name: "Gemini 2.0 Flash", modelId: "gemini-2.0-flash", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Workhorse model" },
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
      { name: "Mistral Large", modelId: "mistral-large-latest", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Flagship model", recommended: true },
      { name: "Codestral", modelId: "codestral-latest", speedTier: "medium", capabilities: ["code"], contextWindow: 256000, description: "Specialized for code" },
      { name: "Mistral Small", modelId: "mistral-small-latest", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Fast and efficient" },
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
      { name: "Llama 3.3 70B", modelId: "llama-3.3-70b-versatile", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Fastest inference for Llama 70B", recommended: true },
      { name: "Llama 4 Scout", modelId: "meta-llama/llama-4-scout-17b-16e-instruct", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 131072, description: "MoE 17B active params" },
      { name: "DeepSeek R1 Distill", modelId: "deepseek-r1-distill-llama-70b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Reasoning at Groq speed" },
      { name: "Qwen QWQ 32B", modelId: "qwen-qwq-32b", speedTier: "medium", capabilities: ["chat", "code", "analyze"], contextWindow: 131072, description: "Reasoning model" },
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
      { name: "Llama 3.3 70B", modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Meta Llama 3.3", recommended: true },
      { name: "DeepSeek R1", modelId: "deepseek-ai/DeepSeek-R1", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Full DeepSeek R1" },
      { name: "Qwen 2.5 72B", modelId: "Qwen/Qwen2.5-72B-Instruct-Turbo", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Alibaba Qwen 2.5" },
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
      { name: "DeepSeek Chat", modelId: "deepseek-chat", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 64000, description: "General chat model", recommended: true },
      { name: "DeepSeek Reasoner", modelId: "deepseek-reasoner", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 64000, description: "Chain-of-thought reasoning" },
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
      { name: "Grok 3", modelId: "grok-3", speedTier: "powerful", capabilities: ["chat", "code", "analyze", "vision"], contextWindow: 131072, description: "Most capable Grok", recommended: true },
      { name: "Grok 3 Mini", modelId: "grok-3-mini", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 131072, description: "Fast reasoning" },
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
      { name: "Command R+", modelId: "command-r-plus", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Flagship model with RAG", recommended: true },
      { name: "Command R", modelId: "command-r", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 128000, description: "Balanced model" },
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
      { name: "Llama 3.3 70B", modelId: "llama3.3:70b", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Meta Llama 3.3 local", recommended: true },
      { name: "Qwen 2.5 72B", modelId: "qwen2.5:72b", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 32768, description: "Alibaba Qwen local" },
      { name: "DeepSeek R1 14B", modelId: "deepseek-r1:14b", speedTier: "medium", capabilities: ["chat", "code", "analyze"], contextWindow: 32768, description: "Reasoning model, local" },
      { name: "Llama 3.2 3B", modelId: "llama3.2:3b", speedTier: "fast", capabilities: ["chat"], contextWindow: 8192, description: "Lightweight, very fast" },
      { name: "Phi-4", modelId: "phi4:14b", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 16384, description: "Microsoft Phi-4 local" },
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
      { name: "GPT-4o (via OpenRouter)", modelId: "openai/gpt-4o", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 128000, description: "OpenAI GPT-4o routed via OpenRouter" },
      { name: "Claude Sonnet 4 (via OpenRouter)", modelId: "anthropic/claude-sonnet-4", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 200000, description: "Anthropic Claude routed via OpenRouter", recommended: true },
      { name: "Gemini 2.5 Flash (via OpenRouter)", modelId: "google/gemini-2.5-flash-preview", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000, description: "Google Gemini routed via OpenRouter" },
      { name: "DeepSeek R1 (via OpenRouter)", modelId: "deepseek/deepseek-r1", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 64000, description: "DeepSeek reasoning via OpenRouter" },
      { name: "Llama 3.3 70B (via OpenRouter)", modelId: "meta-llama/llama-3.3-70b-instruct", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Meta Llama via OpenRouter" },
      { name: "Qwen 3 235B (via OpenRouter)", modelId: "qwen/qwen3-235b-a22b", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000, description: "Alibaba Qwen 3 MoE via OpenRouter" },
      { name: "Mistral Large (via OpenRouter)", modelId: "mistralai/mistral-large", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Mistral Large via OpenRouter" },
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
      { name: "DeepSeek V3 (via HF)", modelId: "deepseek-ai/DeepSeek-V3-0324", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 64000, description: "DeepSeek V3 via HF Inference", recommended: true },
      { name: "Llama 3.1 8B (via HF)", modelId: "meta-llama/Llama-3.1-8B-Instruct", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Meta Llama 3.1 via HF" },
      { name: "Qwen 2.5 72B (via HF)", modelId: "Qwen/Qwen2.5-72B-Instruct", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Qwen 2.5 via HF Inference" },
      { name: "Mistral Nemo (via HF)", modelId: "mistralai/Mistral-Nemo-Instruct-2407", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 128000, description: "Mistral Nemo via HF" },
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
      { name: "Llama 3.3 70B (Fireworks)", modelId: "accounts/fireworks/models/llama-v3p3-70b-instruct", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Llama 3.3 on Fireworks infra", recommended: true },
      { name: "DeepSeek R1 (Fireworks)", modelId: "accounts/fireworks/models/deepseek-r1", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 64000, description: "DeepSeek R1 with thinking" },
      { name: "Qwen 2.5 72B (Fireworks)", modelId: "accounts/fireworks/models/qwen2p5-72b-instruct", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 128000, description: "Qwen 2.5 on Fireworks" },
      { name: "Firefunction V2", modelId: "accounts/fireworks/models/firefunction-v2", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 8192, description: "Optimized for function calling" },
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
      { name: "Llama 3.3 70B (Cerebras)", modelId: "llama-3.3-70b", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Ultra-fast Llama 3.3 on Cerebras wafers", recommended: true },
      { name: "Llama 3.1 8B (Cerebras)", modelId: "llama3.1-8b", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000, description: "Lightning-fast small model" },
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
    const tokenResponse = await fetch(config.oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${redirectBaseUrl}/api/models/oauth/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

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

  return true;
}

/**
 * Test a model's connection by sending a minimal completion request.
 */
export async function testConnection(modelId: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const model = storage.getModel(modelId);
  if (!model) return { ok: false, error: "Model not found" };

  const creds = resolveCredentials(model);
  if (!creds.isValid) {
    return { ok: false, error: `No valid credentials — auth method: ${creds.method}` };
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

    return result;
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    storage.updateModel(modelId, {
      connectionStatus: "error",
      connectionError: e.message as any,
      lastTestedAt: Date.now() as any,
      lastTestLatency: latencyMs as any,
    });
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
  return Object.values(PROVIDER_REGISTRY).map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    supportedAuth: p.supportedAuth,
    defaultAuth: p.defaultAuth,
    apiKeyUrl: p.apiKeyUrl,
    envVarNames: p.envVarNames,
    models: p.models,
    hasBaseUrl: !!p.defaultBaseUrl || p.id === "openai_compat" || p.id === "custom" || p.id === "ollama",
  }));
}
