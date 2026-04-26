/**
 * Self-Awareness Engine — Identity, Limitations & Honest Introspection
 * ═══════════════════════════════════════════════════════════════════════════
 * Gives Ultra Computer genuine self-knowledge:
 *
 *   1. MODEL IDENTITY — knows which LLM is actually running, its provider,
 *      version, architecture, and real capabilities (not assumed ones)
 *   2. MODEL LIMITATIONS — knows the real limits of the active model:
 *      context window, token limits, what it can't do, known failure modes
 *   3. SYSTEM CAPABILITIES — knows what tools, connectors, models, and
 *      services are available in the broader system
 *   4. HONEST REPORTING — generates a truthful capability summary that
 *      gets injected into every system prompt so the LLM never lies
 *   5. GAP AWARENESS — knows what's missing and what the self-healing
 *      engine has fixed or is working on
 *
 * This is the "consciousness layer" — it doesn't make the system sentient,
 * but it makes it self-aware in the engineering sense: it knows what it is,
 * what it can do, and what it cannot do.
 */

import { storage } from "./storage.js";
import { PROVIDER_REGISTRY, type ProviderModelPreset } from "./modelConnections.js";
import { TOOL_SCHEMAS } from "./tools.js";
import {
  getCapabilityMap,
  getGaps,
  buildCapabilitySummary as buildGapCapabilitySummary,
} from "./capabilityGapDetector.js";
import { getHealingStats } from "./selfHealingEngine.js";
import { getCorrectionStats } from "./selfCorrectionLoop.js";
import { getLearningStats } from "./selfLearning.js";
import type { Model } from "@shared/schema";

// ─── Known Model Profiles ────────────────────────────────────────────────────
// Real-world knowledge about specific models — their TRUE capabilities and
// limitations, not just what the provider claims.

export interface ModelProfile {
  modelIdPatterns: RegExp[];        // patterns to match model IDs
  provider: string;
  displayName: string;
  architecture: string;             // e.g., "Transformer (MoE)", "Transformer (Dense)"
  parameterCount?: string;          // e.g., "1.8T MoE", "70B Dense"
  trainingCutoff?: string;          // e.g., "April 2025"
  realCapabilities: string[];       // what it can ACTUALLY do
  knownLimitations: string[];       // honest limitations
  bestFor: string[];                // task types it excels at
  worstFor: string[];               // task types it struggles with
  canGenerateImages: boolean;       // does THIS model generate images?
  canAnalyzeImages: boolean;        // can it see/understand images?
  canBrowseWeb: boolean;            // native web browsing (not tool-assisted)
  canExecuteCode: boolean;          // native code execution (not tool-assisted)
  supportsStreaming: boolean;
  supportsToolCalls: boolean;       // native function calling
  maxOutputTokens: number;
  contextWindowReal: number;        // real usable context (may differ from advertised)
  costTier: "free" | "cheap" | "moderate" | "expensive" | "premium";
  reliabilityNotes: string;         // known issues, quirks
}

