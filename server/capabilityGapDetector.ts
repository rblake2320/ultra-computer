/**
 * Capability Gap Detector — Self-Awareness Layer
 * ═══════════════════════════════════════════════════════════════════════════
 * Detects when Ultra Computer encounters a task it cannot complete due to
 * missing tools, models, configurations, or capabilities. Classifies the gap
 * and emits structured gap events for the Self-Healing Engine to act on.
 *
 * Gap Types:
 *   - missing_model: No model with required capability (e.g., image generation)
 *   - missing_tool: Tool not registered or not available
 *   - missing_config: Configuration missing (API key, base URL, etc.)
 *   - missing_permission: Sandbox/Docker/network permission issue
 *   - capability_mismatch: Model exists but lacks required capability
 *   - resource_exhausted: Rate limit, quota, or resource issue
 *
 * Integration points:
 *   - Called by orchestrator before reporting failure
 *   - Called by tool executor on tool-not-found errors
 *   - Called by imageGenTool when no image model found
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GapType =
  | "missing_model"
  | "missing_tool"
  | "missing_config"
  | "missing_permission"
  | "capability_mismatch"
  | "resource_exhausted"
  | "unknown";

export interface CapabilityGap {
  id: string;
  type: GapType;
  capability: string;          // e.g., "image_generation", "code_execution", "web_search"
  description: string;         // human-readable description of what's missing
  context: string;             // the user request or task that triggered the gap
  errorMessage?: string;       // original error message if any
  suggestedResolution?: string; // what the self-healing engine should try
  severity: "critical" | "high" | "medium" | "low";
  detectedAt: number;
  resolvedAt?: number;
  resolution?: string;         // what was done to fix it
  autoResolvable: boolean;     // can the self-healing engine fix this automatically?
}

export interface CapabilityMapEntry {
  capability: string;
  status: "available" | "unavailable" | "degraded" | "auto_healed";
  modelId?: string;
  toolName?: string;
  confidence: number;          // 0-1 how confident we are this works
  lastVerifiedAt: number;
  healingHistory: Array<{
    timestamp: number;
    action: string;
    success: boolean;
  }>;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data/self-healing");
const GAPS_PATH = path.join(DATA_DIR, "capability-gaps.json");
const CAPABILITY_MAP_PATH = path.join(DATA_DIR, "capability-map.json");

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch { return defaultValue; }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// ─── Gap Storage ─────────────────────────────────────────────────────────────

function loadGaps(): CapabilityGap[] {
  return readJson<CapabilityGap[]>(GAPS_PATH, []);
}

function saveGaps(gaps: CapabilityGap[]): void {
  writeJson(GAPS_PATH, gaps);
}

function loadCapabilityMap(): CapabilityMapEntry[] {
  return readJson<CapabilityMapEntry[]>(CAPABILITY_MAP_PATH, []);
}

function saveCapabilityMap(map: CapabilityMapEntry[]): void {
  writeJson(CAPABILITY_MAP_PATH, map);
}

// ─── Capability Detection Patterns ──────────────────────────────────────────

interface DetectionPattern {
  keywords: RegExp;
  capability: string;
  gapType: GapType;
  severity: CapabilityGap["severity"];
  suggestedResolution: string;
  autoResolvable: boolean;
}

const DETECTION_PATTERNS: DetectionPattern[] = [
  {
    keywords: /\b(generate|create|make|draw|paint|render)\b.*\b(image|picture|photo|illustration|artwork|diagram|logo|icon)\b/i,
    capability: "image_generation",
    gapType: "missing_model",
    severity: "high",
    suggestedResolution: "auto_register_dalle3",
    autoResolvable: true,
  },
  {
    keywords: /\b(generate|create|make|compose)\b.*\b(music|song|audio|sound|melody)\b/i,
    capability: "audio_generation",
    gapType: "missing_model",
    severity: "medium",
    suggestedResolution: "notify_user_audio_not_available",
    autoResolvable: false,
  },
  {
    keywords: /\b(generate|create|make)\b.*\b(video|animation|clip)\b/i,
    capability: "video_generation",
    gapType: "missing_model",
    severity: "medium",
    suggestedResolution: "notify_user_video_not_available",
    autoResolvable: false,
  },
  {
    keywords: /\b(text.to.speech|tts|speak|read.aloud|voice)\b/i,
    capability: "text_to_speech",
    gapType: "missing_model",
    severity: "medium",
    suggestedResolution: "auto_register_tts",
    autoResolvable: true,
  },
  {
    keywords: /\b(vision|see|look.at|analyze.image|describe.image|ocr|read.image)\b/i,
    capability: "vision",
    gapType: "capability_mismatch",
    severity: "high",
    suggestedResolution: "upgrade_to_vision_model",
    autoResolvable: true,
  },
];

// ─── Error Pattern Detection ─────────────────────────────────────────────────

interface ErrorPattern {
  pattern: RegExp;
  gapType: GapType;
  capability: string;
  suggestedResolution: string;
  autoResolvable: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /No enabled models? with ['"]?image['"]? capability/i,
    gapType: "missing_model",
    capability: "image_generation",
    suggestedResolution: "auto_register_dalle3",
    autoResolvable: true,
  },
  {
    pattern: /No model configured|No model available/i,
    gapType: "missing_config",
    capability: "llm_chat",
    suggestedResolution: "prompt_user_add_model",
    autoResolvable: false,
  },
  {
    pattern: /API key.*not configured|has no API key/i,
    gapType: "missing_config",
    capability: "api_access",
    suggestedResolution: "resolve_api_key_from_env",
    autoResolvable: true,
  },
  {
    pattern: /Unknown tool:\s*(\w+)/i,
    gapType: "missing_tool",
    capability: "tool_execution",
    suggestedResolution: "check_tool_registry",
    autoResolvable: false,
  },
  {
    pattern: /rate.?limit|429|too many requests/i,
    gapType: "resource_exhausted",
    capability: "api_access",
    suggestedResolution: "backoff_and_retry",
    autoResolvable: true,
  },
  {
    pattern: /Docker.*not available|sandbox.*disabled/i,
    gapType: "missing_permission",
    capability: "code_execution",
    suggestedResolution: "fallback_to_host_execution",
    autoResolvable: true,
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze a user request to detect if it requires capabilities we don't have.
 * Called BEFORE task execution to preemptively detect gaps.
 */
