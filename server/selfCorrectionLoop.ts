/**
 * Self-Correction Loop — Iterative Output Refinement
 * ═══════════════════════════════════════════════════════════════════════════
 * Wraps tool calls and LLM outputs with quality assessment and automatic
 * retry with improved prompts. When a tool call fails or produces low-quality
 * output, the loop:
 *
 *   1. Assesses the quality/correctness of the output
 *   2. If quality is below threshold, refines the prompt
 *   3. Retries with the improved prompt
 *   4. Repeats up to MAX_CORRECTIONS times
 *   5. Logs all correction attempts for learning
 *
 * Supports different quality assessment strategies for different output types:
 *   - Image: Check if generation succeeded, validate URL/path
 *   - Code: Check for syntax errors, execution success
 *   - Text: Check for completeness, relevance
 *   - Tool: Check tool result success flag
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { type ToolResult } from "./tools.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OutputType = "image" | "code" | "text" | "tool" | "general";

export interface QualityAssessment {
  score: number;           // 0-1
  passed: boolean;         // score >= threshold
  issues: string[];        // list of identified issues
  suggestions: string[];   // prompt improvement suggestions
}

export interface CorrectionAttempt {
  iteration: number;
  originalPrompt: string;
  refinedPrompt: string;
  assessment: QualityAssessment;
  durationMs: number;
  timestamp: number;
}

export interface CorrectionResult {
  success: boolean;
  finalOutput: string;
  totalAttempts: number;
  corrections: CorrectionAttempt[];
  finalAssessment: QualityAssessment;
}

export interface CorrectionConfig {
  maxAttempts: number;
  qualityThreshold: number;  // 0-1
  outputType: OutputType;
  enablePromptRefinement: boolean;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data/self-healing");
const CORRECTIONS_PATH = path.join(DATA_DIR, "correction-log.json");

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface CorrectionLogEntry {
  id: string;
  outputType: OutputType;
  originalPrompt: string;
  totalAttempts: number;
  finalSuccess: boolean;
  finalScore: number;
  corrections: CorrectionAttempt[];
  timestamp: number;
}

function loadCorrectionLog(): CorrectionLogEntry[] {
  try {
    if (!fs.existsSync(CORRECTIONS_PATH)) return [];
    const raw = fs.readFileSync(CORRECTIONS_PATH, "utf-8").trim();
    if (!raw) return [];
    return JSON.parse(raw) as CorrectionLogEntry[];
  } catch { return []; }
}

function saveCorrectionLog(log: CorrectionLogEntry[]): void {
  ensureDir();
  const tmp = CORRECTIONS_PATH + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(log, null, 2), "utf-8");
    fs.renameSync(tmp, CORRECTIONS_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ─── Quality Assessors ───────────────────────────────────────────────────────

/**
 * Assess the quality of a tool execution result.
 */
