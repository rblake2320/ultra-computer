/**
 * cliToolEngine.ts
 *
 * Comprehensive CLI tool execution engine AND HTTP/webhook skill executor
 * for Ultra Computer. Provides sandboxed command execution, script running,
 * pipeline orchestration, HTTP requests, webhook registration, a code
 * interpreter with auto-package installation, and file transformation utilities.
 *
 * @module cliToolEngine
 */

import { spawn, exec, spawnSync } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";
import { isSensitiveKey, redactEnv, redactString } from "./redaction.js";
import { governedFetch } from "./governedFetch.js";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_WORK_DIR = "/tmp/ultra-sandbox";
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_WEBHOOK_HISTORY = 100;

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

/** Result returned from a single shell command execution. */
export interface CommandResult {
  /** Standard output captured from the process. */
  stdout: string;
  /** Standard error captured from the process. */
  stderr: string;
  /** Process exit code (null if killed by signal). */
  exitCode: number | null;
  /** Wall-clock duration in milliseconds. */
  duration: number;
  /** Whether the process was killed due to timeout. */
  timedOut: boolean;
  /** PID of the spawned process (available immediately after launch). */
  pid?: number;
}

/** Options controlling how a command is executed. */
export interface CommandOptions {
  /** Working directory (default: /tmp/ultra-sandbox). */
  workDir?: string;
  /** Timeout in milliseconds (default: 30 000, max: 300 000). */
  timeout?: number;
  /** Additional environment variables merged with process.env. */
  env?: Record<string, string>;
  /** Data to write to the process's stdin before closing it. */
  stdin?: string;
}

/** Result returned from a script execution. */
export interface ScriptResult extends CommandResult {
  /** Temp file path that was created and executed (already cleaned up). */
  scriptPath: string;
  /** Detected or specified language. */
  language: SupportedLanguage;
}

/** Supported scripting languages for executeScript. */
export type SupportedLanguage = "bash" | "python3" | "node" | "typescript";

/** A single step in a pipeline. */
export interface PipelineStep {
  /** Shell command to execute. */
  command: string;
  /** Override stdin for this step (if omitted, previous step's stdout is used). */
  stdin?: string;
  /** Extra environment variables for this step. */
  env?: Record<string, string>;
  /** Per-step timeout in milliseconds. */
  timeout?: number;
  /** Working directory override for this step. */
  workDir?: string;
}

/** Result of running a full pipeline. */
export interface PipelineResult {
  /** Individual results for each step. */
  steps: CommandResult[];
  /** Combined final stdout (last step's stdout). */
  finalOutput: string;
  /** Whether the pipeline completed without any step failing. */
  success: boolean;
  /** Index of the first failed step, if any. */
  failedStep?: number;
}

/** Information about a detected CLI tool. */
export interface InstalledTool {
  /** Tool name (e.g. "git"). */
  name: string;
  /** Absolute path to the executable. */
  path: string;
  /** Version string as reported by the tool's --version flag. */
  version: string;
}

/** Result of a command safety validation check. */
export interface ValidationResult {
  /** True when the command is considered safe to run. */
  safe: boolean;
  /** Human-readable reason when safe is false. */
  reason?: string;
  /** Which blocklist rule matched, if any. */
  matchedRule?: string;
}

/** Configuration for an outbound HTTP request. */
export interface HttpRequestConfig {
  /** Target URL. */
  url: string;
  /** HTTP method (default: GET). */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  /** Request headers. */
  headers?: Record<string, string>;
  /** Request body (string, object, FormData). */
  body?: string | Record<string, unknown> | FormData;
  /** Timeout in milliseconds (default: 30 000). */
  timeout?: number;
  /** Follow HTTP redirects (default: true). */
  followRedirects?: boolean;
  /** Expected response content type. "json" triggers auto-parse. */
  responseType?: "json" | "text" | "blob";
}

/** Result of an outbound HTTP request. */
export interface HttpResponse {
  /** HTTP status code. */
  status: number;
  /** Response headers as a plain object. */
  headers: Record<string, string>;
  /** Parsed JSON body (when responseType is json) or raw string. */
  body: unknown;
  /** Wall-clock duration in milliseconds. */
  duration: number;
}

/** Configuration for a registered webhook handler. */
export interface WebhookConfig {
  /** Unique webhook identifier. */
  id: string;
  /** URL path under /api/webhooks/ (e.g. "my-webhook" → /api/webhooks/my-webhook). */
  path: string;
  /** Async handler called on each incoming invocation. */
  handler: (invocation: WebhookInvocation) => Promise<void>;
  /** ISO timestamp of when the webhook was registered. */
  registeredAt: string;
}

