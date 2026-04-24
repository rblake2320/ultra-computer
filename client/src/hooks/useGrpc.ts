import { useQuery, useMutation } from "@tanstack/react-query";
import { conversationsGrpc, modelsGrpc, knowledgeGrpc } from "../lib/grpcClient.js";

// ─── Conversations ─────────────────────────────────────────────────────────────

export function useConversationsGrpc() {
  return useQuery({
    queryKey: ["grpc", "conversations"],
    queryFn: conversationsGrpc.list,
  });
}

export function useConversationGrpc(id: string) {
  return useQuery({
    queryKey: ["grpc", "conversations", id],
    queryFn: () => conversationsGrpc.get(id),
    enabled: Boolean(id),
  });
}

export function useConversationMessagesGrpc(id: string) {
  return useQuery({
    queryKey: ["grpc", "conversations", id, "messages"],
    queryFn: () => conversationsGrpc.getMessages(id),
    enabled: Boolean(id),
  });
}

export function useCreateConversationGrpc() {
  return useMutation({
    mutationFn: conversationsGrpc.create,
  });
}

export function useDeleteConversationGrpc() {
  return useMutation({
    mutationFn: (id: string) => conversationsGrpc.delete(id),
  });
}

// ─── Models ───────────────────────────────────────────────────────────────────

export function useModelsGrpc() {
  return useQuery({
    queryKey: ["grpc", "models"],
    queryFn: modelsGrpc.list,
  });
}

export function useModelGrpc(id: string) {
  return useQuery({
    queryKey: ["grpc", "models", id],
    queryFn: () => modelsGrpc.get(id),
    enabled: Boolean(id),
  });
}

export function useTestModelGrpc() {
  return useMutation({
    mutationFn: (id: string) => modelsGrpc.test(id),
  });
}

// ─── Knowledge ────────────────────────────────────────────────────────────────

export function useKnowledgeGrpc() {
  return useQuery({
    queryKey: ["grpc", "knowledge"],
    queryFn: knowledgeGrpc.list,
  });
}

export function useSearchKnowledgeGrpc() {
  return useMutation({
    mutationFn: ({ query, limit }: { query: string; limit?: number }) =>
      knowledgeGrpc.search(query, limit),
  });
}
