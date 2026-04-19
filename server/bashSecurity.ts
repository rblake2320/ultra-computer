/**
 * bashSecurity.ts
 *
 * AST-based bash command security analyzer for Ultra Computer.
 * Inspired by Claude Code's bash security system, this module parses
 * shell commands into an Abstract Syntax Tree to detect obfuscated
 * attacks, nested subshells, dangerous builtins, and environment
 * manipulation that simple regex matching would miss.
 *
 * Provides defense-in-depth alongside Docker sandboxing.
 *
 * @module bashSecurity
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Classification of a command's risk level. */
export type CommandRisk = "safe" | "read_only" | "write" | "destructive" | "blocked";

/** Result of AST-based security analysis. */
export interface BashSecurityResult {
  /** Whether the command is allowed to execute. */
  allowed: boolean;
  /** Risk classification. */
  risk: CommandRisk;
  /** Human-readable explanation of the decision. */
  reason: string;
  /** Specific AST nodes or patterns that triggered the decision. */
  triggers: string[];
  /** Parsed command components for audit logging. */
  parsedComponents: ParsedCommand[];
}

/** A single parsed command from the AST. */
export interface ParsedCommand {
  /** The base command (e.g., "rm", "cat", "curl"). */
  command: string;
  /** Parsed arguments/flags. */
  args: string[];
  /** Whether this command is inside a subshell. */
  inSubshell: boolean;
  /** Whether this command is piped from another. */
  isPiped: boolean;
  /** Whether this command uses redirection. */
  hasRedirection: boolean;
  /** The redirection target, if any. */
  redirectTarget?: string;
}

// ---------------------------------------------------------------------------
// Dangerous Command Databases
// ---------------------------------------------------------------------------

/** Commands that are always blocked regardless of context. */
const ALWAYS_BLOCKED: Set<string> = new Set([
  "mkfs", "mkfs.ext4", "mkfs.xfs", "mkfs.btrfs",
  "fdisk", "parted", "gdisk",
  "shutdown", "reboot", "halt", "poweroff", "init",
  "insmod", "rmmod", "modprobe",
  "iptables", "ip6tables", "nft",
  "mount", "umount",
  "chroot",
  "zmodload", "emulate",
]);

/** Commands classified as read-only (safe for most contexts). */
const READ_ONLY_COMMANDS: Set<string> = new Set([
  "ls", "cat", "head", "tail", "less", "more", "wc", "file",
  "find", "locate", "which", "whereis", "type", "whatis",
  "grep", "egrep", "fgrep", "rg", "ag", "ack",
  "diff", "cmp", "comm",
  "echo", "printf", "date", "cal", "uptime", "uname",
  "whoami", "id", "groups", "hostname",
  "pwd", "env", "printenv", "set",
  "ps", "top", "htop", "free", "df", "du", "lsof",
  "netstat", "ss", "ifconfig", "ip",
  "git log", "git status", "git diff", "git show", "git branch",
  "npm ls", "npm list", "npm view", "npm info",
  "node --version", "python3 --version", "pip3 list",
  "jq", "yq", "xmllint",
  "stat", "readlink", "realpath", "basename", "dirname",
  "md5sum", "sha256sum", "sha1sum",
  "sort", "uniq", "cut", "tr", "sed", "awk",
  "tee", "xargs",
]);

/** Commands that modify the filesystem (write operations). */
const WRITE_COMMANDS: Set<string> = new Set([
  "cp", "mv", "mkdir", "touch", "ln",
  "git add", "git commit", "git push", "git checkout", "git merge",
  "npm install", "npm update", "npm uninstall",
  "pip3 install", "pip install",
  "chmod", "chown", "chgrp",
]);

/** Commands that are destructive (data loss potential). */
const DESTRUCTIVE_COMMANDS: Set<string> = new Set([
  "rm", "rmdir", "shred",
  "git reset --hard", "git clean -fd",
  "dd",
  "truncate",
]);

