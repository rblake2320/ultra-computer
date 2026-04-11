/**
 * Browser Automation Tool
 * Playwright-based headless browser tool that worker agents can invoke.
 * Provides browse_url (navigate + screenshot + text extraction) and
 * browser_action (click, type, scroll, select, screenshot) tools.
 *
 * Playwright is dynamically imported so the server starts normally even
 * when the playwright package or browser binaries are not installed.
 */

import fs from "fs";
import path from "path";
import type { ToolSchema, ToolResult } from "./tools.js";

// ─── Sandbox directories ──────────────────────────────────────────────────────

const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
const SCREENSHOTS_DIR = path.join(SANDBOX_DIR, "screenshots");

function ensureDirs() {
  if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ─── Playwright singletons ────────────────────────────────────────────────────

// One shared browser instance; pages are tracked per "session" key.
// Session key = conversationId or any caller-supplied string (falls back to "default").
let _browser: any | null = null;
const _pages: Map<string, any> = new Map(); // sessionKey → playwright Page
const _contexts: Map<string, any> = new Map(); // sessionKey → playwright BrowserContext
const _pendingPages: Map<string, Promise<any>> = new Map(); // serialize concurrent getPage for same key

let _playwrightAvailable: boolean | null = null; // cached availability check

async function getPlaywright(): Promise<any | null> {
  if (_playwrightAvailable === false) return null;
  try {
    const pw = await import("playwright");
    _playwrightAvailable = true;
    return pw;
  } catch {
    _playwrightAvailable = false;
    return null;
  }
}

async function getBrowser(): Promise<any> {
  const pw = await getPlaywright();
  if (!pw) throw new Error("Playwright not installed. Run: npx playwright install chromium");

  if (!_browser || !_browser.isConnected()) {
    _browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return _browser;
}

async function getPage(sessionKey: string): Promise<any> {
  // Serialize concurrent getPage calls for the same session to avoid race conditions
  const pending = _pendingPages.get(sessionKey);
  if (pending) return pending;

  const creation = _getPageInternal(sessionKey);
  _pendingPages.set(sessionKey, creation);
  try {
    const page = await creation;
    return page;
  } finally {
    _pendingPages.delete(sessionKey);
  }
}

async function _getPageInternal(sessionKey: string): Promise<any> {
  // Return existing open page for this session, or create a new one.
  const existing = _pages.get(sessionKey);
  if (existing) {
    try {
      // Check the page is still usable by reading its URL (throws if closed).
      existing.url();
      return existing;
    } catch {
      _pages.delete(sessionKey);
      _contexts.delete(sessionKey);
    }
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  _pages.set(sessionKey, page);
  _contexts.set(sessionKey, context);
  return page;
}

async function closePage(sessionKey: string): Promise<void> {
  const context = _contexts.get(sessionKey);
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
    _contexts.delete(sessionKey);
  }
  _pages.delete(sessionKey);
}

// ─── Tool Schemas ─────────────────────────────────────────────────────────────

export const BROWSER_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: "browse_url",
    description:
      "Navigate a headless browser to a URL. Optionally wait for a CSS selector to appear, capture a full-page screenshot, and/or extract the visible text of the page body. Useful for reading dynamic JavaScript-rendered pages, verifying UI state, or gathering content that a plain HTTP fetch cannot retrieve. Returns extracted text and/or the screenshot file path.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full HTTP or HTTPS URL to navigate to. Example: 'https://example.com'",
        },
        wait_for: {
          type: "string",
          description:
            "Optional CSS selector to wait for before capturing the page. The tool waits up to 10 seconds for this element. Example: '#main-content' or '.results-list'",
        },
        screenshot: {
          type: "string",
          description: "If 'true', capture a full-page screenshot and save it to sandbox/screenshots/. Returns the file path.",
          enum: ["true", "false"],
        },
        extract_text: {
          type: "string",
          description: "If 'true' (default), extract and return the visible text content of the page body.",
          enum: ["true", "false"],
        },
        session: {
          type: "string",
          description:
            "Optional session key to share the browser page across multiple calls (e.g. for multi-step interactions). Defaults to 'default'.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_action",
    description:
      "Perform an interactive action on the currently open browser page for a session: click an element, type text into a field, scroll the page, select a dropdown option, or take a screenshot. Must be preceded by a browse_url call that established the session.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action to perform.",
          enum: ["click", "type", "scroll", "select", "screenshot"],
        },
        selector: {
          type: "string",
          description:
            "CSS selector for the target element. Required for 'click', 'type', and 'select' actions. Example: '#submit-button' or 'input[name=\"email\"]'",
        },
        value: {
          type: "string",
          description:
            "For 'type': the text to type into the element. For 'select': the option value or visible label to select.",
        },
        direction: {
          type: "string",
          description: "For 'scroll' action: scroll direction. Defaults to 'down'.",
          enum: ["up", "down"],
        },
        session: {
          type: "string",
          description: "Session key matching the browse_url call that opened the page. Defaults to 'default'.",
        },
      },
      required: ["action"],
    },
  },
];

