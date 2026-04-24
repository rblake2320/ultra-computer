import type { sendUnaryData, ServerUnaryCall, ServerWritableStream } from "@grpc/grpc-js";
import { status as grpcStatus, ServerWritableStream as _SW } from "@grpc/grpc-js";
import { conversationService } from "../../services/conversationService.js";
import type { Conversation, Message } from "@shared/schema";

// ─── Proto shape types (mirror .proto messages) ───────────────────────────────

interface ProtoConversation {
  id: string;
  title: string;
  status: string;
  orchestratorModelId: string;
  activeSkillIds: string;
  createdAt: number;
  updatedAt: number;
}

interface ProtoMessage {
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

interface ProtoConversationList {
  conversations: ProtoConversation[];
}

interface ProtoMessageList {
  messages: ProtoMessage[];
}

interface ProtoDeleteResponse {
  success: boolean;
}

interface ProtoStreamEvent {
  type: string;
  payload: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toProtoConversation(c: Conversation): ProtoConversation {
  return {
    id: c.id,
    title: c.title ?? "",
    status: c.status ?? "idle",
    orchestratorModelId: c.orchestratorModelId ?? "",
    activeSkillIds: c.activeSkillIds ?? "[]",
    createdAt: c.createdAt ? new Date(c.createdAt).getTime() : 0,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).getTime() : 0,
  };
}

function toProtoMessage(m: Message): ProtoMessage {
  return {
    id: m.id,
    conversationId: m.conversationId ?? "",
    role: m.role,
    content: m.content,
    modelId: m.modelId ?? "",
    agentId: m.agentId ?? "",
    taskId: m.taskId ?? "",
    metadata: typeof m.metadata === "string" ? m.metadata : JSON.stringify(m.metadata ?? {}),
    createdAt: m.createdAt ? new Date(m.createdAt).getTime() : 0,
  };
}

// ─── Service handlers ─────────────────────────────────────────────────────────

export const conversationGrpcHandlers = {
  listConversations(
    _call: ServerUnaryCall<{}, ProtoConversationList>,
    callback: sendUnaryData<ProtoConversationList>,
  ) {
    try {
      const convs = conversationService.list();
      callback(null, { conversations: convs.map(toProtoConversation) });
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  getConversation(
    call: ServerUnaryCall<{ id: string }, ProtoConversation>,
    callback: sendUnaryData<ProtoConversation>,
  ) {
    try {
      const conv = conversationService.get(call.request.id);
      callback(null, toProtoConversation(conv));
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  createConversation(
    call: ServerUnaryCall<{ title?: string; orchestratorModelId?: string }, ProtoConversation>,
    callback: sendUnaryData<ProtoConversation>,
  ) {
    try {
      const conv = conversationService.create({
        title: call.request.title || "New Conversation",
        orchestratorModelId: call.request.orchestratorModelId || undefined,
      });
      callback(null, toProtoConversation(conv));
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  updateConversation(
    call: ServerUnaryCall<{ id: string; title?: string; status?: string; orchestratorModelId?: string }, ProtoConversation>,
    callback: sendUnaryData<ProtoConversation>,
  ) {
    try {
      const { id, ...rest } = call.request;
      const conv = conversationService.update(id, rest);
      callback(null, toProtoConversation(conv));
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  deleteConversation(
    call: ServerUnaryCall<{ id: string }, ProtoDeleteResponse>,
    callback: sendUnaryData<ProtoDeleteResponse>,
  ) {
    try {
      conversationService.delete(call.request.id);
      callback(null, { success: true });
    } catch (err: any) {
      callback({ code: grpcStatus.NOT_FOUND, message: err.message });
    }
  },

  getMessages(
    call: ServerUnaryCall<{ id: string }, ProtoMessageList>,
    callback: sendUnaryData<ProtoMessageList>,
  ) {
    try {
      const msgs = conversationService.getMessages(call.request.id);
      callback(null, { messages: msgs.map(toProtoMessage) });
    } catch (err: any) {
      callback({ code: grpcStatus.INTERNAL, message: err.message });
    }
  },

  async streamConversation(call: ServerWritableStream<{ id: string }, ProtoStreamEvent>) {
    try {
      for await (const event of conversationService.subscribe(call.request.id)) {
        if (call.destroyed) break;
        call.write({
          type: String(event.type ?? ""),
          payload: JSON.stringify(event),
        });
      }
      call.end();
    } catch (err: any) {
      call.destroy(err);
    }
  },
};