/** A single recorded webhook invocation. */
export interface WebhookInvocation {
  /** Unique ID for this invocation. */
  invocationId: string;
  /** The webhook's registered ID. */
  webhookId: string;
  /** ISO timestamp. */
  timestamp: string;
  /** HTTP headers from the incoming request. */
  headers: Record<string, string>;
  /** Parsed or raw request body. */
  body: unknown;
  /** HTTP method used. */
  method: string;
}

/** Result of the code interpreter. */
export interface CodeInterpreterResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Absolute paths to any generated artifact files (images, reports, etc.). */
  artifacts: string[];
  /** Wall-clock duration in milliseconds. */
  duration: number;
}

/** Result of a file transform operation. */
export interface FileTransformResult {
  /** Absolute path to the output file. */
  outputPath: string;
  /** Size of the output file in bytes. */
  size: number;
  /** Wall-clock duration in milliseconds. */
  duration: number;
}

/** Supported file transform types. */
export type TransformType =
  | "csv-to-json"
  | "json-to-csv"
  | "markdown-to-html"
  | "yaml-to-json"
  | "json-to-yaml"
  | "image-resize"
  | "pdf-extract-text";

// ---------------------------------------------------------------------------
// Helper: ensure sandbox directory exists
// ---------------------------------------------------------------------------

