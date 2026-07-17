import { storage } from "../storage.js";
import {
  connectModel,
  disconnectModel,
  testConnection,
  quickAdd,
  discoverEnvVars,
  getProviderCatalog,
  reconcileModelRoles,
  type AuthMethod,
} from "../modelConnections.js";
import type { Model, InsertModel } from "@shared/schema";
import { modelCatalogService } from "../models/catalogService.js";
import type { CatalogSyncCredentials } from "../models/catalogService.js";
import { isModelRoutable, modelRoutabilityIssue } from "../modelReadiness.js";

/** Safe model — strips sensitive credential fields before returning to clients. */
export type SafeModel = Omit<Model, "apiKey" | "oauthTokens"> & {
  apiKey: null;
  oauthTokens: null;
};

export function sanitizeModel(model: Model): SafeModel {
  return {
    ...model,
    apiKey: null,
    oauthTokens: null,
  };
}

export class ModelService {
  list(): SafeModel[] {
    return storage.getModels().map(sanitizeModel);
  }

  get(id: string): SafeModel {
    const model = storage.getModel(id);
    if (!model) throw new Error(`Model ${id} not found`);
    return sanitizeModel(model);
  }

  create(input: InsertModel): SafeModel {
    return sanitizeModel(storage.createModel(input));
  }

  update(id: string, input: Partial<InsertModel>): SafeModel {
    const existing = storage.getModel(id);
    if (!existing) throw new Error(`Model ${id} not found`);
    const prospective = { ...existing, ...input } as Model;
    if ((input.isDefault === true || input.isOrchestrator === true) && !isModelRoutable(prospective)) {
      throw new Error(`Only a connected, credential-ready model can hold a core role: ${modelRoutabilityIssue(prospective)}`);
    }
    const { isDefault, isOrchestrator, ...ordinary } = input;
    let updated = Object.keys(ordinary).length ? storage.updateModel(id, ordinary) : existing;
    if (!updated) throw new Error(`Model ${id} not found`);
    if (isDefault !== undefined || isOrchestrator !== undefined) {
      updated = storage.setModelRoles(id, { isDefault, isOrchestrator });
      if (!updated) throw new Error(`Model ${id} not found`);
    }
    if (!isModelRoutable(updated) || isDefault === false || isOrchestrator === false) {
      reconcileModelRoles();
      updated = storage.getModel(id) ?? updated;
    }
    return sanitizeModel(updated);
  }

  delete(id: string): void {
    const existing = storage.getModel(id);
    if (!existing) throw new Error(`Model ${id} not found`);
    storage.deleteModel(id);
    reconcileModelRoles();
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
    const result = await quickAdd(provider, presetModelId, authMethod, credentials);
    return {
      ...result,
      model: result.model ? sanitizeModel(result.model) : null,
    };
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