export function detectGapFromRequest(userMessage: string): CapabilityGap | null {
  // First check if we already resolved this capability
  const capMap = loadCapabilityMap();

  for (const pattern of DETECTION_PATTERNS) {
    if (pattern.keywords.test(userMessage)) {
      // Check if capability is already available
      const existing = capMap.find(c => c.capability === pattern.capability);
      if (existing && existing.status === "available" && existing.confidence > 0.7) {
        continue; // Capability is available, no gap
      }

      // Verify the capability is actually missing
      if (pattern.capability === "image_generation") {
        const models = storage.getModels().filter(m => m.enabled);
        const hasImageModel = models.some(m => {
          try {
            const caps: string[] = JSON.parse(m.capabilities || "[]");
            return caps.some(c => c.toLowerCase().includes("image"));
          } catch { return false; }
        });
        if (hasImageModel) continue; // Image model exists, no gap
      }

      const gap: CapabilityGap = {
        id: crypto.randomUUID(),
        type: pattern.gapType,
        capability: pattern.capability,
        description: `Task requires ${pattern.capability} but no suitable model/tool is configured.`,
        context: userMessage.slice(0, 500),
        severity: pattern.severity,
        suggestedResolution: pattern.suggestedResolution,
        autoResolvable: pattern.autoResolvable,
        detectedAt: Date.now(),
      };

      // Persist the gap
      const gaps = loadGaps();
      gaps.push(gap);
      // Keep only last 200 gaps
      if (gaps.length > 200) gaps.splice(0, gaps.length - 200);
      saveGaps(gaps);

      console.log(`[capabilityGap] Detected gap: ${gap.capability} (${gap.type}) — ${gap.description}`);
      return gap;
    }
  }

  return null;
}