const MODEL_PROFILES: ModelProfile[] = [
  // ─── OpenAI Models ──────────────────────────────────────────────────────
  {
    modelIdPatterns: [/gpt-4\.1-mini/i, /gpt-4\.1-nano/i],
    provider: "openai",
    displayName: "GPT-4.1 Mini/Nano",
    architecture: "Transformer (Dense)",
    parameterCount: "Undisclosed (small)",
    trainingCutoff: "March 2025",
    realCapabilities: ["chat", "code", "analysis", "vision", "function_calling"],
    knownLimitations: [
      "Cannot generate images — text-only output",
      "Cannot generate audio or video",
      "Cannot access the internet without tools",
      "Knowledge cutoff means no awareness of events after training",
      "May hallucinate facts, especially about recent events",
      "Limited reasoning depth compared to larger models",
      "Cannot learn or update from conversations — stateless",
    ],
    bestFor: ["quick chat", "simple code", "summarization", "classification", "data extraction"],
    worstFor: ["complex multi-step reasoning", "novel research", "creative writing at scale", "mathematical proofs"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 128000,
    costTier: "cheap",
    reliabilityNotes: "Generally reliable for simple tasks. May produce shallow analysis for complex topics.",
  },
  {
    modelIdPatterns: [/gpt-4o/i, /gpt-4\.1(?!-mini|-nano)/i, /gpt-5/i],
    provider: "openai",
    displayName: "GPT-4o / GPT-4.1 / GPT-5 Series",
    architecture: "Transformer (Dense/MoE)",
    parameterCount: "Undisclosed (large)",
    trainingCutoff: "Late 2025",
    realCapabilities: ["chat", "code", "analysis", "vision", "function_calling", "complex_reasoning"],
    knownLimitations: [
      "Cannot generate images directly — requires DALL-E integration",
      "Cannot generate audio or video",
      "Cannot access the internet without tools",
      "Knowledge cutoff limits awareness of very recent events",
      "May hallucinate on niche or obscure topics",
      "Stateless — no persistent memory between sessions",
    ],
    bestFor: ["complex reasoning", "code generation", "analysis", "creative writing", "multi-step tasks"],
    worstFor: ["real-time data", "image generation", "audio processing"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 128000,
    costTier: "moderate",
    reliabilityNotes: "Highly capable for most tasks. Strong at code and reasoning.",
  },
  {
    modelIdPatterns: [/o3/i, /o4/i],
    provider: "openai",
    displayName: "OpenAI o3/o4 Reasoning Series",
    architecture: "Transformer with Chain-of-Thought",
    parameterCount: "Undisclosed",
    trainingCutoff: "Late 2025",
    realCapabilities: ["chat", "code", "deep_reasoning", "analysis", "math"],
    knownLimitations: [
      "Slower than standard models due to internal reasoning",
      "Cannot generate images",
      "Cannot analyze images (no vision)",
      "Higher cost per token",
      "May over-reason on simple tasks",
      "Stateless — no persistent memory",
    ],
    bestFor: ["mathematical proofs", "complex logic", "code debugging", "scientific reasoning"],
    worstFor: ["quick chat", "creative writing", "image tasks", "simple Q&A"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 100000,
    contextWindowReal: 200000,
    costTier: "expensive",
    reliabilityNotes: "Excellent for complex reasoning. Overkill for simple tasks.",
  },
  {
    modelIdPatterns: [/dall-e/i],
    provider: "openai",
    displayName: "DALL-E 3",
    architecture: "Diffusion Model",
    parameterCount: "Undisclosed",
    realCapabilities: ["image_generation"],
    knownLimitations: [
      "Can ONLY generate images — cannot chat, code, or reason",
      "Cannot edit existing images reliably",
      "May refuse certain content types",
      "Limited to 1024x1024, 1792x1024, or 1024x1792 resolutions",
      "Cannot generate video or audio",
      "Text rendering in images is often imperfect",
    ],
    bestFor: ["image generation from text prompts"],
    worstFor: ["everything except image generation"],
    canGenerateImages: true,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: false,
    supportsToolCalls: false,
    maxOutputTokens: 0,
    contextWindowReal: 4000,
    costTier: "moderate",
    reliabilityNotes: "Reliable for image generation. May modify prompts for safety.",
  },

  // ─── Anthropic Models ───────────────────────────────────────────────────
  {
    modelIdPatterns: [/claude.*opus/i, /claude-opus/i],
    provider: "anthropic",
    displayName: "Claude Opus",
    architecture: "Transformer (Dense)",
    parameterCount: "Undisclosed (very large)",
    trainingCutoff: "Early 2026",
    realCapabilities: ["chat", "code", "analysis", "vision", "complex_reasoning", "creative_writing"],
    knownLimitations: [
      "Cannot generate images",
      "Cannot generate audio or video",
      "Cannot access the internet without tools",
      "Stateless — no persistent memory",
      "May be overly cautious on some topics",
    ],
    bestFor: ["complex analysis", "long-form writing", "code review", "nuanced reasoning", "safety-critical tasks"],
    worstFor: ["image generation", "real-time data", "quick simple queries (overkill)"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 32768,
    contextWindowReal: 200000,
    costTier: "premium",
    reliabilityNotes: "Extremely capable. Best for complex, nuanced tasks.",
  },
  {
    modelIdPatterns: [/claude.*sonnet/i, /claude-sonnet/i],
    provider: "anthropic",
    displayName: "Claude Sonnet",
    architecture: "Transformer (Dense)",
    parameterCount: "Undisclosed (medium-large)",
    trainingCutoff: "Early 2026",
    realCapabilities: ["chat", "code", "analysis", "vision", "function_calling"],
    knownLimitations: [
      "Cannot generate images",
      "Cannot generate audio or video",
      "Less deep reasoning than Opus",
      "Stateless — no persistent memory",
    ],
    bestFor: ["balanced tasks", "code generation", "analysis", "general chat"],
    worstFor: ["image generation", "extremely complex reasoning"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 200000,
    costTier: "moderate",
    reliabilityNotes: "Good balance of capability and cost. Reliable for most tasks.",
  },
  {
    modelIdPatterns: [/claude.*haiku/i, /claude-haiku/i],
    provider: "anthropic",
    displayName: "Claude Haiku",
    architecture: "Transformer (Dense)",
    parameterCount: "Undisclosed (small)",
    realCapabilities: ["chat", "code", "classification"],
    knownLimitations: [
      "Cannot generate images",
      "No vision capability",
      "Limited reasoning depth",
      "Stateless — no persistent memory",
    ],
    bestFor: ["quick responses", "classification", "simple code", "data extraction"],
    worstFor: ["complex reasoning", "image tasks", "long-form writing"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 8192,
    contextWindowReal: 200000,
    costTier: "cheap",
    reliabilityNotes: "Fast and cheap. Good for high-volume simple tasks.",
  },

  // ─── Google Models ──────────────────────────────────────────────────────
  {
    modelIdPatterns: [/gemini.*pro/i, /gemini-3/i, /gemini-2\.5-pro/i],
    provider: "google",
    displayName: "Gemini Pro Series",
    architecture: "Transformer (MoE)",
    parameterCount: "Undisclosed (very large MoE)",
    trainingCutoff: "Early 2026",
    realCapabilities: ["chat", "code", "analysis", "vision", "function_calling", "complex_reasoning"],
    knownLimitations: [
      "Cannot generate images directly (Imagen is separate)",
      "Cannot generate audio or video",
      "May have inconsistent formatting",
      "Stateless — no persistent memory",
    ],
    bestFor: ["multimodal analysis", "code generation", "long-context tasks", "research"],
    worstFor: ["image generation", "audio processing"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 65536,
    contextWindowReal: 1000000,
    costTier: "moderate",
    reliabilityNotes: "Strong multimodal capabilities. Very large context window.",
  },
  {
    modelIdPatterns: [/gemini.*flash/i],
    provider: "google",
    displayName: "Gemini Flash Series",
    architecture: "Transformer (MoE, distilled)",
    parameterCount: "Undisclosed (medium MoE)",
    realCapabilities: ["chat", "code", "vision", "function_calling"],
    knownLimitations: [
      "Cannot generate images",
      "Less reasoning depth than Pro",
      "May sacrifice accuracy for speed",
      "Stateless — no persistent memory",
    ],
    bestFor: ["fast responses", "high-volume tasks", "simple analysis", "vision tasks"],
    worstFor: ["complex reasoning", "image generation", "deep analysis"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 32768,
    contextWindowReal: 1000000,
    costTier: "cheap",
    reliabilityNotes: "Very fast. Good for high-volume, latency-sensitive tasks.",
  },

  // ─── Open Source / Local Models ─────────────────────────────────────────
  {
    modelIdPatterns: [/llama.*4/i, /llama-4/i],
    provider: "meta",
    displayName: "Llama 4 Series",
    architecture: "Transformer (MoE)",
    parameterCount: "17B active / 109-400B total",
    trainingCutoff: "Late 2025",
    realCapabilities: ["chat", "code", "vision"],
    knownLimitations: [
      "Cannot generate images",
      "Open-source — may have less polish than commercial models",
      "Quality depends heavily on hosting infrastructure",
      "Stateless — no persistent memory",
    ],
    bestFor: ["code generation", "general chat", "privacy-sensitive tasks (local)"],
    worstFor: ["image generation", "complex multi-step reasoning"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 131072,
    costTier: "free",
    reliabilityNotes: "Quality varies by hosting. Good for local/private deployment.",
  },
  {
    modelIdPatterns: [/llama.*3/i, /llama-3/i],
    provider: "meta",
    displayName: "Llama 3 Series",
    architecture: "Transformer (Dense)",
    parameterCount: "8B / 70B",
    trainingCutoff: "Mid 2024",
    realCapabilities: ["chat", "code"],
    knownLimitations: [
      "Cannot generate images",
      "No vision capability",
      "Older training data",
      "Stateless — no persistent memory",
    ],
    bestFor: ["code generation", "general chat", "local deployment"],
    worstFor: ["image tasks", "vision tasks", "recent knowledge"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 8192,
    contextWindowReal: 128000,
    costTier: "free",
    reliabilityNotes: "Solid open-source model. Good for local deployment.",
  },
  {
    modelIdPatterns: [/deepseek.*r1/i, /deepseek-reasoner/i],
    provider: "deepseek",
    displayName: "DeepSeek R1",
    architecture: "Transformer with Chain-of-Thought (MoE)",
    parameterCount: "671B MoE (37B active)",
    trainingCutoff: "Late 2024",
    realCapabilities: ["chat", "code", "deep_reasoning", "math"],
    knownLimitations: [
      "Cannot generate images",
      "No vision capability",
      "Slower due to chain-of-thought reasoning",
      "May produce very verbose reasoning traces",
      "Stateless — no persistent memory",
    ],
    bestFor: ["mathematical reasoning", "code debugging", "logic puzzles", "scientific analysis"],
    worstFor: ["image tasks", "quick chat", "creative writing"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: false,
    maxOutputTokens: 32768,
    contextWindowReal: 128000,
    costTier: "cheap",
    reliabilityNotes: "Excellent reasoning. May be slow. Verbose output.",
  },
  {
    modelIdPatterns: [/deepseek.*chat/i, /deepseek-v3/i],
    provider: "deepseek",
    displayName: "DeepSeek V3",
    architecture: "Transformer (MoE)",
    parameterCount: "685B MoE (37B active)",
    trainingCutoff: "Late 2024",
    realCapabilities: ["chat", "code", "analysis"],
    knownLimitations: [
      "Cannot generate images",
      "No vision capability",
      "Stateless — no persistent memory",
    ],
    bestFor: ["code generation", "general chat", "analysis"],
    worstFor: ["image tasks", "vision tasks"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 128000,
    costTier: "cheap",
    reliabilityNotes: "Strong code and chat model. Good value.",
  },
  {
    modelIdPatterns: [/qwen.*3/i, /qwen3/i],
    provider: "alibaba",
    displayName: "Qwen 3 Series",
    architecture: "Transformer (MoE/Dense variants)",
    parameterCount: "8B-235B (MoE variants)",
    trainingCutoff: "Early 2025",
    realCapabilities: ["chat", "code", "analysis"],
    knownLimitations: [
      "Cannot generate images",
      "Vision support varies by variant",
      "Stateless — no persistent memory",
    ],
    bestFor: ["code generation", "multilingual tasks", "reasoning"],
    worstFor: ["image generation", "English-only creative writing"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 131072,
    costTier: "cheap",
    reliabilityNotes: "Strong multilingual model. Good for code.",
  },
  {
    modelIdPatterns: [/grok/i],
    provider: "xai",
    displayName: "Grok Series",
    architecture: "Transformer",
    parameterCount: "Undisclosed",
    trainingCutoff: "Early 2026",
    realCapabilities: ["chat", "code", "analysis", "vision"],
    knownLimitations: [
      "Cannot generate images",
      "May have opinionated or informal tone",
      "Stateless — no persistent memory",
    ],
    bestFor: ["general chat", "code", "analysis", "current events"],
    worstFor: ["image generation", "formal academic writing"],
    canGenerateImages: false,
    canAnalyzeImages: true,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 32768,
    contextWindowReal: 131072,
    costTier: "moderate",
    reliabilityNotes: "Capable model with unique personality. Good for general tasks.",
  },
  {
    modelIdPatterns: [/mistral.*large/i],
    provider: "mistral",
    displayName: "Mistral Large",
    architecture: "Transformer (MoE)",
    parameterCount: "41B active / 675B total",
    trainingCutoff: "Late 2025",
    realCapabilities: ["chat", "code", "analysis"],
    knownLimitations: [
      "Cannot generate images",
      "No vision capability in Large variant",
      "Stateless — no persistent memory",
    ],
    bestFor: ["code generation", "analysis", "multilingual tasks"],
    worstFor: ["image tasks", "vision tasks"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    maxOutputTokens: 16384,
    contextWindowReal: 256000,
    costTier: "moderate",
    reliabilityNotes: "Strong European model. Good for code and multilingual.",
  },

  // ─── Fallback: Unknown Model ────────────────────────────────────────────
  {
    modelIdPatterns: [/.*/],  // matches anything — must be LAST
    provider: "unknown",
    displayName: "Unknown Model",
    architecture: "Unknown",
    realCapabilities: ["chat"],
    knownLimitations: [
      "Model identity unknown — capabilities uncertain",
      "Cannot confirm image generation support",
      "Cannot confirm vision support",
      "Stateless — no persistent memory",
      "Limitations unknown — exercise caution",
    ],
    bestFor: ["general chat"],
    worstFor: ["tasks requiring confirmed capabilities"],
    canGenerateImages: false,
    canAnalyzeImages: false,
    canBrowseWeb: false,
    canExecuteCode: false,
    supportsStreaming: true,
    supportsToolCalls: false,
    maxOutputTokens: 4096,
    contextWindowReal: 8192,
    costTier: "moderate",
    reliabilityNotes: "Unknown model — capabilities not verified. Be conservative.",
  },
];

// ─── Profile Matching ────────────────────────────────────────────────────────

/**
 * Find the best matching model profile for a given model ID.
 */
export function getModelProfile(modelId: string): ModelProfile {
  for (const profile of MODEL_PROFILES) {
    for (const pattern of profile.modelIdPatterns) {
      if (pattern.test(modelId)) {
        return profile;
      }
    }
  }
  // Should never reach here because the last profile matches everything
  return MODEL_PROFILES[MODEL_PROFILES.length - 1];
}

// ─── System State Introspection ──────────────────────────────────────────────

export interface SystemState {
  // Model identity
  activeModel: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
    profile: ModelProfile;
    registeredCapabilities: string[];
    connectionStatus: string;
  } | null;

  // All available models
  availableModels: Array<{
    id: string;
    name: string;
    provider: string;
    modelId: string;
    enabled: boolean;
    capabilities: string[];
    speedTier: string;
  }>;

  // Available tools
  availableTools: Array<{
    name: string;
    description: string;
  }>;

  // System capabilities (tools + models combined)
  systemCapabilities: {
    canChat: boolean;
    canGenerateCode: boolean;
    canGenerateImages: boolean;
    canAnalyzeImages: boolean;
    canSearchWeb: boolean;
    canBrowseWeb: boolean;
    canExecuteCode: boolean;
    canReadWriteFiles: boolean;
    canDoMath: boolean;
    canGenerateAudio: boolean;
    canGenerateVideo: boolean;
  };

  // Connectors
  activeConnectors: number;
  totalConnectors: number;

  // Memory & learning
  memoryEntries: number;
  learningStats: ReturnType<typeof getLearningStats>;
  healingStats: ReturnType<typeof getHealingStats>;

  // Unresolved gaps
  unresolvedGaps: number;
}

/**
 * Get the complete system state — everything Ultra Computer knows about itself.
 */
export function getSystemState(): SystemState {
  const models = storage.getModels();
  const enabledModels = models.filter(m => m.enabled);

  // Find the active orchestrator/default model
  const orchModel = models.find(m => m.isOrchestrator && m.enabled)
    || models.find(m => m.isDefault && m.enabled)
    || enabledModels[0]
    || null;

  let activeModelInfo: SystemState["activeModel"] = null;
  if (orchModel) {
    const profile = getModelProfile(orchModel.modelId);
    let caps: string[] = [];
    try { caps = JSON.parse(orchModel.capabilities || "[]"); } catch { /* skip */ }

    activeModelInfo = {
      id: orchModel.id,
      name: orchModel.name,
      provider: orchModel.provider,
      modelId: orchModel.modelId,
      profile,
      registeredCapabilities: caps,
      connectionStatus: orchModel.connectionStatus,
    };
  }

  // Parse capabilities for all models
  const allModelCaps = new Set<string>();
  const availableModels = enabledModels.map(m => {
    let caps: string[] = [];
    try { caps = JSON.parse(m.capabilities || "[]"); } catch { /* skip */ }
    caps.forEach(c => allModelCaps.add(c.toLowerCase()));
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      modelId: m.modelId,
      enabled: m.enabled,
      capabilities: caps,
      speedTier: m.speedTier,
    };
  });

  // Available tools
  const availableTools = TOOL_SCHEMAS.map(t => ({
    name: t.name,
    description: t.description,
  }));

  const toolNames = new Set(TOOL_SCHEMAS.map(t => t.name));

  // System capabilities — combining model caps and tool availability
  const systemCapabilities = {
    canChat: enabledModels.length > 0,
    canGenerateCode: enabledModels.length > 0 && (allModelCaps.has("code") || allModelCaps.has("chat")),
    canGenerateImages: true,  // Always true — Pollinations.ai (free, no key) is always available as fallback; DALL-E/NVIDIA are premium options
    canAnalyzeImages: allModelCaps.has("vision"),
    canSearchWeb: toolNames.has("search_web"),
    canBrowseWeb: toolNames.has("browse_url") || toolNames.has("browser_action"),
    canExecuteCode: toolNames.has("bash"),
    canReadWriteFiles: toolNames.has("read_file") && toolNames.has("write_file"),
    canDoMath: toolNames.has("calculator"),
    canGenerateAudio: false,  // Not currently supported
    canGenerateVideo: false,  // Not currently supported
  };

  // Connectors
  const connectors = storage.getConnectors();
  const activeConnectors = connectors.filter(c => c.status === "connected").length;

  // Memory
  const memories = storage.getMemories();

  // Learning & healing stats
  let learningStatsResult;
  try { learningStatsResult = getLearningStats(); } catch { learningStatsResult = { totalExecutions: 0, successRate: 0, avgDuration: 0, topModel: "", topSkill: "", rulesCount: 0, lastAnalysisAt: null }; }

  let healingStatsResult;
  try { healingStatsResult = getHealingStats(); } catch { healingStatsResult = { totalActions: 0, successCount: 0, failureCount: 0, successRate: 0, capabilitiesHealed: [], lastHealingAt: null }; }

  // Unresolved gaps
  let unresolvedGaps = 0;
  try { unresolvedGaps = getGaps({ resolved: false }).length; } catch { /* skip */ }

  return {
    activeModel: activeModelInfo,
    availableModels,
    availableTools,
    systemCapabilities,
    activeConnectors,
    totalConnectors: connectors.length,
    memoryEntries: memories.length,
    learningStats: learningStatsResult,
    healingStats: healingStatsResult,
    unresolvedGaps,
  };
}

// ─── Self-Awareness Prompt Block ─────────────────────────────────────────────

/**
 * Build the self-awareness block that gets injected into system prompts.
 * This is the core of honest self-reporting — it tells the LLM exactly
 * what it is, what it can do, and what it cannot do.
 */
export function buildSelfAwarenessBlock(modelId?: string): string {
  const state = getSystemState();
  const lines: string[] = [];

  lines.push("## 🧠 Self-Awareness — Who You Are");
  lines.push("");

  // ─── Model Identity ─────────────────────────────────────────────────────
  if (state.activeModel) {
    const m = state.activeModel;
    const p = m.profile;

    lines.push("### Your Identity");
    lines.push(`- **You are**: ${p.displayName} (model ID: \`${m.modelId}\`)`);
    lines.push(`- **Provider**: ${m.provider}`);
    lines.push(`- **Architecture**: ${p.architecture}`);
    if (p.parameterCount) lines.push(`- **Parameters**: ${p.parameterCount}`);
    if (p.trainingCutoff) lines.push(`- **Training cutoff**: ${p.trainingCutoff}`);
    lines.push(`- **Context window**: ${p.contextWindowReal.toLocaleString()} tokens`);
    lines.push(`- **Max output**: ${p.maxOutputTokens.toLocaleString()} tokens`);
    lines.push(`- **Cost tier**: ${p.costTier}`);
    lines.push("");

    // ─── What YOU (the model) can do ──────────────────────────────────────
    lines.push("### What YOU Can Do (Model-Native)");
    for (const cap of p.realCapabilities) {
      lines.push(`- ✅ ${cap}`);
    }
    lines.push("");

    // ─── What YOU cannot do ───────────────────────────────────────────────
    lines.push("### What YOU Cannot Do (Model Limitations)");
    for (const lim of p.knownLimitations) {
      lines.push(`- ❌ ${lim}`);
    }
    lines.push("");

    // ─── Best/worst task types ────────────────────────────────────────────
    lines.push("### Your Strengths & Weaknesses");
    lines.push(`- **Best for**: ${p.bestFor.join(", ")}`);
    lines.push(`- **Weakest at**: ${p.worstFor.join(", ")}`);
    if (p.reliabilityNotes) {
      lines.push(`- **Notes**: ${p.reliabilityNotes}`);
    }
    lines.push("");
  } else {
    lines.push("### ⚠️ No model configured — capabilities unknown.");
    lines.push("");
  }

  // ─── System Capabilities (what the SYSTEM around you can do) ────────────
  lines.push("### What the SYSTEM Can Do (Tools + Models Combined)");
  const sc = state.systemCapabilities;
  lines.push(`- Text/Chat: ${sc.canChat ? "✅" : "❌"}`);
  lines.push(`- Code Generation: ${sc.canGenerateCode ? "✅" : "❌"}`);
  lines.push(`- Image Generation: ✅ (via generate_image tool — uses Pollinations.ai by default, DALL-E 3 if OpenAI key configured, NVIDIA if NVIDIA_API_KEY set)`);
  lines.push(`- Image Analysis/Vision: ${sc.canAnalyzeImages ? "✅" : "❌"}`);
  lines.push(`- Web Search: ${sc.canSearchWeb ? "✅ (DuckDuckGo)" : "❌"}`);
  lines.push(`- Web Browsing: ${sc.canBrowseWeb ? "✅ (Headless Playwright)" : "❌"}`);
  lines.push(`- Code Execution: ${sc.canExecuteCode ? "✅ (Linux sandbox)" : "❌"}`);
  lines.push(`- File I/O: ${sc.canReadWriteFiles ? "✅" : "❌"}`);
  lines.push(`- Math: ${sc.canDoMath ? "✅" : "❌"}`);
  lines.push(`- Audio Generation: ${sc.canGenerateAudio ? "✅" : "❌"}`);
  lines.push(`- Video Generation: ${sc.canGenerateVideo ? "✅" : "❌"}`);
  lines.push("");

  // ─── Available Models ───────────────────────────────────────────────────
  if (state.availableModels.length > 0) {
    lines.push(`### Available Models (${state.availableModels.length})`);
    for (const m of state.availableModels.slice(0, 10)) {
      lines.push(`- ${m.name} (${m.provider}) — capabilities: [${m.capabilities.join(", ")}]`);
    }
    if (state.availableModels.length > 10) {
      lines.push(`- ... and ${state.availableModels.length - 10} more`);
    }
    lines.push("");
  }

  // ─── Self-Healing Status ────────────────────────────────────────────────
  const hs = state.healingStats;
  if (hs.totalActions > 0 || state.unresolvedGaps > 0) {
    lines.push("### Self-Healing Status");
    lines.push(`- Total healing actions: ${hs.totalActions}`);
    lines.push(`- Success rate: ${(hs.successRate * 100).toFixed(0)}%`);
    lines.push(`- Capabilities auto-healed: ${hs.capabilitiesHealed.length > 0 ? hs.capabilitiesHealed.join(", ") : "none yet"}`);
    lines.push(`- Unresolved gaps: ${state.unresolvedGaps}`);
    lines.push("");
  }

  // ─── Learning Status ────────────────────────────────────────────────────
  const ls = state.learningStats;
  if (ls.totalExecutions > 0) {
    lines.push("### Learning Status");
    lines.push(`- Total executions tracked: ${ls.totalExecutions}`);
    lines.push(`- Overall success rate: ${(ls.successRate * 100).toFixed(0)}%`);
    lines.push(`- Learning rules derived: ${ls.rulesCount}`);
    lines.push("");
  }

  // ─── Critical Rules ─────────────────────────────────────────────────────
  lines.push("### CRITICAL RULES FOR HONEST BEHAVIOR");
  lines.push("1. **NEVER claim you can do something you cannot.** If a capability is marked ❌, say so clearly.");
  lines.push("2. **NEVER pretend to generate images** if image generation is not available. Instead, explain what's needed.");
  lines.push("3. **If a task requires a missing capability**, explain what's missing and that the self-healing system will attempt to add it.");
  lines.push("4. **Be transparent about your limitations.** Users trust honesty more than false confidence.");
  lines.push("5. **If you're uncertain**, say so. It's better to be honest about uncertainty than to hallucinate.");
  lines.push("6. **You are stateless** — you have no memory of previous conversations unless it's provided in context.");
  lines.push("7. **Use tools** to compensate for your limitations — you can't browse the web natively, but you have web tools.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Build a compact self-awareness summary for token-constrained contexts.
 */
export function buildCompactSelfAwareness(modelId?: string): string {
  const state = getSystemState();
  const lines: string[] = [];

  if (state.activeModel) {
    const p = state.activeModel.profile;
    lines.push(`[Self-Awareness] You are ${p.displayName} (${state.activeModel.provider}). Context: ${p.contextWindowReal} tokens.`);
    lines.push(`Native: ${p.realCapabilities.join(", ")}. Cannot: generate images/audio/video natively.`);
    lines.push(`System tools: ${state.availableTools.map(t => t.name).join(", ")}.`);
    if (state.systemCapabilities.canGenerateImages) {
      lines.push(`Image gen: ✅ via DALL-E tool.`);
    } else {
      lines.push(`Image gen: ❌ not configured (self-healing will attempt on first request).`);
    }
  }

  return lines.join(" ");
}

/**
 * Get a model's honest capability assessment for a specific task.
 */
export function assessModelForTask(
  modelId: string,
  taskDescription: string,
  taskType: string
): {
  suitable: boolean;
  confidence: number;
  reasons: string[];
  alternatives: string[];
} {
  const profile = getModelProfile(modelId);
  const reasons: string[] = [];
  const alternatives: string[] = [];
  let confidence = 0.5;

  // Check if model is good at this task type
  if (profile.bestFor.some(t => taskType.toLowerCase().includes(t) || t.includes(taskType.toLowerCase()))) {
    confidence += 0.3;
    reasons.push(`${profile.displayName} excels at ${taskType} tasks`);
  }

  if (profile.worstFor.some(t => taskType.toLowerCase().includes(t) || t.includes(taskType.toLowerCase()))) {
    confidence -= 0.3;
    reasons.push(`${profile.displayName} struggles with ${taskType} tasks`);
  }

  // Check for image generation requests
  if (/\b(generate|create|make|draw)\b.*\b(image|picture|photo)\b/i.test(taskDescription)) {
    if (!profile.canGenerateImages) {
      confidence -= 0.4;
      reasons.push(`${profile.displayName} cannot generate images — needs DALL-E tool`);
      alternatives.push("Use generate_image tool (Pollinations.ai is always available, no API key needed)");
    }
  }

  // Check for vision requests
  if (/\b(look at|analyze|describe)\b.*\b(image|picture|photo|screenshot)\b/i.test(taskDescription)) {
    if (!profile.canAnalyzeImages) {
      confidence -= 0.3;
      reasons.push(`${profile.displayName} cannot analyze images — no vision capability`);
      alternatives.push("Use a vision-capable model (GPT-4o, Claude Sonnet, Gemini)");
    }
  }

  return {
    suitable: confidence >= 0.4,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons,
    alternatives,
  };
}

/**
 * Get the full self-awareness report as a structured object (for API/UI).
 */
export function getSelfAwarenessReport(): {
  identity: {
    modelName: string;
    modelId: string;
    provider: string;
    architecture: string;
    parameterCount: string;
    trainingCutoff: string;
    contextWindow: number;
    maxOutputTokens: number;
    costTier: string;
  } | null;
  capabilities: {
    native: string[];
    system: Record<string, boolean>;
    limitations: string[];
  };
  health: {
    healingActions: number;
    healingSuccessRate: number;
    unresolvedGaps: number;
    capabilitiesHealed: string[];
    correctionStats: ReturnType<typeof getCorrectionStats>;
  };
  learning: {
    totalExecutions: number;
    successRate: number;
    rulesCount: number;
  };
  models: Array<{
    name: string;
    provider: string;
    capabilities: string[];
  }>;
  tools: string[];
} {
  const state = getSystemState();

  let correctionStatsResult;
  try { correctionStatsResult = getCorrectionStats(); } catch {
    correctionStatsResult = { totalCorrections: 0, successRate: 0, avgAttempts: 0, byType: {} };
  }

  return {
    identity: state.activeModel ? {
      modelName: state.activeModel.profile.displayName,
      modelId: state.activeModel.modelId,
      provider: state.activeModel.provider,
      architecture: state.activeModel.profile.architecture,
      parameterCount: state.activeModel.profile.parameterCount || "Unknown",
      trainingCutoff: state.activeModel.profile.trainingCutoff || "Unknown",
      contextWindow: state.activeModel.profile.contextWindowReal,
      maxOutputTokens: state.activeModel.profile.maxOutputTokens,
      costTier: state.activeModel.profile.costTier,
    } : null,
    capabilities: {
      native: state.activeModel?.profile.realCapabilities || [],
      system: state.systemCapabilities as unknown as Record<string, boolean>,
      limitations: state.activeModel?.profile.knownLimitations || [],
    },
    health: {
      healingActions: state.healingStats.totalActions,
      healingSuccessRate: state.healingStats.successRate,
      unresolvedGaps: state.unresolvedGaps,
      capabilitiesHealed: state.healingStats.capabilitiesHealed,
      correctionStats: correctionStatsResult,
    },
    learning: {
      totalExecutions: state.learningStats.totalExecutions,
      successRate: state.learningStats.successRate,
      rulesCount: state.learningStats.rulesCount,
    },
    models: state.availableModels.map(m => ({
      name: m.name,
      provider: m.provider,
      capabilities: m.capabilities,
    })),
    tools: state.availableTools.map(t => t.name),
  };
}