// ─── Extra Tool Schemas ───────────────────────────────────────────────────────

const ADVANCED_BROWSER_SCHEMAS: ToolSchema[] = [
  {
    name: "browser_evaluate",
    description:
      "Execute arbitrary JavaScript in the current browser page and return the result. Useful for extracting structured data (tables, lists, metadata), measuring DOM properties, or manipulating the page before taking a screenshot. The script runs in the page context with full DOM access.",
    parameters: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description:
            'JavaScript code to evaluate in the page. Must be an expression or IIFE that returns a value. Example: `document.querySelectorAll("h2").length` or `(() => { return Array.from(document.querySelectorAll("a")).map(a => ({text: a.textContent, href: a.href})); })()`',
        },
        session: {
          type: "string",
          description: "Session key matching a prior browse_url call. Defaults to 'default'.",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "browser_pdf",
    description:
      "Save the current browser page as a PDF file. Useful for archiving web pages, generating reports, or capturing full-page content including off-screen elements.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Output filename (without path). Defaults to 'page_<timestamp>.pdf'.",
        },
        session: {
          type: "string",
          description: "Session key. Defaults to 'default'.",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_wait",
    description:
      "Wait for a specific condition on the current page: a CSS selector to appear, text to become visible, a URL pattern to match, or a fixed number of milliseconds. Useful between actions to ensure the page has transitioned.",
    parameters: {
      type: "object",
      properties: {
        condition: {
          type: "string",
          description: "What to wait for.",
          enum: ["selector", "text", "url", "timeout"],
        },
        value: {
          type: "string",
          description:
            "For 'selector': a CSS selector. For 'text': text that must appear on the page. For 'url': a substring the URL must contain. For 'timeout': milliseconds (max 30000).",
        },
        timeout_ms: {
          type: "string",
          description: "Max wait time in ms. Defaults to '10000'.",
        },
        session: {
          type: "string",
          description: "Session key. Defaults to 'default'.",
        },
      },
      required: ["condition", "value"],
    },
  },
  {
    name: "browser_resize",
    description:
      "Resize the browser viewport. Useful for testing responsive layouts or simulating mobile/tablet/desktop viewports.",
    parameters: {
      type: "object",
      properties: {
        width: { type: "string", description: "Viewport width in pixels. Example: '375' for mobile, '768' for tablet, '1280' for desktop." },
        height: { type: "string", description: "Viewport height in pixels. Example: '812' for iPhone, '1024' for tablet." },
        device: {
          type: "string",
          description: "Preset device. Overrides width/height.",
          enum: ["mobile", "tablet", "desktop"],
        },
        session: { type: "string", description: "Session key. Defaults to 'default'." },
      },
      required: [],
    },
  },
  {
    name: "browser_close",
    description: "Close the browser session and release its resources. Call when browsing is complete.",
    parameters: {
      type: "object",
      properties: {
        session: { type: "string", description: "Session key to close. Defaults to 'default'." },
      },
      required: [],
    },
  },
];

// Merge all browser schemas into the public export
BROWSER_TOOL_SCHEMAS.push(...ADVANCED_BROWSER_SCHEMAS);

// ─── Device presets ───────────────────────────────────────────────────────────

