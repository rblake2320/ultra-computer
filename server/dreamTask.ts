/**
 * dreamTask.ts
 *
 * Background memory consolidation engine for Ultra Computer.
 * Inspired by Claude Code's DreamTask, this module runs asynchronously
 * to review recent sessions, extract durable knowledge, prune stale
 * data, and update the knowledge engine — without blocking the main
 * conversation thread.
 *
 * Phases:
 *   1. Orient  — Scan recent sessions and identify knowledge gaps
 *   2. Gather  — Extract key facts, patterns, and user preferences
 *   3. Consolidate — Merge new knowledge with existing entries, resolve conflicts
 *   4. Prune   — Remove stale, redundant, or low-confidence entries
 *
 * @module dreamTask
 */

import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DreamPhase = "idle" | "orient" | "gather" | "consolidate" | "prune" | "complete" | "error";

export interface DreamTaskState {
  id: string;
  phase: DreamPhase;
  status: "idle" | "running" | "complete" | "error";
  startedAt: string | null;
  completedAt: string | null;
  sessionsReviewed: number;
  knowledgeExtracted: number;
  knowledgePruned: number;
  entriesMerged: number;
  error: string | null;
  /** Turns/steps taken during the dream cycle. */
  turns: DreamTurn[];
}

export interface DreamTurn {
  phase: DreamPhase;
  action: string;
  detail: string;
  timestamp: string;
}

export interface DreamConfig {
  /** Minimum idle time (ms) before triggering a dream cycle. */
  idleThresholdMs: number;
  /** Maximum number of recent sessions to review per cycle. */
  maxSessionsToReview: number;
  /** Maximum number of knowledge entries to extract per session. */
  maxEntriesPerSession: number;
  /** Confidence threshold below which entries are pruned. */
  pruneConfidenceThreshold: number;
  /** Maximum age (days) for entries before they're considered stale. */
  maxEntryAgeDays: number;
  /** Whether to run automatically on idle detection. */
  autoRun: boolean;
}

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  confidence: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Dependencies (injected to avoid circular imports)
// ---------------------------------------------------------------------------

type StorageAdapter = {
  getRecentConversations: (limit: number) => Promise<Array<{ id: string; title: string; createdAt: string }>>;
  getConversationMessages: (conversationId: string) => Promise<ConversationMessage[]>;
};

type KnowledgeAdapter = {
  search: (query: string) => Promise<KnowledgeEntry[]>;
  add: (entry: Omit<KnowledgeEntry, "id" | "createdAt" | "updatedAt">) => Promise<KnowledgeEntry>;
  update: (id: string, updates: Partial<KnowledgeEntry>) => Promise<KnowledgeEntry>;
  remove: (id: string) => Promise<void>;
  getAll: () => Promise<KnowledgeEntry[]>;
};

type LLMAdapter = {
  chat: (systemPrompt: string, userMessage: string) => Promise<string>;
};

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: DreamConfig = {
  idleThresholdMs: 5 * 60 * 1000, // 5 minutes
  maxSessionsToReview: 10,
  maxEntriesPerSession: 5,
  pruneConfidenceThreshold: 0.3,
  maxEntryAgeDays: 90,
  autoRun: true,
};

// ---------------------------------------------------------------------------
// DreamTask Engine
// ---------------------------------------------------------------------------

export class DreamTaskEngine {
  private state: DreamTaskState;
  private config: DreamConfig;
  private storage: StorageAdapter | null = null;
  private knowledge: KnowledgeAdapter | null = null;
  private llm: LLMAdapter | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private lastActivityTime: number = Date.now();

  constructor(config: Partial<DreamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createIdleState();
  }

  /** Wire up the storage, knowledge, and LLM adapters. */
  initialize(storage: StorageAdapter, knowledge: KnowledgeAdapter, llm: LLMAdapter): void {
    this.storage = storage;
    this.knowledge = knowledge;
    this.llm = llm;

    if (this.config.autoRun) {
      this.startIdleDetection();
    }
  }

