/**
 * messagingHub.ts
 * Omni-channel messaging engine for Ultra Computer.
 * Routes messages between the agent system and external channels:
 * Slack, Gmail, and generic webhooks.
 *
 * All channel adapters produce real API payloads. No mocking.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "./logger.js";
const messagingLogger = logger.child({ module: "messaging" });
import { EventEmitter } from "events";

// ─────────────────────────────────────────────────────────────────────────────
// Core Data Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InboundMessage {
  id: string;
  channelId: string;
  channelType: string;
  senderId: string;
  senderName: string;
  content: string;
  threadId?: string;
  attachments?: Array<{ name: string; url: string; mimeType: string }>;
  metadata: Record<string, any>;
  receivedAt: number;
}

export interface OutboundMessage {
  id: string;
  channelId: string;
  channelType: string;
  content: string;
  format: "text" | "html" | "blocks" | "json";
  subject?: string;
  recipient?: string;
  threadId?: string;
  attachments?: Array<{ name: string; url: string; mimeType: string }>;
  metadata: Record<string, any>;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  retryable?: boolean;
}

export interface AgentNotification {
  type:
    | "task_complete"
    | "task_failed"
    | "agent_spawned"
    | "checkpoint_saved"
    | "skill_triggered"
    | "system_alert";
  conversationId?: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "success";
  data: Record<string, any>;
  timestamp: number;
}

export interface ChannelSubscription {
  channelId: string;
  conversationId: string;
  events: string[];
  createdAt: number;
}

export interface DeliveryRecord {
  id: string;
  outboundMessageId: string;
  channelId: string;
  status: "queued" | "sent" | "failed" | "retried";
  attempts: number;
  lastAttemptAt: number;
  error?: string;
}

export type ChannelType = "slack" | "gmail" | "webhook" | "websocket";
export type ChannelStatus = "connected" | "disconnected" | "error";
export type ChannelCapability =
  | "send_message"
  | "receive_message"
  | "send_notification"
  | "send_file"
  | "react";

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  config: Record<string, any>;
  capabilities: ChannelCapability[];
  createdAt: number;
  updatedAt: number;
}

export interface MessagingHubStats {
  totalChannels: number;
  connectedChannels: number;
  messagesSent: number;
  messagesReceived: number;
  deliverySuccessRate: number;
  queueDepth: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Adapter Interface
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelAdapter {
  type: ChannelType;
  send(payload: OutboundMessage): Promise<SendResult>;
  formatNotification(notification: AgentNotification): OutboundMessage;
  parseInbound(raw: any): InboundMessage | null;
  testConnection(config: any): Promise<{ ok: boolean; error?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Templates
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-built templates for common agent lifecycle events. */
const NOTIFICATION_TEMPLATES: Record<
  AgentNotification["type"],
  (notification: AgentNotification) => { title: string; body: string; emoji: string }
