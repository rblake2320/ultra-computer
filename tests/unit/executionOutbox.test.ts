import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sqlite } from "../../server/storage.js";
import { admissionState, persistTaskAdmission, unfinishedAdmissions, updateAdmission } from "../../server/executionOutbox.js";
import { TaskQueue } from "../../server/taskQueue.js";

const task = { taskId: "outbox-regression", conversationId: "outbox-conversation", userMessage: "What is 2 + 2?", estimatedDuration: "short" as const };
afterEach(() => { sqlite.prepare("DELETE FROM execution_outbox WHERE message_id LIKE 'outbox-%'").run(); });
describe("durable message admission", () => {
  it("survives a separate database connection and rejects conflicting duplicate admission", () => {
    persistTaskAdmission(task);
    persistTaskAdmission(task);
    const reader = new Database(sqlite.name, { readonly: true });
    expect(reader.prepare("SELECT COUNT(*) AS count FROM execution_outbox WHERE message_id = ?").get(task.taskId)).toEqual({ count: 1 });
    reader.close();
    expect(() => persistTaskAdmission({ ...task, conversationId: "wrong" })).toThrow(/identity conflicts/);
    expect(unfinishedAdmissions()).toContainEqual(task);
  });
  it("keeps failed and completed admissions terminal even after a delivery retry", async () => {
    persistTaskAdmission(task);
    updateAdmission(task.taskId, "failed");
    updateAdmission(task.taskId, "queued");
    expect(admissionState(task.taskId)).toBe("failed");
    expect(unfinishedAdmissions()).not.toContainEqual(task);
    const queue = new TaskQueue();
    const processor = vi.fn(async () => "completed");
    queue.setProcessor(processor);
    await expect(queue.processJob({ id: "duplicate", data: task, updateProgress: vi.fn(async () => {}) })).rejects.toThrow(/cancelled or already failed/);
    expect(processor).not.toHaveBeenCalled();
  });
  it("delivers new admissions even with more than a batch of queued requests", () => {
    for (let i = 0; i < 101; i++) {
      const queued = { ...task, taskId: `outbox-${i}` };
      persistTaskAdmission(queued); updateAdmission(queued.taskId, "queued");
    }
    persistTaskAdmission(task);
    expect(unfinishedAdmissions()).toContainEqual(task);
    updateAdmission(task.taskId, "completed"); updateAdmission(task.taskId, "queued");
    expect(admissionState(task.taskId)).toBe("completed");
  });
});
