/**
 * validateRequest.ts
 *
 * Express middleware for Zod-based request body validation.
 * Wraps any Zod schema and returns structured error responses on failure.
 */

import { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AppError, ErrorCodes } from "./errorCodes.js";

/**
 * Returns an Express middleware that validates `req.body` against the given Zod schema.
 * On success, replaces `req.body` with the parsed (coerced + stripped) value.
 * On failure, responds with a 400 structured error and does NOT call next().
 *
 * Usage:
 *   app.post("/api/models", validate(insertModelSchema), (req, res) => { ... })
 */
export function validate<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));

      const err = new AppError(ErrorCodes.VALIDATION_ERROR, { fields: fieldErrors });
      res.status(err.status).json(err.toJSON());
      return;
    }

    // Replace body with parsed value (applies defaults, coercions, strips unknown keys)
    req.body = result.data;
    next();
  };
}

/**
 * Validate query params against a Zod schema.
 * Useful for GET endpoints with typed query strings.
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));

      const err = new AppError(ErrorCodes.VALIDATION_ERROR, { fields: fieldErrors });
      res.status(err.status).json(err.toJSON());
      return;
    }

    // Attach parsed query to request (does not replace req.query to avoid type issues)
    (req as any).validatedQuery = result.data;
    next();
  };
}

/**
 * Validate path params against a Zod schema.
 */
export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));

      const err = new AppError(ErrorCodes.INVALID_PARAMETER, { fields: fieldErrors });
      res.status(err.status).json(err.toJSON());
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Common reusable schemas
// ---------------------------------------------------------------------------
export const idParamSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
