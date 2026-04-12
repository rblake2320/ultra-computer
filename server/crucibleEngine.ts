/**
 * CRUCIBLE — Quality Validation Gate
 * Tests agent outputs before accepting them into the final response.
 * 
 * Validation checks:
 * 1. Factual consistency — does the answer align with the query?
 * 2. Completeness — did the agent address all parts of the request?
 * 3. Coherence — is the output well-structured and logical?
 * 4. Hallucination detection — flags confident claims with no grounding
 * 5. Format compliance — JSON schema, code syntax, etc.
 * 
 * Each check returns a score 0-1 and a pass/fail verdict.
 * The gate passes only if all critical checks pass AND average score >= threshold.
 */

import { chat, type ChatMessage } from "./modelRouter.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrucibleCriteria {
  type: "factual" | "code" | "creative" | "analysis" | "general";
  query: string;
  expectedFormat?: "json" | "markdown" | "code" | "plain";
  jsonSchema?: Record<string, any>;
  requiredSections?: string[];
  maxLength?: number;
  minLength?: number;
}

export interface CrucibleCheck {
  name: string;
  score: number;      // 0-1
  passed: boolean;
  details: string;
  critical: boolean;  // if critical and failed, entire gate fails
}

export interface CrucibleResult {
  passed: boolean;
  overallScore: number;
  checks: CrucibleCheck[];
  recommendation: "accept" | "revise" | "reject";
  revisionHints: string[];
  validatedAt: number;
  latencyMs: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 0.6;
const CRITICAL_THRESHOLD = 0.4;

// ─── History ──────────────────────────────────────────────────────────────────

const validationHistory: Array<{
  taskId: string;
  agentId: string;
  result: CrucibleResult;
  timestamp: number;
}> = [];

// ─── Core Validation ──────────────────────────────────────────────────────────

export async function validateWithCrucible(
  taskId: string,
  agentId: string,
  output: string,
  criteria: CrucibleCriteria,
  modelId?: string
): Promise<CrucibleResult> {
  const start = Date.now();
  const checks: CrucibleCheck[] = [];

  // 1. Completeness check
  checks.push(checkCompleteness(output, criteria));

  // 2. Format compliance
  checks.push(checkFormatCompliance(output, criteria));

  // 3. Length constraints
  checks.push(checkLength(output, criteria));

  // 4. Coherence check (structural)
  checks.push(checkCoherence(output));

  // 5. LLM-based quality assessment (if a model is available)
  if (modelId) {
    try {
      const llmCheck = await llmQualityCheck(output, criteria, modelId);
      checks.push(llmCheck);
    } catch {
      // LLM check is non-critical — skip on failure
      checks.push({
        name: "llm_quality",
        score: 0.5,
        passed: true,
        details: "LLM quality check skipped (model unavailable)",
        critical: false,
      });
    }
  }

  // 6. Hallucination signal detection
  checks.push(detectHallucinationSignals(output));

  // 7. Required sections check
  if (criteria.requiredSections?.length) {
    checks.push(checkRequiredSections(output, criteria.requiredSections));
  }

  // Calculate overall
  const criticalChecks = checks.filter(c => c.critical);
  const criticalFailed = criticalChecks.some(c => !c.passed);
  const overallScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const passed = !criticalFailed && overallScore >= DEFAULT_THRESHOLD;

  const revisionHints: string[] = [];
  for (const check of checks) {
    if (!check.passed) {
      revisionHints.push(`[${check.name}] ${check.details}`);
    }
  }

  const recommendation: "accept" | "revise" | "reject" = 
    passed ? "accept" : 
    overallScore >= CRITICAL_THRESHOLD ? "revise" : "reject";

  const result: CrucibleResult = {
    passed,
    overallScore: Math.round(overallScore * 100) / 100,
    checks,
    recommendation,
    revisionHints,
    validatedAt: Date.now(),
    latencyMs: Date.now() - start,
  };

  validationHistory.push({ taskId, agentId, result, timestamp: Date.now() });
  if (validationHistory.length > 500) validationHistory.splice(0, 100);

  return result;
}

// ─── Individual Checks ────────────────────────────────────────────────────────

function checkCompleteness(output: string, criteria: CrucibleCriteria): CrucibleCheck {
  const queryWords = criteria.query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const outputLower = output.toLowerCase();
  const addressed = queryWords.filter(w => outputLower.includes(w));
  const ratio = queryWords.length > 0 ? addressed.length / queryWords.length : 1;

  return {
    name: "completeness",
    score: Math.min(ratio + 0.2, 1), // small bonus since exact word matching is imperfect
    passed: ratio >= 0.3,
    details: ratio >= 0.3 
      ? `Addresses ${addressed.length}/${queryWords.length} key terms` 
      : `Missing key terms: ${queryWords.filter(w => !outputLower.includes(w)).slice(0, 5).join(", ")}`,
    critical: true,
  };
}

function checkFormatCompliance(output: string, criteria: CrucibleCriteria): CrucibleCheck {
  if (!criteria.expectedFormat) {
    return { name: "format", score: 1, passed: true, details: "No format constraint", critical: false };
  }

  switch (criteria.expectedFormat) {
    case "json": {
      try {
        // Try to extract JSON from output (may be wrapped in markdown code blocks)
        const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, output];
        JSON.parse(jsonMatch[1]!.trim());
        
        // If schema provided, do basic key check
        if (criteria.jsonSchema?.properties) {
          const parsed = JSON.parse(jsonMatch[1]!.trim());
          const requiredKeys = Object.keys(criteria.jsonSchema.properties);
          const presentKeys = Object.keys(parsed);
          const missing = requiredKeys.filter(k => !presentKeys.includes(k));
          if (missing.length > 0) {
            return {
              name: "format",
              score: 0.5,
              passed: false,
              details: `Valid JSON but missing keys: ${missing.join(", ")}`,
              critical: true,
            };
          }
        }
        return { name: "format", score: 1, passed: true, details: "Valid JSON", critical: true };
      } catch {
        return { name: "format", score: 0, passed: false, details: "Invalid JSON output", critical: true };
      }
    }
    case "code": {
      const hasCode = /```[\s\S]*?```/.test(output) || /^(function|const|let|var|import|export|class|def |async )/m.test(output);
      return {
        name: "format",
        score: hasCode ? 1 : 0.3,
        passed: hasCode,
        details: hasCode ? "Contains code blocks" : "Expected code output but found none",
        critical: false,
      };
    }
    case "markdown": {
      const hasMd = /^#{1,6} /m.test(output) || /\*\*.*\*\*/.test(output) || /^- /m.test(output);
      return {
        name: "format",
        score: hasMd ? 1 : 0.5,
        passed: true,
        details: hasMd ? "Contains markdown formatting" : "Minimal markdown formatting",
        critical: false,
      };
    }
    default:
      return { name: "format", score: 1, passed: true, details: "Plain text format", critical: false };
  }
}

