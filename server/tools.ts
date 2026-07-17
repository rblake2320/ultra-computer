/**
 * Tool Execution Layer
 * Real tools that worker agents can invoke: bash, file I/O, URL fetch, calculator.
 * Each tool has a JSON schema (for the LLM function-calling interface) and a real executor.
 * 
 * Security: bash requires Docker container isolation by default (CPU, memory,
 * network, and PID namespaces). Host execution is an explicit non-production
 * development escape hatch. File I/O is scoped to the sandbox directory.
 */

import fs from "fs";
import path from "path";
import { dockerSandbox } from "./dockerSandbox.js";
import { BROWSER_TOOL_SCHEMAS, executeBrowserTool } from "./browserTool.js";
import { IMAGE_GEN_TOOL_SCHEMAS, executeImageGenTool } from "./imageGenTool.js";
import {
  resolveSandboxPath as resolveCanonicalSandboxPath,
  SANDBOX_DIR,
  ensureSandboxDir,
} from "./sandboxPaths.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";
import { redactString, sanitizeToolArgsForExposure } from "./redaction.js";
import { isPrivateHost } from "./networkSecurity.js";
import { governedFetch } from "./governedFetch.js";

// Lazy import to avoid circular dependency (mcpProtocol imports from tools)
let _mcpModule: typeof import("./mcpProtocol.js") | null = null;
async function getMCPModule() {
  if (!_mcpModule) _mcpModule = await import("./mcpProtocol.js");
  return _mcpModule;
}

// All agent-created files live here — mounted into Docker containers as /workspace
ensureSandboxDir();

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
        pattern: { type: "string", description: "Literal text to search for (case-insensitive)" },
        directory: { type: "string", description: "Subdirectory within sandbox to search. Defaults to '.' (entire sandbox)." },
        file_glob: { type: "string", description: "Glob pattern to filter files. Example: '*.py' or '*.ts'" },
      },
      required: ["pattern"],
    },
  },
];

// ─── MCP Tool Bridge ─────────────────────────────────────────────────────────
// Dynamically includes tools from connected MCP servers so worker agents can use them.

/** Convert an MCP tool schema to our ToolSchema format. Prefix name with mcp_<serverId>_ */
function mcpToolToSchema(tool: { name: string; description: string; inputSchema: any }, serverName: string, serverId: string): ToolSchema {
  const props: Record<string, { type: string; description: string; enum?: string[] }> = {};
  if (tool.inputSchema?.properties) {
    const entries = Object.entries(tool.inputSchema.properties) as Array<[
      string,
      { type?: string; description?: string; enum?: string[] },
    ]>;
    for (const [k, v] of entries) {
      props[k] = {
        type: v.type || "string",
        description: v.description || k,
        ...(v.enum ? { enum: v.enum } : {}),
      };
    }
  }
  return {
    name: `mcp__${serverId}__${tool.name}`,
    description: `[MCP: ${serverName}] ${tool.description}`,
    parameters: {
      type: "object",
      properties: props,
      required: tool.inputSchema?.required || [],
    },
  };
}

/** Get all tool schemas including connected MCP servers */
export function getAllToolSchemas(): ToolSchema[] {
  const mcpSchemas: ToolSchema[] = [];
  // Lazy access — _mcpModule is populated after first async call.
  if (_mcpModule) {
    for (const server of _mcpModule.listConnectedServers()) {
      for (const tool of server.tools) {
        mcpSchemas.push(mcpToolToSchema(tool, server.name, server.id));
      }
    }
  }
  return [...TOOL_SCHEMAS, ...mcpSchemas];
}

/** Eagerly load the MCP module so getAllToolSchemas works synchronously after boot */
setTimeout(() => {
  void getMCPModule();
}, 1000);

/** Execute an MCP tool by its prefixed name */
async function executeMCPTool(prefixedName: string, args: Record<string, string>, start: number): Promise<ToolResult> {
  // Parse mcp__<serverId>__<toolName>
  const parts = prefixedName.split("__");
  if (parts.length < 3 || parts[0] !== "mcp") {
    return { success: false, output: "", error: `Invalid MCP tool name: ${prefixedName}`, durationMs: Date.now() - start };
  }
  const serverId = parts[1];
  const toolName = parts.slice(2).join("__"); // tool name might contain __

  try {
    const mcp = await getMCPModule();
    const result = await mcp.callRemoteTool(serverId, toolName, args);
    const textParts = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);
    const output = textParts.join("\n") || "(no text output)";
    return {
      success: !result.isError,
      output: output.slice(0, 50_000),
      error: result.isError ? output.slice(0, 1000) : undefined,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { success: false, output: "", error: `MCP tool error: ${err.message}`, durationMs: Date.now() - start };
  }
}

