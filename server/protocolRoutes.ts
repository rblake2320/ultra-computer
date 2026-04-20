/**
 * Protocol Routes — A2A, MCP, CLI, HTTP/Webhooks, Code/Transform
 *
 * Exposes API endpoints for the full protocol/skills system:
 *   - A2A (Agent-to-Agent) Protocol
 *   - MCP (Model Context Protocol)
 *   - CLI/Tool execution
 *   - HTTP requests & webhooks
 *   - Code interpretation & file transforms
 *
 * NOTE: Actual implementations (a2aProtocol.ts, mcpProtocol.ts, cliToolEngine.ts)
 * are loaded via dynamic import with try/catch to allow graceful fallback when
 * those modules haven't been created yet.
 */

import type { Express, Request, Response } from "express";
import { routesLogger } from "./logger.js";
import { v4 as uuidv4 } from "uuid";
import * as a2aProtocol from "./a2aProtocol.js";
import * as mcpProtocol from "./mcpProtocol.js";
import * as cliToolEngine from "./cliToolEngine.js";

// ─── In-memory registries (used for webhooks, agents, servers until persistence) ─

const webhookRegistry = new Map<string, { id: string; path: string; registeredAt: number; invocations: number }>();
/**
 * webhookHandlers is a stub registry for in-process webhook callbacks.
 * Real handler logic lives in cliToolEngine.webhookRegistry.
 * TODO: wire this up to cliToolEngine.webhookRegistry.dispatch() when needed.
 */
const webhookHandlers = new Map<string, (payload: any) => void>();

// ─── SSRF Protection Helpers —————————————————————————————————————————————————

/**
 * Returns true if the URL is valid and does NOT point to a private/loopback IP range.
 * Blocks: 10.*, 172.16-31.*, 192.168.*, 127.*, 169.254.* (SSRF protection).
 */
function isValidPublicUrl(urlStr: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "URL must use http:// or https://" };
  }
  const hostname = parsed.hostname;
  // Block loopback
  if (hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.")) {
    return { ok: false, reason: "Private/loopback addresses are not permitted" };
  }
  // Block link-local
  if (hostname.startsWith("169.254.")) {
    return { ok: false, reason: "Link-local addresses are not permitted" };
  }
  // Parse dotted-decimal IPv4 for private range checks
  const parts = hostname.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 10) return { ok: false, reason: "Private IP range 10.* is not permitted" };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: "Private IP range 172.16-31.* is not permitted" };
    if (a === 192 && b === 168) return { ok: false, reason: "Private IP range 192.168.* is not permitted" };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER ALL PROTOCOL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

