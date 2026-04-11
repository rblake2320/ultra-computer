/**
 * Memory Manager Upgrades
 *
 * Enhances the existing keyword-based memory system with:
 *   - TF-IDF-like scoring with Jaccard similarity (advancedMemorySearch)
 *   - Named entity / structured data extraction (extractEntities)
 *   - Importance scoring with novelty detection (calculateImportance)
 *   - Content-overlap deduplication (deduplicateMemories)
 *
 * All functions are pure (no DB side-effects) so they can be layered on top
 * of the existing MemoryManager without modifying storage.ts or memoryManager.ts.
 */

import type { Memory } from "@shared/schema";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface MemorySearchResult {
  memory: Memory;
  relevanceScore: number;
  matchType: "exact" | "keyword" | "semantic";
}

// ─── Text Utilities ───────────────────────────────────────────────────────────

/**
 * Tokenise text into a normalised word set, filtering out common stop-words
 * and very short tokens.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "not",
  "no", "nor", "so", "yet", "both", "either", "neither", "that", "this",
  "it", "its", "i", "you", "he", "she", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "our", "their", "what", "which",
  "who", "whom", "when", "where", "why", "how", "all", "each", "every",
  "any", "few", "more", "most", "other", "some", "such", "than", "then",
  "too", "very", "just", "also", "as", "if", "there",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function wordSet(text: string): Set<string> {
  return new Set(tokenise(text));
}

/**
 * Jaccard similarity between two word sets.
 * Returns 0–1; 1.0 = identical word sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  Array.from(a).forEach((word) => {
    if (b.has(word)) intersection++;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Build a term-frequency map from tokenised text.
 * Values are normalised by document length.
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  tokens.forEach((t) => {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  });
  Array.from(tf.entries()).forEach(([term, count]) => {
    tf.set(term, count / tokens.length);
  });
  return tf;
}

// ─── advancedMemorySearch ─────────────────────────────────────────────────────

/**
 * Score memories against a query using:
 *   1. Exact phrase match → score 1.0, matchType "exact"
 *   2. TF-IDF-weighted Jaccard keyword overlap → matchType "keyword"
 *
 * ("semantic" matchType is reserved for future embedding-based scoring;
 *  this implementation produces "exact" or "keyword" results only.)
 *
 * @param query     User query string
 * @param memories  Pool of Memory objects to search
 * @param limit     Maximum results to return (default 10)
 */
export function advancedMemorySearch(
  query: string,
  memories: Memory[],
  limit = 10
): MemorySearchResult[] {
  if (memories.length === 0) return [];

  const queryLower = query.toLowerCase();
  const queryTokens = tokenise(query);
  const querySet = new Set(queryTokens);
  const queryTF = termFrequency(queryTokens);

  // Collect all documents to compute inverse document frequency
  const allDocTokens: string[][] = memories.map((m) =>
    tokenise((m.summary ?? "") + " " + m.content)
  );

  // IDF: log(N / df) — how rare is the term across the corpus?
  const N = memories.length;
  const dfMap = new Map<string, number>();
  allDocTokens.forEach((tokens) => {
    const unique = new Set(tokens);
    Array.from(unique).forEach((t) => {
      dfMap.set(t, (dfMap.get(t) ?? 0) + 1);
    });
  });
  function idf(term: string): number {
    const df = dfMap.get(term) ?? 0;
    return df === 0 ? 0 : Math.log((N + 1) / (df + 1)) + 1; // smoothed
  }

  const results: MemorySearchResult[] = [];

  for (let i = 0; i < memories.length; i++) {
    const mem = memories[i];
    const fullText = (mem.summary ?? "") + " " + mem.content;
    const fullTextLower = fullText.toLowerCase();

    // ── Exact phrase match ────────────────────────────────────────────────
    if (queryLower.length > 0 && fullTextLower.includes(queryLower)) {
      results.push({ memory: mem, relevanceScore: 1.0, matchType: "exact" });
      continue;
    }

    // ── TF-IDF weighted keyword overlap ──────────────────────────────────
    const docTokens = allDocTokens[i];
    if (docTokens.length === 0) continue;

    const docTF = termFrequency(docTokens);
    const docSet = new Set(docTokens);

    // TF-IDF similarity: dot product of query and doc TF-IDF vectors
    let tfidfScore = 0;
    Array.from(queryTF.entries()).forEach(([term, qTF]) => {
      const dTF = docTF.get(term) ?? 0;
      if (dTF > 0) {
        tfidfScore += qTF * dTF * idf(term);
      }
    });

    // Jaccard similarity as a secondary signal
    const jaccard = jaccardSimilarity(querySet, docSet);

    // Blend: 70% TF-IDF, 30% Jaccard — both normalised to [0,1]
    // TF-IDF values are unbounded, so cap at 1 before blending
    const normTfidf = Math.min(tfidfScore, 1.0);
    const blended = 0.7 * normTfidf + 0.3 * jaccard;

    if (blended > 0) {
      results.push({ memory: mem, relevanceScore: blended, matchType: "keyword" });
    }
  }

  return results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

// ─── extractEntities ──────────────────────────────────────────────────────────

// Regex patterns for structured entity extraction
const ENTITY_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // Email addresses
  { name: "email", regex: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g },
  // URLs (http/https/ftp)
  { name: "url", regex: /https?:\/\/[^\s<>"{}|\\^`[\]]+/g },
  // ISO dates: 2024-01-15
  { name: "date-iso", regex: /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g },
  // Human dates: January 15, 2024 / Jan 15 2024
  {
    name: "date-human",
    regex:
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s+\d{4})?\b/g,
  },
  // Monetary values: $1,234.56 / €99 / £10k
  { name: "money", regex: /[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?\b/g },
  // Version numbers: v1.2.3 or 1.2.3
  { name: "version", regex: /\bv?\d+\.\d+(?:\.\d+)*\b/g },
  // Numbers (standalone, >3 digits to filter noise)
  { name: "number", regex: /\b\d{4,}\b/g },
  // Proper nouns: sequences of Title-Cased words (2-4 consecutive words)
  {
    name: "proper-noun",
    regex: /\b(?:[A-Z][a-z]+\s){1,3}[A-Z][a-z]+\b/g,
  },
  // Single Title-Cased words that are likely proper nouns
  // (exclude common sentence-start false positives by requiring length > 4)
  { name: "proper-noun-single", regex: /\b[A-Z][a-z]{4,}\b/g },
  // File paths
  { name: "filepath", regex: /(?:\/[\w.\-]+){2,}/g },
  // Common identifier patterns: camelCase, snake_case, kebab-case (min 5 chars)
  { name: "identifier", regex: /\b[a-z][a-z0-9]*(?:[_\-][a-z0-9]+|[A-Z][a-z0-9]*){1,}\b/g },
];

/**
 * Extract structured entities from text: proper nouns, emails, URLs,
 * numbers, dates, file paths, and code identifiers.
 *
 * Returns unique, trimmed entity strings.
 */
export function extractEntities(text: string): string[] {
  const found = new Set<string>();

  for (const { regex } of ENTITY_PATTERNS) {
    // Reset lastIndex so the regex can be reused
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches) {
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length > 1) found.add(trimmed);
      }
    }
  }

  return Array.from(found);
}

