/**
 * Tool Execution Layer
 * Real tools that worker agents can invoke: bash, file I/O, URL fetch, calculator.
 * Each tool has a JSON schema (for the LLM function-calling interface) and a real executor.
 * 
 * Security: bash runs inside Docker containers when available (isolated CPU, memory,
 * network, and PID namespace). Falls back to host-process execution with cwd-scoping
 * when Docker is not available. File I/O is scoped to the sandbox directory.
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { dockerSandbox } from "./dockerSandbox.js";
import { BROWSER_TOOL_SCHEMAS, executeBrowserTool } from "./browserTool.js";
import { IMAGE_GEN_TOOL_SCHEMAS, executeImageGenTool } from "./imageGenTool.js";
import { resolveInside } from "./pathSafety.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";
import { redactString } from "./redaction.js";
import { isPrivateHost } from "./networkSecurity.js";

const execAsync = promisify(exec);

// All agent-created files live here — mounted into Docker containers as /workspace
const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });

// Re-export sandbox management for routes
export { dockerSandbox } from "./dockerSandbox.js";

// ─── Tool Schema (OpenAI function-calling format) ────────────────────────────

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: { path: string; type: string }[];
  durationMs: number;
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  // Browser tools (Playwright-based headless browser)
  ...BROWSER_TOOL_SCHEMAS,
  // Image generation tool
  ...IMAGE_GEN_TOOL_SCHEMAS,
  {
    name: "bash",
    description: "Execute a shell command in an isolated Docker container (or Linux sandbox fallback). Use for running scripts, installing packages, processing data, compiling code, or any system operation. The working directory is /workspace (the sandbox folder). Commands have a configurable timeout (default 30s). Standard output and stderr are returned. The container has CPU, memory, and PID limits enforced.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute. Can be multi-line. Example: 'python3 script.py' or 'curl -s https://api.example.com | jq .'" },
      },
      required: ["command"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file in the sandbox. Use for writing scripts, code, data files, configs, or any artifact. Returns the absolute file path and byte count.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename or relative path within the sandbox. Directories are created automatically. Example: 'script.py' or 'output/report.md'" },
        content: { type: "string", description: "The full content to write to the file" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file from the sandbox. Returns the file text. For binary files, returns a summary. Supports reading files created by bash or write_file.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename or relative path within the sandbox to read" },
      },
      required: ["filename"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories in the sandbox or a subdirectory. Useful for checking what's been created or finding files to read.",
    parameters: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Subdirectory within sandbox to list. Omit or use '.' for the sandbox root." },
      },
      required: [],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch the content of a URL via HTTP GET. Returns the response body as text (HTML, JSON, plain text). Has a 15-second timeout. Use for reading web pages, APIs, documentation, or downloading data.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The HTTP or HTTPS URL to fetch. Example: 'https://api.github.com/repos/facebook/react'" },
        extract_text: { type: "string", description: "If 'true', strips HTML tags and returns clean text. If 'false' or omitted, returns raw response body.", enum: ["true", "false"] },
      },
      required: ["url"],
    },
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression safely. Supports arithmetic (+, -, *, /, **, %), trigonometry (Math.sin, Math.cos, etc.), logarithms (Math.log, Math.log10), constants (Math.PI, Math.E), and JavaScript Math functions.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "A JavaScript math expression to evaluate. Example: 'Math.sqrt(144) + Math.PI * 2'" },
      },
      required: ["expression"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for current information using DuckDuckGo. Returns a list of results with titles, URLs, and snippets. Use for finding recent news, documentation, facts, or any information that requires up-to-date web data.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query. Be specific and concise for best results. Example: 'TypeScript 5.4 new features' or 'Python asyncio best practices'" },
        num_results: { type: "string", description: "Number of results to return (1–10). Defaults to '5'." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_files",
    description: "Search for a text pattern in files within the sandbox. Uses grep-like matching. Returns matching lines with filenames and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Text pattern or regex to search for" },
        directory: { type: "string", description: "Subdirectory within sandbox to search. Defaults to '.' (entire sandbox)." },
        file_glob: { type: "string", description: "Glob pattern to filter files. Example: '*.py' or '*.ts'" },
      },
      required: ["pattern"],
    },
  },
];

// ─── Tool Executors ──────────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, string>, sessionId: string = "default"): Promise<ToolResult> {
  const start = Date.now();
  try {
    const context = { domain: "tool" as const, action: "tool:execute", tool: name, sessionId, metadata: args };
    const decision = evaluatePolicy(context);
    writePolicyAudit(context, decision);
    if (!decision.allowed) return policyDeniedResult(decision.reason, start);

    switch (name) {
      case "bash": return await executeBash(args.command, start, sessionId);
      case "write_file": return executeWriteFile(args.filename, args.content, start);
      case "read_file": return executeReadFile(args.filename, start);
      case "list_files": return executeListFiles(args.directory, start);
      case "fetch_url": return await executeFetchUrl(args.url, args.extract_text === "true", start);
      case "calculator": return executeCalculator(args.expression, start);
      case "search_files": return await executeSearchFiles(args.pattern, args.directory, args.file_glob, start);
      case "browse_url": {
        const networkContext = { domain: "network" as const, action: "network:browse", tool: "browse_url", url: args.url, method: "GET", sessionId };
        const networkDecision = evaluatePolicy(networkContext);
        writePolicyAudit(networkContext, networkDecision);
        if (!networkDecision.allowed) return policyDeniedResult(networkDecision.reason, start);
        return await executeBrowserTool(name, args);
      }
      case "browser_action":
      case "browser_evaluate":
      case "browser_pdf":
      case "browser_wait":
      case "browser_resize":
      case "browser_close": return await executeBrowserTool(name, args);
      case "generate_image": return await executeImageGenTool(name, args);
      case "search_web": return await executeSearchWeb(args.query, args.num_results, start);
      default:
        return { success: false, output: "", error: `Unknown tool: ${name}`, durationMs: Date.now() - start };
    }
  } catch (err: any) {
    return { success: false, output: "", error: err.message || String(err), durationMs: Date.now() - start };
  }
}

function policyDeniedResult(reason: string, start: number): ToolResult {
  return {
    success: false,
    output: "",
    error: `Policy denied: ${reason}`,
    durationMs: Date.now() - start,
  };
}

// ─── bash ─────────────────────────────────────────────────────────────────────
async function executeBash(command: string, start: number, sessionId: string = "default"): Promise<ToolResult> {
  if (!command) return { success: false, output: "", error: "No command provided", durationMs: 0 };

  const context = { domain: "shell" as const, action: "shell:execute", tool: "bash", command, sessionId };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  // Try Docker sandbox first, fall back to host process
  if (await dockerSandbox.isActive()) {
    return executeBashDocker(command, start, sessionId);
  }
  return executeBashHost(command, start);
}

/** Execute in Docker container — full isolation */
async function executeBashDocker(command: string, start: number, sessionId: string = "default"): Promise<ToolResult> {
  try {
    const result = await dockerSandbox.exec(sessionId, command, SANDBOX_DIR);

    const output = redactString(result.stdout + (result.stderr ? `\n[stderr]: ${result.stderr}` : ""));

    if (result.timedOut) {
      return {
        success: false,
        output: output.slice(0, 50_000),
        error: `Command timed out (${dockerSandbox.getConfig().execTimeoutMs / 1000}s limit)`,
        durationMs: Date.now() - start,
      };
    }

    return {
      success: result.exitCode === 0,
      output: output.slice(0, 50_000),
      error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    if (process.env.DOCKER_SANDBOX_ONLY === "true") {
      return { success: false, output: "", error: `Docker sandbox required but unavailable: ${redactString(err.message)}`, durationMs: Date.now() - start };
    }
    console.warn(`[tools/bash] Docker exec failed, falling back to host: ${redactString(err.message)}`);
    return executeBashHost(command, start);
  }
}

/** Execute on host — sandbox directory scoped, no container isolation */
async function executeBashHost(command: string, start: number): Promise<ToolResult> {
  try {
    // Only pass a minimal set of safe env vars — never forward full process.env (avoids leaking secrets)
    const safeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: SANDBOX_DIR,
      LANG: process.env.LANG || "C.UTF-8",
      TERM: process.env.TERM || "xterm",
      NODE_ENV: process.env.NODE_ENV || "production",
    };
    const { stdout, stderr } = await execAsync(command, {
      cwd: SANDBOX_DIR,
      timeout: 30_000,
      maxBuffer: 1024 * 1024, // 1MB
      env: safeEnv,
    });

    const output = redactString(stdout + (stderr ? `\n[stderr]: ${stderr}` : ""));
    return {
      success: true,
      output: output.slice(0, 50_000), // cap at 50K chars
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    // exec errors include stdout/stderr on the error object
    const output = redactString((err.stdout || "") + (err.stderr ? `\n[stderr]: ${err.stderr}` : ""));
    return {
      success: false,
      output: output.slice(0, 50_000) || redactString(err.message),
      error: err.killed ? "Command timed out (30s limit)" : `Exit code ${err.code}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── write_file ───────────────────────────────────────────────────────────────
function executeWriteFile(filename: string, content: string, start: number): ToolResult {
  if (!filename) return { success: false, output: "", error: "No filename provided", durationMs: 0 };

  // Guard against writing extremely large files (50 MB limit)
  if (content.length > 50_000_000) {
    return { success: false, output: "", error: "File content too large (max 50 MB)", durationMs: Date.now() - start };
  }

  const safePath = resolveSandboxPath(filename);
  const context = { domain: "filesystem" as const, action: "filesystem:write", tool: "write_file", path: safePath, metadata: { filename } };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  const dir = path.dirname(safePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(safePath, content, "utf-8");
  const bytes = Buffer.byteLength(content, "utf-8");

  return {
    success: true,
    output: `Wrote ${bytes} bytes to ${filename}`,
    artifacts: [{ path: safePath, type: guessFileType(filename) }],
    durationMs: Date.now() - start,
  };
}

// ─── read_file ────────────────────────────────────────────────────────────────
function executeReadFile(filename: string, start: number): ToolResult {
  if (!filename) return { success: false, output: "", error: "No filename provided", durationMs: 0 };

  const safePath = resolveSandboxPath(filename);
  const context = { domain: "filesystem" as const, action: "filesystem:read", tool: "read_file", path: safePath, metadata: { filename } };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  if (!fs.existsSync(safePath)) {
    return { success: false, output: "", error: `File not found: ${filename}`, durationMs: Date.now() - start };
  }

  const stat = fs.statSync(safePath);
  if (stat.size > 512_000) {
    return {
      success: true,
      output: `[File too large: ${(stat.size / 1024).toFixed(1)} KB. Showing first 10,000 chars]\n\n${fs.readFileSync(safePath, "utf-8").slice(0, 10_000)}`,
      durationMs: Date.now() - start,
    };
  }

  return {
    success: true,
    output: fs.readFileSync(safePath, "utf-8"),
    durationMs: Date.now() - start,
  };
}

// ─── list_files ───────────────────────────────────────────────────────────────
function executeListFiles(directory: string | undefined, start: number): ToolResult {
  const dir = resolveSandboxPath(directory || ".");
  const context = { domain: "filesystem" as const, action: "filesystem:list", tool: "list_files", path: dir, metadata: { directory } };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  if (!fs.existsSync(dir)) {
    return { success: false, output: "", error: `Directory not found: ${directory}`, durationMs: Date.now() - start };
  }

  const entries = listDirRecursive(dir, dir, 0, 3); // max depth 3
  return {
    success: true,
    output: entries.length > 0 ? entries.join("\n") : "(empty directory)",
    durationMs: Date.now() - start,
  };
}

function listDirRecursive(base: string, current: string, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return ["  ..."];
  const entries: string[] = [];
  const items = fs.readdirSync(current, { withFileTypes: true });
  for (const item of items) {
    const rel = path.relative(base, path.join(current, item.name));
    const indent = "  ".repeat(depth);
    if (item.isDirectory()) {
      entries.push(`${indent}📁 ${rel}/`);
      entries.push(...listDirRecursive(base, path.join(current, item.name), depth + 1, maxDepth));
    } else {
      const size = fs.statSync(path.join(current, item.name)).size;
      entries.push(`${indent}📄 ${rel} (${formatSize(size)})`);
    }
  }
  return entries;
}

// ─── fetch_url ────────────────────────────────────────────────────────────────
async function executeFetchUrl(url: string, extractText: boolean, start: number): Promise<ToolResult> {
  if (!url) return { success: false, output: "", error: "No URL provided", durationMs: 0 };
  const context = { domain: "network" as const, action: "network:fetch", tool: "fetch_url", url, method: "GET" };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  // Validate URL
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    return { success: false, output: "", error: "Invalid URL format", durationMs: Date.now() - start };
  }

  // Block non-HTTP schemes (no file://, ftp://, etc.)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { success: false, output: "", error: "Only http:// and https:// URLs are allowed", durationMs: Date.now() - start };
  }

  // SSRF protection: block private/loopback/link-local addresses
  if (isPrivateHost(parsedUrl.hostname)) {
    return { success: false, output: "", error: "Fetching private/internal network addresses is not allowed", durationMs: Date.now() - start };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Ultra-Computer/1.0 (agent-harness)",
        "Accept": "text/html,application/json,text/plain,*/*",
      },
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";

    // Reject non-text content types to avoid loading binary data
    const isTextContent = (
      contentType.includes("text/") ||
      contentType.includes("application/json") ||
      contentType.includes("application/xml") ||
      contentType.includes("application/xhtml") ||
      contentType.includes("application/javascript") ||
      contentType.includes("application/ld+json") ||
      contentType === ""
    );
    if (!isTextContent) {
      return {
        success: false,
        output: "",
        error: `Unsupported content type: ${contentType}. Only text-based responses are supported.`,
        durationMs: Date.now() - start,
      };
    }

    let body = await response.text();

    // Cap response size
    if (body.length > 100_000) {
      body = body.slice(0, 100_000) + "\n\n[Truncated — showing first 100,000 characters]";
    }

    // Strip HTML tags if requested
    if (extractText && contentType.includes("html")) {
      body = stripHtml(body);
    }

    return {
      success: response.ok,
      output: `HTTP ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${body}`,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    const msg = err.name === "AbortError" ? "Request timed out (15s limit)" : err.message;
    return { success: false, output: "", error: msg, durationMs: Date.now() - start };
  }
}

// ─── calculator ───────────────────────────────────────────────────────────────
const ALLOWED_MATH_FUNCTIONS = new Set([
  "Math.abs", "Math.ceil", "Math.floor", "Math.round", "Math.sqrt", "Math.cbrt",
  "Math.pow", "Math.min", "Math.max", "Math.log", "Math.log2", "Math.log10",
  "Math.sin", "Math.cos", "Math.tan", "Math.asin", "Math.acos", "Math.atan", "Math.atan2",
  "Math.PI", "Math.E", "Math.exp", "Math.sign", "Math.trunc", "Math.hypot", "Math.random",
]);

/**
 * Safe math expression evaluator.
 * Validates the expression: only allows digits, arithmetic operators, parentheses,
 * whitespace, comma (for multi-arg Math functions), and whitelisted Math.* calls.
 * Passes only the Math object as scope — no access to process, require, etc.
 */
function safeEvalMath(expression: string): number {
  // Validate all Math.* tokens against allowlist
  const mathTokenPattern = /Math\.\w+/g;
  const mathTokens = expression.match(mathTokenPattern) || [];
  for (const token of mathTokens) {
    if (!ALLOWED_MATH_FUNCTIONS.has(token)) {
      throw new Error(`Disallowed function: ${token}`);
    }
  }

  // After removing Math.identifier tokens, only safe characters should remain
  const withoutMathIdents = expression.replace(/Math\.[a-z0-9]+/gi, "");
  for (const ch of withoutMathIdents) {
    if (!/[0-9.+\-*/%() \t\n,eE]/.test(ch)) {
      throw new Error(`Disallowed character in expression: '${ch}'`);
    }
  }

  // Evaluate with only Math in scope — no globals, no process, no require
  // eslint-disable-next-line no-new-func
  const fn = new Function("Math", `"use strict"; return (${expression});`);
  const result = fn(Math);
  if (typeof result !== "number") throw new Error("Expression did not evaluate to a number");
  return result;
}

function executeCalculator(expression: string, start: number): ToolResult {
  if (!expression) return { success: false, output: "", error: "No expression provided", durationMs: 0 };

  try {
    const result = safeEvalMath(expression);
    return {
      success: true,
      output: String(result),
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { success: false, output: "", error: `Evaluation error: ${err.message}`, durationMs: Date.now() - start };
  }
}

// ─── search_files ─────────────────────────────────────────────────────────────
async function executeSearchFiles(pattern: string, directory: string | undefined, fileGlob: string | undefined, start: number): Promise<ToolResult> {
  if (!pattern) return { success: false, output: "", error: "No pattern provided", durationMs: 0 };

  const dir = resolveSandboxPath(directory || ".");
  const context = { domain: "filesystem" as const, action: "filesystem:search", tool: "search_files", path: dir, metadata: { directory, fileGlob } };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  if (!fs.existsSync(dir)) {
    return { success: false, output: "", error: `Directory not found`, durationMs: Date.now() - start };
  }

  // Shell-escape single quotes in all interpolated values to prevent injection
  const escapeSingle = (s: string) => s.replace(/'/g, "'\\''");
  const safeGlob = escapeSingle(fileGlob || "*");
  const safePattern = escapeSingle(pattern);
  const safeDir = escapeSingle(dir);
  const grepCmd = `grep -rn --include='${safeGlob}' '${safePattern}' '${safeDir}'`;
  try {
    const { stdout } = await execAsync(grepCmd, { timeout: 10_000, maxBuffer: 512 * 1024 });
    // Make paths relative to sandbox
    const output = stdout.replace(new RegExp(SANDBOX_DIR + "/", "g"), "");
    return {
      success: true,
      output: output.slice(0, 30_000) || "No matches found.",
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    if (err.code === 1) return { success: true, output: "No matches found.", durationMs: Date.now() - start };
    return { success: false, output: "", error: err.message, durationMs: Date.now() - start };
  }
}

// ─── search_web ───────────────────────────────────────────────────────────────
async function executeSearchWeb(query: string, numResultsStr: string | undefined, start: number): Promise<ToolResult> {
  if (!query) return { success: false, output: "", error: "No query provided", durationMs: 0 };

  const numResults = Math.min(10, Math.max(1, parseInt(numResultsStr || "5", 10) || 5));

  // Use DuckDuckGo HTML search (no API key required)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const context = { domain: "network" as const, action: "network:search", tool: "search_web", url: searchUrl, method: "GET", metadata: { query, numResults } };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) return policyDeniedResult(decision.reason, start);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, output: "", error: `Search request failed: HTTP ${response.status}`, durationMs: Date.now() - start };
    }

    const html = await response.text();

    // Parse results from DuckDuckGo HTML response
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Extract result blocks: each result contains a title link + snippet
    const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetPattern = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    const titleMatches: Array<{ url: string; title: string }> = [];
    let m: RegExpExecArray | null;

    while ((m = resultPattern.exec(html)) !== null && titleMatches.length < numResults * 2) {
      let url = m[1];
      // DuckDuckGo wraps links in a redirect — extract actual URL
      if (url.includes("uddg=")) {
        try {
          const parsed = new URL("https://html.duckduckgo.com" + url);
          url = decodeURIComponent(parsed.searchParams.get("uddg") || url);
        } catch { /* use as-is */ }
      }
      const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (title && url && !url.startsWith("#") && !url.includes("duckduckgo.com")) {
        titleMatches.push({ url, title });
      }
    }

    const snippets: string[] = [];
    while ((m = snippetPattern.exec(html)) !== null) {
      const snippet = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (snippet) snippets.push(snippet);
    }

    for (let i = 0; i < Math.min(titleMatches.length, numResults); i++) {
      results.push({
        title: titleMatches[i].title,
        url: titleMatches[i].url,
        snippet: snippets[i] || "",
      });
    }

    if (results.length === 0) {
      return {
        success: true,
        output: `No results found for query: "${query}"`,
        durationMs: Date.now() - start,
      };
    }

    const output = [
      `Search results for: "${query}"`,
      `Found ${results.length} result(s):`,
      "",
      ...results.map((r, i) =>
        `${i + 1}. **${r.title}**\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`
      ),
    ].join("\n");

    return {
      success: true,
      output,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    const msg = err.name === "AbortError" ? "Search request timed out (15s limit)" : err.message;
    return { success: false, output: "", error: msg, durationMs: Date.now() - start };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveSandboxPath(filename: string): string {
  const resolved = resolveInside(SANDBOX_DIR, filename);
  if (!resolved) {
    throw new Error("Path traversal blocked — must stay within sandbox");
  }
  return resolved;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function guessFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".ts": "typescript", ".sh": "shell",
    ".md": "markdown", ".json": "json", ".csv": "csv", ".html": "html",
    ".css": "css", ".sql": "sql", ".yaml": "yaml", ".yml": "yaml",
    ".txt": "text", ".xml": "xml", ".toml": "toml", ".rs": "rust",
    ".go": "go", ".java": "java", ".c": "c", ".cpp": "cpp",
  };
  return map[ext] || "file";
}
