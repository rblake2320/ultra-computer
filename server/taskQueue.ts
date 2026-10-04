/**
 * Task Queue — BullMQ + Redis
 *
 * Long-running agent tasks that are estimated to exceed ~30 s are offloaded
 * here instead of running synchronously inside the HTTP request lifecycle.
 * If Redis is unavailable the queue gracefully degrades: isAvailable() returns
 * false and callers can fall back to direct execution. The queue must never
 * report stubbed work as successfully completed.
 */

import { Queue, Worker, Job, QueueEvents, UnrecoverableError } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";
import { createHash } from "node:crypto";
import { unfinishedAdmissions, updateAdmission, admissionState } from "./executionOutbox.js";
import { telemetryIdentity, withExecutionSpan } from "./telemetry.js";

// ─── Exported Types ───────────────────────────────────────────────────────────

export interface QueuedTask {
  conversationId: string;
  taskId: string;
  userMessage: string;
  estimatedDuration: "short" | "medium" | "long";
}

export type QueuedTaskProcessor = (task: QueuedTask) => Promise<string | void>;

export type JobStatus = {
  status: string;
  progress: number;
  result?: string;
  error?: string;
};

type RedisConnectionTarget = {
  url?: string;
  options: RedisOptions;
};

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

/**
 * Resolve one authoritative Redis target for every BullMQ connection.
 * REDIS_URL takes precedence so authentication, TLS and database selection are
 * not silently discarded. Host/port remain supported for local development.
 */
export function resolveRedisConnectionTarget(
  env: NodeJS.ProcessEnv = process.env,
): RedisConnectionTarget {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 3000,
  };
  const configuredUrl = env.REDIS_URL?.trim();

  if (configuredUrl) {
    const parsed = new URL(configuredUrl);
    if (!REDIS_PROTOCOLS.has(parsed.protocol)) {
      throw new Error("REDIS_URL must use redis:// or rediss://");
    }
    return { url: configuredUrl, options };
  }

  const rawPort = env.REDIS_PORT?.trim() || "6379";
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("REDIS_PORT must be an integer between 1 and 65535");
  }
  const port = Number(rawPort);
  if (port < 1 || port > 65535) {
    throw new Error("REDIS_PORT must be an integer between 1 and 65535");
  }

  return {
    options: {
      ...options,
      host: env.REDIS_HOST?.trim() || "localhost",
      port,
    },
  };
}

function createRedisConnection(
  target: RedisConnectionTarget,
  extraOptions: RedisOptions = {},
): IORedis {
  const options = { ...target.options, ...extraOptions };
  return target.url
    ? new IORedis(target.url, options)
    : new IORedis(options);
}

// ─── Duration Heuristic ───────────────────────────────────────────────────────

const LONG_KEYWORDS = [
  "research",
  "analyze all",
  "analyse all",
  "compare",
  "comprehensive",
  "in-depth",
  "deep dive",
  "full report",
  "summarize everything",
  "audit",
  "benchmark",
];

/**
 * Estimates how long a task will take based on shallow textual signals.
 * This is deliberately cheap — no LLM call, no DB read.
 */
export function estimateTaskDuration(
  userMessage: string,
  taskCount: number
): "short" | "medium" | "long" {
  const lower = userMessage.toLowerCase();

  const hasLongKeyword = LONG_KEYWORDS.some((kw) => lower.includes(kw));

  if (taskCount > 4 || userMessage.length > 500 || hasLongKeyword) {
    return "long";
  }

  if (taskCount > 2) {
    return "medium";
  }

  return "short";
}

// ─── Worker Processor ────────────────────────────────────────────────────────

// ─── TaskQueue Class ─────────────────────────────────────────────────────────