function assessToolResult(result: ToolResult): QualityAssessment {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  if (result.success) {
    score += 0.6;

    // Check output quality
    if (result.output && result.output.length > 0) {
      score += 0.2;
    } else {
      issues.push("Tool succeeded but produced empty output");
      suggestions.push("Provide more specific parameters");
    }

    // Check for artifacts
    if (result.artifacts && result.artifacts.length > 0) {
      score += 0.2;
    }

    // Check for warnings in output
    if (result.output?.includes("[stderr]") || result.output?.includes("Warning")) {
      score -= 0.1;
      issues.push("Output contains warnings or stderr");
    }
  } else {
    issues.push(`Tool failed: ${result.error || "unknown error"}`);
    suggestions.push("Check tool parameters and try alternative approach");

    if (result.error?.includes("timeout")) {
      suggestions.push("Reduce the scope of the operation or increase timeout");
      score = 0.1;
    } else if (result.error?.includes("not found")) {
      suggestions.push("Verify the resource exists before operating on it");
      score = 0.05;
    } else {
      score = 0;
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    passed: score >= 0.5,
    issues,
    suggestions,
  };
}

/**
 * Assess the quality of image generation output.
 */
function assessImageOutput(output: string, artifacts?: { path: string; type: string }[]): QualityAssessment {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // Check if images were actually generated
  if (artifacts && artifacts.length > 0) {
    score += 0.5;

    // Verify files exist
    for (const artifact of artifacts) {
      if (fs.existsSync(artifact.path)) {
        const stat = fs.statSync(artifact.path);
        if (stat.size > 1000) {
          score += 0.3 / artifacts.length; // Proportional to number of images
        } else {
          issues.push(`Image file too small (${stat.size} bytes): ${artifact.path}`);
          suggestions.push("Regenerate with higher quality settings");
        }
      } else {
        issues.push(`Image file not found: ${artifact.path}`);
        suggestions.push("Check if download completed successfully");
      }
    }

    // Check for revised prompt in output (DALL-E 3 feature)
    if (output.includes("Revised prompt")) {
      score += 0.1;
    }

    // Check for success message
    if (output.includes("Generated") && output.includes("image")) {
      score += 0.1;
    }
  } else {
    issues.push("No image artifacts produced");
    suggestions.push("Ensure image generation model is configured and API key is valid");
    score = 0;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    passed: score >= 0.5,
    issues,
    suggestions,
  };
}

/**
 * Assess the quality of code output.
 */
function assessCodeOutput(output: string): QualityAssessment {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0.5; // Start at neutral

  // Check for common error patterns
  if (output.includes("SyntaxError") || output.includes("TypeError") || output.includes("ReferenceError")) {
    score -= 0.3;
    issues.push("Code contains runtime errors");
    suggestions.push("Fix syntax and type errors before execution");
  }

  if (output.includes("Exit code") && !output.includes("Exit code 0")) {
    score -= 0.2;
    issues.push("Code execution failed with non-zero exit code");
    suggestions.push("Debug the error and fix the code");
  }

  if (output.includes("Traceback") || output.includes("Error:")) {
    score -= 0.2;
    issues.push("Code produced error output");
    suggestions.push("Handle exceptions and edge cases");
  }

  // Positive signals
  if (output.length > 50 && !output.includes("Error")) {
    score += 0.2;
  }

  if (output.includes("success") || output.includes("completed") || output.includes("wrote")) {
    score += 0.2;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    passed: score >= 0.5,
    issues,
    suggestions,
  };
}

/**
 * Assess the quality of text output.
 */
function assessTextOutput(output: string, context?: string): QualityAssessment {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0.5;

  // Check for completeness
  if (output.length < 20) {
    score -= 0.3;
    issues.push("Output is too short — may be incomplete");
    suggestions.push("Provide more detailed and comprehensive response");
  } else if (output.length > 100) {
    score += 0.2;
  }

  // Check for error indicators
  if (output.includes("[FAILED") || output.includes("[LLM call failed")) {
    score = 0.1;
    issues.push("Output contains failure markers");
    suggestions.push("Retry with different approach or model");
  }

  // Check for stub/placeholder content
  if (output.includes("TODO") || output.includes("placeholder") || output.includes("not implemented")) {
    score -= 0.2;
    issues.push("Output contains placeholder content");
    suggestions.push("Complete all sections fully");
  }

  // Check for relevance to context
  if (context) {
    const contextWords = context.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const outputLower = output.toLowerCase();
    const matchCount = contextWords.filter(w => outputLower.includes(w)).length;
    const relevance = contextWords.length > 0 ? matchCount / contextWords.length : 0;
    if (relevance < 0.1) {
      score -= 0.2;
      issues.push("Output may not be relevant to the request");
      suggestions.push("Focus more closely on the specific request");
    } else if (relevance > 0.3) {
      score += 0.1;
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    passed: score >= 0.5,
    issues,
    suggestions,
  };
}

// ─── Prompt Refinement ───────────────────────────────────────────────────────

/**
 * Refine a prompt based on quality assessment feedback.
 */
function refinePrompt(
  originalPrompt: string,
  assessment: QualityAssessment,
  outputType: OutputType,
  attemptNumber: number
): string {
  let refined = originalPrompt;

  // Add quality improvement hints based on issues
  const hints: string[] = [];

  for (const suggestion of assessment.suggestions) {
    hints.push(suggestion);
  }

  // Type-specific refinements
  switch (outputType) {
    case "image":
      if (attemptNumber === 1) {
        hints.push("high quality, detailed, professional");
      } else if (attemptNumber === 2) {
        hints.push("photorealistic, 4K resolution, masterpiece");
      }
      break;

    case "code":
      hints.push("Include error handling and edge cases");
      if (attemptNumber > 1) {
        hints.push("Test the code before returning it");
      }
      break;

    case "text":
      hints.push("Be comprehensive and detailed");
      if (attemptNumber > 1) {
        hints.push("Ensure all aspects of the request are addressed");
      }
      break;
  }

  if (hints.length > 0) {
    refined += `\n\n[Self-correction attempt ${attemptNumber + 1}. Previous issues: ${assessment.issues.join("; ")}. Improvements needed: ${hints.join("; ")}]`;
  }

  return refined;
}

// ─── Public API ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CorrectionConfig = {
  maxAttempts: 3,
  qualityThreshold: 0.5,
  outputType: "general",
  enablePromptRefinement: true,
};

/**
 * Assess the quality of any output based on its type.
 */
export function assessOutput(
  output: string,
  outputType: OutputType,
  toolResult?: ToolResult,
  context?: string
): QualityAssessment {
  switch (outputType) {
    case "tool":
      if (toolResult) return assessToolResult(toolResult);
      return assessTextOutput(output, context);

    case "image":
      return assessImageOutput(output, toolResult?.artifacts);

    case "code":
      return assessCodeOutput(output);

    case "text":
      return assessTextOutput(output, context);

    default:
      return assessTextOutput(output, context);
  }
}

/**
 * Run a self-correcting execution loop.
 * Takes an executor function and retries with refined prompts if quality is low.
 */
export async function withSelfCorrection<T extends { output: string; toolResult?: ToolResult }>(
  executor: (prompt: string) => Promise<T>,
  originalPrompt: string,
  config: Partial<CorrectionConfig> = {}
): Promise<CorrectionResult & { lastExecutorResult?: T }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const corrections: CorrectionAttempt[] = [];
  let currentPrompt = originalPrompt;
  let lastResult: T | undefined;
  let lastAssessment: QualityAssessment = {
    score: 0,
    passed: false,
    issues: ["Not yet executed"],
    suggestions: [],
  };

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    const startTime = Date.now();

    try {
      lastResult = await executor(currentPrompt);

      // Assess quality
      lastAssessment = assessOutput(
        lastResult.output,
        cfg.outputType,
        lastResult.toolResult,
        originalPrompt
      );

      const correction: CorrectionAttempt = {
        iteration: attempt + 1,
        originalPrompt: attempt === 0 ? originalPrompt : corrections[attempt - 1]?.refinedPrompt || originalPrompt,
        refinedPrompt: currentPrompt,
        assessment: lastAssessment,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
      corrections.push(correction);

      // If quality passes, we're done
      if (lastAssessment.passed) {
        logCorrection(cfg.outputType, originalPrompt, corrections, true, lastAssessment.score);
        return {
          success: true,
          finalOutput: lastResult.output,
          totalAttempts: attempt + 1,
          corrections,
          finalAssessment: lastAssessment,
          lastExecutorResult: lastResult,
        };
      }

      // Refine prompt for next attempt
      if (cfg.enablePromptRefinement && attempt < cfg.maxAttempts - 1) {
        currentPrompt = refinePrompt(originalPrompt, lastAssessment, cfg.outputType, attempt);
      }

    } catch (err: any) {
      lastAssessment = {
        score: 0,
        passed: false,
        issues: [`Execution error: ${err.message}`],
        suggestions: ["Fix the error and retry"],
      };

      corrections.push({
        iteration: attempt + 1,
        originalPrompt: currentPrompt,
        refinedPrompt: currentPrompt,
        assessment: lastAssessment,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      });
    }
  }

  // All attempts exhausted
  logCorrection(cfg.outputType, originalPrompt, corrections, false, lastAssessment.score);

  return {
    success: lastAssessment.passed,
    finalOutput: lastResult?.output || "",
    totalAttempts: corrections.length,
    corrections,
    finalAssessment: lastAssessment,
    lastExecutorResult: lastResult,
  };
}

