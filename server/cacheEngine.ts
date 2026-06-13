/**
 * CacheEngine — Multi-Tier Caching for Ultra Computer
 *
 * Tier 1: ExactCache       — SHA-256-keyed in-memory LRU with TTL
 * Tier 2: PrefixOptimizer  — Reorders messages to maximise provider-side prefix caching
 * Tier 3: SemanticCache    — Cosine-similarity embedding cache with TF-IDF fallback
 *
 * All LRU maps are O(1) via doubly-linked list + Map.
 */

import { createHash } from "crypto";
import { advancedMemorySearch } from "./memoryUpgrades.js";
import { persistEntry, warmEntries } from "./redisCacheSync.js";
import type { Memory } from "@shared/schema";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface CacheConfig {
  exactCache: { maxEntries: number; defaultTTLMs: number; enabled: boolean };
  prefixOptimizer: { maxPrefixes: number; enabled: boolean };
  semanticCache: { maxEntries: number; similarityThreshold: number; enabled: boolean };
  maxMemoryMB: number;
  globalTTLMs: number;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Optional metadata used by PrefixOptimizer */
  isStatic?: boolean;
  name?: string;
}

export interface CacheRequest {
  model: string;
  messages: Message[];
  parameters?: Record<string, unknown>;
  route?: string;
  streaming?: boolean;
}

export interface CacheResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  embedding?: number[];
  modelId: string;
}

export interface CacheResult {
  response: CacheResponse;
  tier: "exact" | "semantic";
  similarity?: number;
  ageMs: number;
}

export interface TierStats {
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
  evictions: number;
  estimatedBytesSaved: number;
}

export interface CacheStats {
  exact: TierStats;
  prefix: { reorderings: number; estimatedHitsGenerated: number; entries: number };
  semantic: TierStats;
  totalHits: number;
  totalMisses: number;
  overallHitRate: number;
  estimatedCostSavings: number;
  perModel: Record<string, { hits: number; misses: number }>;
  rollingWindow: {
    lastHour: { hits: number; misses: number };
    last24h: { hits: number; misses: number };
    last7d: { hits: number; misses: number };
  };
}

export interface MemoryUsageReport {
  exact: { entries: number; estimatedBytes: number };
  prefix: { entries: number; estimatedBytes: number };
  semantic: { entries: number; estimatedBytes: number };
  totalEstimatedBytes: number;
  limitBytes: number;
  utilizationPct: number;
}

export interface CachePolicy {
  ttlMs?: number;
  enabled?: boolean;
  bypassOnStreaming?: boolean;
  neverCache?: boolean;
  bypassKeywords?: string[];
}

// ─── Rolling Window Ring Buffer ───────────────────────────────────────────────

interface WindowEvent {
  ts: number; // epoch ms
  hit: boolean;
}

class RollingWindowBuffer {
  private buf: WindowEvent[];
  private head = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array<WindowEvent>(capacity);
  }

  push(hit: boolean): void {
    const ev: WindowEvent = { ts: Date.now(), hit };
    this.buf[this.head] = ev;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  private snapshot(): WindowEvent[] {
    const out: WindowEvent[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      const ev = this.buf[idx];
      if (ev !== undefined) out.push(ev);
    }
    return out;
  }

  private countWindow(windowMs: number): { hits: number; misses: number } {
    const cutoff = Date.now() - windowMs;
    let hits = 0;
    let misses = 0;
    for (const ev of this.snapshot()) {
      if (ev.ts >= cutoff) {
        if (ev.hit) hits++; else misses++;
      }
    }
    return { hits, misses };
  }

  getWindows(): CacheStats["rollingWindow"] {
    return {
      lastHour: this.countWindow(60 * 60 * 1_000),
      last24h: this.countWindow(24 * 60 * 60 * 1_000),
      last7d: this.countWindow(7 * 24 * 60 * 60 * 1_000),
    };
  }
}

