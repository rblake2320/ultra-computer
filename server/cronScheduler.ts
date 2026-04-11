/**
 * cronScheduler.ts
 * Pure TypeScript cron-style task scheduler — no external dependencies.
 * Implements: cron parsing, scheduling loop, job persistence, missed-run detection,
 * concurrency guard, auto-disable on consecutive failures.
 */

import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronJob {
  id: string;
  name: string;
  description: string;
  // Schedule
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  // Task definition
  taskType: "agent_prompt" | "http_call" | "script" | "health_check";
  taskConfig: {
    prompt?: string;
    url?: string;
    method?: string;
    body?: string;
    scriptPath?: string;
    timeout?: number;
  };
  // Execution tracking
  lastRunAt: number | null;
  lastRunStatus: "success" | "failure" | "timeout" | "skipped" | null;
  lastRunResult: string | null;
  lastRunDurationMs: number | null;
  nextRunAt: number | null;
  runCount: number;
  failureCount: number;
  consecutiveFailures: number;
  // Behaviour
  maxConsecutiveFailures: number;
  catchUp: boolean; // fire immediately if missed while server was down
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export type CreateCronJobOpts = Omit<
  CronJob,
  | "id"
  | "lastRunAt"
  | "lastRunStatus"
  | "lastRunResult"
  | "lastRunDurationMs"
  | "nextRunAt"
  | "runCount"
  | "failureCount"
  | "consecutiveFailures"
  | "createdAt"
  | "updatedAt"
> &
  Partial<
    Pick<
      CronJob,
      | "maxConsecutiveFailures"
      | "catchUp"
      | "timezone"
      | "enabled"
    >
  >;

export type ExecutionStatus = "success" | "failure" | "timeout" | "skipped";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "cron-jobs.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore(): CronJob[] {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as CronJob[];
  } catch {
    return [];
  }
}

function saveStore(jobs: CronJob[]): void {
  ensureDataDir();
  const tmp = STORE_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), "utf-8");
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    // Clean up orphaned tmp file on failure
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// In-memory state
let _jobs: CronJob[] = loadStore();
const _runningJobs = new Set<string>(); // job ids currently executing

function _persistAll(): void {
  saveStore(_jobs);
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(): string {
  return `cron_${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Cron Expression Parser
// ---------------------------------------------------------------------------

/**
 * Supported field syntax per position:
 *   0 – minute   (0–59)
 *   1 – hour     (0–23)
 *   2 – day of month (1–31)
 *   3 – month    (1–12)
 *   4 – day of week  (0–7, both 0 and 7 = Sunday)
 *
 * Each field can be:
 *   *         – wildcard (all values)
 *   N         – exact value
 *   N-M       – range
 *   *\/N       – step on full range
 *   N-M\/N    – step on range
 *   a,b,c     – list (each element can itself be a range or step)
 */

interface CronField {
  values: Set<number>;
}

function parseField(token: string, min: number, max: number): CronField {
  const values = new Set<number>();

  // Handle comma-separated list
  const parts = token.split(",");
  for (const part of parts) {
    parseSingleField(part.trim(), min, max, values);
  }

  return { values };
}

function parseSingleField(
  token: string,
  min: number,
  max: number,
  out: Set<number>
): void {
  // Step: something/step
  const slashIdx = token.indexOf("/");
  let step = 1;
  let rangeToken = token;

  if (slashIdx !== -1) {
    const stepStr = token.slice(slashIdx + 1);
    step = parseInt(stepStr, 10);
    if (isNaN(step) || step < 1) {
      throw new Error(`Invalid step value in cron field: "${token}"`);
    }
    rangeToken = token.slice(0, slashIdx);
  }

  // Determine start and end of range
  let start: number;
  let end: number;

  if (rangeToken === "*") {
    start = min;
    end = max;
  } else if (rangeToken.includes("-")) {
    const [s, e] = rangeToken.split("-");
    start = parseInt(s, 10);
    end = parseInt(e, 10);
    if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid range in cron field: "${token}"`);
    }
  } else {
    // Exact value (or base for a step without explicit range)
    const val = parseInt(rangeToken, 10);
    if (isNaN(val) || val < min || val > max) {
      throw new Error(`Invalid value in cron field: "${token}" (min=${min}, max=${max})`);
    }
    if (slashIdx === -1) {
      // No step — just a single value
      out.add(val);
      return;
    }
    // e.g. "5/15" means starting at 5, step by 15 until max
    start = val;
    end = max;
  }

  for (let v = start; v <= end; v += step) {
    out.add(v);
  }
}

