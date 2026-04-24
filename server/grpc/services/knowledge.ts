import type { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js";
import { status as grpcStatus } from "@grpc/grpc-js";
import { knowledgeService } from "../../services/knowledgeService.js";
import type { KnowledgeEntry } from "@shared/schema";

// ─── Proto shape types ────────────────────────────────────────────────────────

interface ProtoKnowledgeEntry {
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

interface ProtoKnowledgeList {
  entries: ProtoKnowledgeEntry[];
}

interface ProtoDeleteResponse {
  success: boolean;
}

interface CreateKnowledgeRequest {
  name?: string;
  description?: string;
  content?: string;
  contentType?: string;
  category?: string;
  tags?: string;
  priority?: number;
  tierPolicy?: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toProtoEntry(e: KnowledgeEntry): ProtoKnowledgeEntry {
  return {
    id: e.id,
    name: e.name,
    description: e.description ?? "",
    content: e.content,
    summary: e.summary ?? "",
    contentType: e.contentType ?? "text",
    category: e.category ?? "",
    tags: e.tags ?? "",
    sizeBytes: e.sizeBytes ?? 0,
    tokenEstimate: e.tokenEstimate ?? 0,
    enabled: e.enabled ?? true,
    priority: e.priority ?? 50,
    tierPolicy: e.tierPolicy ?? "auto",
    createdAt: e.createdAt ? new Date(e.createdAt).getTime() : 0,
    updatedAt: e.updatedAt ? new Date(e.updatedAt).getTime() : 0,
  };
}

// ─── Service handlers ─────────────────────────────────────────────────────────

export const knowledgeGrpcHandlers = {
  listKnowledge(
    _call: ServerUnaryCall<{}, ProtoKnowledgeList>,
    callback: sendUnaryData<ProtoKnowledgeList>,
  ) {
    try {
      const entries = knowledgeService.list();
      callback(null, { entries: entries.map(toProtoEntry) });
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  getKnowledgeEntry(
    call: ServerUnaryCall<{ id: string }, ProtoKnowledgeEntry>,
    callback: sendUnaryData<ProtoKnowledgeEntry>,
  ) {
    try {
      const entry = knowledgeService.get(call.request.id);
      callback(null, toProtoEntry(entry));
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  async createKnowledgeEntry(
    call: ServerUnaryCall<CreateKnowledgeRequest, ProtoKnowledgeEntry>,
    callback: sendUnaryData<ProtoKnowledgeEntry>,
  ) {
    try {
      const req = call.request;
      const entry = await knowledgeService.create({
        name: req.name ?? "Unnamed Entry",
        content: req.content ?? "",
        description: req.description,
        contentType: req.contentType,
        category: req.category,
        tags: req.tags,
        priority: req.priority,
        tierPolicy: req.tierPolicy,
      });
      callback(null, toProtoEntry(entry));
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  deleteKnowledgeEntry(
    call: ServerUnaryCall<{ id: string }, ProtoDeleteResponse>,
    callback: sendUnaryData<ProtoDeleteResponse>,
  ) {
    try {
      knowledgeService.delete(call.request.id);
      callback(null, { success: true });
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  searchKnowledge(
    call: ServerUnaryCall<{ query: string; limit?: number }, ProtoKnowledgeList>,
    callback: sendUnaryData<ProtoKnowledgeList>,
  ) {
    try {
      const results = knowledgeService.search(call.request.query);
      const limit = call.request.limit ?? results.length;
      callback(null, { entries: results.slice(0, limit).map(toProtoEntry) });
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },
};
