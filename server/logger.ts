import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "ultra-computer" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.api_key",
      "*.password",
      "*.token",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export default logger;

// Child loggers per subsystem
export const orchestratorLogger = logger.child({ module: "orchestrator" });
export const toolsLogger = logger.child({ module: "tools" });
export const sandboxLogger = logger.child({ module: "sandbox" });
export const swarmLogger = logger.child({ module: "swarm" });
export const memoryLogger = logger.child({ module: "memory" });
export const authLogger = logger.child({ module: "auth" });
export const cacheLogger = logger.child({ module: "cache" });
export const autonomyLogger = logger.child({ module: "autonomy" });
export const routesLogger = logger.child({ module: "routes" });
export const dbLogger = logger.child({ module: "db" });
