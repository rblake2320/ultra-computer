import { storage } from "../storage.js";
import { knowledgeEngine, type KBStats, type SpeedTier } from "../knowledgeEngine.js";
import type { KnowledgeEntry, InsertKnowledgeEntry } from "@shared/schema";

export class KnowledgeService {
  list(): KnowledgeEntry[] {
    return storage.getKnowledgeEntries();
  }

  get(id: string): KnowledgeEntry {
    const entry = storage.getKnowledgeEntry(id);
    if (!entry) throw new Error(`Knowledge entry ${id} not found`);
    return entry;
  }

  async create(input: {
    name: string;
    content: string;
    description?: string;
    contentType?: string;
    category?: string;
    tags?: string;
    enabled?: boolean;
    priority?: number;
    tierPolicy?: string;
  }): Promise<KnowledgeEntry> {
    const { name, content, description, contentType, category, tags, enabled, priority, tierPolicy } = input;
    const summary = await knowledgeEngine.generateSummary(content);
    const entry = storage.createKnowledgeEntry({
      id: crypto.randomUUID(),
      name,
      content,
      description: description ?? null,
      summary,
      contentType: (contentType ?? "text") as InsertKnowledgeEntry["contentType"],
      category: category ?? null,
      tags: tags ?? null,
      sizeBytes: Buffer.byteLength(content, "utf-8"),
      tokenEstimate: Math.ceil(content.length / 4),
      enabled: enabled ?? true,
      priority: priority ?? 50,
      tierPolicy: (tierPolicy ?? "auto") as InsertKnowledgeEntry["tierPolicy"],
    });
    return entry;
  }

  update(id: string, input: Partial<InsertKnowledgeEntry>): KnowledgeEntry {
    const updated = storage.updateKnowledgeEntry(id, input);
    if (!updated) throw new Error(`Knowledge entry ${id} not found`);
    return updated;
  }

  delete(id: string): void {
    const existing = storage.getKnowledgeEntry(id);
    if (!existing) throw new Error(`Knowledge entry ${id} not found`);
    storage.deleteKnowledgeEntry(id);
  }

  search(query: string): KnowledgeEntry[] {
    return storage.searchKnowledge(query);
  }

  getStats(): KBStats {
    return knowledgeEngine.getStats();
  }

  preview(tier: SpeedTier, contextWindow: number, query?: string) {
    return knowledgeEngine.buildContext(tier, contextWindow, query);
  }

  reseed(): { ok: boolean; entries: number } {
    const existing = storage.getKnowledgeEntries();
    for (const entry of existing) {
      storage.deleteKnowledgeEntry(entry.id);
    }
    knowledgeEngine.seedIfEmpty();
    return { ok: true, entries: storage.getKnowledgeEntries().length };
  }
}

export const knowledgeService = new KnowledgeService();