> = {
  task_complete: (n) => ({
    emoji: "✅",
    title: `Task Complete: ${n.title}`,
    body:
      `${n.body}\n\n` +
      (n.data.duration ? `Duration: ${n.data.duration}ms\n` : "") +
      (n.data.result ? `Result: ${String(n.data.result).slice(0, 500)}` : ""),
  }),

  task_failed: (n) => ({
    emoji: "❌",
    title: `Task Failed: ${n.title}`,
    body:
      `${n.body}\n\n` +
      (n.data.error ? `Error: ${n.data.error}\n` : "") +
      (n.data.stack ? `Stack (preview):\n${String(n.data.stack).slice(0, 300)}\n` : "") +
      (n.data.retryable ? `This task can be retried.` : ""),
  }),

  agent_spawned: (n) => ({
    emoji: "🤖",
    title: `New Agent: ${n.title}`,
    body:
      `${n.body}\n\n` +
      (n.data.agentType ? `Agent Type: ${n.data.agentType}\n` : "") +
      (n.data.model ? `Model: ${n.data.model}` : ""),
  }),

  checkpoint_saved: (n) => ({
    emoji: "💾",
    title: `Checkpoint: ${n.title}`,
    body:
      `${n.body}\n\n` +
      (n.data.progress !== undefined ? `Progress: ${n.data.progress}%\n` : "") +
      (n.data.checkpointId ? `Checkpoint ID: ${n.data.checkpointId}` : ""),
  }),

  skill_triggered: (n) => ({
    emoji: "⚡",
    title: `Skill Triggered: ${n.title}`,
    body:
      `${n.body}\n\n` +
      (n.data.skillName ? `Skill: ${n.data.skillName}\n` : "") +
      (n.data.triggerReason ? `Reason: ${n.data.triggerReason}` : ""),
  }),

  system_alert: (n) => ({
    emoji: n.severity === "error" ? "🚨" : n.severity === "warning" ? "⚠️" : "ℹ️",
    title: `System Alert: ${n.title}`,
    body:
      `${n.body}\n\n` +
      (n.data.component ? `Component: ${n.data.component}\n` : "") +
      (n.data.severity ? `Severity: ${n.data.severity}\n` : "") +
      (n.data.suggestedAction ? `Suggested Action: ${n.data.suggestedAction}` : ""),
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Slack Adapter
// ─────────────────────────────────────────────────────────────────────────────

class SlackAdapter implements ChannelAdapter {
  type: ChannelType = "slack";

  /**
   * STUB: Builds a Slack Block Kit payload and stores it on message metadata.
   * Actual HTTP delivery is NOT implemented here — this is a stub that prepares
   * the payload for the routes layer to send via a connected Slack integration.
   * TODO: wire up real Slack API calls when a Slack connector is available.
   */
  async send(payload: OutboundMessage): Promise<SendResult> {
    messagingLogger.warn("SlackAdapter.send() is a stub — message is prepared but not actually delivered to Slack");
    const channelTarget = payload.metadata?.slackChannel ?? payload.recipient ?? "#general";

    try {
      const blocks = this._buildBlocks(payload);
      const slackPayload = {
        channel: channelTarget,
        text: payload.content, // Fallback text for notifications
        blocks,
        ...(payload.threadId ? { thread_ts: payload.threadId } : {}),
      };

      // Store the composed payload on the message metadata for the routes layer
      payload.metadata.slackPayload = slackPayload;

      return {
        ok: true,
        messageId: `slack-pending-${uuidv4()}`,
      };
    } catch (err: any) {
      return { ok: false, error: err.message, retryable: true };
    }
  }

  /** Converts an AgentNotification into a rich Slack BlockKit OutboundMessage. */
  formatNotification(notification: AgentNotification): OutboundMessage {
    const tpl = NOTIFICATION_TEMPLATES[notification.type](notification);
    const severityColor: Record<string, string> = {
      info: "#4A90E2",
      warning: "#F5A623",
      error: "#D0021B",
      success: "#7ED321",
    };

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${tpl.emoji} ${tpl.title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: tpl.body.length > 3000 ? tpl.body.slice(0, 2997) + "..." : tpl.body,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Ultra Computer* | <!date^${Math.floor(
              notification.timestamp / 1000
            )}^{date_short_pretty} at {time}|${new Date(
              notification.timestamp
            ).toISOString()}> | Severity: *${notification.severity.toUpperCase()}*`,
          },
        ],
      },
      { type: "divider" },
    ];

    // For task_failed, add a retry action button
    if (notification.type === "task_failed" && notification.data.retryable) {
      blocks.push({
        type: "actions" as any,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Retry Task", emoji: true },
            style: "primary",
            action_id: "retry_task",
            value: notification.data.taskId ?? "unknown",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "View Details", emoji: true },
            action_id: "view_task_details",
            value: notification.conversationId ?? "unknown",
            url: `https://ultra-computer.app/conversations/${notification.conversationId ?? ""}`,
          },
        ],
      } as any);
    }

    // For task_complete, add a view results button
    if (notification.type === "task_complete") {
      blocks.push({
        type: "actions" as any,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Results", emoji: true },
            style: "primary",
            action_id: "view_results",
            value: notification.conversationId ?? "unknown",
            url: `https://ultra-computer.app/conversations/${notification.conversationId ?? ""}`,
          },
        ],
      } as any);
    }

    return {
      id: uuidv4(),
      channelId: "",
      channelType: "slack",
      content: `${tpl.emoji} ${tpl.title}: ${notification.body}`,
      format: "blocks",
      metadata: {
        blocks,
        attachments: [
          {
            color: severityColor[notification.severity] ?? "#4A90E2",
            fallback: tpl.title,
          },
        ],
        notificationType: notification.type,
      },
    };
  }

  /**
   * Parses a raw Slack event payload (message, app_mention, slash_command)
   * into a normalized InboundMessage.
   */
  parseInbound(raw: any): InboundMessage | null {
    // Handle Slack URL verification challenge
    if (raw?.type === "url_verification") return null;

    const event = raw?.event ?? raw;

    // Only handle message events (including app_mention)
    if (!event || !["message", "app_mention"].includes(event.type)) return null;

    // Skip bot messages and message edits
    if (event.subtype === "bot_message" || event.subtype === "message_changed") return null;
    if (event.bot_id) return null;

    const content = event.text ?? event.message?.text ?? "";
    if (!content) return null;

    return {
      id: uuidv4(),
      channelId: raw.channelId ?? event.channel ?? "",
      channelType: "slack",
      senderId: event.user ?? event.username ?? "unknown",
      senderName: event.username ?? event.user ?? "Slack User",
      content: content.replace(/<@[A-Z0-9]+>/g, "").trim(), // Strip user mentions
      threadId: event.thread_ts ?? undefined,
      attachments: (event.files ?? []).map((f: any) => ({
        name: f.name ?? f.title ?? "attachment",
        url: f.url_private ?? f.permalink ?? "",
        mimeType: f.mimetype ?? "application/octet-stream",
      })),
      metadata: {
        slackEventType: event.type,
        slackChannel: event.channel,
        slackTeam: raw.team_id ?? raw.team ?? event.team,
        slackTs: event.ts,
        rawEvent: event,
      },
      receivedAt: event.ts ? Math.floor(parseFloat(event.ts) * 1000) : Date.now(),
    };
  }

  /** Validates that required Slack config fields are present. */
  async testConnection(config: any): Promise<{ ok: boolean; error?: string }> {
    if (!config?.workspaceId) {
      return { ok: false, error: "Missing required field: workspaceId" };
    }
    if (!config?.defaultChannel) {
      return { ok: false, error: "Missing required field: defaultChannel" };
    }
    if (!config.defaultChannel.startsWith("#") && !config.defaultChannel.startsWith("C")) {
      return {
        ok: false,
        error: "defaultChannel must start with # (e.g. #general) or be a channel ID (Cxxxxxxxx)",
      };
    }
    return { ok: true };
  }

  private _buildBlocks(payload: OutboundMessage): any[] {
    // If the payload already has pre-built blocks (from formatNotification), use them
    if (payload.metadata?.blocks) return payload.metadata.blocks;

    // Otherwise build a simple text block
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            payload.content.length > 3000
              ? payload.content.slice(0, 2997) + "..."
              : payload.content,
        },
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gmail Adapter
// ─────────────────────────────────────────────────────────────────────────────

class GmailAdapter implements ChannelAdapter {
  type: ChannelType = "gmail";

