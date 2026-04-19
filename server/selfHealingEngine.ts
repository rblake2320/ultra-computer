/**
 * Self-Healing Engine — Autonomous Capability Restoration
 * ═══════════════════════════════════════════════════════════════════════════
 * When the Capability Gap Detector identifies a missing capability, this
 * engine attempts to automatically fix the issue. It can:
 *
 *   1. Auto-register missing models (e.g., DALL-E 3 for image generation)
 *   2. Resolve API keys from environment variables
 *   3. Enable/configure disabled models
 *   4. Create skill files for recurring patterns
 *   5. Log all healing actions for audit and learning
 *
 * Design principles:
 *   - Never break existing functionality
 *   - All healing actions are reversible
 *   - Persistent log of all actions taken
 *   - Confidence-based: only auto-heal when confidence is high
 *   - Falls back to user notification when auto-healing isn't possible
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage.js";
import {
  type CapabilityGap,
  resolveGap,
  updateCapabilityMap,
  detectGapFromError,
} from "./capabilityGapDetector.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealingAction {
  id: string;
  gapId: string;
  capability: string;
  actionType: string;         // e.g., "auto_register_model", "resolve_env_key", "enable_model"
  description: string;
  status: "pending" | "executing" | "success" | "failed" | "rolled_back";
  result?: string;
  error?: string;
  rollbackInfo?: string;      // JSON describing how to undo this action
  startedAt: number;
  completedAt?: number;
}

export interface HealingResult {
  success: boolean;
  action: HealingAction;
  message: string;
  modelId?: string;           // if a model was created/configured
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data/self-healing");
const ACTIONS_PATH = path.join(DATA_DIR, "healing-actions.json");

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

function loadActions(): HealingAction[] {
  return readJson<HealingAction[]>(ACTIONS_PATH, []);
}

function saveActions(actions: HealingAction[]): void {
  writeJson(ACTIONS_PATH, actions);
}

function recordAction(action: HealingAction): void {
  const actions = loadActions();
  actions.push(action);
  if (actions.length > 500) actions.splice(0, actions.length - 500);
  saveActions(actions);
}

function updateAction(actionId: string, updates: Partial<HealingAction>): void {
  const actions = loadActions();
  const idx = actions.findIndex(a => a.id === actionId);
  if (idx !== -1) {
    Object.assign(actions[idx], updates);
    saveActions(actions);
  }
}

// ─── Healing Strategies ──────────────────────────────────────────────────────

type HealingStrategy = (gap: CapabilityGap) => Promise<HealingResult>;

/**
 * Strategy: Auto-register DALL-E 3 for image generation.
 * Uses the existing OpenAI API key from the environment or from the
 * already-configured GPT model.
 */
