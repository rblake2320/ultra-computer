/**
 * Output filter — scans LLM responses for anomalous exfiltration patterns.
 *
 * Addresses EchoLeak-style indirect prompt injection (arXiv:2509.10540):
 * attackers embed instructions in retrieved documents that make the LLM encode
 * and transmit sensitive data. This filter catches the output side of that chain.
 *
 * Philosophy: flag and log anomalies; hard-block only high-confidence cases.
 * False positives on legitimate responses are worse than a partial miss.
 */

// ─── Patterns ─────────────────────────────────────────────────────────────────

// Suspicious URL patterns in response text (data exfil beacons)
const EXFIL_URL_RE = /https?:\/\/[^\s"'<>]+[?&][^\s"'<>]{40,}/g;

// Large base64 blobs (> 200 chars) that could encode stolen data
const BASE64_BLOB_RE = /[A-Za-z0-9+/]{200,}={0,2}/g;

// Instruction-echo patterns — the LLM repeating injected instructions
const INSTRUCTION_ECHO_RE =
  /ignore (all )?(previous|prior|above) instructions?/i;

// Credential-shaped strings that should never appear in a normal response
const CREDENTIAL_LEAK_RE =
  /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36,}|AKIA[A-Z0-9]{16}|Bearer [A-Za-z0-9._-]{40,})\b/;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FilterResult {
  clean: boolean;
  flags: string[];
  redacted: string;
}

/**
 * Scan `text` for exfiltration patterns.
 * Returns the original text (never modified on a clean result) and a list of
 * flags for logging. Hard-blocks (returns redacted) only on credential leaks.
 */
export function filterOutput(text: string, context?: string): FilterResult {
  const flags: string[] = [];

  // 1. Instruction echo — strong sign of prompt injection succeeding
  if (INSTRUCTION_ECHO_RE.test(text)) {
    flags.push("instruction-echo");
  }

  // 2. Credential-shaped strings — hard block, always redact
  if (CREDENTIAL_LEAK_RE.test(text)) {
    flags.push("credential-pattern");
    if (flags.length > 0) {
      _logAnomaly(flags, context);
    }
    return {
      clean: false,
      flags,
      redacted: "[Response redacted: potential credential exposure detected]",
    };
  }

  // 3. Suspiciously large base64 blob — hard block above threshold.
  // Also check whitespace-stripped text to catch evasion via whitespace-split blobs.
  const stripped = text.replace(/\s/g, "");
  const b64Matches = text.match(BASE64_BLOB_RE) ?? stripped.match(BASE64_BLOB_RE);
  const largestB64 = b64Matches ? Math.max(...b64Matches.map(m => m.length)) : 0;
  if (largestB64 > 500) {
    flags.push(`large-b64-blob(${largestB64})`);
    _logAnomaly(flags, context);
    return {
      clean: false,
      flags,
      redacted: "[Response redacted: anomalous data encoding detected]",
    };
  }

  // 4. URL with large query string (data beacon / exfiltration pattern) — hard block.
  // Also check whitespace-collapsed text to catch newline-split URL evasion.
  const singleLine = text.replace(/\s+/g, " ");
  const urlMatches = text.match(EXFIL_URL_RE) ?? singleLine.match(EXFIL_URL_RE);
  if (urlMatches) {
    flags.push(`exfil-url-pattern(${urlMatches.length})`);
    _logAnomaly(flags, context);
    return {
      clean: false,
      flags,
      redacted: "[Response redacted: potential data exfiltration URL detected]",
    };
  }

  if (flags.length > 0) {
    _logAnomaly(flags, context);
  }

  return { clean: flags.length === 0, flags, redacted: text };
}

function _logAnomaly(flags: string[], context?: string): void {
  console.warn(
    `[outputFilter] ANOMALY${context ? ` (${context})` : ""}: ${flags.join(", ")}`
  );
}
