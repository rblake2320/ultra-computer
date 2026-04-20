/**
 * Task Queue — BullMQ + Redis
 *
 * Long-running agent tasks that are estimated to exceed ~30 s are offloaded
 * here instead of running synchronously inside the HTTP request lifecycle.
 * If Redis is unavailable the queue gracefully degrades: isAvailable() returns
 * false and every enqueue / status / cancel call is a safe no-op.
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { cacheLogger } from "./logger.js";
import IORedis from "ioredis";

// ─── Exported Types ───────────────────────────────────────────────────────────

export interface QueuedTask {
  conversationId: string;
  taskId: string;
  userMessage: string;
  estimatedDuration: "short" | "medium" | "long";
}

export type JobStatus = {
  status: string;
  progress: number;
  result?: string;
  error?: string;
};

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

/**
 * Placeholder processor — the real orchestrator integration wires in later.
 * For now we log and immediately return a stub result so jobs complete cleanly.
 */
async function processTask(job: Job<QueuedTask>): Promise<string> {
  const { conversationId, taskId, userMessage, estimatedDuration } = job.data;

  cacheLogger.info({ jobId: job.id, conversationId, taskId, estimatedDuration, messageLength: userMessage.length }, "TaskQueue: processing job");

  // Simulate progress reporting so the status endpoint returns useful data.
  await job.updateProgress(10);

  // Stub: real implementation calls the orchestrator here.
  cacheLogger.info({ taskId }, "TaskQueue: stub execution complete");

  await job.updateProgress(100);

  return JSON.stringify({
    taskId,
    conversationId,
    status: "stub_complete",
    message:
      "Task queued and processed by stub worker. Orchestrator integration pending.",
  });
}

// ─── TaskQueue Class ─────────────────────────────────────────────────────────

export class TaskQueue {
  private queue: Queue<QueuedTask> | null = null;
  private worker: Worker<QueuedTask, string> | null = null;
  private queueEvents: QueueEvents | null = null;
  private redisConnection: IORedis | null = null;
  private available = false;

  constructor() {}

  /**
   * Attempts to connect to Redis and spin up the BullMQ queue + worker.
   * Returns true on success, false if Redis is unavailable.
   */
  async initialize(): Promise<boolean> {
    try {
      // Test Redis connectivity with a short timeout so startup is not blocked.
      const redis = new IORedis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        // deprecated 'host'/'port' overrides above
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck: false,
        connectTimeout: 3000,
        lazyConnect: true,
      });

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
      const workerRedis = new IORedis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      workerRedis.on('error', (err) => {
        cacheLogger.error({ err }, "TaskQueue: workerRedis connection error");
      });

      this.worker = new Worker<QueuedTask, string>(
        "ultra-tasks",
        processTask,
        {
          connection: workerRedis,
          concurrency: 4,
        }
      );

      this.worker.on("completed", (job, returnValue) => {
        cacheLogger.info({ jobId: job.id, returnValue }, "TaskQueue: job completed");
      });

      this.worker.on("failed", (job, err) => {
        cacheLogger.error({ err, jobId: job?.id }, "TaskQueue: job failed");
      });

      this.worker.on("error", (err) => {
        cacheLogger.error({ err }, "TaskQueue: worker error");
      });

      // QueueEvents for advanced state tracking (separate connection).
      const eventsRedis = new IORedis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      eventsRedis.on('error', (err) => {
        cacheLogger.error({ err }, "TaskQueue: eventsRedis connection error");
      });

      this.queueEvents = new QueueEvents("ultra-tasks", {
        connection: eventsRedis,
      });

      this.available = true;
      cacheLogger.info("TaskQueue: initialized successfully — Redis connected");
      return true;
    } catch (err: any) {
      cacheLogger.warn({ err }, "TaskQueue: Redis unavailable — task queue disabled. All operations will degrade gracefully");
      this.available = false;
      return false;
    }
  }

  /** Whether the queue is backed by a live Redis connection. */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Adds a task to the BullMQ queue.
   * Returns the BullMQ job ID, or null if Redis is unavailable.
   */
  async enqueue(task: QueuedTask): Promise<string> {
    if (!this.available || !this.queue) {
      cacheLogger.warn({ taskId: task.taskId }, "TaskQueue: enqueue called but queue is unavailable — skipping");
      // Return a synthetic ID so callers can store it without null-checks.
      return `unavailable:${task.taskId}:${Date.now()}`;
    }

    try {
      const job = await this.queue.add(
        `task:${task.taskId}`,
        task,
        {
          // Priority: long tasks go first (lower number = higher priority).
          priority: task.estimatedDuration === "long" ? 1
                  : task.estimatedDuration === "medium" ? 5
                  : 10,
        }
      );

      cacheLogger.info({ jobId: job.id, taskId: task.taskId, duration: task.estimatedDuration }, "TaskQueue: job enqueued");

      return job.id ?? `enqueued:${task.taskId}:${Date.now()}`;
      // job.id is always set by BullMQ for newly added jobs
    } catch (err: any) {
      cacheLogger.error({ err }, "TaskQueue: failed to enqueue task");
      // Graceful degradation — don't crash callers.
      return `error:${task.taskId}:${Date.now()}`;
    }
  }

  /**
   * Returns the current status + progress of a BullMQ job.
   * Returns null if the job is unknown or the queue is unavailable.
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    if (!this.available || !this.queue) {
      return null;
    }

    // Synthetic IDs returned during degraded mode — report as unavailable.
    if (jobId.startsWith("unavailable:") || jobId.startsWith("error:")) {
      return {
        status: "unavailable",
        progress: 0,
        error: "Task queue was unavailable when this job was submitted.",
      };
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
      cacheLogger.error({ err, jobId }, "TaskQueue: failed to fetch job status");
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
        cacheLogger.info({ jobId }, "TaskQueue: job cancelled");
        return true;
      }

      // For active jobs, attempt to mark failed (worker will detect this).
      if (state === "active") {
        await job.moveToFailed(new Error("Cancelled by user"), "0");
        cacheLogger.info({ jobId }, "TaskQueue: marked active job as failed (cancelled)");
        return true;
      }

      cacheLogger.warn({ jobId, state }, "TaskQueue: cannot cancel job in current state");
      return false;
    } catch (err: any) {
      cacheLogger.error({ err, jobId }, "TaskQueue: failed to cancel job");
      return false;
    }
  }

  /**
   * Gracefully shuts down the worker and closes Redis connections.
   */
  async shutdown(): Promise<void> {
    cacheLogger.info("TaskQueue: shutting down");

    try {
      if (this.worker) {
        await this.worker.close();
      }
    } catch (err: any) {
      cacheLogger.warn({ err }, "TaskQueue: error closing worker");
    }

    try {
      if (this.queueEvents) {
        await this.queueEvents.close();
      }
    } catch (err: any) {
      cacheLogger.warn({ err }, "TaskQueue: error closing queue events");
    }

    try {
      if (this.queue) {
        await this.queue.close();
      }
    } catch (err: any) {
      cacheLogger.warn({ err }, "TaskQueue: error closing queue");
    }

    try {
      if (this.redisConnection) {
        this.redisConnection.disconnect();
      }
    } catch (err: any) {
      cacheLogger.warn({ err }, "TaskQueue: error disconnecting Redis");
    }

    this.available = false;
    cacheLogger.info("TaskQueue: shutdown complete");
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const taskQueue = new TaskQueue();
