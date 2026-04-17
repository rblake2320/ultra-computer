/**
 * Messaging Routes — Omni-Channel Messaging System
 *
 * Registers all messaging-related API endpoints:
 *   - Channel management (CRUD + connect/disconnect/test)
 *   - Sending messages, notifications, and broadcasts
 *   - Inbound webhooks (Slack, Gmail, generic)
 *   - Subscriptions (conversation ↔ channel bindings)
 *   - History, delivery status, and stats
 *   - SSE stream for real-time messaging events
 */

import type { Express } from "express";
import { messagingHub } from "./messagingHub.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelType = "slack" | "gmail" | "webhook" | "websocket";
const VALID_CHANNEL_TYPES: ChannelType[] = ["slack", "gmail", "webhook", "websocket"];

type MessageDirection = "inbound" | "outbound";
const VALID_DIRECTIONS: MessageDirection[] = ["inbound", "outbound"];

type NotificationSeverity = "info" | "warning" | "error" | "critical";
const VALID_SEVERITIES: NotificationSeverity[] = ["info", "warning", "error", "critical"];

// ─── SSE Client Registry ──────────────────────────────────────────────────────

interface SseClient {
  id: string;
  res: any;
  send: (event: object) => void;
}

const sseClients = new Map<string, SseClient>();

function broadcastSseEvent(event: object): void {
  for (const client of sseClients.values()) {
    client.send(event);
  }
}

// Wire into messagingHub events if the hub exposes an event emitter
function initSseBridge(): void {
  try {
    if (typeof messagingHub.on === "function") {
      messagingHub.on("message_received", (data: any) => {
        broadcastSseEvent({ type: "message_received", ...data, ts: Date.now() });
      });
      messagingHub.on("message_sent", (data: any) => {
        broadcastSseEvent({ type: "message_sent", ...data, ts: Date.now() });
      });
      messagingHub.on("delivery_update", (data: any) => {
        broadcastSseEvent({ type: "delivery_update", ...data, ts: Date.now() });
      });
      messagingHub.on("channel_status_change", (data: any) => {
        broadcastSseEvent({ type: "channel_status_change", ...data, ts: Date.now() });
      });
    }
  } catch {
    // Hub may not support event emitter; SSE still works for push from routes
  }
}

// ─── Input Validation Helpers ─────────────────────────────────────────────────

function validateString(value: unknown, field: string, maxLen = 200): string | null {
  if (typeof value !== "string") return `${field} must be a string`;
  if (value.trim().length === 0) return `${field} is required`;
  if (value.length > maxLen) return `${field} must be at most ${maxLen} characters`;
  return null;
}

function validateOptionalString(value: unknown, field: string, maxLen = 200): string | null {
  if (value === undefined || value === null) return null;
  return validateString(value, field, maxLen);
}