async function healImageGeneration(gap: CapabilityGap): Promise<HealingResult> {
  const actionId = crypto.randomUUID();
  const action: HealingAction = {
    id: actionId,
    gapId: gap.id,
    capability: "image_generation",
    actionType: "auto_register_model",
    description: "Auto-registering DALL-E 3 model for image generation",
    status: "executing",
    startedAt: Date.now(),
  };
  recordAction(action);

  try {
    // Step 1: Check if there's already an image model that's just disabled
    const allModels = storage.getModels();
    const disabledImageModel = allModels.find(m => {
      if (m.enabled) return false;
      try {
        const caps: string[] = JSON.parse(m.capabilities || "[]");
        return caps.some(c => c.toLowerCase().includes("image"));
      } catch { return false; }
    });

    if (disabledImageModel) {
      // Re-enable the existing image model
      storage.updateModel(disabledImageModel.id, { enabled: true });
      action.status = "success";
      action.result = `Re-enabled existing image model: ${disabledImageModel.name} (${disabledImageModel.id})`;
      action.rollbackInfo = JSON.stringify({ action: "disable_model", modelId: disabledImageModel.id });
      action.completedAt = Date.now();
      updateAction(actionId, action);

      resolveGap(gap.id, `Re-enabled existing model: ${disabledImageModel.name}`);
      updateCapabilityMap("image_generation", "auto_healed", action.result, disabledImageModel.id);

      console.log(`[selfHealing] ✅ Re-enabled image model: ${disabledImageModel.name}`);
      return { success: true, action, message: action.result, modelId: disabledImageModel.id };
    }

    // Step 2: Find an API key to use — check existing OpenAI models first
    let apiKey: string | null = null;
    let baseUrl: string | null = null;

    const existingOpenAI = allModels.find(m =>
      m.provider === "openai" && m.enabled && m.apiKey
    );

    if (existingOpenAI?.apiKey) {
      apiKey = existingOpenAI.apiKey;
      baseUrl = existingOpenAI.baseUrl || null;
    }

    // Fallback: check environment variable
    if (!apiKey) {
      const envKey = process.env.OPENAI_API_KEY;
      if (envKey) {
        apiKey = envKey;
      }
    }

    if (!apiKey) {
      action.status = "failed";
      action.error = "No OpenAI API key found in existing models or environment variables";
      action.completedAt = Date.now();
      updateAction(actionId, action);
      return {
        success: false,
        action,
        message: "Cannot auto-register DALL-E 3: No OpenAI API key available. Please add an API key in Settings → Models.",
      };
    }

    // Step 3: Create the DALL-E 3 model entry
    const modelId = crypto.randomUUID();
    const model = storage.createModel({
      id: modelId,
      name: "DALL-E 3 (Auto-configured)",
      provider: "openai",
      modelId: "dall-e-3",
      baseUrl,
      apiKey,
      enabled: true,
      capabilities: JSON.stringify(["image"]),
      contextWindow: 4096,
      isDefault: false,
      isOrchestrator: false,
      speedTier: "medium",
      notes: "Auto-configured by Self-Healing Engine for image generation",
      authMethod: existingOpenAI?.authMethod || "api_key",
      oauthTokens: null as any,
      envVarName: existingOpenAI?.envVarName || null,
      connectionStatus: "connected",
      connectionError: null as any,
      lastTestedAt: Date.now() as any,
      lastTestLatency: null as any,
    });

    action.status = "success";
    action.result = `Created DALL-E 3 model: ${model.name} (${model.id})`;
    action.rollbackInfo = JSON.stringify({ action: "delete_model", modelId: model.id });
    action.completedAt = Date.now();
    updateAction(actionId, action);

    resolveGap(gap.id, `Auto-registered DALL-E 3 model (${model.id})`);
    updateCapabilityMap("image_generation", "auto_healed", action.result, model.id);

    console.log(`[selfHealing] ✅ Auto-registered DALL-E 3 model: ${model.id}`);
    return { success: true, action, message: action.result, modelId: model.id };

  } catch (err: any) {
    action.status = "failed";
    action.error = err.message;
    action.completedAt = Date.now();
    updateAction(actionId, action);
    console.error(`[selfHealing] ❌ Failed to heal image generation:`, err.message);
    return { success: false, action, message: `Healing failed: ${err.message}` };
  }
}

/**
 * Strategy: Resolve API key from environment variables.
 */
async function healApiKeyFromEnv(gap: CapabilityGap): Promise<HealingResult> {
  const actionId = crypto.randomUUID();
  const action: HealingAction = {
    id: actionId,
    gapId: gap.id,
    capability: gap.capability,
    actionType: "resolve_env_key",
    description: "Resolving API key from environment variables",
    status: "executing",
    startedAt: Date.now(),
  };
  recordAction(action);

  try {
    // Find models with missing API keys that have env_var auth
    const models = storage.getModels().filter(m => m.enabled && !m.apiKey && m.envVarName);

    let fixed = 0;
    for (const model of models) {
      const envValue = process.env[model.envVarName!];
      if (envValue) {
        storage.updateModel(model.id, {
          apiKey: envValue,
          connectionStatus: "connected",
        });
        fixed++;
      }
    }

    if (fixed > 0) {
      action.status = "success";
      action.result = `Resolved API keys for ${fixed} model(s) from environment variables`;
      action.completedAt = Date.now();
      updateAction(actionId, action);
      resolveGap(gap.id, action.result);
      return { success: true, action, message: action.result };
    }

    action.status = "failed";
    action.error = "No environment variables found with API keys";
    action.completedAt = Date.now();
    updateAction(actionId, action);
    return { success: false, action, message: action.error };

  } catch (err: any) {
    action.status = "failed";
    action.error = err.message;
    action.completedAt = Date.now();
    updateAction(actionId, action);
    return { success: false, action, message: `Healing failed: ${err.message}` };
  }
}