// ─── O(1) LRU Map ─────────────────────────────────────────────────────────────

interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

class LRUMap<K, V> {
  private readonly map = new Map<K, LRUNode<K, V>>();
  private head: LRUNode<K, V> | null = null; // most-recent
  private tail: LRUNode<K, V> | null = null; // least-recent
  evictions = 0;

  constructor(private readonly maxSize: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.promote(node);
    return node.value;
  }

  set(key: K, value: V): K | undefined {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.promote(existing);
      return undefined;
    }
    const node: LRUNode<K, V> = { key, value, prev: null, next: this.head };
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
    this.map.set(key, node);

    if (this.map.size > this.maxSize) {
      return this.evictTail();
    }
    return undefined;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.unlink(node);
    this.map.delete(key);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  entries(): IterableIterator<[K, V]> {
    const pairs: [K, V][] = Array.from(this.map.entries()).map(([k, node]) => [k, node.value]);
    return pairs.values();
  }

  private promote(node: LRUNode<K, V>): void {
    if (node === this.head) return;
    this.unlink(node);
    node.next = this.head;
    node.prev = null;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private unlink(node: LRUNode<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private evictTail(): K | undefined {
    if (!this.tail) return undefined;
    const evicted = this.tail;
    this.unlink(evicted);
    this.map.delete(evicted.key);
    this.evictions++;
    return evicted.key;
  }
}

// ─── Tier 1: ExactCache ───────────────────────────────────────────────────────

interface ExactEntry {
  response: CacheResponse;
  expiresAt: number;
  createdAt: number;
  bytes: number;
}

class ExactCache {
  private readonly lru: LRUMap<string, ExactEntry>;
  hits = 0;
  misses = 0;
  private readonly defaultTTLMs: number;
  private totalBytes = 0;
  /** Tracks byte size per cache key so evicted entries can be accurately subtracted. */
  private readonly bytesPerKey = new Map<string, number>();

  constructor(maxEntries: number, defaultTTLMs: number) {
    this.lru = new LRUMap<string, ExactEntry>(maxEntries);
    this.defaultTTLMs = defaultTTLMs;
  }

  static buildKey(model: string, messages: Message[], parameters?: Record<string, unknown>): string {
    const payload = JSON.stringify({ model, messages, parameters });
    return createHash("sha256").update(payload).digest("hex");
  }

  get(key: string): ExactEntry | null {
    const entry = this.lru.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.lru.delete(key);
      this.totalBytes -= entry.bytes;
      this.misses++;
      debug(`ExactCache: expired key ${key.slice(0, 8)}…`);
      return null;
    }
    this.hits++;
    debug(`ExactCache: HIT key ${key.slice(0, 8)}…`);
    return entry;
  }

  set(key: string, response: CacheResponse, ttlMs?: number): void {
    const bytes = estimateBytes(response);
    const entry: ExactEntry = {
      response,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTLMs),
      createdAt: Date.now(),
      bytes,
    };
    const evictedKey = this.lru.set(key, entry);
    if (evictedKey) {
      // Subtract the actual byte count of the evicted entry (not the new entry's bytes)
      const evictedBytes = this.bytesPerKey.get(evictedKey) ?? 0;
      this.totalBytes = Math.max(0, this.totalBytes - evictedBytes);
      this.bytesPerKey.delete(evictedKey);
    }
    this.totalBytes += bytes;
    this.bytesPerKey.set(key, bytes);
    debug(`ExactCache: SET key ${key.slice(0, 8)}… (${bytes} B, ttl ${ttlMs ?? this.defaultTTLMs}ms)`);
  }

  has(key: string): boolean {
    return this.lru.has(key);
  }

  delete(key: string): boolean {
    const entry = this.lru.get(key);
    if (entry) {
      this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
      this.bytesPerKey.delete(key);
    }
    return this.lru.delete(key);
  }