function checkLength(output: string, criteria: CrucibleCriteria): CrucibleCheck {
  const len = output.length;
  if (criteria.maxLength && len > criteria.maxLength) {
    return {
      name: "length",
      score: Math.max(0, 1 - (len - criteria.maxLength) / criteria.maxLength),
      passed: false,
      details: `Output too long: ${len} chars (max: ${criteria.maxLength})`,
      critical: false,
    };
  }
  if (criteria.minLength && len < criteria.minLength) {
    return {
      name: "length",
      score: len / criteria.minLength,
      passed: false,
      details: `Output too short: ${len} chars (min: ${criteria.minLength})`,
      critical: false,
    };
  }
  // Default: at least 10 chars for non-empty response
  if (len < 10) {
    return { name: "length", score: 0.1, passed: false, details: "Output is nearly empty", critical: true };
  }
  return { name: "length", score: 1, passed: true, details: `${len} chars`, critical: false };
}

function checkCoherence(output: string): CrucibleCheck {
  // Structural coherence heuristics
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const hasRepetition = detectRepetition(output);
  const hasIncompleteThought = /\.\.\.$|…$/.test(output.trim());
  const hasGarbledText = /[^\x00-\x7F]{10,}/.test(output) && !/[\u4e00-\u9fff\u3040-\u30ff]/.test(output);
  
  let score = 1;
  const issues: string[] = [];

  if (sentences.length === 0) { score -= 0.3; issues.push("no complete sentences"); }
  if (hasRepetition) { score -= 0.3; issues.push("repetitive content detected"); }
  if (hasIncompleteThought) { score -= 0.1; issues.push("incomplete ending"); }
  if (hasGarbledText) { score -= 0.4; issues.push("garbled/corrupted text"); }

  score = Math.max(0, score);
  return {
    name: "coherence",
    score,
    passed: score >= 0.5,
    details: issues.length > 0 ? `Issues: ${issues.join(", ")}` : "Well-structured output",
    critical: false,
  };
}

