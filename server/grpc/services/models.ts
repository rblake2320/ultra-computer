import type { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js";
import { status as grpcStatus } from "@grpc/grpc-js";
import { modelService, type SafeModel } from "../../services/modelService.js";

// ─── Proto shape types ────────────────────────────────────────────────────────

interface ProtoModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  enabled: boolean;
  capabilities: string;
  contextWindow: number;
  isDefault: boolean;
  isOrchestrator: boolean;
  speedTier: string;
  notes: string;
  authMethod: string;
  connectionStatus: string;
  connectionError: string;
  lastTestedAt: number;
  lastTestLatency: number;
  createdAt: number;
}

interface ProtoModelList {
  models: ProtoModel[];
}

interface ProtoDeleteResponse {
  success: boolean;
}

interface ProtoTestModelResponse {
  ok: boolean;
  latency: number;
  status: string;
  error: string;
}

interface CreateModelRequest {
  name?: string;
  provider?: string;
  modelId?: string;
  baseUrl?: string;
  authMethod?: string;
  speedTier?: string;
  notes?: string;
  contextWindow?: number;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toProtoModel(m: SafeModel): ProtoModel {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    modelId: m.modelId,
    baseUrl: m.baseUrl ?? "",
    enabled: m.enabled ?? true,
    capabilities: typeof m.capabilities === "string" ? m.capabilities : JSON.stringify(m.capabilities ?? []),
    contextWindow: m.contextWindow ?? 0,
    isDefault: m.isDefault ?? false,
    isOrchestrator: m.isOrchestrator ?? false,
    speedTier: m.speedTier ?? "medium",
    notes: m.notes ?? "",
    authMethod: m.authMethod ?? "api_key",
    connectionStatus: m.connectionStatus ?? "unknown",
    connectionError: m.connectionError ?? "",
    lastTestedAt: m.lastTestedAt ? new Date(m.lastTestedAt).getTime() : 0,
    lastTestLatency: m.lastTestLatency ?? 0,
    createdAt: m.createdAt ? new Date(m.createdAt).getTime() : 0,
  };
}

// ─── Service handlers ─────────────────────────────────────────────────────────

export const modelGrpcHandlers = {
  listModels(
    _call: ServerUnaryCall<{}, ProtoModelList>,
    callback: sendUnaryData<ProtoModelList>,
  ) {
    try {
      const models = modelService.list();
      callback(null, { models: models.map(toProtoModel) });
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  getModel(
    call: ServerUnaryCall<{ id: string }, ProtoModel>,
    callback: sendUnaryData<ProtoModel>,
  ) {
    try {
      const model = modelService.get(call.request.id);
      callback(null, toProtoModel(model));
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  createModel(
    call: ServerUnaryCall<CreateModelRequest, ProtoModel>,
    callback: sendUnaryData<ProtoModel>,
  ) {
    try {
      const req = call.request;
      const model = modelService.create({
        id: crypto.randomUUID(),
        name: req.name ?? "Unnamed Model",
        provider: req.provider ?? "openai",
        modelId: req.modelId ?? "",
        baseUrl: req.baseUrl ?? null,
        authMethod: (req.authMethod as any) ?? "api_key",
        speedTier: (req.speedTier as any) ?? "medium",
        notes: req.notes ?? null,
        contextWindow: req.contextWindow ?? 4096,
        enabled: true,
        isDefault: false,
        isOrchestrator: false,
        capabilities: "[]",
        apiKey: null,
        oauthTokens: null,
        connectionStatus: "unknown",
        connectionError: null,
        lastTestedAt: null,
        lastTestLatency: null,
      });
      callback(null, toProtoModel({ ...model, apiKey: null, oauthTokens: null }));
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  deleteModel(
    call: ServerUnaryCall<{ id: string }, ProtoDeleteResponse>,
    callback: sendUnaryData<ProtoDeleteResponse>,
  ) {
    try {
      modelService.delete(call.request.id);
      callback(null, { success: true });
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  async testModel(
    call: ServerUnaryCall<{ id: string }, ProtoTestModelResponse>,
    callback: sendUnaryData<ProtoTestModelResponse>,
  ) {
    try {
      const result = await modelService.test(call.request.id);
      callback(null, {
        ok: result.ok,
        latency: result.latencyMs ?? 0,
        status: result.ok ? "ok" : "error",
        error: result.error ?? "",
      });
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },
};
