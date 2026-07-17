import { storage } from "../storage.js";
import {
  connectModel,
  disconnectModel,
  testConnection,
  quickAdd,
  discoverEnvVars,
  getProviderCatalog,
  type AuthMethod,
} from "../modelConnections.js";
import type { Model, InsertModel } from "@shared/schema";
import { modelCatalogService } from "../models/catalogService.js";
import type { CatalogSyncCredentials } from "../models/catalogService.js";

/** Safe model — strips sensitive credential fields before returning to clients. */
export type SafeModel = Omit<Model, "apiKey" | "oauthTokens"> & {
  apiKey: null;
  oauthTokens: null;
};

function sanitize(model: Model): SafeModel {
  return {
    ...model,
    apiKey: null,
    oauthTokens: null,
  };
}

export class ModelService {
  list(): SafeModel[] {
    return storage.getModels().map(sanitize);
  }

  get(id: string): SafeModel {
    const model = storage.getModel(id);
    if (!model) throw new Error(`Model ${id} not found`);
    return sanitize(model);
  }

  create(input: InsertModel): Model {
    return storage.createModel(input);
  }

  update(id: string, input: Partial<InsertModel>): SafeModel {
    const updated = storage.updateModel(id, input);
    if (!updated) throw new Error(`Model ${id} not found`);
    return sanitize(updated);
  }

  delete(id: string): void {
    const existing = storage.getModel(id);
    if (!existing) throw new Error(`Model ${id} not found`);
    storage.deleteModel(id);
  }

  async connect(
    id: string,
    authMethod: AuthMethod,
    credentials: { apiKey?: string; envVarName?: string; baseUrl?: string },
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    return connectModel(id, authMethod, credentials);
  }

  disconnect(id: string): boolean {
    return disconnectModel(id);
  }

  async test(id: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    return testConnection(id);
  }

  async quickAdd(
    provider: string,
    presetModelId: string,
    authMethod: AuthMethod,
    credentials: { apiKey?: string; envVarName?: string; baseUrl?: string },
  ) {
    return quickAdd(provider, presetModelId, authMethod, credentials);
  }

  getProviders() {
    return getProviderCatalog();
  }

  discoverEnvVars() {
    return discoverEnvVars();
  }

  getCatalog(provider?: string) {
    return modelCatalogService.list(provider);
  }

  syncCatalog(provider: string, credentials?: CatalogSyncCredentials) {
    return modelCatalogService.sync(provider, credentials);
  }
}

export const modelService = new ModelService();