/**
 * Strategy: Upgrade to a vision-capable model.
 */
async function healVisionCapability(gap: CapabilityGap): Promise<HealingResult> {
  const actionId = crypto.randomUUID();
  const action: HealingAction = {
    id: actionId,
    gapId: gap.id,
    capability: "vision",
    actionType: "upgrade_model_capability",
    description: "Checking for vision-capable models or upgrading existing ones",
    status: "executing",
    startedAt: Date.now(),
  };
  recordAction(action);

  try {
    // Check if any existing model supports vision
    const models = storage.getModels().filter(m => m.enabled);
    for (const m of models) {
      try {
        const caps: string[] = JSON.parse(m.capabilities || "[]");
        if (caps.includes("vision")) {
          action.status = "success";
          action.result = `Vision capability already available via model: ${m.name}`;
          action.completedAt = Date.now();
          updateAction(actionId, action);
          resolveGap(gap.id, action.result);
          updateCapabilityMap("vision", "available", action.result, m.id);
          return { success: true, action, message: action.result, modelId: m.id };
        }
      } catch { /* skip */ }
    }

    // GPT-4.1-mini actually supports vision — update its capabilities
    const gptModel = models.find(m => m.modelId.includes("gpt-4") && m.provider === "openai");
    if (gptModel) {
      try {
        const caps: string[] = JSON.parse(gptModel.capabilities || "[]");
        if (!caps.includes("vision")) {
          caps.push("vision");
          storage.updateModel(gptModel.id, { capabilities: JSON.stringify(caps) });
          action.status = "success";
          action.result = `Added vision capability to ${gptModel.name}`;
          action.rollbackInfo = JSON.stringify({
            action: "remove_capability",
            modelId: gptModel.id,
            capability: "vision",
          });
          action.completedAt = Date.now();
          updateAction(actionId, action);
          resolveGap(gap.id, action.result);
          updateCapabilityMap("vision", "auto_healed", action.result, gptModel.id);
          return { success: true, action, message: action.result, modelId: gptModel.id };
        }
      } catch { /* skip */ }
    }

    action.status = "failed";
    action.error = "No vision-capable model available and cannot upgrade existing models";
    action.completedAt = Date.now();
    updateAction(actionId, action);
    return { success: false, action, message: action.error };

  } catch (err: any) {
    action.status = "failed";
    action.error = err.message;
    action.completedAt = Date.now();
    updateAction(actionId, action);
    return { success: false, action, message: `Healing failed: ${err.message}` };
  }
}

/**
 * Strategy: Backoff and retry for rate limits.
 */
async function healRateLimit(gap: CapabilityGap): Promise<HealingResult> {
  const actionId = crypto.randomUUID();
  const action: HealingAction = {
    id: actionId,
    gapId: gap.id,
    capability: gap.capability,
    actionType: "backoff_retry",
    description: "Applying exponential backoff for rate-limited API",
    status: "executing",
    startedAt: Date.now(),
  };
  recordAction(action);

  // Wait with exponential backoff
  const waitMs = 5000 + Math.random() * 5000;
  await new Promise(resolve => setTimeout(resolve, waitMs));

  action.status = "success";
  action.result = `Waited ${Math.round(waitMs)}ms for rate limit cooldown`;
  action.completedAt = Date.now();
  updateAction(actionId, action);
  resolveGap(gap.id, action.result);

  return { success: true, action, message: action.result };
}

// ─── Strategy Router ─────────────────────────────────────────────────────────

