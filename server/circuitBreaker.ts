/**
 * Circuit Breaker Pattern Implementation
 *
 * Protects external service calls (LLM APIs, OAuth endpoints, webhooks, etc.)
 * from cascading failures using the classic three-state circuit breaker model.
 *
 * States:
 *   CLOSED   — normal operation; failures are tracked
 *   OPEN     — fast-reject mode; no calls pass through
 *   HALF_OPEN — recovery testing; limited calls are allowed
 */

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Identifier used in error messages and registry lookups (e.g. 'openai') */
  name: string;
  /** Number of failures within monitorWindowMs before opening the circuit */
  failureThreshold: number;
  /** Consecutive successes in HALF_OPEN required to return to CLOSED */
  successThreshold: number;
  /** Milliseconds to wait in OPEN state before transitioning to HALF_OPEN */
  timeout: number;
  /** Maximum concurrent requests allowed in HALF_OPEN state */
  halfOpenMaxConcurrent: number;
  /** Sliding-window duration (ms) over which failures are counted */
  monitorWindowMs: number;
  /** Optional callback fired on every state transition */
  onStateChange?: (from: State, to: State, name: string) => void;
}

export interface CircuitBreakerStats {
  state: State;
  /** Failures within the current sliding window */
  failures: number;
  /** Consecutive successes counted while in HALF_OPEN */
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalCalls: number;
  totalFailures: number;
  /** Number of times the circuit has tripped to OPEN */
  openCount: number;
}

export interface StateChangeEvent {
  from: State;
  to: State;
  name: string;
  timestamp: Date;
  reason: string;
}

// ---------------------------------------------------------------------------
// CircuitOpenError
// ---------------------------------------------------------------------------

export class CircuitOpenError extends Error {
  public readonly name = 'CircuitOpenError';
  public readonly breakerName: string;
  public readonly retryAfterMs: number;