async function ensureSandbox(workDir: string = DEFAULT_WORK_DIR): Promise<void> {
  await fs.mkdir(workDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. Command Execution
// ---------------------------------------------------------------------------

/** Map of running PIDs to AbortControllers so they can be killed on demand. */
const runningProcesses = new Map<number, AbortController>();

/**
 * Execute a shell command with timeout, stdin, and environment support.
 *
 * @param cmd       Shell command string (executed via /bin/sh -c).
 * @param opts      Execution options.
 * @returns         CommandResult with stdout, stderr, exitCode, duration.
 */
/** Curated environment variable names passed to subprocesses — prevents leaking secrets. */
const SAFE_ENV_KEYS = ["PATH", "HOME", "LANG", "TERM", "NODE_ENV"];

/**
 * Builds a safe subprocess environment from a curated allowlist of process.env keys
 * plus any caller-supplied overrides. Prevents leaking secrets into subprocesses.
 */
function buildSafeEnv(extraEnv?: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const val = process.env[key];
    if (val !== undefined) safe[key] = val;
  }
  for (const [key, value] of Object.entries(extraEnv ?? {})) {
    if (!isSensitiveKey(key)) safe[key] = value;
  }
  return safe;
}

export async function executeCommand(
  cmd: string,
  opts: CommandOptions = {}
): Promise<CommandResult> {
  const workDir = opts.workDir ?? DEFAULT_WORK_DIR;
  const timeout = Math.min(opts.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  // Use safe env: only curated keys + caller-provided extras (not full process.env)
  const env = buildSafeEnv(opts.env);

  const fileContext = { domain: "filesystem" as const, action: "filesystem:execute", tool: "cli.execute", path: workDir, metadata: { env: redactEnv(opts.env) } };
  const fileDecision = evaluatePolicy(fileContext);
  writePolicyAudit(fileContext, fileDecision);
  if (!fileDecision.allowed) {
    return {
      stdout: "",
      stderr: `Policy denied: ${fileDecision.reason}`,
      exitCode: 1,
      duration: 0,
      timedOut: false,
    };
  }

  await ensureSandbox(workDir);

  const shellContext = { domain: "shell" as const, action: "shell:execute", tool: "cli.execute", command: cmd, metadata: { env: redactEnv(opts.env) } };
  const shellDecision = evaluatePolicy(shellContext);
  writePolicyAudit(shellContext, shellDecision);
  if (!shellDecision.allowed) {
    return {
      stdout: "",
      stderr: `Policy denied: ${shellDecision.reason}`,
      exitCode: 1,
      duration: 0,
      timedOut: false,
    };
  }

  const validation = validateCommand(cmd);
  if (!validation.safe) {
    return {
      stdout: "",
      stderr: `Command blocked: ${validation.reason}`,
      exitCode: 1,
      duration: 0,
      timedOut: false,
    };
  }

  const start = Date.now();
  let timedOut = false;
  const controller = new AbortController();

  return new Promise((resolve) => {
    const proc = spawn("/bin/sh", ["-c", cmd], {
      cwd: workDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (proc.pid !== undefined) {
      runningProcesses.set(proc.pid, controller);
    }

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    if (opts.stdin !== undefined) {
      proc.stdin.write(opts.stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeout);

    controller.signal.addEventListener("abort", () => {
      proc.kill("SIGKILL");
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (proc.pid !== undefined) {
        runningProcesses.delete(proc.pid);
      }
      resolve({
        stdout: redactString(stdout),
        stderr: redactString(stderr),
        exitCode: code,
        duration: Date.now() - start,
        timedOut,
        pid: proc.pid,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (proc.pid !== undefined) {
        runningProcesses.delete(proc.pid);
      }
      resolve({
        stdout: redactString(stdout),
        stderr: redactString(stderr + "\n" + err.message),
        exitCode: 1,
        duration: Date.now() - start,
        timedOut,
        pid: proc.pid,
      });
    });
  });
}

/**
 * Kill a running process by PID.
 *
 * @param pid  PID of the process to kill.
 * @returns    True if a controller was found and abort was signalled.
 */
export function killProcess(pid: number): boolean {
  const controller = runningProcesses.get(pid);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 2. Script Execution
// ---------------------------------------------------------------------------

/** Maps supported languages to their interpreter commands. */
const LANGUAGE_COMMANDS: Record<SupportedLanguage, string> = {
  bash: "bash",
  python3: "python3",
  node: "node",
  typescript: "tsx",
};

/** Maps supported languages to file extensions. */
const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, string> = {
  bash: ".sh",
  python3: ".py",
  node: ".js",
  typescript: ".ts",
};

/**
 * Detect the scripting language from a shebang line.
 *
 * @param script  Script source code.
 * @returns       Detected language or undefined.
 */
function detectLanguageFromShebang(script: string): SupportedLanguage | undefined {
  const firstLine = script.split("\n")[0] ?? "";
  if (!firstLine.startsWith("#!")) return undefined;
  if (/bash|sh/.test(firstLine)) return "bash";
  if (/python/.test(firstLine)) return "python3";
  if (/node/.test(firstLine)) return "node";
  if (/tsx|ts-node/.test(firstLine)) return "typescript";
  return undefined;
}

/**
 * Write a script to a temporary file, execute it, then clean up.
 *
 * @param script    Script source code.
 * @param language  Explicit language override (auto-detected from shebang if omitted).
 * @param args      Command-line arguments passed to the script.
 * @param opts      Additional execution options.
 * @returns         ScriptResult extending CommandResult.
 */
export async function executeScript(
  script: string,
  language?: SupportedLanguage,
  args: string[] = [],
  opts: CommandOptions = {}
): Promise<ScriptResult> {
  const lang = language ?? detectLanguageFromShebang(script) ?? "bash";
  const ext = LANGUAGE_EXTENSIONS[lang];
  const interpreter = LANGUAGE_COMMANDS[lang];
  const scriptPath = path.join(os.tmpdir(), `ultra-script-${uuidv4()}${ext}`);

  await fs.writeFile(scriptPath, script, { encoding: "utf8", mode: 0o700 });

  const argStr = args.map((a) => JSON.stringify(a)).join(" ");
  const cmd = `${interpreter} ${JSON.stringify(scriptPath)} ${argStr}`.trim();

  try {
    const result = await executeCommand(cmd, opts);
    return { ...result, scriptPath, language: lang };
  } finally {
    await fs.rm(scriptPath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// 3. Pipeline Execution
// ---------------------------------------------------------------------------

/**
 * Execute a sequence of commands where each step's stdout feeds the next step's stdin.
 *
 * @param steps       Array of pipeline steps.
 * @param failFast    Stop execution on first non-zero exit (default: true).
 * @returns           PipelineResult with per-step results and final output.
 */
export async function executePipeline(
  steps: PipelineStep[],
  failFast: boolean = true
): Promise<PipelineResult> {
  const results: CommandResult[] = [];
  let previousStdout: string | undefined;
  let failedStep: number | undefined;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stdin = step.stdin ?? previousStdout;
    const result = await executeCommand(step.command, {
      stdin,
      env: step.env,
      timeout: step.timeout,
      workDir: step.workDir,
    });

    results.push(result);

    if (result.exitCode !== 0 && failFast) {
      failedStep = i;
      break;
    }

    previousStdout = result.stdout;
  }

  const success = results.every((r) => r.exitCode === 0);
  return {
    steps: results,
    finalOutput: previousStdout ?? "",
    success,
    failedStep,
  };
}

// ---------------------------------------------------------------------------
// 4. Installed Tools Registry
// ---------------------------------------------------------------------------

interface ToolCache {
  tools: InstalledTool[];
  cachedAt: number;
}

let toolCache: ToolCache | null = null;

/** List of common CLI tools to probe during discovery. */
const PROBED_TOOLS: Array<{ name: string; versionFlag: string }> = [
  { name: "git", versionFlag: "--version" },
  { name: "curl", versionFlag: "--version" },
  { name: "wget", versionFlag: "--version" },
  { name: "jq", versionFlag: "--version" },
  { name: "python3", versionFlag: "--version" },
  { name: "node", versionFlag: "--version" },
  { name: "npm", versionFlag: "--version" },
  { name: "pip", versionFlag: "--version" },
  { name: "pip3", versionFlag: "--version" },
  { name: "ffmpeg", versionFlag: "-version" },
  { name: "yt-dlp", versionFlag: "--version" },
  { name: "docker", versionFlag: "--version" },
  { name: "tsx", versionFlag: "--version" },
  { name: "convert", versionFlag: "--version" }, // ImageMagick
  { name: "pandoc", versionFlag: "--version" },
  { name: "pdftotext", versionFlag: "-v" },
  { name: "rsync", versionFlag: "--version" },
  { name: "ssh", versionFlag: "-V" },
  { name: "tar", versionFlag: "--version" },
  { name: "unzip", versionFlag: "-v" },
];

/**
 * Discover installed CLI tools by probing PATH for each known tool name.
 * Results are cached for 5 minutes.
 *
 * @returns Array of InstalledTool objects for each found executable.
 */
export async function getInstalledTools(): Promise<InstalledTool[]> {
  const now = Date.now();
  if (toolCache && now - toolCache.cachedAt < TOOL_CACHE_TTL_MS) {
    return toolCache.tools;
  }

  const discovered = await Promise.all(
    PROBED_TOOLS.map(async ({ name, versionFlag }) => {
      // Validate tool name before interpolating into shell command
      if (!/^[a-zA-Z0-9_\-\.]+$/.test(name)) return null;
      try {
        const { stdout: whichOut } = await execAsync(`which ${name} 2>/dev/null`, { timeout: 5_000 });
        const toolPath = whichOut.trim();
        if (!toolPath) return null;

        const { stdout: verOut, stderr: verErr } = await execAsync(
          `${toolPath} ${versionFlag} 2>&1`, { timeout: 5_000 }
        ).catch(() => ({ stdout: "", stderr: "unknown" }));
        const version = (verOut || verErr).split("\n")[0].trim();
        return { name, path: toolPath, version } as InstalledTool;
      } catch {
        return null;
      }
    })
  );

  const tools = discovered.filter((t): t is InstalledTool => t !== null);
  toolCache = { tools, cachedAt: now };
  return tools;
}

// ---------------------------------------------------------------------------
// 5. Command Safety Validation
// ---------------------------------------------------------------------------

/** Dangerous patterns that are always blocked. */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+).*\//,
    reason: "Recursive or forced removal of directory paths is not allowed",
  },
  { pattern: /rm\s+-rf\s+\//, reason: "rm -rf / is not allowed" },
  { pattern: /dd\s+if=/, reason: "dd with input file is not allowed" },
  { pattern: /\bshred\b/, reason: "shred (secure disk overwrite) is not allowed" },
  { pattern: /mkfs/, reason: "Filesystem formatting commands are not allowed" },
  {
    pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/,
    reason: "Fork bomb pattern detected",
  },
  { pattern: /shutdown/, reason: "System shutdown commands are not allowed" },
  { pattern: /reboot/, reason: "System reboot commands are not allowed" },
  { pattern: /halt/, reason: "System halt commands are not allowed" },
  { pattern: /poweroff/, reason: "Poweroff commands are not allowed" },
  {
    pattern: />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme)/,
    reason: "Writing directly to block devices is not allowed",
  },
  {
    pattern: /chmod\s+.*777/,
    reason: "chmod 777 (world-writable permissions) is not allowed",
  },
  {
    pattern: /\bchown\b/,
    reason: "chown (ownership changes) is not allowed in sandboxed execution",
  },
  { pattern: /\bsudo\b/, reason: "sudo is not allowed in sandboxed execution" },
  { pattern: /\bsu\s+-/, reason: "User switching is not allowed" },
  // ── Network exfiltration ───────────────────────────────────────────────────
  {
    pattern: /\bcurl\b/,
    reason: "curl (network access) is not allowed in sandboxed execution",
  },
  {
    pattern: /\bwget\b/,
    reason: "wget (network access) is not allowed in sandboxed execution",
  },
  {
    pattern: /\bnc\b|\bnetcat\b/,
    reason: "netcat (raw network access) is not allowed in sandboxed execution",
  },
  {
    pattern: /\bnmap\b/,
    reason: "nmap (network scanning) is not allowed in sandboxed execution",
  },
  {
    pattern: /\btelnet\b/,
    reason: "telnet (cleartext remote access) is not allowed in sandboxed execution",
  },
  // ── Code execution bypasses ────────────────────────────────────────────────
  {
    pattern: /\bbase64\b.*-d\b|--decode\b/,
    reason: "base64 decode piped to execution is a common bypass pattern — not allowed",
  },
  {
    pattern: /\bpython[23]?\s+-c\b/,
    reason: "python -c (inline code execution) is not allowed in sandboxed execution",
  },
  {
    pattern: /\bperl\s+-e\b/,
    reason: "perl -e (inline code execution) is not allowed in sandboxed execution",
  },
  {
    pattern: /\bruby\s+-e\b/,
    reason: "ruby -e (inline code execution) is not allowed in sandboxed execution",
  },
  // ── Persistence mechanisms ─────────────────────────────────────────────────
  {
    pattern: /\bcrontab\b/,
    reason: "crontab (scheduled persistence) is not allowed in sandboxed execution",
  },
  // ── Lateral movement / remote operations ──────────────────────────────────
  {
    // Block ssh/scp/rsync to remote hosts (pattern: command followed by user@host or -h host)
    pattern: /\bssh\b.*@|\bscp\b.*@|\brsync\b.*@/,
    reason: "SSH/SCP/rsync to remote hosts (lateral movement) is not allowed",
  },
  // Bash built-in network access
  { pattern: /\/dev\/(tcp|udp)\//, reason: "Bash /dev/tcp and /dev/udp network access is not allowed" },
  { pattern: /\bexec\s+\d+<>/, reason: "exec fd redirect to network not allowed" },
  { pattern: /\bsocat\b/, reason: "socat is not allowed" },
  // node inline execution
  { pattern: /\bnode\s+(-e|--eval)\b/, reason: "node -e / --eval inline execution is not allowed" },
  // Package manager installs (network + arbitrary code via install scripts)
  { pattern: /\bpip3?\s+install\b/, reason: "pip install is not allowed in sandboxed execution" },
  { pattern: /\bnpm\s+(install|i)\b/, reason: "npm install is not allowed in sandboxed execution" },
  // Generalized fork bomb (matches both compact and spaced variants)
  { pattern: /\w+\s*\(\s*\)\s*\{[^}]*\|[^}]*&[^}]*\}/, reason: "Fork bomb pattern detected" },
];

/** Default allowlist — commands that bypass pattern checks. Extend as needed. */
const ALLOWED_COMMANDS: string[] = [];

/** Custom blocklist entries added at runtime. */
const customBlocklist: Array<{ pattern: RegExp; reason: string }> = [];

/**
 * Validate a shell command against safety rules.
 *
 * @param cmd         Command string to validate.
 * @param allowlist   Additional patterns that are always allowed.
 * @param blocklist   Additional patterns that are always blocked.
 * @returns           ValidationResult indicating whether the command is safe.
 */
export function validateCommand(
  cmd: string,
  allowlist: RegExp[] = [],
  blocklist: Array<{ pattern: RegExp; reason: string }> = []
): ValidationResult {
  // Check allowlist first
  const allAllowed = [
    ...ALLOWED_COMMANDS.map((c) => new RegExp(`^${c}`)),
    ...allowlist,
  ];
  if (allAllowed.some((p) => p.test(cmd))) {
    return { safe: true };
  }

  // Check combined blocklist
  const allBlocked = [...BLOCKED_PATTERNS, ...customBlocklist, ...blocklist];
  for (const entry of allBlocked) {
    if (entry.pattern.test(cmd)) {
      // Audit log: record every blocked command for security review.
      console.warn(`[cliToolEngine] BLOCKED command | rule: ${entry.pattern.source} | reason: ${entry.reason} | cmd: ${redactString(cmd).slice(0, 200)}`);
      return { safe: false, reason: entry.reason, matchedRule: entry.pattern.source };
    }
  }

  // DESIGN CHOICE — Blocklist-only mode:
  // This function uses a blocklist (deny-list) approach: commands are allowed
  // by default unless they match a blocked pattern or are explicitly in the
  // allowlist. If ALLOWED_COMMANDS is non-empty, commands NOT in the allowlist
  // are rejected first (see check above). Since ALLOWED_COMMANDS is currently
  // empty, all commands pass through to the blocklist check.
  //
  // If you want full allowlist (default-deny) behaviour, populate
  // ALLOWED_COMMANDS with every permitted command prefix — then nothing outside
  // that list will be executed regardless of the blocklist.
  return { safe: true };
}

/**
 * Add a custom pattern to the global command blocklist.
 *
 * @param pattern  Regex to match against command strings.
 * @param reason   Human-readable explanation.
 */
export function addToBlocklist(pattern: RegExp, reason: string): void {
  customBlocklist.push({ pattern, reason });
}

// ---------------------------------------------------------------------------
// 6. HTTP Tool
// ---------------------------------------------------------------------------

/**
 * Execute an outbound HTTP request.
 *
 * @param config  Request configuration.
 * @returns       HttpResponse with status, headers, body, and duration.
 */
export async function executeHttpRequest(
  config: HttpRequestConfig
): Promise<HttpResponse> {
  const {
    url,
    method = "GET",
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT_MS,
    followRedirects = true,
    responseType = "json",
  } = config;

  const start = Date.now();

  let fetchBody: BodyInit | undefined;
  const reqHeaders: Record<string, string> = { ...headers };

  if (body !== undefined) {
    if (typeof body === "string") {
      fetchBody = body;
    } else if (body instanceof FormData) {
      fetchBody = body;
      // Let fetch set the Content-Type with boundary for multipart
    } else {
      fetchBody = JSON.stringify(body);
      reqHeaders["Content-Type"] ??= "application/json";
    }
  }

  const response = await governedFetch(url, {
    method,
    headers: reqHeaders,
    body: fetchBody,
  }, "cli-http", "network", "network:http_request", {
    timeoutMs: timeout,
    maxRedirects: followRedirects ? undefined : 0,
  });

  const respHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    respHeaders[key] = value;
  });

  let respBody: unknown;
  if (responseType === "json") {
    try {
      respBody = await response.json();
    } catch {
      respBody = await response.text();
    }
  } else if (responseType === "blob") {
    const buf = await response.arrayBuffer();
    respBody = Buffer.from(buf).toString("base64");
  } else {
    respBody = await response.text();
  }

  return {
    status: response.status,
    headers: respHeaders,
    body: respBody,
    duration: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// 7. Webhook Registry
// ---------------------------------------------------------------------------

class WebhookRegistryImpl {
  private readonly webhooks = new Map<string, WebhookConfig>();
  private readonly history = new Map<string, WebhookInvocation[]>();

  /**
   * Register a handler for incoming POST requests at /api/webhooks/:id.
   *
   * @param id       Unique webhook identifier.
   * @param path     URL path segment (e.g. "my-event").
   * @param handler  Async function invoked on each request.
   */
  registerWebhook(
    id: string,
    path: string,
    handler: (invocation: WebhookInvocation) => Promise<void>
  ): void {
    this.webhooks.set(id, {
      id,
      path,
      handler,
      registeredAt: new Date().toISOString(),
    });
    this.history.set(id, []);
  }

  /**
   * Remove a registered webhook and its history.
   *
   * @param id  Webhook identifier to remove.
   * @returns   True if the webhook existed.
   */
  unregisterWebhook(id: string): boolean {
    const existed = this.webhooks.has(id);
    this.webhooks.delete(id);
    this.history.delete(id);
    return existed;
  }

  /**
   * List all currently registered webhooks (without handlers).
   *
   * @returns Array of webhook configs (handler omitted for serialisation safety).
   */
  listWebhooks(): Omit<WebhookConfig, "handler">[] {
    return Array.from(this.webhooks.values()).map(({ id, path, registeredAt }) => ({
      id,
      path,
      registeredAt,
    }));
  }

  /**
   * Retrieve invocation history for a webhook.
   *
   * @param id     Webhook identifier.
   * @param limit  Maximum number of records to return (default: all).
   * @returns      Array of invocations, newest first.
   */
  getWebhookHistory(id: string, limit?: number): WebhookInvocation[] {
    const records = this.history.get(id) ?? [];
    const sorted = [...records].reverse();
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Dispatch an incoming request payload to the matching webhook handler.
   * Records the invocation in history (capped at MAX_WEBHOOK_HISTORY).
   *
   * @param id          Webhook ID (extracted from request path).
   * @param method      HTTP method of the incoming request.
   * @param headers     Incoming request headers.
   * @param body        Parsed or raw request body.
   * @returns           True if a handler was found and invoked.
   */
  async dispatch(
    id: string,
    method: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<boolean> {
    const config = this.webhooks.get(id);
    if (!config) return false;

    const invocation: WebhookInvocation = {
      invocationId: uuidv4(),
      webhookId: id,
      timestamp: new Date().toISOString(),
      headers,
      body,
      method,
    };

    // Store in history, evict oldest if over cap
    const hist = this.history.get(id) ?? [];
    hist.push(invocation);
    if (hist.length > MAX_WEBHOOK_HISTORY) {
      hist.splice(0, hist.length - MAX_WEBHOOK_HISTORY);
    }
    this.history.set(id, hist);

    await config.handler(invocation);
    return true;
  }

  /**
   * Resolve a URL path to a webhook ID, if one is registered at that path.
   *
   * @param urlPath  The incoming request path to match.
   * @returns        Webhook ID or undefined.
   */
  resolveByPath(urlPath: string): string | undefined {
    for (const [id, cfg] of this.webhooks.entries()) {
      if (urlPath.endsWith(cfg.path) || urlPath.endsWith(id)) {
        return id;
      }
    }
    return undefined;
  }
}

/** Singleton WebhookRegistry instance. */
export const webhookRegistry = new WebhookRegistryImpl();
export { WebhookRegistryImpl as WebhookRegistry };

// ---------------------------------------------------------------------------
// 8. Code Interpreter
// ---------------------------------------------------------------------------

/** Regex to extract pip package list from comment header: # pip: pkg1, pkg2 */
const PIP_HEADER_RE = /^#\s*pip:\s*(.+)$/m;
/** Regex to extract npm package list from comment header: // npm: pkg1, pkg2 */
const NPM_HEADER_RE = /^\/\/\s*npm:\s*(.+)$/m;

/**
 * Execute code in a lightly sandboxed interpreter with optional auto-install
 * of declared pip / npm packages. Captures artifacts written to the OS temp dir.
 *
 * @param code      Source code to execute.
 * @param language  Target language (default: python3).
 * @param opts      Additional command execution options.
 * @returns         CodeInterpreterResult including stdout, stderr, artifacts.
 */
export async function executeCodeInterpreter(
  code: string,
  language: SupportedLanguage = "python3",
  opts: CommandOptions = {}
): Promise<CodeInterpreterResult> {
  const start = Date.now();

  /** Validates a package name is safe to pass to pip/npm. */
  const SAFE_PACKAGE_RE = /^[a-zA-Z0-9\-_.>=<!]+$/;

  // Auto-install pip packages
  if (language === "python3") {
    const pipMatch = PIP_HEADER_RE.exec(code);
    if (pipMatch) {
      const packages = pipMatch[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => SAFE_PACKAGE_RE.test(p)); // validate before passing to pip
      if (packages.length > 0) {
        // Use spawnSync directly (not executeCommand) to bypass the validateCommand
        // blocklist — these are hardcoded, validated package names, not user input.
        spawnSync("pip3", ["install", "--quiet", ...packages], {
          timeout: 120_000,
          stdio: "ignore",
        });
      }
    }
  }

  // Auto-install npm packages
  if (language === "node" || language === "typescript") {
    const npmMatch = NPM_HEADER_RE.exec(code);
    if (npmMatch) {
      const packages = npmMatch[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => SAFE_PACKAGE_RE.test(p)); // validate before passing to npm
      if (packages.length > 0) {
        // Use spawnSync directly (not executeCommand) to bypass the validateCommand
        // blocklist — these are hardcoded, validated package names, not user input.
        spawnSync("npm", ["install", "--save", ...packages], {
          timeout: 120_000,
          cwd: opts.workDir ?? DEFAULT_WORK_DIR,
          stdio: "ignore",
        });
      }
    }
  }

  // Capture artifacts written to a dedicated artifact directory
  const artifactDir = path.join(os.tmpdir(), `ultra-artifacts-${uuidv4()}`);
  await fs.mkdir(artifactDir, { recursive: true });

  // Inject artifact dir as environment variable so scripts can target it
  const env: Record<string, string> = {
    ...(opts.env ?? {}),
    ULTRA_ARTIFACT_DIR: artifactDir,
    MPLBACKEND: "Agg", // non-interactive matplotlib backend
  };

  const result = await executeScript(code, language, [], { ...opts, env });

  // Collect any files written to the artifact directory
  let artifacts: string[] = [];
  try {
    const entries = await fs.readdir(artifactDir);
    artifacts = entries.map((e) => path.join(artifactDir, e));
  } catch {
    // Directory may be empty or removed
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    artifacts,
    duration: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// 9. File Transform
// ---------------------------------------------------------------------------

/**
 * Transform a file from one format to another using built-in CLI tools or Python.
 *
 * @param inputPath     Absolute path to the source file.
 * @param outputPath    Absolute path where the transformed file should be written.
 * @param transformType One of the supported transform identifiers.
 * @param options       Transform-specific options (e.g. width/height for image-resize).
 * @returns             FileTransformResult with path, size, and duration.
 */
export async function executeFileTransform(
  inputPath: string,
  outputPath: string,
  transformType: TransformType,
  options: Record<string, unknown> = {}
): Promise<FileTransformResult> {
  const start = Date.now();
  const inQ = JSON.stringify(inputPath);
  const outQ = JSON.stringify(outputPath);

  switch (transformType) {
    case "csv-to-json": {
      // Use Python to convert CSV → JSON array
      const script = `
import csv, json, sys
with open(${JSON.stringify(inputPath)}, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
with open(${JSON.stringify(outputPath)}, 'w', encoding='utf-8') as f:
    json.dump(rows, f, indent=2)
print(f"Converted {len(rows)} rows")
`;
      const r = await executeScript(script, "python3");
      if (r.exitCode !== 0) throw new Error(`csv-to-json failed: ${r.stderr}`);
      break;
    }

    case "json-to-csv": {
      const script = `
import csv, json, sys
with open(${JSON.stringify(inputPath)}, encoding='utf-8') as f:
    data = json.load(f)
if not isinstance(data, list):
    data = [data]
fieldnames = list(data[0].keys()) if data else []
with open(${JSON.stringify(outputPath)}, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(data)
print(f"Converted {len(data)} rows")
`;
      const r = await executeScript(script, "python3");
      if (r.exitCode !== 0) throw new Error(`json-to-csv failed: ${r.stderr}`);
      break;
    }

    case "markdown-to-html": {
      // Prefer pandoc; fall back to Python markdown
      const pandocCheck = await executeCommand("which pandoc");
      if (pandocCheck.exitCode === 0) {
        const r = await executeCommand(`pandoc -f markdown -t html ${inQ} -o ${outQ}`);
        if (r.exitCode !== 0) throw new Error(`markdown-to-html (pandoc) failed: ${r.stderr}`);
      } else {
        const script = `
import sys
try:
    import markdown
except ImportError:
    import subprocess; subprocess.run([sys.executable, '-m', 'pip', 'install', 'markdown', '-q'])
    import markdown
with open(${JSON.stringify(inputPath)}, encoding='utf-8') as f:
    src = f.read()
html = markdown.markdown(src, extensions=['tables','fenced_code'])
with open(${JSON.stringify(outputPath)}, 'w', encoding='utf-8') as f:
    f.write(html)
print("Done")
`;
        const r = await executeScript(script, "python3");
        if (r.exitCode !== 0) throw new Error(`markdown-to-html (python) failed: ${r.stderr}`);
      }
      break;
    }

    case "yaml-to-json": {
      const script = `
import yaml, json, sys
try:
    import yaml
except ImportError:
    import subprocess; subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyyaml', '-q'])
    import yaml
with open(${JSON.stringify(inputPath)}, encoding='utf-8') as f:
    data = yaml.safe_load(f)
with open(${JSON.stringify(outputPath)}, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
print("Done")
`;
      const r = await executeScript(script, "python3");
      if (r.exitCode !== 0) throw new Error(`yaml-to-json failed: ${r.stderr}`);
      break;
    }

    case "json-to-yaml": {
      const script = `
import yaml, json, sys
try:
    import yaml
except ImportError:
    import subprocess; subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyyaml', '-q'])
    import yaml
with open(${JSON.stringify(inputPath)}, encoding='utf-8') as f:
    data = json.load(f)
with open(${JSON.stringify(outputPath)}, 'w', encoding='utf-8') as f:
    yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
print("Done")
`;
      const r = await executeScript(script, "python3");
      if (r.exitCode !== 0) throw new Error(`json-to-yaml failed: ${r.stderr}`);
      break;
    }

    case "image-resize": {
      // Validate width/height are positive integers before constructing geometry string
      const rawWidth = options.width;
      const rawHeight = options.height;
      const width = (Number.isInteger(rawWidth) && (rawWidth as number) > 0)
        ? (rawWidth as number)
        : 800;
      const height = (Number.isInteger(rawHeight) && (rawHeight as number) > 0)
        ? (rawHeight as number)
        : 0;
      const geometry = height > 0 ? `${width}x${height}` : `${width}`;
      // Try ImageMagick convert, then ffmpeg as fallback
      const convertCheck = await executeCommand("which convert");
      if (convertCheck.exitCode === 0) {
        const r = await executeCommand(
          `convert ${inQ} -resize ${geometry} ${outQ}`
        );
        if (r.exitCode !== 0) throw new Error(`image-resize (convert) failed: ${r.stderr}`);
      } else {
        const ffmpegGeom = height > 0 ? `${width}:${height}` : `${width}:-1`;
        const r = await executeCommand(
          `ffmpeg -y -i ${inQ} -vf "scale=${ffmpegGeom}" ${outQ}`
        );
        if (r.exitCode !== 0) throw new Error(`image-resize (ffmpeg) failed: ${r.stderr}`);
      }
      break;
    }

    case "pdf-extract-text": {
      // Try pdftotext, then pdfminer via Python
      const pdftotextCheck = await executeCommand("which pdftotext");
      if (pdftotextCheck.exitCode === 0) {
        const r = await executeCommand(`pdftotext ${inQ} ${outQ}`);
        if (r.exitCode !== 0) throw new Error(`pdf-extract-text (pdftotext) failed: ${r.stderr}`);
      } else {
        const script = `
import sys
try:
    from pdfminer.high_level import extract_text
except ImportError:
    import subprocess; subprocess.run([sys.executable, '-m', 'pip', 'install', 'pdfminer.six', '-q'])
    from pdfminer.high_level import extract_text
text = extract_text(${JSON.stringify(inputPath)})
with open(${JSON.stringify(outputPath)}, 'w', encoding='utf-8') as f:
    f.write(text)
print(f"Extracted {len(text)} characters")
`;
        const r = await executeScript(script, "python3");
        if (r.exitCode !== 0) throw new Error(`pdf-extract-text (pdfminer) failed: ${r.stderr}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown transform type: ${transformType}`);
  }

  const stat = await fs.stat(outputPath);
  return {
    outputPath,
    size: stat.size,
    duration: Date.now() - start,
  };
}

// All types are exported inline above via `export interface` / `export type`.