export function registerProtocolRoutes(app: Express) {

  // ───────────────────────────────────────────────────────────────────────────
  // A2A PROTOCOL — Agent-to-Agent
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/protocols/a2a/card
   * Returns the Ultra Computer Agent Card JSON.
   */
  app.get("/api/protocols/a2a/card", async (_req: Request, res: Response) => {
    try {
            const card = await a2aProtocol.getAgentCard();
      res.json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /.well-known/agent-card.json
   * A2A standard discovery endpoint (mirrors /api/protocols/a2a/card).
   */
  app.get("/.well-known/agent-card.json", async (_req: Request, res: Response) => {
    try {
      const card = await a2aProtocol.getAgentCard();
      res.json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/a2a/rpc
   * JSON-RPC 2.0 endpoint — handles all A2A JSON-RPC method calls.
   */
  app.post("/api/protocols/a2a/rpc", async (req: Request, res: Response) => {
    try {
            const result = await a2aProtocol.handleA2ARequest(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id ?? null,
        error: { code: -32603, message: err.message },
      });
    }
  });

  /**
   * GET /api/protocols/a2a/agents
   * List all registered remote agents.
   */
  app.get("/api/protocols/a2a/agents", async (_req: Request, res: Response) => {
    try {
            const agents = await a2aProtocol.listRegisteredAgents();
      res.json(agents);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/a2a/agents/discover
   * Discover a remote agent by URL. Body: { url: string }
   */
  app.post("/api/protocols/a2a/agents/discover", async (req: Request, res: Response) => {
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url (string) is required" });
    }
    // SSRF protection: validate URL is public
    const urlCheck = isValidPublicUrl(url);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: `Invalid agent URL: ${urlCheck.reason}` });
    }
    try {
            const agent = await a2aProtocol.discoverAgent(url);
      res.json(agent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/a2a/agents/:id/send
   * Send a message to a specific remote agent.
   * :id must be the registered agent base URL.
   */
  app.post("/api/protocols/a2a/agents/:id/send", async (req: Request, res: Response) => {
    const { id } = req.params;
    // Verify id is a registered agent URL to prevent SSRF via arbitrary URLs
    const registeredAgent = a2aProtocol.getAgent(id);
    if (!registeredAgent) {
      return res.status(400).json({ error: "Agent URL is not registered. Discover it first via /api/protocols/a2a/agents/discover" });
    }
    // Also validate the URL itself
    const urlCheck = isValidPublicUrl(id);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: `Invalid agent URL: ${urlCheck.reason}` });
    }
    try {
            const result = await a2aProtocol.sendMessage(id, (req.body ?? {}).message || (req.body ?? {}), (req.body ?? {}).taskId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/protocols/a2a/agents/:id
   * Unregister a remote agent.
   */
  app.delete("/api/protocols/a2a/agents/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
            await a2aProtocol.unregisterAgent(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MCP PROTOCOL — Model Context Protocol
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/protocols/mcp/rpc
   * MCP JSON-RPC 2.0 server endpoint.
   */
  app.post("/api/protocols/mcp/rpc", async (req: Request, res: Response) => {
    try {
      // Enforce bearer token authentication for MCP server access
      if (!mcpProtocol.validateMCPAuthHeader(req.headers.authorization as string | undefined)) {
        return res.status(401).json({
          jsonrpc: "2.0",
          id: req.body?.id ?? null,
          error: { code: -32000, message: "Unauthorized: valid Bearer token required" },
        });
      }
      const result = await mcpProtocol.handleMCPRequest(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id ?? null,
        error: { code: -32603, message: err.message },
      });
    }
  });

  /**
   * GET /api/protocols/mcp/token
   * Retrieve the MCP bearer token for client configuration.
   */
  app.get("/api/protocols/mcp/token", (_req: Request, res: Response) => {
    res.json({ token: mcpProtocol.getMCPBearerToken() });
  });

  /**
   * GET /api/protocols/mcp/servers
   * List all connected MCP servers.
   */
  app.get("/api/protocols/mcp/servers", async (_req: Request, res: Response) => {
    try {
            const servers = await mcpProtocol.listConnectedServers();
      res.json(servers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/mcp/servers/connect
   * Connect to a remote MCP server. Body: { url, name, transport }
   */
  app.post("/api/protocols/mcp/servers/connect", async (req: Request, res: Response) => {
    const { url, name, transport } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url (string) is required" });
    }
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name (string) is required" });
    }
    const validTransports = ["streamable-http", "sse"];
    const resolvedTransport = validTransports.includes(transport) ? transport : "streamable-http";
    try {
            const server = await mcpProtocol.connectToServer({ url, name, transport: resolvedTransport });
      res.json(server);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/protocols/mcp/servers/:id
   * Disconnect / remove an MCP server connection.
   */
  app.delete("/api/protocols/mcp/servers/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
            await mcpProtocol.disconnectServer(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/protocols/mcp/servers/:id/tools
   * List tools from a connected MCP server.
   */
  app.get("/api/protocols/mcp/servers/:id/tools", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
            const tools = await mcpProtocol.listRemoteTools(id);
      res.json(tools);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/mcp/servers/:id/tools/:toolName/call
   * Call a specific tool on a connected MCP server.
   */
  app.post("/api/protocols/mcp/servers/:id/tools/:toolName/call", async (req: Request, res: Response) => {
    const { id, toolName } = req.params;
    try {
            const result = await mcpProtocol.callRemoteTool(id, toolName, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/protocols/mcp/servers/:id/resources
   * List resources from a connected MCP server.
   */
  app.get("/api/protocols/mcp/servers/:id/resources", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
            const resources = await mcpProtocol.listRemoteResources(id);
      res.json(resources);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/protocols/mcp/servers/:id/prompts
   * List prompts from a connected MCP server.
   */
  app.get("/api/protocols/mcp/servers/:id/prompts", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
            const prompts = await mcpProtocol.listRemotePrompts(id);
      res.json(prompts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CLI / TOOL ENGINE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/protocols/cli/execute
   * Execute a shell command. Body: { command, timeout?, workDir?, env? }
   */
  app.post("/api/protocols/cli/execute", async (req: Request, res: Response) => {
    const { command, timeout, workDir, env } = req.body ?? {};
    // Validate workDir is within the sandbox
    if (workDir !== undefined && typeof workDir === "string") {
      const resolvedWorkDir = require("path").resolve(workDir);
      const sandboxBase = require("path").resolve("/tmp/ultra-sandbox");
      if (!resolvedWorkDir.startsWith(sandboxBase)) {
        return res.status(400).json({ error: "workDir must be within the sandbox directory (/tmp/ultra-sandbox)" });
      }
    }
    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "command (string) is required" });
    }
    if (command.length > 10_000) {
      return res.status(400).json({ error: "command too long (max 10,000 chars)" });
    }
    try {
            const result = await cliToolEngine.executeCommand(command, { timeout, workDir, env });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/cli/script
   * Execute a script by language. Body: { script, language, args? }
   */
  app.post("/api/protocols/cli/script", async (req: Request, res: Response) => {
    const { script, language, args } = req.body ?? {};
    if (!script || typeof script !== "string") {
      return res.status(400).json({ error: "script (string) is required" });
    }
    if (!language || typeof language !== "string") {
      return res.status(400).json({ error: "language (string) is required" });
    }
    // Allowlist matches the SupportedLanguage type in cliToolEngine.ts
    const allowedLanguages: import("./cliToolEngine.js").SupportedLanguage[] = ["bash", "python3", "node", "typescript"];
    if (!allowedLanguages.includes(language as import("./cliToolEngine.js").SupportedLanguage)) {
      return res.status(400).json({ error: `language must be one of: ${allowedLanguages.join(", ")}` });
    }
    try {
            const result = await cliToolEngine.executeScript(script, language as import("./cliToolEngine.js").SupportedLanguage, args ?? []);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/cli/pipeline
   * Execute a pipeline of steps. Body: { steps: Array<{ command, language?, script? }> }
   */
  app.post("/api/protocols/cli/pipeline", async (req: Request, res: Response) => {
    const { steps } = req.body;
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: "steps (non-empty array) is required" });
    }
    if (steps.length > 50) {
      return res.status(400).json({ error: "too many pipeline steps (max 50)" });
    }
    try {
            const result = await cliToolEngine.executePipeline(steps);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/protocols/cli/tools
   * List installed CLI tools (auto-detected with version info).
   */
  app.get("/api/protocols/cli/tools", async (_req: Request, res: Response) => {
    try {
            const tools = await cliToolEngine.getInstalledTools();
      res.json(tools);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/cli/validate
   * Validate command safety. Body: { command }
   */
  app.post("/api/protocols/cli/validate", async (req: Request, res: Response) => {
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "command (string) is required" });
    }
    try {
            const result = await cliToolEngine.validateCommand(command);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // HTTP / WEBHOOK ROUTES
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/protocols/http/request
   * Execute an outbound HTTP request. Body: { url, method, headers?, body? }
   */
  app.post("/api/protocols/http/request", async (req: Request, res: Response) => {
    const { url, method, headers, body } = req.body ?? {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url (string) is required" });
    }
    // SSRF protection: block private/loopback IPs
    const urlCheck = isValidPublicUrl(url);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: `Blocked URL: ${urlCheck.reason}` });
    }
    const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    const resolvedMethod = (method || "GET").toUpperCase();
    if (!allowedMethods.includes(resolvedMethod)) {
      return res.status(400).json({ error: `method must be one of: ${allowedMethods.join(", ")}` });
    }
    try {
      // Basic implementation using built-in fetch
      const fetchOptions: RequestInit = {
        method: resolvedMethod,
        headers: { "Content-Type": "application/json", ...(headers || {}) },
      };
      if (body !== undefined && !["GET", "HEAD"].includes(resolvedMethod)) {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      fetchOptions.signal = controller.signal;

      const upstream = await fetch(url, fetchOptions);
      clearTimeout(timer);
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((v, k) => { responseHeaders[k] = v; });
      const text = await upstream.text();
      let responseBody: any = text;
      try { responseBody = JSON.parse(text); } catch { /* keep as string */ }

      res.json({
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
        body: responseBody,
        ok: upstream.ok,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/protocols/webhooks
   * List all registered webhooks.
   */
  app.get("/api/protocols/webhooks", (_req: Request, res: Response) => {
    const webhooks = Array.from(webhookRegistry.values());
    res.json(webhooks);
  });

  /**
   * POST /api/protocols/webhooks
   * Register a new webhook. Body: { path }
   * NOTE: id is always generated server-side; any caller-supplied id is ignored.
   */
  app.post("/api/protocols/webhooks", (req: Request, res: Response) => {
    const { path } = req.body ?? {};
    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "path (string) is required" });
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(path)) {
      return res.status(400).json({ error: "path must be alphanumeric with hyphens/underscores only" });
    }
    // Always generate webhook ID server-side, ignore any caller-supplied id
    const webhookId = uuidv4();
    const entry = { id: webhookId, path, registeredAt: Date.now(), invocations: 0 };
    webhookRegistry.set(webhookId, entry);
    res.json(entry);
  });

  /**
   * DELETE /api/protocols/webhooks/:id
   * Unregister a webhook.
   */
  app.delete("/api/protocols/webhooks/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!webhookRegistry.has(id)) {
      return res.status(404).json({ error: "Webhook not found" });
    }
    webhookRegistry.delete(id);
    webhookHandlers.delete(id);
    res.json({ ok: true });
  });

  /**
   * POST /api/webhooks/:id
   * Incoming webhook handler — proxies payload to registered handler.
   */
  app.post("/api/webhooks/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const entry = webhookRegistry.get(id);
    if (!entry) {
      return res.status(404).json({ error: "Webhook not registered" });
    }
    // Increment invocation counter
    entry.invocations += 1;
    webhookRegistry.set(id, entry);

    // Call registered handler if present
    const handler = webhookHandlers.get(id);
    if (handler) {
      try {
        handler(req.body);
      } catch (handlerErr: any) {
        routesLogger.error({ err: handlerErr, webhookId: id }, "Webhook handler error");
      }
    }

    routesLogger.info({ webhookId: id, invocations: entry.invocations }, "Received webhook payload");
    res.json({ ok: true, webhookId: id, invocations: entry.invocations });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CODE / TRANSFORM ROUTES
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/protocols/code/interpret
   * Code interpreter. Body: { code, language }
   */
  app.post("/api/protocols/code/interpret", async (req: Request, res: Response) => {
    const { code, language } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code (string) is required" });
    }
    if (!language || typeof language !== "string") {
      return res.status(400).json({ error: "language (string) is required" });
    }
    if (code.length > 100_000) {
      return res.status(400).json({ error: "code too long (max 100,000 chars)" });
    }
    try {
      const result = await cliToolEngine.executeCodeInterpreter(code, language);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/protocols/files/transform
   * File transform. Body: { inputPath, outputPath, transformType, options? }
   */
  app.post("/api/protocols/files/transform", async (req: Request, res: Response) => {
    const { inputPath, outputPath, transformType, options } = req.body;
    if (!inputPath || typeof inputPath !== "string") {
      return res.status(400).json({ error: "inputPath (string) is required" });
    }
    if (!outputPath || typeof outputPath !== "string") {
      return res.status(400).json({ error: "outputPath (string) is required" });
    }
    if (!transformType || typeof transformType !== "string") {
      return res.status(400).json({ error: "transformType (string) is required" });
    }
    try {
            const result = await cliToolEngine.executeFileTransform(inputPath, outputPath, transformType, options || {});
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // COMBINED DASHBOARD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/protocols/dashboard
   * Returns combined status of all protocol systems.
   */
  app.get("/api/protocols/dashboard", async (_req: Request, res: Response) => {
    const results = await Promise.allSettled([
      Promise.resolve(a2aProtocol.getAgentCard()).catch(() => null),
      Promise.resolve(a2aProtocol.listRegisteredAgents()).catch(() => []),
      Promise.resolve(mcpProtocol.listConnectedServers()).catch(() => []),
      Promise.resolve(cliToolEngine.getInstalledTools()).catch(() => []),
    ]);

    const [agentCardResult, remoteAgentsResult, mcpServersResult, cliToolsResult] = results;

    res.json({
      protocols: {
        a2a: {
          available: agentCardResult.status === "fulfilled" && agentCardResult.value !== undefined,
          agentCard: agentCardResult.status === "fulfilled" ? agentCardResult.value : null,
          remoteAgents: remoteAgentsResult.status === "fulfilled" ? (remoteAgentsResult.value ?? []) : [],
        },
        mcp: {
          available: mcpServersResult.status === "fulfilled" && mcpServersResult.value !== undefined,
          servers: mcpServersResult.status === "fulfilled" ? (mcpServersResult.value ?? []) : [],
        },
        cli: {
          available: cliToolsResult.status === "fulfilled" && cliToolsResult.value !== undefined,
          installedTools: cliToolsResult.status === "fulfilled" ? (cliToolsResult.value ?? []) : [],
        },
        http: {
          available: true,
          webhooks: Array.from(webhookRegistry.values()),
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  routesLogger.info("All protocol routes registered (A2A, MCP, CLI, HTTP/Webhooks, Code/Transform)");
}
