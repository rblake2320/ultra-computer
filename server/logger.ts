import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
    : undefined,
});

// Child loggers for each subsystem
export const httpLogger = logger.child({ module: "http" });
export const grpcLogger = logger.child({ module: "grpc" });
export const dbLogger = logger.child({ module: "db" });
export const orchestratorLogger = logger.child({ module: "orchestrator" });
export const swarmLogger = logger.child({ module: "swarm" });
export const authLogger = logger.child({ module: "auth" });
