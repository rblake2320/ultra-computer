/**
 * Task Queue — BullMQ + Redis
 *
 * Long-running agent tasks that are estimated to exceed ~30 s are offloaded
 * here instead of running synchronously inside the HTTP request lifecycle.
 * If Redis is unavailable the queue gracefully degrades: isAvailable() returns
 * false and every enqueue / status / cancel call is a safe no-op.
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
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

  console.log(
    `[TaskQueue] Would process job ${job.id}: ` +
      `conversationId=${conversationId} taskId=${taskId} ` +
      `estimatedDuration=${estimatedDuration} ` +
      `messageLength=${userMessage.length}`
  );

  // Simulate progress reporting so the status endpoint returns useful data.
  await job.updateProgress(10);

  // Stub: real implementation calls the orchestrator here.
  console.log(
    `[TaskQueue] Stub execution complete for taskId=${taskId}. ` +
      `Real orchestrator integration pending.`
  );

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
        host: "localhost",
        port: 6379,
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
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
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
        console.log(`[TaskQueue] Job ${job.id} completed:`, returnValue);
      });

      this.worker.on("failed", (job, err) => {
        console.error(`[TaskQueue] Job ${job?.id} failed:`, err.message);
      });

      this.worker.on("error", (err) => {
        console.error("[TaskQueue] Worker error:", err.message);
      });

      // QueueEvents for advanced state tracking (separate connection).
      const eventsRedis = new IORedis({
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      this.queueEvents = new QueueEvents("ultra-tasks", {
        connection: eventsRedis,
      });

      this.available = true;
      console.log("[TaskQueue] Initialized successfully — Redis connected.");
      return true;
    } catch (err: any) {
      console.warn(
        "[TaskQueue] Redis unavailable — task queue disabled. All operations will degrade gracefully.",
        err?.message ?? err
      );
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
      console.warn(
        "[TaskQueue] enqueue called but queue is unavailable — skipping.",
        { taskId: task.taskId }
      );
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

      console.log(
        `[TaskQueue] Enqueued job ${job.id} for taskId=${task.taskId} ` +
          `(${task.estimatedDuration} duration)`
      );

      return job.id!;
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
      console.error(
        `[TaskQueue] Failed to fetch status for job ${jobId}:`,
        err?.message ?? err
      );
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

    try {
      if (this.worker) {
        await this.worker.close();
      }
    } catch (err: any) {
      console.warn("[TaskQueue] Error closing worker:", err?.message ?? err);
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
    }

    try {
      if (this.queue) {
        await this.queue.close();
      }
    } catch (err: any) {
      console.warn("[TaskQueue] Error closing queue:", err?.message ?? err);
    }

    try {
      if (this.redisConnection) {
        this.redisConnection.disconnect();
      }
    } catch (err: any) {
      console.warn("[TaskQueue] Error disconnecting Redis:", err?.message ?? err);
    }

    this.available = false;
    console.log("[TaskQueue] Shutdown complete.");
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const taskQueue = new TaskQueue();
