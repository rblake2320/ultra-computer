import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCheckpoint,
  deleteCheckpoint,
  getCheckpoint,
  updateCheckpoint,
} from "../../server/taskCheckpointing.js";

const checkpointDir = path.resolve(process.cwd(), "data/checkpoints");
const createdTaskIds = new Set<string>();

afterEach(() => {
  for (const taskId of createdTaskIds) {
    deleteCheckpoint(taskId);
  }
  createdTaskIds.clear();
});

describe("task checkpoint filesystem boundary", () => {
  it("persists and updates an allowlisted task identifier", () => {
    const taskId = `security-${crypto.randomUUID()}`;
    createdTaskIds.add(taskId);

    createCheckpoint({
      taskId,
      conversationId: "conversation",
      taskTitle: "Boundary test",
      totalSteps: 2,
    });
    const updated = updateCheckpoint(taskId, { currentStep: "one" });

    expect(updated.taskId).toBe(taskId);
    expect(getCheckpoint(taskId)?.currentStep).toBe("one");
    expect(fs.existsSync(path.join(checkpointDir, `${taskId}.json`))).toBe(true);
  });

  it.each([
    "../escape",
    "..\\escape",
    "/absolute",
    "C:\\absolute",
    ".",
    "",
  ])("rejects unsafe task identifier %j before file access", (taskId) => {
    expect(() => createCheckpoint({
      taskId,
      conversationId: "conversation",
      taskTitle: "Unsafe",
      totalSteps: 1,
    })).toThrow("Invalid checkpoint taskId");
  });
});
