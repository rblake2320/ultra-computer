import type { Express, Request, Response } from "express";
import { listBrowserSessions, getBrowserSessionInfo, executeBrowserTool, takeSessionScreenshot } from "./browserTool.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";
import { sanitizeToolArgsForExposure } from "./redaction.js";

function enforceToolPolicy(res: Response, tool: string, metadata: Record<string, unknown>): boolean {
  const context = { domain: "tool" as const, action: "tool:execute", tool, metadata };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) {
    res.status(403).json({ error: `Policy denied: ${decision.reason}` });
    return false;
  }
  return true;
}

export function registerBrowserRoutes(app: Express) {

  // ─── GET /api/browser/sessions ────────────────────────────────────────────
  // List all active browser sessions
  app.get("/api/browser/sessions", async (_req: Request, res: Response) => {
    try {
      const keys = await listBrowserSessions();
      const sessionResults = await Promise.all(
        keys.map(async (key) => {
          const info = await getBrowserSessionInfo(key);
          if (!info) return null;
          return {
            key,
            url: info.url,
            title: info.title,
            viewport: info.viewport,
          };
        })
      );
      const sessions = sessionResults.filter((s) => s !== null);
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/browser/navigate ───────────────────────────────────────────
  // Navigate to a URL in a session
  app.post("/api/browser/navigate", async (req: Request, res: Response) => {
    try {
      const { url, session, wait_for, screenshot, extract_text } = req.body;
      if (!url) return res.status(400).json({ error: "url is required" });

      const urlStr = String(url);
      if (urlStr.length > 2000) return res.status(400).json({ error: "url exceeds 2000 character limit" });
      try {
        const parsed = new URL(urlStr);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return res.status(400).json({ error: `URL scheme '${parsed.protocol}' is not allowed` });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      const args: Record<string, string> = { url: urlStr };
      if (session !== undefined) args.session = String(session);
      if (wait_for !== undefined) args.wait_for = String(wait_for);
      if (screenshot !== undefined) args.screenshot = String(screenshot);
      if (extract_text !== undefined) args.extract_text = String(extract_text);

      if (!enforceToolPolicy(res, "browse_url", args)) return;
      const networkContext = { domain: "network" as const, action: "network:browse", tool: "browse_url", url: urlStr, method: "GET", metadata: args };
      const networkDecision = evaluatePolicy(networkContext);
      writePolicyAudit(networkContext, networkDecision);
      if (!networkDecision.allowed) return res.status(403).json({ error: `Policy denied: ${networkDecision.reason}` });

      const result = await executeBrowserTool("browse_url", args);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/browser/action ─────────────────────────────────────────────
  // Perform a browser action (click, type, scroll, select, screenshot)
  app.post("/api/browser/action", async (req: Request, res: Response) => {
    try {
      const { action, selector, value, direction, session } = req.body;
      if (!action) return res.status(400).json({ error: "action is required" });

      const args: Record<string, string> = { action: String(action) };
      if (selector !== undefined) args.selector = String(selector);
      if (value !== undefined) args.value = String(value);
      if (direction !== undefined) args.direction = String(direction);
      if (session !== undefined) args.session = String(session);

      if (!enforceToolPolicy(res, "browser_action", sanitizeToolArgsForExposure("browser_action", args))) return;
      const result = await executeBrowserTool("browser_action", args);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/browser/evaluate ───────────────────────────────────────────
  // Execute JavaScript in the page
  app.post("/api/browser/evaluate", async (req: Request, res: Response) => {
    try {
      const { script, session } = req.body;
      if (!script) return res.status(400).json({ error: "script is required" });

      const scriptStr = String(script);
      if (scriptStr.length > 100000) return res.status(400).json({ error: "script exceeds 100000 character limit" });

      const args: Record<string, string> = { script: scriptStr };
      if (session !== undefined) args.session = String(session);

      if (!enforceToolPolicy(res, "browser_evaluate", { ...args, script: "[browser script]" })) return;
      const result = await executeBrowserTool("browser_evaluate", args);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/browser/screenshot/:session ─────────────────────────────────
  // Get a live screenshot of a session as PNG
  app.get("/api/browser/screenshot/:session", async (req: Request, res: Response) => {
    try {
      const sessionKey = (req.params.session as string);
      if (!enforceToolPolicy(res, "browser_action", { action: "screenshot", session: sessionKey })) return;
      const png = await takeSessionScreenshot(sessionKey);
      if (!png) return res.status(404).json({ error: "No active session found" });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", png.length);
      res.end(png);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/browser/resize ─────────────────────────────────────────────
  // Resize the browser viewport
  app.post("/api/browser/resize", async (req: Request, res: Response) => {
    try {
      const { width, height, device, session } = req.body;

      const args: Record<string, string> = {};
      if (width !== undefined) args.width = String(width);
      if (height !== undefined) args.height = String(height);
      if (device !== undefined) args.device = String(device);
      if (session !== undefined) args.session = String(session);

      if (!enforceToolPolicy(res, "browser_resize", args)) return;
      const result = await executeBrowserTool("browser_resize", args);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── DELETE /api/browser/sessions/:session ────────────────────────────────
  // Close a browser session
  app.delete("/api/browser/sessions/:session", async (req: Request, res: Response) => {
    try {
      const sessionKey = (req.params.session as string);
      if (!enforceToolPolicy(res, "browser_close", { session: sessionKey })) return;
      const result = await executeBrowserTool("browser_close", { session: sessionKey });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