export class TaskQueue {
  private queue: Queue<QueuedTask> | null = null;
  private worker: Worker<QueuedTask, string> | null = null;
  private queueEvents: QueueEvents | null = null;
  private redisConnection: IORedis | null = null;
  private workerRedis: IORedis | null = null;
  private eventsRedis: IORedis | null = null;
  private processor: QueuedTaskProcessor | null = null;
  private available = false;
  private outboxTimer: NodeJS.Timeout | null = null;
  private flushingOutbox = false;
  private readonly readyConnections = new Set<string>();

  constructor() {}

  setProcessor(processor: QueuedTaskProcessor | null): void {
    this.processor = processor;
  }

  async processJob(
    job: Pick<Job<QueuedTask>, "id" | "data" | "updateProgress">
  ): Promise<string> {
    return withExecutionSpan("workflow.execute", { "workflow.task_id_hash": telemetryIdentity(job.data.taskId) }, () => this.processJobCore(job));
  }

  private async processJobCore(
    job: Pick<Job<QueuedTask>, "id" | "data" | "updateProgress">
  ): Promise<string> {
    if (!this.processor) {
      throw new Error("Task queue processor is not configured; refusing to mark job complete.");
    }

    const { conversationId, taskId, userMessage, estimatedDuration } = job.data;
    if (admissionState(taskId) === "failed") throw new UnrecoverableError("Request was cancelled or already failed; refusing execution.");

    console.log(
      `[TaskQueue] Processing job ${job.id}: ` +
        `conversationId=${conversationId} taskId=${taskId} ` +
        `estimatedDuration=${estimatedDuration} ` +
        `messageLength=${userMessage.length}`
    );

    await job.updateProgress(10);
    let processorResult;
    try {
      processorResult = await this.processor(job.data);
      if (typeof processorResult !== "string" || !processorResult.trim()) {
        throw new UnrecoverableError("Processor returned no completion receipt; refusing to mark job complete.");
      }
    } catch (error) {
      if ((error as { retryable?: boolean })?.retryable === false) {
        throw new UnrecoverableError(error instanceof Error ? error.message : "Execution failed");
      }
      throw error;
    }
    await job.updateProgress(100);
    updateAdmission(taskId, "completed");

    return JSON.stringify({
      taskId,
      conversationId,
      status: "orchestrator_complete",
      result: processorResult,
    });
  }

