/**
 * taskCheckpointing.ts
 *
 * Filesystem-based task checkpointing and crash-recovery system.
 * Checkpoints are stored as JSON files in data/checkpoints/{taskId}.json.
 * No external dependencies — Node built-ins only.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKPOINT_DIR = path.resolve('/home/user/workspace/ultra-computer/data/checkpoints');
const DEFAULT_MAX_STALE_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_STALE_THRESHOLD_MS = 60 * 1000; // 60 seconds → task was "running" when server died
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;

// Ensure the checkpoint directory exists at module load time.
fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface TaskCheckpoint {
  taskId: string;
  conversationId: string;
  taskTitle: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'abandoned';
  createdAt: number;
  updatedAt: number;
  // Progress tracking
  totalSteps: number;
  completedSteps: number;
  currentStep: string;
  progress: number; // 0-100
  // State preservation
  state: Record<string, unknown>;
  subtaskResults: Array<{ stepId: string; result: string; completedAt: number }>;
  // Recovery info
  lastHeartbeat: number;
  retryCount: number;
  maxRetries: number;
  errorLog: Array<{ timestamp: number; error: string; step: string }>;
  // Estimated completion
  estimatedCompletionAt: number | null;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function checkpointPath(taskId: string): string {
  return path.join(CHECKPOINT_DIR, `${taskId}.json`);
}

function readCheckpoint(taskId: string): TaskCheckpoint | null {
  const filePath = checkpointPath(taskId);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as TaskCheckpoint;
  } catch {
    return null;
  }
}

function writeCheckpoint(checkpoint: TaskCheckpoint): void {
  const filePath = checkpointPath(checkpoint.taskId);
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

function now(): number {
  return Date.now();
}

/**
 * Calculate estimated completion timestamp based on average step duration so far.
 * Returns null if no steps have been completed yet.
 */