  /** Record user activity to reset the idle timer. */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.config.autoRun) {
      this.startIdleDetection();
    }
  }

  /** Get the current dream task state. */
  getState(): DreamTaskState {
    return { ...this.state };
  }

  /** Get the current configuration. */
  getConfig(): DreamConfig {
    return { ...this.config };
  }

  /** Update configuration. */
  updateConfig(updates: Partial<DreamConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** Manually trigger a dream cycle. */
  async runDreamCycle(): Promise<DreamTaskState> {
    if (this.state.status === "running") {
      return this.state;
    }

    if (!this.storage || !this.knowledge || !this.llm) {
      throw new Error("DreamTask not initialized — call initialize() first");
    }

    this.abortController = new AbortController();
    this.state = {
      id: uuidv4(),
      phase: "orient",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      sessionsReviewed: 0,
      knowledgeExtracted: 0,
      knowledgePruned: 0,
      entriesMerged: 0,
      error: null,
      turns: [],
    };

    try {
      await this.phaseOrient();
      if (this.abortController.signal.aborted) return this.state;

      await this.phaseGather();
      if (this.abortController.signal.aborted) return this.state;

      await this.phaseConsolidate();
      if (this.abortController.signal.aborted) return this.state;

      await this.phasePrune();

      this.state.phase = "complete";
      this.state.status = "complete";
      this.state.completedAt = new Date().toISOString();
      this.addTurn("complete", "Dream cycle finished", `Reviewed ${this.state.sessionsReviewed} sessions, extracted ${this.state.knowledgeExtracted} entries, pruned ${this.state.knowledgePruned}, merged ${this.state.entriesMerged}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.state.phase = "error";
      this.state.status = "error";
      this.state.error = message;
      this.state.completedAt = new Date().toISOString();
      this.addTurn("error", "Dream cycle failed", message);
    }

    return this.state;
  }

  /** Cancel a running dream cycle. */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.state.status === "running") {
      this.state.status = "complete";
      this.state.completedAt = new Date().toISOString();
      this.addTurn(this.state.phase, "Cancelled", "Dream cycle was cancelled by user");
    }
  }

  /** Shut down the engine and clean up timers. */
  shutdown(): void {
    this.cancel();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Phase Implementations
  // -----------------------------------------------------------------------

  private async phaseOrient(): Promise<void> {
    this.state.phase = "orient";
    this.addTurn("orient", "Scanning recent sessions", "Identifying knowledge gaps");

    const conversations = await this.storage!.getRecentConversations(this.config.maxSessionsToReview);
    this.state.sessionsReviewed = conversations.length;

    this.addTurn("orient", "Sessions identified", `Found ${conversations.length} recent sessions to review`);
  }

  private async phaseGather(): Promise<void> {
    this.state.phase = "gather";
    this.addTurn("gather", "Extracting knowledge from sessions", "Using LLM to identify key facts and patterns");

    const conversations = await this.storage!.getRecentConversations(this.config.maxSessionsToReview);

    for (const conv of conversations) {
      if (this.abortController?.signal.aborted) return;

      const messages = await this.storage!.getConversationMessages(conv.id);
      if (messages.length < 2) continue;

      // Build a summary of the conversation for the LLM
      const transcript = messages
        .slice(-30) // Last 30 messages like Claude Code
        .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
        .join("\n");

      const extractionPrompt = `Analyze this conversation and extract durable knowledge entries. For each entry, provide:
- title: A short descriptive title
- content: The key fact, pattern, or preference
- category: One of [fact, preference, pattern, skill, context]
- confidence: A number 0.0-1.0

Return a JSON array of entries. Only include genuinely useful, long-term knowledge. Skip ephemeral details.

Conversation:
${transcript}`;

      try {
        const response = await this.llm!.chat(
          "You are a knowledge extraction agent. Extract durable knowledge from conversations. Return valid JSON only.",
          extractionPrompt
        );

        const entries = this.parseKnowledgeEntries(response);
        for (const entry of entries.slice(0, this.config.maxEntriesPerSession)) {
          await this.knowledge!.add({
            title: entry.title,
            content: entry.content,
            category: entry.category,
            confidence: entry.confidence,
            source: `dream:${conv.id}`,
          });
          this.state.knowledgeExtracted++;
        }

        this.addTurn("gather", `Processed session ${conv.id.slice(0, 8)}`, `Extracted ${Math.min(entries.length, this.config.maxEntriesPerSession)} entries`);
      } catch {
        this.addTurn("gather", `Failed to process session ${conv.id.slice(0, 8)}`, "LLM extraction failed — skipping");
      }
    }
  }

  private async phaseConsolidate(): Promise<void> {
    this.state.phase = "consolidate";
    this.addTurn("consolidate", "Merging duplicate knowledge", "Resolving conflicts and deduplicating");

    const allEntries = await this.knowledge!.getAll();

    // Group by category
    const byCategory = new Map<string, KnowledgeEntry[]>();
    for (const entry of allEntries) {
      const group = byCategory.get(entry.category) || [];
      group.push(entry);
      byCategory.set(entry.category, group);
    }

    // For each category, ask the LLM to identify duplicates
    for (const [category, entries] of Array.from(byCategory.entries())) {
      if (this.abortController?.signal.aborted) return;
      if (entries.length < 2) continue;

      const entrySummaries = entries.map((e, i) => `[${i}] ${e.title}: ${e.content.slice(0, 200)}`).join("\n");

      const mergePrompt = `These knowledge entries are in the "${category}" category. Identify any duplicates or entries that should be merged. Return a JSON array of merge operations:
[{ "keep": <index>, "remove": [<indices>], "mergedContent": "combined content" }]

If no merges needed, return [].

Entries:
${entrySummaries}`;

      try {
        const response = await this.llm!.chat(
          "You are a knowledge consolidation agent. Identify duplicates and merge them. Return valid JSON only.",
          mergePrompt
        );

        const mergeOps = this.parseMergeOperations(response);
        for (const op of mergeOps) {
          if (op.keep >= 0 && op.keep < entries.length) {
            // Update the kept entry
            await this.knowledge!.update(entries[op.keep].id, {
              content: op.mergedContent || entries[op.keep].content,
              confidence: Math.min(1.0, entries[op.keep].confidence + 0.1),
            });

            // Remove duplicates
            for (const removeIdx of op.remove) {
              if (removeIdx >= 0 && removeIdx < entries.length && removeIdx !== op.keep) {
                await this.knowledge!.remove(entries[removeIdx].id);
                this.state.entriesMerged++;
              }
            }
          }
        }
      } catch {
        // Non-critical — skip merge for this category
      }
    }

    this.addTurn("consolidate", "Consolidation complete", `Merged ${this.state.entriesMerged} duplicate entries`);
  }

  private async phasePrune(): Promise<void> {
    this.state.phase = "prune";
    this.addTurn("prune", "Pruning stale and low-confidence entries", "Cleaning up knowledge base");

    const allEntries = await this.knowledge!.getAll();
    const now = Date.now();
    const maxAgeMs = this.config.maxEntryAgeDays * 24 * 60 * 60 * 1000;

    for (const entry of allEntries) {
      if (this.abortController?.signal.aborted) return;

      const entryAge = now - new Date(entry.createdAt).getTime();
      const isStale = entryAge > maxAgeMs;
      const isLowConfidence = entry.confidence < this.config.pruneConfidenceThreshold;

      if (isStale && isLowConfidence) {
        await this.knowledge!.remove(entry.id);
        this.state.knowledgePruned++;
      }
    }

    this.addTurn("prune", "Pruning complete", `Removed ${this.state.knowledgePruned} stale/low-confidence entries`);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private createIdleState(): DreamTaskState {
    return {
      id: "",
      phase: "idle",
      status: "idle",
      startedAt: null,
      completedAt: null,
      sessionsReviewed: 0,
      knowledgeExtracted: 0,
      knowledgePruned: 0,
      entriesMerged: 0,
      error: null,
      turns: [],
    };
  }

  private addTurn(phase: DreamPhase, action: string, detail: string): void {
    this.state.turns.push({
      phase,
      action,
      detail,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 50 turns to prevent unbounded growth
    if (this.state.turns.length > 50) {
      this.state.turns = this.state.turns.slice(-50);
    }
  }

  private startIdleDetection(): void {
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(async () => {
      this.idleTimer = null;
      const idleTime = Date.now() - this.lastActivityTime;
      if (idleTime >= this.config.idleThresholdMs && this.state.status !== "running") {
        try {
          await this.runDreamCycle();
        } catch {
          // Non-critical — idle dream failed
        }
      }
    }, this.config.idleThresholdMs);
  }

  private parseKnowledgeEntries(response: string): Array<{ title: string; content: string; category: string; confidence: number }> {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e: Record<string, unknown>) => e.title && e.content && e.category && typeof e.confidence === "number"
      );
    } catch {
      return [];
    }
  }

  private parseMergeOperations(response: string): Array<{ keep: number; remove: number[]; mergedContent?: string }> {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (op: Record<string, unknown>) => typeof op.keep === "number" && Array.isArray(op.remove)
      );
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const dreamTaskEngine = new DreamTaskEngine();