  /**
   * Attempts to connect to Redis and spin up the BullMQ queue + worker.
   * Returns true on success, false if Redis is unavailable.
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.queue || this.worker || this.queueEvents || this.redisConnection) {
        await this.shutdown();
      }

      const target = resolveRedisConnectionTarget();
      // Test Redis connectivity with a short timeout so startup is not blocked.
      const redis = createRedisConnection(target, { lazyConnect: true });
      this.trackConnection("queue", redis);

      await redis.connect();
      await redis.ping(); // Throws if unreachable

      this.redisConnection = redis;

      this.queue = new Queue<QueuedTask>("ultra-tasks", {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
      });

      // Separate connection instance for the worker (BullMQ requirement).
      const workerRedis = createRedisConnection(target);
      this.workerRedis = workerRedis;
      this.trackConnection("worker", workerRedis);

      this.worker = new Worker<QueuedTask, string>(
        "ultra-tasks",
        (job) => this.processJob(job),
        {
          connection: workerRedis,
          concurrency: 1,
          // Bound private crash recovery without shortening the renewable lease.
          stalledInterval: 10000,
          lockDuration: 30000,
        }
      );

      this.worker.on("completed", (job, returnValue) => {
        console.log(`[TaskQueue] Job ${job.id} completed:`, returnValue);
      });

      this.worker.on("failed", (job, err) => {
        if (job && (err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts || 1))) {
          updateAdmission(job.data.taskId, "failed");
        }
        console.error(`[TaskQueue] Job ${job?.id} failed:`, err.message);
      });

      this.worker.on("error", (err) => {
        console.error("[TaskQueue] Worker error:", err.message);
      });

      // QueueEvents for advanced state tracking (separate connection).
      const eventsRedis = createRedisConnection(target);
      this.eventsRedis = eventsRedis;
      this.trackConnection("events", eventsRedis);

      this.queueEvents = new QueueEvents("ultra-tasks", {
        connection: eventsRedis,
      });

      await Promise.all([
        workerRedis.ping(),
        eventsRedis.ping(),
        this.queue.waitUntilReady(),
        this.worker.waitUntilReady(),
        this.queueEvents.waitUntilReady(),
      ]);
      this.readyConnections.add("queue");
      this.readyConnections.add("worker");
      this.readyConnections.add("events");
      this.refreshAvailability();
      await this.flushOutbox();
      this.outboxTimer = setInterval(() => { void this.flushOutbox().catch(error => console.error("[TaskQueue] Outbox delivery failed:", error.message)); }, 5000);
      this.outboxTimer.unref();
      console.log("[TaskQueue] Initialized successfully — Redis connected.");
      return true;
    } catch (err: any) {
      console.warn(
        "[TaskQueue] Redis unavailable — task queue disabled. All operations will degrade gracefully.",
        err?.message ?? err
      );
      this.available = false;
      await this.closeResources();
      return false;
    }
  }

  private trackConnection(name: string, connection: IORedis): void {
    connection.on("ready", () => {
      this.readyConnections.add(name);
      this.refreshAvailability();
    });
    connection.on("error", (err) => {
      this.readyConnections.delete(name);
      this.refreshAvailability();
      console.error(`[TaskQueue] ${name} Redis connection error:`, err.message);
    });
    const markUnavailable = () => {
      this.readyConnections.delete(name);
      this.refreshAvailability();
    };
    connection.on("close", markUnavailable);
    connection.on("end", markUnavailable);
  }

  private refreshAvailability(): void {
    this.available = Boolean(
      this.queue &&
      this.worker &&
      this.queueEvents &&
      this.readyConnections.size === 3,
    );
  }

  /** Whether the queue is backed by a live Redis connection. */
  isAvailable(): boolean {
    return this.available;
  }

  private async flushOutbox(): Promise<void> {
    if (!this.available || this.flushingOutbox) return;
    this.flushingOutbox = true;
    try {
      for (const task of unfinishedAdmissions()) {
        if (admissionState(task.taskId) === "failed") continue;
        const id = await this.enqueue(task);
        if (!id.startsWith("error:") && !id.startsWith("unavailable:")) updateAdmission(task.taskId, "queued");
      }
    } finally { this.flushingOutbox = false; }
  }

  /**
   * Adds a task to the BullMQ queue.
   * Returns the BullMQ job ID, or null if Redis is unavailable.
   */
  async enqueue(task: QueuedTask): Promise<string> {
    if (!this.available || !this.queue) {
      console.warn(
        "[TaskQueue] enqueue called but queue is unavailable — skipping.",
        { taskId: task.taskId }
      );
      // Return a synthetic ID so callers can detect degraded mode without null-checks.
      return `unavailable:${task.taskId}:${Date.now()}`;
    }

    try {
      const job = await this.queue.add(
        `task:${task.taskId}`,
        task,
        {
          jobId: `message-${createHash("sha256").update(task.taskId).digest("hex")}`,
          // Priority: long tasks go first (lower number = higher priority).
          priority: task.estimatedDuration === "long" ? 1
                  : task.estimatedDuration === "medium" ? 5
                  : 10,
        }
      );

      console.log(
        `[TaskQueue] Enqueued job ${job.id} for taskId=${task.taskId} ` +
          `(${task.estimatedDuration} duration)`
      );

      return job.id ?? `enqueued:${task.taskId}:${Date.now()}`;
      // job.id is always set by BullMQ for newly added jobs
    } catch (err: any) {
      console.error("[TaskQueue] Failed to enqueue task:", err?.message ?? err);
      // Graceful degradation — don't crash callers.
      return `error:${task.taskId}:${Date.now()}`;
    }
  }

