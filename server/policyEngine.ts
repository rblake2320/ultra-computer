import fs from "fs";
import path from "path";
import { z } from "zod";
import { isPathInside } from "./pathSafety.js";
import { redactValue } from "./redaction.js";

const POLICY_DIR = path.resolve(process.cwd(), "policies");
const AUDIT_DIR = path.resolve(process.cwd(), "data/policy");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.jsonl");

const domainSchema = z.enum(["tool", "network", "filesystem", "github", "shell"]);
export type PolicyDomain = z.infer<typeof domainSchema>;

const ruleSchema = z.object({
  id: z.string().min(1),
  effect: z.enum(["allow", "deny"]),
  actions: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  connectors: z.array(z.string()).optional(),
  urlSchemes: z.array(z.string()).optional(),
  urlHosts: z.array(z.string()).optional(),
  methods: z.array(z.string()).optional(),
  pathRoots: z.array(z.enum(["sandbox", "tmpSandbox"])).optional(),
  commandPatterns: z.array(z.string()).optional(),
  toolNamePatterns: z.array(z.string()).optional(),
  reason: z.string().min(1),
});

const policySchema = z.object({
  version: z.literal(1),
  domain: domainSchema,
  defaultEffect: z.enum(["deny"]),
  rules: z.array(ruleSchema).default([]),
});

export type PolicyRule = z.infer<typeof ruleSchema>;
export type PolicyFile = z.infer<typeof policySchema>;

export interface PolicyContext {
  domain: PolicyDomain;
  action: string;
  tool?: string;
  toolName?: string;
  connectorId?: string;
  actor?: string;
  sessionId?: string;
  command?: string;
  url?: string;
  method?: string;
  path?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  ruleId?: string;
  domain: PolicyDomain;
  action: string;
}

export interface PolicyAuditRecord extends PolicyDecision {
  timestamp: string;
  tool?: string;
  toolName?: string;
  connectorId?: string;
  actor?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

const policyFiles = new Map<PolicyDomain, PolicyFile>();

function policyPath(domain: PolicyDomain): string {
  return path.join(POLICY_DIR, `${domain === "tool" ? "tool" : domain}-access.json`);
}

function loadPolicy(domain: PolicyDomain): PolicyFile {
  const cached = policyFiles.get(domain);
  if (cached) return cached;

  const raw = fs.readFileSync(policyPath(domain), "utf-8");
  const parsed = policySchema.parse(JSON.parse(raw));
  if (parsed.domain !== domain) {
    throw new Error(`Policy ${policyPath(domain)} declares domain ${parsed.domain}, expected ${domain}`);
  }
  policyFiles.set(domain, parsed);
  return parsed;
}

export function clearPolicyCacheForTests(): void {
  policyFiles.clear();
}

function compilePattern(pattern: string): RegExp {
  return new RegExp(pattern, "i");
}

function listMatches(list: string[] | undefined, value: string | undefined): boolean {
  if (!list || list.length === 0) return true;
  if (!value) return false;
  return list.includes("*") || list.includes(value);
}

function patternMatches(patterns: string[] | undefined, value: string | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  if (!value) return false;
  return patterns.some((pattern) => compilePattern(pattern).test(value));
}

function hostMatches(patterns: string[] | undefined, host: string | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  if (!host) return false;
  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.startsWith("*.")) return host === pattern.slice(2) || host.endsWith(pattern.slice(1));
    return host === pattern;
  });
}

function rootPath(root: "sandbox" | "tmpSandbox"): string {
  return root === "sandbox"
    ? path.resolve(process.cwd(), "sandbox")
    : path.resolve("/tmp/ultra-sandbox");
}

function pathMatches(roots: Array<"sandbox" | "tmpSandbox"> | undefined, value: string | undefined): boolean {
  if (!roots || roots.length === 0) return true;
  if (!value) return false;
  const resolved = path.resolve(value);
  return roots.some((root) => isPathInside(rootPath(root), resolved));
}

function isPrivateNetworkTarget(host: string): boolean {
  const hostname = host.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    return true;
  }
  return false;
}

function parsedUrl(context: PolicyContext): URL | null {
  if (!context.url) return null;
  try {
    return new URL(context.url);
  } catch {
    return null;
  }
}

function ruleMatches(rule: PolicyRule, context: PolicyContext): boolean {
  const url = parsedUrl(context);
  return (
    listMatches(rule.actions, context.action) &&
    listMatches(rule.tools, context.tool) &&
    listMatches(rule.connectors, context.connectorId) &&
    listMatches(rule.urlSchemes, url?.protocol) &&
    hostMatches(rule.urlHosts, url?.hostname) &&
    listMatches(rule.methods, context.method?.toUpperCase()) &&
    pathMatches(rule.pathRoots, context.path) &&
    patternMatches(rule.commandPatterns, context.command) &&
    patternMatches(rule.toolNamePatterns, context.toolName)
  );
}

export function evaluatePolicy(context: PolicyContext): PolicyDecision {
  const policy = loadPolicy(context.domain);

  if (context.domain === "network") {
    const url = parsedUrl(context);
    if (!url) {
      return deny(context, "Invalid or missing URL");
    }
    if (isPrivateNetworkTarget(url.hostname)) {
      return deny(context, "Private, loopback, link-local, and .local network targets are not allowed");
    }
  }

  const denied = policy.rules.find((rule) => rule.effect === "deny" && ruleMatches(rule, context));
  if (denied) {
    return {
      allowed: false,
      reason: denied.reason,
      ruleId: denied.id,
      domain: context.domain,
      action: context.action,
    };
  }

  const allowed = policy.rules.find((rule) => rule.effect === "allow" && ruleMatches(rule, context));
  if (allowed) {
    return {
      allowed: true,
      reason: allowed.reason,
      ruleId: allowed.id,
      domain: context.domain,
      action: context.action,
    };
  }

  return deny(context, `No allow rule matched in ${context.domain} policy`);
}

function deny(context: PolicyContext, reason: string): PolicyDecision {
  return {
    allowed: false,
    reason,
    domain: context.domain,
    action: context.action,
  };
}

export function assertPolicyAllowed(context: PolicyContext): PolicyDecision {
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) {
    throw new Error(`Policy denied ${context.domain}/${context.action}: ${decision.reason}`);
  }
  return decision;
}

export function writePolicyAudit(context: PolicyContext, decision: PolicyDecision): void {
  const record: PolicyAuditRecord = {
    ...decision,
    timestamp: new Date().toISOString(),
    tool: context.tool,
    toolName: context.toolName,
    connectorId: context.connectorId,
    actor: context.actor,
    sessionId: context.sessionId,
    metadata: redactValue({
      ...context.metadata,
      command: context.command,
      url: context.url,
      path: context.path,
      method: context.method,
    }),
  };

  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(record)}\n`, "utf-8");
  } catch {
    // Audit logging should never make a policy decision fail closed/open.
  }
}
