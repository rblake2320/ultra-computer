import type { Request, Response, NextFunction } from "express";
import { routesLogger } from "./logger.js";

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 100),
    };
    if (res.statusCode >= 500) {
      routesLogger.error(log, "request failed");
    } else if (res.statusCode >= 400) {
      routesLogger.warn(log, "client error");
    } else {
      routesLogger.info(log, "request completed");
    }
  });
  next();
}
