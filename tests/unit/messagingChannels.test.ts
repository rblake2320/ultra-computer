import { describe, expect, it, vi } from "vitest";
import {
  ADDABLE_MESSAGING_CHANNEL_TYPES,
  performMessagingChannelAction,
} from "../../client/src/lib/messagingChannels.js";

describe("messaging channel client actions", () => {
  it("only offers channel types backed by an adapter", () => {
    expect(ADDABLE_MESSAGING_CHANNEL_TYPES).toEqual(["slack", "gmail", "webhook"]);
    expect(ADDABLE_MESSAGING_CHANNEL_TYPES).not.toContain("websocket");
  });

  it.each(["test", "connect", "disconnect"] as const)(
    "calls the %s lifecycle endpoint and accepts an explicit success",
    async (action) => {
      const request = vi.fn().mockResolvedValue({ ok: true });

      await expect(performMessagingChannelAction(request, "channel/one", action)).resolves.toEqual({ ok: true });
      expect(request).toHaveBeenCalledWith(
        "POST",
        `/api/messaging/channels/channel%2Fone/${action}`,
      );
    },
  );

  it("rejects an HTTP-success response whose channel test failed", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, error: "Missing bot token" });

    await expect(performMessagingChannelAction(request, "slack-1", "test"))
      .rejects.toThrow("Missing bot token");
  });

  it("rejects malformed success responses instead of displaying a false pass", async () => {
    const request = vi.fn().mockResolvedValue({ status: "connected" });

    await expect(performMessagingChannelAction(request, "slack-1", "connect"))
      .rejects.toThrow("Channel connect returned an invalid response");
  });
});