export interface ParsedCron {
  matches(date: Date): boolean;
  expression: string;
}

/**
 * Parse a standard 5-field cron expression and return a matcher.
 *
 * @param expr  e.g. "30 8 * * 1-5"
 * @returns     object with matches(date) method
 */
export function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Cron expression must have exactly 5 fields (got ${fields.length}): "${expr}"`
    );
  }

  const [minuteF, hourF, domF, monthF, dowF] = fields;

  const minute = parseField(minuteF, 0, 59);
  const hour = parseField(hourF, 0, 23);
  const dom = parseField(domF, 1, 31);
  const month = parseField(monthF, 1, 12);
  // Day-of-week: 0 and 7 both map to Sunday
  const dowRaw = parseField(dowF, 0, 7);
  // Normalise 7 → 0
  const dow = new Set<number>();
  for (const v of Array.from(dowRaw.values)) {
    dow.add(v === 7 ? 0 : v);
  }

  const domIsWildcard = domF === "*";
  const dowIsWildcard = dowF === "*";

  return {
    expression: expr,
    matches(date: Date): boolean {
      const m = date.getMinutes();
      const h = date.getHours();
      const d = date.getDate();
      const mo = date.getMonth() + 1; // 1-indexed
      const wd = date.getDay(); // 0=Sunday

      if (!minute.values.has(m)) return false;
      if (!hour.values.has(h)) return false;
      if (!month.values.has(mo)) return false;

      // Standard cron: when both dom and dow are restricted (not wildcards),
      // the job fires if EITHER matches. When only one is restricted, use that one.
      if (domIsWildcard && dowIsWildcard) {
        return true;
      } else if (!domIsWildcard && !dowIsWildcard) {
        return dom.values.has(d) || dow.has(wd);
      } else if (!domIsWildcard) {
        return dom.values.has(d);
      } else {
        return dow.has(wd);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Next-run time computation
// ---------------------------------------------------------------------------

/**
 * Compute the next date/time after `fromDate` (default: now) when the cron
 * expression will fire. Scans forward minute by minute (max 4 years).
 */
export function getNextRunTime(cronExpr: string, fromDate?: Date): Date {
  const matcher = parseCron(cronExpr);
  // Start from the next minute
  const start = new Date(fromDate ? fromDate.getTime() : Date.now());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  const limit = new Date(start.getTime() + 4 * 365 * 24 * 60 * 60 * 1000);
  const cursor = new Date(start.getTime());

  while (cursor < limit) {
    if (matcher.matches(cursor)) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  throw new Error(`No next run time found for expression: "${cronExpr}"`);
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export function createCronJob(opts: CreateCronJobOpts): CronJob {
  // Validate the cron expression eagerly
  parseCron(opts.cronExpression);

  const now = Date.now();
  const job: CronJob = {
    id: generateId(),
    name: opts.name,
    description: opts.description,
    cronExpression: opts.cronExpression,
    timezone: opts.timezone ?? "UTC",
    enabled: opts.enabled ?? true,
    taskType: opts.taskType,
    taskConfig: opts.taskConfig ?? {},
    lastRunAt: null,
    lastRunStatus: null,
    lastRunResult: null,
    lastRunDurationMs: null,
    nextRunAt: null,
    runCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    maxConsecutiveFailures: opts.maxConsecutiveFailures ?? 5,
    catchUp: opts.catchUp ?? false,
    createdAt: now,
    updatedAt: now,
  };

  // Compute initial nextRunAt
  try {
    job.nextRunAt = getNextRunTime(job.cronExpression).getTime();
  } catch {
    job.nextRunAt = null;
  }

  _jobs.push(job);
  _persistAll();
  return job;
}

export function updateCronJob(
  id: string,
  update: Partial<
    Omit<CronJob, "id" | "createdAt" | "runCount" | "failureCount" | "consecutiveFailures">
  >
): CronJob {
  const idx = _jobs.findIndex((j) => j.id === id);
  if (idx === -1) throw new Error(`CronJob not found: ${id}`);

  const job = { ..._jobs[idx], ...update, updatedAt: Date.now() };

  // Re-validate cron expression if changed
  if (update.cronExpression) {
    parseCron(update.cronExpression);
    try {
      job.nextRunAt = getNextRunTime(job.cronExpression).getTime();
    } catch {
      job.nextRunAt = null;
    }
  }

  _jobs[idx] = job;
  _persistAll();
  return job;
}

export function deleteCronJob(id: string): void {
  const before = _jobs.length;
  _jobs = _jobs.filter((j) => j.id !== id);
  if (_jobs.length === before) throw new Error(`CronJob not found: ${id}`);
  _runningJobs.delete(id);
  _persistAll();
}

export function getCronJob(id: string): CronJob | null {
  return _jobs.find((j) => j.id === id) ?? null;
}

export function getAllCronJobs(): CronJob[] {
  return [..._jobs];
}

export function getEnabledJobs(): CronJob[] {
  return _jobs.filter((j) => j.enabled);
}

export function toggleJob(id: string, enabled: boolean): CronJob {
  return updateCronJob(id, { enabled });
}

// ---------------------------------------------------------------------------
// Execution tracking
// ---------------------------------------------------------------------------

export function recordExecution(
  id: string,
  status: ExecutionStatus,
  result: string | null,
  durationMs: number | null
): void {
  const idx = _jobs.findIndex((j) => j.id === id);
  if (idx === -1) throw new Error(`CronJob not found: ${id}`);

  const job = _jobs[idx];
  const now = Date.now();

  job.lastRunAt = now;
  job.lastRunStatus = status;
  job.lastRunResult = result;
  job.lastRunDurationMs = durationMs;
  job.updatedAt = now;

  if (status === "success") {
    job.runCount += 1;
    job.consecutiveFailures = 0;
  } else if (status === "failure" || status === "timeout") {
    job.runCount += 1;
    job.failureCount += 1;
    job.consecutiveFailures += 1;
    // Auto-disable if consecutive failure threshold reached
    if (job.consecutiveFailures >= job.maxConsecutiveFailures) {
      job.enabled = false;
      console.warn(
        `[CronScheduler] Job "${job.name}" (${job.id}) auto-disabled after ` +
          `${job.consecutiveFailures} consecutive failures.`
      );
    }
  } else if (status === "skipped") {
    // Do not increment run/failure counters for skipped
  }

  // Compute next run time
  if (job.enabled) {
    try {
      job.nextRunAt = getNextRunTime(job.cronExpression).getTime();
    } catch {
      job.nextRunAt = null;
    }
  } else {
    job.nextRunAt = null;
  }

  _jobs[idx] = job;
  _persistAll();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface CronStats {
  total: number;
  enabled: number;
  disabled: number;
  failedLast24h: number;
  successLast24h: number;
}

export function getCronStats(): CronStats {
  const now = Date.now();
  const window24h = 24 * 60 * 60 * 1000;

  let failedLast24h = 0;
  let successLast24h = 0;

  for (const job of _jobs) {
    if (job.lastRunAt !== null && now - job.lastRunAt <= window24h) {
      if (job.lastRunStatus === "success") successLast24h += 1;
      else if (job.lastRunStatus === "failure" || job.lastRunStatus === "timeout")
        failedLast24h += 1;
    }
  }

  return {
    total: _jobs.length,
    enabled: _jobs.filter((j) => j.enabled).length,
    disabled: _jobs.filter((j) => !j.enabled).length,
    failedLast24h,
    successLast24h,
  };
}

// ---------------------------------------------------------------------------
// Missed-run detection (startup)
// ---------------------------------------------------------------------------

/**
 * Called at startup. Detects jobs that should have fired while the server
 * was down. Marks them 'skipped' (or fires immediately if catchUp=true).
 *
 * @param onExecute  Callback used for catch-up execution
 */
export async function detectMissedRuns(
  onExecute: (job: CronJob) => Promise<string>
): Promise<void> {
  const now = Date.now();

  for (const job of _jobs) {
    if (!job.enabled) continue;
    if (job.nextRunAt === null) continue;

    // If nextRunAt is in the past, the job was missed
    if (job.nextRunAt < now) {
      console.log(
        `[CronScheduler] Missed run detected for job "${job.name}" (${job.id}), ` +
          `scheduled at ${new Date(job.nextRunAt).toISOString()}`
      );

      if (job.catchUp) {
        // Fire immediately (best-effort)
        console.log(
          `[CronScheduler] Catch-up: executing missed job "${job.name}" now.`
        );
        _runningJobs.add(job.id);
        const start = Date.now();
        try {
          const result = await onExecute(job);
          recordExecution(job.id, "success", result, Date.now() - start);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          recordExecution(job.id, "failure", msg, Date.now() - start);
        } finally {
          _runningJobs.delete(job.id);
        }
      } else {
        // Just mark as skipped
        recordExecution(job.id, "skipped", "Missed while server was down", null);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduler Loop
// ---------------------------------------------------------------------------

/**
 * Start the scheduler. Polls every 30 seconds, fires jobs whose cron
 * expression matches the current minute. Respects concurrency guard.
 *
 * @param onExecute  Async callback that runs the job and returns a result string
 * @returns          The interval handle (use clearInterval to stop)
 */
export function startScheduler(
  onExecute: (job: CronJob) => Promise<string>
): NodeJS.Timeout {
  const TICK_INTERVAL_MS = 30_000; // 30 seconds

  // Track which minutes we have already fired to avoid double-firing in the
  // same minute when two ticks fall within the same 60-second window.
  const firedMinutes = new Map<string, number>(); // jobId → epoch-minute

  async function tick(): Promise<void> {
    const now = new Date();
    // Round down to the current minute (zero out seconds and ms)
    const currentMinute = new Date(now.getTime());
    currentMinute.setSeconds(0, 0);
    const epochMinute = Math.floor(currentMinute.getTime() / 60_000);

    const enabled = getEnabledJobs();

    for (const job of enabled) {
      let matcher: ParsedCron;
      try {
        matcher = parseCron(job.cronExpression);
      } catch (err) {
        console.error(
          `[CronScheduler] Invalid cron expression for job "${job.name}" (${job.id}): ${err}`
        );
        continue;
      }

      if (!matcher.matches(currentMinute)) continue;

      // Deduplicate — don't fire twice in the same minute
      const lastFiredMinute = firedMinutes.get(job.id);
      if (lastFiredMinute === epochMinute) continue;

      // Concurrency guard — skip if previous run is still in progress
      if (_runningJobs.has(job.id)) {
        console.warn(
          `[CronScheduler] Job "${job.name}" (${job.id}) is still running — skipping this tick.`
        );
        continue;
      }

      firedMinutes.set(job.id, epochMinute);
      _runningJobs.add(job.id);

      const start = Date.now();
      console.log(
        `[CronScheduler] Firing job "${job.name}" (${job.id}) at ${currentMinute.toISOString()}`
      );

      // Execute asynchronously — don't await in the tick loop
      (async () => {
        const timeoutMs = job.taskConfig.timeout ?? 5 * 60 * 1000; // default 5 min
        try {
          const result = await Promise.race([
            onExecute(job),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Job execution timed out")),
                timeoutMs
              )
            ),
          ]);
          const duration = Date.now() - start;
          console.log(
            `[CronScheduler] Job "${job.name}" (${job.id}) succeeded in ${duration}ms`
          );
          recordExecution(job.id, "success", result, duration);
        } catch (err) {
          const duration = Date.now() - start;
          const msg = err instanceof Error ? err.message : String(err);
          const status: ExecutionStatus =
            msg === "Job execution timed out" ? "timeout" : "failure";
          console.error(
            `[CronScheduler] Job "${job.name}" (${job.id}) ${status}: ${msg}`
          );
          recordExecution(job.id, status, msg, duration);
        } finally {
          _runningJobs.delete(job.id);
        }
      })();
    }

    // Prune firedMinutes map to avoid unbounded growth
    // Keep only entries for the current and previous minute
    for (const [jobId, minute] of Array.from(firedMinutes.entries())) {
      if (epochMinute - minute > 1) {
        firedMinutes.delete(jobId);
      }
    }
  }

  // Replace setInterval with setTimeout recursion to avoid timer drift / stacking
  let _tickTimer: NodeJS.Timeout | null = null;

  function scheduleTick(): void {
    _tickTimer = setTimeout(async () => {
      await tick();
      scheduleTick(); // chain next tick
    }, TICK_INTERVAL_MS);
    if (_tickTimer.unref) _tickTimer.unref();
  }

  // Run an initial tick shortly after startup (gives detectMissedRuns time to finish)
  setTimeout(() => { void tick(); scheduleTick(); }, 1_000);

  // Return a synthetic Timeout that clears the internal timer when cleared
  const handle = setTimeout(() => {}, 0) as NodeJS.Timeout;
  const origClear = clearTimeout;
  // Wrap: when caller does clearInterval(handle) it cancels the recursive chain
  (handle as any)[Symbol.toPrimitive] = () => {
    if (_tickTimer) origClear(_tickTimer);
    return 0;
  };
  console.log("[CronScheduler] Scheduler started (tick every 30s, setTimeout recursion).");
  return handle;
}

// ---------------------------------------------------------------------------
// Reload store (useful if another process modified the JSON)
// ---------------------------------------------------------------------------

export function reloadStore(): void {
  _jobs = loadStore();
}
