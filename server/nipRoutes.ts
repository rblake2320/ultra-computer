/**
 * NIP Routes — NLP Instruction Protocol
 *
 * Registers all API endpoints for the NIP system:
 *   - Session management (create, negotiate, list, get, stats)
 *   - Conversation (send/get messages)
 *   - Session control (pause, resume, terminate, complete)
 *   - Monitor alerts
 *   - Reports (generate + retrieve)
 *   - Access control (trusted parties + access validation)
 *   - SSE streams (global + per-session)
 *
 * AI-to-AI bidirectional natural language instruction sessions.
 */

import type { Express, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as nipEngine from "./nipEngine.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_ROLES = ["instructor", "executor", "monitor", "system"] as const;
type NIPRole = (typeof VALID_ROLES)[number];

const VALID_MESSAGE_TYPES = [
  "instruction",
  "feedback",
  "question",
  "acknowledgment",
  "status_update",
  "error_report",
  "capability_query",
  "capability_response",
  "task_boundary",
  "monitor_alert",
  "human_override",
] as const;
type NIPMessageType = (typeof VALID_MESSAGE_TYPES)[number];

const VALID_ACCESS_TIERS = ["public", "verified", "corporate", "private"] as const;
type NIPAccessTier = (typeof VALID_ACCESS_TIERS)[number];

const CONTENT_MAX_LEN = 50_000;

// ─── SSE Client Registry ──────────────────────────────────────────────────────

interface SseClient {
  id: string;
  sessionFilter: string | null; // null = global (all events)
  send: (event: object) => void;
}

const sseClients = new Map<string, SseClient>();

function broadcastSseEvent(event: object, sessionId?: string): void {
  for (const client of sseClients.values()) {
    // Global clients receive everything; session-filtered clients only receive
    // events that match their sessionId filter.
    if (client.sessionFilter === null || client.sessionFilter === sessionId) {
      client.send(event);
    }
  }
}

// Wire nipEngine EventEmitter events → SSE broadcast
function initSseBridge(): void {
  try {
    if (typeof nipEngine.nipEngine?.on !== "function") return;
    const emitter = nipEngine.nipEngine;

    const sessionEvents = [
      "session:created",
      "session:negotiated",
      "session:active",
      "session:paused",
      "session:completed",
      "session:terminated",
      "session:locked",
    ] as const;

    for (const eventName of sessionEvents) {
      emitter.on(eventName, (data: any) => {
        broadcastSseEvent({ type: eventName, ...data, ts: Date.now() }, data?.id ?? data?.sessionId);
      });
    }

    emitter.on("message:sent", (data: any) => {
      broadcastSseEvent({ type: "message:sent", ...data, ts: Date.now() }, data?.sessionId);
    });

    emitter.on("monitor:alert", (data: any) => {
      broadcastSseEvent({ type: "monitor:alert", ...data, ts: Date.now() }, data?.sessionId);
    });

    emitter.on("report:generated", (data: any) => {
      broadcastSseEvent({ type: "report:generated", ...data, ts: Date.now() }, data?.sessionId ?? data?.id);
    });
  } catch {
    // nipEngine may not expose an EventEmitter in all environments; SSE
    // still works for events pushed directly via route calls.
  }
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

function requireString(value: unknown, field: string, maxLen = 200): string | null {
  if (typeof value !== "string") return `${field} must be a string`;
  if (value.trim().length === 0) return `${field} is required`;
  if (value.length > maxLen) return `${field} must be at most ${maxLen} characters`;
  return null;
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): string | null {
  if (!allowed.includes(value as T)) {
    return `${field} must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerNIPRoutes(app: Express): void {
  // Wire SSE bridge once at startup
  initSseBridge();

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/nip/sessions
   * Create a new NIP session.
   * Body: { instructorProfile, executorProfile, taskScope?, accessTier? }
   */
  app.post("/api/nip/sessions", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const { instructorProfile, executorProfile, taskScope, accessTier } = body;

    if (!instructorProfile || typeof instructorProfile !== "object" || Array.isArray(instructorProfile)) {
      return res.status(400).json({ error: "instructorProfile (object) is required" });
    }
    if (!executorProfile || typeof executorProfile !== "object" || Array.isArray(executorProfile)) {
      return res.status(400).json({ error: "executorProfile (object) is required" });
    }
    if (accessTier !== undefined) {
      const err = requireEnum(accessTier, "accessTier", VALID_ACCESS_TIERS);
      if (err) return res.status(400).json({ error: err });
    }

    try {
      const session = nipEngine.nipEngine.createSession(
        instructorProfile,
        executorProfile,
        taskScope ?? null,
        (accessTier as NIPAccessTier) ?? "public"
      );
      res.status(201).json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to create session" });
    }
  });

  /**
   * GET /api/nip/sessions/stats
   * Get aggregate session statistics.
   * NOTE: This route MUST be registered before /:id to avoid "stats" being
   * captured as an id parameter.
   */
  app.get("/api/nip/sessions/stats", (_req: Request, res: Response) => {
    try {
      const stats = nipEngine.nipEngine.getSessionStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch stats" });
    }
  });

  /**
   * GET /api/nip/sessions
   * List sessions with optional filters.
   * Query: ?state=active&organizationId=xxx&from=timestamp&to=timestamp
   */
  app.get("/api/nip/sessions", (req: Request, res: Response) => {
    try {
      const { state, organizationId, from, to } = req.query as Record<string, string | undefined>;

      const filters: Record<string, any> = {};
      if (state) filters.state = state;
      if (organizationId) filters.organizationId = organizationId;
      if (from) {
        const fromTs = Number(from);
        if (isNaN(fromTs)) return res.status(400).json({ error: "from must be a numeric timestamp" });
        filters.from = fromTs;
      }
      if (to) {
        const toTs = Number(to);
        if (isNaN(toTs)) return res.status(400).json({ error: "to must be a numeric timestamp" });
        filters.to = toTs;
      }

      const sessions = nipEngine.nipEngine.getSessions(Object.keys(filters).length ? filters : undefined);
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to list sessions" });
    }
  });

  /**
   * GET /api/nip/sessions/:id
   * Get a single session by ID.
   */
  app.get("/api/nip/sessions/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.getSession(id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch session" });
    }
  });

  /**
   * POST /api/nip/sessions/:id/negotiate
   * Negotiate and activate a session.
   */
  app.post("/api/nip/sessions/:id/negotiate", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.negotiateSession(id);
      res.json(session);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to negotiate session" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/nip/sessions/:id/messages
   * Send a message in a session.
   * Body: { role, type, content, metadata? }
   */
  app.post("/api/nip/sessions/:id/messages", (req: Request, res: Response) => {
    const { id } = req.params;
    const { role, type, content, metadata } = req.body;

    const roleErr = requireEnum(role, "role", VALID_ROLES);
    if (roleErr) return res.status(400).json({ error: roleErr });

    const typeErr = requireEnum(type, "type", VALID_MESSAGE_TYPES);
    if (typeErr) return res.status(400).json({ error: typeErr });

    const contentErr = requireString(content, "content", CONTENT_MAX_LEN);
    if (contentErr) return res.status(400).json({ error: contentErr });

    if (metadata !== undefined && (typeof metadata !== "object" || Array.isArray(metadata))) {
      return res.status(400).json({ error: "metadata must be an object" });
    }

    try {
      const message = nipEngine.nipEngine.sendMessage(
        id,
        role as NIPRole,
        type as NIPMessageType,
        content,
        metadata ?? undefined
      );
      res.status(201).json(message);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to send message" });
    }
  });

  /**
   * GET /api/nip/sessions/:id/messages
   * Get the full conversation for a session.
   */
  app.get("/api/nip/sessions/:id/messages", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.getSession(id);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const conversation = nipEngine.nipEngine.getConversation(id);
      res.json(conversation);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch conversation" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/nip/sessions/:id/pause
   * Pause an active session.
   * Body: { reason }
   */
  app.post("/api/nip/sessions/:id/pause", (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body ?? {};

    const reasonErr = requireString(reason, "reason", 1000);
    if (reasonErr) return res.status(400).json({ error: reasonErr });

    try {
      const session = nipEngine.nipEngine.pauseSession(id, reason);
      res.json(session);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to pause session" });
    }
  });

  /**
   * POST /api/nip/sessions/:id/resume
   * Resume a paused session.
   */
  app.post("/api/nip/sessions/:id/resume", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.resumeSession(id);
      res.json(session);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to resume session" });
    }
  });

  /**
   * POST /api/nip/sessions/:id/terminate
   * Kill switch — forcibly terminate a session.
   * Body: { reason }
   */
  app.post("/api/nip/sessions/:id/terminate", (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body ?? {};

    const reasonErr = requireString(reason, "reason", 1000);
    if (reasonErr) return res.status(400).json({ error: reasonErr });

    try {
      const session = nipEngine.nipEngine.terminateSession(id, reason);
      res.json(session);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to terminate session" });
    }
  });

  /**
   * POST /api/nip/sessions/:id/complete
   * Mark a session as successfully completed.
   */
  app.post("/api/nip/sessions/:id/complete", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.completeSession(id);
      res.json(session);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to complete session" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MONITOR ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/nip/alerts
   * Get all alerts, optionally filtered by sessionId.
   * Query: ?sessionId=xxx
   */
  app.get("/api/nip/alerts", (req: Request, res: Response) => {
    const { sessionId } = req.query as Record<string, string | undefined>;
    try {
      const alerts = nipEngine.nipEngine.getAlerts(sessionId ?? undefined);
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch alerts" });
    }
  });

  /**
   * GET /api/nip/sessions/:id/alerts
   * Get alerts for a specific session.
   */
  app.get("/api/nip/sessions/:id/alerts", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.getSession(id);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const alerts = nipEngine.nipEngine.getAlerts(id);
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch alerts" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/nip/sessions/:id/report
   * Generate a report for a session.
   */
  app.post("/api/nip/sessions/:id/report", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.getSession(id);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const report = nipEngine.nipEngine.generateReport(id);
      res.status(201).json(report);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to generate report" });
    }
  });

  /**
   * GET /api/nip/sessions/:id/report
   * Get an existing report for a session.
   */
  app.get("/api/nip/sessions/:id/report", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const session = nipEngine.nipEngine.getSession(id);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const report = nipEngine.nipEngine.getReport(id);
      res.json(report ?? null);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch report" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS CONTROL — TRUSTED PARTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/nip/trusted-parties
   * Register a new trusted party.
   * Body: { organizationId, organizationName, accessTier, allowedScopes, maxConcurrentSessions }
   */
  app.post("/api/nip/trusted-parties", (req: Request, res: Response) => {
    const { organizationId, organizationName, accessTier, allowedScopes, maxConcurrentSessions } = req.body;

    const orgIdErr = requireString(organizationId, "organizationId");
    if (orgIdErr) return res.status(400).json({ error: orgIdErr });

    const orgNameErr = requireString(organizationName, "organizationName");
    if (orgNameErr) return res.status(400).json({ error: orgNameErr });

    const tierErr = requireEnum(accessTier, "accessTier", VALID_ACCESS_TIERS);
    if (tierErr) return res.status(400).json({ error: tierErr });

    if (!Array.isArray(allowedScopes) || allowedScopes.length === 0) {
      return res.status(400).json({ error: "allowedScopes must be a non-empty array" });
    }
    if (allowedScopes.some((s: any) => typeof s !== "string")) {
      return res.status(400).json({ error: "each allowedScope must be a string" });
    }

    if (maxConcurrentSessions !== undefined) {
      if (typeof maxConcurrentSessions !== "number" || !Number.isInteger(maxConcurrentSessions) || maxConcurrentSessions < 1) {
        return res.status(400).json({ error: "maxConcurrentSessions must be a positive integer" });
      }
    }

    try {
      const party = nipEngine.nipEngine.registerTrustedParty({
        organizationId,
        organizationName,
        accessTier: accessTier as NIPAccessTier,
        allowedScopes,
        maxConcurrentSessions: maxConcurrentSessions ?? 10,
      });
      res.status(201).json(party);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to register trusted party" });
    }
  });

  /**
   * GET /api/nip/trusted-parties
   * List all registered trusted parties.
   */
  app.get("/api/nip/trusted-parties", (_req: Request, res: Response) => {
    try {
      const parties = nipEngine.nipEngine.getTrustedParties();
      res.json(parties);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to list trusted parties" });
    }
  });

  /**
   * POST /api/nip/trusted-parties/:id/approve
   * Approve a pending trusted party.
   * Body: { approvedBy }
   */
  app.post("/api/nip/trusted-parties/:id/approve", (req: Request, res: Response) => {
    const { id } = req.params;
    const { approvedBy } = req.body;

    const approvedByErr = requireString(approvedBy, "approvedBy");
    if (approvedByErr) return res.status(400).json({ error: approvedByErr });

    try {
      const party = nipEngine.nipEngine.approveTrustedParty(id, approvedBy);
      res.json(party);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to approve trusted party" });
    }
  });

  /**
   * POST /api/nip/trusted-parties/:id/revoke
   * Revoke access for a trusted party.
   */
  app.post("/api/nip/trusted-parties/:id/revoke", (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      nipEngine.nipEngine.revokeTrustedParty(id);
      res.json({ ok: true });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to revoke trusted party" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/nip/access/validate
   * Check whether an organization has access to a requested scope.
   * Body: { organizationId, requestedScope }
   */
  app.post("/api/nip/access/validate", (req: Request, res: Response) => {
    const { organizationId, requestedScope } = req.body ?? {};

    const orgIdErr = requireString(organizationId, "organizationId");
    if (orgIdErr) return res.status(400).json({ error: orgIdErr });

    const scopeErr = requireString(requestedScope, "requestedScope");
    if (scopeErr) return res.status(400).json({ error: scopeErr });

    try {
      const result = nipEngine.nipEngine.validateAccess(organizationId, requestedScope);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to validate access" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SSE STREAMS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/nip/stream
   * Global SSE stream — emits all NIP engine events.
   * Events: session:*, message:sent, monitor:alert, report:generated
   */
  app.get("/api/nip/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const clientId = uuidv4();

    const send = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const client: SseClient = { id: clientId, sessionFilter: null, send };
    sseClients.set(clientId, client);

    // Send initial connected event
    send({ type: "connected", clientId, scope: "global", ts: Date.now() });

    // Keep-alive ping every 15 seconds
    const ping = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);

    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(clientId);
    });
  });

  /**
   * GET /api/nip/sessions/:id/stream
   * Per-session SSE stream — only emits events for the specified session.
   */
  app.get("/api/nip/sessions/:id/stream", (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify session exists before opening a stream
    try {
      const session = nipEngine.nipEngine.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message ?? "Failed to verify session" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const clientId = uuidv4();

    const send = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const client: SseClient = { id: clientId, sessionFilter: id, send };
    sseClients.set(clientId, client);

    // Send initial connected event
    send({ type: "connected", clientId, scope: "session", sessionId: id, ts: Date.now() });

    // Keep-alive ping every 15 seconds
    const ping = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);

    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(clientId);
    });
  });

  console.log("[nip] All NIP routes registered (sessions, conversation, control, alerts, reports, access, SSE)");
}
