/**
 * gRPC-Web Bridge — exposes gRPC service implementations over plain HTTP/JSON
 * at /api/grpc/* so browser clients can call them without gRPC-Web protocol
 * or HTTP/2.  Auth is enforced upstream by createAuthMiddleware().
 */
import { Router } from "express";
import { conversationGrpcHandlers } from "./grpc/services/conversations.js";
import { modelGrpcHandlers } from "./grpc/services/models.js";
import { knowledgeGrpcHandlers } from "./grpc/services/knowledge.js";

export function createGrpcWebBridge(): Router {
  const router = Router();

  // ─── Helper: wrap a grpc handler as an Express route ─────────────────────
  // Unary handlers: signature (call, callback) where call.request = body
  function unary(handler: (call: any, cb: any) => void) {
    return async (req: any, res: any) => {
      handler({ request: req.body ?? {} }, (err: any, result: any) => {
        if (err) {
          const httpStatus = grpcStatusToHttp(err.code);
          res.status(httpStatus).json({ error: err.message ?? "Internal error", grpcCode: err.code });
        } else {
          res.json(result);
        }
      });
    };
  }

  // Async unary (handlers that return a promise internally)
  function asyncUnary(handler: (call: any, cb: any) => void | Promise<void>) {
    return async (req: any, res: any) => {
      try {
        await new Promise<void>((resolve) => {
          handler({ request: req.body ?? {} }, (err: any, result: any) => {
            if (err) {
              const httpStatus = grpcStatusToHttp(err.code);
              res.status(httpStatus).json({ error: err.message ?? "Internal error", grpcCode: err.code });
            } else {
              res.json(result);
            }
            resolve();
          });
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? "Internal error" });
      }
    };
  }

  // ─── Conversations ──────────────────────────────────────────────────────────
  router.post("/conversations/list", unary(conversationGrpcHandlers.listConversations));
  router.post("/conversations/get", unary(conversationGrpcHandlers.getConversation));
  router.post("/conversations/create", unary(conversationGrpcHandlers.createConversation));
  router.post("/conversations/update", unary(conversationGrpcHandlers.updateConversation));
  router.post("/conversations/delete", unary(conversationGrpcHandlers.deleteConversation));
  router.post("/conversations/messages", unary(conversationGrpcHandlers.getMessages));

  // ─── Models ────────────────────────────────────────────────────────────────
  router.post("/models/list", unary(modelGrpcHandlers.listModels));
  router.post("/models/get", unary(modelGrpcHandlers.getModel));
  router.post("/models/create", unary(modelGrpcHandlers.createModel));
  router.post("/models/delete", unary(modelGrpcHandlers.deleteModel));
  router.post("/models/test", asyncUnary(modelGrpcHandlers.testModel));

  // ─── Knowledge ─────────────────────────────────────────────────────────────
  router.post("/knowledge/list", unary(knowledgeGrpcHandlers.listKnowledge));
  router.post("/knowledge/get", unary(knowledgeGrpcHandlers.getKnowledgeEntry));
  router.post("/knowledge/create", asyncUnary(knowledgeGrpcHandlers.createKnowledgeEntry));
  router.post("/knowledge/delete", unary(knowledgeGrpcHandlers.deleteKnowledgeEntry));
  router.post("/knowledge/search", unary(knowledgeGrpcHandlers.searchKnowledge));

  return router;
}

// gRPC status code → HTTP status code
function grpcStatusToHttp(code?: number): number {
  switch (code) {
    case 0:  return 200; // OK
    case 1:  return 499; // CANCELLED
    case 2:  return 500; // UNKNOWN
    case 3:  return 400; // INVALID_ARGUMENT
    case 4:  return 504; // DEADLINE_EXCEEDED
    case 5:  return 404; // NOT_FOUND
    case 6:  return 409; // ALREADY_EXISTS
    case 7:  return 403; // PERMISSION_DENIED
    case 8:  return 429; // RESOURCE_EXHAUSTED
    case 9:  return 400; // FAILED_PRECONDITION
    case 10: return 409; // ABORTED
    case 11: return 400; // OUT_OF_RANGE
    case 12: return 501; // UNIMPLEMENTED
    case 13: return 500; // INTERNAL
    case 14: return 503; // UNAVAILABLE
    case 15: return 500; // DATA_LOSS
    case 16: return 401; // UNAUTHENTICATED
    default: return 500;
  }
}