  constructor(breakerName: string, retryAfterMs: number) {
    super(
      `Circuit breaker '${breakerName}' is OPEN. ` +
        `Retry after approximately ${retryAfterMs}ms.`
    );
    this.breakerName = breakerName;
    this.retryAfterMs = retryAfterMs;
    // Restore prototype chain (required when extending built-ins in TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Ring Buffer (fixed-capacity event log)
// ---------------------------------------------------------------------------

class RingBuffer<T> {
  private readonly capacity: number;
  private readonly buffer: (T | undefined)[];
  private head = 0; // points to the next write slot
  private size = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** Returns items in chronological order (oldest first) */
  toArray(): T[] {
    if (this.size === 0) return [];
    const result: T[] = [];
    // If the buffer is not yet full, items start at index 0
    const start =
      this.size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      const idx = (start + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  get length(): number {
    return this.size;
  }
}

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30_000,
  halfOpenMaxConcurrent: 1,
  monitorWindowMs: 60_000,
};

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;

  // State
  private _state: State = 'CLOSED';
  private openedAt: number | null = null;

  // Sliding-window failure tracking — each entry is a timestamp (ms)
  private failureTimestamps: number[] = [];

  // HALF_OPEN success counter (resets on trip or close)
  private halfOpenSuccesses = 0;

  // HALF_OPEN concurrency gate
  private halfOpenInflight = 0;

  // Lifetime counters
  private _totalCalls = 0;
  private _totalFailures = 0;
  private _openCount = 0;

  // Last-event timestamps
  private _lastFailure: Date | null = null;
  private _lastSuccess: Date | null = null;

  // Event log (ring buffer, capacity 50)
  private readonly eventLog = new RingBuffer<StateChangeEvent>(50);

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Execute an async function through the circuit breaker. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this._maybeTryRecover();

    switch (this._state) {
      case 'OPEN':
        throw new CircuitOpenError(
          this.config.name,
          this._retryAfterMs()
        );

      case 'HALF_OPEN':
        return this._executeHalfOpen(fn);

      default: // CLOSED
        return this._executeClosed(fn);
    }
  }

  getState(): State {
    this._maybeTryRecover();
    return this._state;
  }

  getStats(): CircuitBreakerStats {
    this._maybeTryRecover();
    this._pruneOldFailures();
    return {
      state: this._state,
      failures: this.failureTimestamps.length,
      successes: this.halfOpenSuccesses,
      lastFailure: this._lastFailure,
      lastSuccess: this._lastSuccess,
      totalCalls: this._totalCalls,
      totalFailures: this._totalFailures,
      openCount: this._openCount,
    };
  }

  /** Force the circuit back to CLOSED, clearing all counters. */
  reset(): void {
    const prev = this._state;
    this._state = 'CLOSED';
    this.failureTimestamps = [];
    this.halfOpenSuccesses = 0;
    this.halfOpenInflight = 0;
    this.openedAt = null;
    if (prev !== 'CLOSED') {
      this._recordEvent(prev, 'CLOSED', 'manual reset');
      this.config.onStateChange?.(prev, 'CLOSED', this.config.name);
    }
  }

  /** Force the circuit to OPEN, causing immediate fast-rejects. */
  trip(): void {
    const prev = this._state;
    this._transitionToOpen('manual trip');
    if (prev === this._state && prev === 'OPEN') return; // no-op if already open
  }

  /** Read-only access to the state change event log (newest last). */
  getEventLog(): StateChangeEvent[] {
    return this.eventLog.toArray();
  }

  get name(): string {
    return this.config.name;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private _executeClosed<T>(fn: () => Promise<T>): Promise<T> {
    this._totalCalls++;
    return fn().then(
      (result) => {
        this._lastSuccess = new Date();
        return result;
      },
      (err) => {
        this._recordFailure();
        if (this.failureTimestamps.length >= this.config.failureThreshold) {
          this._transitionToOpen('failure threshold reached');
        }
        throw err;
      }
    );
  }

  private _executeHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    if (this.halfOpenInflight >= this.config.halfOpenMaxConcurrent) {
      // Treat excess concurrency as a fast-reject (same as OPEN)
      throw new CircuitOpenError(
        this.config.name,
        this._retryAfterMs()
      );
    }

    this._totalCalls++;
    this.halfOpenInflight++;

    return fn().then(
      (result) => {
        this.halfOpenInflight--;
        this._lastSuccess = new Date();
        this.halfOpenSuccesses++;
        if (this.halfOpenSuccesses >= this.config.successThreshold) {
          this._transitionToClosed();
        }
        return result;
      },
      (err) => {
        this.halfOpenInflight--;
        this._recordFailure();
        // Any failure in HALF_OPEN sends us back to OPEN
        this._transitionToOpen('failure during HALF_OPEN probe');
        throw err;
      }
    );
  }

  /** Check whether enough time has passed to move OPEN → HALF_OPEN. */
  private _maybeTryRecover(): void {
    if (
      this._state === 'OPEN' &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.config.timeout
    ) {
      this._transitionToHalfOpen();
    }
  }

  private _transitionToOpen(reason: string): void {
    const prev = this._state;
    this._state = 'OPEN';
    this.openedAt = Date.now();
    this.halfOpenSuccesses = 0;
    this.halfOpenInflight = 0;
    this._openCount++;
    this._recordEvent(prev, 'OPEN', reason);
    this.config.onStateChange?.(prev, 'OPEN', this.config.name);
  }

  private _transitionToHalfOpen(): void {
    const prev = this._state;
    this._state = 'HALF_OPEN';
    this.halfOpenSuccesses = 0;
    this.halfOpenInflight = 0;
    this._recordEvent(prev, 'HALF_OPEN', 'timeout elapsed');
    this.config.onStateChange?.(prev, 'HALF_OPEN', this.config.name);
  }

  private _transitionToClosed(): void {
    const prev = this._state;
    this._state = 'CLOSED';
    this.failureTimestamps = [];
    this.halfOpenSuccesses = 0;
    this.halfOpenInflight = 0;
    this.openedAt = null;
    this._recordEvent(prev, 'CLOSED', 'success threshold reached');
    this.config.onStateChange?.(prev, 'CLOSED', this.config.name);
  }

  private _recordFailure(): void {
    const now = Date.now();
    this._lastFailure = new Date(now);
    this._totalFailures++;
    this.failureTimestamps.push(now);
    this._pruneOldFailures();
  }

  /** Remove failure timestamps that fall outside the sliding window. */
  private _pruneOldFailures(): void {
    const cutoff = Date.now() - this.config.monitorWindowMs;
    // failureTimestamps is always appended in order, so we can slice from front
    let i = 0;
    while (i < this.failureTimestamps.length && this.failureTimestamps[i] < cutoff) {
      i++;
    }
    if (i > 0) this.failureTimestamps = this.failureTimestamps.slice(i);
  }

  private _retryAfterMs(): number {
    if (this._state === 'OPEN' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      return Math.max(0, this.config.timeout - elapsed);
    }
    return 0;
  }

  private _recordEvent(from: State, to: State, reason: string): void {
    this.eventLog.push({ from, to, name: this.config.name, timestamp: new Date(), reason });
  }
}

// ---------------------------------------------------------------------------
// CircuitBreakerRegistry
// ---------------------------------------------------------------------------

export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  /**
   * Get an existing breaker or create a new one.
   * If the breaker already exists, `config` overrides are ignored.
   */
  getBreaker(
    name: string,
    config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...config }));
    }
    return this.breakers.get(name)!;
  }

  getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  getRegistryStats(): Record<string, { state: State; failures: number; totalCalls: number }> {
    const result: Record<string, { state: State; failures: number; totalCalls: number }> = {};
    for (const [name, breaker] of this.breakers) {
      const stats = breaker.getStats();
      result[name] = {
        state: stats.state,
        failures: stats.failures,
        totalCalls: stats.totalCalls,
      };
    }
    return result;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Registry & Pre-configured Breakers
// ---------------------------------------------------------------------------

/** Shared registry — import and use directly throughout the application. */
export const registry = new CircuitBreakerRegistry();

// Pre-register well-known external service breakers
registry.getBreaker('openai', {
  failureThreshold: 5,
  timeout: 30_000,
  monitorWindowMs: 60_000,
});

registry.getBreaker('anthropic', {
  failureThreshold: 5,
  timeout: 30_000,
  monitorWindowMs: 60_000,
});

registry.getBreaker('ollama', {
  failureThreshold: 3,
  timeout: 10_000,
  monitorWindowMs: 60_000,
});

registry.getBreaker('google', {
  failureThreshold: 5,
  timeout: 30_000,
  monitorWindowMs: 60_000,
});

registry.getBreaker('webhook', {
  failureThreshold: 3,
  timeout: 60_000,
  monitorWindowMs: 60_000,
});

// ---------------------------------------------------------------------------
// Convenience Re-exports
// ---------------------------------------------------------------------------

/**
 * Shorthand to get a breaker from the shared registry.
 *
 * @example
 * import { getBreaker } from './circuitBreaker';
 * const result = await getBreaker('openai').execute(() => openai.chat(...));
 */
export function getBreaker(
  name: string,
  config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
): CircuitBreaker {
  return registry.getBreaker(name, config);
}