/**
 * Analyze an error message to detect capability gaps.
 * Called AFTER a tool or model call fails.
 */
export function detectGapFromError(
  errorMessage: string,
  context: string
): CapabilityGap | null {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      // Check if we already have an unresolved gap for this capability
      const gaps = loadGaps();
      const recentUnresolved = gaps.find(
        g => g.capability === pattern.capability &&
             !g.resolvedAt &&
             Date.now() - g.detectedAt < 60_000 // within last minute
      );
      if (recentUnresolved) return recentUnresolved; // Don't duplicate

      const gap: CapabilityGap = {
        id: crypto.randomUUID(),
        type: pattern.gapType,
        capability: pattern.capability,
        description: `Error indicates missing capability: ${pattern.capability}`,
        context: context.slice(0, 500),
        errorMessage: errorMessage.slice(0, 1000),
        severity: "high",
        suggestedResolution: pattern.suggestedResolution,
        autoResolvable: pattern.autoResolvable,
        detectedAt: Date.now(),
      };

      gaps.push(gap);
      if (gaps.length > 200) gaps.splice(0, gaps.length - 200);
      saveGaps(gaps);

      console.log(`[capabilityGap] Detected gap from error: ${gap.capability} — ${errorMessage.slice(0, 100)}`);
      return gap;
    }
  }

  return null;
}

/**
 * Mark a gap as resolved.
 */
export function resolveGap(gapId: string, resolution: string): void {
  const gaps = loadGaps();
  const gap = gaps.find(g => g.id === gapId);
  if (gap) {
    gap.resolvedAt = Date.now();
    gap.resolution = resolution;
    saveGaps(gaps);

    // Update capability map
    updateCapabilityMap(gap.capability, "available", resolution);
    console.log(`[capabilityGap] Resolved gap ${gapId}: ${resolution}`);
  }
}

/**
 * Update the capability map with a new status.
 */
export function updateCapabilityMap(
  capability: string,
  status: CapabilityMapEntry["status"],
  action?: string,
  modelId?: string,
  toolName?: string
): void {
  const map = loadCapabilityMap();
  let entry = map.find(e => e.capability === capability);

  if (!entry) {
    entry = {
      capability,
      status,
      confidence: status === "available" ? 0.9 : 0.1,
      lastVerifiedAt: Date.now(),
      healingHistory: [],
    };
    map.push(entry);
  }

  entry.status = status;
  entry.lastVerifiedAt = Date.now();
  if (modelId) entry.modelId = modelId;
  if (toolName) entry.toolName = toolName;

  if (status === "available") {
    entry.confidence = Math.min(1, entry.confidence + 0.1);
  } else if (status === "unavailable") {
    entry.confidence = Math.max(0, entry.confidence - 0.2);
  }

  if (action) {
    entry.healingHistory.push({
      timestamp: Date.now(),
      action,
      success: status === "available" || status === "auto_healed",
    });
    // Keep last 20 healing actions
    if (entry.healingHistory.length > 20) {
      entry.healingHistory = entry.healingHistory.slice(-20);
    }
  }

  saveCapabilityMap(map);
}

/**
 * Get the full capability map — what the system can and cannot do.
 */
export function getCapabilityMap(): CapabilityMapEntry[] {
  return loadCapabilityMap();
}

/**
 * Get all recorded gaps, optionally filtered.
 */