/** Dangerous flag combinations that escalate risk. */
const DANGEROUS_FLAGS: Array<{ command: string; flags: string[]; reason: string }> = [
  { command: "rm", flags: ["-rf", "-fr", "--recursive --force"], reason: "Recursive forced deletion" },
  { command: "rm", flags: ["-rf /", "-rf /*"], reason: "Attempted root filesystem deletion" },
  { command: "chmod", flags: ["777"], reason: "World-writable permissions" },
  { command: "chmod", flags: ["-R 777"], reason: "Recursive world-writable permissions" },
  { command: "curl", flags: ["|", "| bash", "| sh"], reason: "Piped download to shell execution" },
  { command: "wget", flags: ["-O -", "| bash", "| sh"], reason: "Piped download to shell execution" },
  { command: "dd", flags: ["of=/dev/"], reason: "Writing to block device" },
  { command: "git", flags: ["push --force", "push -f"], reason: "Force push can destroy remote history" },
];

/** Environment variables that should not be overwritten. */
const PROTECTED_ENV_VARS: Set<string> = new Set([
  "PATH", "HOME", "USER", "SHELL", "LD_PRELOAD", "LD_LIBRARY_PATH",
  "PYTHONPATH", "NODE_PATH", "OPENAI_API_KEY",
]);

// ---------------------------------------------------------------------------
// AST Parser
// ---------------------------------------------------------------------------

/**
 * Tokenize a bash command string into components.
 * Handles quoting, escaping, subshells, pipes, and redirections.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  let depth = 0; // subshell depth

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      current += ch;
      continue;
    }

    // Track subshell depth
    if (ch === "(" || (ch === "$" && input[i + 1] === "(")) {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")" && depth > 0) {
      depth--;
      current += ch;
      continue;
    }

    // Token separators
    if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    // Operators
    if (ch === "|" || ch === ";" || ch === "&" || ch === "\n") {
      if (current) tokens.push(current);
      current = "";
      if (ch === "|" && input[i + 1] === "|") {
        tokens.push("||");
        i++;
      } else if (ch === "&" && input[i + 1] === "&") {
        tokens.push("&&");
        i++;
      } else if (ch === "&") {
        tokens.push("&");
      } else {
        tokens.push(ch);
      }
      continue;
    }

    // Redirections
    if (ch === ">" || ch === "<") {
      if (current) tokens.push(current);
      current = "";
      if (ch === ">" && input[i + 1] === ">") {
        tokens.push(">>");
        i++;
      } else {
        tokens.push(ch);
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

/**
 * Parse tokenized command into structured ParsedCommand objects.
 */
function parseTokens(tokens: string[]): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  let currentCmd: Partial<ParsedCommand> = { args: [], inSubshell: false, isPiped: false, hasRedirection: false };
  let isPiped = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Command separators
    if (token === "|") {
      if (currentCmd.command) {
        commands.push(currentCmd as ParsedCommand);
      }
      currentCmd = { args: [], inSubshell: false, isPiped: true, hasRedirection: false };
      isPiped = true;
      continue;
    }

    if (token === ";" || token === "&&" || token === "||" || token === "&" || token === "\n") {
      if (currentCmd.command) {
        commands.push(currentCmd as ParsedCommand);
      }
      currentCmd = { args: [], inSubshell: false, isPiped: false, hasRedirection: false };
      isPiped = false;
      continue;
    }

    // Redirections
    if (token === ">" || token === ">>" || token === "<") {
      currentCmd.hasRedirection = true;
      if (i + 1 < tokens.length) {
        currentCmd.redirectTarget = tokens[i + 1];
        i++; // skip the target
      }
      continue;
    }

    // First non-operator token is the command
    if (!currentCmd.command) {
      // Handle env var assignments before command (e.g., FOO=bar cmd)
      if (token.includes("=") && !token.startsWith("-")) {
        currentCmd.args!.push(token);
        continue;
      }
      currentCmd.command = token;
      currentCmd.isPiped = isPiped;
    } else {
      currentCmd.args!.push(token);
    }
  }

  if (currentCmd.command) {
    commands.push(currentCmd as ParsedCommand);
  }

  return commands;
}

