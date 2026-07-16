import helmet from "helmet";

/**
 * Security headers for both the built SPA and Vite development server.
 * Production never permits inline/eval scripts. Development permits eval only
 * for source maps and keeps WebSocket connections available for Vite HMR.
 */
export function createSecurityHeaders(environment = process.env.NODE_ENV) {
  const isProduction = environment === "production";

  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: isProduction
          ? ["'self'", "wss:"]
          : ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: isProduction
          ? ["'self'"]
          : ["'self'", "'unsafe-eval'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: isProduction ? [] : null,
        workerSrc: ["'self'", "blob:"],
      },
    },
    // The UI intentionally renders user-selected remote images. COEP would
    // reject those unless every source opted into cross-origin isolation.
    crossOriginEmbedderPolicy: false,
  });
}
