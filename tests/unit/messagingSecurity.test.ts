import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { MessagingHub, messagingHub, redactSecrets } from "../../server/messagingHub.js";
import { storage } from "../../server/storage.js";

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

  it("encrypts persisted channel credentials and preserves them across redacted edits", () => {
    const channel = messagingHub.registerChannel({
      type: "slack",
      name: "encrypted-channel",
      config: { botToken: "unit-secret-value", team: "alpha" },
    });
    createdChannelIds.push(channel.id);

    messagingHub.updateChannel(channel.id, {
      config: { botToken: "[REDACTED]", team: "beta" },
    });

    expect(messagingHub.getChannel(channel.id)?.config).toEqual({
      botToken: "unit-secret-value",
      team: "beta",
    });
    const raw = storage.getSetting("messaging.hub.state.v1");
    expect(raw).toMatch(/^enc:/);
    expect(raw).not.toContain("unit-secret-value");
  });

  it("restores channels and subscriptions from the durable state envelope", () => {
    let state: any = null;
    const store = {
      load: () => state,
      save: (next: any) => { state = structuredClone(next); },
    };
    const first = new MessagingHub(store, () => undefined);
    const channel = first.registerChannel({
      type: "webhook",
      name: "restored-channel",
      config: { url: "https://example.com/hooks/messages" },
    });
    first.subscribe(channel.id, "conversation-restore", ["task_complete"]);

    const restored = new MessagingHub(store, () => undefined);
    expect(restored.getChannel(channel.id)?.name).toBe("restored-channel");
    expect(restored.getSubscriptions("conversation-restore")).toEqual([
      expect.objectContaining({
        channelId: channel.id,
        events: ["task_complete"],
      }),
    ]);
  });

  it("persists inbound messages and dispatches each external event exactly once", () => {
    let state: any = null;
    const dispatched: any[] = [];
    const hub = new MessagingHub(
      {
        load: () => state,
        save: (next: any) => { state = structuredClone(next); },
      },
      (task) => dispatched.push(task),
    );
    const conversationId = `inbound-thread-${uuidv4()}`;
    const channelId = `channel-${uuidv4()}`;
    const externalId = `message-${uuidv4()}`;

    try {
      const event = {
        id: externalId,
        channelId,
        channelType: "webhook",
        senderId: "external-user",
        senderName: "External User",
        content: "Please process this durable inbound message",
        threadId: conversationId,
        metadata: { authorization: "must-not-persist", source: "integration" },
        receivedAt: Date.now(),
      };

      const first = hub.routeInbound(event);
      const duplicate = hub.routeInbound(event);

      expect(first.conversationId).toBe(conversationId);
      expect(duplicate.conversationId).toBe(conversationId);
      expect(storage.getConversation(conversationId)).toBeDefined();
      const messages = storage.getMessages(conversationId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe(event.content);
      expect(messages[0].metadata).not.toContain("must-not-persist");
      expect(dispatched).toEqual([
        expect.objectContaining({
          conversationId,
          userMessage: event.content,
        }),
      ]);
    } finally {
      storage.deleteConversation(conversationId);
    }
  });
});
