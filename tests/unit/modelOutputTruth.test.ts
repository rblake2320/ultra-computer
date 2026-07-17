import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decodeGeneratedImageBase64,
  materializeGeneratedImage,
} from "../../server/imageGenTool.js";
import {
  publishConversationEvent,
  replayConversationEvents,
  subscribeToConversation,
  unsubscribeFromConversation,
} from "../../server/orchestrator.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("generated image materialization", () => {
  it("decodes provider base64 bytes and rejects invalid or oversized payloads", () => {
    expect(decodeGeneratedImageBase64("iVBORw0KGgo=")).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(() => decodeGeneratedImageBase64("not base64!!")).toThrow("invalid base64");
    expect(() => decodeGeneratedImageBase64("aW1hZ2U=", 4)).toThrow("exceeds the 4-byte limit");
  });

  it("atomically saves base64 provider results", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-image-truth-"));
    temporaryDirectories.push(directory);
    const destination = path.join(directory, "result.png");

    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const saved = await materializeGeneratedImage(
      { b64_json: png.toString("base64") },
      destination,
      "image-test",
    );

    expect(saved).toEqual({ path: destination, mediaType: "image/png" });
    expect(fs.readFileSync(destination)).toEqual(png);
    expect(fs.readdirSync(directory)).toEqual(["result.png"]);
  });

  it("governs provider download URLs and leaves no false artifact on rejection", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-image-truth-"));
    temporaryDirectories.push(directory);
    const destination = path.join(directory, "result.png");

    await expect(materializeGeneratedImage(
      { url: "file:///private/image.png" },
      destination,
      "image-test",
    )).rejects.toThrow("protocol 'file:' is not allowed");
    expect(fs.existsSync(destination)).toBe(false);
  });
});

describe("conversation stream replay", () => {
  it("assigns ordered event IDs and replays only events after the client cursor", () => {
    const conversationId = `replay-${crypto.randomUUID()}`;
    const delivered: number[] = [];
    const listener = (_event: unknown, eventId?: number) => {
      if (eventId !== undefined) delivered.push(eventId);
    };
    subscribeToConversation(conversationId, listener);

    publishConversationEvent(conversationId, { type: "status", status: "running" });
    publishConversationEvent(conversationId, { type: "done", summary: "complete" });
    unsubscribeFromConversation(conversationId, listener);

    expect(delivered).toEqual([1, 2]);
    expect(replayConversationEvents(conversationId, 1)).toEqual([{
      id: 2,
      event: { type: "done", summary: "complete" },
    }]);
    expect(replayConversationEvents(conversationId, Number.NaN)).toEqual([]);
  });
});