  clear(): void {
    this.lru.clear();
    this.totalBytes = 0;
    this.bytesPerKey.clear();
  }

  sweepExpired(): number {
    const now = Date.now();
    let swept = 0;
    const snapshot = Array.from(this.lru.entries());
    for (const [key, entry] of snapshot) {
      if (now > entry.expiresAt) {
        this.lru.delete(key);
        this.totalBytes -= entry.bytes;
        swept++;
      }
    }
    if (swept > 0) debug(`ExactCache: swept ${swept} expired entries`);
    return swept;
  }

  get estimatedBytes(): number { return this.totalBytes; }
  get entries(): number { return this.lru.size; }
  get evictions(): number { return this.lru.evictions; }
}

// ─── Tier 2: PrefixOptimizer ──────────────────────────────────────────────────

interface PrefixRecord {
  fingerprint: string;
  seenAt: number;
  hitCount: number;
}

class PrefixOptimizer {
  private readonly lru: LRUMap<string, PrefixRecord>;
  reorderings = 0;
  estimatedHitsGenerated = 0;

  constructor(maxPrefixes: number) {
    this.lru = new LRUMap<string, PrefixRecord>(maxPrefixes);
  }

  /**
   * Reorder messages so static content (system, tool schemas) comes first and
   * dynamic content (user turns, history) comes last — maximising the chance
   * that the provider's KV cache can reuse the static prefix.
   */
  optimize(messages: Message[]): Message[] {
    const staticMsgs = messages.filter(
      (m) => m.isStatic || m.role === "system" || m.role === "tool"
    );
    const dynamicMsgs = messages.filter(
      (m) => !m.isStatic && m.role !== "system" && m.role !== "tool"
    );
    const reordered = [...staticMsgs, ...dynamicMsgs];

    // Build a fingerprint from the static prefix only
    const prefixFp = createHash("sha256")
      .update(JSON.stringify(staticMsgs))
      .digest("hex");

    const existing = this.lru.get(prefixFp);
    if (existing) {
      existing.hitCount++;
      existing.seenAt = Date.now();
      this.estimatedHitsGenerated++;
      debug(`PrefixOptimizer: known prefix ${prefixFp.slice(0, 8)}… (hits: ${existing.hitCount})`);
    } else {
      this.lru.set(prefixFp, { fingerprint: prefixFp, seenAt: Date.now(), hitCount: 1 });
    }

    this.reorderings++;
    return reordered;
  }

  get entries(): number { return this.lru.size; }
  get estimatedBytes(): number { return this.lru.size * 96; } // fingerprint record ~96 B
  clear(): void { this.lru.clear(); }
}

// ─── Tier 3: SemanticCache ────────────────────────────────────────────────────

interface SemanticEntry {
  embedding: number[] | null;
  tfidfText: string;
  response: CacheResponse;
  createdAt: number;
  expiresAt: number;
  bytes: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * TF-IDF / Jaccard fallback when no embedding model is available.
 * Wraps `advancedMemorySearch` from memoryUpgrades by creating synthetic
 * Memory objects from SemanticEntry text.
 */
function tfidfSimilarity(queryText: string, candidateText: string): number {
  const syntheticMemory: Memory = {
    id: `sem-cache-${Date.now()}`,
    content: candidateText,
    summary: null,
    category: "cache",
    importance: 1,
    embeddings: null,
    sessionId: null,
    sourceMessageId: null,
    createdAt: Date.now(),
    lastAccessedAt: null,
  };
  const results = advancedMemorySearch(queryText, [syntheticMemory], 1);
  return results.length > 0 ? results[0].relevanceScore : 0;
}

/**
 * IMPLEMENTATION NOTE — SemanticCache embedding pass-through:
 * The queryEmbedding parameter passed to SemanticCache.find() is currently
 * always null (see CacheEngine.get()). When null, the semantic match falls
 * back to TF-IDF / Jaccard similarity via advancedMemorySearch. True vector
 * embedding similarity (cosine) would require an external embedding model call
 * before querying the cache. This is aspirational; TF-IDF is the production path.
 */
class SemanticCache {
  private readonly lru: LRUMap<string, SemanticEntry>;
  hits = 0;
  misses = 0;
  private readonly threshold: number;
  private totalBytes = 0;
  /** Tracks byte size per semantic cache key for accurate eviction accounting. */
  private readonly bytesPerKey = new Map<string, number>();

