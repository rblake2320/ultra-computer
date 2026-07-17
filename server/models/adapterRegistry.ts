import type { Model } from "@shared/schema";
import { resolveCredentials } from "../modelConnections.js";
import { AnthropicAdapter } from "./anthropicAdapter.js";
import { GoogleAdapter } from "./googleAdapter.js";
import { OpenAICompatibleAdapter, OpenAIResponsesAdapter } from "./openaiAdapters.js";
import type { ProviderAdapter } from "./providerAdapter.js";

export type ProviderAdapterFactory = (model: Model) => ProviderAdapter;

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  "cerebras",
  "cohere",
  "custom",
  "deepseek",
  "fireworks",
  "groq",
  "huggingface",
  "lmstudio",
  "mistral",
  "nvidia",
  "ollama",
  "openai_compat",
  "openrouter",
  "perplexity",
  "together",
  "xai",
]);

function credentialsFor(model: Model): { apiKey: string; baseURL?: string; sessionId: string } {
  const credentials = resolveCredentials(model);
  if (!credentials.isValid) {
    throw new Error(`No valid credentials configured for ${model.provider} model ${model.name}`);
  }
  return {
    apiKey: credentials.apiKey,
    baseURL: credentials.baseUrl,
    sessionId: `provider:${model.provider}:${model.id}`,
  };
}

const factories = new Map<string, ProviderAdapterFactory>();

export function registerProviderAdapter(
  provider: string,
  factory: ProviderAdapterFactory,
): () => void {
  if (!provider.trim()) throw new TypeError("Provider ID must not be empty");
  factories.set(provider, factory);
  return () => {
    if (factories.get(provider) === factory) factories.delete(provider);
  };
}

export function createProviderAdapter(model: Model): ProviderAdapter {
  const customFactory = factories.get(model.provider);
  if (customFactory) return customFactory(model);

  if (model.provider === "openai") {
    return new OpenAIResponsesAdapter(credentialsFor(model));
  }
  if (model.provider === "anthropic") {
    return new AnthropicAdapter(credentialsFor(model));
  }
  if (model.provider === "google") {
    const credentials = credentialsFor(model);
    return new GoogleAdapter(credentials);
  }
  if (OPENAI_COMPATIBLE_PROVIDERS.has(model.provider)) {
    const credentials = credentialsFor(model);
    return new OpenAICompatibleAdapter(model.provider, credentials);
  }
  throw new Error(
    `No provider adapter registered for '${model.provider}'. ` +
    "Configure it as openai_compat only when its endpoint implements that protocol.",
  );
}

export function clearRegisteredProviderAdapters(): void {
  factories.clear();
}