/**
 * Simple wrapper for tool calls with self-correction.
 */
export async function withToolCorrection(
  toolExecutor: () => Promise<ToolResult>,
  toolName: string,
  maxAttempts = 2
): Promise<{ result: ToolResult; corrected: boolean; attempts: number }> {
  let lastResult: ToolResult | null = null;
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    lastResult = await toolExecutor();

    if (lastResult.success) {
      return { result: lastResult, corrected: i > 0, attempts };
    }

    // Don't retry certain errors
    if (lastResult.error?.includes("Unknown tool") ||
        lastResult.error?.includes("not allowed") ||
        lastResult.error?.includes("No prompt provided")) {
      break;
    }

    // Brief delay before retry
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }

  return { result: lastResult!, corrected: false, attempts };
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function logCorrection(
  outputType: OutputType,
  originalPrompt: string,
  corrections: CorrectionAttempt[],
  success: boolean,
  finalScore: number
): void {
  try {
    const log = loadCorrectionLog();
    log.push({
      id: crypto.randomUUID(),
      outputType,
      originalPrompt: originalPrompt.slice(0, 500),
      totalAttempts: corrections.length,
      finalSuccess: success,
      finalScore,
      corrections,
      timestamp: Date.now(),
    });

    // Keep last 200 entries
    if (log.length > 200) log.splice(0, log.length - 200);
    saveCorrectionLog(log);
  } catch { /* non-critical */ }
}

/**
 * Get correction statistics.
 */
export function getCorrectionStats(): {
  totalCorrections: number;
  successRate: number;
  avgAttempts: number;
  byType: Record<string, { total: number; successRate: number }>;
} {
  const log = loadCorrectionLog();
  const total = log.length;
  const successes = log.filter(e => e.finalSuccess).length;

  const byType: Record<string, { total: number; successes: number }> = {};
  for (const entry of log) {
    if (!byType[entry.outputType]) byType[entry.outputType] = { total: 0, successes: 0 };
    byType[entry.outputType].total++;
    if (entry.finalSuccess) byType[entry.outputType].successes++;
  }

  const avgAttempts = total > 0
    ? log.reduce((sum, e) => sum + e.totalAttempts, 0) / total
    : 0;

  return {
    totalCorrections: total,
    successRate: total > 0 ? successes / total : 0,
    avgAttempts,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, stats]) => [
        type,
        { total: stats.total, successRate: stats.total > 0 ? stats.successes / stats.total : 0 },
      ])
    ),
  };
}
