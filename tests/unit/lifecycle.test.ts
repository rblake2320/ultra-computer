import { createServer, request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  drainHttpServer,
  runCleanupTasks,
  shutdownRuntime,
} from "../../server/lifecycle.js";
import { buildRuntimeHealth } from "../../server/runtimeHealth.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        }),
    ),
  );
  servers.length = 0;
});

describe("runtime readiness", () => {
  it("does not report an unobserved required service as healthy", () => {
    const health = buildRuntimeHealth({
      database: { state: "ready", required: true },
      grpc: { state: "unavailable", required: true },
      temporalWorker: { state: "external", required: false },
    });

    expect(health.status).toBe("degraded");
    expect(health.checks.grpc).toEqual({
      ok: false,
      state: "unavailable",
    });
    expect(health.checks.temporalWorker).toEqual({
      ok: false,
      state: "external",
    });
  });

  it("allows an explicitly optional unavailable service", () => {
    const health = buildRuntimeHealth({
      database: { state: "ready", required: true },
      taskQueue: { state: "unavailable", required: false },
    });

    expect(health.status).toBe("ok");
    expect(health.checks.taskQueue.ok).toBe(false);
  });
});

describe("graceful shutdown", () => {
  it("waits for an in-flight HTTP response before resolving", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = createServer(async (_req, response) => {
      await blocked;
      response.end("done");
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");

    const responsePromise = new Promise<void>((resolve, reject) => {
      request(
        {
          host: "127.0.0.1",
          port: address.port,
          path: "/",
          headers: { connection: "close" },
        },
        (response) => {
          response.resume();
          response.on("end", resolve);
        },
      ).on("error", reject).end();
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    let settled = false;
    const drain = drainHttpServer(server, 500).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    release();
    await expect(drain).resolves.toBe(true);
    await responsePromise;
  });

  it("runs all cleanup tasks and reports individual failures", async () => {
    const first = vi.fn();
    const last = vi.fn();
    const failures = await runCleanupTasks([
      { name: "first", close: first },
      {
        name: "broken",
        close: () => {
          throw new Error("close failed");
        },
      },
      { name: "last", close: last },
    ]);

    expect(first).toHaveBeenCalledOnce();
    expect(last).toHaveBeenCalledOnce();
    expect(failures).toHaveLength(1);
    expect(failures[0].name).toBe("broken");
  });

  it("bounds a cleanup task that never settles", async () => {
    const failures = await runCleanupTasks(
      [{ name: "hung", close: () => new Promise(() => {}) }],
      10,
    );

    expect(failures).toHaveLength(1);
    expect(failures[0].name).toBe("hung");
    expect(failures[0].error).toBeInstanceOf(Error);
  });

  it("closes resources after stopping HTTP acceptance", async () => {
    const server = createServer((_req, response) => response.end("ok"));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const close = vi.fn();

    const result = await shutdownRuntime({
      server,
      tasks: [{ name: "resource", close }],
      drainTimeoutMs: 100,
    });

    expect(result).toEqual({ drained: true, failures: [] });
    expect(server.listening).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
});