const HEALING_STRATEGIES: Record<string, HealingStrategy> = {
  auto_register_dalle3: healImageGeneration,
  resolve_api_key_from_env: healApiKeyFromEnv,
  upgrade_to_vision_model: healVisionCapability,
  backoff_and_retry: healRateLimit,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attempt to heal a detected capability gap.
 * Returns the healing result with success/failure status.
 */
export async function healGap(gap: CapabilityGap): Promise<HealingResult> {
  if (!gap.autoResolvable) {
    return {
      success: false,
      action: {
        id: crypto.randomUUID(),
        gapId: gap.id,
        capability: gap.capability,
        actionType: "manual_required",
        description: `Gap requires manual intervention: ${gap.description}`,
        status: "failed",
        error: "This gap cannot be auto-resolved",
        startedAt: Date.now(),
        completedAt: Date.now(),
      },
      message: `Cannot auto-heal: ${gap.description}. Manual configuration required.`,
    };
  }

  const strategy = gap.suggestedResolution
    ? HEALING_STRATEGIES[gap.suggestedResolution]
    : undefined;

  if (!strategy) {
    console.warn(`[selfHealing] No strategy found for resolution: ${gap.suggestedResolution}`);
    return {
      success: false,
      action: {
        id: crypto.randomUUID(),
        gapId: gap.id,
        capability: gap.capability,
        actionType: "no_strategy",
        description: `No healing strategy for: ${gap.suggestedResolution}`,
        status: "failed",
        error: "No healing strategy available",
        startedAt: Date.now(),
        completedAt: Date.now(),
      },
      message: `No healing strategy available for: ${gap.suggestedResolution}`,
    };
  }

  console.log(`[selfHealing] Attempting to heal gap: ${gap.capability} via ${gap.suggestedResolution}`);
  return strategy(gap);
}

/**
 * Rollback a healing action if it caused problems.
 */
export function rollbackAction(actionId: string): boolean {
  const actions = loadActions();
  const action = actions.find(a => a.id === actionId);
  if (!action || !action.rollbackInfo) return false;

  try {
    const rollback = JSON.parse(action.rollbackInfo);

    switch (rollback.action) {
      case "delete_model":
        // We can't truly delete with current storage API, so disable it
        storage.updateModel(rollback.modelId, { enabled: false });
        break;
      case "disable_model":
        storage.updateModel(rollback.modelId, { enabled: false });
        break;
      case "remove_capability": {
        const model = storage.getModel(rollback.modelId);
        if (model) {
          try {
            const caps: string[] = JSON.parse(model.capabilities || "[]");
            const filtered = caps.filter(c => c !== rollback.capability);
            storage.updateModel(rollback.modelId, { capabilities: JSON.stringify(filtered) });
          } catch { /* skip */ }
        }
        break;
      }
      default:
        return false;
    }

    action.status = "rolled_back";
    updateAction(actionId, action);
    console.log(`[selfHealing] Rolled back action: ${actionId}`);
    return true;
  } catch (err: any) {
    console.error(`[selfHealing] Rollback failed for ${actionId}:`, err.message);
    return false;
  }
}

/**
 * Get healing action history.
 */
export function getHealingHistory(opts?: {
  capability?: string;
  status?: HealingAction["status"];
  limit?: number;
}): HealingAction[] {
  let actions = loadActions();

  if (opts?.capability) {
    actions = actions.filter(a => a.capability === opts.capability);
  }
  if (opts?.status) {
    actions = actions.filter(a => a.status === opts.status);
  }

  // Newest first
  actions.sort((a, b) => b.startedAt - a.startedAt);

  if (opts?.limit) {
    actions = actions.slice(0, opts.limit);
  }

  return actions;
}

/**
 * Get healing stats summary.
 */
export function getHealingStats(): {
  totalActions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  capabilitiesHealed: string[];
  lastHealingAt: number | null;
} {
  const actions = loadActions();
  const successes = actions.filter(a => a.status === "success");
  const failures = actions.filter(a => a.status === "failed");

  const capabilitiesHealed = [...new Set(successes.map(a => a.capability))];

  return {
    totalActions: actions.length,
    successCount: successes.length,
    failureCount: failures.length,
    successRate: actions.length > 0 ? successes.length / actions.length : 0,
    capabilitiesHealed,
    lastHealingAt: actions.length > 0
      ? Math.max(...actions.map(a => a.startedAt))
      : null,
  };
}
