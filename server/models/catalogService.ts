import crypto from "crypto";
import { storage } from "../storage.js";
import {
  PROVIDER_REGISTRY,
  resolveCredentials,
} from "../modelConnections.js";
import { governedFetch } from "../governedFetch.js";
import type { ModelCatalogEntry } from "@shared/schema";
import type { ProviderModelDescriptor } from "./types.js";

const CANONICAL_BASE_URLS: Readonly<Record<string, string>> = {
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  openai: "https://api.openai.com/v1",
};

interface DiscoveryCredentials {
  apiKey: string;
  baseUrl: string;
}

export interface CatalogSyncCredentials {
  apiKey?: string;
  baseUrl?: string;
}

export interface CatalogSyncResult {
  provider: string;
  discovered: number;
  retired: number;
  syncedAt: number;
  entries: ModelCatalogEntry[];
}

function catalogId(provider: string, modelId: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${provider}\0${modelId}`)
    .digest("hex")
    .slice(0, 24);
  return `${provider}:${digest}`;
}

export function resolveSuppliedCatalogCredentials(
  provider: string,
  supplied?: CatalogSyncCredentials,
): DiscoveryCredentials | null {
  if (!supplied?.apiKey?.trim() && !supplied?.baseUrl?.trim()) return null;
  const apiKey = supplied.apiKey?.trim() ?? "";
  const baseUrl = supplied.baseUrl?.trim()
    || CANONICAL_BASE_URLS[provider]
    || PROVIDER_REGISTRY[provider]?.defaultBaseUrl;
  if (!baseUrl || (provider !== "ollama" && !apiKey)) return null;
  return { apiKey, baseUrl };
}

function configuredCredentials(provider: string): DiscoveryCredentials | null {
  for (const model of storage.getModels()) {
    if (model.provider !== provider) continue;
    const credentials = resolveCredentials(model);
    if (!credentials.isValid) continue;
    const baseUrl =
      credentials.baseUrl ??
      CANONICAL_BASE_URLS[provider] ??
      PROVIDER_REGISTRY[provider]?.defaultBaseUrl;
    if (baseUrl) return { apiKey: credentials.apiKey, baseUrl };
  }

  const definition = PROVIDER_REGISTRY[provider];
  const envName = definition?.envVarNames.find((name) => process.env[name]);
  const apiKey = envName ? process.env[envName] ?? "" : "";
  const baseUrl =
    CANONICAL_BASE_URLS[provider] ??
    definition?.defaultBaseUrl;
  if (!baseUrl || (provider !== "ollama" && !apiKey)) return null;
  return { apiKey, baseUrl };
}

function lifecycleFromGoogleModel(name: string): ProviderModelDescriptor["lifecycle"] {
  if (/deprecated|retired/i.test(name)) return "deprecated";
  if (/preview|experimental|exp-/i.test(name)) return "preview";
  return "available";
}

export function parseOpenAIModelList(
  provider: string,
  payload: unknown,
): ProviderModelDescriptor[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("Provider model list did not contain a data array");
  return data.flatMap((item): ProviderModelDescriptor[] => {
    if (!item || typeof item !== "object") return [];
    const modelId = (item as { id?: unknown }).id;
    if (typeof modelId !== "string" || !modelId.trim()) return [];
    return [{
      provider,
      modelId,
      displayName: modelId,
      capabilities: [],
      lifecycle: "unknown",
      source: "provider",
      metadata: {
        created: (item as { created?: unknown }).created,
        ownedBy: (item as { owned_by?: unknown }).owned_by,
      },
    }];
  });
}

export function parseAnthropicModelList(payload: unknown): ProviderModelDescriptor[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("Anthropic model list did not contain a data array");
  return data.flatMap((item): ProviderModelDescriptor[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim()) return [];
    return [{
      provider: "anthropic",
      modelId: row.id,
      displayName: typeof row.display_name === "string" ? row.display_name : row.id,
      capabilities: [],
      lifecycle: "unknown",
      source: "provider",
      metadata: {
        createdAt: row.created_at,
        type: row.type,
      },
    }];
  });
}

export function parseGoogleModelList(payload: unknown): ProviderModelDescriptor[] {
  const data = (payload as { models?: unknown })?.models;
  if (!Array.isArray(data)) throw new Error("Google model list did not contain a models array");
  return data.flatMap((item): ProviderModelDescriptor[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || !row.name.trim()) return [];
    const modelId = row.name.replace(/^models\//, "");
    const methods = Array.isArray(row.supportedGenerationMethods)
      ? row.supportedGenerationMethods.filter((value): value is string => typeof value === "string")
      : [];
    return [{
      provider: "google",
      modelId,
      displayName: typeof row.displayName === "string" ? row.displayName : modelId,
      capabilities: [],
      lifecycle: lifecycleFromGoogleModel(modelId),
      source: "provider",
      contextWindow: typeof row.inputTokenLimit === "number" ? row.inputTokenLimit : undefined,
      maxOutputTokens: typeof row.outputTokenLimit === "number" ? row.outputTokenLimit : undefined,
      metadata: {
        supportedGenerationMethods: methods,
        version: row.version,
      },
    }];
  });
}

export function parseOllamaModelList(payload: unknown): ProviderModelDescriptor[] {
  const data = (payload as { models?: unknown })?.models;
  if (!Array.isArray(data)) throw new Error("Ollama model list did not contain a models array");
  return data.flatMap((item): ProviderModelDescriptor[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const modelId = typeof row.model === "string"
      ? row.model
      : typeof row.name === "string"
        ? row.name
        : "";
    if (!modelId) return [];
    return [{
      provider: "ollama",
      modelId,
      displayName: modelId,
      capabilities: [],
      lifecycle: "available",
      source: "provider",
      metadata: {
        size: row.size,
        modifiedAt: row.modified_at,
        details: row.details,
      },
    }];
  });
}

async function discoverProviderModels(
  provider: string,
  credentials: DiscoveryCredentials,
): Promise<ProviderModelDescriptor[]> {
  let url: string;
  let headers: Record<string, string> = { Accept: "application/json" };
  let parse: (payload: unknown) => ProviderModelDescriptor[];

  if (provider === "anthropic") {
    url = `${credentials.baseUrl.replace(/\/+$/, "")}/v1/models`;
    headers = {
      ...headers,
      "anthropic-version": "2023-06-01",
      "x-api-key": credentials.apiKey,
    };
    parse = parseAnthropicModelList;
  } else if (provider === "google") {
    url = `${credentials.baseUrl.replace(/\/+$/, "")}/v1beta/models`;
    headers["x-goog-api-key"] = credentials.apiKey;
    parse = parseGoogleModelList;
  } else if (provider === "ollama") {
    const base = credentials.baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
    url = `${base}/api/tags`;
    parse = parseOllamaModelList;
  } else {
    url = `${credentials.baseUrl.replace(/\/+$/, "")}/models`;
    if (credentials.apiKey) headers.Authorization = `Bearer ${credentials.apiKey}`;
    parse = (payload) => parseOpenAIModelList(provider, payload);
  }

  const response = await governedFetch(
    url,
    { headers, method: "GET" },
    `model-catalog:${provider}`,
    "network",
    "network:model_catalog_sync",
  );
  if (!response.ok) {
    throw new Error(`Model catalog sync failed for ${provider}: HTTP ${response.status}`);
  }
  return parse(await response.json());
}

function persistDescriptor(
  descriptor: ProviderModelDescriptor,
  now: number,
  existing?: ModelCatalogEntry,
): ModelCatalogEntry {
  return storage.upsertModelCatalogEntry({
    id: catalogId(descriptor.provider, descriptor.modelId),
    provider: descriptor.provider,
    modelId: descriptor.modelId,
    displayName: descriptor.displayName,
    capabilities: JSON.stringify(descriptor.capabilities),
    lifecycle: descriptor.lifecycle,
    source: descriptor.source,
    compatibility: existing?.compatibility ?? "unverified",
    contextWindow: descriptor.contextWindow ?? null,
    maxOutputTokens: descriptor.maxOutputTokens ?? null,
    metadata: JSON.stringify(descriptor.metadata ?? {}),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    retiredAt: null,
  });
}

export class ModelCatalogService {
  list(provider?: string): ModelCatalogEntry[] {
    return storage.getModelCatalog(provider);
  }

  async sync(
    provider: string,
    supplied?: CatalogSyncCredentials,
  ): Promise<CatalogSyncResult> {
    if (!PROVIDER_REGISTRY[provider]) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const credentials = resolveSuppliedCatalogCredentials(provider, supplied) ?? configuredCredentials(provider);
    if (!credentials) {
      throw new Error(`No configured credentials or base URL for provider: ${provider}`);
    }

    const descriptors = await discoverProviderModels(provider, credentials);
    const now = Date.now();
    const existing = storage.getModelCatalog(provider);
    const existingByModelId = new Map(existing.map((entry) => [entry.modelId, entry]));
    const seen = new Set<string>();
    const entries = descriptors.map((descriptor) => {
      seen.add(descriptor.modelId);
      return persistDescriptor(descriptor, now, existingByModelId.get(descriptor.modelId));
    });

    let retired = 0;
    for (const entry of existing) {
      if (entry.source !== "provider" || seen.has(entry.modelId) || entry.lifecycle === "retired") continue;
      storage.upsertModelCatalogEntry({
        ...entry,
        lifecycle: "retired",
        compatibility: "retired",
        retiredAt: now,
      });
      retired += 1;
    }

    return { provider, discovered: entries.length, retired, syncedAt: now, entries };
  }
}

export const modelCatalogService = new ModelCatalogService();