// ---------------------------------------------------------------------------
// Security Analysis
// ---------------------------------------------------------------------------

/**
 * Detect subshell and command substitution patterns that could hide malicious commands.
 */
function detectSubshellAttacks(input: string): string[] {
  const triggers: string[] = [];

  // $(...) command substitution
  const cmdSubRegex = /\$\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = cmdSubRegex.exec(input)) !== null) {
    triggers.push(`Command substitution detected: $(${match[1]})`);
  }

  // Backtick command substitution
  const backtickRegex = /`([^`]+)`/g;
  while ((match = backtickRegex.exec(input)) !== null) {
    triggers.push(`Backtick substitution detected: \`${match[1]}\``);
  }

  // Process substitution <(...) or >(...)
  const procSubRegex = /[<>]\(([^)]+)\)/g;
  while ((match = procSubRegex.exec(input)) !== null) {
    triggers.push(`Process substitution detected: ${match[0]}`);
  }

  // Eval
  if (/\beval\b/.test(input)) {
    triggers.push("eval detected — can execute arbitrary code");
  }

  // Base64 decode piped to execution
  if (/base64\s+(-d|--decode).*\|\s*(bash|sh|zsh|exec)/.test(input)) {
    triggers.push("Base64 decode piped to shell execution");
  }

  // Hex/octal escape sequences that could hide commands
  if (/\\x[0-9a-fA-F]{2}/.test(input) || /\\[0-7]{3}/.test(input)) {
    triggers.push("Hex/octal escape sequences detected — potential obfuscation");
  }

  // Fork bomb patterns (various forms)
  if (/:\(\)\s*\{.*\}/.test(input) || /\.\(\)\s*\{.*\}/.test(input)) {
    triggers.push("Fork bomb pattern detected");
  }

  return triggers;
}

/**
 * Check for dangerous environment variable manipulation.
 */
function detectEnvManipulation(input: string): string[] {
  const triggers: string[] = [];

  for (const envVar of PROTECTED_ENV_VARS) {
    const pattern = new RegExp(`\\b${envVar}\\s*=`);
    if (pattern.test(input)) {
      triggers.push(`Protected environment variable modification: ${envVar}`);
    }
  }

  // export with protected vars
  const exportPattern = /\bexport\s+(\w+)=/g;
  let match: RegExpExecArray | null;
  while ((match = exportPattern.exec(input)) !== null) {
    if (PROTECTED_ENV_VARS.has(match[1])) {
      triggers.push(`Export of protected variable: ${match[1]}`);
    }
  }

  // unset of protected vars
  const unsetPattern = /\bunset\s+(\w+)/g;
  while ((match = unsetPattern.exec(input)) !== null) {
    if (PROTECTED_ENV_VARS.has(match[1])) {
      triggers.push(`Unset of protected variable: ${match[1]}`);
    }
  }

  return triggers;
}

/**
 * Classify a parsed command's risk level.
 */