// ─── Tool Executors ──────────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, string>, sessionId: string = "default"): Promise<ToolResult> {
  const start = Date.now();
  try {
    const context = {
      domain: "tool" as const,
      action: "tool:execute",
      tool: name,
      sessionId,
      metadata: sanitizeToolArgsForExposure(name, args),
    };
    const decision = evaluatePolicy(context);
    writePolicyAudit(context, decision);
    if (!decision.allowed) return policyDeniedResult(decision.reason, start);

    // Check if this is an MCP tool call (mcp__<serverId>__<toolName>)
    if (name.startsWith("mcp__")) {
      return await executeMCPTool(name, args, start);
    }

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

  // Shell execution requires container isolation by default. A host shell is a
  // local-development escape hatch only and must be explicitly enabled.
  if (await dockerSandbox.isActive()) {
    return executeBashDocker(command, start, sessionId);
  }
  return sandboxUnavailableResult(start);
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
    return sandboxUnavailableResult(start, err);
  }
}

export function isHostShellFallbackAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env.ALLOW_HOST_SHELL === "true";
}

function sandboxUnavailableResult(start: number, error?: unknown): ToolResult {
  const detail = error instanceof Error && error.message
    ? `: ${redactString(error.message)}`
    : "";
  return {
    success: false,
    output: "",
    error: `Docker sandbox required but unavailable${detail}`,
    durationMs: Date.now() - start,
  };
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
  assertSandboxPathStillSafe(safePath);

  const descriptor = fs.openSync(safePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollowFlag(), 0o600);
  try {
    fs.writeFileSync(descriptor, content, "utf-8");
  } finally {
    fs.closeSync(descriptor);
  }
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

  let descriptor: number;
  try {
    assertSandboxPathStillSafe(safePath);
    descriptor = fs.openSync(safePath, fs.constants.O_RDONLY | noFollowFlag());
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return { success: false, output: "", error: `File not found: ${filename}`, durationMs: Date.now() - start };
    }
    throw error;
  }

  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error("Requested path is not a regular file");
    const content = fs.readFileSync(descriptor, "utf-8");
    if (stat.size > 512_000) {
      return {
        success: true,
        output: `[File too large: ${(stat.size / 1024).toFixed(1)} KB. Showing first 10,000 chars]\n\n${content.slice(0, 10_000)}`,
        durationMs: Date.now() - start,
      };
    }
    return { success: true, output: content, durationMs: Date.now() - start };
  } finally {
    fs.closeSync(descriptor);
  }
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
    const child = resolveSandboxPath(path.relative(SANDBOX_DIR, path.join(current, item.name)));
    const rel = path.relative(base, child);
    const indent = "  ".repeat(depth);
    if (item.isSymbolicLink()) {
      entries.push(`${indent}↗ ${rel} (symbolic link not followed)`);
      continue;
    }
    if (item.isDirectory()) {
      entries.push(`${indent}📁 ${rel}/`);
      entries.push(...listDirRecursive(base, child, depth + 1, maxDepth));
    } else {
      const size = fs.lstatSync(child).size;
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

  try {
    const response = await governedFetch(url, {
      headers: {
        "User-Agent": "Ultra-Computer/1.0 (agent-harness)",
        "Accept": "text/html,application/json,text/plain,*/*",
      },
    }, "tool-fetch-url", "network", "network:fetch", {
      timeoutMs: 15_000,
    });

    // SSRF redirect protection: verify the final URL after any server-side redirects
    if (response.url && response.url !== url) {
      try {
        const finalParsed = new URL(response.url);
        if (isPrivateHost(finalParsed.hostname)) {
          return { success: false, output: "", error: "URL redirected to a private/internal network address", durationMs: Date.now() - start };
        }
      } catch { /* ignore unparseable URLs */ }
    }

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
      body = htmlToPlainText(body);
    }

    return {
      success: response.ok,
      output: `HTTP ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${body}`,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    const msg = err.name === "AbortError" ? "Request timed out (15s limit)" : err.message;
    return { success: false, output: "", error: msg, durationMs: Date.now() - start };
  }
}