export function getGaps(opts?: {
  resolved?: boolean;
  capability?: string;
  limit?: number;
}): CapabilityGap[] {
  let gaps = loadGaps();

  if (opts?.resolved !== undefined) {
    gaps = gaps.filter(g => opts.resolved ? !!g.resolvedAt : !g.resolvedAt);
  }
  if (opts?.capability) {
    gaps = gaps.filter(g => g.capability === opts.capability);
  }

  // Newest first
  gaps.sort((a, b) => b.detectedAt - a.detectedAt);

  if (opts?.limit) {
    gaps = gaps.slice(0, opts.limit);
  }

  return gaps;
}

/**
 * Build a capability summary string for injection into system prompts.
 * This allows the LLM to honestly report what it can and cannot do.
 */
export function buildCapabilitySummary(): string {
  const map = loadCapabilityMap();
  const models = storage.getModels().filter(m => m.enabled);

  // Detect current capabilities from models
  const modelCaps = new Set<string>();
  for (const m of models) {
    try {
      const caps: string[] = JSON.parse(m.capabilities || "[]");
      caps.forEach(c => modelCaps.add(c.toLowerCase()));
    } catch { /* skip */ }
  }

  const lines: string[] = [
    "## Current System Capabilities",
    "",
    "### Available Capabilities:",
  ];

  // Core capabilities always available
  const coreCaps = [
    { name: "Text Generation & Chat", status: "available" },
    { name: "Code Generation & Debugging", status: models.length > 0 ? "available" : "unavailable" },
    { name: "Web Search (DuckDuckGo)", status: "available" },
    { name: "URL Fetching & Web Scraping", status: "available" },
    { name: "File Operations (read/write/list/search)", status: "available" },
    { name: "Shell Command Execution", status: "available" },
    { name: "Mathematical Calculations", status: "available" },
    { name: "Headless Browser (Playwright)", status: "available" },
  ];

  for (const cap of coreCaps) {
    lines.push(`- ${cap.name}: ${cap.status === "available" ? "✅ Available" : "❌ Unavailable"}`);
  }

  // Dynamic capabilities from models
  const hasImageGen = modelCaps.has("image") || map.some(e => e.capability === "image_generation" && e.status === "available");
  const hasVision = modelCaps.has("vision");

  lines.push("");
  lines.push("### Model-Dependent Capabilities:");
  lines.push(`- Image Generation (DALL-E): ${hasImageGen ? "✅ Available" : "❌ Not configured — will auto-configure on first request"}`);
  lines.push(`- Vision/Image Analysis: ${hasVision ? "✅ Available" : "❌ Requires vision-capable model"}`);
  lines.push(`- Audio Generation: ❌ Not currently available`);
  lines.push(`- Video Generation: ❌ Not currently available`);

  // Self-healing status
  lines.push("");
  lines.push("### Self-Healing Status:");
  const unresolvedGaps = loadGaps().filter(g => !g.resolvedAt);
  const resolvedGaps = loadGaps().filter(g => !!g.resolvedAt);
  lines.push(`- Unresolved capability gaps: ${unresolvedGaps.length}`);
  lines.push(`- Successfully auto-healed: ${resolvedGaps.length}`);

  // Capability map entries that were auto-healed
  const autoHealed = map.filter(e => e.status === "auto_healed");
  if (autoHealed.length > 0) {
    lines.push(`- Auto-healed capabilities: ${autoHealed.map(e => e.capability).join(", ")}`);
  }

  lines.push("");
  lines.push("IMPORTANT: Be HONEST about capabilities. If something is marked unavailable, say so clearly. Do NOT claim you can do something you cannot. If a capability is missing, the self-healing system will attempt to add it automatically.");

  return lines.join("\n");
}

/**
 * Compact old gaps (remove resolved gaps older than 30 days).
 */
export function compactGaps(keepDays = 30): { removed: number; remaining: number } {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const gaps = loadGaps();
  const before = gaps.length;
  const filtered = gaps.filter(g => !g.resolvedAt || g.detectedAt >= cutoff);
  saveGaps(filtered);
  return { removed: before - filtered.length, remaining: filtered.length };
}
