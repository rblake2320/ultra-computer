import { describe, expect, it, vi } from "vitest";
import {
  resolveRedisConnectionTarget,
  TaskQueue,
  type QueuedTask,
} from "../../server/taskQueue.js";

function fakeJob(task: QueuedTask) {
  return {
    id: "job-1",
    data: task,
    updateProgress: vi.fn(() => Promise.resolve()),
  };
}

describe("TaskQueue processor boundary", () => {
  it("fails instead of reporting stub success when no processor is configured", async () => {
    const queue = new TaskQueue();
    await expect(queue.processJob(fakeJob({
      conversationId: "conversation-1",
      taskId: "message-1",
      userMessage: "do real work",
      estimatedDuration: "long",
    }))).rejects.toThrow(/processor is not configured/i);
  });

  it("runs the configured processor and records progress", async () => {
    const queue = new TaskQueue();
    const processor = vi.fn(() => Promise.resolve("done"));
    queue.setProcessor(processor);
    const job = fakeJob({
      conversationId: "conversation-1",
      taskId: "message-1",
      userMessage: "do real work",
      estimatedDuration: "long",
    });

    const result = JSON.parse(await queue.processJob(job)) as { status: string; result: string };

    expect(processor).toHaveBeenCalledWith(job.data);
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
    expect(result).toMatchObject({ status: "orchestrator_complete", result: "done" });
  });
});

describe("TaskQueue Redis configuration", () => {
  it("uses REDIS_URL as the authoritative authenticated/TLS target", () => {
    const target = resolveRedisConnectionTarget({
      REDIS_URL: "rediss://queue-user:secret@redis.example:6380/2",
      REDIS_HOST: "ignored-host",
      REDIS_PORT: "9999",
    });

    expect(target.url).toBe("rediss://queue-user:secret@redis.example:6380/2");
    expect(target.options).not.toHaveProperty("host");
    expect(target.options).not.toHaveProperty("port");
    expect(target.options.maxRetriesPerRequest).toBeNull();
  });

  it("supports validated host/port configuration when REDIS_URL is absent", () => {
    const target = resolveRedisConnectionTarget({
      REDIS_HOST: "redis.internal",
      REDIS_PORT: "6381",
    });

    expect(target.url).toBeUndefined();
    expect(target.options).toMatchObject({
      host: "redis.internal",
      port: 6381,
    });
  });

  it.each(["0", "65536", "not-a-port", "6379junk"])(
    "rejects invalid REDIS_PORT=%s",
    (port) => {
      expect(() => resolveRedisConnectionTarget({ REDIS_PORT: port })).toThrow(
        /REDIS_PORT must be an integer/i,
      );
    },
  );

  it("rejects non-Redis URL schemes", () => {
    expect(() =>
      resolveRedisConnectionTarget({ REDIS_URL: "http://localhost:6379" }),
    ).toThrow(/redis:\/\/ or rediss:\/\//i);
  });
});