const DEVICE_PRESETS: Record<string, { width: number; height: number }> = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function executeBrowserTool(
  name: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const start = Date.now();

  switch (name) {
    case "browse_url":
      return executeBrowseUrl(args, start);
    case "browser_action":
      return executeBrowserAction(args, start);
    case "browser_evaluate":
      return executeBrowserEvaluate(args, start);
    case "browser_pdf":
      return executeBrowserPdf(args, start);
    case "browser_wait":
      return executeBrowserWait(args, start);
    case "browser_resize":
      return executeBrowserResize(args, start);
    case "browser_close":
      return executeBrowserClose(args, start);
    default:
      return {
        success: false,
        output: "",
        error: `Unknown browser tool: ${name}`,
        durationMs: Date.now() - start,
      };
  }
}

// ─── browse_url ───────────────────────────────────────────────────────────────

async function executeBrowseUrl(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { url, wait_for, session = "default" } = args;
  const shouldScreenshot = args.screenshot === "true";
  // extract_text defaults to true unless explicitly set to false
  const shouldExtractText = args.extract_text !== "false";

  if (!url) {
    return { success: false, output: "", error: "No URL provided", durationMs: Date.now() - start };
  }

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    return { success: false, output: "", error: "Invalid URL format", durationMs: Date.now() - start };
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { success: false, output: "", error: `URL scheme '${parsedUrl.protocol}' is not allowed. Only http: and https: are permitted.`, durationMs: Date.now() - start };
  }

  let page: any;
  try {
    page = await getPage(session);
  } catch (err: any) {
    // Playwright not installed or browser launch failed
    if (err.message?.includes("Playwright not installed")) {
      return {
        success: false,
        output: "",
        error: "Playwright not installed. Run: npx playwright install chromium",
        durationMs: Date.now() - start,
      };
    }
    return { success: false, output: "", error: `Browser launch failed: ${err.message}`, durationMs: Date.now() - start };
  }

  try {
    // Navigate with 30-second timeout
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Optionally wait for a selector
    if (wait_for) {
      try {
        await page.waitForSelector(wait_for, { timeout: 10_000 });
      } catch {
        // Non-fatal — proceed even if the selector never appeared
      }
    }

    const outputParts: string[] = [];
    const artifacts: { path: string; type: string }[] = [];

    outputParts.push(`Navigated to: ${page.url()}`);
    outputParts.push(`Title: ${await page.title()}`);

    // Screenshot
    if (shouldScreenshot) {
      ensureDirs();
      const filename = `screenshot_${Date.now()}.png`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const relPath = path.relative(SANDBOX_DIR, screenshotPath);
      outputParts.push(`Screenshot saved to: screenshots/${filename}`);
      artifacts.push({ path: screenshotPath, type: "image/png" });
    }

    // Extract text
    if (shouldExtractText) {
      const bodyText: string = await page.evaluate(() => {
        const body = document.body;
        if (!body) return "";
        // Remove hidden elements and scripts/styles before extracting text
        const clone = body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script,style,noscript,head").forEach((el) => el.remove());
        return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
      });
      const capped = bodyText.length > 20_000
        ? bodyText.slice(0, 20_000) + "\n[Truncated — showing first 20,000 characters]"
        : bodyText;
      outputParts.push("\n--- Page Text ---");
      outputParts.push(capped);
    }

    return {
      success: true,
      output: outputParts.join("\n"),
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    await closePage(session);
    return {
      success: false,
      output: "",
      error: `Browser navigation failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── browser_action ───────────────────────────────────────────────────────────

async function executeBrowserAction(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { action, selector, value, direction = "down", session = "default" } = args;

  if (!action) {
    return { success: false, output: "", error: "No action provided", durationMs: Date.now() - start };
  }

  const page = _pages.get(session);
  if (!page) {
    return {
      success: false,
      output: "",
      error: `No active browser session '${session}'. Call browse_url first to open a page.`,
      durationMs: Date.now() - start,
    };
  }

  // Verify page is still alive
  try { page.url(); } catch {
    _pages.delete(session);
    return {
      success: false,
      output: "",
      error: `Browser session '${session}' is no longer active. Call browse_url to reopen.`,
      durationMs: Date.now() - start,
    };
  }

  try {
    switch (action) {
      case "click": {
        if (!selector) {
          return { success: false, output: "", error: "selector is required for click action", durationMs: Date.now() - start };
        }
        await page.waitForSelector(selector, { timeout: 10_000 });
        await page.click(selector);
        // Short pause to let the page react
        await page.waitForTimeout(500);
        return {
          success: true,
          output: `Clicked element: ${selector}\nCurrent URL: ${page.url()}`,
          durationMs: Date.now() - start,
        };
      }

      case "type": {
        if (!selector) {
          return { success: false, output: "", error: "selector is required for type action", durationMs: Date.now() - start };
        }
        if (value === undefined || value === null) {
          return { success: false, output: "", error: "value is required for type action", durationMs: Date.now() - start };
        }
        await page.waitForSelector(selector, { timeout: 10_000 });
        await page.click(selector);
        await page.fill(selector, value);
        return {
          success: true,
          output: `Typed into ${selector}: "${value}"`,
          durationMs: Date.now() - start,
        };
      }

      case "scroll": {
        const scrollAmount = 600;
        const scrollY = direction === "up" ? -scrollAmount : scrollAmount;
        await page.evaluate((dy: number) => window.scrollBy(0, dy), scrollY);
        await page.waitForTimeout(300);
        const scrollPos: number = await page.evaluate(() => window.scrollY);
        return {
          success: true,
          output: `Scrolled ${direction}. Current scroll position: ${scrollPos}px from top.`,
          durationMs: Date.now() - start,
        };
      }

      case "select": {
        if (!selector) {
          return { success: false, output: "", error: "selector is required for select action", durationMs: Date.now() - start };
        }
        if (value === undefined || value === null) {
          return { success: false, output: "", error: "value is required for select action", durationMs: Date.now() - start };
        }
        await page.waitForSelector(selector, { timeout: 10_000 });
        // Try selecting by value first, then by label
        let selected: string[] = [];
        try {
          selected = await page.selectOption(selector, { value });
        } catch {
          selected = await page.selectOption(selector, { label: value });
        }
        return {
          success: true,
          output: `Selected option '${value}' in ${selector}. Selected values: ${selected.join(", ")}`,
          durationMs: Date.now() - start,
        };
      }

      case "screenshot": {
        ensureDirs();
        const filename = `screenshot_${Date.now()}.png`;
        const screenshotPath = path.join(SCREENSHOTS_DIR, filename);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        return {
          success: true,
          output: `Screenshot saved to: screenshots/${filename}\nCurrent URL: ${page.url()}`,
          artifacts: [{ path: screenshotPath, type: "image/png" }],
          durationMs: Date.now() - start,
        };
      }

      default:
        return {
          success: false,
          output: "",
          error: `Unknown action '${action}'. Valid actions: click, type, scroll, select, screenshot`,
          durationMs: Date.now() - start,
        };
    }
  } catch (err: any) {
    // Gracefully close the page on unrecoverable errors
    if (err.message?.includes("Target closed") || err.message?.includes("Session closed")) {
      await closePage(session);
    }
    return {
      success: false,
      output: "",
      error: `browser_action '${action}' failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── browser_evaluate ─────────────────────────────────────────────────────────

async function executeBrowserEvaluate(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { script, session = "default" } = args;

  if (!script) {
    return { success: false, output: "", error: "No script provided", durationMs: Date.now() - start };
  }

  const page = _pages.get(session);
  if (!page) {
    return {
      success: false,
      output: "",
      error: `No active browser session '${session}'. Call browse_url first.`,
      durationMs: Date.now() - start,
    };
  }

  try {
    // Wrap the script in a function if it's not already an expression
    const result = await page.evaluate(script);
    const serialized = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    const capped = serialized && serialized.length > 50_000
      ? serialized.slice(0, 50_000) + "\n[Truncated — showing first 50,000 characters]"
      : serialized || "undefined";
    return {
      success: true,
      output: `Evaluated JS on ${page.url()}\n\nResult:\n${capped}`,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      output: "",
      error: `browser_evaluate failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── browser_pdf ──────────────────────────────────────────────────────────────

async function executeBrowserPdf(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { session = "default" } = args;
  const filename = path.basename(args.filename || `page_${Date.now()}.pdf`);

  const page = _pages.get(session);
  if (!page) {
    return {
      success: false,
      output: "",
      error: `No active browser session '${session}'. Call browse_url first.`,
      durationMs: Date.now() - start,
    };
  }

  try {
    ensureDirs();
    const pdfPath = path.join(SANDBOX_DIR, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    return {
      success: true,
      output: `PDF saved to: ${path.relative(process.cwd(), pdfPath)}\nPage: ${page.url()}`,
      artifacts: [{ path: pdfPath, type: "application/pdf" }],
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      output: "",
      error: `browser_pdf failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── browser_wait ─────────────────────────────────────────────────────────────

async function executeBrowserWait(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { condition, value, session = "default" } = args;
  const timeoutMs = Math.min(parseInt(args.timeout_ms || "10000", 10) || 10_000, 30_000);

  const page = _pages.get(session);
  if (!page) {
    return {
      success: false,
      output: "",
      error: `No active browser session '${session}'. Call browse_url first.`,
      durationMs: Date.now() - start,
    };
  }

  try {
    switch (condition) {
      case "selector":
        await page.waitForSelector(value, { timeout: timeoutMs });
        return {
          success: true,
          output: `Selector '${value}' appeared on ${page.url()}`,
          durationMs: Date.now() - start,
        };

      case "text":
        await page.waitForFunction(
          (txt: string) => document.body?.innerText?.includes(txt),
          value,
          { timeout: timeoutMs }
        );
        return {
          success: true,
          output: `Text '${value}' found on ${page.url()}`,
          durationMs: Date.now() - start,
        };

      case "url":
        await page.waitForURL(`**${value}**`, { timeout: timeoutMs });
        return {
          success: true,
          output: `URL now contains '${value}': ${page.url()}`,
          durationMs: Date.now() - start,
        };

      case "timeout": {
        const ms = Math.min(parseInt(value, 10) || 1000, 30_000);
        await page.waitForTimeout(ms);
        return {
          success: true,
          output: `Waited ${ms}ms. Current URL: ${page.url()}`,
          durationMs: Date.now() - start,
        };
      }

      default:
        return {
          success: false,
          output: "",
          error: `Unknown wait condition '${condition}'. Valid: selector, text, url, timeout`,
          durationMs: Date.now() - start,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      output: "",
      error: `browser_wait '${condition}' timed out after ${timeoutMs}ms: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── browser_resize ───────────────────────────────────────────────────────────

async function executeBrowserResize(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { device, session = "default" } = args;

  const page = _pages.get(session);
  if (!page) {
    return {
      success: false,
      output: "",
      error: `No active browser session '${session}'. Call browse_url first.`,
      durationMs: Date.now() - start,
    };
  }

  let width: number;
  let height: number;

  if (device && DEVICE_PRESETS[device]) {
    ({ width, height } = DEVICE_PRESETS[device]);
  } else {
    width = parseInt(args.width || "1280", 10);
    height = parseInt(args.height || "800", 10);
  }

  // Clamp to sane bounds
  width = Math.max(320, Math.min(3840, width));
  height = Math.max(240, Math.min(2160, height));

  try {
    await page.setViewportSize({ width, height });
    return {
      success: true,
      output: `Viewport resized to ${width}x${height}${device ? ` (${device} preset)` : ""}`,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      output: "",
      error: `browser_resize failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── browser_close ────────────────────────────────────────────────────────────

async function executeBrowserClose(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { session = "default" } = args;
  await closePage(session);
  return {
    success: true,
    output: `Browser session '${session}' closed.`,
    durationMs: Date.now() - start,
  };
}

// ─── Public helpers for REST API ──────────────────────────────────────────────

export async function listBrowserSessions(): Promise<string[]> {
  return Array.from(_pages.keys());
}

export async function getBrowserSessionInfo(sessionKey: string): Promise<{
  url: string;
  title: string;
  viewport: { width: number; height: number };
} | null> {
  const page = _pages.get(sessionKey);
  if (!page) return null;
  try {
    return {
      url: page.url(),
      title: await page.title(),
      viewport: page.viewportSize() || { width: 1280, height: 800 },
    };
  } catch {
    return null;
  }
}

export async function takeSessionScreenshot(sessionKey: string): Promise<Buffer | null> {
  const page = _pages.get(sessionKey);
  if (!page) return null;
  try {
    return await page.screenshot({ type: "png" });
  } catch {
    return null;
  }
}