  constructor(maxEntries: number, similarityThreshold: number) {
    this.lru = new LRUMap<string, SemanticEntry>(maxEntries);
    this.threshold = similarityThreshold;
  }

  /**
   * Find the best-matching cached response for the given query.
   * If embedding vectors are available on both sides, use cosine similarity.
   * Otherwise fall back to TF-IDF + Jaccard via advancedMemorySearch.
   * NOTE: In the current implementation, queryEmbedding is always null,
   * so the TF-IDF fallback is always used (see implementation note above).
   */
  find(
    queryText: string,
    queryEmbedding: number[] | null,
    globalTTLMs: number
  ): { entry: SemanticEntry; similarity: number } | null {
    const now = Date.now();
    let bestSim = -1;
    let bestKey: string | null = null;
    let bestEntry: SemanticEntry | null = null;

    const snapshot = Array.from(this.lru.entries());
    for (const [key, entry] of snapshot) {
      if (now > entry.expiresAt) {
        this.lru.delete(key);
        this.totalBytes -= entry.bytes;
        continue;
      }
      let sim: number;
      if (queryEmbedding && entry.embedding) {
        sim = cosineSimilarity(queryEmbedding, entry.embedding);
      } else {
        sim = tfidfSimilarity(queryText, entry.tfidfText);
      }
      if (sim > bestSim) {
        bestSim = sim;
        bestKey = key;
        bestEntry = entry;
      }
    }

    if (bestKey && bestEntry && bestSim >= this.threshold) {
      this.lru.get(bestKey); // promote in LRU
      this.hits++;
      debug(`SemanticCache: HIT similarity ${bestSim.toFixed(4)}`);
      return { entry: bestEntry, similarity: bestSim };
    }
    this.misses++;
    debug(`SemanticCache: MISS best similarity ${bestSim.toFixed(4)}`);
    return null;
  }

  store(
    key: string,
    queryText: string,
    embedding: number[] | null,
    response: CacheResponse,
    ttlMs: number
  ): void {
    const bytes = estimateBytes(response) + (embedding ? embedding.length * 8 : 0);
    const entry: SemanticEntry = {
      embedding,
      tfidfText: queryText,
      response,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      bytes,
    };
    const evictedKey = this.lru.set(key, entry);
    if (evictedKey) {
      // Subtract the actual byte count of the evicted entry
      const evictedBytes = this.bytesPerKey.get(evictedKey) ?? 0;
      this.totalBytes = Math.max(0, this.totalBytes - evictedBytes);
      this.bytesPerKey.delete(evictedKey);
    }
    this.totalBytes += bytes;
    this.bytesPerKey.set(key, bytes);
  }

  sweepExpired(): number {
    const now = Date.now();
    let swept = 0;
    const snapshot = Array.from(this.lru.entries());
    for (const [key, entry] of snapshot) {
      if (now > entry.expiresAt) {
        this.lru.delete(key);
        this.totalBytes -= entry.bytes;
        swept++;
      }
    }
    if (swept > 0) debug(`SemanticCache: swept ${swept} expired entries`);
    return swept;
  }

  clear(): void {
    this.lru.clear();
    this.totalBytes = 0;
  }

