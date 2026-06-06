import { Server, ServerCredentials, loadPackageDefinition } from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { join, resolve } from "path";
import { conversationGrpcHandlers } from "./services/conversations.js";
import { modelGrpcHandlers } from "./services/models.js";
import { knowledgeGrpcHandlers } from "./services/knowledge.js";
import { authInterceptor } from "./auth-interceptor.js";
import { rateLimitInterceptor } from "./rate-limit-interceptor.js";
import { grpcLogger } from "../logger.js";

// Resolve path to proto files from the project root
const PROTO_ROOT = resolve(process.cwd(), "shared/proto");

const LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false,       // convert snake_case → camelCase
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
};

// Holds the running gRPC server instance for graceful shutdown
let _grpcServer: Server | null = null;

/** Gracefully shut down the gRPC server (waits for in-flight calls to finish) */
export function shutdownGrpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!_grpcServer) return resolve();
    _grpcServer.tryShutdown((err) => {
      if (err) {
        grpcLogger.error({ err }, "Graceful shutdown failed, forcing");
        _grpcServer?.forceShutdown();
      }
      _grpcServer = null;
      resolve();
    });
  });
}


export async function startGrpcServer(port = 5001): Promise<Server> {
  // Load all proto files
  const packageDef = await protoLoader.load(
    [
      join(PROTO_ROOT, "common.proto"),
      join(PROTO_ROOT, "conversations.proto"),
      join(PROTO_ROOT, "models.proto"),
      join(PROTO_ROOT, "knowledge.proto"),
    ],
    LOADER_OPTIONS,
  );

  const grpcObj = loadPackageDefinition(packageDef) as any;
  const ultraConversations = grpcObj?.ultra?.conversations;
  const ultraModels = grpcObj?.ultra?.models;
  const ultraKnowledge = grpcObj?.ultra?.knowledge;

  const server = new Server({
    interceptors: [rateLimitInterceptor, authInterceptor], // rate limit BEFORE auth
  });

  // Register ConversationService
  if (ultraConversations?.ConversationService) {
    server.addService(ultraConversations.ConversationService.service, {
      listConversations: conversationGrpcHandlers.listConversations,
      getConversation: conversationGrpcHandlers.getConversation,
      createConversation: conversationGrpcHandlers.createConversation,
      updateConversation: conversationGrpcHandlers.updateConversation,
      deleteConversation: conversationGrpcHandlers.deleteConversation,
      getMessages: conversationGrpcHandlers.getMessages,
      streamConversation: conversationGrpcHandlers.streamConversation,
    });
  } else {
    grpcLogger.warn("ConversationService not found in proto definitions");
  }

  // Register ModelService
  if (ultraModels?.ModelService) {
    server.addService(ultraModels.ModelService.service, {
      listModels: modelGrpcHandlers.listModels,
      getModel: modelGrpcHandlers.getModel,
      createModel: modelGrpcHandlers.createModel,
      deleteModel: modelGrpcHandlers.deleteModel,
      testModel: modelGrpcHandlers.testModel,
    });
  } else {
    grpcLogger.warn("ModelService not found in proto definitions");
  }

  // Register KnowledgeService
  if (ultraKnowledge?.KnowledgeService) {
    server.addService(ultraKnowledge.KnowledgeService.service, {
      listKnowledge: knowledgeGrpcHandlers.listKnowledge,
      getKnowledgeEntry: knowledgeGrpcHandlers.getKnowledgeEntry,
      createKnowledgeEntry: knowledgeGrpcHandlers.createKnowledgeEntry,
      deleteKnowledgeEntry: knowledgeGrpcHandlers.deleteKnowledgeEntry,
      searchKnowledge: knowledgeGrpcHandlers.searchKnowledge,
    });
  } else {
    grpcLogger.warn("KnowledgeService not found in proto definitions");
  }

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (err, boundPort) => {
      if (err) {
        reject(err);
        return;
      }
      grpcLogger.info(`Server listening on port ${boundPort}`);
      resolve();
    });
  });

  _grpcServer = server;
  return server;
}
