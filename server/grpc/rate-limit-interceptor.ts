import {
  ServerInterceptingCall,
  ServerListenerBuilder,
  type ServerInterceptor,
  type ServerInterceptingCallInterface,
  type ServerMethodDefinition,
} from "@grpc/grpc-js";
import { Metadata, status as grpcStatus } from "@grpc/grpc-js";

/**
 * Per-IP token-bucket rate limiter for the gRPC server.
 * Limits each client IP to MAX_REQUESTS per WINDOW_MS.
 * Buckets are cleaned up automatically after their window expires.
 */

const WINDOW_MS = 60_000;   // 1 minute
const MAX_REQUESTS = 100;   // requests per window per IP

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function cleanupBuckets() {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(ip);
  }
}

// Periodic cleanup — runs every window; .unref() so it doesn't block process exit
setInterval(cleanupBuckets, WINDOW_MS).unref();

/** Extract the client IP from gRPC's peer string ("ipv4:127.0.0.1:51234" or "ipv6:[::1]:51234") */
function peerToIp(peer: string): string {
  if (!peer) return "unknown";
  // ipv4:A.B.C.D:PORT  →  "A.B.C.D"
  // ipv6:[::1]:PORT    →  "[::1]"
  const withoutProtocol = peer.replace(/^(ipv4|ipv6):/, "");
  // Strip trailing ":PORT" — last colon onward (handles IPv6 brackets correctly)
  const lastColon = withoutProtocol.lastIndexOf(":");
  return lastColon >= 0 ? withoutProtocol.slice(0, lastColon) : withoutProtocol;
}

export const rateLimitInterceptor: ServerInterceptor = (
  _methodDescriptor: ServerMethodDefinition<any, any>,
  call: ServerInterceptingCallInterface,
): ServerInterceptingCall => {
  return new ServerInterceptingCall(call, {
    start(next) {
      next(
        new ServerListenerBuilder()
          .withOnReceiveMetadata((metadata, metadataNext) => {
            const peer = (call as any).getPeer?.() ?? "";
            const ip = peerToIp(peer);
            const now = Date.now();

            let bucket = buckets.get(ip);
            if (!bucket || now > bucket.resetAt) {
              bucket = { count: 0, resetAt: now + WINDOW_MS };
              buckets.set(ip, bucket);
            }

            bucket.count++;
            if (bucket.count > MAX_REQUESTS) {
              const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
              const trailer = new Metadata();
              trailer.set("retry-after", String(retryAfterSec));
              call.sendStatus({
                code: grpcStatus.RESOURCE_EXHAUSTED,
                details: `Rate limit exceeded — max ${MAX_REQUESTS} gRPC requests per minute per IP`,
                metadata: trailer,
              });
              return; // do NOT call metadataNext — terminate the call
            }

            metadataNext(metadata);
          })
          .build(),
      );
    },
  });
};
