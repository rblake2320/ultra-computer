/**
 * Memory Manager — Layer 5
 * Orchestrator-only persistent memory.
 * Stores facts, preferences, and prior work. Workers never access this directly.
 */

import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";
import { advancedMemorySearch } from "./memoryUpgrades.js";

// Patterns that should never appear in stored memory content.
// These are prompt-injection payloads that an attacker might try to bake in.
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions?/i,
  /you are now/i,
  /system prompt/i,
  /\beval\s*\(/i,
  /<script[\s>]/i,
  /\bexec\s*\(/i,
];

function isSafeMemoryContent(content: string): boolean {
  if (!content || content.length > 2000) return false;
  return !INJECTION_PATTERNS.some(re => re.test(content));
}

class MemoryManager {
  // Recall relevant memories for a prompt — uses TF-IDF ranking from memoryUpgrades.
  // Scoped to the current session so cross-session memory poisoning is blocked.
  recallForPrompt(prompt: string, limit = 5, sessionId?: string): string {
    const all = storage.getMemories(200);
    // Session-scoped recall: when a sessionId is provided, ONLY use memories from
    // that session. Never fall back to the global pool — cross-session memories are
    // untrusted and could carry poisoned content from other users/conversations.
    const recent = sessionId ? all.filter(m => m.sessionId === sessionId) : all;
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

  // Store only explicit owner-authored memory. No hidden model call and no
  // assistant-generated claims are promoted into durable user facts.
  async extractAndStore(userMessage: string, _assistantResponse: string, sessionId: string, _overrideModelId?: string): Promise<number> {
    if (!sessionId || userMessage.length>2200) return 0;
    const word=(value:string,expected:string):string|null=>{
      if (value.slice(0,expected.length).toLowerCase()!==expected || (value.length>expected.length && !/[\s:,-]/.test(value[expected.length]))) return null;
      return value.slice(expected.length).trimStart();
    };
    let remaining=userMessage.trim(); remaining=word(remaining,'please')??remaining;
    let directive=word(remaining,'remember');
    if (directive!==null) directive=word(directive,'that')??directive;
    else {
      const saved=word(remaining,'save');const thisWord=saved===null?null:word(saved,'this');
      const inMemory=thisWord===null?null:(word(thisWord,'to')??word(thisWord,'in'));
      directive=inMemory===null?null:word(inMemory,'memory');
    }
    if (directive===null) return 0;
    if ([':',',','-'].includes(directive[0]))directive=directive.slice(1).trimStart();
    const content=directive.trim();
    if (!isSafeMemoryContent(content)) return 0;
    const existing = storage.getMemories(200).filter(m => m.sessionId === sessionId);
    if (existing.some(m => m.content === content)) return 0;
    storage.createMemory({ id: uuidv4(), content, summary: content.slice(0, 200),
      category: /\b(prefer|preference|favorite)\b/i.test(content) ? "preference" : "fact",
      importance: 0.8, sessionId, embeddings: null, sourceMessageId: null });
    return 1;
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
