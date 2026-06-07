import { describe, expect, it, vi } from "vitest";
import { TaskQueue, type QueuedTask } from "../../server/taskQueue.js";

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
