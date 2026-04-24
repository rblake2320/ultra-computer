import {
  ServerInterceptingCall,
  ServerListenerBuilder,
  type ServerInterceptor,
  type ServerInterceptingCallInterface,
  type ServerMethodDefinition,
} from "@grpc/grpc-js";
import { Metadata, status as grpcStatus } from "@grpc/grpc-js";
import { verifyApiKey, extractApiKey } from "../auth.js";
import { authLogger } from "../logger.js";

/**
 * gRPC server interceptor that validates the Bearer token / x-api-key metadata
 * against ULTRA_API_KEY (when set). Unauthenticated callers receive
 * UNAUTHENTICATED status and the call is terminated immediately.
 */
export const authInterceptor: ServerInterceptor = (
  _methodDescriptor: ServerMethodDefinition<any, any>,
  call: ServerInterceptingCallInterface,
): ServerInterceptingCall => {
  return new ServerInterceptingCall(call, {
    start(next) {
      next(
        new ServerListenerBuilder()
          .withOnReceiveMetadata((metadata, metadataNext) => {
            const apiKey = process.env.ULTRA_API_KEY;
            if (apiKey) {
              const authValues = metadata.get("authorization");
              const xKeyValues = metadata.get("x-api-key");
              const authHeader = (authValues[0] as string) ?? "";
              const xApiKey = (xKeyValues[0] as string) ?? "";
              const supplied = extractApiKey(authHeader, xApiKey);
              if (!verifyApiKey(supplied)) {
                authLogger.warn("gRPC call rejected — invalid or missing API key");
                call.sendStatus({
                  code: grpcStatus.UNAUTHENTICATED,
                  details: "Invalid or missing API key",
                  metadata: new Metadata(),
                });
                return; // do NOT call metadataNext — terminate the call
              }
            }
            metadataNext(metadata);
          })
          .build(),
      );
    },
  });
};