  get entries(): number { return this.lru.size; }
  get evictions(): number { return this.lru.evictions; }
  get estimatedBytes(): number { return this.totalBytes; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 512;
  }
}

function debug(msg: string): void {
  if (process.env.DEBUG_CACHE) {
    // eslint-disable-next-line no-console
    console.debug(`[CacheEngine] ${msg}`);
  }
}

// Cost per output token in USD (GPT-4o tier estimate)
const COST_PER_TOKEN_USD = 0.000_015;

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CacheConfig = {
  exactCache: { maxEntries: 1_000, defaultTTLMs: 30 * 60 * 1_000, enabled: true },
  prefixOptimizer: { maxPrefixes: 500, enabled: true },
  semanticCache: { maxEntries: 500, similarityThreshold: 0.92, enabled: true },
  maxMemoryMB: 256,
  globalTTLMs: 24 * 60 * 60 * 1_000,
};

// ─── CacheEngine ─────────────────────────────────────────────────────────────

export class CacheEngine {
  private readonly config: CacheConfig;
  private readonly exact: ExactCache;
  private readonly prefix: PrefixOptimizer;
  private readonly semantic: SemanticCache;
  private readonly policies = new Map<string, CachePolicy>();
  private readonly perModel = new Map<string, { hits: number; misses: number }>();
  private readonly rollingBuf: RollingWindowBuffer;
  private sweepTimer: ReturnType<typeof setInterval>;
  private totalCostSavings = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      exactCache: { ...DEFAULT_CONFIG.exactCache, ...config.exactCache },
      prefixOptimizer: { ...DEFAULT_CONFIG.prefixOptimizer, ...config.prefixOptimizer },
      semanticCache: { ...DEFAULT_CONFIG.semanticCache, ...config.semanticCache },
      maxMemoryMB: config.maxMemoryMB ?? DEFAULT_CONFIG.maxMemoryMB,
      globalTTLMs: config.globalTTLMs ?? DEFAULT_CONFIG.globalTTLMs,
    };

    this.exact = new ExactCache(
      this.config.exactCache.maxEntries,
      this.config.exactCache.defaultTTLMs
    );
    this.prefix = new PrefixOptimizer(this.config.prefixOptimizer.maxPrefixes);
    this.semantic = new SemanticCache(
      this.config.semanticCache.maxEntries,
      this.config.semanticCache.similarityThreshold
    );
    this.rollingBuf = new RollingWindowBuffer(10_000);

