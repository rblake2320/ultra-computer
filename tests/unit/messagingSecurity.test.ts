import { afterEach, describe, expect, it } from "vitest";
import { messagingHub, redactSecrets } from "../../server/messagingHub.js";

const createdChannelIds: string[] = [];

afterEach(() => {
  for (const channelId of createdChannelIds.splice(0)) {
    messagingHub.removeChannel(channelId);
  }
});

describe("messaging credential boundaries", () => {
  it("redacts credentials recursively while preserving non-sensitive metadata", () => {
    expect(
      redactSecrets({
        botToken: "top-level",
        team: "engineering",
        nested: {
          accessToken: "nested",
          endpoint: "https://example.com",
          headers: [{ authorization: "Bearer secret", name: "accept" }],
        },
      }),
    ).toEqual({
      team: "engineering",
      nested: {
        endpoint: "https://example.com",
        headers: [{ name: "accept" }],
      },
    });
  });

  it("fails closed without making a Slack request when no token is configured", async () => {
    const channel = messagingHub.registerChannel({
      type: "slack",
      name: "missing-credentials",
      config: {},
    });
    createdChannelIds.push(channel.id);

    await expect(messagingHub.connectChannel(channel.id)).resolves.toEqual({
      ok: false,
      error: "Missing required field: botToken",
    });
    expect(messagingHub.getChannel(channel.id)?.status).toBe("error");
  });
});