// ─── calculator ───────────────────────────────────────────────────────────────
const MATH_CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  "Math.PI": Math.PI,
  "Math.E": Math.E,
});

function callMathFunction(identifier: string, args: number[]): number {
  const first = args[0];
  if (first === undefined) throw new Error(`${identifier} requires an argument`);
  switch (identifier) {
    case "Math.abs": return Math.abs(first);
    case "Math.ceil": return Math.ceil(first);
    case "Math.floor": return Math.floor(first);
    case "Math.round": return Math.round(first);
    case "Math.sqrt": return Math.sqrt(first);
    case "Math.cbrt": return Math.cbrt(first);
    case "Math.log": return Math.log(first);
    case "Math.log2": return Math.log2(first);
    case "Math.log10": return Math.log10(first);
    case "Math.sin": return Math.sin(first);
    case "Math.cos": return Math.cos(first);
    case "Math.tan": return Math.tan(first);
    case "Math.asin": return Math.asin(first);
    case "Math.acos": return Math.acos(first);
    case "Math.atan": return Math.atan(first);
    case "Math.exp": return Math.exp(first);
    case "Math.sign": return Math.sign(first);
    case "Math.trunc": return Math.trunc(first);
    case "Math.pow":
    case "Math.atan2": {
      const second = args[1];
      if (second === undefined) throw new Error(`${identifier} requires two arguments`);
      return identifier === "Math.pow" ? Math.pow(first, second) : Math.atan2(first, second);
    }
    case "Math.min": return Math.min(...args);
    case "Math.max": return Math.max(...args);
    case "Math.hypot": return Math.hypot(...args);
    default: throw new Error(`Disallowed function: ${identifier}`);
  }
}

const MATH_FUNCTION_NAMES = new Set([
  "Math.abs", "Math.ceil", "Math.floor", "Math.round", "Math.sqrt",
  "Math.cbrt", "Math.log", "Math.log2", "Math.log10", "Math.sin",
  "Math.cos", "Math.tan", "Math.asin", "Math.acos", "Math.atan",
  "Math.exp", "Math.sign", "Math.trunc", "Math.pow", "Math.atan2",
  "Math.min", "Math.max", "Math.hypot",
]);

/**
 * Safe math expression evaluator.
 * Recursive-descent parser for numeric literals, arithmetic, parentheses, and a
 * fixed set of Math functions. It never compiles or executes source text.
 */
