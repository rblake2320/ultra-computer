/**
 * temporalWorker.ts
 *
 * Temporal worker that registers orchestrator steps as durable activities.
 * Run this alongside the main server to enable production-grade durable execution:
 *
 *   TEMPORAL_ADDRESS=localhost:7233 npm run temporal:worker
 *
 * With the worker running, each /api/conversations/:id/messages request:
 * 1. Enqueues a Temporal workflow (not just a BullMQ job)
 * 2. The workflow calls activities: memoryRecall, skillMatch, plan, toolCall, synthesize
 * 3. If the worker crashes at any step, Temporal resumes from the last completed activity
 * 4. Completed activities are NOT re-executed (event history prevents duplication)
 *
 * Requirements:
 *   - Temporal server running (docker compose up temporal)
 *   - TEMPORAL_ADDRESS env var set (default: localhost:7233)
 *   - TEMPORAL_TASK_QUEUE env var set (default: ultra-computer)
 */

import { NativeConnection, Worker, Runtime, type Logger } from "@temporalio/worker";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import * as activities from "./temporalActivities.js";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || "localhost:7233";
const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || "ultra-computer";
const CONNECT_TIMEOUT_MS = 60_000;
const READY_FILE = "/tmp/temporal-worker-ready";

async function connectToTemporal(): Promise<NativeConnection> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await NativeConnection.connect({ address: TEMPORAL_ADDRESS });
    } catch (error) {
      lastError = error;
      console.warn(
        `[temporal:worker] Temporal is not ready at ${TEMPORAL_ADDRESS}; retrying`,
      );
      await delay(1_000);
    }
  }
  throw new Error(
    `Temporal connection failed after ${CONNECT_TIMEOUT_MS}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function startTemporalWorker(): Promise<Worker> {
  await rm(READY_FILE, { force: true });

  const logger: Logger = {
    log: (level, msg, attrs) => console.log(`[temporal:worker] [${level}] ${msg}`, attrs ?? ""),
    info: (msg, attrs) => console.log(`[temporal:worker] ${msg}`, attrs ?? ""),
    warn: (msg, attrs) => console.warn(`[temporal:worker] WARN ${msg}`, attrs ?? ""),
    error: (msg, attrs) => console.error(`[temporal:worker] ERROR ${msg}`, attrs ?? ""),
    debug: () => {},
    trace: () => {},
  };
  Runtime.install({ logger });

  const connection = await connectToTemporal();

  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./temporalWorkflow.ts", import.meta.url)),
    activities,
  });

  await writeFile(READY_FILE, `${new Date().toISOString()}\n`, { mode: 0o600 });
  console.log(`[temporal:worker] Connected to ${TEMPORAL_ADDRESS}, task queue: ${TASK_QUEUE}`);
  return worker;
}

if (process.env.RUN_TEMPORAL_WORKER === "1") {
  startTemporalWorker()
    .then((worker) => worker.run())
    .catch((err) => {
      console.error("[temporal:worker] Fatal:", err);
      process.exit(1);
    });
}
