import type { ServerInterceptingCall, Interceptor, InterceptingCallInterface, StatusObject } from "@grpc/grpc-js";
import { status as grpcStatus, Metadata } from "@grpc/grpc-js";
import { verifyApiKey, extractApiKey } from "../auth.js";

/**
 * gRPC server interceptor that validates the Bearer token / x-api-key metadata
 * field against ULTRA_API_KEY (if set). Unauthenticated callers receive
 * UNAUTHENTICATED status.
 */
export const authInterceptor: Interceptor = (options, nextCall) => {
  return new (class implements InterceptingCallInterface {
    private _call: ServerInterceptingCall;

    constructor() {
      this._call = nextCall(options);
    }

    start(metadata: Metadata, listener: any, next: any) {
      const apiKey = process.env.ULTRA_API_KEY;
      if (apiKey) {
        const authValues = metadata.get("authorization");
        const xKeyValues = metadata.get("x-api-key");
        const authHeader = (authValues[0] as string) ?? "";
        const xApiKey = (xKeyValues[0] as string) ?? "";
        const supplied = extractApiKey(authHeader, xApiKey);
        if (!verifyApiKey(supplied)) {
          const statusObj: StatusObject = {
            code: grpcStatus.UNAUTHENTICATED,
            details: "Invalid or missing API key",
            metadata: new Metadata(),
          };
          listener.onReceiveStatus(statusObj);
          return;
        }
      }
      next(metadata, listener);
    }

    sendMessage(message: any, next: any) {
      next(message);
    }

    halfClose(next: any) {
      next();
    }

    cancel() {
      this._call.cancel();
    }
  })();
};
