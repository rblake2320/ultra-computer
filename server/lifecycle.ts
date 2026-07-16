import type { Server } from "node:http";

export interface CleanupTask {
  name: string;
  close: () => void | Promise<void>;
}

export interface CleanupFailure {
  name: string;
  error: unknown;
}

/**
 * Stop accepting new HTTP connections and give in-flight requests a bounded
 * window to finish. Connections are force-closed only after the deadline.
 */
export async function drainHttpServer(
  server: Server,
  timeoutMs = 10_000,
): Promise<boolean> {
  if (!server.listening) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (drained: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(drained);
    };

    server.close((error) => finish(!error));
    server.closeIdleConnections?.();

    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      finish(false);
    }, timeoutMs);
  });
}

/** Run every cleanup even when an earlier resource fails to close. */
export async function runCleanupTasks(
  tasks: readonly CleanupTask[],
  timeoutMs = 10_000,
): Promise<CleanupFailure[]> {
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(task.close),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`Cleanup timed out after ${timeoutMs}ms`)),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      return task.name;
    }),
  );

  return results.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ name: tasks[index].name, error: result.reason }]
      : [],
  );
}

export interface ShutdownResult {
  drained: boolean;
  failures: CleanupFailure[];
}

export async function shutdownRuntime(options: {
  server: Server;
  tasks: readonly CleanupTask[];
  drainTimeoutMs?: number;
  cleanupTimeoutMs?: number;
}): Promise<ShutdownResult> {
  const drained = await drainHttpServer(
    options.server,
    options.drainTimeoutMs,
  );
  const failures = await runCleanupTasks(
    options.tasks,
    options.cleanupTimeoutMs,
  );
  return { drained, failures };
}