// ─── calculateImportance ──────────────────────────────────────────────────────

// Patterns used for importance signal detection
const CODE_PATTERNS = [
  /```[\s\S]*?```/,           // fenced code blocks
  /`[^`\n]+`/,                // inline code
  /function\s+\w+\s*\(/,      // function definitions
  /const\s+\w+\s*=/,          // const declarations
  /class\s+[A-Z]\w+/,         // class definitions
  /def\s+\w+\s*\(/,           // Python functions
  /import\s+[\w{}]+\s+from/,  // ES module imports
];

const URL_PATTERN = /https?:\/\/[^\s]+/;
const NAME_PATTERN = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/; // proper name (First Last)

/**
 * Score a candidate memory's importance on a 0–1 scale.
 *
 * Signals:
 *   +0.2  contains code snippets
 *   +0.1  contains URLs
 *   +0.1  contains proper names (people / organisations)
 *   +0.1  content length > 200 chars
 *   +0.2  novelty: content has < 30% Jaccard overlap with all existing memories
 *   +0.3  base score (floor)
 *
 * Maximum possible score: 1.0 (capped)
 */
export function calculateImportance(content: string, existingMemories: Memory[]): number {
  let score = 0.3; // base

  // Signal: contains code
  const hasCode = CODE_PATTERNS.some((p) => p.test(content));
  if (hasCode) score += 0.2;

  // Signal: contains URLs
  if (URL_PATTERN.test(content)) score += 0.1;

  // Signal: contains proper names
  if (NAME_PATTERN.test(content)) score += 0.1;

  // Signal: substantial length
  if (content.length > 200) score += 0.1;

  // Signal: novelty — less than 30% overlap with any existing memory
  if (existingMemories.length === 0) {
    score += 0.2; // first memory is always novel
  } else {
    const contentWords = wordSet(content);
    const maxOverlap = existingMemories.reduce((max, m) => {
      const sim = jaccardSimilarity(contentWords, wordSet(m.content));
      return Math.max(max, sim);
    }, 0);

    if (maxOverlap < 0.3) score += 0.2;
  }

  return Math.min(1.0, score);
}

// ─── deduplicateMemories ──────────────────────────────────────────────────────

/**
 * Remove duplicate memories where two entries share > 80% Jaccard word-set
 * similarity on their `content` field.
 *
 * When a duplicate pair is found, the memory with the higher `importance`
 * score is kept. If scores are equal, the more recently created one wins.
 *
 * Algorithm: O(n²) pairwise comparison — acceptable for typical memory
 * store sizes (< 1 000 items). For larger sets a locality-sensitive
 * hashing approach would be preferable.
 *
 * @param memories  Array of Memory objects (not mutated)
 * @returns         De-duplicated array
 */
export function deduplicateMemories(memories: Memory[]): Memory[] {
  if (memories.length <= 1) return [...memories];

  // Pre-compute word sets once
  const wordSets: Set<string>[] = memories.map((m) => wordSet(m.content));

  // Track indices to remove
  const toRemove = new Set<number>();

  for (let i = 0; i < memories.length; i++) {
    if (toRemove.has(i)) continue;

    for (let j = i + 1; j < memories.length; j++) {
      if (toRemove.has(j)) continue;

      const similarity = jaccardSimilarity(wordSets[i], wordSets[j]);

      if (similarity > 0.8) {
        // Duplicate pair — keep the better one
        const a = memories[i];
        const b = memories[j];

        let keepIdx: number;
        let dropIdx: number;

        if (a.importance > b.importance) {
          keepIdx = i; dropIdx = j;
        } else if (b.importance > a.importance) {
          keepIdx = j; dropIdx = i;
        } else {
          // Equal importance — prefer the more recent entry
          keepIdx = a.createdAt >= b.createdAt ? i : j;
          dropIdx = keepIdx === i ? j : i;
        }

        toRemove.add(dropIdx);
        // If we're dropping i, stop the inner loop and move on
        if (dropIdx === i) break;
      }
    }
  }

  return memories.filter((_, idx) => !toRemove.has(idx));
}
