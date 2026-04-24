/**
 * Typed HTTP client that calls the gRPC-Web bridge endpoints at /api/grpc/*.
 * Acts like a gRPC client but communicates over regular HTTP/JSON — no
 * gRPC-Web protocol or HTTP/2 required.
 */

const BASE = "/api/grpc";

async function grpcCall<T>(service: string, method: string, request: unknown): Promise<T> {
  const key = (window as any).__ULTRA_API_KEY__ ?? "";
  const res = await fetch(`${BASE}/${service}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `gRPC bridge error: ${res.status}`);
  }
  return res.json();
}

// ─── Types (mirrors proto messages) ──────────────────────────────────────────

export interface GrpcConversation {
  id: string;
  title: string;
  status: string;
  orchestratorModelId: string;
  activeSkillIds: string;
  createdAt: number;
  updatedAt: number;
}

export interface GrpcConversationList {
  conversations: GrpcConversation[];
}

export interface GrpcMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  modelId: string;
  agentId: string;
  taskId: string;
  metadata: string;
  createdAt: number;
}

export interface GrpcMessageList {
  messages: GrpcMessage[];
}

export interface CreateConversationRequest {
  title?: string;
  orchestratorModelId?: string;
}

export interface GrpcModel {
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

export interface GrpcModelList {
  models: GrpcModel[];
}

export interface GrpcTestModelResponse {
  ok: boolean;
  latency: number;
  status: string;
  error: string;
}

export interface GrpcKnowledgeEntry {
  id: string;
  name: string;
  description: string;
  content: string;
  summary: string;
  contentType: string;
  category: string;
  tags: string;
  sizeBytes: number;
  tokenEstimate: number;
  enabled: boolean;
  priority: number;
  tierPolicy: string;
  createdAt: number;
  updatedAt: number;
}

export interface GrpcKnowledgeList {
  entries: GrpcKnowledgeEntry[];
}

export interface GrpcDeleteResponse {
  success: boolean;
}

// ─── Client objects ───────────────────────────────────────────────────────────

export const conversationsGrpc = {
  list: () =>
    grpcCall<GrpcConversationList>("conversations", "list", {}),
  get: (id: string) =>
    grpcCall<GrpcConversation>("conversations", "get", { id }),
  create: (req: CreateConversationRequest) =>
    grpcCall<GrpcConversation>("conversations", "create", req),
  update: (req: { id: string; title?: string; status?: string; orchestratorModelId?: string }) =>
    grpcCall<GrpcConversation>("conversations", "update", req),
  delete: (id: string) =>
    grpcCall<GrpcDeleteResponse>("conversations", "delete", { id }),
  getMessages: (id: string) =>
    grpcCall<GrpcMessageList>("conversations", "messages", { id }),
};

export const modelsGrpc = {
  list: () =>
    grpcCall<GrpcModelList>("models", "list", {}),
  get: (id: string) =>
    grpcCall<GrpcModel>("models", "get", { id }),
  test: (id: string) =>
    grpcCall<GrpcTestModelResponse>("models", "test", { id }),
};

export const knowledgeGrpc = {
  list: () =>
    grpcCall<GrpcKnowledgeList>("knowledge", "list", {}),
  get: (id: string) =>
    grpcCall<GrpcKnowledgeEntry>("knowledge", "get", { id }),
  search: (query: string, limit = 10) =>
    grpcCall<GrpcKnowledgeList>("knowledge", "search", { query, limit }),
};
