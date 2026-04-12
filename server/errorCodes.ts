/**
 * errorCodes.ts
 *
 * Structured error codes and AppError class for consistent API error responses.
 * Every error response follows the shape: { error: { code, message, details? } }
 */

// ---------------------------------------------------------------------------
// Error code registry
// ---------------------------------------------------------------------------
export const ErrorCodes = {
  // 400 — Bad Request
  VALIDATION_ERROR: { status: 400, code: "VALIDATION_ERROR", message: "Request validation failed" },
  INVALID_JSON: { status: 400, code: "INVALID_JSON", message: "Invalid JSON in request body" },
  MISSING_FIELD: { status: 400, code: "MISSING_FIELD", message: "Required field is missing" },
  INVALID_PARAMETER: { status: 400, code: "INVALID_PARAMETER", message: "Invalid parameter value" },

  // 401 — Unauthorized
  UNAUTHORIZED: { status: 401, code: "UNAUTHORIZED", message: "Authentication required" },
  INVALID_API_KEY: { status: 401, code: "INVALID_API_KEY", message: "Invalid API key" },

  // 403 — Forbidden
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Access denied" },
  RATE_LIMITED: { status: 429, code: "RATE_LIMITED", message: "Too many requests" },

  // 404 — Not Found
  NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Resource not found" },
  MODEL_NOT_FOUND: { status: 404, code: "MODEL_NOT_FOUND", message: "Model not found" },
  SKILL_NOT_FOUND: { status: 404, code: "SKILL_NOT_FOUND", message: "Skill not found" },
  CONNECTOR_NOT_FOUND: { status: 404, code: "CONNECTOR_NOT_FOUND", message: "Connector not found" },
  SESSION_NOT_FOUND: { status: 404, code: "SESSION_NOT_FOUND", message: "Session not found" },
  CONVERSATION_NOT_FOUND: { status: 404, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" },

  // 409 — Conflict
  ALREADY_EXISTS: { status: 409, code: "ALREADY_EXISTS", message: "Resource already exists" },
  CONFLICT: { status: 409, code: "CONFLICT", message: "Conflicting operation" },

  // 422 — Unprocessable Entity
  UNPROCESSABLE: { status: 422, code: "UNPROCESSABLE", message: "Request cannot be processed" },

  // 500 — Internal Server Error
  INTERNAL_ERROR: { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" },
  DB_ERROR: { status: 500, code: "DB_ERROR", message: "Database operation failed" },

  // 502 — Bad Gateway (upstream provider errors)
  PROVIDER_ERROR: { status: 502, code: "PROVIDER_ERROR", message: "Upstream provider error" },
  PROVIDER_TIMEOUT: { status: 504, code: "PROVIDER_TIMEOUT", message: "Upstream provider timed out" },

  // 503 — Service Unavailable
  SERVICE_UNAVAILABLE: { status: 503, code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable" },
  CIRCUIT_OPEN: { status: 503, code: "CIRCUIT_OPEN", message: "Service circuit breaker is open" },
} as const;

export type ErrorCodeKey = keyof typeof ErrorCodes;

// ---------------------------------------------------------------------------
// AppError class
// ---------------------------------------------------------------------------
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    errorCode: (typeof ErrorCodes)[ErrorCodeKey],
    details?: unknown,
    customMessage?: string
  ) {
    super(customMessage || errorCode.message);
    this.name = "AppError";
    this.status = errorCode.status;
    this.code = errorCode.code;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: throw typed errors quickly
// ---------------------------------------------------------------------------
export function notFound(resource: string, id?: string): AppError {
  return new AppError(
    ErrorCodes.NOT_FOUND,
    id ? { resource, id } : { resource },
    `${resource} not found${id ? `: ${id}` : ""}`
  );
}

export function validationError(details: unknown): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, details);
}

export function providerError(provider: string, details?: unknown): AppError {
  return new AppError(
    ErrorCodes.PROVIDER_ERROR,
    { provider, ...((details && typeof details === "object") ? details : { raw: details }) },
    `Upstream provider error: ${provider}`
  );
}