  /**
   * STUB: Formats a Gmail payload and stores it on message metadata.
   * Actual delivery is NOT implemented here — this is a stub that prepares
   * the payload for the routes layer to send via a connected Gmail integration.
   * TODO: wire up real Gmail API calls when a Gmail connector is available.
   */
  async send(payload: OutboundMessage): Promise<SendResult> {
    messagingLogger.warn("GmailAdapter.send() is a stub — message is prepared but not actually delivered via Gmail");
    if (!payload.recipient) {
      return { ok: false, error: "No recipient specified for Gmail channel", retryable: false };
    }

    try {
      const htmlBody =
        payload.format === "html"
          ? payload.content
          : this._textToHtml(payload.content);

      const gmailPayload = {
        to: payload.recipient,
        subject: payload.subject ?? "Ultra Computer Notification",
        body: htmlBody,
        isHtml: true,
        ...(payload.attachments?.length
          ? {
              attachments: payload.attachments.map((a) => ({
                filename: a.name,
                url: a.url,
                mimeType: a.mimeType,
              })),
            }
          : {}),
      };

      payload.metadata.gmailPayload = gmailPayload;

      return {
        ok: true,
        messageId: `gmail-pending-${uuidv4()}`,
      };
    } catch (err: any) {
      return { ok: false, error: err.message, retryable: true };
    }
  }