    // Periodic sweep — unref'd so it does not keep the process alive
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    this.sweepTimer.unref();
  }

  // ── Main Cache Operations ─────────────────────────────────────────────────

  get(request: CacheRequest): CacheResult | null {
    if (!this.isAllowed(request)) return null;

    // Tier 1: Exact match
    if (this.config.exactCache.enabled) {
      const key = ExactCache.buildKey(request.model, request.messages, request.parameters);
      const entry = this.exact.get(key);
      if (entry) {
        this.recordHit(request.model);
        this.totalCostSavings += (entry.response.tokensOut) * COST_PER_TOKEN_USD;
        return {
          response: entry.response,
          tier: "exact",
          ageMs: Date.now() - entry.createdAt,
        };
      }
    }

    // Tier 3: Semantic match
    if (this.config.semanticCache.enabled) {
      const queryText = request.messages.map((m) => m.content).join(" ");
      const queryEmbedding: number[] | null = null; // populated by caller if available
      const match = this.semantic.find(queryText, queryEmbedding, this.config.globalTTLMs);
      if (match) {
        this.recordHit(request.model);
        this.totalCostSavings += match.entry.response.tokensOut * COST_PER_TOKEN_USD;
        return {
          response: match.entry.response,
          tier: "semantic",
          similarity: match.similarity,
          ageMs: Date.now() - match.entry.createdAt,
        };
      }
    }

    this.recordMiss(request.model);
    return null;
  }

  set(request: CacheRequest, response: CacheResponse): void {
    if (!this.isAllowed(request)) return;

    const policy = this.resolvePolicy(request.route);
    const ttlMs = Math.min(
      policy?.ttlMs ?? this.config.exactCache.defaultTTLMs,
      this.config.globalTTLMs
    );

    this.enforceMemoryBudget();

    // Tier 1: Exact
    if (this.config.exactCache.enabled) {
      const key = ExactCache.buildKey(request.model, request.messages, request.parameters);
      this.exact.set(key, response, ttlMs);
      // Persist to Redis so this entry survives app restarts
      persistEntry(key, {
        response: { content: response.content, tokensIn: response.tokensIn, tokensOut: response.tokensOut, modelId: response.modelId },
        createdAt: Date.now(),
      }, ttlMs);
    }

    // Tier 3: Semantic
    if (this.config.semanticCache.enabled) {
      const queryText = request.messages.map((m) => m.content).join(" ");
      const semKey = createHash("sha256").update(queryText + response.modelId).digest("hex");
      const embedding = response.embedding ?? null;
      this.semantic.store(semKey, queryText, embedding, response, ttlMs);
    }
  }

  // ── Prompt Optimisation ───────────────────────────────────────────────────

  optimizePrompt(messages: Message[], _provider: string): Message[] {
    if (!this.config.prefixOptimizer.enabled) return messages;
    return this.prefix.optimize(messages);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): CacheStats {
    const exactHits = this.exact.hits;
    const exactMisses = this.exact.misses;
    const semHits = this.semantic.hits;
    const semMisses = this.semantic.misses;

    const totalHits = exactHits + semHits;
    const totalMisses = exactMisses + semMisses;
    const total = totalHits + totalMisses;

    const perModel: Record<string, { hits: number; misses: number }> = {};
    for (const [model, stats] of Array.from(this.perModel.entries())) {
      perModel[model] = { ...stats };
    }

    return {
      exact: {
        hits: exactHits,
        misses: exactMisses,
        hitRate: total > 0 ? exactHits / (exactHits + exactMisses || 1) : 0,
        entries: this.exact.entries,
        evictions: this.exact.evictions,
        estimatedBytesSaved: exactHits * 512,
      },
      prefix: {
        reorderings: this.prefix.reorderings,
        estimatedHitsGenerated: this.prefix.estimatedHitsGenerated,
        entries: this.prefix.entries,
      },
      semantic: {
        hits: semHits,
        misses: semMisses,
        hitRate: (semHits + semMisses) > 0 ? semHits / (semHits + semMisses) : 0,
        entries: this.semantic.entries,
        evictions: this.semantic.evictions,
        estimatedBytesSaved: semHits * 2_048,
      },
      totalHits,
      totalMisses,
      overallHitRate: total > 0 ? totalHits / total : 0,
      estimatedCostSavings: this.totalCostSavings,
      perModel,
      rollingWindow: this.rollingBuf.getWindows(),
    };
  }

  resetStats(): void {
    // Reset hit/miss counters directly on the cache instances
    this.exact.hits = 0;
    this.exact.misses = 0;
    this.semantic.hits = 0;
    this.semantic.misses = 0;
    this.perModel.clear();
    this.totalCostSavings = 0;
  }

  // ── Management ────────────────────────────────────────────────────────────

  clear(tier?: "exact" | "prefix" | "semantic"): void {
    if (!tier || tier === "exact") this.exact.clear();
    if (!tier || tier === "prefix") this.prefix.clear();
    if (!tier || tier === "semantic") this.semantic.clear();
  }

  clearForModel(modelId: string): void {
    // Exact cache: rebuild key space is impractical without index; clear all
    // since model-specific entries are typically a small fraction.
    // For production, an inverted model→keys index would be maintained.
    this.exact.clear();
    this.perModel.delete(modelId);
    debug(`CacheEngine: cleared entries for model ${modelId}`);
  }

  getMemoryUsage(): MemoryUsageReport {
    const exactBytes = this.exact.estimatedBytes;
    const prefixBytes = this.prefix.estimatedBytes;
    const semBytes = this.semantic.estimatedBytes;
    const total = exactBytes + prefixBytes + semBytes;
    const limitBytes = this.config.maxMemoryMB * 1_024 * 1_024;

    return {
      exact: { entries: this.exact.entries, estimatedBytes: exactBytes },
      prefix: { entries: this.prefix.entries, estimatedBytes: prefixBytes },
      semantic: { entries: this.semantic.entries, estimatedBytes: semBytes },
      totalEstimatedBytes: total,
      limitBytes,
      utilizationPct: limitBytes > 0 ? (total / limitBytes) * 100 : 0,
    };
  }

  setPolicy(route: string, policy: CachePolicy): void {
    this.policies.set(route, policy);
    debug(`CacheEngine: policy set for route "${route}"`);
  }

  // ── Redis Warm ────────────────────────────────────────────────────────────

  /**
   * Restore persisted exact-cache entries from Redis into the in-memory LRU.
   * Call once at startup (non-blocking — caller awaits or fire-and-forgets).
   * Returns the number of entries restored.
   */
  async warmFromRedis(): Promise<number> {
    if (!this.config.exactCache.enabled) return 0;
    return warmEntries((key, entry, ttlRemainingMs) => {
      this.exact.set(key, {
        content: entry.response.content,
        tokensIn: entry.response.tokensIn,
        tokensOut: entry.response.tokensOut,
        modelId: entry.response.modelId,
      }, ttlRemainingMs);
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  shutdown(): void {
    clearInterval(this.sweepTimer);
    this.clear();
    debug("CacheEngine: shut down");
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private isAllowed(request: CacheRequest): boolean {
    if (request.streaming) return false;
    const policy = this.resolvePolicy(request.route);
    if (policy?.neverCache) return false;
    if (policy?.bypassOnStreaming && request.streaming) return false;
    if (policy?.enabled === false) return false;
    if (policy?.bypassKeywords) {
      const text = request.messages.map((m) => m.content).join(" ").toLowerCase();
      if (policy.bypassKeywords.some((kw) => text.includes(kw.toLowerCase()))) {
        return false;
      }
    }
    // Global bypass: never cache if user says "refresh" or "no cache"
    const userContent = request.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
      .toLowerCase();
    if (/\b(refresh|no[ -]cache|bypass cache|force reload)\b/.test(userContent)) {
      return false;
    }
    return true;
  }

  private resolvePolicy(route?: string): CachePolicy | undefined {
    if (!route) return undefined;
    // Exact match first, then prefix match
    if (this.policies.has(route)) return this.policies.get(route);
    for (const [pattern, policy] of Array.from(this.policies.entries())) {
      if (route.startsWith(pattern)) return policy;
    }
    return undefined;
  }

  private recordHit(modelId: string): void {
    this.rollingBuf.push(true);
    const s = this.perModel.get(modelId) ?? { hits: 0, misses: 0 };
    s.hits++;
    this.perModel.set(modelId, s);
  }

  private recordMiss(modelId: string): void {
    this.rollingBuf.push(false);
    const s = this.perModel.get(modelId) ?? { hits: 0, misses: 0 };
    s.misses++;
    this.perModel.set(modelId, s);
  }

  private sweep(): void {
    debug("CacheEngine: running periodic sweep");
    this.exact.sweepExpired();
    this.semantic.sweepExpired();
    this.enforceMemoryBudget();
  }

  private enforceMemoryBudget(): void {
    const usage = this.getMemoryUsage();
    if (usage.utilizationPct < 90) return;
    debug(`CacheEngine: memory at ${usage.utilizationPct.toFixed(1)}%, evicting…`);
    // Evict from semantic first (cheapest to regenerate), then exact
    this.semantic.clear();
    const usage2 = this.getMemoryUsage();
    if (usage2.utilizationPct >= 90) {
      this.exact.clear();
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const cacheEngine = new CacheEngine();