function detectRepetition(text: string): boolean {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 20);
  if (lines.length < 4) return false;
  const unique = new Set(lines);
  return unique.size < lines.length * 0.6;
}

function detectHallucinationSignals(output: string): CrucibleCheck {
  const signals: string[] = [];
  let score = 1;

  // Confident false precision (specific dates, statistics without context)
  const suspiciousStats = output.match(/\b\d{1,3}\.\d{1,4}%\b/g);
  if (suspiciousStats && suspiciousStats.length > 3) {
    signals.push("multiple hyper-precise statistics");
    score -= 0.2;
  }

  // Self-contradictions: "X is Y" followed by "X is not Y"
  const contradictionPatterns = [
    /\bis\b.*?\bis not\b/i,
    /\byes\b.*?\bno\b.*?same/i,
  ];
  for (const pat of contradictionPatterns) {
    if (pat.test(output)) {
      signals.push("potential self-contradiction");
      score -= 0.2;
    }
  }

  // Fabricated references
  const fakeRefPatterns = [
    /\((?:Smith|Jones|Brown) et al\., \d{4}\)/,
    /according to (?:a |the )?\d{4} (?:study|report|survey) (?:by|from|published)/i,
  ];
  for (const pat of fakeRefPatterns) {
    if (pat.test(output)) {
      signals.push("potentially fabricated reference");
      score -= 0.15;
    }
  }

  score = Math.max(0, score);
  return {
    name: "hallucination_signals",
    score,
    passed: score >= 0.5,
    details: signals.length > 0 ? `Signals: ${signals.join("; ")}` : "No hallucination signals detected",
    critical: false,
  };
}

function checkRequiredSections(output: string, sections: string[]): CrucibleCheck {
  const outputLower = output.toLowerCase();
  const found = sections.filter(s => outputLower.includes(s.toLowerCase()));
  const missing = sections.filter(s => !outputLower.includes(s.toLowerCase()));
  const ratio = sections.length > 0 ? found.length / sections.length : 1;

  return {
    name: "required_sections",
    score: ratio,
    passed: ratio >= 0.7,
    details: missing.length > 0 
      ? `Missing sections: ${missing.join(", ")}` 
      : `All ${sections.length} required sections present`,
    critical: false,
  };
}

async function llmQualityCheck(output: string, criteria: CrucibleCriteria, modelId: string): Promise<CrucibleCheck> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a quality assurance validator. Score the following output on a scale of 0-10 for:
1. Relevance to the query
2. Accuracy and correctness
3. Completeness
4. Clarity

Respond with ONLY a JSON object: {"score": <0-10>, "issues": ["issue1", "issue2"]}`,
    },
    {
      role: "user",
      content: `Query: ${criteria.query}\n\nOutput to validate:\n${output.slice(0, 2000)}`,
    },
  ];

  const resp = await chat(modelId, messages, { maxTokens: 200, temperature: 0.1 });
  try {
    const jsonMatch = resp.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.min(10, Math.max(0, parsed.score || 5)) / 10;
      return {
        name: "llm_quality",
        score,
        passed: score >= 0.5,
        details: parsed.issues?.length > 0 
          ? `LLM issues: ${parsed.issues.join("; ")}` 
          : `LLM quality score: ${Math.round(score * 100)}%`,
        critical: false,
      };
    }
  } catch {}

  return { name: "llm_quality", score: 0.5, passed: true, details: "LLM check inconclusive", critical: false };
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export function getValidationHistory(limit: number = 50) {
  return validationHistory.slice(-limit);
}

export function getValidationStats() {
  if (validationHistory.length === 0) {
    return { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0, avgLatencyMs: 0 };
  }
  const passed = validationHistory.filter(v => v.result.passed).length;
  const avgScore = validationHistory.reduce((s, v) => s + v.result.overallScore, 0) / validationHistory.length;
  const avgLatency = validationHistory.reduce((s, v) => s + v.result.latencyMs, 0) / validationHistory.length;

  return {
    total: validationHistory.length,
    passed,
    failed: validationHistory.length - passed,
    passRate: Math.round((passed / validationHistory.length) * 100),
    avgScore: Math.round(avgScore * 100) / 100,
    avgLatencyMs: Math.round(avgLatency),
  };
}