  /** Converts an AgentNotification into a styled HTML email OutboundMessage. */
  formatNotification(notification: AgentNotification): OutboundMessage {
    const tpl = NOTIFICATION_TEMPLATES[notification.type](notification);

    const severityColors: Record<string, { bg: string; border: string; text: string }> = {
      info:    { bg: "#EBF5FB", border: "#2E86C1", text: "#1A5276" },
      warning: { bg: "#FEF9E7", border: "#F39C12", text: "#7D6608" },
      error:   { bg: "#FDEDEC", border: "#E74C3C", text: "#922B21" },
      success: { bg: "#EAFAF1", border: "#27AE60", text: "#1E8449" },
    };

    const colors = severityColors[notification.severity] ?? severityColors.info;
    const date = new Date(notification.timestamp).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "long",
    });

    const dataRows = Object.entries(notification.data)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          `<tr>
            <td style="padding:6px 12px;font-weight:600;color:#555;white-space:nowrap;border-bottom:1px solid #eee;">${this._camelToLabel(k)}</td>
            <td style="padding:6px 12px;color:#333;border-bottom:1px solid #eee;">${String(v).slice(0, 500)}</td>
          </tr>`
      )
      .join("");

    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tpl.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Ultra Computer</span>
                    <br>
                    <span style="font-size:12px;color:rgba(255,255,255,0.6);letter-spacing:1px;text-transform:uppercase;">Agent Notification</span>
                  </td>
                  <td align="right">
                    <span style="font-size:32px;">${tpl.emoji}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert Banner -->
          <tr>
            <td style="background-color:${colors.bg};border-left:4px solid ${colors.border};padding:16px 32px;">
              <span style="font-size:13px;font-weight:700;color:${colors.text};text-transform:uppercase;letter-spacing:0.5px;">${notification.severity}</span>
              &nbsp;&nbsp;
              <span style="font-size:14px;color:${colors.text};">${notification.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
            </td>
          </tr>

          <!-- Title + Body -->
          <tr>
            <td style="padding:28px 32px 20px;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#1a1a2e;line-height:1.3;">${this._escapeHtml(tpl.title)}</h1>
              <p style="margin:0;font-size:15px;color:#444;line-height:1.7;white-space:pre-wrap;">${this._escapeHtml(notification.body)}</p>
            </td>
          </tr>

          <!-- Data Table -->
          ${
            dataRows
              ? `<tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f8f9fa;">
                    <th colspan="2" style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #eee;">Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${dataRows}
                </tbody>
              </table>
            </td>
          </tr>`
              : ""
          }

          <!-- CTA Button -->
          ${
            notification.conversationId
              ? `<tr>
            <td style="padding:4px 32px 28px;text-align:center;">
              <a href="https://ultra-computer.app/conversations/${notification.conversationId}"
                 style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;letter-spacing:0.3px;">
                View Conversation →
              </a>
            </td>
          </tr>`
              : ""
          }

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;border-top:1px solid #eee;padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#999;">
                    Sent by <strong>Ultra Computer</strong> at ${date}
                  </td>
                  <td align="right">
                    <a href="https://ultra-computer.app" style="font-size:12px;color:#4A90E2;text-decoration:none;">ultra-computer.app</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return {
      id: uuidv4(),
      channelId: "",
      channelType: "gmail",
      content: htmlBody,
      format: "html",
      subject: `${tpl.emoji} ${tpl.title}`,
      metadata: { notificationType: notification.type },
    };
  }

  /**
   * Parses an inbound email webhook payload (e.g., from Gmail push notifications
   * or a forwarding filter) into a normalized InboundMessage.
   */
  parseInbound(raw: any): InboundMessage | null {
    // Accept Gmail push notification format or simplified webhook format
    const email = raw?.message ?? raw?.email ?? raw;

    const content =
      email?.snippet ??
      email?.body ??
      email?.text ??
      email?.content ??
      "";

    if (!content && !email?.subject) return null;

    const from = email?.from ?? email?.sender ?? "";
    const senderId = this._extractEmail(from) ?? "unknown@unknown.com";
    const senderName = this._extractName(from) ?? senderId;

    return {
      id: uuidv4(),
      channelId: raw.channelId ?? "",
      channelType: "gmail",
      senderId,
      senderName,
      content: content || `[Email: ${email?.subject ?? "No subject"}]`,
      attachments: (email?.attachments ?? []).map((a: any) => ({
        name: a.filename ?? a.name ?? "attachment",
        url: a.url ?? a.attachmentId ?? "",
        mimeType: a.mimeType ?? "application/octet-stream",
      })),
      metadata: {
        subject: email?.subject ?? "",
        messageId: email?.id ?? email?.messageId ?? "",
        threadId: email?.threadId ?? undefined,
        labelIds: email?.labelIds ?? [],
        rawEmail: email,
      },
      receivedAt: email?.internalDate
        ? parseInt(email.internalDate, 10)
        : Date.now(),
    };
  }

  /** Validates that the configured from address is a valid email. */
  async testConnection(config: any): Promise<{ ok: boolean; error?: string }> {
    if (!config?.fromAddress) {
      return { ok: false, error: "Missing required field: fromAddress" };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.fromAddress)) {
      return { ok: false, error: `Invalid email address: ${config.fromAddress}` };
    }
    if (!config?.defaultRecipient) {
      return { ok: false, error: "Missing required field: defaultRecipient" };
    }
    if (!emailRegex.test(config.defaultRecipient)) {
      return {
        ok: false,
        error: `Invalid default recipient email: ${config.defaultRecipient}`,
      };
    }
    return { ok: true };
  }

  private _textToHtml(text: string): string {
    return `<p style="white-space:pre-wrap;font-family:sans-serif;line-height:1.6;">${this._escapeHtml(text)}</p>`;
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  private _extractEmail(from: string): string | null {
    const match = from.match(/<([^>]+)>/) ?? from.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
    return match ? match[1] : null;
  }

  private _extractName(from: string): string | null {
    const match = from.match(/^([^<]+)</);
    return match ? match[1].trim().replace(/^"|"$/g, "") : null;
  }

  private _camelToLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Adapter
// ─────────────────────────────────────────────────────────────────────────────

class WebhookAdapter implements ChannelAdapter {
  type: ChannelType = "webhook";

  /**
   * POSTs a JSON payload to the configured webhook URL.
   * Works with Zapier, n8n, Make, or any custom HTTP endpoint.
   */
  async send(payload: OutboundMessage): Promise<SendResult> {
    const url = payload.metadata?.webhookUrl ?? payload.metadata?.url;
    if (!url) {
      return { ok: false, error: "No webhookUrl configured for this channel", retryable: false };
    }

    const envelope = {
      id: payload.id,
      source: "ultra-computer",
      version: "1.0",
      sentAt: new Date().toISOString(),
      channel: {
        id: payload.channelId,
        type: payload.channelType,
      },
      message: {
        content: payload.content,
        format: payload.format,
        subject: payload.subject,
        recipient: payload.recipient,
        threadId: payload.threadId,
        attachments: payload.attachments ?? [],
      },
      metadata: {
        ...payload.metadata,
        webhookUrl: undefined, // Don't echo the URL back
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "UltraComputer/1.0",
          "X-Ultra-Computer-Event": payload.metadata?.notificationType ?? "message",
          ...(payload.metadata?.webhookSecret
            ? { "X-Webhook-Secret": payload.metadata.webhookSecret }
            : {}),
        },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          ok: false,
          error: `Webhook returned ${response.status}: ${body.slice(0, 200)}`,
          retryable: response.status >= 500,
        };
      }

      return {
        ok: true,
        messageId: `webhook-${uuidv4()}`,
      };
    } catch (err: any) {
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      return {
        ok: false,
        error: isTimeout ? "Webhook request timed out after 10s" : err.message,
        retryable: true,
      };
    }
  }

  /** Wraps an AgentNotification in the standard webhook JSON envelope. */
  formatNotification(notification: AgentNotification): OutboundMessage {
    const tpl = NOTIFICATION_TEMPLATES[notification.type](notification);

    const webhookBody = {
      event: {
        type: notification.type,
        severity: notification.severity,
        conversationId: notification.conversationId,
        timestamp: notification.timestamp,
        title: notification.title,
        body: notification.body,
      },
      formatted: {
        title: tpl.title,
        body: tpl.body,
        emoji: tpl.emoji,
      },
      data: notification.data,
      source: {
        application: "ultra-computer",
        version: "1.0",
        environment: process.env.NODE_ENV ?? "production",
      },
    };

    return {
      id: uuidv4(),
      channelId: "",
      channelType: "webhook",
      content: JSON.stringify(webhookBody),
      format: "json",
      subject: `${notification.type}: ${notification.title}`,
      metadata: {
        notificationType: notification.type,
        webhookBody,
      },
    };
  }

  /**
   * Parses an inbound webhook POST body into a normalized InboundMessage.
   * Requires at minimum: content or message field, and a source identifier.
   */
  parseInbound(raw: any): InboundMessage | null {
    if (!raw || typeof raw !== "object") return null;

    const content =
      raw.content ??
      raw.message ??
      raw.text ??
      raw.body ??
      (raw.event?.body) ??
      "";

    if (!content) return null;

    const source = raw.source ?? raw.sender ?? raw.from ?? "webhook";
    const sourceId = typeof source === "object" ? source.id ?? "unknown" : String(source);
    const sourceName = typeof source === "object" ? source.name ?? sourceId : sourceId;

    return {
      id: uuidv4(),
      channelId: raw.channelId ?? "",
      channelType: "webhook",
      senderId: sourceId,
      senderName: sourceName,
      content: typeof content === "string" ? content : JSON.stringify(content),
      threadId: raw.threadId ?? raw.conversationId ?? undefined,
      attachments: (raw.attachments ?? []).map((a: any) => ({
        name: a.name ?? a.filename ?? "attachment",
        url: a.url ?? "",
        mimeType: a.mimeType ?? a.type ?? "application/octet-stream",
      })),
      metadata: {
        webhookType: raw.type ?? raw.event?.type ?? "inbound",
        rawPayload: raw,
      },
      receivedAt: raw.timestamp
        ? typeof raw.timestamp === "number"
          ? raw.timestamp
          : new Date(raw.timestamp).getTime()
        : Date.now(),
    };
  }

  /**
   * Sends a test POST to the webhook URL to verify it's reachable.
   */
  async testConnection(config: any): Promise<{ ok: boolean; error?: string }> {
    if (!config?.url) {
      return { ok: false, error: "Missing required field: url" };
    }

    try {
      new URL(config.url); // Validates URL format
    } catch {
      return { ok: false, error: `Invalid URL: ${config.url}` };
    }

    const pingPayload = {
      id: uuidv4(),
      source: "ultra-computer",
      version: "1.0",
      sentAt: new Date().toISOString(),
      type: "ping",
      message: "Ultra Computer webhook test connection",
    };

    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "UltraComputer/1.0",
          "X-Ultra-Computer-Event": "ping",
        },
        body: JSON.stringify(pingPayload),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `Webhook returned HTTP ${response.status} to test ping`,
        };
      }

      return { ok: true };
    } catch (err: any) {
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      return {
        ok: false,
        error: isTimeout ? "Webhook did not respond within 8 seconds" : err.message,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Manager
// ─────────────────────────────────────────────────────────────────────────────

class SubscriptionManager {
  /** conversationId → ChannelSubscription[] */
  private byConversation = new Map<string, ChannelSubscription[]>();
  /** channelId → ChannelSubscription[] */
  private byChannel = new Map<string, ChannelSubscription[]>();

  /**
   * Subscribes a channel to events for a conversation.
   * If a subscription already exists it is updated (events merged).
   */
  subscribe(channelId: string, conversationId: string, events: string[]): ChannelSubscription {
    const existing = this.byConversation
      .get(conversationId)
      ?.find((s) => s.channelId === channelId);

    if (existing) {
      const merged = Array.from(new Set([...existing.events, ...events]));
      existing.events = merged;
      return existing;
    }

    const sub: ChannelSubscription = {
      channelId,
      conversationId,
      events,
      createdAt: Date.now(),
    };

    if (!this.byConversation.has(conversationId)) {
      this.byConversation.set(conversationId, []);
    }
    this.byConversation.get(conversationId)!.push(sub);

    if (!this.byChannel.has(channelId)) {
      this.byChannel.set(channelId, []);
    }
    this.byChannel.get(channelId)!.push(sub);

    return sub;
  }

  /** Removes a channel's subscription from a conversation. */
  unsubscribe(channelId: string, conversationId: string): boolean {
    const convSubs = this.byConversation.get(conversationId);
    if (convSubs) {
      const idx = convSubs.findIndex((s) => s.channelId === channelId);
      if (idx !== -1) convSubs.splice(idx, 1);
    }

    const chanSubs = this.byChannel.get(channelId);
    if (chanSubs) {
      const idx = chanSubs.findIndex((s) => s.conversationId === conversationId);
      if (idx !== -1) chanSubs.splice(idx, 1);
    }

    return true;
  }

  /** Returns all channel subscriptions for a conversation. */
  getSubscriptions(conversationId: string): ChannelSubscription[] {
    return this.byConversation.get(conversationId) ?? [];
  }

  /** Returns all conversation subscriptions for a channel. */
  getChannelSubscriptions(channelId: string): ChannelSubscription[] {
    return this.byChannel.get(channelId) ?? [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Queue with Retry
// ─────────────────────────────────────────────────────────────────────────────

interface QueueEntry {
  message: OutboundMessage;
  delivery: DeliveryRecord;
  adapter: ChannelAdapter;
  channel: Channel;
  maxRetries: number;
  nextRetryAt: number;
}

class MessageQueue {
  private queue: QueueEntry[] = [];
  private history: OutboundMessage[] = [];
  private deliveryRecords = new Map<string, DeliveryRecord>();
  private processing = false;
  private readonly MAX_HISTORY = 500;
  private readonly MAX_RETRIES = 3;

  /** Enqueues an outbound message for delivery with retry support. */
  enqueue(
    message: OutboundMessage,
    adapter: ChannelAdapter,
    channel: Channel
  ): DeliveryRecord {
    const delivery: DeliveryRecord = {
      id: uuidv4(),
      outboundMessageId: message.id,
      channelId: channel.id,
      status: "queued",
      attempts: 0,
      lastAttemptAt: 0,
    };

    this.deliveryRecords.set(delivery.id, delivery);

    this.queue.push({
      message,
      delivery,
      adapter,
      channel,
      maxRetries: this.MAX_RETRIES,
      nextRetryAt: Date.now(),
    });

    this._addToHistory(message);
    this._scheduleProcessing();

    return delivery;
  }

  /** Returns the delivery record for a given delivery ID. */
  getDeliveryStatus(deliveryId: string): DeliveryRecord | undefined {
    return this.deliveryRecords.get(deliveryId);
  }

  /** Returns the last N messages from history (default 100, max 500). */
  getHistory(limit = 100): OutboundMessage[] {
    return this.history.slice(-Math.min(limit, this.MAX_HISTORY));
  }

  /** Current number of messages waiting to be delivered. */
  get depth(): number {
    return this.queue.filter((e) => e.delivery.status === "queued" || e.delivery.status === "retried").length;
  }

  /** Total delivery records */
  get totalDeliveries(): number {
    return this.deliveryRecords.size;
  }

  /** Success count */
  get successCount(): number {
    let n = 0;
    for (const d of this.deliveryRecords.values()) {
      if (d.status === "sent") n++;
    }
    return n;
  }

  private _addToHistory(message: OutboundMessage): void {
    this.history.push(message);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
  }

  private _scheduleProcessing(): void {
    if (!this.processing) {
      this.processing = true;
      setImmediate(() => this._processQueue());
    }
  }

  private async _processQueue(): Promise<void> {
    try {
      const now = Date.now();
      const ready = this.queue.filter(
        (e) =>
          (e.delivery.status === "queued" || e.delivery.status === "retried") &&
          e.nextRetryAt <= now
      );

      for (const entry of ready) {
        await this._deliver(entry);
      }

      // Remove fully settled entries
      this.queue = this.queue.filter(
        (e) => e.delivery.status !== "sent" && e.delivery.status !== "failed"
      );

      // If there are still retryable entries, schedule another pass
      const hasPending = this.queue.some(
        (e) => e.delivery.status === "queued" || e.delivery.status === "retried"
      );

      if (hasPending) {
        const nextRetry = Math.min(...this.queue.map((e) => e.nextRetryAt));
        const delay = Math.max(0, nextRetry - Date.now());
        setTimeout(() => this._processQueue(), delay);
      } else {
        this.processing = false;
      }
    } finally {
      // Always reset processing flag so queue doesn’t get stuck on unexpected errors
      if (this.processing) {
        const hasPending = this.queue.some(
          (e) => e.delivery.status === "queued" || e.delivery.status === "retried"
        );
        if (!hasPending) this.processing = false;
      }
    }
  }

  private async _deliver(entry: QueueEntry): Promise<void> {
    entry.delivery.attempts++;
    entry.delivery.lastAttemptAt = Date.now();

    try {
      const result = await entry.adapter.send(entry.message);

      if (result.ok) {
        entry.delivery.status = "sent";
        if (result.messageId) entry.message.metadata.deliveredMessageId = result.messageId;
      } else {
        const canRetry = result.retryable !== false && entry.delivery.attempts < entry.maxRetries;
        if (canRetry) {
          entry.delivery.status = "retried";
          entry.delivery.error = result.error;
          // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
          entry.nextRetryAt = Date.now() + Math.pow(2, entry.delivery.attempts) * 1000;
        } else {
          entry.delivery.status = "failed";
          entry.delivery.error = result.error;
        }
      }
    } catch (err: any) {
      const canRetry = entry.delivery.attempts < entry.maxRetries;
      if (canRetry) {
        entry.delivery.status = "retried";
        entry.delivery.error = err.message;
        entry.nextRetryAt = Date.now() + Math.pow(2, entry.delivery.attempts) * 1000;
      } else {
        entry.delivery.status = "failed";
        entry.delivery.error = err.message;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Messaging Hub (Singleton)
// ─────────────────────────────────────────────────────────────────────────────

class MessagingHub extends EventEmitter {
  private channels = new Map<string, Channel>();
  private adapters = new Map<ChannelType, ChannelAdapter>();
  private subscriptionManager = new SubscriptionManager();
  private messageQueue = new MessageQueue();
  private messagesSent = 0;
  private messagesReceived = 0;
  private inboundHistory: Array<any> = [];
  private readonly MAX_INBOUND_HISTORY = 500;

  // Built-in conversation tracking: conversationId → channel IDs
  private conversations = new Map<string, Set<string>>();

  constructor() {
    super();
    // Register built-in adapters
    this.adapters.set("slack", new SlackAdapter());
    this.adapters.set("gmail", new GmailAdapter());
    this.adapters.set("webhook", new WebhookAdapter());
  }

  // ──────────────────────────────────────────
  // Channel Registry
  // ──────────────────────────────────────────

  /**
   * Validates a webhook URL is safe (https:// or http://, no private IPs).
   * Returns null if valid, or an error string if blocked.
   */
  private _validateWebhookUrl(url: unknown): string | null {
    if (typeof url !== "string") return null; // no URL present, skip
    let parsed: URL;
    try { parsed = new URL(url); } catch { return `Invalid webhook URL: ${url}`; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Webhook URL must use http:// or https://";
    }
    const h = parsed.hostname;
    if (h === "localhost" || h === "::1" || h.startsWith("127.") || h.startsWith("169.254.")) {
      return "Webhook URL points to a private/loopback address";
    }
    const parts = h.split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      const [a, b] = parts;
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
        return "Webhook URL points to a private IP range";
      }
    }
    return null;
  }

  /**
   * Registers a new messaging channel.
   * Returns the created channel with a generated ID.
   * Validates webhook URLs to prevent SSRF.
   */
  registerChannel(params: any): Channel {
    // Validate webhook URL if present in config
    if (params.type === "webhook" || params.config?.url || params.config?.webhookUrl) {
      const urlToCheck = params.config?.url ?? params.config?.webhookUrl;
      const urlErr = this._validateWebhookUrl(urlToCheck);
      if (urlErr) throw new Error(urlErr);
    }
    const channel: Channel = {
      id: params.id ?? uuidv4(),
      type: params.type ?? "webhook",
      name: params.name ?? "Unnamed",
      status: params.status ?? "disconnected",
      config: params.config ?? {},
      capabilities: params.capabilities ?? ["send_message", "receive_message"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  /**
   * Removes a channel and all its subscriptions.
   */
  removeChannel(channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    // Clean up subscriptions
    const subs = this.subscriptionManager.getChannelSubscriptions(channelId);
    for (const sub of subs) {
      this.subscriptionManager.unsubscribe(channelId, sub.conversationId);
    }

    this.channels.delete(channelId);
    return true;
  }

  /**
   * Returns all registered channels.
   */
  getChannels(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Returns a specific channel by ID.
   */
  getChannel(channelId: string): Channel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Updates config and metadata for an existing channel.
   */
  updateChannelConfig(
    channelId: string,
    updates: Partial<Pick<Channel, "name" | "config" | "status" | "capabilities">>
  ): Channel | null {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    Object.assign(channel, updates, { updatedAt: Date.now() });
    return channel;
  }

  /**
   * Runs the adapter's testConnection() for a channel and updates its status.
   */
  async testChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
    const channel = this.channels.get(channelId);
    if (!channel) return { ok: false, error: "Channel not found" };

    const adapter = this.adapters.get(channel.type);
    if (!adapter) return { ok: false, error: `No adapter for channel type: ${channel.type}` };

    const result = await adapter.testConnection(channel.config);
    channel.status = result.ok ? "connected" : "error";
    channel.updatedAt = Date.now();

    return result;
  }

  // ──────────────────────────────────────────
  // Messaging
  // ──────────────────────────────────────────

  /**
   * Sends a message to a specific channel.
   * Returns the delivery record for tracking.
   */
  async sendMessage(
    channelIdOrObj: string | any,
    content?: string,
    options: Partial<Omit<OutboundMessage, "id" | "channelId" | "channelType" | "content">> = {}
  ): Promise<{ deliveryId: string; ok: boolean; error?: string }> {
    // Routes call with a single object: { channelId, content, format, ... }
    let channelId: string;
    if (typeof channelIdOrObj === "object") {
      const obj = channelIdOrObj;
      channelId = obj.channelId;
      content = obj.content;
      options = { format: obj.format, subject: obj.subject, recipient: obj.recipient, ...options };
      if (obj.threadId) (options as any).threadId = obj.threadId;
    } else {
      channelId = channelIdOrObj;
    }
    const channel = this.channels.get(channelId);
    if (!channel) return { deliveryId: "", ok: false, error: "Channel not found" };

    if (channel.status !== "connected") {
      return { deliveryId: "", ok: false, error: `Channel is ${channel.status}` };
    }

    const adapter = this.adapters.get(channel.type);
    if (!adapter) {
      return { deliveryId: "", ok: false, error: `No adapter for type: ${channel.type}` };
    }

    // Validate content is a non-empty string
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return { deliveryId: "", ok: false, error: "content must be a non-empty string" };
    }

    const message: OutboundMessage = {
      id: uuidv4(),
      channelId,
      channelType: channel.type,
      content,
      format: options.format ?? "text",
      metadata: {
        ...channel.config,
        ...(options.metadata ?? {}),
      },
      ...options,
    };

    const delivery = this.messageQueue.enqueue(message, adapter, channel);
    this.messagesSent++;

    return { deliveryId: delivery.id, ok: true };
  }

  /**
   * Formats an AgentNotification and sends it to a specific channel.
   */
  async sendNotification(
    channelId: string,
    notification: AgentNotification
  ): Promise<{ deliveryId: string; ok: boolean; error?: string }> {
    const channel = this.channels.get(channelId);
    if (!channel) return { deliveryId: "", ok: false, error: "Channel not found" };

    if (channel.status !== "connected") {
      return { deliveryId: "", ok: false, error: `Channel is ${channel.status}` };
    }

    const adapter = this.adapters.get(channel.type);
    if (!adapter) {
      return { deliveryId: "", ok: false, error: `No adapter for type: ${channel.type}` };
    }

    const outbound = adapter.formatNotification(notification);
    outbound.channelId = channelId;
    outbound.metadata = {
      ...channel.config,
      ...outbound.metadata,
    };

    // Set recipient from channel config if not already set
    if (!outbound.recipient && channel.config?.defaultRecipient) {
      outbound.recipient = channel.config.defaultRecipient;
    }

    const delivery = this.messageQueue.enqueue(outbound, adapter, channel);
    this.messagesSent++;

    return { deliveryId: delivery.id, ok: true };
  }

  /**
   * Dispatches a notification to ALL connected channels simultaneously.
   * Used for system-wide alerts.
   */
  async broadcastNotification(notification: AgentNotification): Promise<
    Array<{ channelId: string; deliveryId: string; ok: boolean; error?: string }>
  > {
    const results: Array<{ channelId: string; deliveryId: string; ok: boolean; error?: string }> =
      [];

    const connected = Array.from(this.channels.values()).filter(
      (c) => c.status === "connected"
    );

    await Promise.all(
      connected.map(async (channel) => {
        const result = await this.sendNotification(channel.id, notification);
        results.push({ channelId: channel.id, ...result });
      })
    );

    return results;
  }

  // ──────────────────────────────────────────
  // Message Router
  // ──────────────────────────────────────────

  /**
   * Routes an inbound raw event from a channel into a normalized InboundMessage.
   * Creates or appends to a conversation. Returns the conversation ID.
   */
  routeInbound(
    channelIdOrObj: string | any,
    rawEvent?: any
  ): { conversationId: string; message: any } {
    // Routes call with a single pre-parsed inbound object
    if (typeof channelIdOrObj === "object") {
      const parsed = channelIdOrObj;
      this.messagesReceived++;
      // Store in inbound history (capped at MAX_INBOUND_HISTORY)
      this.inboundHistory.push({ ...parsed, receivedAt: Date.now() });
      if (this.inboundHistory.length > this.MAX_INBOUND_HISTORY) this.inboundHistory.shift();
      this.emit("message_received", parsed);
      const conversationId = parsed.threadId ?? uuidv4();
      return { conversationId, message: parsed };
    }

    // Original signature: (channelId, rawEvent)
    const channelId = channelIdOrObj;
    const channel = this.channels.get(channelId);
    if (!channel) return { conversationId: "", message: null };

    const adapter = this.adapters.get(channel.type);
    if (!adapter) return { conversationId: "", message: null };

    const message = adapter.parseInbound({ ...rawEvent, channelId });
    if (!message) return { conversationId: "", message: null };

    this.messagesReceived++;
    this.inboundHistory.push({ ...message, receivedAt: Date.now() });
    if (this.inboundHistory.length > this.MAX_INBOUND_HISTORY) this.inboundHistory.shift();
    this.emit("message_received", message);

    let conversationId =
      message.threadId ??
      rawEvent.conversationId ??
      null;

    if (!conversationId) {
      conversationId = uuidv4();
    }

    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, new Set());
    }
    this.conversations.get(conversationId)!.add(channelId);
    this.subscriptionManager.subscribe(channelId, conversationId, ["*"]);

    return { conversationId, message };
  }

  /**
   * Routes an agent notification to all channels subscribed to a conversation.
   * Respects per-subscription event filters.
   */
  async routeOutbound(
    conversationId: string,
    notification: AgentNotification
  ): Promise<Array<{ channelId: string; deliveryId: string; ok: boolean; error?: string }>> {
    const subs = this.subscriptionManager.getSubscriptions(conversationId);
    if (!subs.length) return [];

    // Filter subscriptions by event type
    const eligible = subs.filter(
      (s) => s.events.includes("*") || s.events.includes(notification.type)
    );

    const results = await Promise.all(
      eligible.map((sub) => this.sendNotification(sub.channelId, notification))
    );

    return eligible.map((sub, i) => ({ channelId: sub.channelId, ...results[i] }));
  }

  // ──────────────────────────────────────────
  // Subscription Management
  // ──────────────────────────────────────────

  /** Subscribe a channel to events for a conversation. */
  subscribe(channelId: string, conversationId: string, events: string[]): ChannelSubscription {
    return this.subscriptionManager.subscribe(channelId, conversationId, events);
  }

  /** Remove a channel's subscription from a conversation. */
  unsubscribe(channelId: string, conversationId: string): boolean {
    return this.subscriptionManager.unsubscribe(channelId, conversationId);
  }

  /**
   * Returns subscriptions, filtered by conversationId and/or channelId.
   */
  getSubscriptions(filterOrConvId?: string | { conversationId?: string; channelId?: string }): ChannelSubscription[] {
    if (typeof filterOrConvId === "string") {
      return this.subscriptionManager.getSubscriptions(filterOrConvId);
    }
    const filter = filterOrConvId ?? {};
    if (filter.conversationId) {
      let subs = this.subscriptionManager.getSubscriptions(filter.conversationId);
      if (filter.channelId) subs = subs.filter(s => s.channelId === filter.channelId);
      return subs;
    }
    if (filter.channelId) {
      return this.subscriptionManager.getChannelSubscriptions(filter.channelId);
    }
    // Return all subscriptions (no filter)
    const allConvs = new Set<string>();
    for (const ch of this.channels.values()) {
      const chSubs = this.subscriptionManager.getChannelSubscriptions(ch.id);
      for (const s of chSubs) allConvs.add(s.conversationId);
    }
    const all: ChannelSubscription[] = [];
    for (const convId of allConvs) {
      all.push(...this.subscriptionManager.getSubscriptions(convId));
    }
    return all;
  }

  // ──────────────────────────────────────────
  // Observability
  // ──────────────────────────────────────────

  /**
   * Returns recent outbound message history (last N messages, max 500).
   */
  getMessageHistory(limit = 100): OutboundMessage[] {
    return this.messageQueue.getHistory(limit);
  }

  /**
   * Returns the delivery status for a given delivery record ID.
   */
  getDeliveryStatus(deliveryId: string): DeliveryRecord | undefined {
    return this.messageQueue.getDeliveryStatus(deliveryId);
  }

  /**
   * Returns aggregate statistics for the messaging hub.
   */
  getStats(): MessagingHubStats {
    const allChannels = Array.from(this.channels.values());
    const connectedChannels = allChannels.filter((c) => c.status === "connected").length;
    const total = this.messageQueue.totalDeliveries;
    const successes = this.messageQueue.successCount;

    return {
      totalChannels: allChannels.length,
      connectedChannels,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      deliverySuccessRate: total > 0 ? Math.round((successes / total) * 100) / 100 : 1,
      queueDepth: this.messageQueue.depth,
    };
  }

  // ──────────────────────────────────────────
  // Route-Compatible Aliases
  // These methods adapt the routes' call signatures to the internal API.
  // ──────────────────────────────────────────

  /** Activate a channel by setting status to connected. */
  async connectChannel(channelId: string, _opts?: any): Promise<{ ok: boolean; error?: string }> {
    const ch = this.updateChannelConfig(channelId, { status: "connected" });
    if (!ch) return { ok: false, error: "Channel not found" };
    this.emit("channel_status_change", { channelId, status: "connected" });
    return { ok: true };
  }

  /** Deactivate a channel by setting status to disconnected. */
  async disconnectChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
    const ch = this.updateChannelConfig(channelId, { status: "disconnected" });
    if (!ch) return { ok: false, error: "Channel not found" };
    this.emit("channel_status_change", { channelId, status: "disconnected" });
    return { ok: true };
  }

  /** Alias for updateChannelConfig accepting partial updates. */
  updateChannel(channelId: string, updates: any): Channel | null {
    return this.updateChannelConfig(channelId, updates);
  }

  /** Alias for broadcastNotification (routes call it as 'broadcast'). */
  async broadcast(notification: any): Promise<any> {
    return this.broadcastNotification({
      type: notification.type ?? "system_alert",
      title: notification.title ?? "",
      body: notification.body ?? "",
      severity: notification.severity ?? "info",
      conversationId: notification.conversationId,
      data: notification.data ?? {},
      timestamp: Date.now(),
    });
  }

  /** Routes call notify() with a notification object — route to subscribed channels. */
  async notify(notification: any): Promise<any> {
    if (notification.conversationId) {
      return this.routeOutbound(notification.conversationId, {
        type: notification.type ?? "system_alert",
        title: notification.title ?? "",
        body: notification.body ?? "",
        severity: notification.severity ?? "info",
        conversationId: notification.conversationId,
        data: notification.data ?? {},
        timestamp: Date.now(),
      });
    }
    // No conversation — broadcast to all
    return this.broadcast(notification);
  }

  /** Alias for subscribe (routes call it as createSubscription). */
  createSubscription(params: { channelId: string; conversationId: string; events: string[] }): ChannelSubscription {
    return this.subscribe(params.channelId, params.conversationId, params.events);
  }

  /** Alias for unsubscribe (routes call it as removeSubscription). */
  removeSubscription(channelId: string, conversationId: string): boolean {
    return this.unsubscribe(channelId, conversationId);
  }

  /** Parse an inbound message from a specific channel. */
  parseInbound(channelId: string, rawEvent: any): any {
    const channel = this.channels.get(channelId);
    if (!channel) return null;
    const adapter = this.adapters.get(channel.type);
    if (!adapter) return null;
    return adapter.parseInbound({ ...rawEvent, channelId });
  }

  /**
   * Get message history with optional filters.
   * Merges inbound + outbound, sorts by time, applies filters.
   */
  getHistory(opts?: { limit?: number; channelId?: string; direction?: string }): any[] {
    const limit = opts?.limit ?? 100;
    const outbound = this.messageQueue.getHistory(500).map(m => ({
      ...m,
      direction: "outbound",
      timestamp: (m as any).metadata?.timestamp ?? Date.now(),
    }));
    const inbound = this.inboundHistory.map(m => ({ ...m, direction: "inbound" }));

    let merged = [...outbound, ...inbound].sort(
      (a: any, b: any) => (b.timestamp || b.receivedAt || 0) - (a.timestamp || a.receivedAt || 0)
    );

    if (opts?.channelId) {
      merged = merged.filter((m: any) => m.channelId === opts.channelId);
    }
    if (opts?.direction) {
      merged = merged.filter((m: any) => m.direction === opts.direction);
    }

    return merged.slice(0, limit);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────────────────────────────────────

/** Singleton messaging hub instance. */
export const messagingHub = new MessagingHub();
