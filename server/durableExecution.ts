import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { redactValue } from "./redaction.js";
import { ExecutionFailure } from "./executionOutcome.js";

const processToken = crypto.randomUUID();

export type DurableRunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type DurableStepStatus = "started" | "completed" | "failed" | "skipped";

export interface DurableRunInput {
  workflowId: string;
  idempotencyKey: string;
  conversationId: string;
  messageId?: string;
  executionMode: "direct" | "bullmq" | "temporal";
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
  executionMode: "direct" | "bullmq" | "temporal";
  status: DurableRunStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  currentStep?: string;
  metadata?: Record<string, unknown>;
  steps: DurableStepRecord[];
  events: DurableEventRecord[];
  ownerPid?: number;
  ownerToken?: string;
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
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), "utf-8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, target); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

function ownerAlive(run: Pick<DurableRunRecord, "ownerPid" | "ownerToken">): boolean {
  if (!run.ownerPid || !run.ownerToken) return false;
  if (run.ownerPid === process.pid) return run.ownerToken === processToken;
  try { process.kill(run.ownerPid, 0); return true; }
  catch (error: any) { return error?.code !== "ESRCH"; }
}

function claimFile(workflowId: string): string { return `${runPath(workflowId)}.lock`; }

function claimRun(workflowId: string): void {
  const target = claimFile(workflowId);
  if (fs.existsSync(target)) {
    const owner = readJson<Pick<DurableRunRecord, "ownerPid" | "ownerToken">>(target);
    if (owner && !ownerAlive(owner)) fs.unlinkSync(target);
  }
  try {
    const fd = fs.openSync(target, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ ownerPid: process.pid, ownerToken: processToken })); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  } catch (error: any) {
    if (error?.code === "EEXIST") throw new Error("Execution already active; refusing concurrent replay");
    throw error;
  }
}

/** Only pre-planning reads may be safely repeated. Tool/plan interruptions need owner review. */
export function canResumeRun(run: DurableRunRecord): boolean {
  return run.steps.every(step => ["orchestrator.accepted", "memory.recall", "skills.match"].includes(step.stepId));
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
  // Serialize reclamation across processes. A killed process releases the SQLite
  // transaction; a second claimant then reads the new owner's record, not stale JSON.
  const mutex = new Database(path.join(durableRoot(), "claims.db"));
  mutex.pragma("busy_timeout = 5000");
  try { return mutex.transaction(() => beginRunUnderLock(input)).immediate(); }
  finally { mutex.close(); }
}

function beginRunUnderLock(input: DurableRunInput): DurableRunStartResult {
  ensureRoot();

  const existingByKey = readJson<{ workflowId: string }>(idempotencyPath(input.idempotencyKey));
  {
    const existing = getDurableRun(existingByKey?.workflowId || input.workflowId);
    if (existing) {
      if (existing.idempotencyKey !== input.idempotencyKey || existing.conversationId !== input.conversationId || existing.workflowId !== input.workflowId) {
        throw new ExecutionFailure("workflow_conflict", "Workflow identifier or idempotency key already belongs to another request");
      }
      if (!existingByKey) writeJsonAtomic(idempotencyPath(input.idempotencyKey), { workflowId: existing.workflowId });
      existing.attempts += 1;
      existing.updatedAt = now();
      existing.events.push({
        timestamp: existing.updatedAt,
        type: "duplicate_start",
        details: redactValue({ idempotencyKey: input.idempotencyKey }) as Record<string, unknown>,
      });
      if (existing.status === "running" && !ownerAlive(existing)) {
        if (!canResumeRun(existing)) {
          existing.status = "interrupted";
          existing.events.push({ timestamp: now(), type: "recovery_requires_review" });
          persistRun(existing);
          throw new ExecutionFailure("interrupted_execution", "Execution interrupted after planning or a side effect. Review its recorded actions before submitting a new request.");
        }
        // A dead owner's lock is never reclaimed while that process is alive.
        if (fs.existsSync(claimFile(existing.workflowId))) fs.unlinkSync(claimFile(existing.workflowId));
        claimRun(existing.workflowId);
        existing.ownerPid = process.pid;
        existing.ownerToken = processToken;
        existing.events.push({ timestamp: now(), type: "safe_pre_execution_resume" });
        return { run: persistRun(existing), created: true };
      }
      return { run: persistRun(existing), created: false };
    }
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
    ownerPid: process.pid,
    ownerToken: processToken,
  };

  claimRun(input.workflowId);
  persistRun(run);
  writeJsonAtomic(idempotencyPath(input.idempotencyKey), { workflowId: input.workflowId });
  return { run, created: true };
}

export function getDurableRun(workflowId: string): DurableRunRecord | null {
  ensureRoot();
  return readJson<DurableRunRecord>(runPath(workflowId));
}

export function reconcileInterruptedRuns(): DurableRunRecord[] {
  ensureRoot();
  const interrupted: DurableRunRecord[] = [];
  for (const filename of fs.readdirSync(path.join(durableRoot(), "runs"))) {
    if (!filename.endsWith(".json")) continue;
    const run = readJson<DurableRunRecord>(path.join(durableRoot(), "runs", filename));
    if (run?.status !== "running" || ownerAlive(run) || canResumeRun(run)) continue;
    run.status = "interrupted";
    run.updatedAt = now();
    run.events.push({ timestamp: run.updatedAt, type: "recovery_requires_review" });
    persistRun(run);
    interrupted.push(run);
  }
  return interrupted;
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
  persistRun(run);
  if (status !== "running" && run.ownerToken === processToken && fs.existsSync(claimFile(workflowId))) {
    fs.unlinkSync(claimFile(workflowId));
  }
  return run;
}

export function classifyRetry(error: unknown): RetryClassification {
  if (error instanceof ExecutionFailure) return { retryable: false, category: "validation", backoffMs: 0, reason: error.message };
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
