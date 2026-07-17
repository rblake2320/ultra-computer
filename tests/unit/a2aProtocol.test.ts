import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ governedFetch: vi.fn() }));

vi.mock("../../server/governedFetch.js", () => ({ governedFetch: mocks.governedFetch }));
vi.mock("../../server/storage.js", () => ({ storage: { getSkills: vi.fn(() => []) } }));
vi.mock("../../server/orchestrator.js", () => ({
  runOrchestrator: vi.fn(),
  subscribeToConversation: vi.fn(),
  unsubscribeFromConversation: vi.fn(),
}));

import {
  A2A_EXTERNAL_STATUS,
  cancelTask,
  discoverAgent,
  getTask,
  sendMessage,
  streamMessage,
} from "../../server/a2aProtocol.js";

describe("A2A external boundary", () => {
  it("truthfully reports current v1 interoperability unavailable", () => {
    expect(A2A_EXTERNAL_STATUS).toEqual({
      available: false,
      currentProtocolVersion: "1.0",
      legacyEngineVersion: "0.3.0",
      reason: expect.stringContaining("v1 external interoperability is not implemented"),
    });
  });

  it("fails every external client operation closed before network egress", async () => {
    const unavailable = "A2A v1 external interoperability is not implemented";

    await expect(discoverAgent("https://directory.example.test")).rejects.toThrow(unavailable);
    await expect(sendMessage("https://agent.example.test/a2a", {
      role: "user",
      parts: [{ kind: "text", text: "hello" }],
    })).rejects.toThrow(unavailable);
    await expect(getTask("https://agent.example.test/a2a", "task-1")).rejects.toThrow(unavailable);
    await expect(cancelTask("https://agent.example.test/a2a", "task-1")).rejects.toThrow(unavailable);

    const stream = streamMessage("https://agent.example.test/a2a", {
      role: "user",
      parts: [{ kind: "text", text: "hello" }],
    });
    await expect(stream.next()).rejects.toThrow(unavailable);
    expect(mocks.governedFetch).not.toHaveBeenCalled();
  });
});