  /**
   * Returns the current status + progress of a BullMQ job.
   * Returns null if the job is unknown or the queue is unavailable.
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    // Synthetic IDs returned during degraded mode — report as unavailable.
    if (jobId.startsWith("unavailable:") || jobId.startsWith("error:")) {
      return {
        status: "unavailable",
        progress: 0,
        error: "Task queue was unavailable when this job was submitted.",
      };
    }

    if (!this.available || !this.queue) {
      return null;
    }

    try {
      const job = await Job.fromId<QueuedTask, string>(this.queue, jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress =
        typeof job.progress === "number" ? job.progress : 0;

      return {
        status: state,
        progress,
        result: state === "completed" ? (job.returnvalue ?? undefined) : undefined,
        error:
          state === "failed"
            ? (job.failedReason ?? "Unknown error")
            : undefined,
      };
    } catch (err: any) {
      console.error("[TaskQueue] Failed to fetch status for job:", jobId, err?.message ?? err);
      return null;
    }
  }

  /**
   * Attempts to cancel a queued (not yet active) job.
   * Returns true if successfully cancelled, false otherwise.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.available || !this.queue) {
      return false;
    }

    if (jobId.startsWith("unavailable:") || jobId.startsWith("error:")) {
      return false;
    }

    try {
      const job = await Job.fromId<QueuedTask, string>(this.queue, jobId);
      if (!job) {
        return false;
      }

      const state = await job.getState();

      // Only cancel jobs that haven't started yet.
      if (state === "waiting" || state === "delayed" || state === "prioritized") {
        await job.remove();
        updateAdmission(job.data.taskId, "failed");
        console.log(`[TaskQueue] Cancelled job ${jobId}`);
        return true;
      }

      // For active jobs, attempt to mark failed (worker will detect this).
      if (state === "active") {
        await job.moveToFailed(new Error("Cancelled by user"), "0");
        console.log(`[TaskQueue] Marked active job ${jobId} as failed (cancelled).`);
        return true;
      }

      console.warn(
        `[TaskQueue] Cannot cancel job ${jobId} in state "${state}".`
      );
      return false;
    } catch (err: any) {
      console.error(
        `[TaskQueue] Failed to cancel job ${jobId}:`,
        err?.message ?? err
      );
      return false;
    }
  }

  /**
   * Gracefully shuts down the worker and closes Redis connections.
   */
  async shutdown(): Promise<void> {
    console.log("[TaskQueue] Shutting down…");

    await this.closeResources();
    console.log("[TaskQueue] Shutdown complete.");
  }

  private async closeResources(): Promise<void> {
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    this.outboxTimer = null;
    this.available = false;
    this.readyConnections.clear();

    try {
      if (this.worker) {
        await this.worker.close();
      }
    } catch (err: any) {
      console.warn("[TaskQueue] Error closing worker:", err?.message ?? err);
    } finally {
      this.worker = null;
    }

    try {
      if (this.queueEvents) {
        await this.queueEvents.close();
      }
    } catch (err: any) {
      console.warn(
        "[TaskQueue] Error closing queue events:",
        err?.message ?? err
      );
    } finally {
      this.queueEvents = null;
    }

    try {
      if (this.queue) {
        await this.queue.close();
      }
    } catch (err: any) {
      console.warn("[TaskQueue] Error closing queue:", err?.message ?? err);
    } finally {
      this.queue = null;
    }

    for (const connection of [
      this.redisConnection,
      this.workerRedis,
      this.eventsRedis,
    ]) {
      try {
        connection?.disconnect();
      } catch (err: any) {
        console.warn("[TaskQueue] Error disconnecting Redis:", err?.message ?? err);
      }
    }
    this.redisConnection = null;
    this.workerRedis = null;
    this.eventsRedis = null;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const taskQueue = new TaskQueue();
