/**
 * Memory Manager — Layer 5
 * Orchestrator-only persistent memory.
 * Stores facts, preferences, and prior work. Workers never access this directly.
 */

import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";
import { chat } from "./modelRouter.js";
import { advancedMemorySearch, extractEntities, calculateImportance, deduplicateMemories } from "./memoryUpgrades.js";

class MemoryManager {
  // Recall relevant memories for a prompt — uses TF-IDF ranking from memoryUpgrades
  recallForPrompt(prompt: string, limit = 5): string {
    const recent = storage.getMemories(200);
    if (recent.length === 0) return "";

    // Use advancedMemorySearch for TF-IDF + Jaccard ranking
    const searchResults = advancedMemorySearch(prompt, recent, limit);

    if (searchResults.length === 0) return "";

    // Touch last accessed
    for (const { memory: mem } of searchResults) {
      storage.updateMemory(mem.id, { lastAccessedAt: Date.now() });
    }

    return searchResults
      .map(r => r.memory.summary || r.memory.content)
      .join("\n");
  }

  // Extract durable facts from a conversation turn and store them
  async extractAndStore(userMessage: string, assistantResponse: string, sessionId: string): Promise<void> {
    try {
      const orchModel = storage.getOrchestratorModel() || storage.getDefaultModel();
      if (!orchModel) return;

      const extraction = await chat([
        {
          role: "system",
          content: `Extract durable facts worth remembering from this conversation turn.
Focus on: user preferences, project context, decisions made, key facts learned, user identity info.
Skip transient content (e.g. "thanks", simple Q&A with no lasting significance).

Output JSON array (empty array if nothing worth remembering):
[
  {
    "content": "Full fact to remember",
    "summary": "One-line summary",
    "category": "preference|project|fact|identity|decision",
    "importance": 0.0-1.0
  }
]
Output ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `User: ${userMessage}\n\nAssistant: ${assistantResponse.slice(0, 1000)}`,
        },
      ], { modelId: orchModel.id, maxTokens: 500, temperature: 0.1 });

      const jsonMatch = extraction.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      const facts = JSON.parse(jsonMatch[0]) as Array<{
        content: string;
        summary: string;
        category: string;
        importance: number;
      }>;

      // Fetch existing memories for dedup + importance scoring
      const existingMemories = storage.getMemories(200);

      for (const fact of facts) {
        if (!fact.content) continue;

        // Use calculateImportance from memoryUpgrades to compute a better importance score
        const computedImportance = calculateImportance(fact.content, existingMemories);
        const finalImportance = Math.max(fact.importance ?? 0, computedImportance);

        if (finalImportance > 0.3) {
          // Extract entities and append them to the summary
          const entities = extractEntities(fact.content);
          const enrichedSummary = entities.length > 0
            ? `${fact.summary || fact.content.slice(0, 100)} [entities: ${entities.slice(0, 5).join(", ")}]`
            : (fact.summary || null);

          storage.createMemory({
            id: uuidv4(),
            content: fact.content,
            summary: enrichedSummary,
            category: fact.category || "general",
            importance: Math.min(1, Math.max(0, finalImportance)),
            sessionId,
            embeddings: null,
            sourceMessageId: null,
          });

          // Run deduplication on each insert to prevent near-duplicate accumulation
          const updatedMemories = storage.getMemories(200);
          const deduped = deduplicateMemories(updatedMemories);
          const toDelete = updatedMemories.filter(m => !deduped.find(d => d.id === m.id));
          for (const dup of toDelete) {
            storage.deleteMemory(dup.id);
          }
        }
      }
    } catch (error) {
      // Memory extraction is non-critical — log but don't rethrow
      console.error('[MemoryManager]', error);
    }
  }

  // Compact old memories (summarize groups of low-importance memories)
  async compact(): Promise<void> {
    const all = storage.getMemories(200);
    if (all.length < 50) return;
    // Simple: remove lowest importance items older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toRemove = all.filter(m => m.importance < 0.3 && m.createdAt < cutoff);
    for (const m of toRemove.slice(0, 10)) storage.deleteMemory(m.id);
  }
}

export const memoryManager = new MemoryManager();