export function safeEvalMath(expression: string): number {
  if (expression.length > 1_000) throw new Error("Expression is too long");
  let cursor = 0;
  const skipWhitespace = () => { while (/\s/.test(expression[cursor] ?? "")) cursor += 1; };
  const consume = (token: string) => {
    skipWhitespace();
    if (!expression.startsWith(token, cursor)) return false;
    cursor += token.length;
    return true;
  };

  const parsePrimary = (): number => {
    skipWhitespace();
    if (consume("(")) {
      const value = parseAdditive();
      if (!consume(")")) throw new Error("Missing closing parenthesis");
      return value;
    }

    const remaining = expression.slice(cursor);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(remaining)?.[0];
    if (number) {
      cursor += number.length;
      return Number(number);
    }

    const identifier = /^Math\.[A-Za-z][A-Za-z0-9]*/.exec(remaining)?.[0];
    if (!identifier) throw new Error(`Unexpected token at position ${cursor}`);
    cursor += identifier.length;
    if (Object.hasOwn(MATH_CONSTANTS, identifier)) return MATH_CONSTANTS[identifier];
    if (!MATH_FUNCTION_NAMES.has(identifier)) throw new Error(`Disallowed function: ${identifier}`);
    if (!consume("(")) throw new Error(`Expected '(' after ${identifier}`);
    const args: number[] = [];
    if (!consume(")")) {
      do { args.push(parseAdditive()); } while (consume(","));
      if (!consume(")")) throw new Error(`Missing ')' after ${identifier}`);
    }
    return callMathFunction(identifier, args);
  };

  const parseUnary = (): number => {
    if (consume("+")) return parseUnary();
    if (consume("-")) return -parseUnary();
    return parsePrimary();
  };
  const parsePower = (): number => {
    const left = parseUnary();
    return consume("**") ? left ** parsePower() : left;
  };
  const parseMultiplicative = (): number => {
    let value = parsePower();
    while (true) {
      if (consume("*")) value *= parsePower();
      else if (consume("/")) value /= parsePower();
      else if (consume("%")) value %= parsePower();
      else return value;
    }
  };
  function parseAdditive(): number {
    let value = parseMultiplicative();
    while (true) {
      if (consume("+")) value += parseMultiplicative();
      else if (consume("-")) value -= parseMultiplicative();
      else return value;
    }
  }

  const result = parseAdditive();
  skipWhitespace();
  if (cursor !== expression.length) throw new Error(`Unexpected token at position ${cursor}`);
  if (!Number.isFinite(result)) throw new Error("Expression did not evaluate to a finite number");
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

  try {
    if (pattern.length > 1_000) throw new Error("Search pattern is too long");
    const matcher = pattern.toLowerCase();
    const matches: string[] = [];
    searchFilesRecursive(dir, fileGlob || "*", matcher, matches, 0);
    const output = matches.join("\n");
    return {
      success: true,
      output: output.slice(0, 30_000) || "No matches found.",
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { success: false, output: "", error: `Invalid search: ${err.message}`, durationMs: Date.now() - start };
  }
}

function searchFilesRecursive(
  directory: string,
  fileGlob: string,
  matcher: string,
  matches: string[],
  depth: number,
): void {
  if (depth > 20 || matches.length >= 1_000) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = resolveSandboxPath(path.relative(SANDBOX_DIR, path.join(directory, item.name)));
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      searchFilesRecursive(child, fileGlob, matcher, matches, depth + 1);
      continue;
    }
    if (!matchSimpleGlob(item.name, fileGlob)) continue;
    const descriptor = fs.openSync(child, fs.constants.O_RDONLY | noFollowFlag());
    try {
      if (fs.fstatSync(descriptor).size > 2 * 1024 * 1024) continue;
      const lines = fs.readFileSync(descriptor, "utf8").split(/\r?\n/);
      for (let index = 0; index < lines.length && matches.length < 1_000; index += 1) {
        if (lines[index].toLowerCase().includes(matcher)) {
          matches.push(`${path.relative(SANDBOX_DIR, child)}:${index + 1}:${lines[index]}`);
        }
      }
    } finally {
      fs.closeSync(descriptor);
    }
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

  try {
    const response = await governedFetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, "tool-search-web", "network", "network:search", {
      timeoutMs: 15_000,
      maxResponseBytes: 5 * 1024 * 1024,
    });

    if (!response.ok) {
      return { success: false, output: "", error: `Search request failed: HTTP ${response.status}`, durationMs: Date.now() - start };
    }

    const html = await response.text();

    // Parse only anchors with the expected result classes. The scanner treats
    // remote markup as data and never attempts to repair or execute it.
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const anchors = extractAnchors(html);
    const titleMatches: Array<{ url: string; title: string }> = [];
    for (const anchor of anchors) {
      if (!anchor.classes.includes("result__a") || titleMatches.length >= numResults * 2) continue;
      let url = anchor.href;
      // DuckDuckGo wraps links in a redirect — extract actual URL
      try {
        const parsed = new URL(url, "https://html.duckduckgo.com");
        const redirected = parsed.searchParams.get("uddg");
        if (redirected) url = redirected;
      } catch {
        continue;
      }
      let resultUrl: URL;
      try { resultUrl = new URL(url); } catch { continue; }
      if (resultUrl.protocol !== "http:" && resultUrl.protocol !== "https:") continue;
      const host = resultUrl.hostname.toLowerCase();
      if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) continue;
      const title = htmlToPlainText(anchor.content);
      if (title) {
        titleMatches.push({ url: resultUrl.toString(), title });
      }
    }

    const snippets = anchors
      .filter((anchor) => anchor.classes.includes("result__snippet"))
      .map((anchor) => htmlToPlainText(anchor.content))
      .filter(Boolean);

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
    const msg = err.name === "AbortError" ? "Search request timed out (15s limit)" : err.message;
    return { success: false, output: "", error: msg, durationMs: Date.now() - start };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveSandboxPath(filename: string): string {
  if (filename.includes("\0")) throw new Error("Path contains a null byte");
  const resolved = resolveCanonicalSandboxPath(filename);
  if (!resolved) {
    throw new Error("Path traversal blocked — must stay within sandbox");
  }
  return resolved;
}

