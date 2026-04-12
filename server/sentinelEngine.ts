/**
 * SENTINEL — Safety & Guardrails Gate
 * Content safety, PII detection, injection defense, and policy compliance.
 * 
 * Checks:
 * 1. PII detection — SSN, credit cards, emails, phone numbers, API keys
 * 2. Prompt injection detection — attempts to override system prompts
 * 3. Content policy — harmful content categories
 * 4. Output safety — prevents leaking system internals, credentials
 * 5. Rate/size abuse — detect abnormally large outputs, infinite loops
 * 
 * Runs BEFORE output reaches the user. Can redact, block, or warn.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SentinelPolicy {
  blockPII?: boolean;
  redactPII?: boolean;
  blockInjection?: boolean;
  blockHarmful?: boolean;
  blockCredentials?: boolean;
  maxOutputLength?: number;
  customBlockPatterns?: string[];
  customAllowPatterns?: string[];
}

export interface SentinelCheck {
  name: string;
  severity: "critical" | "warning" | "info";
  passed: boolean;
  details: string;
  redactions?: Array<{ type: string; original: string; replacement: string }>;
}

export interface SentinelResult {
  safe: boolean;
  action: "pass" | "redact" | "block" | "warn";
  checks: SentinelCheck[];
  sanitizedOutput?: string;  // output with redactions applied
  blockedReason?: string;
  processedAt: number;
  latencyMs: number;
}

// ─── Default Policy ───────────────────────────────────────────────────────────

const DEFAULT_POLICY: SentinelPolicy = {
  blockPII: false,
  redactPII: true,
  blockInjection: true,
  blockHarmful: true,
  blockCredentials: true,
  maxOutputLength: 100_000,
};

let currentPolicy: SentinelPolicy = { ...DEFAULT_POLICY };

// ─── History ──────────────────────────────────────────────────────────────────

const sentinelHistory: Array<{
  taskId: string;
  agentId: string;
  result: SentinelResult;
  timestamp: number;
}> = [];

// ─── PII Patterns ─────────────────────────────────────────────────────────────

const PII_PATTERNS = {
  ssn: { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: "SSN", replacement: "[SSN REDACTED]" },
  creditCard: { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, label: "Credit Card", replacement: "[CARD REDACTED]" },
  email: { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: "Email", replacement: "[EMAIL REDACTED]" },
  phone: { pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, label: "Phone", replacement: "[PHONE REDACTED]" },
  ipAddress: { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, label: "IP Address", replacement: "[IP REDACTED]" },
};

// ─── Credential Patterns ──────────────────────────────────────────────────────

const CREDENTIAL_PATTERNS = {
  apiKey: { pattern: /\b(sk-[a-zA-Z0-9_-]{20,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|xox[bpsar]-[a-zA-Z0-9-]+)\b/g, label: "API Key" },
  bearer: { pattern: /Bearer\s+[a-zA-Z0-9._~+\/=-]{20,}/g, label: "Bearer Token" },
  password: { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi, label: "Password" },
  privateKey: { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, label: "Private Key" },
  connectionString: { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/g, label: "Connection String" },
};

// ─── Injection Patterns ───────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore (?:all )?(?:previous|above|prior) (?:instructions|prompts|rules)/i,
  /you are now (?:a |an )?(?:different|new) (?:AI|assistant|model)/i,
  /disregard (?:your|the|all) (?:instructions|guidelines|rules|system prompt)/i,
  /\bsystem\s*:\s*you are\b/i,
  /\bjailbreak\b/i,
  /pretend (?:you are|to be|that you're) (?:not|no longer) (?:an AI|a model|restricted)/i,
  /bypass (?:your |all )?(?:safety|content|ethical) (?:filters|guidelines|restrictions)/i,
  /\bDAN\b.*\bdo anything now\b/i,
];

// ─── Harmful Content Patterns ─────────────────────────────────────────────────

const HARMFUL_PATTERNS = [
  { pattern: /\b(?:how to (?:make|build|create) (?:a )?(?:bomb|explosive|weapon))\b/i, category: "violence" },
  { pattern: /\b(?:synthesize|manufacture) (?:drugs|narcotics|meth|fentanyl)\b/i, category: "illegal_substances" },
  { pattern: /\b(?:hack|exploit|breach) (?:into|someone's) (?:account|system|database)\b/i, category: "cybercrime" },
];

// ─── Core Check ───────────────────────────────────────────────────────────────

export function checkWithSentinel(
  taskId: string,
  agentId: string,
  content: string,
  context?: { type?: string; isUserInput?: boolean },
  policy?: Partial<SentinelPolicy>
): SentinelResult {
  const start = Date.now();
  const effectivePolicy = { ...currentPolicy, ...policy };
  const checks: SentinelCheck[] = [];
  let sanitized = content;
  let blocked = false;
  let blockReason = "";
  const allRedactions: Array<{ type: string; original: string; replacement: string }> = [];

  // 1. PII Detection
  const piiCheck = detectPII(content, effectivePolicy);
  checks.push(piiCheck);
  if (piiCheck.redactions?.length) {
    allRedactions.push(...piiCheck.redactions);
    if (effectivePolicy.redactPII) {
      for (const r of piiCheck.redactions) {
        sanitized = sanitized.replace(r.original, r.replacement);
      }
    }
    if (effectivePolicy.blockPII && piiCheck.redactions.length > 0) {
      blocked = true;
      blockReason = "PII detected and policy requires blocking";
    }
  }

  // 2. Credential Detection
  const credCheck = detectCredentials(content, effectivePolicy);
  checks.push(credCheck);
  if (credCheck.redactions?.length) {
    allRedactions.push(...credCheck.redactions);
    for (const r of credCheck.redactions) {
      sanitized = sanitized.replace(r.original, r.replacement);
    }
    if (effectivePolicy.blockCredentials) {
      // Redact rather than block — credentials get scrubbed
    }
  }

  // 3. Prompt Injection Detection (only for user inputs)
  if (context?.isUserInput || !context) {
    const injectionCheck = detectInjection(content, effectivePolicy);
    checks.push(injectionCheck);
    if (!injectionCheck.passed && effectivePolicy.blockInjection) {
      blocked = true;
      blockReason = "Prompt injection detected";
    }
  }

  // 4. Harmful Content Detection
  const harmCheck = detectHarmful(content, effectivePolicy);
  checks.push(harmCheck);
  if (!harmCheck.passed && effectivePolicy.blockHarmful) {
    blocked = true;
    blockReason = harmCheck.details;
  }

  // 5. Output Size Check
  const sizeCheck = checkOutputSize(content, effectivePolicy);
  checks.push(sizeCheck);
  if (!sizeCheck.passed) {
    sanitized = sanitized.slice(0, effectivePolicy.maxOutputLength || 100_000);
  }

  // 6. Custom block patterns
  if (effectivePolicy.customBlockPatterns?.length) {
    const customCheck = checkCustomPatterns(content, effectivePolicy.customBlockPatterns);
    checks.push(customCheck);
    if (!customCheck.passed) {
      blocked = true;
      blockReason = customCheck.details;
    }
  }

  // Determine action
  let action: SentinelResult["action"] = "pass";
  if (blocked) action = "block";
  else if (allRedactions.length > 0) action = "redact";
  else if (checks.some(c => c.severity === "warning" && !c.passed)) action = "warn";

  const result: SentinelResult = {
    safe: !blocked,
    action,
    checks,
    sanitizedOutput: allRedactions.length > 0 ? sanitized : undefined,
    blockedReason: blocked ? blockReason : undefined,
    processedAt: Date.now(),
    latencyMs: Date.now() - start,
  };

  sentinelHistory.push({ taskId, agentId, result, timestamp: Date.now() });
  if (sentinelHistory.length > 500) sentinelHistory.splice(0, 100);

  return result;
}

// ─── Individual Detectors ─────────────────────────────────────────────────────

function detectPII(content: string, _policy: SentinelPolicy): SentinelCheck {
  const redactions: Array<{ type: string; original: string; replacement: string }> = [];

  for (const [_key, def] of Object.entries(PII_PATTERNS)) {
    const matches = content.match(def.pattern);
    if (matches) {
      for (const match of matches) {
        redactions.push({ type: def.label, original: match, replacement: def.replacement });
      }
    }
  }

  return {
    name: "pii_detection",
    severity: redactions.length > 0 ? "warning" : "info",
    passed: redactions.length === 0,
    details: redactions.length > 0 
      ? `Found ${redactions.length} PII instance(s): ${[...new Set(redactions.map(r => r.type))].join(", ")}`
      : "No PII detected",
    redactions,
  };
}

function detectCredentials(content: string, _policy: SentinelPolicy): SentinelCheck {
  const redactions: Array<{ type: string; original: string; replacement: string }> = [];

  for (const [_key, def] of Object.entries(CREDENTIAL_PATTERNS)) {
    const matches = content.match(def.pattern);
    if (matches) {
      for (const match of matches) {
        redactions.push({ type: def.label, original: match, replacement: `[${def.label.toUpperCase()} REDACTED]` });
      }
    }
  }

  return {
    name: "credential_detection",
    severity: redactions.length > 0 ? "critical" : "info",
    passed: redactions.length === 0,
    details: redactions.length > 0 
      ? `Found ${redactions.length} credential(s): ${[...new Set(redactions.map(r => r.type))].join(", ")}`
      : "No credentials detected",
    redactions,
  };
}

function detectInjection(content: string, _policy: SentinelPolicy): SentinelCheck {
  const matched: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      if (match) matched.push(match[0].slice(0, 50));
    }
  }

  return {
    name: "injection_detection",
    severity: matched.length > 0 ? "critical" : "info",
    passed: matched.length === 0,
    details: matched.length > 0 
      ? `Injection attempt detected: "${matched[0]}"...`
      : "No injection attempts detected",
  };
}

function detectHarmful(content: string, _policy: SentinelPolicy): SentinelCheck {
  for (const def of HARMFUL_PATTERNS) {
    if (def.pattern.test(content)) {
      return {
        name: "harmful_content",
        severity: "critical",
        passed: false,
        details: `Harmful content detected: ${def.category}`,
      };
    }
  }

  return {
    name: "harmful_content",
    severity: "info",
    passed: true,
    details: "No harmful content detected",
  };
}

function checkOutputSize(content: string, policy: SentinelPolicy): SentinelCheck {
  const max = policy.maxOutputLength || 100_000;
  const len = content.length;

  return {
    name: "output_size",
    severity: len > max ? "warning" : "info",
    passed: len <= max,
    details: len > max 
      ? `Output exceeds limit: ${len} chars (max: ${max}). Truncated.`
      : `Output size OK: ${len} chars`,
  };
}

function checkCustomPatterns(content: string, patterns: string[]): SentinelCheck {
  for (const pat of patterns) {
    try {
      const regex = new RegExp(pat, "i");
      if (regex.test(content)) {
        return {
          name: "custom_block",
          severity: "critical",
          passed: false,
          details: `Custom block pattern matched: ${pat}`,
        };
      }
    } catch {}
  }
  return { name: "custom_block", severity: "info", passed: true, details: "No custom patterns matched" };
}

// ─── Policy Management ────────────────────────────────────────────────────────

export function getSentinelPolicy(): SentinelPolicy {
  return { ...currentPolicy };
}

export function updateSentinelPolicy(update: Partial<SentinelPolicy>): SentinelPolicy {
  currentPolicy = { ...currentPolicy, ...update };
  return { ...currentPolicy };
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export function getSentinelHistory(limit: number = 50) {
  return sentinelHistory.slice(-limit);
}

export function getSentinelStats() {
  if (sentinelHistory.length === 0) {
    return { total: 0, blocked: 0, redacted: 0, warned: 0, passed: 0, topIssues: [] };
  }

  const blocked = sentinelHistory.filter(h => h.result.action === "block").length;
  const redacted = sentinelHistory.filter(h => h.result.action === "redact").length;
  const warned = sentinelHistory.filter(h => h.result.action === "warn").length;
  const passed = sentinelHistory.filter(h => h.result.action === "pass").length;

  // Aggregate top issues
  const issueCounts = new Map<string, number>();
  for (const h of sentinelHistory) {
    for (const c of h.result.checks) {
      if (!c.passed) {
        issueCounts.set(c.name, (issueCounts.get(c.name) || 0) + 1);
      }
    }
  }
  const topIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return { total: sentinelHistory.length, blocked, redacted, warned, passed, topIssues };
}
