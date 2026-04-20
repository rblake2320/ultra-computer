/**
 * retryWithBackoff.ts
 *
 * Retry utility with exponential backoff + jitter for external API calls.
 * Works with any async function. Respects abort signals for timeout integration.
 */

import logger from "./logger.js";
const retryLogger = logger.child({ module: "retry" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffFactor?: number;
  /** Jitter factor 0-1 (default: 0.3 = ±30% of computed delay) */
  jitter?: number;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Optional: only retry if this predicate returns true for the error */
  retryIf?: (error: unknown) => boolean;
  /** Optional: called before each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "signal" | "retryIf" | "onRetry">> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitter: 0.3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function computeDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffFactor: number,
  jitter: number
): number {
  const base = initialDelayMs * Math.pow(backoffFactor, attempt);
  const capped = Math.min(base, maxDelayMs);
  // Jitter: add randomness of ±jitter% of capped value
  const jitterRange = capped * jitter;
  const randomJitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(capped + randomJitter));
}

/**
 * Determines if an error is retryable.
 * - Network errors → retryable
 * - 429 (rate limited) → retryable
 * - 5xx → retryable
 * - 4xx (except 429) → NOT retryable
 * - AbortError → NOT retryable
 */
function isRetryableByDefault(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;

  // Fetch / HTTP errors
  if (error && typeof error === "object") {
    const e = error as Record<string, any>;

    // Network-level errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, etc.)
    if (e.code && typeof e.code === "string" && /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|EAI_AGAIN)$/.test(e.code)) {
      return true;
    }

    // HTTP status codes
    const status = e.status || e.statusCode;
    if (typeof status === "number") {
      if (status === 429) return true;  // Rate limited
      if (status >= 500) return true;   // Server errors
      return false;                     // 4xx client errors are not retryable
    }

    // Generic error with a message about network
    if (e.message && typeof e.message === "string") {
      const msg = e.message.toLowerCase();
      if (msg.includes("network") || msg.includes("timeout") || msg.includes("econnreset") || msg.includes("socket hang up")) {
        return true;
      }
    }
  }

  // If we can't determine, default to retryable (safe: will cap at maxRetries)
  return true;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Execute an async function with retry and exponential backoff.
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetch("https://api.anthropic.com/v1/messages", { ... }),
 *   { maxRetries: 3, onRetry: (n, err) => console.warn(`Retry ${n}:`, err) }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    backoffFactor,
    jitter,
  } = { ...DEFAULT_OPTIONS, ...options };

  const retryIf = options.retryIf ?? isRetryableByDefault;
  const { signal, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check signal before each attempt
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry aborted requests
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Don't retry if the error isn't retryable
      if (!retryIf(error)) {
        break;
      }

      const delayMs = computeDelay(attempt, initialDelayMs, maxDelayMs, backoffFactor, jitter);

      if (onRetry) {
        onRetry(attempt + 1, error, delayMs);
      }

      await sleep(delayMs, signal);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Convenience: timed fetch with retry
// ---------------------------------------------------------------------------

/**
 * Fetch wrapper with timeout + retry + backoff.
 * Suitable for external provider API calls (Anthropic, NVIDIA, OpenAI, etc.)
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retryOpts: RetryOptions = {}
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 60_000; // Default 60s timeout
  const { timeoutMs: _, ...fetchInit } = init;

  return retryWithBackoff(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Merge signals if one was provided
    if (fetchInit.signal) {
      fetchInit.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const resp = await fetch(url, { ...fetchInit, signal: controller.signal });

      // Treat 5xx and 429 as errors for retry logic
      if (resp.status >= 500 || resp.status === 429) {
        const body = await resp.text().catch(() => "");
        const err = new Error(`HTTP ${resp.status}: ${body.slice(0, 500)}`);
        (err as any).status = resp.status;
        throw err;
      }

      return resp;
    } finally {
      clearTimeout(timer);
    }
  }, {
    maxRetries: retryOpts.maxRetries ?? 2,
    initialDelayMs: retryOpts.initialDelayMs ?? 1000,
    onRetry: retryOpts.onRetry ?? ((n, err) => {
      retryLogger.warn({ retry: n, url, message: (err as Error).message?.slice(0, 200) }, "fetchWithRetry retrying");
    }),
    ...retryOpts,
  });
}