function assertSandboxPathStillSafe(candidate: string): void {
  const relative = path.relative(SANDBOX_DIR, candidate);
  const resolved = resolveCanonicalSandboxPath(relative);
  if (resolved !== candidate) throw new Error("Sandbox path changed during operation");
}

function noFollowFlag(): number {
  return typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
}

type ParsedAnchor = { href: string; classes: string[]; content: string };

function extractAnchors(html: string): ParsedAnchor[] {
  const anchors: ParsedAnchor[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;
  while (anchors.length < 100 && cursor < html.length) {
    const start = lower.indexOf("<a", cursor);
    if (start < 0) break;
    const afterName = lower[start + 2];
    if (afterName && !/[\s/>]/.test(afterName)) { cursor = start + 2; continue; }
    const tagEnd = findTagEnd(html, start + 2);
    if (tagEnd < 0) break;
    const close = lower.indexOf("</a", tagEnd + 1);
    if (close < 0) break;
    const closeEnd = findTagEnd(html, close + 3);
    if (closeEnd < 0) break;
    const attributes = parseHtmlAttributes(html.slice(start + 2, tagEnd));
    const href = attributes.get("href") ?? "";
    const classes = (attributes.get("class") ?? "").split(/\s+/).filter(Boolean);
    anchors.push({ href, classes, content: html.slice(tagEnd + 1, close) });
    cursor = closeEnd + 1;
  }
  return anchors;
}

function findTagEnd(html: string, start: number): number {
  let quote = "";
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function parseHtmlAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    const nameStart = cursor;
    while (/[A-Za-z0-9_:-]/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor === nameStart) { cursor += 1; continue; }
    const name = source.slice(nameStart, cursor).toLowerCase();
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") { attributes.set(name, ""); continue; }
    cursor += 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    const quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor++] : "";
    const valueStart = cursor;
    if (quote) while (cursor < source.length && source[cursor] !== quote) cursor += 1;
    else while (cursor < source.length && !/\s/.test(source[cursor]) && source[cursor] !== ">") cursor += 1;
    attributes.set(name, decodeHtmlEntities(source.slice(valueStart, cursor)));
    if (quote && source[cursor] === quote) cursor += 1;
  }
  return attributes;
}

export function htmlToPlainText(html: string): string {
  let text = "";
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < html.length) {
    if (html[cursor] !== "<") { text += html[cursor++]; continue; }
    const tagEnd = findTagEnd(html, cursor + 1);
    if (tagEnd < 0) { text += " "; break; }
    const rawName = lower.slice(cursor + 1, tagEnd).trimStart();
    const name = /^\/?([a-z0-9]+)/.exec(rawName)?.[1] ?? "";
    if (name === "script" || name === "style") {
      const closingStart = lower.indexOf(`</${name}`, tagEnd + 1);
      if (closingStart < 0) break;
      const closingEnd = findTagEnd(html, closingStart + name.length + 2);
      cursor = closingEnd < 0 ? html.length : closingEnd + 1;
      text += " ";
      continue;
    }
    text += " ";
    cursor = tagEnd + 1;
  }
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return text.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] !== "#") return named[body.toLowerCase()] ?? entity;
    const hexadecimal = body[1]?.toLowerCase() === "x";
    const value = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : "�";
  });
}

function matchSimpleGlob(filename: string, pattern: string): boolean {
  if (pattern.length > 200) throw new Error("File glob is too long");
  let previous = new Array(filename.length + 1).fill(false);
  previous[0] = true;
  for (const token of pattern) {
    const current = new Array(filename.length + 1).fill(false);
    if (token === "*") current[0] = previous[0];
    for (let index = 1; index <= filename.length; index += 1) {
      current[index] = token === "*"
        ? current[index - 1] || previous[index]
        : previous[index - 1] && (token === "?" || token.toLowerCase() === filename[index - 1].toLowerCase());
    }
    previous = current;
  }
  return previous[filename.length];
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