function calcEstimatedCompletion(checkpoint: TaskCheckpoint): number | null {
  const { completedSteps, totalSteps, createdAt, subtaskResults } = checkpoint;
  if (completedSteps === 0 || totalSteps === 0) return null;
  if (completedSteps >= totalSteps) return now();

  // Use the earliest and latest completedAt from subtaskResults for accuracy,
  // falling back to (now - createdAt) over completedSteps.
  let avgStepMs: number;
  if (subtaskResults.length >= 2) {
    const sorted = [...subtaskResults].sort((a, b) => a.completedAt - b.completedAt);
    const spanMs = sorted[sorted.length - 1].completedAt - sorted[0].completedAt;
    avgStepMs = spanMs / (sorted.length - 1);
  } else {
    const elapsed = now() - createdAt;
    avgStepMs = elapsed / completedSteps;
  }

  const remainingSteps = totalSteps - completedSteps;
  return now() + remainingSteps * avgStepMs;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Create a new checkpoint and persist it to disk.
 */
export function createCheckpoint(opts: {
  taskId: string;
  conversationId: string;
  taskTitle: string;
  totalSteps: number;
  maxRetries?: number;
}): TaskCheckpoint {
  const timestamp = now();
  const checkpoint: TaskCheckpoint = {
    taskId: opts.taskId,
    conversationId: opts.conversationId,
    taskTitle: opts.taskTitle,
    status: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    totalSteps: opts.totalSteps,
    completedSteps: 0,
    currentStep: '',
    progress: 0,
    state: {},
    subtaskResults: [],
    lastHeartbeat: timestamp,
    retryCount: 0,
    maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    errorLog: [],
    estimatedCompletionAt: null,
    elapsedMs: 0,
  };
  writeCheckpoint(checkpoint);
  return checkpoint;
}

/**
 * Apply a partial update to an existing checkpoint.
 * Throws if the checkpoint does not exist.
 */
export function updateCheckpoint(
  taskId: string,
  update: Partial<TaskCheckpoint>,
): TaskCheckpoint {
  const existing = readCheckpoint(taskId);
  if (!existing) {
    throw new Error(`Checkpoint not found: ${taskId}`);
  }
  const updated: TaskCheckpoint = {
    ...existing,
    ...update,
    taskId: existing.taskId, // never overwrite identity fields
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  writeCheckpoint(updated);
  return updated;
}

/**
 * Advance a task by one step: increments completedSteps, records the step result,
 * recalculates progress and ETA.
 */
export function advanceStep(
  taskId: string,
  stepId: string,
  result: string,
): TaskCheckpoint {
  const existing = readCheckpoint(taskId);
  if (!existing) {
    throw new Error(`Checkpoint not found: ${taskId}`);
  }

  const completedAt = now();
  const completedSteps = existing.completedSteps + 1;
  const progress =
    existing.totalSteps > 0
      ? Math.min(100, Math.round((completedSteps / existing.totalSteps) * 100))
      : 0;

  const subtaskResults: TaskCheckpoint['subtaskResults'] = [
    ...existing.subtaskResults,
    { stepId, result, completedAt },
  ];

  const partial: Partial<TaskCheckpoint> = {
    completedSteps,
    currentStep: stepId,
    progress,
    subtaskResults,
    elapsedMs: completedAt - existing.createdAt,
    lastHeartbeat: completedAt,
  };

  // Temporarily merge so calcEstimatedCompletion has accurate data.
  const merged: TaskCheckpoint = { ...existing, ...partial, updatedAt: completedAt };
  partial.estimatedCompletionAt = calcEstimatedCompletion(merged);

  return updateCheckpoint(taskId, partial);
}

/**
 * Log an error against a task step and increment retryCount.
 */
export function recordError(taskId: string, error: string, step: string): void {
  const existing = readCheckpoint(taskId);
  if (!existing) {
    throw new Error(`Checkpoint not found: ${taskId}`);
  }
  const errorLog: TaskCheckpoint['errorLog'] = [
    ...existing.errorLog,
    { timestamp: now(), error, step },
  ];
  updateCheckpoint(taskId, {
    errorLog,
    retryCount: existing.retryCount + 1,
  });
}

/**
 * Retrieve a single checkpoint by taskId, or null if it doesn't exist.
 */
export function getCheckpoint(taskId: string): TaskCheckpoint | null {
  return readCheckpoint(taskId);
}

/**
 * List all checkpoints, optionally filtered by status.
 */
export function getAllCheckpoints(status?: TaskCheckpoint['status']): TaskCheckpoint[] {
  let files: string[];
  try {
    files = fs.readdirSync(CHECKPOINT_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const checkpoints: TaskCheckpoint[] = [];
  for (const file of files) {
    const taskId = path.basename(file, '.json');
    const cp = readCheckpoint(taskId);
    if (cp && (!status || cp.status === status)) {
      checkpoints.push(cp);
    }
  }
  return checkpoints;
}

/**
 * Returns tasks that were in 'running' status when the server last died —
 * i.e. running tasks whose lastHeartbeat is older than 60 seconds.
 */
export function getResumableTasks(): TaskCheckpoint[] {
  const threshold = now() - HEARTBEAT_STALE_THRESHOLD_MS;
  return getAllCheckpoints('running').filter((cp) => cp.lastHeartbeat < threshold);
}

/**
 * Update the lastHeartbeat timestamp of a running task.
 */
export function heartbeatTask(taskId: string): void {
  const existing = readCheckpoint(taskId);
  if (!existing) return; // silently skip missing checkpoints in heartbeat loops
  if (existing.status !== 'running') return;
  updateCheckpoint(taskId, { lastHeartbeat: now() });
}

/**
 * Mark a task as completed and record its final elapsed time.
 */
export function completeTask(taskId: string): void {
  const existing = readCheckpoint(taskId);
  if (!existing) {
    throw new Error(`Checkpoint not found: ${taskId}`);
  }
  const completedAt = now();
  updateCheckpoint(taskId, {
    status: 'completed',
    progress: 100,
    elapsedMs: completedAt - existing.createdAt,
    estimatedCompletionAt: completedAt,
    lastHeartbeat: completedAt,
  });
}

/**
 * Mark a task as failed and record the reason in the error log.
 */
export function failTask(taskId: string, reason: string): void {
  const existing = readCheckpoint(taskId);
  if (!existing) {
    throw new Error(`Checkpoint not found: ${taskId}`);
  }
  const failedAt = now();
  const errorLog: TaskCheckpoint['errorLog'] = [
    ...existing.errorLog,
    { timestamp: failedAt, error: reason, step: existing.currentStep },
  ];
  updateCheckpoint(taskId, {
    status: 'failed',
    elapsedMs: failedAt - existing.createdAt,
    errorLog,
    lastHeartbeat: failedAt,
  });
}

/**
 * Mark all running tasks with a stale heartbeat as 'abandoned'.
 * Returns the list of tasks that were abandoned.
 */
export function abandonStaleTasks(maxStaleMs: number = DEFAULT_MAX_STALE_MS): TaskCheckpoint[] {
  const threshold = now() - maxStaleMs;
  const running = getAllCheckpoints('running');
  const abandoned: TaskCheckpoint[] = [];

  for (const cp of running) {
    if (cp.lastHeartbeat < threshold) {
      const updated = updateCheckpoint(cp.taskId, { status: 'abandoned' });
      abandoned.push(updated);
    }
  }
  return abandoned;
}

/**
 * Remove a checkpoint file from disk.
 */
export function deleteCheckpoint(taskId: string): void {
  const filePath = checkpointPath(taskId);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone — that's fine.
  }
}

/**
 * Aggregate counts across all checkpoints.
 */
export function getCheckpointStats(): {
  total: number;
  running: number;
  completed: number;
  failed: number;
  abandoned: number;
  paused: number;
} {
  const all = getAllCheckpoints();
  return {
    total: all.length,
    running: all.filter((c) => c.status === 'running').length,
    completed: all.filter((c) => c.status === 'completed').length,
    failed: all.filter((c) => c.status === 'failed').length,
    abandoned: all.filter((c) => c.status === 'abandoned').length,
    paused: all.filter((c) => c.status === 'paused').length,
  };
}

// ---------------------------------------------------------------------------
// Heartbeat Loop
// ---------------------------------------------------------------------------

/**
 * Start a periodic heartbeat loop that:
 *  - Calls heartbeatTask() for every running task every `interval` ms (default 30 s).
 *  - Calls abandonStaleTasks() every 60 s.
 *
 * Returns the primary NodeJS.Timeout so callers can clearInterval() it.
 */
export function startCheckpointHeartbeats(
  interval: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
): NodeJS.Timeout {
  let tickCount = 0;

  const timer = setInterval(() => {
    tickCount++;

    // Heartbeat all running tasks.
    const running = getAllCheckpoints('running');
    for (const cp of running) {
      heartbeatTask(cp.taskId);
    }

    // Abandon stale tasks every second tick (≈ 60 s at default interval).
    if (tickCount % 2 === 0) {
      abandonStaleTasks();
    }
  }, interval);

  // Allow Node.js to exit even if the timer is still active.
  if (timer.unref) {
    timer.unref();
  }

  return timer;
}
