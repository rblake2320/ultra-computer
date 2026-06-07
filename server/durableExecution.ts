import crypto from "crypto";
import fs from "fs";
import path from "path";
import { redactValue } from "./redaction.js";

export type DurableRunStatus = "running" | "completed" | "failed" | "cancelled";
export type DurableStepStatus = "started" | "completed" | "failed" | "skipped";

export interface DurableRunInput {
  workflowId: string;
  idempotencyKey: string;
  conversationId: string;
  messageId?: string;
  executionMode: "direct" | "bullmq";
  metadata?: Record<string, unknown>;
}

export interface DurableStepInput {
  workflowId: string;
  stepId: string;
  status: DurableStepStatus;
  idempotencyKey?: string;
  details?: Record<string, unknown>;
  error?: unknown;
}

export interface DurableStepRecord {
  stepId: string;
  status: DurableStepStatus;
  idempotencyKey?: string;
  firstSeenAt: number;
  updatedAt: number;
  details?: Record<string, unknown>;
  error?: unknown;
}

export interface DurableEventRecord {
  timestamp: number;
  type: string;
  stepId?: string;
  details?: Record<string, unknown>;
}

export interface DurableRunRecord {
  workflowId: string;
  idempotencyKey: string;
  conversationId: string;
  messageId?: string;
  executionMode: "direct" | "bullmq";
  status: DurableRunStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  currentStep?: string;
  metadata?: Record<string, unknown>;
  steps: DurableStepRecord[];
  events: DurableEventRecord[];
}

export interface DurableRunStartResult {
  run: DurableRunRecord;
  created: boolean;
}

export interface RetryClassification {
  retryable: boolean;
  category: "rate_limit" | "transient" | "timeout" | "policy_denied" | "validation" | "auth" | "unknown";
  backoffMs: number;
  reason: string;
}

function durableRoot(): string {
  return path.resolve(process.env.ULTRA_DURABLE_RUN_DIR || path.join(process.cwd(), "data/durable-runs"));
}

function ensureRoot(): void {
  fs.mkdirSync(path.join(durableRoot(), "runs"), { recursive: true });
  fs.mkdirSync(path.join(durableRoot(), "idempotency"), { recursive: true });
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function runPath(workflowId: string): string {
  return path.join(durableRoot(), "runs", `${hash(workflowId)}.json`);
}

function idempotencyPath(key: string): string {
  return path.join(durableRoot(), "idempotency", `${hash(key)}.json`);
}

function now(): number {
  return Date.now();
}

function writeJsonAtomic(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tmp, target);
}

function readJson<T>(target: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(target, "utf-8")) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

function persistRun(run: DurableRunRecord): DurableRunRecord {
  writeJsonAtomic(runPath(run.workflowId), run);
  return run;
}