function classifyCommand(cmd: ParsedCommand): { risk: CommandRisk; reason: string } {
  const baseCmd = cmd.command.replace(/^(\/usr\/bin\/|\/bin\/|\/usr\/local\/bin\/)/, "");

  // Always blocked
  if (ALWAYS_BLOCKED.has(baseCmd)) {
    return { risk: "blocked", reason: `Command '${baseCmd}' is always blocked` };
  }

  // Check dangerous flag combinations
  for (const df of DANGEROUS_FLAGS) {
    if (baseCmd === df.command || cmd.command === df.command) {
      const argStr = cmd.args.join(" ");
      for (const flag of df.flags) {
        if (argStr.includes(flag) || (flag === "|" && cmd.isPiped)) {
          return { risk: "blocked", reason: df.reason };
        }
      }
    }
  }

  // Check for pipe to shell (curl | bash pattern)
  if ((baseCmd === "curl" || baseCmd === "wget") && cmd.isPiped) {
    return { risk: "blocked", reason: "Download piped to execution is blocked" };
  }

  // Destructive commands
  if (DESTRUCTIVE_COMMANDS.has(baseCmd)) {
    return { risk: "destructive", reason: `'${baseCmd}' is a destructive command` };
  }

  // Write commands
  if (WRITE_COMMANDS.has(baseCmd)) {
    return { risk: "write", reason: `'${baseCmd}' modifies the filesystem` };
  }

  // Redirection to sensitive paths
  if (cmd.hasRedirection && cmd.redirectTarget) {
    const target = cmd.redirectTarget;
    if (target.startsWith("/dev/") || target.startsWith("/etc/") || target.startsWith("/sys/") || target.startsWith("/proc/")) {
      return { risk: "blocked", reason: `Redirection to sensitive path: ${target}` };
    }
  }

  // Read-only commands
  if (READ_ONLY_COMMANDS.has(baseCmd)) {
    return { risk: "read_only", reason: `'${baseCmd}' is a read-only command` };
  }

  // Default: write (unknown commands are treated as potentially modifying)
  return { risk: "write", reason: `Unknown command '${baseCmd}' — treated as write operation` };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform comprehensive AST-based security analysis on a bash command.
 *
 * This is the primary entry point. It tokenizes, parses, classifies,
 * and checks for obfuscation patterns, returning a detailed security result.
 *
 * @param command  The raw bash command string to analyze.
 * @returns        Detailed security analysis result.
 */
export function analyzeBashCommand(command: string): BashSecurityResult {
  const triggers: string[] = [];

  // Phase 1: Detect subshell and obfuscation attacks on raw string
  const subshellTriggers = detectSubshellAttacks(command);
  triggers.push(...subshellTriggers);

  // Phase 2: Detect environment manipulation
  const envTriggers = detectEnvManipulation(command);
  triggers.push(...envTriggers);

  // Phase 3: Tokenize and parse into AST
  const tokens = tokenize(command);
  const parsedCommands = parseTokens(tokens);

  // Phase 4: Classify each command
  let worstRisk: CommandRisk = "safe";
  const riskOrder: CommandRisk[] = ["safe", "read_only", "write", "destructive", "blocked"];

  for (const cmd of parsedCommands) {
    const { risk, reason } = classifyCommand(cmd);
    if (riskOrder.indexOf(risk) > riskOrder.indexOf(worstRisk)) {
      worstRisk = risk;
      triggers.push(reason);
    }
  }

  // Subshell attacks escalate to blocked if they contain dangerous patterns
  if (subshellTriggers.length > 0) {
    // Re-analyze the content inside substitutions
    for (const trigger of subshellTriggers) {
      if (trigger.includes("eval") || trigger.includes("base64") || trigger.includes("Fork bomb")) {
        worstRisk = "blocked";
        break;
      }
    }
    // Subshells with unknown commands escalate to at least "write"
    if (riskOrder.indexOf(worstRisk) < riskOrder.indexOf("write")) {
      worstRisk = "write";
    }
  }

  // Env manipulation escalates to at least "destructive"
  if (envTriggers.length > 0 && riskOrder.indexOf(worstRisk) < riskOrder.indexOf("destructive")) {
    worstRisk = "destructive";
  }

  const allowed = worstRisk !== "blocked";

  return {
    allowed,
    risk: worstRisk,
    reason: allowed
      ? `Command classified as '${worstRisk}' — allowed with monitoring`
      : `Command BLOCKED: ${triggers[triggers.length - 1] || "security policy violation"}`,
    triggers,
    parsedComponents: parsedCommands,
  };
}

/**
 * Quick check: is this command read-only?
 * Useful for deciding whether to allow without confirmation.
 */
export function isReadOnlyCommand(command: string): boolean {
  const result = analyzeBashCommand(command);
  return result.risk === "safe" || result.risk === "read_only";
}

/**
 * Quick check: is this command destructive?
 */
export function isDestructiveCommand(command: string): boolean {
  const result = analyzeBashCommand(command);
  return result.risk === "destructive" || result.risk === "blocked";
}