function validateEnum<T extends string>(value: unknown, field: string, allowed: T[]): string | null {
  if (!allowed.includes(value as T)) {
    return `${field} must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerMessagingRoutes(app: Express): void {
  // Wire SSE bridge once
  initSseBridge();

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANNEL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/messaging/channels
   * List all registered messaging channels with their current status.
   */
  app.get("/api/messaging/channels", (_req, res) => {
    try {
      const channels = messagingHub.getChannels();
      res.json(channels);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to list channels" });
    }
  });

  /**
   * GET /api/messaging/channels/:id
   * Get a single channel by ID.
   */
  app.get("/api/messaging/channels/:id", (req, res) => {
    try {
      const channels = messagingHub.getChannels();
      const channel = channels.find((c: any) => c.id === req.params.id);
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      res.json(channel);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to get channel" });
    }
  });

  /**
   * POST /api/messaging/channels
   * Register a new messaging channel.
   * Body: { type, name, config }
   */
  app.post("/api/messaging/channels", (req, res) => {
    try {
      const { type, name, config } = req.body ?? {};

      const nameErr = validateString(name, "name");
      if (nameErr) return res.status(400).json({ error: nameErr });

      const typeErr = validateEnum(type, "type", VALID_CHANNEL_TYPES);
      if (typeErr) return res.status(400).json({ error: typeErr });

      if (config !== undefined && (typeof config !== "object" || Array.isArray(config))) {
        return res.status(400).json({ error: "config must be an object" });
      }

      const channel = messagingHub.registerChannel({
        id: uuidv4(),
        type: type as ChannelType,
        name: name.trim(),
        config: config ?? {},
        status: "disconnected",
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(channel);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to register channel" });
    }
  });

  /**
   * PATCH /api/messaging/channels/:id
   * Update a channel's config or name.
   */
  app.patch("/api/messaging/channels/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, config } = req.body ?? {};

      const channel = messagingHub.getChannel(id);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      if (name !== undefined) {
        const nameErr = validateString(name, "name");
        if (nameErr) return res.status(400).json({ error: nameErr });
      }

      if (config !== undefined && (typeof config !== "object" || Array.isArray(config))) {
        return res.status(400).json({ error: "config must be an object" });
      }

      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name.trim();
      if (config !== undefined) updates.config = config;

      const updated = messagingHub.updateChannel(id, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to update channel" });
    }
  });

  /**
   * DELETE /api/messaging/channels/:id
   * Remove a channel.
   */
  app.delete("/api/messaging/channels/:id", (req, res) => {
    try {
      const { id } = req.params;
      const channel = messagingHub.getChannel(id);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      messagingHub.removeChannel(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to remove channel" });
    }
  });

  /**
   * POST /api/messaging/channels/:id/test
   * Test channel connectivity. Returns { ok, error? }.
   */
  app.post("/api/messaging/channels/:id/test", async (req, res) => {
    try {
      const { id } = req.params;
      const channel = messagingHub.getChannel(id);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const result = await messagingHub.testChannel(id);
      res.json(result);
    } catch (err: any) {
      res.json({ ok: false, error: err.message ?? "Test failed" });
    }
  });

  /**
   * POST /api/messaging/channels/:id/connect
   * Activate a channel, supplying credentials/config.
   */
  app.post("/api/messaging/channels/:id/connect", async (req, res) => {
    try {
      const { id } = req.params;
      const { credentials, config } = req.body ?? {};

      const channel = messagingHub.getChannel(id);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const result = await messagingHub.connectChannel(id, { credentials, config });

      broadcastSseEvent({
        type: "channel_status_change",
        channelId: id,
        status: "connected",
        ts: Date.now(),
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to connect channel" });
    }
  });

  /**
   * POST /api/messaging/channels/:id/disconnect
   * Deactivate a channel.
   */
  app.post("/api/messaging/channels/:id/disconnect", async (req, res) => {
    try {
      const { id } = req.params;
      const channel = messagingHub.getChannel(id);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const result = await messagingHub.disconnectChannel(id);

      broadcastSseEvent({
        type: "channel_status_change",
        channelId: id,
        status: "disconnected",
        ts: Date.now(),
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to disconnect channel" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDING MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/messaging/send
   * Send a message to a specific channel.
   * Body: { channelId, content, format?, subject?, recipient?, threadId? }
   */
  app.post("/api/messaging/send", async (req, res) => {
    try {
      const { channelId, content, format, subject, recipient, threadId } = req.body ?? {};

      if (!channelId || typeof channelId !== "string") {
        return res.status(400).json({ error: "channelId is required" });
      }

      const contentErr = validateString(content, "content", 100000);
      if (contentErr) return res.status(400).json({ error: contentErr });

      const channel = messagingHub.getChannel(channelId);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const subjectErr = validateOptionalString(subject, "subject");
      if (subjectErr) return res.status(400).json({ error: subjectErr });

      const recipientErr = validateOptionalString(recipient, "recipient");
      if (recipientErr) return res.status(400).json({ error: recipientErr });

      const messageId = uuidv4();
      const result = await messagingHub.sendMessage({
        id: messageId,
        channelId,
        content,
        format: format ?? "text",
        subject,
        recipient,
        threadId,
        direction: "outbound",
        timestamp: new Date().toISOString(),
      });

      broadcastSseEvent({
        type: "message_sent",
        messageId,
        channelId,
        ts: Date.now(),
      });

      res.json({ ok: true, messageId, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to send message" });
    }
  });

  /**
   * POST /api/messaging/notify
   * Send a notification routed to all subscribed channels.
   * Body: { type, title, body, severity, conversationId?, data? }
   */
  app.post("/api/messaging/notify", async (req, res) => {
    try {
      const { type, title, body, severity, conversationId, data } = req.body ?? {};

      const titleErr = validateString(title, "title");
      if (titleErr) return res.status(400).json({ error: titleErr });

      const bodyErr = validateString(body, "body", 100000);
      if (bodyErr) return res.status(400).json({ error: bodyErr });

      const severityErr = validateEnum(severity, "severity", VALID_SEVERITIES);
      if (severityErr) return res.status(400).json({ error: severityErr });

      if (!type || typeof type !== "string") {
        return res.status(400).json({ error: "type is required" });
      }

      const notification = {
        id: uuidv4(),
        type,
        title,
        body,
        severity: severity as NotificationSeverity,
        conversationId,
        data: data ?? {},
        timestamp: new Date().toISOString(),
      };

      const results = await messagingHub.notify(notification);
      res.json({ ok: true, notificationId: notification.id, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to send notification" });
    }
  });

  /**
   * POST /api/messaging/broadcast
   * Broadcast a notification to ALL connected channels.
   * Body: same as /notify
   */
  app.post("/api/messaging/broadcast", async (req, res) => {
    try {
      const { type, title, body, severity, conversationId, data } = req.body ?? {};

      const titleErr = validateString(title, "title");
      if (titleErr) return res.status(400).json({ error: titleErr });

      const bodyErr = validateString(body, "body", 100000);
      if (bodyErr) return res.status(400).json({ error: bodyErr });

      const severityErr = validateEnum(severity, "severity", VALID_SEVERITIES);
      if (severityErr) return res.status(400).json({ error: severityErr });

      if (!type || typeof type !== "string") {
        return res.status(400).json({ error: "type is required" });
      }

      const notification = {
        id: uuidv4(),
        type,
        title,
        body,
        severity: severity as NotificationSeverity,
        conversationId,
        data: data ?? {},
        timestamp: new Date().toISOString(),
      };

      const results = await messagingHub.broadcast(notification);
      res.json({ ok: true, notificationId: notification.id, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to broadcast" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIVING MESSAGES (WEBHOOKS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/messaging/webhook/slack
   * Slack Events API / slash command handler.
   * TODO: Implement Slack webhook signature verification.
   * Slack signs requests with X-Slack-Signature (HMAC-SHA256). Without this
   * check, any caller can forge Slack events. Implement when SLACK_SIGNING_SECRET
   * is available in environment.
   */
  app.post("/api/messaging/webhook/slack", async (req, res) => {
    // TODO: verify X-Slack-Signature header using SLACK_SIGNING_SECRET
    console.warn("[messaging] Slack webhook signature verification is NOT implemented — TODO: add HMAC-SHA256 check");
    try {
      const payload = req.body ?? {};

      // Slack URL verification handshake
      if (payload.type === "url_verification") {
        return res.json({ challenge: payload.challenge });
      }

      // Slack event callback
      if (payload.type === "event_callback") {
        const event = payload.event ?? {};
        const eventType: string = event.type ?? "";

        if (eventType === "message" || eventType === "app_mention") {
          const inbound = {
            id: uuidv4(),
            channelType: "slack" as ChannelType,
            externalId: event.ts ?? uuidv4(),
            content: event.text ?? "",
            sender: event.user ?? "unknown",
            threadId: event.thread_ts,
            direction: "inbound" as MessageDirection,
            timestamp: new Date().toISOString(),
            raw: payload,
          };

          await messagingHub.routeInbound(inbound);

          broadcastSseEvent({
            type: "message_received",
            channelType: "slack",
            messageId: inbound.id,
            ts: Date.now(),
          });
        }

        return res.json({ ok: true });
      }

      // Slash command (application/x-www-form-urlencoded parsed to body)
      if (payload.command) {
        const inbound = {
          id: uuidv4(),
          channelType: "slack" as ChannelType,
          externalId: payload.trigger_id ?? uuidv4(),
          content: `${payload.command} ${payload.text ?? ""}`.trim(),
          sender: payload.user_id ?? "unknown",
          direction: "inbound" as MessageDirection,
          timestamp: new Date().toISOString(),
          raw: payload,
        };

        await messagingHub.routeInbound(inbound);

        broadcastSseEvent({
          type: "message_received",
          channelType: "slack",
          messageId: inbound.id,
          ts: Date.now(),
        });

        return res.json({ ok: true });
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Slack webhook error" });
    }
  });

  /**
   * POST /api/messaging/webhook/gmail
   * Gmail Pub/Sub push notification handler.
   */
  app.post("/api/messaging/webhook/gmail", async (req, res) => {
    try {
      const payload = req.body ?? {};

      // Pub/Sub wraps data in base64 message
      let emailData: Record<string, any> = {};
      if (payload.message?.data) {
        try {
          const decoded = Buffer.from(payload.message.data, "base64").toString("utf-8");
          emailData = JSON.parse(decoded);
        } catch {
          // Non-JSON payload — pass raw
          emailData = { raw: payload.message.data };
        }
      } else {
        emailData = payload;
      }

      const inbound = {
        id: uuidv4(),
        channelType: "gmail" as ChannelType,
        externalId: emailData.historyId?.toString() ?? uuidv4(),
        content: emailData.snippet ?? JSON.stringify(emailData),
        sender: emailData.from ?? "unknown",
        subject: emailData.subject,
        threadId: emailData.threadId,
        direction: "inbound" as MessageDirection,
        timestamp: new Date().toISOString(),
        raw: payload,
      };

      await messagingHub.routeInbound(inbound);

      broadcastSseEvent({
        type: "message_received",
        channelType: "gmail",
        messageId: inbound.id,
        ts: Date.now(),
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Gmail webhook error" });
    }
  });

  /**
   * POST /api/messaging/webhook/:channelId
   * Generic webhook for custom channels.
   */
  app.post("/api/messaging/webhook/:channelId", async (req, res) => {
    try {
      const { channelId } = req.params;
      const channel = messagingHub.getChannel(channelId);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const body = req.body ?? {};

      // Delegate parsing to channel's parseInbound if available
      let inbound: Record<string, any>;
      if (typeof messagingHub.parseInbound === "function") {
        inbound = await messagingHub.parseInbound(channelId, body);
      } else {
        inbound = {
          id: uuidv4(),
          channelId,
          channelType: channel.type,
          content: typeof body.content === "string" ? body.content : JSON.stringify(body),
          sender: body.sender ?? body.from ?? "unknown",
          direction: "inbound" as MessageDirection,
          timestamp: new Date().toISOString(),
          raw: body,
        };
      }

      await messagingHub.routeInbound(inbound);

      broadcastSseEvent({
        type: "message_received",
        channelId,
        messageId: inbound.id,
        ts: Date.now(),
      });

      res.json({ ok: true, messageId: inbound.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Webhook processing error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/messaging/subscriptions
   * List subscriptions. Optional filters: ?conversationId= or ?channelId=
   */
  app.get("/api/messaging/subscriptions", (req, res) => {
    try {
      const { conversationId, channelId } = req.query as Record<string, string | undefined>;
      const subscriptions = messagingHub.getSubscriptions({ conversationId, channelId });
      res.json(subscriptions);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to list subscriptions" });
    }
  });

  /**
   * POST /api/messaging/subscriptions
   * Create a subscription.
   * Body: { channelId, conversationId, events[] }
   */
  app.post("/api/messaging/subscriptions", (req, res) => {
    try {
      const { channelId, conversationId, events } = req.body ?? {};

      if (!channelId || typeof channelId !== "string") {
        return res.status(400).json({ error: "channelId is required" });
      }
      if (!conversationId || typeof conversationId !== "string") {
        return res.status(400).json({ error: "conversationId is required" });
      }
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: "events must be a non-empty array" });
      }
      if (events.some((e: any) => typeof e !== "string")) {
        return res.status(400).json({ error: "each event must be a string" });
      }

      const channel = messagingHub.getChannel(channelId);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const subscription = messagingHub.createSubscription({ channelId, conversationId, events });
      res.status(201).json(subscription);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to create subscription" });
    }
  });

  /**
   * DELETE /api/messaging/subscriptions/:channelId/:conversationId
   * Remove a subscription.
   */
  app.delete("/api/messaging/subscriptions/:channelId/:conversationId", (req, res) => {
    try {
      const { channelId, conversationId } = req.params;

      const removed = messagingHub.removeSubscription(channelId, conversationId);
      if (!removed) return res.status(404).json({ error: "Subscription not found" });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to remove subscription" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY & STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/messaging/history
   * Get message history.
   * Query params: ?limit=50&channelId=&direction=inbound|outbound
   */
  app.get("/api/messaging/history", (req, res) => {
    try {
      const { channelId, direction } = req.query as Record<string, string | undefined>;
      const limit = Math.min(Number(req.query.limit ?? 50), 500);

      if (direction !== undefined && !VALID_DIRECTIONS.includes(direction as MessageDirection)) {
        return res.status(400).json({ error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` });
      }
      if (isNaN(limit) || limit < 1) {
        return res.status(400).json({ error: "limit must be a positive integer" });
      }

      const history = messagingHub.getHistory({ limit, channelId, direction: direction as MessageDirection | undefined });
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch history" });
    }
  });

  /**
   * GET /api/messaging/stats
   * Get messaging system statistics.
   */
  app.get("/api/messaging/stats", (req, res) => {
    try {
      const stats = messagingHub.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch stats" });
    }
  });

  /**
   * GET /api/messaging/delivery/:messageId
   * Get delivery status for a specific message.
   */
  app.get("/api/messaging/delivery/:messageId", (req, res) => {
    try {
      const { messageId } = req.params;

      const status = messagingHub.getDeliveryStatus(messageId);
      if (!status) return res.status(404).json({ error: "Message not found" });

      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch delivery status" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD SSE STREAM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/messaging/stream
   * SSE stream for real-time messaging events.
   * Emits: message_received, message_sent, delivery_update, channel_status_change
   */
  app.get("/api/messaging/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const clientId = uuidv4();

    const send = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const client: SseClient = { id: clientId, res, send };
    sseClients.set(clientId, client);

    // Send initial connected event
    send({ type: "connected", clientId, ts: Date.now() });

    // Keep-alive ping every 15 seconds
    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(ping);
        sseClients.delete(clientId);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(clientId);
    });
  });
}