export function workflowIdFromMessage(messageId: string): string {
  return `uc-msg-${messageId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function beginDurableRun(input: DurableRunInput): DurableRunStartResult {
  ensureRoot();

  const existingByKey = readJson<{ workflowId: string }>(idempotencyPath(input.idempotencyKey));
  if (existingByKey) {
    const existing = getDurableRun(existingByKey.workflowId);
    if (existing) {
      existing.attempts += 1;
      existing.updatedAt = now();
      existing.events.push({
        timestamp: existing.updatedAt,
        type: "duplicate_start",
        details: redactValue({ idempotencyKey: input.idempotencyKey }) as Record<string, unknown>,
      });
      return { run: persistRun(existing), created: false };
    }
  }

  const existingByWorkflow = getDurableRun(input.workflowId);
  if (existingByWorkflow) {
    existingByWorkflow.attempts += 1;
    existingByWorkflow.updatedAt = now();
    existingByWorkflow.events.push({ timestamp: existingByWorkflow.updatedAt, type: "workflow_restart" });
    writeJsonAtomic(idempotencyPath(input.idempotencyKey), { workflowId: input.workflowId });
    return { run: persistRun(existingByWorkflow), created: false };
  }

  const timestamp = now();
  const run: DurableRunRecord = {
    workflowId: input.workflowId,
    idempotencyKey: input.idempotencyKey,
    conversationId: input.conversationId,
    messageId: input.messageId,
    executionMode: input.executionMode,
    status: "running",
    attempts: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: redactValue(input.metadata || {}) as Record<string, unknown>,
    steps: [],
    events: [{ timestamp, type: "run_started" }],
  };

  writeJsonAtomic(idempotencyPath(input.idempotencyKey), { workflowId: input.workflowId });
  return { run: persistRun(run), created: true };
}

export function getDurableRun(workflowId: string): DurableRunRecord | null {
  ensureRoot();
  return readJson<DurableRunRecord>(runPath(workflowId));
}

export function recordDurableStep(input: DurableStepInput): DurableStepRecord {
  const run = getDurableRun(input.workflowId);
  if (!run) {
    throw new Error(`Durable run not found: ${input.workflowId}`);
  }

  const timestamp = now();
  const existing = input.idempotencyKey
    ? run.steps.find((step) => step.idempotencyKey === input.idempotencyKey)
    : run.steps.find((step) => step.stepId === input.stepId);

  if (existing) {
    existing.status = input.status;
    existing.updatedAt = timestamp;
    existing.details = redactValue(input.details || existing.details || {}) as Record<string, unknown>;
    if (input.error !== undefined) existing.error = redactValue(input.error);
    run.currentStep = input.stepId;
    run.updatedAt = timestamp;
    run.events.push({
      timestamp,
      type: "step_duplicate_or_update",
      stepId: input.stepId,
      details: redactValue({ idempotencyKey: input.idempotencyKey, status: input.status }) as Record<string, unknown>,
    });
    persistRun(run);
    return existing;
  }

  const step: DurableStepRecord = {
    stepId: input.stepId,
    status: input.status,
    idempotencyKey: input.idempotencyKey,
    firstSeenAt: timestamp,
    updatedAt: timestamp,
    details: redactValue(input.details || {}) as Record<string, unknown>,
    error: input.error === undefined ? undefined : redactValue(input.error),
  };
  run.steps.push(step);
  run.currentStep = input.stepId;
  run.updatedAt = timestamp;
  run.events.push({
    timestamp,
    type: "step_recorded",
    stepId: input.stepId,
    details: redactValue({ idempotencyKey: input.idempotencyKey, status: input.status }) as Record<string, unknown>,
  });
  persistRun(run);
  return step;
}

export function markDurableRunStatus(
  workflowId: string,
  status: DurableRunStatus,
  details?: Record<string, unknown>
): DurableRunRecord {
  const run = getDurableRun(workflowId);
  if (!run) {
    throw new Error(`Durable run not found: ${workflowId}`);
  }
  const timestamp = now();
  run.status = status;
  run.updatedAt = timestamp;
  run.events.push({
    timestamp,
    type: `run_${status}`,
    details: redactValue(details || {}) as Record<string, unknown>,
  });
  return persistRun(run);
}

export function classifyRetry(error: unknown): RetryClassification {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error);
  const message = (raw || "unknown error").toLowerCase();

  if (message.includes("policy denied")) {
    return { retryable: false, category: "policy_denied", backoffMs: 0, reason: "Policy denial is non-retryable until policy or request changes." };
  }
  if (message.includes("validation") || message.includes("bad request") || message.includes("invalid")) {
    return { retryable: false, category: "validation", backoffMs: 0, reason: "Invalid input is non-retryable." };
  }
  if (message.includes("unauthorized") || message.includes("forbidden") || message.includes("401") || message.includes("403")) {
    return { retryable: false, category: "auth", backoffMs: 0, reason: "Authentication/authorization failure is non-retryable until credentials or permissions change." };
  }
  if (message.includes("rate limit") || message.includes("429") || message.includes("too many requests")) {
    return { retryable: true, category: "rate_limit", backoffMs: 30_000, reason: "Rate limit can be retried after backoff." };
  }
  if (message.includes("timeout") || message.includes("timed out") || message.includes("deadline")) {
    return { retryable: true, category: "timeout", backoffMs: 10_000, reason: "Timeout can be retried with backoff." };
  }
  if (message.includes("econnreset") || message.includes("enotfound") || message.includes("network") || message.includes("temporarily unavailable")) {
    return { retryable: true, category: "transient", backoffMs: 5_000, reason: "Transient infrastructure failure can be retried." };
  }

  return { retryable: true, category: "unknown", backoffMs: 5_000, reason: "Unknown errors default to retryable at the boundary; callers may override." };
}
